import { defineConfig } from 'astro/config';
import { featherperf } from '@featherperf/vite-plugin';

const featherperfFlag = process.env.FEATHERPERF ?? 'off';
const featherperfEnabled = featherperfFlag === 'on';

export default defineConfig({
  vite: {
    plugins: featherperfEnabled
      ? [
        featherperf({
            debug: true,
            lookaheadPx: 0
          })
        ]
      : []
  }
});
