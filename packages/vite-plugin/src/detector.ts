import { IMPORT_LINE_PATTERN, SIDE_EFFECT_IMPORT_LINE_PATTERN, SUPPORTED_HEAVY_IMPORTS } from './constants';
import type { DetectedImport, ImportBinding, ModuleDetectionResult, SupportedHeavyPackage } from './types';

function normalizeSupportedPackage(source: string): SupportedHeavyPackage | null {
  if (source === SUPPORTED_HEAVY_IMPORTS.gsap) {
    return 'gsap';
  }

  if (
    source === SUPPORTED_HEAVY_IMPORTS.ScrollTrigger ||
    source === SUPPORTED_HEAVY_IMPORTS['ScrollTrigger(dist)']
  ) {
    return 'ScrollTrigger';
  }

  if (source === SUPPORTED_HEAVY_IMPORTS['lottie-web']) {
    return 'lottie-web';
  }

  return null;
}

function parseNamedBindings(clause: string): ImportBinding[] {
  return clause
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [importedName, alias] = entry.split(/\s+as\s+/i).map((value) => value.trim());

      return {
        importedName,
        localName: alias ?? importedName,
        kind: 'named' as const
      };
    });
}

function parseBindings(specifierClause: string): ImportBinding[] {
  const clause = specifierClause.trim();

  if (!clause) {
    return [];
  }

  if (clause.startsWith('* as ')) {
    const localName = clause.slice(5).trim();

    return [
      {
        importedName: '*',
        localName,
        kind: 'namespace'
      }
    ];
  }

  if (clause.startsWith('{') && clause.endsWith('}')) {
    return parseNamedBindings(clause.slice(1, -1));
  }

  const namedStartIndex = clause.indexOf('{');
  if (namedStartIndex >= 0) {
    const defaultBinding = clause.slice(0, namedStartIndex).replace(/,$/, '').trim();
    const namedClause = clause.slice(namedStartIndex).trim();

    return [
      {
        importedName: 'default',
        localName: defaultBinding,
        kind: 'default'
      },
      ...parseNamedBindings(namedClause.slice(1, -1))
    ];
  }

  return [
    {
      importedName: 'default',
      localName: clause,
      kind: 'default'
    }
  ];
}

function parseImportLine(line: string): DetectedImport | null {
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

export function detectHeavyComponents(code: string): ModuleDetectionResult {
  const imports = code
    .split(/\r?\n/)
    .map((line) => parseImportLine(line))
    .filter((entry): entry is DetectedImport => entry !== null);

  const supportedPackages = Array.from(
    new Set(
      imports
        .map((entry) => entry.supportedPackage)
        .filter((entry): entry is SupportedHeavyPackage => entry !== null)
    )
  );

  return {
    supportedPackages,
    imports,
    hasSupportedImports: supportedPackages.length > 0
  };
}
