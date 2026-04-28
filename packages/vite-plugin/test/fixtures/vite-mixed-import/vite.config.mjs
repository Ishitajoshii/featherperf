import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { featherperf } from '../../../dist/index.js';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureDirectory, '../../../../..');

export default {
  plugins: [
    featherperf({
      include: ['src/main.js']
    })
  ],
  resolve: {
    alias: {
      gsap: path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules', 'gsap', 'index.js')
    }
  },
  build: {
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
};
