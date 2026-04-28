// vite.config.mjs
import path4 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// ../../../dist/plugin.js
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path3 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ../../../dist/ast.js
import path from "node:path";
import ts from "file:///D:/ishi/featherperf/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";
function getScriptKind(id) {
  const extension = path.extname(id).toLowerCase();
  switch (extension) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}
function parseNamedBindings(namedImports) {
  return namedImports.elements.map((element) => ({
    importedName: element.propertyName?.text ?? element.name.text,
    localName: element.name.text,
    kind: "named"
  }));
}
function parseImportDeclaration(statement, sourceFile) {
  if (!ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause) {
    return null;
  }
  const bindings = [];
  const importClause = statement.importClause;
  if (importClause.name) {
    bindings.push({
      importedName: "default",
      localName: importClause.name.text,
      kind: "default"
    });
  }
  if (importClause.namedBindings) {
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.push({
        importedName: "*",
        localName: importClause.namedBindings.name.text,
        kind: "namespace"
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
function isImportBindingIdentifier(node) {
  const parent = node.parent;
  return ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent);
}
function getIndent(code, position) {
  const lineStart = code.lastIndexOf("\n", position - 1) + 1;
  const linePrefix = code.slice(lineStart, position);
  const indentMatch = linePrefix.match(/^\s*/);
  return indentMatch?.[0] ?? "";
}
function unwrapExpression(expression) {
  if (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapExpression(expression.expression);
  }
  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}
function getImportedBindingNameFromCallee(callee) {
  const normalizedCallee = unwrapExpression(callee);
  if (ts.isIdentifier(normalizedCallee)) {
    return normalizedCallee.text;
  }
  if (ts.isPropertyAccessExpression(normalizedCallee) || ts.isElementAccessExpression(normalizedCallee)) {
    return getImportedBindingNameFromCallee(normalizedCallee.expression);
  }
  return null;
}
function collectCallRecord(statement, sourceFile, code) {
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
function collectDeferredImportCandidates(code, id) {
  const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, getScriptKind(id));
  const imports = [];
  const directCalls = /* @__PURE__ */ new Map();
  const identifierUsageCounts = /* @__PURE__ */ new Map();
  const visit = (node) => {
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
  const candidates = [];
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
        importBindings: importRecord.bindings,
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

// ../../../dist/constants.js
var PLUGIN_NAME = "vite-plugin-featherperf";
var SUPPORTED_HEAVY_IMPORTS = {
  gsap: "gsap",
  ScrollTrigger: "gsap/ScrollTrigger",
  "ScrollTrigger(dist)": "gsap/dist/ScrollTrigger",
  "lottie-web": "lottie-web"
};
var CLIENT_MODULE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".mts"
];
var IMPORT_LINE_PATTERN = /^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/;
var SIDE_EFFECT_IMPORT_LINE_PATTERN = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/;

// ../../../dist/safety.js
import path2 from "node:path";
import ts2 from "file:///D:/ishi/featherperf/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

// ../../../dist/detector.js
function normalizeSupportedPackage(source) {
  if (source === SUPPORTED_HEAVY_IMPORTS.gsap) {
    return "gsap";
  }
  if (source === SUPPORTED_HEAVY_IMPORTS.ScrollTrigger || source === SUPPORTED_HEAVY_IMPORTS["ScrollTrigger(dist)"]) {
    return "ScrollTrigger";
  }
  if (source === SUPPORTED_HEAVY_IMPORTS["lottie-web"]) {
    return "lottie-web";
  }
  return null;
}
function parseNamedBindings2(clause) {
  return clause.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [importedName, alias] = entry.split(/\s+as\s+/i).map((value) => value.trim());
    return {
      importedName,
      localName: alias ?? importedName,
      kind: "named"
    };
  });
}
function parseBindings(specifierClause) {
  const clause = specifierClause.trim();
  if (!clause) {
    return [];
  }
  if (clause.startsWith("* as ")) {
    const localName = clause.slice(5).trim();
    return [
      {
        importedName: "*",
        localName,
        kind: "namespace"
      }
    ];
  }
  if (clause.startsWith("{") && clause.endsWith("}")) {
    return parseNamedBindings2(clause.slice(1, -1));
  }
  const namedStartIndex = clause.indexOf("{");
  if (namedStartIndex >= 0) {
    const defaultBinding = clause.slice(0, namedStartIndex).replace(/,$/, "").trim();
    const namedClause = clause.slice(namedStartIndex).trim();
    return [
      {
        importedName: "default",
        localName: defaultBinding,
        kind: "default"
      },
      ...parseNamedBindings2(namedClause.slice(1, -1))
    ];
  }
  return [
    {
      importedName: "default",
      localName: clause,
      kind: "default"
    }
  ];
}
function parseImportLine(line) {
  if (SIDE_EFFECT_IMPORT_LINE_PATTERN.test(line)) {
    return null;
  }
  const match = line.match(IMPORT_LINE_PATTERN);
  if (!match) {
    return null;
  }
  const [, specifierClause, source] = match;
  return {
    source,
    bindings: parseBindings(specifierClause),
    supportedPackage: normalizeSupportedPackage(source)
  };
}
function detectHeavyComponents(code) {
  const imports = code.split(/\r?\n/).map((line) => parseImportLine(line)).filter((entry) => entry !== null);
  const supportedPackages = Array.from(new Set(imports.map((entry) => entry.supportedPackage).filter((entry) => entry !== null)));
  return {
    supportedPackages,
    imports,
    hasSupportedImports: supportedPackages.length > 0
  };
}

// ../../../dist/safety.js
var CRITICAL_PATH_PATTERN = /(^|[\\/._-])(hero|header|navbar|above(?:-|_)?fold|critical|preloader|loader|splash)($|[\\/._-])/i;
var CRITICAL_SELECTOR_PATTERN = /(^|[#.\s>:+~\[(=-])(hero|header|navbar|above(?:-|_)?fold|critical|preloader|loader|splash|app|root)($|[#.\s>:+~\])=-])/i;
var EXACT_CRITICAL_SELECTORS = /* @__PURE__ */ new Set([
  "body",
  "html",
  "main",
  "header",
  "nav",
  "#app",
  "#root",
  "#__next",
  "#__nuxt",
  "[data-critical]",
  "[data-above-fold]"
]);
var RISKY_GLOBAL_ROOTS = /* @__PURE__ */ new Set([
  "localStorage",
  "sessionStorage",
  "history",
  "location"
]);
var RISKY_LAYOUT_PROPERTIES = /* @__PURE__ */ new Set([
  "offsetWidth",
  "offsetHeight",
  "offsetTop",
  "offsetLeft",
  "clientWidth",
  "clientHeight",
  "clientTop",
  "clientLeft",
  "scrollWidth",
  "scrollHeight",
  "scrollTop",
  "scrollLeft"
]);
var RISKY_CONSTRUCTORS = /* @__PURE__ */ new Set([
  "ResizeObserver",
  "MutationObserver",
  "XMLHttpRequest"
]);
var RISKY_HIGH_FREQUENCY_EVENTS = /* @__PURE__ */ new Set([
  "scroll",
  "resize",
  "mousemove",
  "pointermove",
  "touchmove"
]);
function getScriptKind2(id) {
  const extension = path2.extname(id).toLowerCase();
  switch (extension) {
    case ".tsx":
      return ts2.ScriptKind.TSX;
    case ".jsx":
      return ts2.ScriptKind.JSX;
    case ".js":
    case ".mjs":
      return ts2.ScriptKind.JS;
    default:
      return ts2.ScriptKind.TS;
  }
}
function createSourceFile(code, id) {
  return ts2.createSourceFile(id, code, ts2.ScriptTarget.Latest, true, getScriptKind2(id));
}
function isClientModule(id) {
  const cleanId = id.split("?")[0].split("#")[0];
  if (cleanId.includes("node_modules") || cleanId.endsWith(".d.ts")) {
    return false;
  }
  return CLIENT_MODULE_EXTENSIONS.some((extension) => cleanId.endsWith(extension));
}
function isRelativeImport(source) {
  return source.startsWith("./") || source.startsWith("../");
}
function isSupportedHeavyImport(source) {
  const detection = detectHeavyComponents(`import fp from ${JSON.stringify(source)};`);
  return detection.hasSupportedImports;
}
function hasSideEffectImport(sourceFile) {
  return sourceFile.statements.some((statement) => ts2.isImportDeclaration(statement) && !statement.importClause);
}
function hasUnsupportedExternalImport(code) {
  const imports = detectHeavyComponents(code).imports;
  return imports.some((entry) => !isRelativeImport(entry.source) && !isSupportedHeavyImport(entry.source));
}
function getStaticSelector(argument) {
  if (!argument) {
    return null;
  }
  const trimmed = argument.trim();
  if (trimmed.length < 2) {
    return null;
  }
  const quote = trimmed[0];
  const lastCharacter = trimmed[trimmed.length - 1];
  if ((quote === "'" || quote === '"') && lastCharacter === quote) {
    return trimmed.slice(1, -1);
  }
  if (quote === "`" && lastCharacter === "`" && !trimmed.includes("${")) {
    return trimmed.slice(1, -1);
  }
  return null;
}
function isCriticalSelector(selector, extraCriticalSelectors = []) {
  const normalizedSelector = selector.trim().toLowerCase();
  const hasExactMatch = EXACT_CRITICAL_SELECTORS.has(normalizedSelector) || extraCriticalSelectors.some((entry) => entry.trim().toLowerCase() === normalizedSelector);
  return hasExactMatch || CRITICAL_SELECTOR_PATTERN.test(normalizedSelector);
}
function unwrapExpression2(expression) {
  if (ts2.isParenthesizedExpression(expression) || ts2.isNonNullExpression(expression)) {
    return unwrapExpression2(expression.expression);
  }
  if (ts2.isAsExpression(expression) || ts2.isTypeAssertionExpression(expression)) {
    return unwrapExpression2(expression.expression);
  }
  return expression;
}
function getRootIdentifierName(expression) {
  const normalizedExpression = unwrapExpression2(expression);
  if (ts2.isIdentifier(normalizedExpression)) {
    return normalizedExpression.text;
  }
  if (ts2.isPropertyAccessExpression(normalizedExpression) || ts2.isElementAccessExpression(normalizedExpression)) {
    return getRootIdentifierName(normalizedExpression.expression);
  }
  return null;
}
function isUndefinedIdentifier(expression) {
  return ts2.isIdentifier(expression) && expression.text === "undefined";
}
function isStaticInitializer(expression) {
  const normalizedExpression = unwrapExpression2(expression);
  if (ts2.isStringLiteralLike(normalizedExpression) || ts2.isNumericLiteral(normalizedExpression) || normalizedExpression.kind === ts2.SyntaxKind.TrueKeyword || normalizedExpression.kind === ts2.SyntaxKind.FalseKeyword || normalizedExpression.kind === ts2.SyntaxKind.NullKeyword || isUndefinedIdentifier(normalizedExpression)) {
    return true;
  }
  if (ts2.isNoSubstitutionTemplateLiteral(normalizedExpression)) {
    return true;
  }
  if (ts2.isPrefixUnaryExpression(normalizedExpression)) {
    return isStaticInitializer(normalizedExpression.operand);
  }
  if (ts2.isArrayLiteralExpression(normalizedExpression)) {
    return normalizedExpression.elements.every((element) => !ts2.isSpreadElement(element) && isStaticInitializer(element));
  }
  if (ts2.isObjectLiteralExpression(normalizedExpression)) {
    return normalizedExpression.properties.every((property) => {
      if (ts2.isSpreadAssignment(property) || ts2.isShorthandPropertyAssignment(property)) {
        return false;
      }
      if (ts2.isPropertyAssignment(property)) {
        if (property.name && ts2.isComputedPropertyName(property.name)) {
          return false;
        }
        return isStaticInitializer(property.initializer);
      }
      return false;
    });
  }
  return false;
}
function hasUnsafeTopLevelStatements(sourceFile) {
  return sourceFile.statements.some((statement) => {
    if (ts2.isImportDeclaration(statement)) {
      return false;
    }
    if (ts2.isExportDeclaration(statement) || ts2.isInterfaceDeclaration(statement) || ts2.isTypeAliasDeclaration(statement) || ts2.isFunctionDeclaration(statement) || ts2.isClassDeclaration(statement) || ts2.isEmptyStatement(statement)) {
      return false;
    }
    if (ts2.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some((declaration) => declaration.initializer && !isStaticInitializer(declaration.initializer));
    }
    return true;
  });
}
function isHighFrequencyAddEventListenerCall(node) {
  const callee = unwrapExpression2(node.expression);
  if (!ts2.isPropertyAccessExpression(callee) || callee.name.text !== "addEventListener") {
    return false;
  }
  const [firstArgument] = node.arguments;
  return !!firstArgument && ts2.isStringLiteral(firstArgument) && RISKY_HIGH_FREQUENCY_EVENTS.has(firstArgument.text);
}
function hasRiskySynchronousBehavior(sourceFile) {
  let risky = false;
  const visit = (node) => {
    if (risky) {
      return;
    }
    if (ts2.isCallExpression(node)) {
      if (isHighFrequencyAddEventListenerCall(node)) {
        risky = true;
        return;
      }
      const callee = unwrapExpression2(node.expression);
      if (ts2.isIdentifier(callee) && (callee.text === "fetch" || callee.text === "getComputedStyle")) {
        risky = true;
        return;
      }
      if (ts2.isPropertyAccessExpression(callee)) {
        const propertyName = callee.name.text;
        if (propertyName === "getBoundingClientRect") {
          risky = true;
          return;
        }
        if ((propertyName === "add" || propertyName === "remove" || propertyName === "toggle") && ts2.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === "classList") {
          risky = true;
          return;
        }
        if ((propertyName === "setProperty" || propertyName === "removeProperty") && ts2.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === "style") {
          risky = true;
          return;
        }
      }
    }
    if (ts2.isNewExpression(node)) {
      const constructorExpression = unwrapExpression2(node.expression);
      if (ts2.isIdentifier(constructorExpression) && RISKY_CONSTRUCTORS.has(constructorExpression.text)) {
        risky = true;
        return;
      }
    }
    if (ts2.isPropertyAccessExpression(node)) {
      if (RISKY_LAYOUT_PROPERTIES.has(node.name.text)) {
        risky = true;
        return;
      }
      const rootIdentifier = getRootIdentifierName(node.expression);
      if (rootIdentifier === "document" && (node.name.text === "body" || node.name.text === "documentElement")) {
        risky = true;
        return;
      }
      if (rootIdentifier && RISKY_GLOBAL_ROOTS.has(rootIdentifier)) {
        risky = true;
        return;
      }
    }
    if (ts2.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      const propertyName = argument && (ts2.isStringLiteral(argument) || ts2.isNumericLiteral(argument)) ? argument.text : null;
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
    ts2.forEachChild(node, visit);
  };
  visit(sourceFile);
  return risky;
}
function checkSafety(code, id, context) {
  const reasons = [];
  const clientModule = isClientModule(id);
  const selector = getStaticSelector(context.triggerArgument);
  const extraCriticalSelectors = context.criticalSelectors ?? [];
  const sourceFile = createSourceFile(code, id);
  if (!clientModule) {
    reasons.push("not a client-side source module");
  }
  const detection = detectHeavyComponents(code);
  if (!detection.hasSupportedImports) {
    reasons.push("does not import gsap, ScrollTrigger, or lottie-web");
  }
  if (!selector) {
    reasons.push("trigger is not a static selector string");
  }
  if (selector && isCriticalSelector(selector, extraCriticalSelectors)) {
    reasons.push("trigger targets a critical or first-paint selector");
  }
  if (CRITICAL_PATH_PATTERN.test(id) || CRITICAL_PATH_PATTERN.test(context.importerId)) {
    reasons.push("module or importer path looks hero-critical");
  }
  if (hasSideEffectImport(sourceFile)) {
    reasons.push("contains side-effect imports");
  }
  if (hasUnsupportedExternalImport(code)) {
    reasons.push("imports unsupported external dependencies");
  }
  if (hasUnsafeTopLevelStatements(sourceFile)) {
    reasons.push("contains top-level side effects or control flow");
  }
  if (hasRiskySynchronousBehavior(sourceFile)) {
    reasons.push("contains risky synchronous runtime behavior");
  }
  return {
    isClientModule: clientModule,
    isSafeToDefer: reasons.length === 0,
    reasons
  };
}

// ../../../dist/transform.js
function createDeferredReplacement(candidate, options) {
  const { source, binding, callExpressionText, callIndent, triggerArgument } = candidate;
  const firstArgument = triggerArgument ?? "undefined";
  const importBinding = binding.kind === "default" ? `const { default: ${binding.localName} } = await import(${JSON.stringify(source)});` : binding.kind === "namespace" ? `const ${binding.localName} = await import(${JSON.stringify(source)});` : `const { ${binding.importedName}: ${binding.localName} } = await import(${JSON.stringify(source)});`;
  const callExpression = `${callExpressionText};`;
  const label = `${binding.localName} from ${source}`;
  return [
    `${callIndent}__featherperfDefer({`,
    `${callIndent}  trigger: ${firstArgument},`,
    `${callIndent}  idleTimeoutMs: ${options.idleTimeoutMs ?? 1500},`,
    `${callIndent}  lookaheadPx: ${options.lookaheadPx ?? 300},`,
    `${callIndent}  postLoadDelayMs: ${options.postLoadDelayMs ?? 1500},`,
    `${callIndent}  interactionQuietWindowMs: ${options.interactionQuietWindowMs ?? 750},`,
    `${callIndent}  debug: ${options.debug ? "true" : "false"},`,
    `${callIndent}  label: ${JSON.stringify(label)}`,
    `${callIndent}}, async () => {`,
    `${callIndent}  ${importBinding}`,
    `${callIndent}  ${callExpression}`,
    `${callIndent}});`
  ];
}
function sameBinding(left, right) {
  return left.kind === right.kind && left.localName === right.localName && left.importedName === right.importedName;
}
function formatNamedBinding(binding) {
  return binding.importedName === binding.localName ? binding.importedName : `${binding.importedName} as ${binding.localName}`;
}
function createStaticImport(source, bindings) {
  if (bindings.length === 0) {
    return "";
  }
  const defaultBinding = bindings.find((binding) => binding.kind === "default");
  const namespaceBinding = bindings.find((binding) => binding.kind === "namespace");
  const namedBindings = bindings.filter((binding) => binding.kind === "named");
  const clauses = [];
  if (defaultBinding) {
    clauses.push(defaultBinding.localName);
  }
  if (namespaceBinding) {
    clauses.push(`* as ${namespaceBinding.localName}`);
  }
  if (namedBindings.length > 0) {
    clauses.push(`{ ${namedBindings.map((binding) => formatNamedBinding(binding)).join(", ")} }`);
  }
  return `import ${clauses.join(", ")} from ${JSON.stringify(source)};`;
}
function transformCode(code, candidates, options = {}) {
  if (candidates.length === 0) {
    return code;
  }
  const replacements = [];
  const groupedCandidates = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    const importKey = `${candidate.importStart}:${candidate.importEnd}`;
    const importCandidates = groupedCandidates.get(importKey) ?? [];
    importCandidates.push(candidate);
    groupedCandidates.set(importKey, importCandidates);
  }
  for (const importCandidates of groupedCandidates.values()) {
    const [firstCandidate] = importCandidates;
    const remainingBindings = firstCandidate.importBindings.filter((binding) => !importCandidates.some((candidate) => sameBinding(binding, candidate.binding)));
    replacements.push({
      start: firstCandidate.importStart,
      end: firstCandidate.importEnd,
      text: createStaticImport(firstCandidate.source, remainingBindings)
    });
  }
  for (const candidate of candidates) {
    replacements.push({
      start: candidate.callStart,
      end: candidate.callEnd,
      text: createDeferredReplacement(candidate, options).join("\n")
    });
  }
  if (replacements.length === 0) {
    return code;
  }
  replacements.sort((left, right) => right.start - left.start);
  let transformed = code;
  for (const replacement of replacements) {
    transformed = transformed.slice(0, replacement.start) + replacement.text + transformed.slice(replacement.end);
  }
  const runtimeImport = `import { deferModuleEntry as __featherperfDefer } from 'virtual:featherperf-runtime';`;
  return `${runtimeImport}

${transformed}`;
}

// ../../../dist/plugin.js
var __vite_injected_original_import_meta_url = "file:///D:/ishi/featherperf/packages/vite-plugin/dist/plugin.js";
var VIRTUAL_RUNTIME_PUBLIC_ID = "virtual:featherperf-runtime";
var VIRTUAL_RUNTIME_RESOLVED_ID = "\0virtual:featherperf-runtime";
var runtimeRequire = createRequire(__vite_injected_original_import_meta_url);
function getRuntimeEntryHref() {
  let runtimeEntryPath;
  try {
    runtimeEntryPath = runtimeRequire.resolve("@featherperf/runtime");
  } catch {
    runtimeEntryPath = path3.resolve(path3.dirname(fileURLToPath(__vite_injected_original_import_meta_url)), "../../runtime/dist/index.js");
  }
  return pathToFileURL(runtimeEntryPath).href;
}
function stripQuery(id) {
  return id.split("?")[0].split("#")[0];
}
function normalizePath(id) {
  return stripQuery(id).replace(/\\/g, "/");
}
function isRelativeImport2(source) {
  return source.startsWith("./") || source.startsWith("../");
}
function matchesPattern(value, pattern) {
  if (typeof pattern === "string") {
    return value.includes(pattern);
  }
  return pattern.test(value);
}
function shouldProcessModule(id, options) {
  const normalizedId = normalizePath(id);
  const includePatterns = options.include ?? [];
  const excludePatterns = options.exclude ?? [];
  if (includePatterns.length > 0 && !includePatterns.some((pattern) => matchesPattern(normalizedId, pattern))) {
    return false;
  }
  return !excludePatterns.some((pattern) => matchesPattern(normalizedId, pattern));
}
async function readResolvedCode(resolvedId) {
  try {
    return await readFile(stripQuery(resolvedId), "utf8");
  } catch {
    return null;
  }
}
function featherperf(options = {}) {
  return {
    name: PLUGIN_NAME,
    apply: "build",
    resolveId(source) {
      if (source === VIRTUAL_RUNTIME_PUBLIC_ID) {
        return VIRTUAL_RUNTIME_RESOLVED_ID;
      }
      if (source.startsWith("file:///")) {
        return fileURLToPath(source);
      }
      return null;
    },
    load(id) {
      if (id !== VIRTUAL_RUNTIME_RESOLVED_ID) {
        return null;
      }
      return `export { deferModuleEntry } from ${JSON.stringify(getRuntimeEntryHref())};`;
    },
    async transform(code, id) {
      const cleanId = stripQuery(id);
      const normalizedId = normalizePath(id);
      if (normalizedId.includes("/node_modules/") || normalizedId.includes("/packages/runtime/dist/") || normalizedId.includes("/packages/runtime/src/")) {
        return null;
      }
      if (!shouldProcessModule(cleanId, options)) {
        return null;
      }
      const detectedCandidates = collectDeferredImportCandidates(code, cleanId);
      const candidates = [];
      for (const candidate of detectedCandidates) {
        if (!isRelativeImport2(candidate.source)) {
          continue;
        }
        const resolvedImport = await this.resolve(candidate.source, id);
        if (!resolvedImport?.id) {
          continue;
        }
        const importedCode = await readResolvedCode(resolvedImport.id);
        if (!importedCode) {
          continue;
        }
        const safety = checkSafety(importedCode, resolvedImport.id, {
          importerId: cleanId,
          triggerArgument: candidate.triggerArgument,
          criticalSelectors: options.criticalSelectors
        });
        if (!safety.isSafeToDefer) {
          if (options.debug) {
            this.warn(`${PLUGIN_NAME}: skipped ${path3.relative(process.cwd(), stripQuery(resolvedImport.id))} (${safety.reasons.join(", ")})`);
          }
          continue;
        }
        candidates.push(candidate);
        if (options.debug) {
          this.warn(`${PLUGIN_NAME}: detected ${path3.relative(process.cwd(), stripQuery(resolvedImport.id))} via ${candidate.source}`);
        }
      }
      const transformed = transformCode(code, candidates, options);
      if (transformed === code) {
        return null;
      }
      if (options.debug) {
        const deferredTargets = candidates.map((candidate) => candidate.source).join(", ");
        this.warn(`${PLUGIN_NAME}: deferred ${path3.relative(process.cwd(), cleanId)} -> ${deferredTargets}`);
      }
      return {
        code: transformed,
        map: null
      };
    }
  };
}

// vite.config.mjs
var __vite_injected_original_import_meta_url2 = "file:///D:/ishi/featherperf/packages/vite-plugin/test/fixtures/vite-mixed-import/vite.config.mjs";
var fixtureDirectory = path4.dirname(fileURLToPath2(__vite_injected_original_import_meta_url2));
var repoRoot = path4.resolve(fixtureDirectory, "../../../../..");
var vite_config_default = {
  plugins: [
    featherperf({
      include: ["src/main.js"]
    })
  ],
  resolve: {
    alias: {
      gsap: path4.join(repoRoot, "node_modules", ".pnpm", "node_modules", "gsap", "index.js")
    }
  },
  build: {
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
};
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubWpzIiwgIi4uLy4uLy4uL3NyYy9wbHVnaW4udHMiLCAiLi4vLi4vLi4vc3JjL2FzdC50cyIsICIuLi8uLi8uLi9zcmMvY29uc3RhbnRzLnRzIiwgIi4uLy4uLy4uL3NyYy9zYWZldHkudHMiLCAiLi4vLi4vLi4vc3JjL2RldGVjdG9yLnRzIiwgIi4uLy4uLy4uL3NyYy90cmFuc2Zvcm0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxpc2hpXFxcXGZlYXRoZXJwZXJmXFxcXHBhY2thZ2VzXFxcXHZpdGUtcGx1Z2luXFxcXHRlc3RcXFxcZml4dHVyZXNcXFxcdml0ZS1taXhlZC1pbXBvcnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXGlzaGlcXFxcZmVhdGhlcnBlcmZcXFxccGFja2FnZXNcXFxcdml0ZS1wbHVnaW5cXFxcdGVzdFxcXFxmaXh0dXJlc1xcXFx2aXRlLW1peGVkLWltcG9ydFxcXFx2aXRlLmNvbmZpZy5tanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L2lzaGkvZmVhdGhlcnBlcmYvcGFja2FnZXMvdml0ZS1wbHVnaW4vdGVzdC9maXh0dXJlcy92aXRlLW1peGVkLWltcG9ydC92aXRlLmNvbmZpZy5tanNcIjtpbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ25vZGU6dXJsJztcbmltcG9ydCB7IGZlYXRoZXJwZXJmIH0gZnJvbSAnLi4vLi4vLi4vZGlzdC9pbmRleC5qcyc7XG5cbmNvbnN0IGZpeHR1cmVEaXJlY3RvcnkgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcbmNvbnN0IHJlcG9Sb290ID0gcGF0aC5yZXNvbHZlKGZpeHR1cmVEaXJlY3RvcnksICcuLi8uLi8uLi8uLi8uLicpO1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIHBsdWdpbnM6IFtcbiAgICBmZWF0aGVycGVyZih7XG4gICAgICBpbmNsdWRlOiBbJ3NyYy9tYWluLmpzJ11cbiAgICB9KVxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIGdzYXA6IHBhdGguam9pbihyZXBvUm9vdCwgJ25vZGVfbW9kdWxlcycsICcucG5wbScsICdub2RlX21vZHVsZXMnLCAnZ3NhcCcsICdpbmRleC5qcycpXG4gICAgfVxuICB9LFxuICBidWlsZDoge1xuICAgIG1pbmlmeTogZmFsc2UsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXS5qcycsXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXS5qcycsXG4gICAgICAgIGFzc2V0RmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXVtleHRuYW1lXSdcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgcmVhZEZpbGUgfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJztcbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tICdub2RlOm1vZHVsZSc7XG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgcGF0aFRvRmlsZVVSTCB9IGZyb20gJ25vZGU6dXJsJztcbmltcG9ydCB0eXBlIHsgUGx1Z2luIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgeyBjb2xsZWN0RGVmZXJyZWRJbXBvcnRDYW5kaWRhdGVzIH0gZnJvbSAnLi9hc3QuanMnO1xuaW1wb3J0IHsgUExVR0lOX05BTUUgfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBjaGVja1NhZmV0eSB9IGZyb20gJy4vc2FmZXR5LmpzJztcbmltcG9ydCB7IHRyYW5zZm9ybUNvZGUgfSBmcm9tICcuL3RyYW5zZm9ybS5qcyc7XG5pbXBvcnQgdHlwZSB7IERlZmVycmVkSW1wb3J0Q2FuZGlkYXRlLCBGZWF0aGVyUGVyZk9wdGlvbnMgfSBmcm9tICcuL3R5cGVzLmpzJztcblxuY29uc3QgVklSVFVBTF9SVU5USU1FX1BVQkxJQ19JRCA9ICd2aXJ0dWFsOmZlYXRoZXJwZXJmLXJ1bnRpbWUnO1xuY29uc3QgVklSVFVBTF9SVU5USU1FX1JFU09MVkVEX0lEID0gJ1xcMHZpcnR1YWw6ZmVhdGhlcnBlcmYtcnVudGltZSc7XG5jb25zdCBydW50aW1lUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblxuZnVuY3Rpb24gZ2V0UnVudGltZUVudHJ5SHJlZigpOiBzdHJpbmcge1xuICBsZXQgcnVudGltZUVudHJ5UGF0aDogc3RyaW5nO1xuXG4gIHRyeSB7XG4gICAgcnVudGltZUVudHJ5UGF0aCA9IHJ1bnRpbWVSZXF1aXJlLnJlc29sdmUoJ0BmZWF0aGVycGVyZi9ydW50aW1lJyk7XG4gIH0gY2F0Y2gge1xuICAgIHJ1bnRpbWVFbnRyeVBhdGggPSBwYXRoLnJlc29sdmUoXG4gICAgICBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKSxcbiAgICAgICcuLi8uLi9ydW50aW1lL2Rpc3QvaW5kZXguanMnXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBwYXRoVG9GaWxlVVJMKHJ1bnRpbWVFbnRyeVBhdGgpLmhyZWY7XG59XG5cbmZ1bmN0aW9uIHN0cmlwUXVlcnkoaWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBpZC5zcGxpdCgnPycpWzBdLnNwbGl0KCcjJylbMF07XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVBhdGgoaWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzdHJpcFF1ZXJ5KGlkKS5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG59XG5cbmZ1bmN0aW9uIGlzUmVsYXRpdmVJbXBvcnQoc291cmNlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIHNvdXJjZS5zdGFydHNXaXRoKCcuLycpIHx8IHNvdXJjZS5zdGFydHNXaXRoKCcuLi8nKTtcbn1cblxuZnVuY3Rpb24gbWF0Y2hlc1BhdHRlcm4odmFsdWU6IHN0cmluZywgcGF0dGVybjogc3RyaW5nIHwgUmVnRXhwKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgcGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWUuaW5jbHVkZXMocGF0dGVybik7XG4gIH1cblxuICByZXR1cm4gcGF0dGVybi50ZXN0KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkUHJvY2Vzc01vZHVsZShpZDogc3RyaW5nLCBvcHRpb25zOiBGZWF0aGVyUGVyZk9wdGlvbnMpOiBib29sZWFuIHtcbiAgY29uc3Qgbm9ybWFsaXplZElkID0gbm9ybWFsaXplUGF0aChpZCk7XG4gIGNvbnN0IGluY2x1ZGVQYXR0ZXJucyA9IG9wdGlvbnMuaW5jbHVkZSA/PyBbXTtcbiAgY29uc3QgZXhjbHVkZVBhdHRlcm5zID0gb3B0aW9ucy5leGNsdWRlID8/IFtdO1xuXG4gIGlmIChpbmNsdWRlUGF0dGVybnMubGVuZ3RoID4gMCAmJiAhaW5jbHVkZVBhdHRlcm5zLnNvbWUoKHBhdHRlcm4pID0+IG1hdGNoZXNQYXR0ZXJuKG5vcm1hbGl6ZWRJZCwgcGF0dGVybikpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuICFleGNsdWRlUGF0dGVybnMuc29tZSgocGF0dGVybikgPT4gbWF0Y2hlc1BhdHRlcm4obm9ybWFsaXplZElkLCBwYXR0ZXJuKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRSZXNvbHZlZENvZGUocmVzb2x2ZWRJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IHJlYWRGaWxlKHN0cmlwUXVlcnkocmVzb2x2ZWRJZCksICd1dGY4Jyk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmZWF0aGVycGVyZihvcHRpb25zOiBGZWF0aGVyUGVyZk9wdGlvbnMgPSB7fSk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogUExVR0lOX05BTUUsXG4gICAgYXBwbHk6ICdidWlsZCcsXG4gICAgcmVzb2x2ZUlkKHNvdXJjZSkge1xuICAgICAgaWYgKHNvdXJjZSA9PT0gVklSVFVBTF9SVU5USU1FX1BVQkxJQ19JRCkge1xuICAgICAgICByZXR1cm4gVklSVFVBTF9SVU5USU1FX1JFU09MVkVEX0lEO1xuICAgICAgfVxuXG4gICAgICBpZiAoc291cmNlLnN0YXJ0c1dpdGgoJ2ZpbGU6Ly8vJykpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVVUkxUb1BhdGgoc291cmNlKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBsb2FkKGlkKSB7XG4gICAgICBpZiAoaWQgIT09IFZJUlRVQUxfUlVOVElNRV9SRVNPTFZFRF9JRCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGBleHBvcnQgeyBkZWZlck1vZHVsZUVudHJ5IH0gZnJvbSAke0pTT04uc3RyaW5naWZ5KGdldFJ1bnRpbWVFbnRyeUhyZWYoKSl9O2A7XG4gICAgfSxcbiAgICBhc3luYyB0cmFuc2Zvcm0oY29kZSwgaWQpIHtcbiAgICAgIGNvbnN0IGNsZWFuSWQgPSBzdHJpcFF1ZXJ5KGlkKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRJZCA9IG5vcm1hbGl6ZVBhdGgoaWQpO1xuXG4gICAgICBpZiAoXG4gICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy8nKSB8fFxuICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoJy9wYWNrYWdlcy9ydW50aW1lL2Rpc3QvJykgfHxcbiAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKCcvcGFja2FnZXMvcnVudGltZS9zcmMvJylcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzaG91bGRQcm9jZXNzTW9kdWxlKGNsZWFuSWQsIG9wdGlvbnMpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkZXRlY3RlZENhbmRpZGF0ZXMgPSBjb2xsZWN0RGVmZXJyZWRJbXBvcnRDYW5kaWRhdGVzKGNvZGUsIGNsZWFuSWQpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlczogRGVmZXJyZWRJbXBvcnRDYW5kaWRhdGVbXSA9IFtdO1xuXG4gICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBkZXRlY3RlZENhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKCFpc1JlbGF0aXZlSW1wb3J0KGNhbmRpZGF0ZS5zb3VyY2UpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXNvbHZlZEltcG9ydCA9IGF3YWl0IHRoaXMucmVzb2x2ZShjYW5kaWRhdGUuc291cmNlLCBpZCk7XG4gICAgICAgIGlmICghcmVzb2x2ZWRJbXBvcnQ/LmlkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbXBvcnRlZENvZGUgPSBhd2FpdCByZWFkUmVzb2x2ZWRDb2RlKHJlc29sdmVkSW1wb3J0LmlkKTtcbiAgICAgICAgaWYgKCFpbXBvcnRlZENvZGUpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNhZmV0eSA9IGNoZWNrU2FmZXR5KGltcG9ydGVkQ29kZSwgcmVzb2x2ZWRJbXBvcnQuaWQsIHtcbiAgICAgICAgICBpbXBvcnRlcklkOiBjbGVhbklkLFxuICAgICAgICAgIHRyaWdnZXJBcmd1bWVudDogY2FuZGlkYXRlLnRyaWdnZXJBcmd1bWVudCxcbiAgICAgICAgICBjcml0aWNhbFNlbGVjdG9yczogb3B0aW9ucy5jcml0aWNhbFNlbGVjdG9yc1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXNhZmV0eS5pc1NhZmVUb0RlZmVyKSB7XG4gICAgICAgICAgaWYgKG9wdGlvbnMuZGVidWcpIHtcbiAgICAgICAgICAgIHRoaXMud2FybihcbiAgICAgICAgICAgICAgYCR7UExVR0lOX05BTUV9OiBza2lwcGVkICR7cGF0aC5yZWxhdGl2ZShwcm9jZXNzLmN3ZCgpLCBzdHJpcFF1ZXJ5KHJlc29sdmVkSW1wb3J0LmlkKSl9ICgke3NhZmV0eS5yZWFzb25zLmpvaW4oJywgJyl9KWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY2FuZGlkYXRlcy5wdXNoKGNhbmRpZGF0ZSk7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuZGVidWcpIHtcbiAgICAgICAgICB0aGlzLndhcm4oXG4gICAgICAgICAgICBgJHtQTFVHSU5fTkFNRX06IGRldGVjdGVkICR7cGF0aC5yZWxhdGl2ZShwcm9jZXNzLmN3ZCgpLCBzdHJpcFF1ZXJ5KHJlc29sdmVkSW1wb3J0LmlkKSl9IHZpYSAke2NhbmRpZGF0ZS5zb3VyY2V9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdHJhbnNmb3JtZWQgPSB0cmFuc2Zvcm1Db2RlKGNvZGUsIGNhbmRpZGF0ZXMsIG9wdGlvbnMpO1xuICAgICAgaWYgKHRyYW5zZm9ybWVkID09PSBjb2RlKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5kZWJ1Zykge1xuICAgICAgICBjb25zdCBkZWZlcnJlZFRhcmdldHMgPSBjYW5kaWRhdGVzLm1hcCgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuc291cmNlKS5qb2luKCcsICcpO1xuICAgICAgICB0aGlzLndhcm4oXG4gICAgICAgICAgYCR7UExVR0lOX05BTUV9OiBkZWZlcnJlZCAke3BhdGgucmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgY2xlYW5JZCl9IC0+ICR7ZGVmZXJyZWRUYXJnZXRzfWBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogdHJhbnNmb3JtZWQsXG4gICAgICAgIG1hcDogbnVsbFxuICAgICAgfTtcbiAgICB9XG4gIH07XG59XG4iLCAiaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJztcbmltcG9ydCB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB0eXBlIHsgRGVmZXJyZWRJbXBvcnRDYW5kaWRhdGUsIERldGVjdGVkSW1wb3J0LCBJbXBvcnRCaW5kaW5nIH0gZnJvbSAnLi90eXBlcy5qcyc7XG5cbmludGVyZmFjZSBJbXBvcnRSZWNvcmQgZXh0ZW5kcyBEZXRlY3RlZEltcG9ydCB7XG4gIGltcG9ydFN0YXJ0OiBudW1iZXI7XG4gIGltcG9ydEVuZDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ2FsbFJlY29yZCB7XG4gIGxvY2FsTmFtZTogc3RyaW5nO1xuICBjYWxsU3RhcnQ6IG51bWJlcjtcbiAgY2FsbEVuZDogbnVtYmVyO1xuICBjYWxsRXhwcmVzc2lvblRleHQ6IHN0cmluZztcbiAgY2FsbEFyZ3VtZW50czogc3RyaW5nO1xuICB0cmlnZ2VyQXJndW1lbnQ6IHN0cmluZyB8IG51bGw7XG4gIGNhbGxJbmRlbnQ6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZ2V0U2NyaXB0S2luZChpZDogc3RyaW5nKTogdHMuU2NyaXB0S2luZCB7XG4gIGNvbnN0IGV4dGVuc2lvbiA9IHBhdGguZXh0bmFtZShpZCkudG9Mb3dlckNhc2UoKTtcblxuICBzd2l0Y2ggKGV4dGVuc2lvbikge1xuICAgIGNhc2UgJy50c3gnOlxuICAgICAgcmV0dXJuIHRzLlNjcmlwdEtpbmQuVFNYO1xuICAgIGNhc2UgJy5qc3gnOlxuICAgICAgcmV0dXJuIHRzLlNjcmlwdEtpbmQuSlNYO1xuICAgIGNhc2UgJy5qcyc6XG4gICAgY2FzZSAnLm1qcyc6XG4gICAgICByZXR1cm4gdHMuU2NyaXB0S2luZC5KUztcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHRzLlNjcmlwdEtpbmQuVFM7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VOYW1lZEJpbmRpbmdzKG5hbWVkSW1wb3J0czogdHMuTmFtZWRJbXBvcnRzKTogSW1wb3J0QmluZGluZ1tdIHtcbiAgcmV0dXJuIG5hbWVkSW1wb3J0cy5lbGVtZW50cy5tYXAoKGVsZW1lbnQpID0+ICh7XG4gICAgaW1wb3J0ZWROYW1lOiBlbGVtZW50LnByb3BlcnR5TmFtZT8udGV4dCA/PyBlbGVtZW50Lm5hbWUudGV4dCxcbiAgICBsb2NhbE5hbWU6IGVsZW1lbnQubmFtZS50ZXh0LFxuICAgIGtpbmQ6ICduYW1lZCdcbiAgfSkpO1xufVxuXG5mdW5jdGlvbiBwYXJzZUltcG9ydERlY2xhcmF0aW9uKHN0YXRlbWVudDogdHMuSW1wb3J0RGVjbGFyYXRpb24sIHNvdXJjZUZpbGU6IHRzLlNvdXJjZUZpbGUpOiBJbXBvcnRSZWNvcmQgfCBudWxsIHtcbiAgaWYgKCF0cy5pc1N0cmluZ0xpdGVyYWwoc3RhdGVtZW50Lm1vZHVsZVNwZWNpZmllcikgfHwgIXN0YXRlbWVudC5pbXBvcnRDbGF1c2UpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGJpbmRpbmdzOiBJbXBvcnRCaW5kaW5nW10gPSBbXTtcbiAgY29uc3QgaW1wb3J0Q2xhdXNlID0gc3RhdGVtZW50LmltcG9ydENsYXVzZTtcblxuICBpZiAoaW1wb3J0Q2xhdXNlLm5hbWUpIHtcbiAgICBiaW5kaW5ncy5wdXNoKHtcbiAgICAgIGltcG9ydGVkTmFtZTogJ2RlZmF1bHQnLFxuICAgICAgbG9jYWxOYW1lOiBpbXBvcnRDbGF1c2UubmFtZS50ZXh0LFxuICAgICAga2luZDogJ2RlZmF1bHQnXG4gICAgfSk7XG4gIH1cblxuICBpZiAoaW1wb3J0Q2xhdXNlLm5hbWVkQmluZGluZ3MpIHtcbiAgICBpZiAodHMuaXNOYW1lc3BhY2VJbXBvcnQoaW1wb3J0Q2xhdXNlLm5hbWVkQmluZGluZ3MpKSB7XG4gICAgICBiaW5kaW5ncy5wdXNoKHtcbiAgICAgICAgaW1wb3J0ZWROYW1lOiAnKicsXG4gICAgICAgIGxvY2FsTmFtZTogaW1wb3J0Q2xhdXNlLm5hbWVkQmluZGluZ3MubmFtZS50ZXh0LFxuICAgICAgICBraW5kOiAnbmFtZXNwYWNlJ1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJpbmRpbmdzLnB1c2goLi4ucGFyc2VOYW1lZEJpbmRpbmdzKGltcG9ydENsYXVzZS5uYW1lZEJpbmRpbmdzKSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGJpbmRpbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzb3VyY2U6IHN0YXRlbWVudC5tb2R1bGVTcGVjaWZpZXIudGV4dCxcbiAgICBiaW5kaW5ncyxcbiAgICBzdXBwb3J0ZWRQYWNrYWdlOiBudWxsLFxuICAgIGltcG9ydFN0YXJ0OiBzdGF0ZW1lbnQuZ2V0U3RhcnQoc291cmNlRmlsZSksXG4gICAgaW1wb3J0RW5kOiBzdGF0ZW1lbnQuZ2V0RW5kKClcbiAgfTtcbn1cblxuZnVuY3Rpb24gaXNJbXBvcnRCaW5kaW5nSWRlbnRpZmllcihub2RlOiB0cy5JZGVudGlmaWVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IHBhcmVudCA9IG5vZGUucGFyZW50O1xuXG4gIHJldHVybiAoXG4gICAgdHMuaXNJbXBvcnRDbGF1c2UocGFyZW50KSB8fFxuICAgIHRzLmlzSW1wb3J0U3BlY2lmaWVyKHBhcmVudCkgfHxcbiAgICB0cy5pc05hbWVzcGFjZUltcG9ydChwYXJlbnQpXG4gICk7XG59XG5cbmZ1bmN0aW9uIGdldEluZGVudChjb2RlOiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBsaW5lU3RhcnQgPSBjb2RlLmxhc3RJbmRleE9mKCdcXG4nLCBwb3NpdGlvbiAtIDEpICsgMTtcbiAgY29uc3QgbGluZVByZWZpeCA9IGNvZGUuc2xpY2UobGluZVN0YXJ0LCBwb3NpdGlvbik7XG4gIGNvbnN0IGluZGVudE1hdGNoID0gbGluZVByZWZpeC5tYXRjaCgvXlxccyovKTtcbiAgcmV0dXJuIGluZGVudE1hdGNoPy5bMF0gPz8gJyc7XG59XG5cbmZ1bmN0aW9uIHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbik6IHRzLkV4cHJlc3Npb24ge1xuICBpZiAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSB8fCB0cy5pc05vbk51bGxFeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcbiAgfVxuXG4gIGlmICh0cy5pc0FzRXhwcmVzc2lvbihleHByZXNzaW9uKSB8fCB0cy5pc1R5cGVBc3NlcnRpb25FeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcbiAgfVxuXG4gIHJldHVybiBleHByZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBnZXRJbXBvcnRlZEJpbmRpbmdOYW1lRnJvbUNhbGxlZShjYWxsZWU6IHRzLkxlZnRIYW5kU2lkZUV4cHJlc3Npb24pOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3Qgbm9ybWFsaXplZENhbGxlZSA9IHVud3JhcEV4cHJlc3Npb24oY2FsbGVlKTtcblxuICBpZiAodHMuaXNJZGVudGlmaWVyKG5vcm1hbGl6ZWRDYWxsZWUpKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZWRDYWxsZWUudGV4dDtcbiAgfVxuXG4gIGlmICh0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihub3JtYWxpemVkQ2FsbGVlKSB8fCB0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKG5vcm1hbGl6ZWRDYWxsZWUpKSB7XG4gICAgcmV0dXJuIGdldEltcG9ydGVkQmluZGluZ05hbWVGcm9tQ2FsbGVlKG5vcm1hbGl6ZWRDYWxsZWUuZXhwcmVzc2lvbik7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY29sbGVjdENhbGxSZWNvcmQoXG4gIHN0YXRlbWVudDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCxcbiAgc291cmNlRmlsZTogdHMuU291cmNlRmlsZSxcbiAgY29kZTogc3RyaW5nXG4pOiBDYWxsUmVjb3JkIHwgbnVsbCB7XG4gIGlmICghdHMuaXNDYWxsRXhwcmVzc2lvbihzdGF0ZW1lbnQuZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBzdGF0ZW1lbnQuZXhwcmVzc2lvbjtcbiAgY29uc3QgY2FsbGVlID0gZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICBjb25zdCBsb2NhbE5hbWUgPSBnZXRJbXBvcnRlZEJpbmRpbmdOYW1lRnJvbUNhbGxlZShjYWxsZWUpO1xuXG4gIGlmICghbG9jYWxOYW1lKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGxvY2FsTmFtZSxcbiAgICBjYWxsU3RhcnQ6IHN0YXRlbWVudC5nZXRTdGFydChzb3VyY2VGaWxlKSxcbiAgICBjYWxsRW5kOiBzdGF0ZW1lbnQuZ2V0RW5kKCksXG4gICAgY2FsbEV4cHJlc3Npb25UZXh0OiBleHByZXNzaW9uLmdldFRleHQoc291cmNlRmlsZSksXG4gICAgY2FsbEFyZ3VtZW50czogY29kZS5zbGljZShleHByZXNzaW9uLmFyZ3VtZW50cy5wb3MsIGV4cHJlc3Npb24uYXJndW1lbnRzLmVuZCksXG4gICAgdHJpZ2dlckFyZ3VtZW50OiBleHByZXNzaW9uLmFyZ3VtZW50c1swXT8uZ2V0VGV4dChzb3VyY2VGaWxlKSA/PyBudWxsLFxuICAgIGNhbGxJbmRlbnQ6IGdldEluZGVudChjb2RlLCBzdGF0ZW1lbnQuZ2V0U3RhcnQoc291cmNlRmlsZSkpXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0RGVmZXJyZWRJbXBvcnRDYW5kaWRhdGVzKGNvZGU6IHN0cmluZywgaWQ6IHN0cmluZyk6IERlZmVycmVkSW1wb3J0Q2FuZGlkYXRlW10ge1xuICBjb25zdCBzb3VyY2VGaWxlID0gdHMuY3JlYXRlU291cmNlRmlsZShpZCwgY29kZSwgdHMuU2NyaXB0VGFyZ2V0LkxhdGVzdCwgdHJ1ZSwgZ2V0U2NyaXB0S2luZChpZCkpO1xuICBjb25zdCBpbXBvcnRzOiBJbXBvcnRSZWNvcmRbXSA9IFtdO1xuICBjb25zdCBkaXJlY3RDYWxscyA9IG5ldyBNYXA8c3RyaW5nLCBDYWxsUmVjb3JkW10+KCk7XG4gIGNvbnN0IGlkZW50aWZpZXJVc2FnZUNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cbiAgY29uc3QgdmlzaXQgPSAobm9kZTogdHMuTm9kZSkgPT4ge1xuICAgIGlmICh0cy5pc0ltcG9ydERlY2xhcmF0aW9uKG5vZGUpKSB7XG4gICAgICBjb25zdCBpbXBvcnRSZWNvcmQgPSBwYXJzZUltcG9ydERlY2xhcmF0aW9uKG5vZGUsIHNvdXJjZUZpbGUpO1xuICAgICAgaWYgKGltcG9ydFJlY29yZCkge1xuICAgICAgICBpbXBvcnRzLnB1c2goaW1wb3J0UmVjb3JkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHMuaXNJZGVudGlmaWVyKG5vZGUpICYmICFpc0ltcG9ydEJpbmRpbmdJZGVudGlmaWVyKG5vZGUpKSB7XG4gICAgICBpZGVudGlmaWVyVXNhZ2VDb3VudHMuc2V0KG5vZGUudGV4dCwgKGlkZW50aWZpZXJVc2FnZUNvdW50cy5nZXQobm9kZS50ZXh0KSA/PyAwKSArIDEpO1xuICAgIH1cblxuICAgIGlmICh0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQobm9kZSkpIHtcbiAgICAgIGNvbnN0IGNhbGxSZWNvcmQgPSBjb2xsZWN0Q2FsbFJlY29yZChub2RlLCBzb3VyY2VGaWxlLCBjb2RlKTtcbiAgICAgIGlmIChjYWxsUmVjb3JkKSB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nQ2FsbHMgPSBkaXJlY3RDYWxscy5nZXQoY2FsbFJlY29yZC5sb2NhbE5hbWUpID8/IFtdO1xuICAgICAgICBleGlzdGluZ0NhbGxzLnB1c2goY2FsbFJlY29yZCk7XG4gICAgICAgIGRpcmVjdENhbGxzLnNldChjYWxsUmVjb3JkLmxvY2FsTmFtZSwgZXhpc3RpbmdDYWxscyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIHZpc2l0KTtcbiAgfTtcblxuICB2aXNpdChzb3VyY2VGaWxlKTtcblxuICBjb25zdCBjYW5kaWRhdGVzOiBEZWZlcnJlZEltcG9ydENhbmRpZGF0ZVtdID0gW107XG5cbiAgZm9yIChjb25zdCBpbXBvcnRSZWNvcmQgb2YgaW1wb3J0cykge1xuICAgIGZvciAoY29uc3QgYmluZGluZyBvZiBpbXBvcnRSZWNvcmQuYmluZGluZ3MpIHtcbiAgICAgIGNvbnN0IHVzYWdlQ291bnQgPSBpZGVudGlmaWVyVXNhZ2VDb3VudHMuZ2V0KGJpbmRpbmcubG9jYWxOYW1lKSA/PyAwO1xuICAgICAgY29uc3QgY2FsbFJlY29yZHMgPSBkaXJlY3RDYWxscy5nZXQoYmluZGluZy5sb2NhbE5hbWUpID8/IFtdO1xuXG4gICAgICBpZiAodXNhZ2VDb3VudCAhPT0gMSB8fCBjYWxsUmVjb3Jkcy5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGNhbGxSZWNvcmQgPSBjYWxsUmVjb3Jkc1swXTtcbiAgICAgIGNhbmRpZGF0ZXMucHVzaCh7XG4gICAgICAgIHNvdXJjZTogaW1wb3J0UmVjb3JkLnNvdXJjZSxcbiAgICAgICAgYmluZGluZyxcbiAgICAgICAgaW1wb3J0QmluZGluZ3M6IGltcG9ydFJlY29yZC5iaW5kaW5ncyxcbiAgICAgICAgaW1wb3J0QmluZGluZ0NvdW50OiBpbXBvcnRSZWNvcmQuYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICBpbXBvcnRTdGFydDogaW1wb3J0UmVjb3JkLmltcG9ydFN0YXJ0LFxuICAgICAgICBpbXBvcnRFbmQ6IGltcG9ydFJlY29yZC5pbXBvcnRFbmQsXG4gICAgICAgIGNhbGxTdGFydDogY2FsbFJlY29yZC5jYWxsU3RhcnQsXG4gICAgICAgIGNhbGxFbmQ6IGNhbGxSZWNvcmQuY2FsbEVuZCxcbiAgICAgICAgY2FsbEV4cHJlc3Npb25UZXh0OiBjYWxsUmVjb3JkLmNhbGxFeHByZXNzaW9uVGV4dCxcbiAgICAgICAgY2FsbEFyZ3VtZW50czogY2FsbFJlY29yZC5jYWxsQXJndW1lbnRzLFxuICAgICAgICB0cmlnZ2VyQXJndW1lbnQ6IGNhbGxSZWNvcmQudHJpZ2dlckFyZ3VtZW50LFxuICAgICAgICBjYWxsSW5kZW50OiBjYWxsUmVjb3JkLmNhbGxJbmRlbnRcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjYW5kaWRhdGVzO1xufVxuIiwgImV4cG9ydCBjb25zdCBQTFVHSU5fTkFNRSA9ICd2aXRlLXBsdWdpbi1mZWF0aGVycGVyZic7XG5cbmV4cG9ydCBjb25zdCBTVVBQT1JURURfSEVBVllfSU1QT1JUUyA9IHtcbiAgZ3NhcDogJ2dzYXAnLFxuICBTY3JvbGxUcmlnZ2VyOiAnZ3NhcC9TY3JvbGxUcmlnZ2VyJyxcbiAgJ1Njcm9sbFRyaWdnZXIoZGlzdCknOiAnZ3NhcC9kaXN0L1Njcm9sbFRyaWdnZXInLFxuICAnbG90dGllLXdlYic6ICdsb3R0aWUtd2ViJ1xufSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IENMSUVOVF9NT0RVTEVfRVhURU5TSU9OUyA9IFtcbiAgJy5qcycsXG4gICcuanN4JyxcbiAgJy50cycsXG4gICcudHN4JyxcbiAgJy5tanMnLFxuICAnLm10cydcbl0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBJTVBPUlRfTElORV9QQVRURVJOID1cbiAgL15cXHMqaW1wb3J0XFxzKyguKz8pXFxzK2Zyb21cXHMrWydcIl0oW14nXCJdKylbJ1wiXVxccyo7P1xccyokLztcblxuZXhwb3J0IGNvbnN0IFNJREVfRUZGRUNUX0lNUE9SVF9MSU5FX1BBVFRFUk4gPVxuICAvXlxccyppbXBvcnRcXHMrWydcIl0oW14nXCJdKylbJ1wiXVxccyo7P1xccyokLztcbiIsICJpbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuaW1wb3J0IHsgQ0xJRU5UX01PRFVMRV9FWFRFTlNJT05TIH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZGV0ZWN0SGVhdnlDb21wb25lbnRzIH0gZnJvbSAnLi9kZXRlY3Rvci5qcyc7XG5pbXBvcnQgdHlwZSB7IFNhZmV0eUNoZWNrQ29udGV4dCwgU2FmZXR5Q2hlY2tSZXN1bHQgfSBmcm9tICcuL3R5cGVzLmpzJztcblxuY29uc3QgQ1JJVElDQUxfUEFUSF9QQVRURVJOID1cbiAgLyhefFtcXFxcLy5fLV0pKGhlcm98aGVhZGVyfG5hdmJhcnxhYm92ZSg/Oi18Xyk/Zm9sZHxjcml0aWNhbHxwcmVsb2FkZXJ8bG9hZGVyfHNwbGFzaCkoJHxbXFxcXC8uXy1dKS9pO1xuXG5jb25zdCBDUklUSUNBTF9TRUxFQ1RPUl9QQVRURVJOID1cbiAgLyhefFsjLlxccz46K35cXFsoPS1dKShoZXJvfGhlYWRlcnxuYXZiYXJ8YWJvdmUoPzotfF8pP2ZvbGR8Y3JpdGljYWx8cHJlbG9hZGVyfGxvYWRlcnxzcGxhc2h8YXBwfHJvb3QpKCR8WyMuXFxzPjorflxcXSk9LV0pL2k7XG5cbmNvbnN0IEVYQUNUX0NSSVRJQ0FMX1NFTEVDVE9SUyA9IG5ldyBTZXQoW1xuICAnYm9keScsXG4gICdodG1sJyxcbiAgJ21haW4nLFxuICAnaGVhZGVyJyxcbiAgJ25hdicsXG4gICcjYXBwJyxcbiAgJyNyb290JyxcbiAgJyNfX25leHQnLFxuICAnI19fbnV4dCcsXG4gICdbZGF0YS1jcml0aWNhbF0nLFxuICAnW2RhdGEtYWJvdmUtZm9sZF0nXG5dKTtcblxuY29uc3QgUklTS1lfR0xPQkFMX1JPT1RTID0gbmV3IFNldChbXG4gICdsb2NhbFN0b3JhZ2UnLFxuICAnc2Vzc2lvblN0b3JhZ2UnLFxuICAnaGlzdG9yeScsXG4gICdsb2NhdGlvbidcbl0pO1xuXG5jb25zdCBSSVNLWV9MQVlPVVRfUFJPUEVSVElFUyA9IG5ldyBTZXQoW1xuICAnb2Zmc2V0V2lkdGgnLFxuICAnb2Zmc2V0SGVpZ2h0JyxcbiAgJ29mZnNldFRvcCcsXG4gICdvZmZzZXRMZWZ0JyxcbiAgJ2NsaWVudFdpZHRoJyxcbiAgJ2NsaWVudEhlaWdodCcsXG4gICdjbGllbnRUb3AnLFxuICAnY2xpZW50TGVmdCcsXG4gICdzY3JvbGxXaWR0aCcsXG4gICdzY3JvbGxIZWlnaHQnLFxuICAnc2Nyb2xsVG9wJyxcbiAgJ3Njcm9sbExlZnQnXG5dKTtcblxuY29uc3QgUklTS1lfQ09OU1RSVUNUT1JTID0gbmV3IFNldChbXG4gICdSZXNpemVPYnNlcnZlcicsXG4gICdNdXRhdGlvbk9ic2VydmVyJyxcbiAgJ1hNTEh0dHBSZXF1ZXN0J1xuXSk7XG5cbmNvbnN0IFJJU0tZX0hJR0hfRlJFUVVFTkNZX0VWRU5UUyA9IG5ldyBTZXQoW1xuICAnc2Nyb2xsJyxcbiAgJ3Jlc2l6ZScsXG4gICdtb3VzZW1vdmUnLFxuICAncG9pbnRlcm1vdmUnLFxuICAndG91Y2htb3ZlJ1xuXSk7XG5cbmZ1bmN0aW9uIGdldFNjcmlwdEtpbmQoaWQ6IHN0cmluZyk6IHRzLlNjcmlwdEtpbmQge1xuICBjb25zdCBleHRlbnNpb24gPSBwYXRoLmV4dG5hbWUoaWQpLnRvTG93ZXJDYXNlKCk7XG5cbiAgc3dpdGNoIChleHRlbnNpb24pIHtcbiAgICBjYXNlICcudHN4JzpcbiAgICAgIHJldHVybiB0cy5TY3JpcHRLaW5kLlRTWDtcbiAgICBjYXNlICcuanN4JzpcbiAgICAgIHJldHVybiB0cy5TY3JpcHRLaW5kLkpTWDtcbiAgICBjYXNlICcuanMnOlxuICAgIGNhc2UgJy5tanMnOlxuICAgICAgcmV0dXJuIHRzLlNjcmlwdEtpbmQuSlM7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB0cy5TY3JpcHRLaW5kLlRTO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNvdXJjZUZpbGUoY29kZTogc3RyaW5nLCBpZDogc3RyaW5nKTogdHMuU291cmNlRmlsZSB7XG4gIHJldHVybiB0cy5jcmVhdGVTb3VyY2VGaWxlKGlkLCBjb2RlLCB0cy5TY3JpcHRUYXJnZXQuTGF0ZXN0LCB0cnVlLCBnZXRTY3JpcHRLaW5kKGlkKSk7XG59XG5cbmZ1bmN0aW9uIGlzQ2xpZW50TW9kdWxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgY2xlYW5JZCA9IGlkLnNwbGl0KCc/JylbMF0uc3BsaXQoJyMnKVswXTtcblxuICBpZiAoY2xlYW5JZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzJykgfHwgY2xlYW5JZC5lbmRzV2l0aCgnLmQudHMnKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBDTElFTlRfTU9EVUxFX0VYVEVOU0lPTlMuc29tZSgoZXh0ZW5zaW9uKSA9PiBjbGVhbklkLmVuZHNXaXRoKGV4dGVuc2lvbikpO1xufVxuXG5mdW5jdGlvbiBpc1JlbGF0aXZlSW1wb3J0KHNvdXJjZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBzb3VyY2Uuc3RhcnRzV2l0aCgnLi8nKSB8fCBzb3VyY2Uuc3RhcnRzV2l0aCgnLi4vJyk7XG59XG5cbmZ1bmN0aW9uIGlzU3VwcG9ydGVkSGVhdnlJbXBvcnQoc291cmNlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZGV0ZWN0aW9uID0gZGV0ZWN0SGVhdnlDb21wb25lbnRzKGBpbXBvcnQgZnAgZnJvbSAke0pTT04uc3RyaW5naWZ5KHNvdXJjZSl9O2ApO1xuICByZXR1cm4gZGV0ZWN0aW9uLmhhc1N1cHBvcnRlZEltcG9ydHM7XG59XG5cbmZ1bmN0aW9uIGhhc1NpZGVFZmZlY3RJbXBvcnQoc291cmNlRmlsZTogdHMuU291cmNlRmlsZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gc291cmNlRmlsZS5zdGF0ZW1lbnRzLnNvbWUoXG4gICAgKHN0YXRlbWVudCkgPT4gdHMuaXNJbXBvcnREZWNsYXJhdGlvbihzdGF0ZW1lbnQpICYmICFzdGF0ZW1lbnQuaW1wb3J0Q2xhdXNlXG4gICk7XG59XG5cbmZ1bmN0aW9uIGhhc1Vuc3VwcG9ydGVkRXh0ZXJuYWxJbXBvcnQoY29kZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGltcG9ydHMgPSBkZXRlY3RIZWF2eUNvbXBvbmVudHMoY29kZSkuaW1wb3J0cztcblxuICByZXR1cm4gaW1wb3J0cy5zb21lKChlbnRyeSkgPT4gIWlzUmVsYXRpdmVJbXBvcnQoZW50cnkuc291cmNlKSAmJiAhaXNTdXBwb3J0ZWRIZWF2eUltcG9ydChlbnRyeS5zb3VyY2UpKTtcbn1cblxuZnVuY3Rpb24gZ2V0U3RhdGljU2VsZWN0b3IoYXJndW1lbnQ6IHN0cmluZyB8IG51bGwpOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFhcmd1bWVudCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgdHJpbW1lZCA9IGFyZ3VtZW50LnRyaW0oKTtcbiAgaWYgKHRyaW1tZWQubGVuZ3RoIDwgMikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgcXVvdGUgPSB0cmltbWVkWzBdO1xuICBjb25zdCBsYXN0Q2hhcmFjdGVyID0gdHJpbW1lZFt0cmltbWVkLmxlbmd0aCAtIDFdO1xuXG4gIGlmICgocXVvdGUgPT09ICdcXCcnIHx8IHF1b3RlID09PSAnXCInKSAmJiBsYXN0Q2hhcmFjdGVyID09PSBxdW90ZSkge1xuICAgIHJldHVybiB0cmltbWVkLnNsaWNlKDEsIC0xKTtcbiAgfVxuXG4gIGlmIChxdW90ZSA9PT0gJ2AnICYmIGxhc3RDaGFyYWN0ZXIgPT09ICdgJyAmJiAhdHJpbW1lZC5pbmNsdWRlcygnJHsnKSkge1xuICAgIHJldHVybiB0cmltbWVkLnNsaWNlKDEsIC0xKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBpc0NyaXRpY2FsU2VsZWN0b3Ioc2VsZWN0b3I6IHN0cmluZywgZXh0cmFDcml0aWNhbFNlbGVjdG9yczogc3RyaW5nW10gPSBbXSk6IGJvb2xlYW4ge1xuICBjb25zdCBub3JtYWxpemVkU2VsZWN0b3IgPSBzZWxlY3Rvci50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgaGFzRXhhY3RNYXRjaCA9XG4gICAgRVhBQ1RfQ1JJVElDQUxfU0VMRUNUT1JTLmhhcyhub3JtYWxpemVkU2VsZWN0b3IpIHx8XG4gICAgZXh0cmFDcml0aWNhbFNlbGVjdG9ycy5zb21lKChlbnRyeSkgPT4gZW50cnkudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IG5vcm1hbGl6ZWRTZWxlY3Rvcik7XG5cbiAgcmV0dXJuIGhhc0V4YWN0TWF0Y2ggfHwgQ1JJVElDQUxfU0VMRUNUT1JfUEFUVEVSTi50ZXN0KG5vcm1hbGl6ZWRTZWxlY3Rvcik7XG59XG5cbmZ1bmN0aW9uIHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbik6IHRzLkV4cHJlc3Npb24ge1xuICBpZiAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSB8fCB0cy5pc05vbk51bGxFeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcbiAgfVxuXG4gIGlmICh0cy5pc0FzRXhwcmVzc2lvbihleHByZXNzaW9uKSB8fCB0cy5pc1R5cGVBc3NlcnRpb25FeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcbiAgfVxuXG4gIHJldHVybiBleHByZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBnZXRSb290SWRlbnRpZmllck5hbWUoZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbik6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBub3JtYWxpemVkRXhwcmVzc2lvbiA9IHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbik7XG5cbiAgaWYgKHRzLmlzSWRlbnRpZmllcihub3JtYWxpemVkRXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gbm9ybWFsaXplZEV4cHJlc3Npb24udGV4dDtcbiAgfVxuXG4gIGlmIChcbiAgICB0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihub3JtYWxpemVkRXhwcmVzc2lvbikgfHxcbiAgICB0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKG5vcm1hbGl6ZWRFeHByZXNzaW9uKVxuICApIHtcbiAgICByZXR1cm4gZ2V0Um9vdElkZW50aWZpZXJOYW1lKG5vcm1hbGl6ZWRFeHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldFByb3BlcnR5TmFtZVRleHQobmFtZTogdHMuTWVtYmVyTmFtZSB8IHRzLlByb3BlcnR5TmFtZSk6IHN0cmluZyB8IG51bGwge1xuICBpZiAodHMuaXNJZGVudGlmaWVyKG5hbWUpIHx8IHRzLmlzUHJpdmF0ZUlkZW50aWZpZXIobmFtZSkpIHtcbiAgICByZXR1cm4gbmFtZS50ZXh0O1xuICB9XG5cbiAgaWYgKHRzLmlzU3RyaW5nTGl0ZXJhbChuYW1lKSB8fCB0cy5pc051bWVyaWNMaXRlcmFsKG5hbWUpKSB7XG4gICAgcmV0dXJuIG5hbWUudGV4dDtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZElkZW50aWZpZXIoZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gdHMuaXNJZGVudGlmaWVyKGV4cHJlc3Npb24pICYmIGV4cHJlc3Npb24udGV4dCA9PT0gJ3VuZGVmaW5lZCc7XG59XG5cbmZ1bmN0aW9uIGlzU3RhdGljSW5pdGlhbGl6ZXIoZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuICBjb25zdCBub3JtYWxpemVkRXhwcmVzc2lvbiA9IHVud3JhcEV4cHJlc3Npb24oZXhwcmVzc2lvbik7XG5cbiAgaWYgKFxuICAgIHRzLmlzU3RyaW5nTGl0ZXJhbExpa2Uobm9ybWFsaXplZEV4cHJlc3Npb24pIHx8XG4gICAgdHMuaXNOdW1lcmljTGl0ZXJhbChub3JtYWxpemVkRXhwcmVzc2lvbikgfHxcbiAgICBub3JtYWxpemVkRXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLlRydWVLZXl3b3JkIHx8XG4gICAgbm9ybWFsaXplZEV4cHJlc3Npb24ua2luZCA9PT0gdHMuU3ludGF4S2luZC5GYWxzZUtleXdvcmQgfHxcbiAgICBub3JtYWxpemVkRXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLk51bGxLZXl3b3JkIHx8XG4gICAgaXNVbmRlZmluZWRJZGVudGlmaWVyKG5vcm1hbGl6ZWRFeHByZXNzaW9uKVxuICApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmICh0cy5pc05vU3Vic3RpdHV0aW9uVGVtcGxhdGVMaXRlcmFsKG5vcm1hbGl6ZWRFeHByZXNzaW9uKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHRzLmlzUHJlZml4VW5hcnlFeHByZXNzaW9uKG5vcm1hbGl6ZWRFeHByZXNzaW9uKSkge1xuICAgIHJldHVybiBpc1N0YXRpY0luaXRpYWxpemVyKG5vcm1hbGl6ZWRFeHByZXNzaW9uLm9wZXJhbmQpO1xuICB9XG5cbiAgaWYgKHRzLmlzQXJyYXlMaXRlcmFsRXhwcmVzc2lvbihub3JtYWxpemVkRXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gbm9ybWFsaXplZEV4cHJlc3Npb24uZWxlbWVudHMuZXZlcnkoXG4gICAgICAoZWxlbWVudCkgPT4gIXRzLmlzU3ByZWFkRWxlbWVudChlbGVtZW50KSAmJiBpc1N0YXRpY0luaXRpYWxpemVyKGVsZW1lbnQpXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0cy5pc09iamVjdExpdGVyYWxFeHByZXNzaW9uKG5vcm1hbGl6ZWRFeHByZXNzaW9uKSkge1xuICAgIHJldHVybiBub3JtYWxpemVkRXhwcmVzc2lvbi5wcm9wZXJ0aWVzLmV2ZXJ5KChwcm9wZXJ0eSkgPT4ge1xuICAgICAgaWYgKHRzLmlzU3ByZWFkQXNzaWdubWVudChwcm9wZXJ0eSkgfHwgdHMuaXNTaG9ydGhhbmRQcm9wZXJ0eUFzc2lnbm1lbnQocHJvcGVydHkpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRzLmlzUHJvcGVydHlBc3NpZ25tZW50KHByb3BlcnR5KSkge1xuICAgICAgICBpZiAocHJvcGVydHkubmFtZSAmJiB0cy5pc0NvbXB1dGVkUHJvcGVydHlOYW1lKHByb3BlcnR5Lm5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGlzU3RhdGljSW5pdGlhbGl6ZXIocHJvcGVydHkuaW5pdGlhbGl6ZXIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGhhc1Vuc2FmZVRvcExldmVsU3RhdGVtZW50cyhzb3VyY2VGaWxlOiB0cy5Tb3VyY2VGaWxlKTogYm9vbGVhbiB7XG4gIHJldHVybiBzb3VyY2VGaWxlLnN0YXRlbWVudHMuc29tZSgoc3RhdGVtZW50KSA9PiB7XG4gICAgaWYgKHRzLmlzSW1wb3J0RGVjbGFyYXRpb24oc3RhdGVtZW50KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRzLmlzRXhwb3J0RGVjbGFyYXRpb24oc3RhdGVtZW50KSB8fFxuICAgICAgdHMuaXNJbnRlcmZhY2VEZWNsYXJhdGlvbihzdGF0ZW1lbnQpIHx8XG4gICAgICB0cy5pc1R5cGVBbGlhc0RlY2xhcmF0aW9uKHN0YXRlbWVudCkgfHxcbiAgICAgIHRzLmlzRnVuY3Rpb25EZWNsYXJhdGlvbihzdGF0ZW1lbnQpIHx8XG4gICAgICB0cy5pc0NsYXNzRGVjbGFyYXRpb24oc3RhdGVtZW50KSB8fFxuICAgICAgdHMuaXNFbXB0eVN0YXRlbWVudChzdGF0ZW1lbnQpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRzLmlzVmFyaWFibGVTdGF0ZW1lbnQoc3RhdGVtZW50KSkge1xuICAgICAgcmV0dXJuIHN0YXRlbWVudC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zLnNvbWUoXG4gICAgICAgIChkZWNsYXJhdGlvbikgPT4gZGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIgJiYgIWlzU3RhdGljSW5pdGlhbGl6ZXIoZGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaXNIaWdoRnJlcXVlbmN5QWRkRXZlbnRMaXN0ZW5lckNhbGwobm9kZTogdHMuQ2FsbEV4cHJlc3Npb24pOiBib29sZWFuIHtcbiAgY29uc3QgY2FsbGVlID0gdW53cmFwRXhwcmVzc2lvbihub2RlLmV4cHJlc3Npb24pO1xuICBpZiAoIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKGNhbGxlZSkgfHwgY2FsbGVlLm5hbWUudGV4dCAhPT0gJ2FkZEV2ZW50TGlzdGVuZXInKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgW2ZpcnN0QXJndW1lbnRdID0gbm9kZS5hcmd1bWVudHM7XG4gIHJldHVybiAoXG4gICAgISFmaXJzdEFyZ3VtZW50ICYmXG4gICAgdHMuaXNTdHJpbmdMaXRlcmFsKGZpcnN0QXJndW1lbnQpICYmXG4gICAgUklTS1lfSElHSF9GUkVRVUVOQ1lfRVZFTlRTLmhhcyhmaXJzdEFyZ3VtZW50LnRleHQpXG4gICk7XG59XG5cbmZ1bmN0aW9uIGhhc1Jpc2t5U3luY2hyb25vdXNCZWhhdmlvcihzb3VyY2VGaWxlOiB0cy5Tb3VyY2VGaWxlKTogYm9vbGVhbiB7XG4gIGxldCByaXNreSA9IGZhbHNlO1xuXG4gIGNvbnN0IHZpc2l0ID0gKG5vZGU6IHRzLk5vZGUpID0+IHtcbiAgICBpZiAocmlza3kpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodHMuaXNDYWxsRXhwcmVzc2lvbihub2RlKSkge1xuICAgICAgaWYgKGlzSGlnaEZyZXF1ZW5jeUFkZEV2ZW50TGlzdGVuZXJDYWxsKG5vZGUpKSB7XG4gICAgICAgIHJpc2t5ID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBjYWxsZWUgPSB1bndyYXBFeHByZXNzaW9uKG5vZGUuZXhwcmVzc2lvbik7XG5cbiAgICAgIGlmICh0cy5pc0lkZW50aWZpZXIoY2FsbGVlKSAmJiAoY2FsbGVlLnRleHQgPT09ICdmZXRjaCcgfHwgY2FsbGVlLnRleHQgPT09ICdnZXRDb21wdXRlZFN0eWxlJykpIHtcbiAgICAgICAgcmlza3kgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICh0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihjYWxsZWUpKSB7XG4gICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IGNhbGxlZS5uYW1lLnRleHQ7XG5cbiAgICAgICAgaWYgKHByb3BlcnR5TmFtZSA9PT0gJ2dldEJvdW5kaW5nQ2xpZW50UmVjdCcpIHtcbiAgICAgICAgICByaXNreSA9IHRydWU7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIChwcm9wZXJ0eU5hbWUgPT09ICdhZGQnIHx8IHByb3BlcnR5TmFtZSA9PT0gJ3JlbW92ZScgfHwgcHJvcGVydHlOYW1lID09PSAndG9nZ2xlJykgJiZcbiAgICAgICAgICB0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihjYWxsZWUuZXhwcmVzc2lvbikgJiZcbiAgICAgICAgICBjYWxsZWUuZXhwcmVzc2lvbi5uYW1lLnRleHQgPT09ICdjbGFzc0xpc3QnXG4gICAgICAgICkge1xuICAgICAgICAgIHJpc2t5ID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgKHByb3BlcnR5TmFtZSA9PT0gJ3NldFByb3BlcnR5JyB8fCBwcm9wZXJ0eU5hbWUgPT09ICdyZW1vdmVQcm9wZXJ0eScpICYmXG4gICAgICAgICAgdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24oY2FsbGVlLmV4cHJlc3Npb24pICYmXG4gICAgICAgICAgY2FsbGVlLmV4cHJlc3Npb24ubmFtZS50ZXh0ID09PSAnc3R5bGUnXG4gICAgICAgICkge1xuICAgICAgICAgIHJpc2t5ID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHMuaXNOZXdFeHByZXNzaW9uKG5vZGUpKSB7XG4gICAgICBjb25zdCBjb25zdHJ1Y3RvckV4cHJlc3Npb24gPSB1bndyYXBFeHByZXNzaW9uKG5vZGUuZXhwcmVzc2lvbik7XG4gICAgICBpZiAodHMuaXNJZGVudGlmaWVyKGNvbnN0cnVjdG9yRXhwcmVzc2lvbikgJiYgUklTS1lfQ09OU1RSVUNUT1JTLmhhcyhjb25zdHJ1Y3RvckV4cHJlc3Npb24udGV4dCkpIHtcbiAgICAgICAgcmlza3kgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKG5vZGUpKSB7XG4gICAgICBpZiAoUklTS1lfTEFZT1VUX1BST1BFUlRJRVMuaGFzKG5vZGUubmFtZS50ZXh0KSkge1xuICAgICAgICByaXNreSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgcm9vdElkZW50aWZpZXIgPSBnZXRSb290SWRlbnRpZmllck5hbWUobm9kZS5leHByZXNzaW9uKTtcbiAgICAgIGlmIChcbiAgICAgICAgcm9vdElkZW50aWZpZXIgPT09ICdkb2N1bWVudCcgJiZcbiAgICAgICAgKG5vZGUubmFtZS50ZXh0ID09PSAnYm9keScgfHwgbm9kZS5uYW1lLnRleHQgPT09ICdkb2N1bWVudEVsZW1lbnQnKVxuICAgICAgKSB7XG4gICAgICAgIHJpc2t5ID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocm9vdElkZW50aWZpZXIgJiYgUklTS1lfR0xPQkFMX1JPT1RTLmhhcyhyb290SWRlbnRpZmllcikpIHtcbiAgICAgICAgcmlza3kgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24obm9kZSkpIHtcbiAgICAgIGNvbnN0IGFyZ3VtZW50ID0gbm9kZS5hcmd1bWVudEV4cHJlc3Npb247XG4gICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPVxuICAgICAgICBhcmd1bWVudCAmJiAodHMuaXNTdHJpbmdMaXRlcmFsKGFyZ3VtZW50KSB8fCB0cy5pc051bWVyaWNMaXRlcmFsKGFyZ3VtZW50KSkgPyBhcmd1bWVudC50ZXh0IDogbnVsbDtcblxuICAgICAgaWYgKHByb3BlcnR5TmFtZSAmJiBSSVNLWV9MQVlPVVRfUFJPUEVSVElFUy5oYXMocHJvcGVydHlOYW1lKSkge1xuICAgICAgICByaXNreSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgcm9vdElkZW50aWZpZXIgPSBnZXRSb290SWRlbnRpZmllck5hbWUobm9kZS5leHByZXNzaW9uKTtcbiAgICAgIGlmIChyb290SWRlbnRpZmllciAmJiBSSVNLWV9HTE9CQUxfUk9PVFMuaGFzKHJvb3RJZGVudGlmaWVyKSkge1xuICAgICAgICByaXNreSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgdmlzaXQpO1xuICB9O1xuXG4gIHZpc2l0KHNvdXJjZUZpbGUpO1xuICByZXR1cm4gcmlza3k7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjaGVja1NhZmV0eShjb2RlOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGNvbnRleHQ6IFNhZmV0eUNoZWNrQ29udGV4dCk6IFNhZmV0eUNoZWNrUmVzdWx0IHtcbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY2xpZW50TW9kdWxlID0gaXNDbGllbnRNb2R1bGUoaWQpO1xuICBjb25zdCBzZWxlY3RvciA9IGdldFN0YXRpY1NlbGVjdG9yKGNvbnRleHQudHJpZ2dlckFyZ3VtZW50KTtcbiAgY29uc3QgZXh0cmFDcml0aWNhbFNlbGVjdG9ycyA9IGNvbnRleHQuY3JpdGljYWxTZWxlY3RvcnMgPz8gW107XG4gIGNvbnN0IHNvdXJjZUZpbGUgPSBjcmVhdGVTb3VyY2VGaWxlKGNvZGUsIGlkKTtcblxuICBpZiAoIWNsaWVudE1vZHVsZSkge1xuICAgIHJlYXNvbnMucHVzaCgnbm90IGEgY2xpZW50LXNpZGUgc291cmNlIG1vZHVsZScpO1xuICB9XG5cbiAgY29uc3QgZGV0ZWN0aW9uID0gZGV0ZWN0SGVhdnlDb21wb25lbnRzKGNvZGUpO1xuICBpZiAoIWRldGVjdGlvbi5oYXNTdXBwb3J0ZWRJbXBvcnRzKSB7XG4gICAgcmVhc29ucy5wdXNoKCdkb2VzIG5vdCBpbXBvcnQgZ3NhcCwgU2Nyb2xsVHJpZ2dlciwgb3IgbG90dGllLXdlYicpO1xuICB9XG5cbiAgaWYgKCFzZWxlY3Rvcikge1xuICAgIHJlYXNvbnMucHVzaCgndHJpZ2dlciBpcyBub3QgYSBzdGF0aWMgc2VsZWN0b3Igc3RyaW5nJyk7XG4gIH1cblxuICBpZiAoc2VsZWN0b3IgJiYgaXNDcml0aWNhbFNlbGVjdG9yKHNlbGVjdG9yLCBleHRyYUNyaXRpY2FsU2VsZWN0b3JzKSkge1xuICAgIHJlYXNvbnMucHVzaCgndHJpZ2dlciB0YXJnZXRzIGEgY3JpdGljYWwgb3IgZmlyc3QtcGFpbnQgc2VsZWN0b3InKTtcbiAgfVxuXG4gIGlmIChDUklUSUNBTF9QQVRIX1BBVFRFUk4udGVzdChpZCkgfHwgQ1JJVElDQUxfUEFUSF9QQVRURVJOLnRlc3QoY29udGV4dC5pbXBvcnRlcklkKSkge1xuICAgIHJlYXNvbnMucHVzaCgnbW9kdWxlIG9yIGltcG9ydGVyIHBhdGggbG9va3MgaGVyby1jcml0aWNhbCcpO1xuICB9XG5cbiAgaWYgKGhhc1NpZGVFZmZlY3RJbXBvcnQoc291cmNlRmlsZSkpIHtcbiAgICByZWFzb25zLnB1c2goJ2NvbnRhaW5zIHNpZGUtZWZmZWN0IGltcG9ydHMnKTtcbiAgfVxuXG4gIGlmIChoYXNVbnN1cHBvcnRlZEV4dGVybmFsSW1wb3J0KGNvZGUpKSB7XG4gICAgcmVhc29ucy5wdXNoKCdpbXBvcnRzIHVuc3VwcG9ydGVkIGV4dGVybmFsIGRlcGVuZGVuY2llcycpO1xuICB9XG5cbiAgaWYgKGhhc1Vuc2FmZVRvcExldmVsU3RhdGVtZW50cyhzb3VyY2VGaWxlKSkge1xuICAgIHJlYXNvbnMucHVzaCgnY29udGFpbnMgdG9wLWxldmVsIHNpZGUgZWZmZWN0cyBvciBjb250cm9sIGZsb3cnKTtcbiAgfVxuXG4gIGlmIChoYXNSaXNreVN5bmNocm9ub3VzQmVoYXZpb3Ioc291cmNlRmlsZSkpIHtcbiAgICByZWFzb25zLnB1c2goJ2NvbnRhaW5zIHJpc2t5IHN5bmNocm9ub3VzIHJ1bnRpbWUgYmVoYXZpb3InKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgaXNDbGllbnRNb2R1bGU6IGNsaWVudE1vZHVsZSxcbiAgICBpc1NhZmVUb0RlZmVyOiByZWFzb25zLmxlbmd0aCA9PT0gMCxcbiAgICByZWFzb25zXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgcmVhZEZpbGUsIHJlYWRkaXIgfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJztcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XG5pbXBvcnQgeyBJTVBPUlRfTElORV9QQVRURVJOLCBTSURFX0VGRkVDVF9JTVBPUlRfTElORV9QQVRURVJOLCBTVVBQT1JURURfSEVBVllfSU1QT1JUUyB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHtcbiAgRGV0ZWN0ZWRJbXBvcnQsXG4gIEhlYXZ5SW1wb3J0UmVwb3J0RW50cnksXG4gIEltcG9ydEJpbmRpbmcsXG4gIE1vZHVsZURldGVjdGlvblJlc3VsdCxcbiAgU3VwcG9ydGVkSGVhdnlQYWNrYWdlXG59IGZyb20gJy4vdHlwZXMuanMnO1xuXG5jb25zdCBTQ0FOTkVEX1NPVVJDRV9FWFRFTlNJT05TID0gbmV3IFNldChbXG4gICcuYXN0cm8nLFxuICAnLmpzJyxcbiAgJy5qc3gnLFxuICAnLm1qcycsXG4gICcubXRzJyxcbiAgJy50cycsXG4gICcudHN4J1xuXSk7XG5cbmNvbnN0IFNLSVBQRURfRElSRUNUT1JJRVMgPSBuZXcgU2V0KFtcbiAgJy5naXQnLFxuICAnLmlkZWEnLFxuICAnLnR1cmJvJyxcbiAgJy52c2NvZGUnLFxuICAnY292ZXJhZ2UnLFxuICAnZGlzdCcsXG4gICdub2RlX21vZHVsZXMnXG5dKTtcblxuZnVuY3Rpb24gbm9ybWFsaXplU3VwcG9ydGVkUGFja2FnZShzb3VyY2U6IHN0cmluZyk6IFN1cHBvcnRlZEhlYXZ5UGFja2FnZSB8IG51bGwge1xuICBpZiAoc291cmNlID09PSBTVVBQT1JURURfSEVBVllfSU1QT1JUUy5nc2FwKSB7XG4gICAgcmV0dXJuICdnc2FwJztcbiAgfVxuXG4gIGlmIChcbiAgICBzb3VyY2UgPT09IFNVUFBPUlRFRF9IRUFWWV9JTVBPUlRTLlNjcm9sbFRyaWdnZXIgfHxcbiAgICBzb3VyY2UgPT09IFNVUFBPUlRFRF9IRUFWWV9JTVBPUlRTWydTY3JvbGxUcmlnZ2VyKGRpc3QpJ11cbiAgKSB7XG4gICAgcmV0dXJuICdTY3JvbGxUcmlnZ2VyJztcbiAgfVxuXG4gIGlmIChzb3VyY2UgPT09IFNVUFBPUlRFRF9IRUFWWV9JTVBPUlRTWydsb3R0aWUtd2ViJ10pIHtcbiAgICByZXR1cm4gJ2xvdHRpZS13ZWInO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHBhcnNlTmFtZWRCaW5kaW5ncyhjbGF1c2U6IHN0cmluZyk6IEltcG9ydEJpbmRpbmdbXSB7XG4gIHJldHVybiBjbGF1c2VcbiAgICAuc3BsaXQoJywnKVxuICAgIC5tYXAoKGVudHJ5KSA9PiBlbnRyeS50cmltKCkpXG4gICAgLmZpbHRlcihCb29sZWFuKVxuICAgIC5tYXAoKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBbaW1wb3J0ZWROYW1lLCBhbGlhc10gPSBlbnRyeS5zcGxpdCgvXFxzK2FzXFxzKy9pKS5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50cmltKCkpO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBpbXBvcnRlZE5hbWUsXG4gICAgICAgIGxvY2FsTmFtZTogYWxpYXMgPz8gaW1wb3J0ZWROYW1lLFxuICAgICAgICBraW5kOiAnbmFtZWQnIGFzIGNvbnN0XG4gICAgICB9O1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUJpbmRpbmdzKHNwZWNpZmllckNsYXVzZTogc3RyaW5nKTogSW1wb3J0QmluZGluZ1tdIHtcbiAgY29uc3QgY2xhdXNlID0gc3BlY2lmaWVyQ2xhdXNlLnRyaW0oKTtcblxuICBpZiAoIWNsYXVzZSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGlmIChjbGF1c2Uuc3RhcnRzV2l0aCgnKiBhcyAnKSkge1xuICAgIGNvbnN0IGxvY2FsTmFtZSA9IGNsYXVzZS5zbGljZSg1KS50cmltKCk7XG5cbiAgICByZXR1cm4gW1xuICAgICAge1xuICAgICAgICBpbXBvcnRlZE5hbWU6ICcqJyxcbiAgICAgICAgbG9jYWxOYW1lLFxuICAgICAgICBraW5kOiAnbmFtZXNwYWNlJ1xuICAgICAgfVxuICAgIF07XG4gIH1cblxuICBpZiAoY2xhdXNlLnN0YXJ0c1dpdGgoJ3snKSAmJiBjbGF1c2UuZW5kc1dpdGgoJ30nKSkge1xuICAgIHJldHVybiBwYXJzZU5hbWVkQmluZGluZ3MoY2xhdXNlLnNsaWNlKDEsIC0xKSk7XG4gIH1cblxuICBjb25zdCBuYW1lZFN0YXJ0SW5kZXggPSBjbGF1c2UuaW5kZXhPZigneycpO1xuICBpZiAobmFtZWRTdGFydEluZGV4ID49IDApIHtcbiAgICBjb25zdCBkZWZhdWx0QmluZGluZyA9IGNsYXVzZS5zbGljZSgwLCBuYW1lZFN0YXJ0SW5kZXgpLnJlcGxhY2UoLywkLywgJycpLnRyaW0oKTtcbiAgICBjb25zdCBuYW1lZENsYXVzZSA9IGNsYXVzZS5zbGljZShuYW1lZFN0YXJ0SW5kZXgpLnRyaW0oKTtcblxuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIGltcG9ydGVkTmFtZTogJ2RlZmF1bHQnLFxuICAgICAgICBsb2NhbE5hbWU6IGRlZmF1bHRCaW5kaW5nLFxuICAgICAgICBraW5kOiAnZGVmYXVsdCdcbiAgICAgIH0sXG4gICAgICAuLi5wYXJzZU5hbWVkQmluZGluZ3MobmFtZWRDbGF1c2Uuc2xpY2UoMSwgLTEpKVxuICAgIF07XG4gIH1cblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGltcG9ydGVkTmFtZTogJ2RlZmF1bHQnLFxuICAgICAgbG9jYWxOYW1lOiBjbGF1c2UsXG4gICAgICBraW5kOiAnZGVmYXVsdCdcbiAgICB9XG4gIF07XG59XG5cbmZ1bmN0aW9uIHBhcnNlSW1wb3J0TGluZShsaW5lOiBzdHJpbmcpOiBEZXRlY3RlZEltcG9ydCB8IG51bGwge1xuICBpZiAoU0lERV9FRkZFQ1RfSU1QT1JUX0xJTkVfUEFUVEVSTi50ZXN0KGxpbmUpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2goSU1QT1JUX0xJTkVfUEFUVEVSTik7XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IFssIHNwZWNpZmllckNsYXVzZSwgc291cmNlXSA9IG1hdGNoO1xuXG4gIHJldHVybiB7XG4gICAgc291cmNlLFxuICAgIGJpbmRpbmdzOiBwYXJzZUJpbmRpbmdzKHNwZWNpZmllckNsYXVzZSksXG4gICAgc3VwcG9ydGVkUGFja2FnZTogbm9ybWFsaXplU3VwcG9ydGVkUGFja2FnZShzb3VyY2UpXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RIZWF2eUNvbXBvbmVudHMoY29kZTogc3RyaW5nKTogTW9kdWxlRGV0ZWN0aW9uUmVzdWx0IHtcbiAgY29uc3QgaW1wb3J0cyA9IGNvZGVcbiAgICAuc3BsaXQoL1xccj9cXG4vKVxuICAgIC5tYXAoKGxpbmUpID0+IHBhcnNlSW1wb3J0TGluZShsaW5lKSlcbiAgICAuZmlsdGVyKChlbnRyeSk6IGVudHJ5IGlzIERldGVjdGVkSW1wb3J0ID0+IGVudHJ5ICE9PSBudWxsKTtcblxuICBjb25zdCBzdXBwb3J0ZWRQYWNrYWdlcyA9IEFycmF5LmZyb20oXG4gICAgbmV3IFNldChcbiAgICAgIGltcG9ydHNcbiAgICAgICAgLm1hcCgoZW50cnkpID0+IGVudHJ5LnN1cHBvcnRlZFBhY2thZ2UpXG4gICAgICAgIC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgU3VwcG9ydGVkSGVhdnlQYWNrYWdlID0+IGVudHJ5ICE9PSBudWxsKVxuICAgIClcbiAgKTtcblxuICByZXR1cm4ge1xuICAgIHN1cHBvcnRlZFBhY2thZ2VzLFxuICAgIGltcG9ydHMsXG4gICAgaGFzU3VwcG9ydGVkSW1wb3J0czogc3VwcG9ydGVkUGFja2FnZXMubGVuZ3RoID4gMFxuICB9O1xufVxuXG5mdW5jdGlvbiBzaG91bGRTY2FuRmlsZShmaWxlUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBTQ0FOTkVEX1NPVVJDRV9FWFRFTlNJT05TLmhhcyhwYXRoLmV4dG5hbWUoZmlsZVBhdGgpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29sbGVjdFNvdXJjZUZpbGVzKHJvb3REaXI6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3Qgc291cmNlRmlsZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHBlbmRpbmdEaXJlY3RvcmllcyA9IFtyb290RGlyXTtcblxuICB3aGlsZSAocGVuZGluZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjdXJyZW50RGlyID0gcGVuZGluZ0RpcmVjdG9yaWVzLnBvcCgpO1xuICAgIGlmICghY3VycmVudERpcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHJlYWRkaXIoY3VycmVudERpciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgaWYgKGVudHJ5Lm5hbWUuc3RhcnRzV2l0aCgnLicpICYmIGVudHJ5Lm5hbWUgIT09ICcuYXN0cm8nKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSBwYXRoLmpvaW4oY3VycmVudERpciwgZW50cnkubmFtZSk7XG5cbiAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgIGlmIChTS0lQUEVEX0RJUkVDVE9SSUVTLmhhcyhlbnRyeS5uYW1lKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcGVuZGluZ0RpcmVjdG9yaWVzLnB1c2goYWJzb2x1dGVQYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChlbnRyeS5pc0ZpbGUoKSAmJiBzaG91bGRTY2FuRmlsZShhYnNvbHV0ZVBhdGgpKSB7XG4gICAgICAgIHNvdXJjZUZpbGVzLnB1c2goYWJzb2x1dGVQYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gc291cmNlRmlsZXMuc29ydCgobGVmdCwgcmlnaHQpID0+IGxlZnQubG9jYWxlQ29tcGFyZShyaWdodCkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2NhbkhlYXZ5SW1wb3J0UmVwb3J0KHJvb3REaXI6IHN0cmluZyk6IFByb21pc2U8SGVhdnlJbXBvcnRSZXBvcnRFbnRyeVtdPiB7XG4gIGNvbnN0IHNvdXJjZUZpbGVzID0gYXdhaXQgY29sbGVjdFNvdXJjZUZpbGVzKHJvb3REaXIpO1xuICBjb25zdCByZXBvcnQ6IEhlYXZ5SW1wb3J0UmVwb3J0RW50cnlbXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qgc291cmNlRmlsZSBvZiBzb3VyY2VGaWxlcykge1xuICAgIGNvbnN0IGNvZGUgPSBhd2FpdCByZWFkRmlsZShzb3VyY2VGaWxlLCAndXRmOCcpO1xuICAgIGNvbnN0IGRldGVjdGlvbiA9IGRldGVjdEhlYXZ5Q29tcG9uZW50cyhjb2RlKTtcblxuICAgIGlmICghZGV0ZWN0aW9uLmhhc1N1cHBvcnRlZEltcG9ydHMpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlcG9ydC5wdXNoKHtcbiAgICAgIGZpbGVQYXRoOiBzb3VyY2VGaWxlLFxuICAgICAgcGFja2FnZXM6IGRldGVjdGlvbi5zdXBwb3J0ZWRQYWNrYWdlc1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHJlcG9ydDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IERlZmVycmVkSW1wb3J0Q2FuZGlkYXRlLCBGZWF0aGVyUGVyZk9wdGlvbnMsIEltcG9ydEJpbmRpbmcgfSBmcm9tICcuL3R5cGVzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlRGVmZXJyZWRSZXBsYWNlbWVudChcbiAgY2FuZGlkYXRlOiBEZWZlcnJlZEltcG9ydENhbmRpZGF0ZSxcbiAgb3B0aW9uczogRmVhdGhlclBlcmZPcHRpb25zXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHsgc291cmNlLCBiaW5kaW5nLCBjYWxsRXhwcmVzc2lvblRleHQsIGNhbGxJbmRlbnQsIHRyaWdnZXJBcmd1bWVudCB9ID0gY2FuZGlkYXRlO1xuICBjb25zdCBmaXJzdEFyZ3VtZW50ID0gdHJpZ2dlckFyZ3VtZW50ID8/ICd1bmRlZmluZWQnO1xuICBjb25zdCBpbXBvcnRCaW5kaW5nID1cbiAgICBiaW5kaW5nLmtpbmQgPT09ICdkZWZhdWx0J1xuICAgICAgPyBgY29uc3QgeyBkZWZhdWx0OiAke2JpbmRpbmcubG9jYWxOYW1lfSB9ID0gYXdhaXQgaW1wb3J0KCR7SlNPTi5zdHJpbmdpZnkoc291cmNlKX0pO2BcbiAgICAgIDogYmluZGluZy5raW5kID09PSAnbmFtZXNwYWNlJ1xuICAgICAgICA/IGBjb25zdCAke2JpbmRpbmcubG9jYWxOYW1lfSA9IGF3YWl0IGltcG9ydCgke0pTT04uc3RyaW5naWZ5KHNvdXJjZSl9KTtgXG4gICAgICA6IGBjb25zdCB7ICR7YmluZGluZy5pbXBvcnRlZE5hbWV9OiAke2JpbmRpbmcubG9jYWxOYW1lfSB9ID0gYXdhaXQgaW1wb3J0KCR7SlNPTi5zdHJpbmdpZnkoc291cmNlKX0pO2A7XG5cbiAgY29uc3QgY2FsbEV4cHJlc3Npb24gPSBgJHtjYWxsRXhwcmVzc2lvblRleHR9O2A7XG4gIGNvbnN0IGxhYmVsID0gYCR7YmluZGluZy5sb2NhbE5hbWV9IGZyb20gJHtzb3VyY2V9YDtcblxuICByZXR1cm4gW1xuICAgIGAke2NhbGxJbmRlbnR9X19mZWF0aGVycGVyZkRlZmVyKHtgLFxuICAgIGAke2NhbGxJbmRlbnR9ICB0cmlnZ2VyOiAke2ZpcnN0QXJndW1lbnR9LGAsXG4gICAgYCR7Y2FsbEluZGVudH0gIGlkbGVUaW1lb3V0TXM6ICR7b3B0aW9ucy5pZGxlVGltZW91dE1zID8/IDE1MDB9LGAsXG4gICAgYCR7Y2FsbEluZGVudH0gIGxvb2thaGVhZFB4OiAke29wdGlvbnMubG9va2FoZWFkUHggPz8gMzAwfSxgLFxuICAgIGAke2NhbGxJbmRlbnR9ICBwb3N0TG9hZERlbGF5TXM6ICR7b3B0aW9ucy5wb3N0TG9hZERlbGF5TXMgPz8gMTUwMH0sYCxcbiAgICBgJHtjYWxsSW5kZW50fSAgaW50ZXJhY3Rpb25RdWlldFdpbmRvd01zOiAke29wdGlvbnMuaW50ZXJhY3Rpb25RdWlldFdpbmRvd01zID8/IDc1MH0sYCxcbiAgICBgJHtjYWxsSW5kZW50fSAgZGVidWc6ICR7b3B0aW9ucy5kZWJ1ZyA/ICd0cnVlJyA6ICdmYWxzZSd9LGAsXG4gICAgYCR7Y2FsbEluZGVudH0gIGxhYmVsOiAke0pTT04uc3RyaW5naWZ5KGxhYmVsKX1gLFxuICAgIGAke2NhbGxJbmRlbnR9fSwgYXN5bmMgKCkgPT4ge2AsXG4gICAgYCR7Y2FsbEluZGVudH0gICR7aW1wb3J0QmluZGluZ31gLFxuICAgIGAke2NhbGxJbmRlbnR9ICAke2NhbGxFeHByZXNzaW9ufWAsXG4gICAgYCR7Y2FsbEluZGVudH19KTtgXG4gIF07XG59XG5cbmludGVyZmFjZSBSZXBsYWNlbWVudCB7XG4gIHN0YXJ0OiBudW1iZXI7XG4gIGVuZDogbnVtYmVyO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHNhbWVCaW5kaW5nKGxlZnQ6IEltcG9ydEJpbmRpbmcsIHJpZ2h0OiBJbXBvcnRCaW5kaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgbGVmdC5raW5kID09PSByaWdodC5raW5kICYmXG4gICAgbGVmdC5sb2NhbE5hbWUgPT09IHJpZ2h0LmxvY2FsTmFtZSAmJlxuICAgIGxlZnQuaW1wb3J0ZWROYW1lID09PSByaWdodC5pbXBvcnRlZE5hbWVcbiAgKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0TmFtZWRCaW5kaW5nKGJpbmRpbmc6IEltcG9ydEJpbmRpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYmluZGluZy5pbXBvcnRlZE5hbWUgPT09IGJpbmRpbmcubG9jYWxOYW1lXG4gICAgPyBiaW5kaW5nLmltcG9ydGVkTmFtZVxuICAgIDogYCR7YmluZGluZy5pbXBvcnRlZE5hbWV9IGFzICR7YmluZGluZy5sb2NhbE5hbWV9YDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RhdGljSW1wb3J0KHNvdXJjZTogc3RyaW5nLCBiaW5kaW5nczogSW1wb3J0QmluZGluZ1tdKTogc3RyaW5nIHtcbiAgaWYgKGJpbmRpbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiAnJztcbiAgfVxuXG4gIGNvbnN0IGRlZmF1bHRCaW5kaW5nID0gYmluZGluZ3MuZmluZCgoYmluZGluZykgPT4gYmluZGluZy5raW5kID09PSAnZGVmYXVsdCcpO1xuICBjb25zdCBuYW1lc3BhY2VCaW5kaW5nID0gYmluZGluZ3MuZmluZCgoYmluZGluZykgPT4gYmluZGluZy5raW5kID09PSAnbmFtZXNwYWNlJyk7XG4gIGNvbnN0IG5hbWVkQmluZGluZ3MgPSBiaW5kaW5ncy5maWx0ZXIoKGJpbmRpbmcpID0+IGJpbmRpbmcua2luZCA9PT0gJ25hbWVkJyk7XG4gIGNvbnN0IGNsYXVzZXM6IHN0cmluZ1tdID0gW107XG5cbiAgaWYgKGRlZmF1bHRCaW5kaW5nKSB7XG4gICAgY2xhdXNlcy5wdXNoKGRlZmF1bHRCaW5kaW5nLmxvY2FsTmFtZSk7XG4gIH1cblxuICBpZiAobmFtZXNwYWNlQmluZGluZykge1xuICAgIGNsYXVzZXMucHVzaChgKiBhcyAke25hbWVzcGFjZUJpbmRpbmcubG9jYWxOYW1lfWApO1xuICB9XG5cbiAgaWYgKG5hbWVkQmluZGluZ3MubGVuZ3RoID4gMCkge1xuICAgIGNsYXVzZXMucHVzaChgeyAke25hbWVkQmluZGluZ3MubWFwKChiaW5kaW5nKSA9PiBmb3JtYXROYW1lZEJpbmRpbmcoYmluZGluZykpLmpvaW4oJywgJyl9IH1gKTtcbiAgfVxuXG4gIHJldHVybiBgaW1wb3J0ICR7Y2xhdXNlcy5qb2luKCcsICcpfSBmcm9tICR7SlNPTi5zdHJpbmdpZnkoc291cmNlKX07YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZm9ybUNvZGUoXG4gIGNvZGU6IHN0cmluZyxcbiAgY2FuZGlkYXRlczogRGVmZXJyZWRJbXBvcnRDYW5kaWRhdGVbXSxcbiAgb3B0aW9uczogRmVhdGhlclBlcmZPcHRpb25zID0ge31cbik6IHN0cmluZyB7XG4gIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBjb2RlO1xuICB9XG5cbiAgY29uc3QgcmVwbGFjZW1lbnRzOiBSZXBsYWNlbWVudFtdID0gW107XG4gIGNvbnN0IGdyb3VwZWRDYW5kaWRhdGVzID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkSW1wb3J0Q2FuZGlkYXRlW10+KCk7XG5cbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgIGNvbnN0IGltcG9ydEtleSA9IGAke2NhbmRpZGF0ZS5pbXBvcnRTdGFydH06JHtjYW5kaWRhdGUuaW1wb3J0RW5kfWA7XG4gICAgY29uc3QgaW1wb3J0Q2FuZGlkYXRlcyA9IGdyb3VwZWRDYW5kaWRhdGVzLmdldChpbXBvcnRLZXkpID8/IFtdO1xuICAgIGltcG9ydENhbmRpZGF0ZXMucHVzaChjYW5kaWRhdGUpO1xuICAgIGdyb3VwZWRDYW5kaWRhdGVzLnNldChpbXBvcnRLZXksIGltcG9ydENhbmRpZGF0ZXMpO1xuICB9XG5cbiAgZm9yIChjb25zdCBpbXBvcnRDYW5kaWRhdGVzIG9mIGdyb3VwZWRDYW5kaWRhdGVzLnZhbHVlcygpKSB7XG4gICAgY29uc3QgW2ZpcnN0Q2FuZGlkYXRlXSA9IGltcG9ydENhbmRpZGF0ZXM7XG4gICAgY29uc3QgcmVtYWluaW5nQmluZGluZ3MgPSBmaXJzdENhbmRpZGF0ZS5pbXBvcnRCaW5kaW5ncy5maWx0ZXIoXG4gICAgICAoYmluZGluZykgPT4gIWltcG9ydENhbmRpZGF0ZXMuc29tZSgoY2FuZGlkYXRlKSA9PiBzYW1lQmluZGluZyhiaW5kaW5nLCBjYW5kaWRhdGUuYmluZGluZykpXG4gICAgKTtcbiAgICByZXBsYWNlbWVudHMucHVzaCh7XG4gICAgICBzdGFydDogZmlyc3RDYW5kaWRhdGUuaW1wb3J0U3RhcnQsXG4gICAgICBlbmQ6IGZpcnN0Q2FuZGlkYXRlLmltcG9ydEVuZCxcbiAgICAgIHRleHQ6IGNyZWF0ZVN0YXRpY0ltcG9ydChmaXJzdENhbmRpZGF0ZS5zb3VyY2UsIHJlbWFpbmluZ0JpbmRpbmdzKVxuICAgIH0pO1xuICB9XG5cbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgIHJlcGxhY2VtZW50cy5wdXNoKHtcbiAgICAgIHN0YXJ0OiBjYW5kaWRhdGUuY2FsbFN0YXJ0LFxuICAgICAgZW5kOiBjYW5kaWRhdGUuY2FsbEVuZCxcbiAgICAgIHRleHQ6IGNyZWF0ZURlZmVycmVkUmVwbGFjZW1lbnQoY2FuZGlkYXRlLCBvcHRpb25zKS5qb2luKCdcXG4nKVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gY29kZTtcbiAgfVxuXG4gIHJlcGxhY2VtZW50cy5zb3J0KChsZWZ0LCByaWdodCkgPT4gcmlnaHQuc3RhcnQgLSBsZWZ0LnN0YXJ0KTtcblxuICBsZXQgdHJhbnNmb3JtZWQgPSBjb2RlO1xuICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgIHRyYW5zZm9ybWVkID1cbiAgICAgIHRyYW5zZm9ybWVkLnNsaWNlKDAsIHJlcGxhY2VtZW50LnN0YXJ0KSArXG4gICAgICByZXBsYWNlbWVudC50ZXh0ICtcbiAgICAgIHRyYW5zZm9ybWVkLnNsaWNlKHJlcGxhY2VtZW50LmVuZCk7XG4gIH1cblxuICBjb25zdCBydW50aW1lSW1wb3J0ID0gYGltcG9ydCB7IGRlZmVyTW9kdWxlRW50cnkgYXMgX19mZWF0aGVycGVyZkRlZmVyIH0gZnJvbSAndmlydHVhbDpmZWF0aGVycGVyZi1ydW50aW1lJztgO1xuICByZXR1cm4gYCR7cnVudGltZUltcG9ydH1cXG5cXG4ke3RyYW5zZm9ybWVkfWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTRaLE9BQU9BLFdBQVU7QUFDN2EsU0FBUyxpQkFBQUMsc0JBQXFCOzs7QUNEYyxTQUFBLGdCQUFBO0FBQzVDLFNBQVMscUJBQXFCO0FBQzlCLE9BQU9DLFdBQVU7QUFDakIsU0FBUyxlQUFlLHFCQUFxQjs7O0FDSGhCLE9BQUEsVUFBQTtBQUM3QixPQUFPLFFBQVE7QUFrQmYsU0FBUyxjQUFjLElBQVU7QUFDL0IsUUFBTSxZQUFZLEtBQUssUUFBUSxFQUFFLEVBQUUsWUFBVztBQUU5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LFFBQVEsa0JBQWtCLGdCQUFnQjtBQUVoRSxJQUFPLHNCQUFRO0FBQUEsRUFDYixTQUFTO0FBQUEsSUFDUCxZQUFZO0FBQUEsTUFDVixTQUFTLENBQUMsYUFBYTtBQUFBLElBQ3pCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxNQUFNQSxNQUFLLEtBQUssVUFBVSxnQkFBZ0IsU0FBUyxnQkFBZ0IsUUFBUSxVQUFVO0FBQUEsSUFDdkY7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7IiwKICAibmFtZXMiOiBbInBhdGgiLCAiZmlsZVVSTFRvUGF0aCIsICJwYXRoIiwgInBhdGgiLCAidHMiLCAicGFyc2VOYW1lZEJpbmRpbmdzIiwgImdldFNjcmlwdEtpbmQiLCAicGF0aCIsICJ0cyIsICJ1bndyYXBFeHByZXNzaW9uIiwgInRzIiwgInVud3JhcEV4cHJlc3Npb24iLCAicGF0aCIsICJpc1JlbGF0aXZlSW1wb3J0IiwgIl9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwiLCAicGF0aCIsICJmaWxlVVJMVG9QYXRoIl0KfQo=
