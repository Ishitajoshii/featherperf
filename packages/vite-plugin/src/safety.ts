import { CLIENT_MODULE_EXTENSIONS } from './constants.js';
import { detectHeavyComponents } from './detector.js';
import type { SafetyCheckContext, SafetyCheckResult } from './types.js';

const TOP_LEVEL_BLOCK_PATTERNS = [
  /\b(?:document|window|localStorage|sessionStorage|history|location)\s*\./,
  /\bfetch\s*\(/,
  /\bnew\s+[A-Za-z_$][\w$]*\s*\(/,
  /\bawait\s+/,
  /\b(?:if|for|while|switch|try)\b/,
  /\baddEventListener\s*\(/,
  /=\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\(/,
  /^\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/
] as const;

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

const RISKY_SYNC_BEHAVIOR_PATTERNS = [
  /\bgetBoundingClientRect\s*\(/,
  /\bgetComputedStyle\s*\(/,
  /\b(?:offset|client|scroll)(?:Width|Height|Top|Left)\b/,
  /\bdocument\.(?:body|documentElement)\b/,
  /\bclassList\.(?:add|remove|toggle)\s*\(/,
  /\bstyle\.(?:setProperty|removeProperty)\s*\(/,
  /\b(?:ResizeObserver|MutationObserver|XMLHttpRequest)\b/,
  /\b(?:localStorage|sessionStorage|history|location)\b/,
  /\bfetch\s*\(/,
  /\baddEventListener\s*\(\s*['"](?:scroll|resize|mousemove|pointermove|touchmove)['"]/
] as const;

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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

function hasUnsafeTopLevelStatements(code: string): boolean {
  const lines = stripComments(code).split(/\r?\n/);
  let braceDepth = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
      continue;
    }

    if (braceDepth === 0) {
      const isDeclaration =
        /^(?:import|export\s+type|type|interface|function|class|const|let|var|enum)\b/.test(
          trimmedLine
        ) || trimmedLine === '}';

      if (!isDeclaration && TOP_LEVEL_BLOCK_PATTERNS.some((pattern) => pattern.test(trimmedLine))) {
        return true;
      }
    }

    braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
  }

  return false;
}

function hasSideEffectImport(code: string): boolean {
  return stripComments(code)
    .split(/\r?\n/)
    .some((line) => /^\s*import\s+['"][^'"]+['"]\s*;?\s*$/.test(line));
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

function isCriticalSelector(selector: string): boolean {
  const normalizedSelector = selector.trim().toLowerCase();
  return EXACT_CRITICAL_SELECTORS.has(normalizedSelector) || CRITICAL_SELECTOR_PATTERN.test(normalizedSelector);
}

function hasRiskySynchronousBehavior(code: string): boolean {
  return RISKY_SYNC_BEHAVIOR_PATTERNS.some((pattern) => pattern.test(code));
}

export function checkSafety(code: string, id: string, context: SafetyCheckContext): SafetyCheckResult {
  const reasons: string[] = [];
  const clientModule = isClientModule(id);
  const selector = getStaticSelector(context.triggerArgument);

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

  if (selector && isCriticalSelector(selector)) {
    reasons.push('trigger targets a critical or first-paint selector');
  }

  if (CRITICAL_PATH_PATTERN.test(id) || CRITICAL_PATH_PATTERN.test(context.importerId)) {
    reasons.push('module or importer path looks hero-critical');
  }

  if (hasSideEffectImport(code)) {
    reasons.push('contains side-effect imports');
  }

  if (hasUnsupportedExternalImport(code)) {
    reasons.push('imports unsupported external dependencies');
  }

  if (hasUnsafeTopLevelStatements(code)) {
    reasons.push('contains top-level side effects or control flow');
  }

  if (hasRiskySynchronousBehavior(code)) {
    reasons.push('contains risky synchronous runtime behavior');
  }

  return {
    isClientModule: clientModule,
    isSafeToDefer: reasons.length === 0,
    reasons
  };
}
