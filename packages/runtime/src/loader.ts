import { createRuntimeLogger } from './debug.js';
import { scheduleOnIdle } from './idle.js';
import { observeNearViewport } from './observer.js';
import type { DeferredModuleOptions } from './types.js';

const DEFAULT_IDLE_TIMEOUT_MS = 1500;
const DEFAULT_LOOKAHEAD_PX = 300;

function getNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

export function deferModuleEntry(
  options: DeferredModuleOptions,
  load: () => Promise<unknown> | unknown
): void {
  const label = options.label ?? options.trigger ?? 'deferred-module';
  const logger = createRuntimeLogger(options.debug, label);
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const lookaheadPx = options.lookaheadPx ?? DEFAULT_LOOKAHEAD_PX;
  const startedAt = getNow();
  let hasLoaded = false;
  let isScheduled = false;

  const run = (reason: string) => {
    if (hasLoaded) {
      return;
    }

    hasLoaded = true;
    logger.log(`loading because ${reason} at ${formatDuration(getNow() - startedAt)}`);

    void Promise.resolve(load())
      .then(() => {
        logger.log(`loaded because ${reason} at ${formatDuration(getNow() - startedAt)}`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.log(`failed because ${reason}: ${message}`);
        throw error;
      });
  };

  const schedule = (reason: string) => {
    if (hasLoaded || isScheduled) {
      return;
    }

    isScheduled = true;
    const mode = scheduleOnIdle(() => {
      window.requestAnimationFrame(() => run(reason));
    }, idleTimeoutMs);

    logger.log(`scheduled via ${mode} because ${reason}`);
  };

  const scheduleAfterLoad = (reason: string) => {
    if (document.readyState === 'complete') {
      schedule(reason);
      return;
    }

    logger.log(`waiting for window load before ${reason}`);
    window.addEventListener(
      'load',
      () => {
        schedule(reason);
      },
      { once: true }
    );
  };

  if (typeof window === 'undefined') {
    run('server-render');
    return;
  }

  const trigger = options.trigger?.trim();
  if (trigger) {
    const observation = observeNearViewport(trigger, lookaheadPx, () => {
      scheduleAfterLoad(`near-viewport(${trigger})`);
    });

    if (observation.observed) {
      logger.log(`watching ${trigger} with lookahead ${lookaheadPx}px`);
      return;
    }

    logger.log(`falling back to idle because ${observation.fallbackReason ?? 'observation-unavailable'}`);
    scheduleAfterLoad(`idle-fallback(${observation.fallbackReason ?? 'observation-unavailable'})`);
    return;
  }

  logger.log('falling back to idle because no trigger was provided');
  scheduleAfterLoad('idle-fallback(no-trigger)');
}
