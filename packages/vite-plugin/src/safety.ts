import path from 'node:path';
import ts from 'typescript';
import { CLIENT_MODULE_EXTENSIONS } from './constants.js';
import { detectHeavyComponents } from './detector.js';
import type { SafetyCheckContext, SafetyCheckResult } from './types.js';

const CRITICAL_PATH_PATTERN =
  /(^|[\\/._-])(hero|header|navbar|above(?:-|_)?fold|critical|preloader|loader|splash)($|[\\/._-])/i;

const CRITICAL_SELECTOR_PATTERN =
  /(^|[#.\s>:+~\[(=-])(hero|header|navbar|above(?:-|_)?fold|critical|preloader|loader|splash|app|root)($|[#.\s>:+~\])=-])/i;

const EXACT_CRITICAL_SELECTORS = new Set([
  'body',
  'html',
  'main',
  'header',
  'nav',
  '#app',
  '#root',
  '#__next',
  '#__nuxt',
  '[data-critical]',
  '[data-above-fold]'
]);

const RISKY_GLOBAL_ROOTS = new Set([
  'localStorage',
  'sessionStorage',
  'history',
  'location'
]);

const RISKY_LAYOUT_PROPERTIES = new Set([
  'offsetWidth',
  'offsetHeight',
  'offsetTop',
  'offsetLeft',
  'clientWidth',
  'clientHeight',
  'clientTop',
  'clientLeft',
  'scrollWidth',
  'scrollHeight',
  'scrollTop',
  'scrollLeft'
]);

const RISKY_CONSTRUCTORS = new Set([
  'ResizeObserver',
  'MutationObserver',
  'XMLHttpRequest'
]);

const RISKY_HIGH_FREQUENCY_EVENTS = new Set([
  'scroll',
  'resize',
  'mousemove',
  'pointermove',
  'touchmove'
]);

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

function createSourceFile(code: string, id: string): ts.SourceFile {
  return ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, getScriptKind(id));
}

function isClientModule(id: string): boolean {
  const cleanId = id.split('?')[0].split('#')[0];

  if (cleanId.includes('node_modules') || cleanId.endsWith('.d.ts')) {
    return false;
  }

  return CLIENT_MODULE_EXTENSIONS.some((extension) => cleanId.endsWith(extension));
}

function isRelativeImport(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../');
}

function isSupportedHeavyImport(source: string): boolean {
  const detection = detectHeavyComponents(`import fp from ${JSON.stringify(source)};`);
  return detection.hasSupportedImports;
}

function hasSideEffectImport(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (statement) => ts.isImportDeclaration(statement) && !statement.importClause
  );
}

function hasUnsupportedExternalImport(code: string): boolean {
  const imports = detectHeavyComponents(code).imports;

  return imports.some((entry) => !isRelativeImport(entry.source) && !isSupportedHeavyImport(entry.source));
}

function getStaticSelector(argument: string | null): string | null {
  if (!argument) {
    return null;
  }

  const trimmed = argument.trim();
  if (trimmed.length < 2) {
    return null;
  }

  const quote = trimmed[0];
  const lastCharacter = trimmed[trimmed.length - 1];

  if ((quote === '\'' || quote === '"') && lastCharacter === quote) {
    return trimmed.slice(1, -1);
  }

  if (quote === '`' && lastCharacter === '`' && !trimmed.includes('${')) {
    return trimmed.slice(1, -1);
  }

  return null;
}

function isCriticalSelector(selector: string, extraCriticalSelectors: string[] = []): boolean {
  const normalizedSelector = selector.trim().toLowerCase();
  const hasExactMatch =
    EXACT_CRITICAL_SELECTORS.has(normalizedSelector) ||
    extraCriticalSelectors.some((entry) => entry.trim().toLowerCase() === normalizedSelector);

  return hasExactMatch || CRITICAL_SELECTOR_PATTERN.test(normalizedSelector);
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

function getRootIdentifierName(expression: ts.Expression): string | null {
  const normalizedExpression = unwrapExpression(expression);

  if (ts.isIdentifier(normalizedExpression)) {
    return normalizedExpression.text;
  }

  if (
    ts.isPropertyAccessExpression(normalizedExpression) ||
    ts.isElementAccessExpression(normalizedExpression)
  ) {
    return getRootIdentifierName(normalizedExpression.expression);
  }

  return null;
}

function getPropertyNameText(name: ts.MemberName | ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }

  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function isUndefinedIdentifier(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === 'undefined';
}

function isStaticInitializer(expression: ts.Expression): boolean {
  const normalizedExpression = unwrapExpression(expression);

  if (
    ts.isStringLiteralLike(normalizedExpression) ||
    ts.isNumericLiteral(normalizedExpression) ||
    normalizedExpression.kind === ts.SyntaxKind.TrueKeyword ||
    normalizedExpression.kind === ts.SyntaxKind.FalseKeyword ||
    normalizedExpression.kind === ts.SyntaxKind.NullKeyword ||
    isUndefinedIdentifier(normalizedExpression)
  ) {
    return true;
  }

  if (ts.isNoSubstitutionTemplateLiteral(normalizedExpression)) {
    return true;
  }

  if (ts.isPrefixUnaryExpression(normalizedExpression)) {
    return isStaticInitializer(normalizedExpression.operand);
  }

  if (ts.isArrayLiteralExpression(normalizedExpression)) {
    return normalizedExpression.elements.every(
      (element) => !ts.isSpreadElement(element) && isStaticInitializer(element)
    );
  }

  if (ts.isObjectLiteralExpression(normalizedExpression)) {
    return normalizedExpression.properties.every((property) => {
      if (ts.isSpreadAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
        return false;
      }

      if (ts.isPropertyAssignment(property)) {
        if (property.name && ts.isComputedPropertyName(property.name)) {
          return false;
        }

        return isStaticInitializer(property.initializer);
      }

      return false;
    });
  }

  return false;
}

function hasUnsafeTopLevelStatements(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) => {
    if (ts.isImportDeclaration(statement)) {
      return false;
    }

    if (
      ts.isExportDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEmptyStatement(statement)
    ) {
      return false;
    }

    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(
        (declaration) => declaration.initializer && !isStaticInitializer(declaration.initializer)
      );
    }

    return true;
  });
}

function isHighFrequencyAddEventListenerCall(node: ts.CallExpression): boolean {
  const callee = unwrapExpression(node.expression);
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'addEventListener') {
    return false;
  }

  const [firstArgument] = node.arguments;
  return (
    !!firstArgument &&
    ts.isStringLiteral(firstArgument) &&
    RISKY_HIGH_FREQUENCY_EVENTS.has(firstArgument.text)
  );
}

function hasRiskySynchronousBehavior(sourceFile: ts.SourceFile): boolean {
  let risky = false;

  const visit = (node: ts.Node) => {
    if (risky) {
      return;
    }

    if (ts.isCallExpression(node)) {
      if (isHighFrequencyAddEventListenerCall(node)) {
        risky = true;
        return;
      }

      const callee = unwrapExpression(node.expression);

      if (ts.isIdentifier(callee) && (callee.text === 'fetch' || callee.text === 'getComputedStyle')) {
        risky = true;
        return;
      }

      if (ts.isPropertyAccessExpression(callee)) {
        const propertyName = callee.name.text;

        if (propertyName === 'getBoundingClientRect') {
          risky = true;
          return;
        }

        if (
          (propertyName === 'add' || propertyName === 'remove' || propertyName === 'toggle') &&
          ts.isPropertyAccessExpression(callee.expression) &&
          callee.expression.name.text === 'classList'
        ) {
          risky = true;
          return;
        }

        if (
          (propertyName === 'setProperty' || propertyName === 'removeProperty') &&
          ts.isPropertyAccessExpression(callee.expression) &&
          callee.expression.name.text === 'style'
        ) {
          risky = true;
          return;
        }
      }
    }

    if (ts.isNewExpression(node)) {
      const constructorExpression = unwrapExpression(node.expression);
      if (ts.isIdentifier(constructorExpression) && RISKY_CONSTRUCTORS.has(constructorExpression.text)) {
        risky = true;
        return;
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      if (RISKY_LAYOUT_PROPERTIES.has(node.name.text)) {
        risky = true;
        return;
      }

      const rootIdentifier = getRootIdentifierName(node.expression);
      if (
        rootIdentifier === 'document' &&
        (node.name.text === 'body' || node.name.text === 'documentElement')
      ) {
        risky = true;
        return;
      }

      if (rootIdentifier && RISKY_GLOBAL_ROOTS.has(rootIdentifier)) {
        risky = true;
        return;
      }
    }

    if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      const propertyName =
        argument && (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument)) ? argument.text : null;

      if (propertyName && RISKY_LAYOUT_PROPERTIES.has(propertyName)) {
        risky = true;
        return;
      }

      const rootIdentifier = getRootIdentifierName(node.expression);
      if (rootIdentifier && RISKY_GLOBAL_ROOTS.has(rootIdentifier)) {
        risky = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return risky;
}

export function checkSafety(code: string, id: string, context: SafetyCheckContext): SafetyCheckResult {
  const reasons: string[] = [];
  const clientModule = isClientModule(id);
  const selector = getStaticSelector(context.triggerArgument);
  const extraCriticalSelectors = context.criticalSelectors ?? [];
  const sourceFile = createSourceFile(code, id);

  if (!clientModule) {
    reasons.push('not a client-side source module');
  }

  const detection = detectHeavyComponents(code);
  if (!detection.hasSupportedImports) {
    reasons.push('does not import gsap, ScrollTrigger, or lottie-web');
  }

  if (!selector) {
    reasons.push('trigger is not a static selector string');
  }

  if (selector && isCriticalSelector(selector, extraCriticalSelectors)) {
    reasons.push('trigger targets a critical or first-paint selector');
  }

  if (CRITICAL_PATH_PATTERN.test(id) || CRITICAL_PATH_PATTERN.test(context.importerId)) {
    reasons.push('module or importer path looks hero-critical');
  }

  if (hasSideEffectImport(sourceFile)) {
    reasons.push('contains side-effect imports');
  }

  if (hasUnsupportedExternalImport(code)) {
    reasons.push('imports unsupported external dependencies');
  }

  if (hasUnsafeTopLevelStatements(sourceFile)) {
    reasons.push('contains top-level side effects or control flow');
  }

  if (hasRiskySynchronousBehavior(sourceFile)) {
    reasons.push('contains risky synchronous runtime behavior');
  }

  return {
    isClientModule: clientModule,
    isSafeToDefer: reasons.length === 0,
    reasons
  };
}
