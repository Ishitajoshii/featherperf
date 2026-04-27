# FeatherPerf

FeatherPerf is a conservative Vite plugin for deferring safe, below-the-fold motion code so real pages paint sooner without asking teams to rewrite their animation stack.

Current scope:

- Vite projects first
- Astro works because it sits on Vite
- targets motion-heavy modules that use `gsap`, `ScrollTrigger`, or `lottie-web`
- only defers client modules that look safe and non-critical

This is intentionally not a blanket lazy-loader. The product thesis is: ship first-paint content now, wake up heavy motion when the user is close to the section that needs it.

## Install

```bash
npm install @featherperf/vite-plugin
```

`@featherperf/runtime` is pulled in automatically by the plugin package.

## Use

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

A module is a good fit when:

- the importer calls it with a static selector like `runAnimations('#gallery')`
- the target section is below the fold
- the deferred module pulls in `gsap`, `ScrollTrigger`, or `lottie-web`
- the deferred module does not execute risky top-level work

Example:

```ts
import { runShowcaseMotion } from './motion/showcase';

runShowcaseMotion('#showcase');
```

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

- `debug`: logs why modules were deferred or skipped during build/runtime
- `lookaheadPx`: starts loading shortly before the trigger enters view
- `idleTimeoutMs`: idle budget used before executing the deferred import
- `include`: optional importer path filters; if set, only matching files are processed
- `exclude`: importer path filters to keep critical files out of scope
- `criticalSelectors`: extra selectors that should never be deferred

## Safety Model

FeatherPerf refuses to defer modules when it sees signals that the code is probably first-paint critical or behaviorally risky. Current blockers include:

- non-static trigger selectors
- hero/header/app/root style selectors
- side-effect imports
- unsupported third-party imports
- obvious top-level side effects or control flow
- synchronous layout or scroll-sensitive runtime behavior
- mixed import lines such as `import foo, { bar } from './motion'`

That last rule is deliberate for now. The current release stays conservative instead of rewriting multi-binding imports in ways that could break production code.

## Benchmarks

Primary benchmark target: local demo site built from `demo/site`

Secondary validation target: `https://www.acmvit.in/`

Use the local benchmark as the default proof because it removes CDN, network, and remote-server variance while keeping Lighthouse's mobile throttling model.

```powershell
corepack pnpm bench:local
```

Recorded local medians on `2026-04-25`:

- `off`: Performance `91`, FCP `2.708 s`, LCP `2.914 s`, TBT `64 ms`
- `on`: Performance `93`, FCP `1.804 s`, LCP `2.854 s`, TBT `132 ms`

Interpretation:

- the prototype clearly improves first paint
- it does not yet beat the baseline on TBT
- the next product milestone is proving both safer paint timing and better main-thread behavior

Detailed method and committed result sets live in [docs/benchmark-results.md](docs/benchmark-results.md).

## Dev

```powershell
corepack pnpm build
corepack pnpm test
corepack pnpm --filter @featherperf/vite-plugin report
```

## Product Gaps

The repo is now closer to a real package, but not finished. The highest-value next steps are:

1. Replace the regex transform with AST-based analysis and rewriting.
2. Add framework examples for plain Vite, Astro, and React.
3. Introduce config-file support and clearer opt-in annotations for sections that are safe to defer.
4. Prove wins on TBT and INP, not only FCP.
5. Add CI, publish workflow, semver discipline, and integration fixtures.
