import { gsap } from 'gsap';

export function runGalleryMotion(selector) {
  const root = document.querySelector(selector);
  if (!root) {
    return;
  }

  gsap.set(root, { opacity: 0 });
  gsap.to(root, { opacity: 1, duration: 0.2 });
}

export function keepWarm() {
  return 'warm';
}
