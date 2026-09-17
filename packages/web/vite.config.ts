import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The security headers from public/_headers, the same file static hosts serve.
 *
 * Applied to `vite preview` so the production build can be tested under the
 * exact Content-Security-Policy it ships with. Not applied to the dev server,
 * whose hot reloading relies on inline scripts that policy forbids.
 */
function productionHeaders(): Record<string, string> {
  const file = fileURLToPath(new URL('./public/_headers', import.meta.url));
  const headers: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (match) headers[match[1]!] = match[2]!.trim();
  }
  return headers;
}

export default defineConfig({
  plugins: [react()],
  // Every asset is bundled and served from our own origin. Nothing is fetched
  // from a CDN at runtime, which is what makes the "never uploaded" guarantee
  // checkable rather than merely stated.
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Read by scripts/measure-bundle.mjs to tell first-visit code from the rest.
    manifest: true,
    // pdf.js's worker and fontkit are large, but both now load only on demand,
    // so the default 500 KB warning no longer points at a first-visit cost.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Readable names for the shared libraries, instead of whichever of our
        // modules happened to import them first.
        manualChunks: {
          'pdf-lib': ['pdf-lib'],
          fontkit: ['@pdf-lib/fontkit'],
          pkijs: ['pkijs', 'asn1js'],
        },
      },
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    fs: {
      // The signature font lives in packages/core/assets.
      allow: ['../..'],
    },
  },
  preview: {
    port: 5176,
    strictPort: true,
    headers: productionHeaders(),
  },
  worker: {
    format: 'es',
  },
});
