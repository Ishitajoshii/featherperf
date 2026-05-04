import type { FeatherPerfAssetOptions, FeatherPerfLottieOptions, FeatherPerfOptions } from './types.js';

const DEFAULT_LOADING_CLASS = 'featherperf-assets-loading';
const DEFAULT_READY_CLASS = 'featherperf-assets-ready';

function getAssetOptions(options: FeatherPerfOptions): FeatherPerfAssetOptions | null {
  if (options.assets === true) {
    return { enabled: true };
  }

  if (!options.assets || options.assets.enabled === false) {
    return null;
  }

  return {
    ...options.assets,
    enabled: true
  };
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

function serializeOptions(options: FeatherPerfOptions, assets: FeatherPerfAssetOptions): string {
  return JSON.stringify({
    ...assets,
    debug: options.debug
  }).replace(/</g, '\\u003c');
}

function insertBeforeClosingTag(html: string, tagName: string, insertion: string): string {
  const pattern = new RegExp(`</${tagName}>`, 'i');
  const match = html.match(pattern);

  if (match?.index === undefined) {
    return `${html}\n${insertion}`;
  }

  return `${html.slice(0, match.index)}${insertion}\n${html.slice(match.index)}`;
}

function createRevealHeadSnippet(assets: FeatherPerfAssetOptions): string {
  const loadingClass = assets.loadingClass ?? DEFAULT_LOADING_CLASS;
  const readyClass = assets.readyClass ?? DEFAULT_READY_CLASS;

  return [
    '<style data-featherperf-assets>',
    `html.${loadingClass}:not(.${readyClass}) body{visibility:hidden;}`,
    '</style>',
    '<script data-featherperf-assets>',
    `document.documentElement.classList.add(${JSON.stringify(loadingClass)});`,
    'document.documentElement.dataset.featherperfAssets="loading";',
    '</script>'
  ].join('');
}

function createRuntimeSnippet(options: FeatherPerfOptions, assets: FeatherPerfAssetOptions): string {
  return [
    '<script type="module" data-featherperf-assets>',
    "import { initAssetReadiness } from 'virtual:featherperf-runtime';",
    `initAssetReadiness(${serializeOptions(options, assets)});`,
    '</script>'
  ].join('\n');
}

function createLottieRuntimeSnippet(options: FeatherPerfOptions, lottie: FeatherPerfLottieOptions): string {
  return [
    '<script type="module" data-featherperf-lottie>',
    "import { initLottieOptimizer } from 'virtual:featherperf-runtime';",
    `initLottieOptimizer(${serializeOptions(options, lottie)});`,
    '</script>'
  ].join('\n');
}

export function injectHtml(html: string, options: FeatherPerfOptions = {}): string {
  const assets = getAssetOptions(options);
  const lottie = getLottieOptions(options);

  if (!assets && !lottie) {
    return html;
  }

  let nextHtml = html;

  if (assets?.revealWhenReady) {
    nextHtml = insertBeforeClosingTag(nextHtml, 'head', createRevealHeadSnippet(assets));
  }

  const snippets = [
    lottie ? createLottieRuntimeSnippet(options, lottie) : '',
    assets ? createRuntimeSnippet(options, assets) : ''
  ].filter(Boolean);

  return insertBeforeClosingTag(nextHtml, 'body', snippets.join('\n'));
}
