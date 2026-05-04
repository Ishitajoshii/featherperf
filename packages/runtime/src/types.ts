export interface DeferredModuleOptions {
  trigger?: string;
  idleTimeoutMs?: number;
  lookaheadPx?: number;
  postLoadDelayMs?: number;
  interactionQuietWindowMs?: number;
  debug?: boolean;
  label?: string;
}

export interface NearViewportObservation {
  observed: boolean;
  fallbackReason?: string;
}

export type IdleScheduleMode = 'requestIdleCallback' | 'timeout';

export interface AssetReadinessOptions {
  criticalSelectors?: string[];
  waitForCriticalImages?: boolean;
  waitForFonts?: boolean;
  revealWhenReady?: boolean;
  includeViewportImages?: boolean;
  viewportMarginPx?: number;
  maxCriticalWaitMs?: number;
  loadingClass?: string;
  readyClass?: string;
  debug?: boolean;
}
