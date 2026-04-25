import type { DeferredImportCandidate, FeatherPerfOptions, ImportBinding } from './types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bindingUsageCount(lines: string[], localName: string, importLineIndex: number): number {
  const searchableCode = lines
    .filter((_, lineIndex) => lineIndex !== importLineIndex)
    .join('\n');
  const matches = searchableCode.match(new RegExp(`\\b${escapeRegExp(localName)}\\b`, 'g'));
  return matches?.length ?? 0;
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

function createDeferredReplacement(
  source: string,
  binding: ImportBinding,
  args: string,
  indent: string
): string[] {
  const importBinding =
    binding.kind === 'default'
      ? `const { default: ${binding.localName} } = await import(${JSON.stringify(source)});`
      : `const { ${binding.importedName}: ${binding.localName} } = await import(${JSON.stringify(source)});`;

  const callExpression = `${binding.localName}(${args});`;

  return [
    `${indent}__featherperfDefer(async () => {`,
    `${indent}  ${importBinding}`,
    `${indent}  ${callExpression}`,
    `${indent}});`
  ];
}

function createDeferredHelper(idleTimeoutMs: number): string {
  return [
    `const __featherperfDefer = (load) => {`,
    `  const run = () => {`,
    `    void load();`,
    `  };`,
    `  if (typeof window === 'undefined') {`,
    `    run();`,
    `    return;`,
    `  }`,
    `  if ('requestIdleCallback' in window) {`,
    `    window.requestIdleCallback(() => run());`,
    `    return;`,
    `  }`,
    `  window.setTimeout(run, ${idleTimeoutMs});`,
    `};`
  ].join('\n');
}

export function transformCode(
  code: string,
  candidates: DeferredImportCandidate[],
  options: FeatherPerfOptions = {}
): string {
  if (candidates.length === 0) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  const transformedImportLines = new Set<number>();
  let insertedHelper = false;

  for (const candidate of candidates) {
    const importLine = lines[candidate.importLineIndex] ?? '';

    if (bindingUsageCount(lines, candidate.binding.localName, candidate.importLineIndex) !== 1) {
      continue;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const deferredCall = findDeferredCall(lines[lineIndex], candidate.binding);
      if (!deferredCall) {
        continue;
      }

      lines[lineIndex] = createDeferredReplacement(
        candidate.source,
        candidate.binding,
        deferredCall.args,
        deferredCall.indent
      ).join('\n');

      lines[candidate.importLineIndex] = '';
      transformedImportLines.add(candidate.importLineIndex);
      insertedHelper = true;
      break;
    }

    if (!transformedImportLines.has(candidate.importLineIndex)) {
      lines[candidate.importLineIndex] = importLine;
    }
  }

  if (!insertedHelper) {
    return code;
  }

  const helper = createDeferredHelper(options.idleTimeoutMs ?? 1500);
  return `${helper}\n\n${lines.join('\n')}`;
}
