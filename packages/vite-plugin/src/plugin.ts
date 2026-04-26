import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedConfig } from 'vite';
import type { Plugin } from 'vite';
import { PLUGIN_NAME } from './constants';
import { scanHeavyImportReport } from './detector';
import { checkSafety } from './safety';
import { transformCode } from './transform';
import type { DeferredImportCandidate, DetectedImport, FeatherPerfOptions, ImportBinding } from './types';

function stripQuery(id: string): string {
  return id.split('?')[0].split('#')[0];
}

function isRelativeImport(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../');
}

async function readResolvedCode(resolvedId: string): Promise<string | null> {
  try {
    return await readFile(stripQuery(resolvedId), 'utf8');
  } catch {
    return null;
  }
}

function createCandidates(
  importLineIndex: number,
  detectedImport: DetectedImport,
  bindings: ImportBinding[]
): DeferredImportCandidate[] {
  return bindings.map((binding) => ({
    importLineIndex,
    source: detectedImport.source,
    binding
  }));
}

export function featherperf(options: FeatherPerfOptions = {}): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: PLUGIN_NAME,
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    async buildStart() {
      const projectRoot = resolvedConfig?.root ?? process.cwd();
      if (!resolvedConfig?.build?.ssr) {
        return;
      }
      const report = await scanHeavyImportReport(projectRoot);

      if (report.length === 0) {
        this.warn(`${PLUGIN_NAME}: no gsap, ScrollTrigger, or lottie-web imports found in ${projectRoot}`);
        return;
      }

      for (const entry of report) {
        const relativeFilePath = path.relative(projectRoot, entry.filePath) || path.basename(entry.filePath);

        for (const supportedPackage of entry.packages) {
          this.warn(`${PLUGIN_NAME}: found ${supportedPackage} in ${relativeFilePath}`);
        }
      }

      this.warn(
        `${PLUGIN_NAME}: report complete (${report.length} file${report.length === 1 ? '' : 's'})`
      );
    },
    async transform(code, id) {
      const cleanId = stripQuery(id);
      if (cleanId.includes('node_modules')) {
        return null;
      }

      const lines = code.split(/\r?\n/);
      const candidates: DeferredImportCandidate[] = [];

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const match = line.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);

        if (!match) {
          continue;
        }

        const [, , source] = match;
        if (!isRelativeImport(source)) {
          continue;
        }

        const resolvedImport = await this.resolve(source, id);
        if (!resolvedImport?.id) {
          continue;
        }

        const importedCode = await readResolvedCode(resolvedImport.id);
        if (!importedCode) {
          continue;
        }

        const safety = checkSafety(importedCode, resolvedImport.id);
        if (!safety.isSafeToDefer) {
          if (options.debug) {
            this.warn(
              `${PLUGIN_NAME}: skipped ${path.relative(process.cwd(), stripQuery(resolvedImport.id))} (${safety.reasons.join(', ')})`
            );
          }
          continue;
        }

        const detectedImport: DetectedImport = {
          source,
          bindings: [],
          supportedPackage: null
        };

        const parsedImport = line.match(/^\s*import\s+(.+?)\s+from\s+['"][^'"]+['"]\s*;?\s*$/)?.[1] ?? '';

        if (parsedImport.startsWith('{') && parsedImport.endsWith('}')) {
          detectedImport.bindings = parsedImport
            .slice(1, -1)
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
        } else if (parsedImport.includes('{')) {
          const namedStartIndex = parsedImport.indexOf('{');
          const defaultBinding = parsedImport.slice(0, namedStartIndex).replace(/,$/, '').trim();
          const namedBindings = parsedImport.slice(namedStartIndex + 1, -1);

          detectedImport.bindings = [
            {
              importedName: 'default',
              localName: defaultBinding,
              kind: 'default'
            },
            ...namedBindings
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
              })
          ];
        } else if (!parsedImport.startsWith('* as ')) {
          detectedImport.bindings = [
            {
              importedName: 'default',
              localName: parsedImport.trim(),
              kind: 'default'
            }
          ];
        }

        if (detectedImport.bindings.length === 0) {
          continue;
        }

        candidates.push(...createCandidates(index, detectedImport, detectedImport.bindings));

        if (options.debug) {
          this.warn(
            `${PLUGIN_NAME}: detected ${path.relative(process.cwd(), stripQuery(resolvedImport.id))} via ${source}`
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
