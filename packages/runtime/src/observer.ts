import type { NearViewportObservation } from './types.js';

export function observeNearViewport(
  trigger: string,
  lookaheadPx: number,
  onIntersect: () => void
): NearViewportObservation {
  if (!('IntersectionObserver' in window)) {
    return {
      observed: false,
      fallbackReason: 'intersection-observer-unavailable'
    };
  }

  const target = document.querySelector(trigger);
  if (!target) {
    return {
      observed: false,
      fallbackReason: 'trigger-not-found'
    };
  }

  const observer = new window.IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      observer.disconnect();
      onIntersect();
    },
    { rootMargin: `0px 0px ${lookaheadPx}px 0px` }
  );

  observer.observe(target);

  return {
    observed: true
  };
}
