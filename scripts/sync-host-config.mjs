/**
 * Keeps vercel.json in step with packages/web/public/_headers.
 *
 * The headers file is the single source of truth: Cloudflare Pages and Netlify
 * read it directly, Vercel does not and needs the same rules in its own config.
 * Writing them by hand in two places is how a Content-Security-Policy quietly
 * drifts, so this generates one from the other. host-config.test.ts fails if the
 * generated file is stale.
 *
 * Run: node scripts/sync-host-config.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const headersFile = new URL('../packages/web/public/_headers', import.meta.url);
const vercelFile = new URL('../vercel.json', import.meta.url);

/** Parses a Netlify/Cloudflare `_headers` file into path rules. */
export function parseHeaders(text) {
  const rules = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    if (/^\S/.test(line)) {
      current = { path: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (match && current) current.headers.push({ key: match[1], value: match[2].trim() });
  }
  return rules;
}

/** `_headers` path patterns in Vercel's `source` syntax. */
function toSource(path) {
  return path === '/*' ? '/(.*)' : path;
}

export function buildVercelConfig(rules) {
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    // The web app is one workspace of a monorepo; Vercel builds from the repo root.
    buildCommand: 'npm run build --workspace @sealmark/web',
    outputDirectory: 'packages/web/dist',
    installCommand: 'npm ci',
    framework: null,
    headers: rules.map((rule) => ({ source: toSource(rule.path), headers: rule.headers })),
    // The equivalent of _redirects, which Vercel does not read. Rewrites are
    // checked only after a real file fails to match, so this never shadows the
    // assets, the service worker or the manifest — it just means an unknown path
    // opens the app rather than the host's 404 page, as on every other host.
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  };
}

export function generate() {
  return `${JSON.stringify(buildVercelConfig(parseHeaders(readFileSync(headersFile, 'utf8'))), null, 2)}\n`;
}

// Only write when run directly, so the test can import and compare instead.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  writeFileSync(vercelFile, generate());
  console.log('vercel.json regenerated from packages/web/public/_headers');
}
