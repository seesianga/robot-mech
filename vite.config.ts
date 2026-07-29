import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
// @ts-expect-error — plain .mjs plugin, no types needed
import { siteTruth } from './scripts/vite-site-truth.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    // Substitutes %%FACT:...%% in index.html from the game's own data and fails
    // the build on any claim that contradicts it. See the plugin for why.
    siteTruth({ root, verbose: process.env.TRUTH_VERBOSE === '1' }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        play: fileURLToPath(new URL('play.html', import.meta.url)),
        viewer: fileURLToPath(new URL('viewer.html', import.meta.url)),
        assetcheck: fileURLToPath(new URL('assetcheck.html', import.meta.url)),
        sitecap: fileURLToPath(new URL('sitecap.html', import.meta.url)),
      },
    },
  },
  server: { port: 5199 },
  preview: { port: 4199 },
});
