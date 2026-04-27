import { defineConfig } from 'astro/config';
import { featherperf } from '@featherperf/vite-plugin';
import featherperfOptions from './featherperf.config.mjs';

const featherperfFlag = process.env.FEATHERPERF ?? 'off';
const featherperfEnabled = featherperfFlag === 'on';

export default defineConfig({
  vite: {
    plugins: featherperfEnabled
      ? [
        featherperf({
            ...featherperfOptions,
            debug: true,
            lookaheadPx: 0
          })
        ]
      : []
  }
});
