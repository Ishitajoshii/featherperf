import path from 'node:path';
import ts from 'typescript';
import type { DeferredImportCandidate, DetectedImport, ImportBinding } from './types.js';

interface ImportRecord extends DetectedImport {
  importStart: number;
  importEnd: number;
}

interface CallRecord {
  localName: string;
  callStart: number;
  callEnd: number;
  callExpressionText: string;
  callArguments: string;
  triggerArgument: string | null;
  callIndent: string;
}

function getScriptKind(id: string): ts.ScriptKind {
  const extension = path.extname(id).toLowerCase();

  switch (extension) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function parseNamedBindings(namedImports: ts.NamedImports): ImportBinding[] {
  return namedImports.elements.map((element) => ({
    importedName: element.propertyName?.text ?? element.name.text,
    localName: element.name.text,
    kind: 'named'
  }));
}

function parseImportDeclaration(statement: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportRecord | null {
  if (!ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause) {
    return null;
  }

  const bindings: ImportBinding[] = [];
  const importClause = statement.importClause;

  if (importClause.name) {
    bindings.push({
      importedName: 'default',
      localName: importClause.name.text,
      kind: 'default'
    });
  }

  if (importClause.namedBindings) {
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.push({
        importedName: '*',
        localName: importClause.namedBindings.name.text,
        kind: 'namespace'
      });
    } else {
      bindings.push(...parseNamedBindings(importClause.namedBindings));
    }
  }

  if (bindings.length === 0) {
    return null;
  }

  return {
    source: statement.moduleSpecifier.text,
    bindings,
    supportedPackage: null,
    importStart: statement.getStart(sourceFile),
    importEnd: statement.getEnd()
  };
}

function isImportBindingIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;

  return (
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent)
  );
}

function getIndent(code: string, position: number): string {
  const lineStart = code.lastIndexOf('\n', position - 1) + 1;
  const linePrefix = code.slice(lineStart, position);
  const indentMatch = linePrefix.match(/^\s*/);
  return indentMatch?.[0] ?? '';
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapExpression(expression.expression);
  }

  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

function getImportedBindingNameFromCallee(callee: ts.LeftHandSideExpression): string | null {
  const normalizedCallee = unwrapExpression(callee);

  if (ts.isIdentifier(normalizedCallee)) {
    return normalizedCallee.text;
  }

  if (ts.isPropertyAccessExpression(normalizedCallee) || ts.isElementAccessExpression(normalizedCallee)) {
    return getImportedBindingNameFromCallee(normalizedCallee.expression);
  }

  return null;
}

function collectCallRecord(
  statement: ts.ExpressionStatement,
  sourceFile: ts.SourceFile,
  code: string
): CallRecord | null {
  if (!ts.isCallExpression(statement.expression)) {
    return null;
  }

  const expression = statement.expression;
  const callee = expression.expression;
  const localName = getImportedBindingNameFromCallee(callee);

  if (!localName) {
    return null;
  }

  return {
    localName,
    callStart: statement.getStart(sourceFile),
    callEnd: statement.getEnd(),
    callExpressionText: expression.getText(sourceFile),
    callArguments: code.slice(expression.arguments.pos, expression.arguments.end),
    triggerArgument: expression.arguments[0]?.getText(sourceFile) ?? null,
    callIndent: getIndent(code, statement.getStart(sourceFile))
  };
}

export function collectDeferredImportCandidates(code: string, id: string): DeferredImportCandidate[] {
  const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, getScriptKind(id));
  const imports: ImportRecord[] = [];
  const directCalls = new Map<string, CallRecord[]>();
  const identifierUsageCounts = new Map<string, number>();

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const importRecord = parseImportDeclaration(node, sourceFile);
      if (importRecord) {
        imports.push(importRecord);
      }
    }

    if (ts.isIdentifier(node) && !isImportBindingIdentifier(node)) {
      identifierUsageCounts.set(node.text, (identifierUsageCounts.get(node.text) ?? 0) + 1);
    }

    if (ts.isExpressionStatement(node)) {
      const callRecord = collectCallRecord(node, sourceFile, code);
      if (callRecord) {
        const existingCalls = directCalls.get(callRecord.localName) ?? [];
        existingCalls.push(callRecord);
        directCalls.set(callRecord.localName, existingCalls);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const candidates: DeferredImportCandidate[] = [];

  for (const importRecord of imports) {
    for (const binding of importRecord.bindings) {
      const usageCount = identifierUsageCounts.get(binding.localName) ?? 0;
      const callRecords = directCalls.get(binding.localName) ?? [];

      if (usageCount !== 1 || callRecords.length !== 1) {
        continue;
      }

      const callRecord = callRecords[0];
      candidates.push({
        source: importRecord.source,
        binding,
        importBindingCount: importRecord.bindings.length,
        importStart: importRecord.importStart,
        importEnd: importRecord.importEnd,
        callStart: callRecord.callStart,
        callEnd: callRecord.callEnd,
        callExpressionText: callRecord.callExpressionText,
        callArguments: callRecord.callArguments,
        triggerArgument: callRecord.triggerArgument,
        callIndent: callRecord.callIndent
      });
    }
  }

  return candidates;
}
