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
      idleTimeoutMs: 1500
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
        criticalSelectors: ['body', 'main', '.hero']
      })
    ]
  }
});
```

## Docs

- Repository: https://github.com/Ishitajoshii/featherperf
- Full README: https://github.com/Ishitajoshii/featherperf#readme

## License

MIT
