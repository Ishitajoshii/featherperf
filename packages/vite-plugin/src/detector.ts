import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { IMPORT_LINE_PATTERN, SIDE_EFFECT_IMPORT_LINE_PATTERN, SUPPORTED_HEAVY_IMPORTS } from './constants.js';
import type {
  DetectedImport,
  HeavyImportReportEntry,
  ImportBinding,
  ModuleDetectionResult,
  SupportedHeavyPackage
} from './types.js';

const SCANNED_SOURCE_EXTENSIONS = new Set([
  '.astro',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx'
]);

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.turbo',
  '.vscode',
  'coverage',
  'dist',
  'node_modules'
]);

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

function shouldScanFile(filePath: string): boolean {
  return SCANNED_SOURCE_EXTENSIONS.has(path.extname(filePath));
}

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const sourceFiles: string[] = [];
  const pendingDirectories = [rootDir];

  while (pendingDirectories.length > 0) {
    const currentDir = pendingDirectories.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.astro') {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        pendingDirectories.push(absolutePath);
        continue;
      }

      if (entry.isFile() && shouldScanFile(absolutePath)) {
        sourceFiles.push(absolutePath);
      }
    }
  }

  return sourceFiles.sort((left, right) => left.localeCompare(right));
}

export async function scanHeavyImportReport(rootDir: string): Promise<HeavyImportReportEntry[]> {
  const sourceFiles = await collectSourceFiles(rootDir);
  const report: HeavyImportReportEntry[] = [];

  for (const sourceFile of sourceFiles) {
    const code = await readFile(sourceFile, 'utf8');
    const detection = detectHeavyComponents(code);

    if (!detection.hasSupportedImports) {
      continue;
    }

    report.push({
      filePath: sourceFile,
      packages: detection.supportedPackages
    });
  }

  return report;
}
