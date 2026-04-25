import { gsap } from 'gsap';
import lottie from 'lottie-web';

function runCpuWarmup(iterations = 1_500_000): number {
  let checksum = 0;
  for (let i = 1; i <= iterations; i += 1) {
    checksum += Math.sin(i) * Math.cos(i / 3);
  }
  return checksum;
}

export function runBaselineAnimations(rootSelector = '#deferred-showcase'): void {
  const root = document.querySelector<HTMLElement>(rootSelector);
  const scope = root?.parentElement?.parentElement ?? document;
  const tiles = Array.from(scope.querySelectorAll<HTMLElement>('.orb'));
  const host = scope.querySelector<HTMLElement>('#lottie-host');

  if (!root || tiles.length === 0 || !host) {
    return;
  }

  // Intentionally heavy work, but scoped to a section that should be considered non-critical.
  const checksum = runCpuWarmup();

  gsap.set(tiles, { opacity: 0, y: 26, rotateZ: -1.5 });
  const tl = gsap.timeline();
  tiles.forEach((tile, index) => {
    tl.to(
      tile,
      {
        opacity: 1,
        y: 0,
        rotateZ: 0,
        duration: 0.38,
        ease: 'power2.out'
      },
      index * 0.016
    );
  });

  // Trigger lottie-web initialization without relying on large media assets.
  lottie.setQuality('high');
  lottie.freeze();
  lottie.unfreeze();

  if (host) {
    host.textContent = `Lottie ${lottie.version} initialized | checksum ${checksum.toFixed(2)}`;
  }
}
