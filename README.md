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
  criticalSelectors: ['#app', '#hero', '[data-critical]']
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
- Demo script: [docs/demo-script.md](docs/demo-script.md)
- Product notes: [prd.md](prd.md)
- Hosted docs page: `https://featherperf.web.app/docs/`

## License

MIT
