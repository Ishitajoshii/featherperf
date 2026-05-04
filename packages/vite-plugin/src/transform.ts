import type {
  DeferredImportCandidate,
  FeatherPerfLottieOptions,
  FeatherPerfOptions,
  ImportBinding,
  LottieLoadAnimationCandidate
} from './types.js';

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

function getLottieOptions(options: FeatherPerfOptions): FeatherPerfLottieOptions | null {
  if (options.lottie === true) {
    return { enabled: true };
  }

  if (!options.lottie || options.lottie.enabled === false) {
    return null;
  }

  return {
    ...options.lottie,
    enabled: true
  };
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
  options: FeatherPerfOptions = {},
  lottieCandidates: LottieLoadAnimationCandidate[] = []
): string {
  if (candidates.length === 0 && lottieCandidates.length === 0) {
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

  const lottieOptions = getLottieOptions(options);
  if (lottieOptions) {
    const serializedLottieOptions = JSON.stringify({
      ...lottieOptions,
      debug: options.debug
    }).replace(/</g, '\\u003c');

    for (const candidate of lottieCandidates) {
      replacements.push({
        start: candidate.callStart,
        end: candidate.callEnd,
        text: `__featherperfLottieLoad(${candidate.calleeText}, ${candidate.callArguments}, ${serializedLottieOptions})`
      });
    }
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

  const runtimeImports = [
    candidates.length > 0 ? 'deferModuleEntry as __featherperfDefer' : '',
    lottieCandidates.length > 0 ? 'optimizeLottieLoadAnimation as __featherperfLottieLoad' : ''
  ].filter(Boolean);

  const runtimeImport = `import { ${runtimeImports.join(', ')} } from 'virtual:featherperf-runtime';`;
  return `${runtimeImport}\n\n${transformed}`;
}
