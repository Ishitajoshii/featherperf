import { runGalleryMotion, keepWarm } from './motion.js';

const root = document.querySelector('#gallery');
if (root) {
  root.dataset.state = keepWarm();
}

runGalleryMotion('#gallery');
