import { createRuntimeLogger } from './debug.js';
import { scheduleOnIdle } from './idle.js';
import { observeNearViewport } from './observer.js';
import type { DeferredModuleOptions } from './types.js';

const DEFAULT_IDLE_TIMEOUT_MS = 1500;
const DEFAULT_LOOKAHEAD_PX = 300;
const DEFAULT_POST_LOAD_DELAY_MS = 1500;
const DEFAULT_INTERACTION_QUIET_WINDOW_MS = 750;
const ACTIVITY_EVENTS = ['scroll', 'wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
const ACTIVITY_LISTENER_OPTIONS: AddEventListenerOptions = { passive: true };

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
  const postLoadDelayMs = options.postLoadDelayMs ?? DEFAULT_POST_LOAD_DELAY_MS;
  const interactionQuietWindowMs =
    options.interactionQuietWindowMs ?? DEFAULT_INTERACTION_QUIET_WINDOW_MS;
  const startedAt = getNow();
  let hasLoaded = false;
  let isScheduled = false;
  let lastActivityAt = startedAt;
  let loadedAt: number | null = null;
  let readinessTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const clearReadinessTimer = () => {
    if (readinessTimer === null) {
      return;
    }

    globalThis.clearTimeout(readinessTimer);
    readinessTimer = null;
  };

  const updateActivity = () => {
    lastActivityAt = getNow();
  };

  const removeActivityListeners = () => {
    if (typeof window === 'undefined') {
      return;
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, updateActivity, ACTIVITY_LISTENER_OPTIONS);
    }
  };

  const addActivityListeners = () => {
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, updateActivity, ACTIVITY_LISTENER_OPTIONS);
    }
  };

  const markLoadedAt = () => {
    if (loadedAt !== null) {
      return;
    }

    loadedAt = getNow();
  };

  const run = (reason: string) => {
    if (hasLoaded) {
      return;
    }

    hasLoaded = true;
    clearReadinessTimer();
    removeActivityListeners();
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

  const scheduleWhenQuiet = (reason: string) => {
    if (hasLoaded || isScheduled) {
      return;
    }

    clearReadinessTimer();

    const effectiveLoadedAt = loadedAt ?? getNow();
    const timeSinceLoadMs = getNow() - effectiveLoadedAt;
    const timeSinceActivityMs = getNow() - lastActivityAt;
    const remainingPostLoadMs = Math.max(0, postLoadDelayMs - timeSinceLoadMs);
    const remainingQuietMs = Math.max(0, interactionQuietWindowMs - timeSinceActivityMs);
    const waitMs = Math.max(remainingPostLoadMs, remainingQuietMs);

    if (waitMs > 0) {
      logger.log(
        `waiting ${formatDuration(waitMs)} before ${reason} (post-load ${Math.round(
          remainingPostLoadMs
        )}ms, interaction-quiet ${Math.round(remainingQuietMs)}ms)`
      );
      readinessTimer = globalThis.setTimeout(() => {
        readinessTimer = null;
        scheduleWhenQuiet(reason);
      }, waitMs);
      return;
    }

    schedule(reason);
  };

  const scheduleAfterLoad = (reason: string) => {
    if (document.readyState === 'complete') {
      markLoadedAt();
      scheduleWhenQuiet(reason);
      return;
    }

    logger.log(`waiting for window load before ${reason}`);
    window.addEventListener(
      'load',
      () => {
        markLoadedAt();
        scheduleWhenQuiet(reason);
      },
      { once: true }
    );
  };

  if (typeof window === 'undefined') {
    run('server-render');
    return;
  }

  if (document.readyState === 'complete') {
    markLoadedAt();
  } else {
    window.addEventListener(
      'load',
      () => {
        markLoadedAt();
      },
      { once: true }
    );
  }

  addActivityListeners();

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
