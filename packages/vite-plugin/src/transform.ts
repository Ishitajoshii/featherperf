import type { DeferredImportCandidate, FeatherPerfOptions, ImportBinding } from './types.js';

function createDeferredReplacement(
  candidate: DeferredImportCandidate,
  options: FeatherPerfOptions
): string[] {
  const { source, binding, callExpressionText, callIndent, triggerArgument } = candidate;
  const firstArgument = triggerArgument ?? 'undefined';
  const importBinding =
    binding.kind === 'default'
      ? `const { default: ${binding.localName} } = await import(${JSON.stringify(source)});`
      : binding.kind === 'namespace'
        ? `const ${binding.localName} = await import(${JSON.stringify(source)});`
      : `const { ${binding.importedName}: ${binding.localName} } = await import(${JSON.stringify(source)});`;

  const callExpression = `${callExpressionText};`;
  const label = `${binding.localName} from ${source}`;

  return [
    `${callIndent}__featherperfDefer({`,
    `${callIndent}  trigger: ${firstArgument},`,
    `${callIndent}  idleTimeoutMs: ${options.idleTimeoutMs ?? 1500},`,
    `${callIndent}  lookaheadPx: ${options.lookaheadPx ?? 300},`,
    `${callIndent}  postLoadDelayMs: ${options.postLoadDelayMs ?? 1500},`,
    `${callIndent}  interactionQuietWindowMs: ${options.interactionQuietWindowMs ?? 750},`,
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

function sameBinding(left: ImportBinding, right: ImportBinding): boolean {
  return (
    left.kind === right.kind &&
    left.localName === right.localName &&
    left.importedName === right.importedName
  );
}

function formatNamedBinding(binding: ImportBinding): string {
  return binding.importedName === binding.localName
    ? binding.importedName
    : `${binding.importedName} as ${binding.localName}`;
}

function createStaticImport(source: string, bindings: ImportBinding[]): string {
  if (bindings.length === 0) {
    return '';
  }

  const defaultBinding = bindings.find((binding) => binding.kind === 'default');
  const namespaceBinding = bindings.find((binding) => binding.kind === 'namespace');
  const namedBindings = bindings.filter((binding) => binding.kind === 'named');
  const clauses: string[] = [];

  if (defaultBinding) {
    clauses.push(defaultBinding.localName);
  }

  if (namespaceBinding) {
    clauses.push(`* as ${namespaceBinding.localName}`);
  }

  if (namedBindings.length > 0) {
    clauses.push(`{ ${namedBindings.map((binding) => formatNamedBinding(binding)).join(', ')} }`);
  }

  return `import ${clauses.join(', ')} from ${JSON.stringify(source)};`;
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
  const groupedCandidates = new Map<string, DeferredImportCandidate[]>();

  for (const candidate of candidates) {
    const importKey = `${candidate.importStart}:${candidate.importEnd}`;
    const importCandidates = groupedCandidates.get(importKey) ?? [];
    importCandidates.push(candidate);
    groupedCandidates.set(importKey, importCandidates);
  }

  for (const importCandidates of groupedCandidates.values()) {
    const [firstCandidate] = importCandidates;
    const remainingBindings = firstCandidate.importBindings.filter(
      (binding) => !importCandidates.some((candidate) => sameBinding(binding, candidate.binding))
    );
    replacements.push({
      start: firstCandidate.importStart,
      end: firstCandidate.importEnd,
      text: createStaticImport(firstCandidate.source, remainingBindings)
    });
  }

  for (const candidate of candidates) {
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
