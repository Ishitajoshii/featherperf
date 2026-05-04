import { createRuntimeLogger } from './debug.js';
import { waitForCriticalLottie } from './lottie.js';
import type { AssetReadinessOptions } from './types.js';

const DEFAULT_CRITICAL_SELECTORS = [
  '[data-featherperf-critical]',
  '[data-critical]',
  'img[fetchpriority="high"]',
  'img[loading="eager"]'
];

const DEFAULT_MAX_CRITICAL_WAIT_MS = 3500;
const DEFAULT_LOTTIE_READY_TIMEOUT_MS = 2500;
const DEFAULT_VIEWPORT_MARGIN_PX = 200;
const DEFAULT_PREWARM_LOOKAHEAD_PX = 1800;
const DEFAULT_PREWARM_BATCH_SIZE = 24;
const DEFAULT_MAX_CONCURRENT_PRELOADS = 4;
const DEFAULT_IDLE_PRELOAD_DELAY_MS = 300;
const DEFAULT_LOADING_CLASS = 'featherperf-assets-loading';
const DEFAULT_READY_CLASS = 'featherperf-assets-ready';
const CSS_URL_PATTERN = /url\((['"]?)(.*?)\1\)/g;

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

function isNearViewport(element: Element, marginPx: number): boolean {
  if (typeof element.getBoundingClientRect !== 'function') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

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

function normalizeAssetUrl(url: string): string | null {
  const trimmedUrl = url.trim();

  if (
    !trimmedUrl ||
    trimmedUrl === 'none' ||
    trimmedUrl.startsWith('data:') ||
    trimmedUrl.startsWith('blob:')
  ) {
    return null;
  }

  try {
    return new URL(trimmedUrl, document.baseURI).toString();
  } catch {
    return null;
  }
}

function extractCssUrls(value: string): string[] {
  const urls: string[] = [];

  for (const match of value.matchAll(CSS_URL_PATTERN)) {
    const normalizedUrl = normalizeAssetUrl(match[2]);
    if (normalizedUrl) {
      urls.push(normalizedUrl);
    }
  }

  return urls;
}

function getElementBackgroundUrls(element: Element): string[] {
  if (typeof window.getComputedStyle !== 'function') {
    return [];
  }

  const styles = window.getComputedStyle(element);
  return [
    ...extractCssUrls(styles.backgroundImage),
    ...extractCssUrls(styles.borderImageSource),
    ...extractCssUrls(styles.listStyleImage)
  ];
}

function getPrewarmImageUrl(image: HTMLImageElement): string | null {
  return normalizeAssetUrl(image.currentSrc || image.src);
}

function nudgeImageFetch(image: HTMLImageElement): Promise<void> {
  if (!hasImageSource(image)) {
    return Promise.resolve();
  }

  image.loading = 'eager';

  if ('fetchPriority' in image && image.fetchPriority === 'low') {
    image.fetchPriority = 'auto';
  }

  return waitForImage(image);
}

function preloadImageUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
    };

    const done = () => {
      cleanup();

      if (typeof image.decode === 'function' && image.naturalWidth > 0) {
        void image.decode().finally(resolve);
        return;
      }

      resolve();
    };

    image.onload = done;
    image.onerror = done;
    image.src = url;
  });
}

interface PrewarmRuntimeOptions {
  prewarmBackgroundImages: boolean;
  prewarmLazyImages: boolean;
  prewarmLookaheadPx: number;
  prewarmBatchSize: number;
  maxConcurrentPreloads: number;
  idlePreloadDelayMs: number;
}

interface PrewarmTask {
  key: string;
  run: () => Promise<void>;
}

function initAssetPrewarmer(options: PrewarmRuntimeOptions, logger: ReturnType<typeof createRuntimeLogger>): void {
  const seen = new Set<string>();
  const queue: PrewarmTask[] = [];
  let activeCount = 0;
  let scanRaf = 0;
  let mutationObserver: MutationObserver | null = null;

  const pump = () => {
    while (activeCount < options.maxConcurrentPreloads && queue.length > 0) {
      const task = queue.shift();
      if (!task) {
        return;
      }

      activeCount += 1;
      void task
        .run()
        .catch(() => undefined)
        .finally(() => {
          activeCount -= 1;
          pump();
        });
    }
  };

  const enqueue = (task: PrewarmTask) => {
    if (seen.has(task.key)) {
      return;
    }

    seen.add(task.key);
    queue.push(task);
    pump();
  };

  const collectNearElements = (): Element[] => {
    const elements = [document.documentElement, document.body, ...Array.from(document.body.querySelectorAll('*'))];
    return elements
      .filter((element): element is Element => Boolean(element))
      .filter((element) => isNearViewport(element, options.prewarmLookaheadPx))
      .slice(0, options.prewarmBatchSize);
  };

  const scan = () => {
    scanRaf = 0;
    let enqueuedCount = 0;

    if (options.prewarmLazyImages) {
      for (const image of queryViewportImages(options.prewarmLookaheadPx).slice(0, options.prewarmBatchSize)) {
        const url = getPrewarmImageUrl(image);
        if (!url || image.complete) {
          continue;
        }

        enqueue({
          key: `img:${url}`,
          run: () => nudgeImageFetch(image)
        });
        enqueuedCount += 1;
      }
    }

    if (options.prewarmBackgroundImages) {
      for (const element of collectNearElements()) {
        for (const url of getElementBackgroundUrls(element)) {
          enqueue({
            key: `bg:${url}`,
            run: () => preloadImageUrl(url)
          });
          enqueuedCount += 1;
        }
      }
    }

    if (enqueuedCount > 0) {
      logger.log(`prewarming ${enqueuedCount} near-viewport asset(s)`);
    }
  };

  const queueScan = () => {
    if (scanRaf) {
      return;
    }

    scanRaf = window.requestAnimationFrame(scan);
  };

  const start = () => {
    queueScan();
    window.addEventListener('scroll', queueScan, { passive: true });
    window.addEventListener('resize', queueScan, { passive: true });
    window.addEventListener('orientationchange', queueScan, { passive: true });

    if ('MutationObserver' in window) {
      mutationObserver = new MutationObserver(queueScan);
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'style', 'class']
      });
    }
  };

  window.setTimeout(start, options.idlePreloadDelayMs);
  window.addEventListener('pagehide', () => mutationObserver?.disconnect(), { once: true });
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
  const waitForPageLottie = options.waitForCriticalLottie ?? false;
  const revealWhenReady = options.revealWhenReady ?? false;
  const includeViewportImages = options.includeViewportImages ?? true;
  const prewarmOffscreenAssets = options.prewarmOffscreenAssets ?? true;

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
      ...(waitForPageFonts ? [waitForFonts()] : []),
      ...(waitForPageLottie
        ? [
            waitForCriticalLottie({
              criticalSelectors,
              timeoutMs: options.lottieReadyTimeoutMs ?? DEFAULT_LOTTIE_READY_TIMEOUT_MS,
              debug: options.debug
            })
          ]
        : [])
    ];

    logger.log(
      `waiting for ${imagePromises.length} critical image(s)${
        waitForPageFonts ? ' and fonts' : ''
      }${waitForPageLottie ? ' and critical Lottie' : ''}`
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

    if (prewarmOffscreenAssets) {
      initAssetPrewarmer(
        {
          prewarmBackgroundImages: options.prewarmBackgroundImages ?? true,
          prewarmLazyImages: options.prewarmLazyImages ?? true,
          prewarmLookaheadPx: options.prewarmLookaheadPx ?? DEFAULT_PREWARM_LOOKAHEAD_PX,
          prewarmBatchSize: options.prewarmBatchSize ?? DEFAULT_PREWARM_BATCH_SIZE,
          maxConcurrentPreloads: options.maxConcurrentPreloads ?? DEFAULT_MAX_CONCURRENT_PRELOADS,
          idlePreloadDelayMs: options.idlePreloadDelayMs ?? DEFAULT_IDLE_PRELOAD_DELAY_MS
        },
        logger
      );
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void run(), { once: true });
    return;
  }

  void run();
}
