import { defineConfig } from 'astro/config';
import { featherperf } from '@featherperf/vite-plugin';
import featherperfOptions from './featherperf.config.mjs';

const featherperfFlag = process.env.FEATHERPERF ?? 'off';
const featherperfEnabled = featherperfFlag === 'on';
const featherperfDebug = process.env.FEATHERPERF_DEBUG === 'on';

export default defineConfig({
  vite: {
    plugins: featherperfEnabled
      ? [
        featherperf({
            ...featherperfOptions,
            debug: featherperfDebug,
            lookaheadPx: 0
          })
        ]
      : []
  }
});
