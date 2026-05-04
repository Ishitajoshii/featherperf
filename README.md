# FeatherPerf

FeatherPerf is a conservative Vite plugin that defers safe, below-the-fold motion code so useful content renders first.

It is designed for motion-heavy Astro and Vite pages that lose early browser budget to decorative GSAP or `lottie-web` work before the user even reaches that section.

## Why It Matters

Many landing pages load motion code too early:

- below-the-fold animation competes with hero content
- main-thread work lands before the first useful render
- decorative sections steal CPU and network budget from content that actually matters

FeatherPerf addresses that specific problem. It is not a generic lazy-loader for everything on the page. The product claim is narrower:

- keep first-render content light
- defer safe non-critical motion
- wake that motion only when the section is near view or the page is otherwise quiet
- optionally hold first reveal until critical images and fonts are actually ready

## Live Demo

- Hosted product site: `https://featherperf.web.app/`
- Controlled compare routes:
  - baseline: `https://featherperf.web.app/compare/off/`
  - optimized: `https://featherperf.web.app/compare/on/`

## Current Proof

Recorded local medians on `2026-04-28` from the controlled demo in this repo:

Navigation proof, median of 5 fresh-profile Lighthouse runs:

- `off`: Performance `80`, FCP `2.748 s`, LCP `2.997 s`, TBT `422 ms`
- `on`: Performance `100`, FCP `0.801 s`, LCP `0.951 s`, TBT `0 ms`

Interaction proof, median of 5 fresh-profile hero-click timespan runs:

- `off`: Lighthouse INP `52 ms`, Event Timing click `48 ms`, processing delay `20 ms`
- `on`: Lighthouse INP `25 ms`, Event Timing click `24 ms`, processing delay `10 ms`

Current defensible claim:

- FeatherPerf removes non-critical motion setup from the initial navigation path
- useful content renders materially earlier on the controlled demo
- interaction responsiveness also improves on the same proof fixture

## Quick Start

Install:

```bash
npm install @featherperf/vite-plugin
```

Vite:

```ts
import { defineConfig } from 'vite';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  plugins: [
    featherperf({
      include: ['src/pages/', 'src/scripts/'],
      exclude: [/hero/i],
      criticalSelectors: ['body', 'main', '.hero']
    })
  ]
});
```

Astro:

```ts
import { defineConfig } from 'astro/config';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  vite: {
    plugins: [
      featherperf({
        include: ['src/pages/', 'src/scripts/'],
        exclude: [/hero/i],
        criticalSelectors: ['body', 'main', '.hero']
      })
    ]
  }
});
```

## Best-Fit Use Case

FeatherPerf works best when:

- the motion section is below the fold
- the importer shape is static and predictable
- the motion module is clearly non-critical
- the page uses supported packages such as `gsap` or `lottie-web`

Example importer:

```ts
import { runShowcaseMotion } from './motion/showcase';

runShowcaseMotion('#showcase');
```

Example motion module:

```ts
import { gsap } from 'gsap';
import lottie from 'lottie-web';

export function runShowcaseMotion(rootSelector: string): void {
  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }

  gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.35 });
  lottie.freeze();
  lottie.unfreeze();
}
```

## Supported Importer Shapes

The current transform intentionally supports a small safe set:

- direct named import calls
- aliased named import calls
- namespace member calls

Examples:

```ts
import { runMotion } from './motion';
runMotion('#gallery');
```

```ts
import { runMotion as runShowcase } from './motion';
runShowcase('#gallery');
```

```ts
import * as showcaseMotion from './motion';
showcaseMotion.runMotion('#gallery');
```

## Deliberate Non-Support

FeatherPerf should skip uncertain cases instead of guessing.

Current non-goals or blockers include:

- mixed import bindings such as `import foo, { bar } from './motion'`
- non-static selectors
- calls whose return value matters
- modules with top-level side effects
- hero, header, root, or app-shell targets
- unsupported third-party dependencies

## Options

```ts
featherperf({
  debug: false,
  lookaheadPx: 300,
  idleTimeoutMs: 1500,
  postLoadDelayMs: 1500,
  interactionQuietWindowMs: 750,
  include: ['src/components/motion/'],
  exclude: [/hero/i, 'src/components/header'],
  criticalSelectors: ['#app', '#hero', '[data-critical]'],
  assets: {
    enabled: true,
    criticalSelectors: ['#hero', '[data-critical]', 'img[fetchpriority="high"]'],
    waitForCriticalImages: true,
    waitForFonts: true,
    waitForCriticalLottie: true,
    includeViewportImages: true,
    revealWhenReady: true,
    maxCriticalWaitMs: 3500,
    lottieReadyTimeoutMs: 2500,
    prewarmOffscreenAssets: true,
    prewarmBackgroundImages: true,
    prewarmLazyImages: true,
    prewarmLookaheadPx: 1800,
    maxConcurrentPreloads: 4
  },
  lottie: {
    enabled: true,
    criticalSelectors: ['#hero', '[data-critical]'],
    deferOffscreen: true,
    freezeOffscreen: true,
    waitForFirstFrame: true,
    lookaheadPx: 600
  },
  report: {
    enabled: true,
    emitJson: true,
    largeAssetThresholdKb: 500,
    topAssetCount: 10
  }
})
```

- `debug`: logs why modules were deferred or skipped
- `lookaheadPx`: begins loading shortly before the trigger enters view
- `idleTimeoutMs`: idle budget before executing deferred work
- `postLoadDelayMs`: minimum wait after load before deferred work may wake
- `interactionQuietWindowMs`: keeps deferred work out of recent input windows
- `include`: optional importer path filters
- `exclude`: importer path filters for critical files
- `criticalSelectors`: selectors that should never be deferred
- `assets`: optional critical asset readiness gate for image-heavy pages
- `assets.waitForCriticalLottie`: includes critical Lottie first-frame readiness in the reveal gate
- `assets.prewarmOffscreenAssets`: starts bounded preloading after critical readiness
- `assets.prewarmBackgroundImages`: preloads CSS background images near the viewport
- `assets.prewarmLazyImages`: nudges near-viewport lazy images to load before they are visible
- `assets.prewarmLookaheadPx`: how far ahead of the viewport FeatherPerf should prewarm
- `assets.maxConcurrentPreloads`: caps background/image preload concurrency
- `lottie`: optional optimizer for `window.lottie.loadAnimation`
- `report`: optional build-time asset report for large bundle/public/HTML assets

## Asset Readiness And Prewarming

The `assets` option is the first step toward broader asset-heavy site support. When enabled, FeatherPerf injects a small runtime that waits for critical images to load/decode and for fonts to become ready before dispatching `featherperf:assets-ready`.

`revealWhenReady` is opt-in. When enabled, FeatherPerf adds a temporary loading class to the document and hides the body until critical assets resolve or `maxCriticalWaitMs` is reached. This is useful for pages that already use a loader and want to avoid revealing half-decoded hero or above-the-fold images.

After that readiness gate resolves, FeatherPerf starts prewarming near-future assets by default. It nudges lazy `<img>` elements to load and preloads CSS background image URLs found near the viewport, using a small concurrency-limited queue so those assets do not wait until the user has already reached the section.

```ts
featherperf({
  assets: {
    enabled: true,
    revealWhenReady: true,
    criticalSelectors: ['#home', '.hero', '[data-critical]'],
    maxCriticalWaitMs: 3500,
    prewarmOffscreenAssets: true,
    prewarmBackgroundImages: true,
    prewarmLazyImages: true,
    prewarmLookaheadPx: 1800,
    maxConcurrentPreloads: 4
  }
})
```

## Lottie Optimizer

Enable `lottie` to optimize `lottie-web` animation startup. FeatherPerf supports both the browser-global `window.lottie.loadAnimation` API and ESM imports from `lottie-web`. It defers offscreen animations until they are near the viewport, pauses animations that leave view, and marks containers ready after the first frame or DOM load event.

```ts
featherperf({
  assets: {
    enabled: true,
    revealWhenReady: true,
    waitForCriticalLottie: true,
    criticalSelectors: ['#home', '.hero', '[data-critical]']
  },
  lottie: {
    enabled: true,
    criticalSelectors: ['#home', '.hero', '[data-critical]'],
    deferOffscreen: true,
    freezeOffscreen: true,
    waitForFirstFrame: true
  }
})
```

For the most reliable critical detection, mark Lottie containers that affect first reveal with `data-featherperf-lottie` or include their parent section in `criticalSelectors`.

Supported ESM import shapes include:

```ts
import lottie from 'lottie-web';
lottie.loadAnimation({ container, path: '/animation.json' });
```

```ts
import { loadAnimation } from 'lottie-web';
loadAnimation({ container, path: '/animation.json' });
```

## Asset Report

Enable `report` during builds to find the biggest assets before guessing what to optimize:

```ts
featherperf({
  report: {
    enabled: true,
    emitJson: true,
    outputFile: 'featherperf-assets.json',
    largeAssetThresholdKb: 500,
    topAssetCount: 10
  }
})
```

The report includes emitted bundle assets/chunks, assets in `public/`, and HTML-referenced images, videos, fonts, Lottie JSON, and model files. Large assets are also surfaced as Vite build warnings.

For a less intrusive setup, leave `revealWhenReady` off and listen for the readiness event yourself:

```ts
window.addEventListener('featherperf:assets-ready', () => {
  document.documentElement.classList.add('app-assets-ready');
});
```

## Evaluate In 5 Minutes

If you want the fastest proof path before touching a real app:

```powershell
corepack pnpm install
corepack pnpm demo:compare
corepack pnpm demo:interaction
```

Use `demo:compare` for navigation metrics and `demo:interaction` for responsiveness metrics.

## Local Workflow

Useful commands:

```powershell
corepack pnpm build
corepack pnpm test
corepack pnpm demo:compare
corepack pnpm demo:interaction
corepack pnpm bench:local
node .\google-hosting\build-hosting.mjs
```

## Current Scope

FeatherPerf is ready to demonstrate and evaluate, with:

- AST-based importer analysis
- runtime scheduling for near-viewport and quiet-window execution
- opt-in critical image/font readiness for asset-heavy pages
- bounded near-viewport image and CSS background prewarming
- offscreen Lottie deferral and first-frame readiness for global and ESM `lottie-web`
- build-time large asset reporting and optional JSON manifest emission
- tests for transform and runtime behavior
- a hosted benchmark wrapper with before/after proof

It is not yet positioned as a universal drop-in optimization for every framework and every motion stack.

## Who Should Try It Now

- teams with Astro or Vite landing pages
- motion-heavy marketing or editorial sites
- hackathon judges evaluating a concrete browser-performance product
- developers who already know which motion sections are non-critical

## Docs

- Quick evaluation: [docs/getting-started.md](docs/getting-started.md)
- Benchmark method: [docs/benchmark-results.md](docs/benchmark-results.md)
- Hosted docs page: `https://featherperf.web.app/docs/`

## License

MIT
