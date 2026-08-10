import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Deliberately separate from vite.config.ts: the CRXJS plugin rewrites inputs
// and generates a manifest, neither of which should run during unit tests.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
