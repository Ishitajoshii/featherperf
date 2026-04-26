import { CLIENT_MODULE_EXTENSIONS } from './constants.js';
import { detectHeavyComponents } from './detector.js';
import type { SafetyCheckResult } from './types.js';

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

export function checkSafety(code: string, id: string): SafetyCheckResult {
  const reasons: string[] = [];
  const clientModule = isClientModule(id);

  if (!clientModule) {
    reasons.push('not a client-side source module');
  }

  const detection = detectHeavyComponents(code);
  if (!detection.hasSupportedImports) {
    reasons.push('does not import gsap, ScrollTrigger, or lottie-web');
  }

  if (hasUnsafeTopLevelStatements(code)) {
    reasons.push('contains top-level side effects or control flow');
  }

  return {
    isClientModule: clientModule,
    isSafeToDefer: reasons.length === 0,
    reasons
  };
}
