# Getting Started

## Fastest Proof Path

If you want to verify the product claim before touching a real app, run the controlled demo in this repo:

```powershell
corepack pnpm install
corepack pnpm demo:compare
corepack pnpm demo:interaction
```

Those commands run the demo with:

- `FEATHERPERF=off`
- `FEATHERPERF=on`

Use `demo:compare` for navigation metrics such as FCP, LCP, and TBT.

Use `demo:interaction` for responsiveness metrics such as Lighthouse timespan INP and browser Event Timing.

## What Success Looks Like

FeatherPerf is strongest when:

- first paint improves materially
- the deferred section is clearly below the fold
- interaction stays flat or improves
- the motion module is built around a supported importer shape

Be careful not to overclaim if:

- the target section is actually hero-critical
- the page is dominated by media bytes rather than JavaScript scheduling
- the win disappears on the real page you care about

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
      include: ['src/pages/', 'src/scripts/'],
      exclude: [/hero/i],
      criticalSelectors: ['body', 'main', '.hero']
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

- keep the deferred section below the fold
- use static selector strings
- isolate non-critical motion into its own module
- keep hero and app-shell selectors protected
- use `include` and `exclude` to keep rollout narrow at first
- compare off and on under the same measurement method

## Next References

- Product overview: [README.md](../README.md)
- Benchmark method: [benchmark-results.md](./benchmark-results.md)
- Demo narrative: [demo-script.md](./demo-script.md)
- Hosted docs: `https://featherperf.web.app/docs/`
