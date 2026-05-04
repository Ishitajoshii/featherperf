import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';
import { collectDeferredImportCandidates, collectLottieLoadAnimationCandidates } from './ast.js';
import {
  collectHtmlAssetReferenceRecords,
  createAssetReport,
  getAssetManifestOptions,
  formatAssetReportWarnings,
  getAssetReportOptions
} from './asset-report.js';
import { PLUGIN_NAME } from './constants.js';
import { injectHtml } from './html.js';
import { checkSafety } from './safety.js';
import { createServiceWorkerSource, getServiceWorkerOptions } from './service-worker.js';
import { transformCode } from './transform.js';
import type { AssetReference, DeferredImportCandidate, FeatherPerfOptions } from './types.js';

const VIRTUAL_RUNTIME_PUBLIC_ID = 'virtual:featherperf-runtime';
const VIRTUAL_RUNTIME_RESOLVED_ID = '\0virtual:featherperf-runtime';
const runtimeRequire = createRequire(import.meta.url);

function getRuntimeEntryHref(): string {
  let runtimeEntryPath: string;

  try {
    runtimeEntryPath = runtimeRequire.resolve('@featherperf/runtime');
  } catch {
    runtimeEntryPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../runtime/dist/index.js'
    );
  }

  return pathToFileURL(runtimeEntryPath).href;
}

function stripQuery(id: string): string {
  return id.split('?')[0].split('#')[0];
}

function normalizePath(id: string): string {
  return stripQuery(id).replace(/\\/g, '/');
}

function isRelativeImport(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../');
}

function matchesPattern(value: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return value.includes(pattern);
  }

  return pattern.test(value);
}

function shouldProcessModule(id: string, options: FeatherPerfOptions): boolean {
  const normalizedId = normalizePath(id);
  const includePatterns = options.include ?? [];
  const excludePatterns = options.exclude ?? [];

  if (includePatterns.length > 0 && !includePatterns.some((pattern) => matchesPattern(normalizedId, pattern))) {
    return false;
  }

  return !excludePatterns.some((pattern) => matchesPattern(normalizedId, pattern));
}

async function readResolvedCode(resolvedId: string): Promise<string | null> {
  try {
    return await readFile(stripQuery(resolvedId), 'utf8');
  } catch {
    return null;
  }
}

export function featherperf(options: FeatherPerfOptions = {}): Plugin {
  let config: ResolvedConfig | null = null;
  const htmlReferences = new Map<string, AssetReference[]>();

  return {
    name: PLUGIN_NAME,
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    resolveId(source) {
      if (source === VIRTUAL_RUNTIME_PUBLIC_ID) {
        return VIRTUAL_RUNTIME_RESOLVED_ID;
      }

      if (source.startsWith('file:///')) {
        return fileURLToPath(source);
      }

      return null;
    },
    load(id) {
      if (id !== VIRTUAL_RUNTIME_RESOLVED_ID) {
        return null;
      }

      return `export { deferModuleEntry, initAssetReadiness, initLottieOptimizer, optimizeLottieLoadAnimation } from ${JSON.stringify(getRuntimeEntryHref())};`;
    },
    transformIndexHtml(html) {
      const reportOptions = getAssetReportOptions(options);
      const manifestOptions = getAssetManifestOptions(options);
      if (reportOptions?.includeHtmlReferences || manifestOptions?.includeHtmlReferences) {
        for (const reference of collectHtmlAssetReferenceRecords(html)) {
          const existingReferences = htmlReferences.get(reference.path) ?? [];
          existingReferences.push(reference);
          htmlReferences.set(reference.path, existingReferences);
        }
      }

      return injectHtml(html, options);
    },
    async generateBundle(_outputOptions, bundle) {
      const reportOptions = getAssetReportOptions(options);
      const manifestOptions = getAssetManifestOptions(options);
      const publicDir = config?.publicDir ?? null;

      if (reportOptions) {
        const report = await createAssetReport({
          bundle,
          htmlReferences,
          publicDir,
          options: reportOptions
        });

        for (const warning of formatAssetReportWarnings(report)) {
          this.warn(`${PLUGIN_NAME}: ${warning}`);
        }

        if (reportOptions.emitJson) {
          this.emitFile({
            type: 'asset',
            fileName: reportOptions.outputFile,
            source: `${JSON.stringify(report, null, 2)}\n`
          });
        }
      }

      if (manifestOptions) {
        const manifest = await createAssetReport({
          bundle,
          htmlReferences,
          publicDir,
          options: {
            enabled: true,
            emitJson: true,
            outputFile: manifestOptions.outputFile,
            includePublic: manifestOptions.includePublic,
            includeHtmlReferences: manifestOptions.includeHtmlReferences,
            includeChunks: manifestOptions.includeChunks,
            largeAssetThresholdKb: Number.MAX_SAFE_INTEGER,
            topAssetCount: Number.MAX_SAFE_INTEGER
          }
        });

        this.emitFile({
          type: 'asset',
          fileName: manifestOptions.outputFile,
          source: `${JSON.stringify(manifest, null, 2)}\n`
        });
      }

      const serviceWorkerOptions = getServiceWorkerOptions(options);
      if (serviceWorkerOptions) {
        this.emitFile({
          type: 'asset',
          fileName: serviceWorkerOptions.fileName,
          source: createServiceWorkerSource(serviceWorkerOptions)
        });
      }
    },
    async transform(code, id) {
      const cleanId = stripQuery(id);
      const normalizedId = normalizePath(id);

      if (
        normalizedId.includes('/node_modules/') ||
        normalizedId.includes('/packages/runtime/dist/') ||
        normalizedId.includes('/packages/runtime/src/')
      ) {
        return null;
      }

      if (!shouldProcessModule(cleanId, options)) {
        return null;
      }

      const detectedCandidates = collectDeferredImportCandidates(code, cleanId);
      const lottieCandidates =
        options.lottie
          ? collectLottieLoadAnimationCandidates(code, cleanId)
          : [];
      const candidates: DeferredImportCandidate[] = [];

      for (const candidate of detectedCandidates) {
        if (!isRelativeImport(candidate.source)) {
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
            this.warn(
              `${PLUGIN_NAME}: skipped ${path.relative(process.cwd(), stripQuery(resolvedImport.id))} (${safety.reasons.join(', ')})`
            );
          }
          continue;
        }

        candidates.push(candidate);

        if (options.debug) {
          this.warn(
            `${PLUGIN_NAME}: detected ${path.relative(process.cwd(), stripQuery(resolvedImport.id))} via ${candidate.source}`
          );
        }
      }

      const transformed = transformCode(code, candidates, options, lottieCandidates);
      if (transformed === code) {
        return null;
      }

      if (options.debug) {
        const deferredTargets = candidates.map((candidate) => candidate.source).join(', ');
        this.warn(
          `${PLUGIN_NAME}: deferred ${path.relative(process.cwd(), cleanId)} -> ${deferredTargets}`
        );
      }

      if (options.debug && lottieCandidates.length > 0) {
        this.warn(
          `${PLUGIN_NAME}: optimized ${lottieCandidates.length} lottie loadAnimation call(s) in ${path.relative(process.cwd(), cleanId)}`
        );
      }

      return {
        code: transformed,
        map: null
      };
    }
  };
}
