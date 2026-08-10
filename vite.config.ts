import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import manifest from './src/manifest.config.ts';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Content script budget is 250KB gz (CLAUDE.md definition of done).
    // Warn well before that so regressions surface during development.
    chunkSizeWarningLimit: 500,
  },
  server: {
    // CRXJS needs a stable port for the HMR websocket the extension connects to.
    port: 5173,
    strictPort: true,
  },
});
