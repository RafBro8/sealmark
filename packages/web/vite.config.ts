import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Every asset is bundled and served from our own origin. Nothing is fetched
  // from a CDN at runtime, which is what makes the "never uploaded" guarantee
  // checkable rather than merely stated.
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5175,
    strictPort: true,
    fs: {
      // The signature font lives in packages/core/assets.
      allow: ['../..'],
    },
  },
  worker: {
    format: 'es',
  },
});
