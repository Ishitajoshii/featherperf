export const PLUGIN_NAME = 'vite-plugin-featherperf';

export const SUPPORTED_HEAVY_IMPORTS = {
  gsap: 'gsap',
  ScrollTrigger: 'gsap/ScrollTrigger',
  'ScrollTrigger(dist)': 'gsap/dist/ScrollTrigger',
  'lottie-web': 'lottie-web'
} as const;

export const CLIENT_MODULE_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.mts'
] as const;

export const IMPORT_LINE_PATTERN =
  /^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/;

export const SIDE_EFFECT_IMPORT_LINE_PATTERN =
  /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/;
