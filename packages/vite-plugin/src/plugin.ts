import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { PLUGIN_NAME } from './constants.js';
import { checkSafety } from './safety.js';
import { transformCode } from './transform.js';
import type { DeferredImportCandidate, DetectedImport, FeatherPerfOptions, ImportBinding } from './types.js';

const VIRTUAL_RUNTIME_PUBLIC_ID = 'virtual:featherperf-runtime';
const VIRTUAL_RUNTIME_RESOLVED_ID = '\0virtual:featherperf-runtime';

function getRuntimeEntryHref(): string {
  const runtimeEntryPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../runtime/dist/index.js'
  );

  return pathToFileURL(runtimeEntryPath).href;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function findDeferredCall(line: string, binding: ImportBinding): { args: string; indent: string } | null {
  const match = line.match(
    new RegExp(`^(\\s*)${escapeRegExp(binding.localName)}\\((.*)\\);\\s*$`)
  );

  if (!match) {
    return null;
  }

  return {
    indent: match[1],
    args: match[2].trim()
  };
}

function findFirstArgument(args: string): string | null {
  if (!args.trim()) {
    return null;
  }

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < args.length; index += 1) {
    const character = args[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === '\\') {
        escaped = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
      continue;
    }

    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      continue;
    }

    if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      continue;
    }

    if (character === ',' && depth === 0) {
      return args.slice(0, index).trim();
    }
  }

  return args.trim();
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

      return `export { deferModuleEntry } from ${JSON.stringify(getRuntimeEntryHref())};`;
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

        const importedCode = await readResolvedCode(resolvedImport.id);
        if (!importedCode) {
          continue;
        }

        for (const binding of detectedImport.bindings) {
          let deferredCallArgs: string | null = null;

          for (const candidateLine of lines) {
            const deferredCall = findDeferredCall(candidateLine, binding);
            if (!deferredCall) {
              continue;
            }

            deferredCallArgs = deferredCall.args;
            break;
          }

          if (deferredCallArgs === null) {
            continue;
          }

          const safety = checkSafety(importedCode, resolvedImport.id, {
            importerId: cleanId,
            triggerArgument: findFirstArgument(deferredCallArgs)
          });

          if (!safety.isSafeToDefer) {
            if (options.debug) {
              this.warn(
                `${PLUGIN_NAME}: skipped ${path.relative(process.cwd(), stripQuery(resolvedImport.id))} (${safety.reasons.join(', ')})`
              );
            }
            continue;
          }

          candidates.push(
            ...createCandidates(index, detectedImport, [binding])
          );
        }

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
