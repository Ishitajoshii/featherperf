import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { collectDeferredImportCandidates } from './ast.js';
import { PLUGIN_NAME } from './constants.js';
import { checkSafety } from './safety.js';
import { transformCode } from './transform.js';
import type { DeferredImportCandidate, FeatherPerfOptions } from './types.js';

const VIRTUAL_RUNTIME_PUBLIC_ID = 'virtual:featherperf-runtime';
const VIRTUAL_RUNTIME_RESOLVED_ID = '\0virtual:featherperf-runtime';

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
  return {
    name: PLUGIN_NAME,
    apply: 'build',
    resolveId(source) {
      if (source === VIRTUAL_RUNTIME_PUBLIC_ID) {
        return VIRTUAL_RUNTIME_RESOLVED_ID;
      }

      return null;
    },
    load(id) {
      if (id !== VIRTUAL_RUNTIME_RESOLVED_ID) {
        return null;
      }

      return `export { deferModuleEntry } from '@featherperf/runtime';`;
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
      const candidates: DeferredImportCandidate[] = [];

      for (const candidate of detectedCandidates) {
        if (!isRelativeImport(candidate.source)) {
          continue;
        }

        const resolvedImport = await this.resolve(candidate.source, id);
        if (!resolvedImport?.id) {
          continue;
        }

        if (candidate.importBindingCount !== 1) {
          if (options.debug) {
            this.warn(
              `${PLUGIN_NAME}: skipped ${path.relative(process.cwd(), cleanId)} because ${candidate.source} uses multiple imported bindings`
            );
          }
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

      const transformed = transformCode(code, candidates, options);
      if (transformed === code) {
        return null;
      }

      if (options.debug) {
        const deferredTargets = candidates.map((candidate) => candidate.source).join(', ');
        this.warn(
          `${PLUGIN_NAME}: deferred ${path.relative(process.cwd(), cleanId)} -> ${deferredTargets}`
        );
      }

      return {
        code: transformed,
        map: null
      };
    }
  };
}
