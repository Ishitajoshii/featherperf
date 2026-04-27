# Getting Started

## 5-Minute Evaluation

If you want to know whether FeatherPerf is real, do this:

```powershell
corepack pnpm install
corepack pnpm demo:compare
```

That command runs the local demo twice:

- once with `FEATHERPERF=off`
- once with `FEATHERPERF=on`

Then it prints a human-readable median comparison using the saved Lighthouse summaries.

## What To Look For

FeatherPerf is currently strongest when:

- first paint improves
- the deferred section is clearly below the fold
- the motion module is using `gsap`, `ScrollTrigger`, or `lottie-web`
- the code shape matches supported importer patterns

Be careful not to overclaim if:

- TBT gets worse
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
- compare off/on under the same benchmark method

## Where To Go Next

- Product overview: [README.md](../README.md)
- PRD: [prd.md](./prd.md)
- Benchmark method: [benchmark-results.md](./benchmark-results.md)
- Demo narrative: [demo-script.md](./demo-script.md)
