import { createRuntimeLogger } from './debug.js';
import type { AssetReadinessOptions } from './types.js';

const DEFAULT_CRITICAL_SELECTORS = [
  '[data-featherperf-critical]',
  '[data-critical]',
  'img[fetchpriority="high"]',
  'img[loading="eager"]'
];

const DEFAULT_MAX_CRITICAL_WAIT_MS = 3500;
const DEFAULT_VIEWPORT_MARGIN_PX = 200;
const DEFAULT_LOADING_CLASS = 'featherperf-assets-loading';
const DEFAULT_READY_CLASS = 'featherperf-assets-ready';

function uniqueImages(images: HTMLImageElement[]): HTMLImageElement[] {
  return Array.from(new Set(images));
}

function queryCriticalImages(selectors: string[]): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];

  for (const selector of selectors) {
    let nodes: NodeListOf<Element>;

    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      continue;
    }

    for (const node of nodes) {
      if (node instanceof HTMLImageElement) {
        images.push(node);
        continue;
      }

      images.push(...Array.from(node.querySelectorAll('img')));
    }
  }

  return images;
}

function isNearViewport(image: HTMLImageElement, marginPx: number): boolean {
  if (typeof image.getBoundingClientRect !== 'function') {
    return false;
  }

  const rect = image.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;

  return (
    rect.bottom >= -marginPx &&
    rect.right >= -marginPx &&
    rect.top <= viewportHeight + marginPx &&
    rect.left <= viewportWidth + marginPx
  );
}

function queryViewportImages(marginPx: number): HTMLImageElement[] {
  return Array.from(document.images).filter((image) => isNearViewport(image, marginPx));
}

function hasImageSource(image: HTMLImageElement): boolean {
  return Boolean(image.currentSrc || image.src || image.srcset);
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!hasImageSource(image)) {
    return Promise.resolve();
  }

  if (image.complete && image.naturalWidth > 0) {
    if (typeof image.decode === 'function') {
      return image.decode().catch(() => undefined);
    }

    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      image.removeEventListener('load', onComplete);
      image.removeEventListener('error', onComplete);
    };

    const onComplete = () => {
      cleanup();

      if (typeof image.decode === 'function' && image.naturalWidth > 0) {
        void image.decode().finally(resolve);
        return;
      }

      resolve();
    };

    image.addEventListener('load', onComplete, { once: true });
    image.addEventListener('error', onComplete, { once: true });
  });
}

function waitForFonts(): Promise<void> {
  const fontSet = document.fonts;

  if (!fontSet?.ready) {
    return Promise.resolve();
  }

  return fontSet.ready.then(() => undefined, () => undefined);
}

function timeoutPromise(delayMs: number): Promise<'timeout'> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve('timeout'), delayMs);
  });
}

function markLoading(options: Required<Pick<AssetReadinessOptions, 'loadingClass' | 'readyClass'>>): void {
  const root = document.documentElement;
  root.classList.remove(options.readyClass);
  root.classList.add(options.loadingClass);
  root.dataset.featherperfAssets = 'loading';
}

function markReady(options: Required<Pick<AssetReadinessOptions, 'loadingClass' | 'readyClass'>>): void {
  const root = document.documentElement;
  root.classList.remove(options.loadingClass);
  root.classList.add(options.readyClass);
  root.dataset.featherperfAssets = 'ready';
  window.dispatchEvent(new CustomEvent('featherperf:assets-ready'));
}

export function initAssetReadiness(options: AssetReadinessOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const logger = createRuntimeLogger(options.debug, 'assets');
  const loadingClass = options.loadingClass ?? DEFAULT_LOADING_CLASS;
  const readyClass = options.readyClass ?? DEFAULT_READY_CLASS;
  const maxCriticalWaitMs = options.maxCriticalWaitMs ?? DEFAULT_MAX_CRITICAL_WAIT_MS;
  const viewportMarginPx = options.viewportMarginPx ?? DEFAULT_VIEWPORT_MARGIN_PX;
  const criticalSelectors = options.criticalSelectors ?? DEFAULT_CRITICAL_SELECTORS;
  const waitForCriticalImages = options.waitForCriticalImages ?? true;
  const waitForPageFonts = options.waitForFonts ?? true;
  const revealWhenReady = options.revealWhenReady ?? false;
  const includeViewportImages = options.includeViewportImages ?? true;

  if (revealWhenReady) {
    markLoading({ loadingClass, readyClass });
  }

  const run = async () => {
    const imagePromises = waitForCriticalImages
      ? uniqueImages([
          ...queryCriticalImages(criticalSelectors),
          ...(includeViewportImages ? queryViewportImages(viewportMarginPx) : [])
        ]).map((image) => waitForImage(image))
      : [];

    const readinessPromises = [
      ...imagePromises,
      ...(waitForPageFonts ? [waitForFonts()] : [])
    ];

    logger.log(
      `waiting for ${imagePromises.length} critical image(s)${
        waitForPageFonts ? ' and fonts' : ''
      }`
    );

    if (readinessPromises.length > 0) {
      const result = await Promise.race([
        Promise.all(readinessPromises).then(() => 'ready' as const),
        timeoutPromise(maxCriticalWaitMs)
      ]);

      if (result === 'timeout') {
        logger.log(`ready after ${maxCriticalWaitMs}ms timeout`);
      } else {
        logger.log('ready after critical assets resolved');
      }
    }

    markReady({ loadingClass, readyClass });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void run(), { once: true });
    return;
  }

  void run();
}
