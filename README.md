# FeatherPerf

FeatherPerf is a conservative Vite plugin that defers safe, below-the-fold motion code so pages become interactive faster without forcing teams to rewrite their animation stack.

Today it is built for:

- Vite applications
- Astro sites, since Astro uses Vite underneath
- motion-heavy pages using `gsap`, `ScrollTrigger`, or `lottie-web`

It is intentionally not a generic lazy-loader for everything on the page. The product idea is narrower and more useful: keep first-paint content light, and wake up expensive motion only when the user is near the section that needs it.

## Why It Exists

Modern marketing and editorial sites often pay a tax for below-the-fold motion before the user ever sees it:

- GSAP bundles initialize during first load
- Lottie runtime work lands on the main thread too early
- showcase sections compete with hero content for CPU and network budget

FeatherPerf targets that specific problem. It looks for safe importer patterns and rewrites them into deferred runtime loads backed by viewport proximity and idle scheduling.

## What You Get

- npm-installable package for Vite-based sites
- conservative AST-based import and call detection
- built-in runtime scheduler for idle and near-viewport loading
- guardrails that skip risky or likely-critical code
- explicit include/exclude controls

## Install

```bash
npm install @featherperf/vite-plugin
```

`@featherperf/runtime` is installed automatically as a dependency of the plugin.

## Evaluate In 5 Minutes

If you want the fastest proof path before touching your own app:

```powershell
corepack pnpm install
corepack pnpm demo:compare
```

That command runs the local demo twice, once with FeatherPerf off and once with FeatherPerf on, then prints a readable median comparison from the saved Lighthouse summaries.

## Quick Start

### Vite

```ts
import { defineConfig } from 'vite';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  plugins: [
    featherperf({
      lookaheadPx: 300,
      idleTimeoutMs: 1500
    })
  ]
});
```

### Astro

```ts
import { defineConfig } from 'astro/config';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  vite: {
    plugins: [
      featherperf({
        include: ['src/pages/', 'src/components/motion/'],
        exclude: [/hero/i],
        criticalSelectors: ['body', 'main', '.hero']
      })
    ]
  }
});
```

## What A Good Candidate Looks Like

FeatherPerf works best when a page imports a non-critical motion module and triggers it using a static selector for a section that is below the fold.

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

At build time, FeatherPerf can rewrite that importer so the motion module is loaded later, not during first paint.

## Supported Import And Call Shapes

The current AST pass intentionally supports a small, safe set of patterns:

- direct named import calls like `runMotion('#gallery')`
- aliased named import calls like `runShowcase('#gallery')`
- namespace member calls like `showcaseMotion.run('#gallery')`

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

The current product stays conservative on purpose. FeatherPerf will skip patterns that are harder to rewrite safely or are likely to be first-paint critical:

- mixed import lines like `import foo, { bar } from './motion'`
- non-static selectors
- calls whose return value matters
- modules with top-level side effects
- hero/header/app/root targets
- unsupported third-party dependencies
- risky sync layout or scroll-sensitive behavior

This is a product decision, not an oversight. For a performance plugin, skipping uncertain cases is better than silently breaking production pages.

## Options

```ts
featherperf({
  debug: false,
  lookaheadPx: 300,
  idleTimeoutMs: 1500,
  include: ['src/components/motion/'],
  exclude: [/hero/i, 'src/components/header'],
  criticalSelectors: ['#app', '#hero', '[data-critical]']
})
```

- `debug`: logs why modules were deferred or skipped during build and runtime
- `lookaheadPx`: starts loading shortly before the trigger enters view
- `idleTimeoutMs`: idle budget used before executing the deferred import
- `include`: optional importer path filters; if set, only matching files are processed
- `exclude`: importer path filters to keep critical files out of scope
- `criticalSelectors`: extra selectors that should never be deferred

## Safety Model

FeatherPerf only defers modules that look both non-critical and behaviorally safe.

Current blockers include:

- trigger is not a static selector string
- trigger points at critical UI like hero/header/root/app shells
- module or importer path looks hero-critical
- side-effect imports
- unsupported external dependencies
- top-level side effects or control flow
- synchronous layout-sensitive behavior

This is the core product promise: safe wins first, aggressive coverage second.

## Benchmarks

Primary benchmark target: local demo site built from `demo/site`

Secondary validation target: `https://www.acmvit.in/`

Use the local benchmark as the default proof because it removes CDN, network, and remote-server variance while keeping Lighthouse's mobile throttling model.

```powershell
corepack pnpm bench:local
```

For the recommended product demo flow, use:

```powershell
corepack pnpm demo:compare
```

That is the quickest reproducible before/after story for the current repo.

Recorded local medians on `2026-04-25`:

- `off`: Performance `91`, FCP `2.708 s`, LCP `2.914 s`, TBT `64 ms`
- `on`: Performance `93`, FCP `1.804 s`, LCP `2.854 s`, TBT `132 ms`

What that means right now:

- first paint clearly improves
- LCP improves slightly
- TBT is still worse than baseline

So the current product claim is narrow and honest: FeatherPerf already helps delay non-critical motion for better paint timing, but it still needs stronger main-thread wins before it can claim full production maturity.

Detailed benchmark method and committed result sets live in [docs/benchmark-results.md](docs/benchmark-results.md).

## Current Maturity

FeatherPerf is past the “hacky benchmark script” phase and now has:

- published-package-oriented runtime wiring
- AST-based importer analysis
- automated tests for runtime loading and transform behavior
- workspace build coverage across the demo and packages

It is not yet at “install blindly on every site” maturity.

## Who Should Try It Now

- teams with Astro or Vite landing pages
- motion-heavy marketing sites
- developers who already know some sections are non-critical
- hackathon judges or early adopters looking for a focused performance product with a real safety story

## Who Should Wait

- teams expecting framework-agnostic support
- apps that need React/Next-specific integration guarantees
- codebases with highly dynamic selectors and motion orchestration patterns
- teams that need proven TBT and INP wins before rollout

## Local Demo

The repo includes a demo Astro site under `demo/site` plus a benchmark harness.

Useful commands:

```powershell
corepack pnpm build
corepack pnpm test
corepack pnpm demo:compare
corepack pnpm bench:local
```

## Docs

- Quick evaluation: [docs/getting-started.md](docs/getting-started.md)
- PRD: [docs/prd.md](docs/prd.md)
- Benchmark method: [docs/benchmark-results.md](docs/benchmark-results.md)
- Demo script: [docs/demo-script.md](docs/demo-script.md)

## Roadmap

Highest-value next steps:

1. Broaden AST support to more real-world import and call shapes.
2. Reduce remaining regex-heavy safety heuristics.
3. Add polished examples for plain Vite, Astro, and React.
4. Introduce explicit config-file support and opt-in annotations.
5. Prove wins on TBT and INP, not only FCP.
6. Add CI, publish workflow, semver discipline, and integration fixtures.

## License

MIT
