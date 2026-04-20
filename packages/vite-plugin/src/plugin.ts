import type { Plugin } from 'vite';
import type { FeatherPerfOptions } from './types';

export function featherperf(options: FeatherPerfOptions = {}): Plugin {
  return {
    name: 'vite-plugin-featherperf',
    apply: 'serve',
    // Plugin logic
  };
}
