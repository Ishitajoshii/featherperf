import { createRuntimeLogger } from './debug.js';
import type { LottieOptimizerOptions } from './types.js';

const DEFAULT_CRITICAL_LOTTIE_SELECTORS = [
  '[data-featherperf-lottie]',
  '[data-lottie]',
  '.lottie',
  '.lottie-animation'
];

const DEFAULT_LOTTIE_LOOKAHEAD_PX = 600;
const DEFAULT_ATTACH_TIMEOUT_MS = 4000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const PATCH_FLAG = '__featherperfLottiePatched';

type LottieAnimation = Record<string, unknown> & {
  addEventListener?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  removeEventListener?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  play?: () => void;
  pause?: () => void;
  stop?: () => void;
  destroy?: () => void;
};

type LottieParams = Record<string, unknown> & {
  container?: Element;
  wrapper?: Element;
  autoplay?: boolean;
};

type LottieGlobal = Record<string, unknown> & {
  loadAnimation?: (params: LottieParams) => LottieAnimation;
};

interface PendingCriticalLottie {
  container: Element;
  promise: Promise<void>;
}

interface CriticalLottieWaitOptions {
  criticalSelectors?: string[];
  timeoutMs?: number;
  debug?: boolean;
}

const pendingCriticalLottie = new Set<PendingCriticalLottie>();

function getLottieGlobal(): LottieGlobal | null {
  const candidate = (window as unknown as { lottie?: LottieGlobal }).lottie;
  return candidate?.loadAnimation ? candidate : null;
}

function isNearViewport(element: Element, marginPx: number): boolean {
  if (typeof element.getBoundingClientRect !== 'function') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;

  return (
    rect.bottom >= -marginPx &&
    rect.right >= -marginPx &&
    rect.top <= viewportHeight + marginPx &&
    rect.left <= viewportWidth + marginPx
  );
}

function matchesAnySelector(element: Element, selectors: string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector) || Boolean(element.closest(selector));
    } catch {
      return false;
    }
  });
}

function queryCriticalLottieContainers(criticalSelectors: string[] = []): Element[] {
  const containers = new Set<Element>();
  const selectors = [...DEFAULT_CRITICAL_LOTTIE_SELECTORS, ...criticalSelectors];

  for (const selector of selectors) {
    let nodes: NodeListOf<Element>;

    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      continue;
    }

    for (const node of nodes) {
      if (DEFAULT_CRITICAL_LOTTIE_SELECTORS.some((lottieSelector) => {
        try {
          return node.matches(lottieSelector);
        } catch {
          return false;
        }
      })) {
        containers.add(node);
      }

      for (const childSelector of DEFAULT_CRITICAL_LOTTIE_SELECTORS) {
        try {
          node.querySelectorAll(childSelector).forEach((child) => containers.add(child));
        } catch {
          // Ignore invalid selectors supplied by consumers.
        }
      }
    }
  }

  return Array.from(containers);
}

function isContainerReady(container: Element): boolean {
  const state = (container as HTMLElement).dataset?.featherperfLottie;
  if (state === 'ready') {
    return true;
  }

  return Boolean(container.querySelector('svg,canvas'));
}

function timeoutPromise(delayMs: number): Promise<'timeout'> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve('timeout'), delayMs);
  });
}

function waitForContainerReady(container: Element): Promise<void> {
  if (isContainerReady(container)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ container?: Element }>).detail;
      if (detail?.container !== container) {
        return;
      }

      window.removeEventListener('featherperf:lottie-ready', onReady);
      resolve();
    };

    window.addEventListener('featherperf:lottie-ready', onReady);
  });
}

function markLottieReady(container: Element): void {
  const element = container as HTMLElement;
  element.dataset.featherperfLottie = 'ready';
  window.dispatchEvent(
    new CustomEvent('featherperf:lottie-ready', {
      detail: { container }
    })
  );
}

function trackFirstFrame(
  animation: LottieAnimation,
  container: Element,
  waitForFirstFrame: boolean
): Promise<void> {
  const element = container as HTMLElement;
  element.dataset.featherperfLottie = 'loading';

  return new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      markLottieReady(container);
      resolve();
    };

    if (!waitForFirstFrame || typeof animation.addEventListener !== 'function') {
      window.requestAnimationFrame(finish);
      return;
    }

    const onFrame = () => {
      animation.removeEventListener?.('DOMLoaded', onFrame);
      animation.removeEventListener?.('enterFrame', onFrame);
      finish();
    };

    animation.addEventListener('DOMLoaded', onFrame);
    animation.addEventListener('enterFrame', onFrame);
    window.setTimeout(finish, 2500);
  });
}

function registerCriticalLottie(container: Element, promise: Promise<void>): void {
  const entry = { container, promise };
  pendingCriticalLottie.add(entry);
  void promise.finally(() => {
    pendingCriticalLottie.delete(entry);
  });
}

function watchFreeze(animation: LottieAnimation, container: Element, lookaheadPx: number, autoplay: boolean): void {
  if (!('IntersectionObserver' in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting);

      if (isVisible) {
        if (autoplay) {
          animation.play?.();
        }
        return;
      }

      animation.pause?.();
    },
    { rootMargin: `${lookaheadPx}px 0px ${lookaheadPx}px 0px` }
  );

  observer.observe(container);
}

function createDeferredAnimationProxy(start: () => LottieAnimation): LottieAnimation {
  let animation: LottieAnimation | null = null;
  let destroyed = false;
  const queuedCalls: Array<{ method: string; args: unknown[] }> = [];
  const queuedListeners: Array<{ eventName: string; callback: (...args: unknown[]) => void }> = [];

  const ensureAnimation = () => {
    if (!animation && !destroyed) {
      animation = start();

      for (const listener of queuedListeners) {
        animation.addEventListener?.(listener.eventName, listener.callback);
      }

      for (const call of queuedCalls) {
        const method = animation[call.method];
        if (typeof method === 'function') {
          Reflect.apply(method, animation, call.args);
        }
      }

      queuedCalls.length = 0;
      queuedListeners.length = 0;
    }

    return animation;
  };

  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === '__featherperfStart') {
          return ensureAnimation;
        }

        if (property === 'addEventListener') {
          return (eventName: string, callback: (...args: unknown[]) => void) => {
            if (animation) {
              animation.addEventListener?.(eventName, callback);
              return;
            }

            queuedListeners.push({ eventName, callback });
          };
        }

        if (property === 'removeEventListener') {
          return (eventName: string, callback: (...args: unknown[]) => void) => {
            animation?.removeEventListener?.(eventName, callback);
            const index = queuedListeners.findIndex(
              (listener) => listener.eventName === eventName && listener.callback === callback
            );
            if (index >= 0) {
              queuedListeners.splice(index, 1);
            }
          };
        }

        return (...args: unknown[]) => {
          if (property === 'destroy') {
            destroyed = true;
          }

          const currentAnimation = property === 'destroy' ? animation : ensureAnimation();
          const method = currentAnimation?.[String(property)];

          if (typeof method === 'function') {
            return Reflect.apply(method, currentAnimation, args);
          }

          queuedCalls.push({ method: String(property), args });
          return undefined;
        };
      }
    }
  ) as LottieAnimation;
}

function deferUntilNearViewport(container: Element, lookaheadPx: number, start: () => LottieAnimation): LottieAnimation {
  let started = false;
  const proxy = createDeferredAnimationProxy(() => {
    started = true;
    return start();
  });

  const startOnce = () => {
    if (started) {
      return;
    }

    const starter = (proxy as unknown as { __featherperfStart?: () => void }).__featherperfStart;
    starter?.();
  };

  if (!('IntersectionObserver' in window)) {
    globalThis.setTimeout(startOnce, 0);
    return proxy;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      observer.disconnect();
      startOnce();
    },
    { rootMargin: `${lookaheadPx}px 0px ${lookaheadPx}px 0px` }
  );

  observer.observe(container);
  return proxy;
}

function patchLottie(lottie: LottieGlobal, options: LottieOptimizerOptions): boolean {
  if ((lottie as Record<string, unknown>)[PATCH_FLAG]) {
    return true;
  }

  const originalLoadAnimation = lottie.loadAnimation;
  if (!originalLoadAnimation) {
    return false;
  }

  const logger = createRuntimeLogger(options.debug, 'lottie');
  const criticalSelectors = options.criticalSelectors ?? [];
  const deferOffscreen = options.deferOffscreen ?? true;
  const freezeOffscreen = options.freezeOffscreen ?? true;
  const waitForFirstFrame = options.waitForFirstFrame ?? true;
  const lookaheadPx = options.lookaheadPx ?? DEFAULT_LOTTIE_LOOKAHEAD_PX;

  lottie.loadAnimation = function loadAnimationWithFeatherPerf(this: unknown, params: LottieParams): LottieAnimation {
    const container = params.container ?? params.wrapper;
    if (!container) {
      return originalLoadAnimation.call(this, params);
    }

    const isCritical = matchesAnySelector(container, criticalSelectors);
    const shouldDefer = deferOffscreen && !isCritical && !isNearViewport(container, lookaheadPx);

    const start = () => {
      const animation = originalLoadAnimation.call(this, params);
      const readiness = trackFirstFrame(animation, container, waitForFirstFrame);

      if (isCritical) {
        registerCriticalLottie(container, readiness);
      }

      if (freezeOffscreen) {
        watchFreeze(animation, container, lookaheadPx, params.autoplay !== false);
      }

      return animation;
    };

    if (shouldDefer) {
      logger.log('deferred offscreen animation until near viewport');
      return deferUntilNearViewport(container, lookaheadPx, start);
    }

    return start();
  };

  (lottie as Record<string, unknown>)[PATCH_FLAG] = true;
  logger.log('patched window.lottie.loadAnimation');
  return true;
}

export function initLottieOptimizer(options: LottieOptimizerOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (options.enabled === false) {
    return;
  }

  const logger = createRuntimeLogger(options.debug, 'lottie');
  const attachTimeoutMs = options.attachTimeoutMs ?? DEFAULT_ATTACH_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = performance.now();

  const tryPatch = () => {
    const lottie = getLottieGlobal();
    if (lottie && patchLottie(lottie, options)) {
      return;
    }

    if (performance.now() - startedAt >= attachTimeoutMs) {
      logger.log('window.lottie was not found before attach timeout');
      return;
    }

    window.setTimeout(tryPatch, pollIntervalMs);
  };

  tryPatch();
}

export async function waitForCriticalLottie(options: CriticalLottieWaitOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const logger = createRuntimeLogger(options.debug, 'lottie');
  const timeoutMs = options.timeoutMs ?? 2500;
  const containers = queryCriticalLottieContainers(options.criticalSelectors);
  const pendingContainers = containers.filter((container) => !isContainerReady(container));
  const pendingRegistered = Array.from(pendingCriticalLottie)
    .filter((entry) => !isContainerReady(entry.container))
    .map((entry) => entry.promise);
  const pending = [
    ...pendingContainers.map((container) => waitForContainerReady(container)),
    ...pendingRegistered
  ];

  if (pending.length === 0) {
    return;
  }

  logger.log(`waiting for ${pending.length} critical Lottie animation(s)`);
  const result = await Promise.race([
    Promise.all(pending).then(() => 'ready' as const),
    timeoutPromise(timeoutMs)
  ]);

  if (result === 'timeout') {
    logger.log(`critical Lottie wait reached ${timeoutMs}ms timeout`);
  }
}
