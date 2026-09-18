/**
 * Checks that a Sealmark deployment is actually serving what it should.
 *
 * Two modes, the same checks:
 *   node scripts/check-deployment.mjs --dist packages/web/dist   (the built files, in CI)
 *   node scripts/check-deployment.mjs https://sealmark.app       (a live site, after deploying)
 *
 * Exits non-zero on the first real problem, so it can gate a deploy.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_HEADERS = [
  'Content-Security-Policy',
  'Referrer-Policy',
  'X-Content-Type-Options',
  'Cross-Origin-Opener-Policy',
  'Permissions-Policy',
];

const CSP_MUST_CONTAIN = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self' https://rfc3161.ai.moda",
  "object-src 'none'",
  "frame-ancestors 'none'",
];

const results = [];
const pass = (what) => results.push({ ok: true, what });
const fail = (what, detail) => results.push({ ok: false, what, detail });
/** Reported, but does not fail the run: something a real host does and a local preview does not. */
const warn = (what, detail) => results.push({ ok: true, warning: true, what, detail });

function checkIndexHtml(html) {
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
  if (inline.length === 0) pass('index.html has no inline script the policy would block');
  else fail('index.html has no inline script', `${inline.length} found: ${inline[0][0]}`);

  if (/<link[^>]+rel="manifest"/.test(html)) pass('index.html links the web app manifest');
  else fail('index.html links the web app manifest', 'no <link rel="manifest">');

  if (/<script[^>]+src="\/theme-init\.js"/.test(html)) pass('index.html loads the theme script before paint');
  else fail('index.html loads the theme script before paint', 'missing /theme-init.js');
}

function checkManifest(manifest) {
  const sizes = (manifest.icons ?? []).map((icon) => `${icon.sizes}${icon.purpose ? ` ${icon.purpose}` : ''}`);
  const installable =
    manifest.name && manifest.start_url && manifest.display === 'standalone' &&
    sizes.some((size) => size.startsWith('192x192')) && sizes.some((size) => size.startsWith('512x512'));
  if (installable) pass(`manifest is installable (${sizes.join(', ')})`);
  else fail('manifest is installable', JSON.stringify({ name: manifest.name, display: manifest.display, sizes }));

  if (sizes.some((size) => size.includes('maskable'))) pass('manifest has a maskable icon for Android');
  else fail('manifest has a maskable icon for Android', sizes.join(', '));
}

function checkServiceWorker(sw) {
  const entries = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
  if (entries.length >= 20) pass(`service worker precaches ${entries.length} files`);
  else fail('service worker precaches the whole app', `only ${entries.length} entries`);

  const needed = ['index.html', '.css', 'pdf.worker', 'Lato-Regular', 'GreatVibes-Regular'];
  const missing = needed.filter((part) => !entries.some((entry) => entry.includes(part)));
  if (missing.length === 0) pass('offline copy includes the viewer, signing fonts and page');
  else fail('offline copy includes the viewer, signing fonts and page', `missing: ${missing.join(', ')}`);
}

async function checkLive(base) {
  const origin = base.replace(/\/$/, '');
  const index = await fetch(`${origin}/`, { redirect: 'follow' });
  if (index.ok) pass(`${origin} responds (HTTP ${index.status})`);
  else return fail(`${origin} responds`, `HTTP ${index.status}`);

  for (const header of REQUIRED_HEADERS) {
    if (index.headers.get(header)) pass(`sends ${header}`);
    else fail(`sends ${header}`, 'header absent — is the host reading _headers or vercel.json?');
  }

  const csp = index.headers.get('content-security-policy') ?? '';
  for (const directive of CSP_MUST_CONTAIN) {
    if (csp.includes(directive)) pass(`policy keeps ${directive}`);
    else fail(`policy keeps ${directive}`, csp || 'no policy sent');
  }

  const html = await index.text();
  checkIndexHtml(html);

  const sw = await fetch(`${origin}/sw.js`);
  if (sw.ok) {
    pass('serves the service worker');
    checkServiceWorker(await sw.text());
    const cache = sw.headers.get('cache-control') ?? '';
    if (/no-cache|max-age=0/.test(cache)) pass('service worker is re-checked on every visit');
    else fail('service worker is re-checked on every visit', `Cache-Control: ${cache || 'absent'}`);
  } else {
    fail('serves the service worker', `HTTP ${sw.status}`);
  }

  const manifest = await fetch(`${origin}/manifest.webmanifest`);
  if (manifest.ok) {
    pass('serves the web app manifest');
    checkManifest(await manifest.json());
  } else {
    fail('serves the web app manifest', `HTTP ${manifest.status}`);
  }

  for (const icon of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png']) {
    const response = await fetch(`${origin}${icon}`);
    if (response.ok) pass(`serves ${icon}`);
    else fail(`serves ${icon}`, `HTTP ${response.status}`);
  }

  // Compression is the difference between 750 KB and 510 KB of fonts, so this has
  // to ask about the code, not about index.html. Hosts commonly serve a page that
  // small uncompressed while compressing the assets perfectly well, and checking
  // the page instead reports a problem that is not there.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin);
  const asset = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/)?.[0];
  if (!asset) {
    fail('compresses the code and fonts', 'no hashed asset found in index.html to test');
  } else {
    const response = await fetch(`${origin}${asset}`, { headers: { 'Accept-Encoding': 'br, gzip' } });
    const encoding = response.headers.get('content-encoding');
    if (encoding) pass(`compresses the code and fonts (${encoding})`);
    else if (local) warn('compresses the code and fonts', 'the local preview does not compress; a real host will');
    else fail('compresses the code and fonts', `${asset} came back with no Content-Encoding`);
  }
}

function checkDist(dir) {
  const read = (name) => readFileSync(join(dir, name), 'utf8');
  const has = (name) => existsSync(join(dir, name));

  if (!has('index.html')) return fail('build output exists', `${dir}/index.html not found — run the build first`);
  pass('build output exists');

  checkIndexHtml(read('index.html'));

  if (has('sw.js')) {
    pass('build includes the service worker');
    checkServiceWorker(read('sw.js'));
  } else {
    fail('build includes the service worker', 'sw.js missing');
  }

  if (has('manifest.webmanifest')) {
    pass('build includes the web app manifest');
    checkManifest(JSON.parse(read('manifest.webmanifest')));
  } else {
    fail('build includes the web app manifest', 'manifest.webmanifest missing');
  }

  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
    if (has(icon)) pass(`build includes ${icon}`);
    else fail(`build includes ${icon}`, 'missing — run node scripts/make-icons.mjs');
  }

  if (has('_headers')) {
    const headers = read('_headers');
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length === 0) pass('published _headers carries the security headers');
    else fail('published _headers carries the security headers', `missing: ${missing.join(', ')}`);

    const cspMissing = CSP_MUST_CONTAIN.filter((directive) => !headers.includes(directive));
    if (cspMissing.length === 0) pass('published policy is intact');
    else fail('published policy is intact', `missing: ${cspMissing.join(' | ')}`);
  } else {
    fail('published _headers is present', '_headers missing from the build output');
  }

  if (has('_redirects')) pass('published _redirects keeps deep links on the app');
  else fail('published _redirects keeps deep links on the app', '_redirects missing');
}

const target = process.argv[2] === '--dist' ? null : process.argv[2];
if (process.argv[2] === '--dist') {
  const dir = process.argv[3];
  if (!dir) {
    console.error('usage: node scripts/check-deployment.mjs --dist <directory>');
    process.exit(1);
  }
  checkDist(dir);
} else if (target) {
  await checkLive(target);
} else {
  console.error('usage: node scripts/check-deployment.mjs [--dist <directory> | <url>]');
  process.exit(1);
}

for (const result of results) {
  const label = result.warning ? ' note ' : result.ok ? '  ok  ' : ' FAIL ';
  const detail = result.ok && !result.warning ? '' : ` — ${result.detail}`;
  console.log(`${label} ${result.what}${detail}`);
}
const failures = results.filter((result) => !result.ok).length;
const notes = results.filter((result) => result.warning).length;
console.log(`\n${results.length - failures - notes} passed, ${notes} noted, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
