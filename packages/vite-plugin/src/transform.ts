import type { DeferredImportCandidate, FeatherPerfOptions, ImportBinding } from './types.js';

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

    if (character === "'" || character === '"' || character === '`') {
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

function createDeferredReplacement(
  source: string,
  binding: ImportBinding,
  args: string,
  indent: string,
  options: FeatherPerfOptions
): string[] {
  const firstArgument = findFirstArgument(args) ?? 'undefined';
  const importBinding =
    binding.kind === 'default'
      ? `const { default: ${binding.localName} } = await import(${JSON.stringify(source)});`
      : `const { ${binding.importedName}: ${binding.localName} } = await import(${JSON.stringify(source)});`;

  const callExpression = `${binding.localName}(${args});`;
  const label = `${binding.localName} from ${source}`;

  return [
    `${indent}__featherperfDefer({`,
    `${indent}  trigger: ${firstArgument},`,
    `${indent}  idleTimeoutMs: ${options.idleTimeoutMs ?? 1500},`,
    `${indent}  lookaheadPx: ${options.lookaheadPx ?? 300},`,
    `${indent}  debug: ${options.debug ? 'true' : 'false'},`,
    `${indent}  label: ${JSON.stringify(label)}`,
    `${indent}}, async () => {`,
    `${indent}  ${importBinding}`,
    `${indent}  ${callExpression}`,
    `${indent}});`
  ];
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
    if (candidate.importBindingCount !== 1) {
      continue;
    }

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
        deferredCall.indent,
        options
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

  const runtimeImport = `import { deferModuleEntry as __featherperfDefer } from 'virtual:featherperf-runtime';`;
  return `${runtimeImport}\n\n${lines.join('\n')}`;
}
