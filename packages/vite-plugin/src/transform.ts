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
  indent: string
): string[] {
  const firstArgument = findFirstArgument(args) ?? 'undefined';
  const importBinding =
    binding.kind === 'default'
      ? `const { default: ${binding.localName} } = await import(${JSON.stringify(source)});`
      : `const { ${binding.importedName}: ${binding.localName} } = await import(${JSON.stringify(source)});`;

  const callExpression = `${binding.localName}(${args});`;

  return [
    `${indent}__featherperfDefer(${firstArgument}, async () => {`,
    `${indent}  ${importBinding}`,
    `${indent}  ${callExpression}`,
    `${indent}});`
  ];
}

function createDeferredHelper(idleTimeoutMs: number, lookaheadPx: number): string {
  return [
    `const __featherperfDefer = (trigger, load) => {`,
    `  let hasLoaded = false;`,
    `  let isScheduled = false;`,
    `  const run = () => {`,
    `    if (hasLoaded) {`,
    `      return;`,
    `    }`,
    `    hasLoaded = true;`,
    `    void load();`,
    `  };`,
    `  const schedule = () => {`,
    `    if (hasLoaded || isScheduled) {`,
    `      return;`,
    `    }`,
    `    isScheduled = true;`,
    `    const dispatch = () => {`,
    `      window.requestAnimationFrame(() => run());`,
    `    };`,
    `    if ('requestIdleCallback' in window) {`,
    `      window.requestIdleCallback(() => dispatch(), { timeout: ${idleTimeoutMs} });`,
    `      return;`,
    `    }`,
    `    window.setTimeout(dispatch, ${idleTimeoutMs});`,
    `  };`,
    `  const scheduleAfterLoad = () => {`,
    `    if (document.readyState === 'complete') {`,
    `      schedule();`,
    `      return;`,
    `    }`,
    `    window.addEventListener('load', () => schedule(), { once: true });`,
    `  };`,
    `  if (typeof window === 'undefined') {`,
    `    run();`,
    `    return;`,
    `  }`,
    `  if (typeof trigger === 'string' && 'IntersectionObserver' in window) {`,
    `    const target = document.querySelector(trigger);`,
    `    if (target) {`,
    `      const observer = new window.IntersectionObserver(`,
    `        (entries) => {`,
    `          if (entries.some((entry) => entry.isIntersecting)) {`,
    `            observer.disconnect();`,
    `            scheduleAfterLoad();`,
    `          }`,
    `        },`,
    `        { rootMargin: '0px 0px ${lookaheadPx}px 0px' }`,
    `      );`,
    `      observer.observe(target);`,
    `      return;`,
    `    }`,
    `  }`,
    `  scheduleAfterLoad();`,
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

  const helper = createDeferredHelper(options.idleTimeoutMs ?? 1500, options.lookaheadPx ?? 300);
  return `${helper}\n\n${lines.join('\n')}`;
}
