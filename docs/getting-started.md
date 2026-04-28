# Getting Started

## 5-Minute Evaluation

If you want to know whether FeatherPerf is real, do this:

```powershell
corepack pnpm install
corepack pnpm demo:compare
corepack pnpm demo:interaction
```

Those commands run the local demo twice:

- once with `FEATHERPERF=off`
- once with `FEATHERPERF=on`

`demo:compare` prints the navigation delta.

`demo:interaction` prints the user-input responsiveness delta.

## What To Look For

FeatherPerf is currently strongest when:

- first paint improves
- user-input latency stays flat or improves
- the deferred section is clearly below the fold
- the motion module is using `gsap`, `ScrollTrigger`, or `lottie-web`
- the code shape matches supported importer patterns

Be careful not to overclaim if:

- the demo win disappears on your real page
- the page is dominated by media bytes instead of JS scheduling
- the target section is hero-critical

## Try It In A Real App

Install:

```bash
npm install @featherperf/vite-plugin
```

Add the plugin:

```ts
import { defineConfig } from 'vite';
import { featherperf } from '@featherperf/vite-plugin';

export default defineConfig({
  plugins: [
    featherperf({
      include: ['src/components/motion/'],
      exclude: [/hero/i],
      criticalSelectors: ['#app', '#hero', '[data-critical]']
    })
  ]
});
```

Use a supported importer shape:

```ts
import * as showcaseMotion from './motion/showcase';

showcaseMotion.run('#gallery');
```

## Adoption Checklist

- keep the target section below the fold
- use static selector strings
- isolate non-critical motion into its own module
- avoid mixed import bindings for deferred modules
- use `include` and `exclude` to stay explicit at first
- tune `postLoadDelayMs` and `interactionQuietWindowMs` if you see deferred work waking up too early
- compare off/on under the same navigation and interaction methods

## Where To Go Next

- Product overview: [README.md](../README.md)
- PRD: [prd.md](./prd.md)
- Benchmark method: [benchmark-results.md](./benchmark-results.md)
- Demo narrative: [demo-script.md](./demo-script.md)
