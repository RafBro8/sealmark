import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
  let path = '';
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\//.test(line)) path = line.trim();
    // Only the rules for every path; per-file rules such as sw.js caching do not
    // belong on every response.
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (match && path === '/*') headers[match[1]!] = match[2]!.trim();
  }
  return headers;
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // An update waits for the signer to choose to reload. Reloading on its own
      // could discard a half-placed signature.
      registerType: 'prompt',
      // Registered from app code, not an injected inline script, which the
      // Content-Security-Policy would block.
      injectRegister: false,
      // Referenced from index.html but not from the manifest, so not added automatically.
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Sealmark',
        short_name: 'Sealmark',
        description: 'Sign PDFs, photos and text files. Your documents never leave your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f5f1',
        theme_color: '#8f2d3f',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app can ever load, including the code and fonts that
        // normally arrive on demand, so signing works with no connection at all.
        // The manifest and its icons are added by the plugin itself; listing them here
        // too would precache each twice.
        globPatterns: ['**/*.{html,js,mjs,css,ttf,svg}'],
        // pdf.js's worker is about 1.4 MB, under Workbox's 2 MB default today. The
        // higher limit is headroom, so a larger future pdf.js cannot silently fall
        // out of the offline copy.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
