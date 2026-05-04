# @featherperf/vite-plugin

FeatherPerf is a conservative Vite plugin that defers safe, below-the-fold motion code so pages become interactive faster without forcing teams to rewrite their animation stack.

## Install

```bash
npm install @featherperf/vite-plugin
```

`@featherperf/runtime` is installed automatically as a dependency of the plugin.

## Quick Start

```ts
import { defineConfig } from 'vite';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  plugins: [
    featherperf({
      lookaheadPx: 300,
      idleTimeoutMs: 1500,
      assets: {
        enabled: true,
        revealWhenReady: true,
        criticalSelectors: ['#hero', '[data-critical]'],
        maxCriticalWaitMs: 3500,
        prewarmOffscreenAssets: true,
        prewarmBackgroundImages: true
      },
      lottie: {
        enabled: true,
        criticalSelectors: ['#hero', '[data-critical]'],
        deferOffscreen: true,
        freezeOffscreen: true
      }
    })
  ]
});
```

## Astro

```ts
import { defineConfig } from 'astro/config';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  vite: {
    plugins: [
      featherperf({
        include: ['src/pages/', 'src/components/motion/'],
        exclude: [/hero/i],
        criticalSelectors: ['body', 'main', '.hero'],
        assets: {
          enabled: true,
          revealWhenReady: true,
          criticalSelectors: ['.hero', '[data-critical]']
        }
      })
    ]
  }
});
```

## Asset Readiness

Enable `assets` for image-heavy pages that should not reveal until critical images and fonts are ready:

```ts
featherperf({
  assets: {
    enabled: true,
    revealWhenReady: true,
    criticalSelectors: ['#home', '.hero', '[data-critical]'],
    waitForCriticalImages: true,
    waitForFonts: true,
    waitForCriticalLottie: true,
    includeViewportImages: true,
    maxCriticalWaitMs: 3500,
    lottieReadyTimeoutMs: 2500,
    prewarmOffscreenAssets: true,
    prewarmBackgroundImages: true,
    prewarmLazyImages: true,
    prewarmLookaheadPx: 1800,
    maxConcurrentPreloads: 4
  }
})
```

FeatherPerf emits `featherperf:assets-ready` when the gate resolves. `revealWhenReady` is optional; without it, the event still fires but the plugin does not hide the page.

After readiness, FeatherPerf prewarms near-viewport lazy images and CSS background image URLs by default. This keeps below-the-fold sections from looking blank when a user scrolls quickly, while `maxConcurrentPreloads` prevents the page from flooding the network.

## Lottie

Enable `lottie` when the site uses `lottie-web`:

```ts
featherperf({
  assets: {
    enabled: true,
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

FeatherPerf defers offscreen `loadAnimation()` calls until the container is near view, pauses animations that leave view, and dispatches `featherperf:lottie-ready` after the first frame. It supports both global `window.lottie.loadAnimation` usage and ESM imports such as `import lottie from 'lottie-web'` or `import { loadAnimation } from 'lottie-web'`.

Mark critical containers with `data-featherperf-lottie` when automatic detection is not enough.

## Docs

- Repository: https://github.com/Ishitajoshii/featherperf
- Full README: https://github.com/Ishitajoshii/featherperf#readme

## License

MIT
