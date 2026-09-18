import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generate, parseHeaders } from '../../scripts/sync-host-config.mjs';

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
});
