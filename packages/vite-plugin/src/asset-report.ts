import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  AssetReportEntry,
  AssetReportResult,
  FeatherPerfAssetReportOptions,
  FeatherPerfOptions
} from './types.js';

type MinimalOutputBundle = Record<
  string,
  | {
      type: 'asset';
      source: string | Uint8Array;
    }
  | {
      type: 'chunk';
      code: string;
    }
>;

const DEFAULT_REPORT_OPTIONS: Required<FeatherPerfAssetReportOptions> = {
  enabled: false,
  emitJson: false,
  outputFile: 'featherperf-assets.json',
  includePublic: true,
  includeHtmlReferences: true,
  includeChunks: true,
  largeAssetThresholdKb: 500,
  topAssetCount: 10
};

const CSS_URL_PATTERN = /url\((['"]?)(.*?)\1\)/g;
const HTML_ASSET_PATTERN =
  /\s(?:src|href|poster|srcset)=["']([^"']+)["']|<source\b[^>]*\bsrcset=["']([^"']+)["']/gi;

const ASSET_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.glb',
  '.gltf',
  '.jpeg',
  '.jpg',
  '.json',
  '.lottie',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.otf',
  '.png',
  '.svg',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2'
]);

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

export function getAssetReportOptions(options: FeatherPerfOptions): Required<FeatherPerfAssetReportOptions> | null {
  if (options.report === true) {
    return {
      ...DEFAULT_REPORT_OPTIONS,
      enabled: true
    };
  }

  if (!options.report || options.report.enabled === false) {
    return null;
  }

  return {
    ...DEFAULT_REPORT_OPTIONS,
    ...options.report,
    enabled: true
  };
}

function shouldReportPath(filePath: string): boolean {
  return ASSET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function getAssetType(filePath: string): string {
  return path.extname(filePath).replace(/^\./, '').toLowerCase() || 'unknown';
}

function getSourceSize(source: string | Uint8Array): number {
  return typeof source === 'string'
    ? Buffer.byteLength(source)
    : source.byteLength;
}

function normalizeUrlCandidate(value: string): string | null {
  const trimmedValue = value.trim();

  if (
    !trimmedValue ||
    trimmedValue.startsWith('data:') ||
    trimmedValue.startsWith('blob:') ||
    trimmedValue.startsWith('http://') ||
    trimmedValue.startsWith('https://') ||
    trimmedValue.startsWith('//') ||
    trimmedValue.startsWith('#')
  ) {
    return null;
  }

  return trimmedValue.split('?')[0].split('#')[0];
}

function collectSrcsetUrls(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .map((entry) => normalizeUrlCandidate(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function collectHtmlAssetReferences(html: string): string[] {
  const references = new Set<string>();

  for (const match of html.matchAll(HTML_ASSET_PATTERN)) {
    const value = match[1] ?? match[2];
    if (!value) {
      continue;
    }

    const urls = value.includes(',') ? collectSrcsetUrls(value) : [normalizeUrlCandidate(value)].filter(Boolean);
    for (const url of urls) {
      if (url && shouldReportPath(url)) {
        references.add(url);
      }
    }
  }

  for (const match of html.matchAll(CSS_URL_PATTERN)) {
    const url = normalizeUrlCandidate(match[2]);
    if (url && shouldReportPath(url)) {
      references.add(url);
    }
  }

  return Array.from(references).sort((left, right) => left.localeCompare(right));
}

async function collectPublicAssets(publicDir: string): Promise<AssetReportEntry[]> {
  const entries: AssetReportEntry[] = [];
  const pendingDirectories = [publicDir];

  while (pendingDirectories.length > 0) {
    const currentDir = pendingDirectories.pop();
    if (!currentDir) {
      continue;
    }

    let children;
    try {
      children = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const child of children) {
      const absolutePath = path.join(currentDir, child.name);

      if (child.isDirectory()) {
        pendingDirectories.push(absolutePath);
        continue;
      }

      if (!child.isFile() || !shouldReportPath(absolutePath)) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      entries.push({
        path: `/${normalizeSlashes(path.relative(publicDir, absolutePath))}`,
        source: 'public',
        type: getAssetType(absolutePath),
        bytes: fileStat.size
      });
    }
  }

  return entries;
}

function collectBundleAssets(bundle: MinimalOutputBundle, includeChunks: boolean): AssetReportEntry[] {
  const entries: AssetReportEntry[] = [];

  for (const [fileName, output] of Object.entries(bundle)) {
    if (fileName.endsWith('.map')) {
      continue;
    }

    if (output.type === 'asset') {
      entries.push({
        path: normalizeSlashes(fileName),
        source: 'bundle',
        type: getAssetType(fileName),
        bytes: getSourceSize(output.source)
      });
      continue;
    }

    if (includeChunks) {
      entries.push({
        path: normalizeSlashes(fileName),
        source: 'chunk',
        type: 'js',
        bytes: Buffer.byteLength(output.code)
      });
    }
  }

  return entries;
}

async function collectHtmlReferencedAssets(
  htmlReferences: Set<string>,
  publicDir: string | null,
  includeHtmlReferences: boolean
): Promise<AssetReportEntry[]> {
  if (!includeHtmlReferences) {
    return [];
  }

  const entries: AssetReportEntry[] = [];

  for (const reference of htmlReferences) {
    const publicPath = reference.startsWith('/') ? reference : `/${reference}`;
    const publicFilePath = publicDir
      ? path.join(publicDir, publicPath.replace(/^\//, ''))
      : null;

    if (publicFilePath) {
      try {
        const fileStat = await stat(publicFilePath);
        entries.push({
          path: publicPath,
          source: 'html-public',
          type: getAssetType(publicPath),
          bytes: fileStat.size,
          referencedByHtml: true
        });
        continue;
      } catch {
        // Keep unresolved references visible in the report.
      }
    }

    entries.push({
      path: publicPath,
      source: 'html-reference',
      type: getAssetType(publicPath),
      bytes: null,
      referencedByHtml: true
    });
  }

  return entries;
}

function mergeEntries(entries: AssetReportEntry[]): AssetReportEntry[] {
  const merged = new Map<string, AssetReportEntry>();

  for (const entry of entries) {
    const key = `${entry.source}:${entry.path}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, entry);
      continue;
    }

    existing.referencedByHtml ||= entry.referencedByHtml;
    if (existing.bytes === null && entry.bytes !== null) {
      existing.bytes = entry.bytes;
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    const leftBytes = left.bytes ?? -1;
    const rightBytes = right.bytes ?? -1;
    if (leftBytes !== rightBytes) {
      return rightBytes - leftBytes;
    }

    return left.path.localeCompare(right.path);
  });
}

export async function createAssetReport(input: {
  bundle: MinimalOutputBundle;
  htmlReferences: Set<string>;
  publicDir: string | null;
  options: Required<FeatherPerfAssetReportOptions>;
}): Promise<AssetReportResult> {
  const entries = mergeEntries([
    ...collectBundleAssets(input.bundle, input.options.includeChunks),
    ...(input.options.includePublic && input.publicDir
      ? await collectPublicAssets(input.publicDir)
      : []),
    ...(await collectHtmlReferencedAssets(
      input.htmlReferences,
      input.publicDir,
      input.options.includeHtmlReferences
    ))
  ]);

  const knownEntries = entries.filter((entry) => entry.bytes !== null);
  const largeAssetThresholdBytes = input.options.largeAssetThresholdKb * 1024;
  const largeAssets = knownEntries.filter((entry) => (entry.bytes ?? 0) >= largeAssetThresholdBytes);

  return {
    options: input.options,
    entries,
    summary: {
      totalKnownBytes: knownEntries.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      knownAssetCount: knownEntries.length,
      unknownAssetCount: entries.length - knownEntries.length,
      largestAssets: knownEntries.slice(0, input.options.topAssetCount),
      largeAssets
    }
  };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'unknown size';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

export function formatAssetReportWarnings(report: AssetReportResult): string[] {
  if (report.summary.largeAssets.length === 0) {
    return [];
  }

  return report.summary.largeAssets
    .slice(0, report.options.topAssetCount)
    .map((entry) => {
      const htmlLabel = entry.referencedByHtml ? ', html-referenced' : '';
      return `large ${entry.source} ${entry.type} asset: ${entry.path} (${formatBytes(entry.bytes)}${htmlLabel})`;
    });
}
