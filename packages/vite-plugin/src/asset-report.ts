import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  AssetReportEntry,
  AssetReportResult,
  AssetReference,
  AssetPriority,
  FeatherPerfAssetManifestOptions,
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

const DEFAULT_MANIFEST_OPTIONS: Required<FeatherPerfAssetManifestOptions> = {
  enabled: false,
  outputFile: 'featherperf-assets.json',
  includePublic: true,
  includeHtmlReferences: true,
  includeChunks: false
};

const CSS_URL_PATTERN = /url\((['"]?)(.*?)\1\)/g;
const HTML_TAG_PATTERN = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
const HTML_ATTRIBUTE_PATTERN = /([:@a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

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

export function getAssetManifestOptions(options: FeatherPerfOptions): Required<FeatherPerfAssetManifestOptions> | null {
  if (options.manifest === true) {
    return {
      ...DEFAULT_MANIFEST_OPTIONS,
      enabled: true
    };
  }

  if (!options.manifest || options.manifest.enabled === false) {
    return null;
  }

  return {
    ...DEFAULT_MANIFEST_OPTIONS,
    ...options.manifest,
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

function parseAttributes(rawAttributes: string): Map<string, string> {
  const attributes = new Map<string, string>();

  for (const match of rawAttributes.matchAll(HTML_ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase();
    if (!name) {
      continue;
    }

    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function getReferencePriority(
  tagName: string,
  attribute: string,
  attributes: Map<string, string>
): { priority: AssetPriority; reason: string } {
  const rel = attributes.get('rel')?.toLowerCase() ?? '';
  const fetchPriority = attributes.get('fetchpriority')?.toLowerCase() ?? '';
  const loading = attributes.get('loading')?.toLowerCase() ?? '';

  if (rel.split(/\s+/).includes('preload') || rel.split(/\s+/).includes('modulepreload')) {
    return { priority: 'critical', reason: 'rel=preload' };
  }

  if (fetchPriority === 'high') {
    return { priority: 'critical', reason: 'fetchpriority=high' };
  }

  if (loading === 'eager') {
    return { priority: 'critical', reason: 'loading=eager' };
  }

  if (loading === 'lazy') {
    return { priority: 'lazy', reason: 'loading=lazy' };
  }

  if (attribute === 'poster' || tagName === 'source') {
    return { priority: 'early', reason: `${tagName}.${attribute}` };
  }

  return { priority: 'early', reason: `${tagName}.${attribute}` };
}

function createReference(input: {
  path: string;
  kind: AssetReference['kind'];
  tagName: string;
  attribute: string;
  attributes: Map<string, string>;
  fallbackPriority?: AssetPriority;
  fallbackReason?: string;
}): AssetReference {
  const priority =
    input.fallbackPriority && input.fallbackReason
      ? { priority: input.fallbackPriority, reason: input.fallbackReason }
      : getReferencePriority(input.tagName, input.attribute, input.attributes);

  return {
    path: input.path,
    kind: input.kind,
    tagName: input.tagName,
    attribute: input.attribute,
    priority: priority.priority,
    reason: priority.reason
  };
}

export function collectHtmlAssetReferenceRecords(html: string): AssetReference[] {
  const references = new Map<string, AssetReference>();

  for (const tagMatch of html.matchAll(HTML_TAG_PATTERN)) {
    const tagName = tagMatch[1].toLowerCase();
    const attributes = parseAttributes(tagMatch[2] ?? '');

    for (const attribute of ['src', 'href', 'poster']) {
      const value = attributes.get(attribute);
      const url = value ? normalizeUrlCandidate(value) : null;
      if (!url || !shouldReportPath(url)) {
        continue;
      }

      const kind =
        attribute === 'poster'
          ? 'html-poster'
          : attributes.get('rel')?.toLowerCase().split(/\s+/).includes('preload')
            ? 'html-preload'
            : 'html-src';
      references.set(
        `${tagName}:${attribute}:${url}`,
        createReference({
          path: url,
          kind,
          tagName,
          attribute,
          attributes
        })
      );
    }

    const srcset = attributes.get('srcset');
    if (srcset) {
      for (const url of collectSrcsetUrls(srcset)) {
        if (!shouldReportPath(url)) {
          continue;
        }

        references.set(
          `${tagName}:srcset:${url}`,
          createReference({
            path: url,
            kind: 'html-srcset',
            tagName,
            attribute: 'srcset',
            attributes
          })
        );
      }
    }

    const style = attributes.get('style');
    if (style) {
      for (const url of extractCssUrls(style)) {
        if (!shouldReportPath(url)) {
          continue;
        }

        references.set(
          `${tagName}:style:${url}`,
          createReference({
            path: url,
            kind: 'css-url',
            tagName,
            attribute: 'style',
            attributes,
            fallbackPriority: 'early',
            fallbackReason: 'inline css url'
          })
        );
      }
    }
  }

  return Array.from(references.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function extractCssUrls(value: string): string[] {
  const urls: string[] = [];

  for (const match of value.matchAll(CSS_URL_PATTERN)) {
    const url = normalizeUrlCandidate(match[2]);
    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

export function collectHtmlAssetReferences(html: string): string[] {
  return Array.from(new Set(collectHtmlAssetReferenceRecords(html).map((reference) => reference.path)));
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
        bytes: fileStat.size,
        priority: 'lazy'
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
        bytes: getSourceSize(output.source),
        priority: 'lazy'
      });
      continue;
    }

    if (includeChunks) {
      entries.push({
        path: normalizeSlashes(fileName),
        source: 'chunk',
        type: 'js',
        bytes: Buffer.byteLength(output.code),
        priority: 'lazy'
      });
    }
  }

  return entries;
}

async function collectHtmlReferencedAssets(
  htmlReferences: Map<string, AssetReference[]>,
  publicDir: string | null,
  includeHtmlReferences: boolean
): Promise<AssetReportEntry[]> {
  if (!includeHtmlReferences) {
    return [];
  }

  const entries: AssetReportEntry[] = [];

  for (const [reference, references] of htmlReferences) {
    const publicPath = reference.startsWith('/') ? reference : `/${reference}`;
    const priority = getHighestPriority(references.map((entry) => entry.priority));
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
          priority,
          references,
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
      priority,
      references,
      referencedByHtml: true
    });
  }

  return entries;
}

function getHighestPriority(priorities: AssetPriority[]): AssetPriority {
  if (priorities.includes('critical')) {
    return 'critical';
  }

  if (priorities.includes('early')) {
    return 'early';
  }

  return 'lazy';
}

function getPriorityWeight(priority: AssetPriority): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'early':
      return 1;
    default:
      return 2;
  }
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
    existing.priority = getHighestPriority([existing.priority, entry.priority]);
    existing.references = [...(existing.references ?? []), ...(entry.references ?? [])];
    if (existing.bytes === null && entry.bytes !== null) {
      existing.bytes = entry.bytes;
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    const leftBytes = left.bytes ?? -1;
    const rightBytes = right.bytes ?? -1;
    const priorityDiff = getPriorityWeight(left.priority) - getPriorityWeight(right.priority);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    if (leftBytes !== rightBytes) {
      return rightBytes - leftBytes;
    }

    return left.path.localeCompare(right.path);
  });
}

export async function createAssetReport(input: {
  bundle: MinimalOutputBundle;
  htmlReferences: Map<string, AssetReference[]>;
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
      largestAssets: [...knownEntries]
        .sort((left, right) => (right.bytes ?? 0) - (left.bytes ?? 0))
        .slice(0, input.options.topAssetCount),
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
