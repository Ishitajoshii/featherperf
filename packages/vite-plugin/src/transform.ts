import type { DeferredImportCandidate, FeatherPerfOptions, ImportBinding } from './types.js';

function createDeferredReplacement(
  candidate: DeferredImportCandidate,
  options: FeatherPerfOptions
): string[] {
  const { source, binding, callArguments, callIndent, triggerArgument } = candidate;
  const firstArgument = triggerArgument ?? 'undefined';
  const importBinding =
    binding.kind === 'default'
      ? `const { default: ${binding.localName} } = await import(${JSON.stringify(source)});`
      : binding.kind === 'namespace'
        ? `const ${binding.localName} = await import(${JSON.stringify(source)});`
      : `const { ${binding.importedName}: ${binding.localName} } = await import(${JSON.stringify(source)});`;

  const callExpression = `${binding.localName}(${callArguments});`;
  const label = `${binding.localName} from ${source}`;

  return [
    `${callIndent}__featherperfDefer({`,
    `${callIndent}  trigger: ${firstArgument},`,
    `${callIndent}  idleTimeoutMs: ${options.idleTimeoutMs ?? 1500},`,
    `${callIndent}  lookaheadPx: ${options.lookaheadPx ?? 300},`,
    `${callIndent}  debug: ${options.debug ? 'true' : 'false'},`,
    `${callIndent}  label: ${JSON.stringify(label)}`,
    `${callIndent}}, async () => {`,
    `${callIndent}  ${importBinding}`,
    `${callIndent}  ${callExpression}`,
    `${callIndent}});`
  ];
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

export function transformCode(
  code: string,
  candidates: DeferredImportCandidate[],
  options: FeatherPerfOptions = {}
): string {
  if (candidates.length === 0) {
    return code;
  }

  const replacements: Replacement[] = [];

  for (const candidate of candidates) {
    if (candidate.importBindingCount !== 1) {
      continue;
    }

    replacements.push({
      start: candidate.importStart,
      end: candidate.importEnd,
      text: ''
    });
    replacements.push({
      start: candidate.callStart,
      end: candidate.callEnd,
      text: createDeferredReplacement(candidate, options).join('\n')
    });
  }

  if (replacements.length === 0) {
    return code;
  }

  replacements.sort((left, right) => right.start - left.start);

  let transformed = code;
  for (const replacement of replacements) {
    transformed =
      transformed.slice(0, replacement.start) +
      replacement.text +
      transformed.slice(replacement.end);
  }

  const runtimeImport = `import { deferModuleEntry as __featherperfDefer } from 'virtual:featherperf-runtime';`;
  return `${runtimeImport}\n\n${transformed}`;
}
