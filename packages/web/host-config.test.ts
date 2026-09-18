import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generate, parseHeaders } from '../../scripts/sync-host-config.mjs';
import { TIMESTAMP_ENDPOINT } from '@sealmark/core/light';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('_headers', () => {
  const rules = parseHeaders(read('./public/_headers'));

  it('applies the security headers to every path', () => {
    const everyPath = rules.find((rule: { path: string }) => rule.path === '/*');
    const keys = everyPath.headers.map((header: { key: string }) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'Referrer-Policy',
        'X-Content-Type-Options',
        'Cross-Origin-Opener-Policy',
        'Permissions-Policy',
      ]),
    );
  });

  it('allows the page to reach the timestamp relay and nothing else', () => {
    const csp = rules[0].headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value;
    expect(csp).toContain("connect-src 'self' https://rfc3161.ai.moda");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('keeps the service worker and entry page out of long-lived caches', () => {
    // Without this a published update can sit behind a stale cache for days.
    for (const path of ['/sw.js', '/index.html', '/manifest.webmanifest']) {
      const rule = rules.find((candidate: { path: string }) => candidate.path === path);
      expect(rule?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' });
    }
  });
});

describe('vercel.json', () => {
  it('matches what the headers file generates', () => {
    // Vercel cannot read _headers, so its config is generated. If this fails,
    // run: node scripts/sync-host-config.mjs
    expect(read('../../vercel.json')).toBe(generate());
  });

  it('falls back to the app for unknown paths, as _redirects does', () => {
    // Vercel ignores _redirects; without this a deep link hits Vercel's 404
    // page instead of Sealmark, and the two hosts disagree.
    const config = JSON.parse(generate());
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });
});

describe('the policy and the code agree on where timestamps go', () => {
  it('allows exactly the endpoint the signing code calls', () => {
    // The privacy page tells people this is the only host Sealmark can reach,
    // and names it from TIMESTAMP_ENDPOINT. If the endpoint moves and the policy
    // does not, that claim becomes false and timestamps break in production.
    const rules = parseHeaders(read('./public/_headers'));
    const csp = rules[0].headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value;
    expect(csp).toContain(new URL(TIMESTAMP_ENDPOINT).origin);
  });
});
