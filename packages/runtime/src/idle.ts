import type { IdleScheduleMode } from './types.js';

export function scheduleOnIdle(callback: () => void, timeoutMs: number): IdleScheduleMode {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => callback(), { timeout: timeoutMs });
    return 'requestIdleCallback';
  }

  globalThis.setTimeout(callback, timeoutMs);
  return 'timeout';
}
