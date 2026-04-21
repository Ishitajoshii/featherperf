import { gsap } from 'gsap';
import lottie from 'lottie-web';

function runCpuWarmup(iterations = 1_500_000): number {
  let checksum = 0;
  for (let i = 1; i <= iterations; i += 1) {
    checksum += Math.sin(i) * Math.cos(i / 3);
  }
  return checksum;
}

export function runBaselineAnimations(): void {
  const tiles = Array.from(document.querySelectorAll<HTMLElement>('.orb'));
  const host = document.querySelector<HTMLElement>('#lottie-host');

  // Intentionally front-load animation library work to create a measurable baseline.
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
