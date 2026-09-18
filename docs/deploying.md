# Deploying Sealmark

Sealmark is a static site. There is no server, no database and no runtime
secret — the build produces a folder of files, and any static host can serve it.
That is also the privacy claim: nothing to deploy means nothing to breach.

This is the checklist for putting it on **sealmark.app**, and for putting a copy
on a client's own domain later.

---

## What the build produces

```bash
npm ci
npm run build --workspace @sealmark/web
```

Everything lands in `packages/web/dist`:

| File | Why it matters |
| --- | --- |
| `index.html`, `assets/*` | the app; hashed filenames, cached forever |
| `sw.js`, `workbox-*.js` | the service worker that makes it work offline |
| `manifest.webmanifest`, `icon-*.png` | what makes it installable |
| `_headers` | security headers, read by Cloudflare Pages and Netlify |
| `_redirects` | keeps deep links on the app instead of a host 404 |

`_headers` and `_redirects` are plain files copied from
`packages/web/public/`. Hosts that read them need no dashboard configuration.
Hosts that don't need `vercel.json` — see below.

---

## Host settings

The same two values everywhere:

- **Build command:** `npm run build --workspace @sealmark/web`
- **Publish directory:** `packages/web/dist`
- **Node version:** 24

| Host | Configuration | Headers |
| --- | --- | --- |
| **Cloudflare Pages** | set the two values in the dashboard | reads `_headers` |
| **Netlify** | `netlify.toml` in the repo root | reads `_headers` |
| **Vercel** | `vercel.json` in the repo root | from `vercel.json` |

Cloudflare Pages is the recommendation for sealmark.app: it reads `_headers`
directly, so the security policy lives in one file next to the code rather than
in a dashboard nobody reviews.

### Keeping vercel.json honest

Vercel ignores `_headers`, so its copy is generated rather than hand-maintained:

```bash
node scripts/sync-host-config.mjs
```

`packages/web/host-config.test.ts` fails if `vercel.json` has drifted from
`_headers`, so the two cannot silently disagree — a tightened policy in one file
and a stale one in the other is exactly the failure that would go unnoticed.

---

## Headers, and why each one is there

From `packages/web/public/_headers`:

- **Content-Security-Policy** — `default-src 'self'` with
  `connect-src 'self' https://rfc3161.ai.moda`. This is the privacy claim made
  enforceable: the browser itself blocks any attempt to send a document
  anywhere. The one allowed outside host is the timestamp authority, which
  receives a 67-byte hash and never the document.
- **frame-ancestors 'none'** — nobody can frame sealmark.app and overlay a fake
  signing prompt.
- **X-Content-Type-Options, Referrer-Policy, Cross-Origin-Opener-Policy,
  Permissions-Policy** — ordinary hardening; the last one switches off camera,
  microphone, geolocation and payment, none of which Sealmark asks for.
- **no-cache on `/sw.js`, `/index.html`, `/manifest.webmanifest`** — so a
  deployed fix actually reaches people who already installed the app. Hashed
  assets under `/assets/` are immutable and cached for a year.

When the embeddable version ships, `frame-ancestors 'none'` is the line that has
to change for that build, and only for that build — see
[integrating.md](integrating.md).

---

## DNS

At the registrar for **sealmark.app**, pointing at the host:

- apex `sealmark.app` — the host's A/ALIAS record (Cloudflare Pages and Netlify
  both provide one; an apex CNAME is not valid DNS)
- `www.sealmark.app` — CNAME to the host, redirecting to the apex

`.app` is on the HSTS preload list, so browsers refuse plain HTTP for it
outright. There is no http→https redirect to configure and no way to serve the
site insecurely by accident. Certificates are issued by the host automatically;
allow up to an hour before the first one is live.

---

## Before going live

```bash
npm run typecheck
npm test
npm run build --workspace @sealmark/web
node scripts/check-deployment.mjs --dist packages/web/dist
node scripts/measure-bundle.mjs
```

CI runs exactly this on every push to `main`
(`.github/workflows/ci.yml`), so a broken build never reaches the host.

Also worth doing once before the first deploy:

- `node scripts/third-party-notices.mjs` — regenerate THIRD-PARTY-NOTICES.md if
  dependencies changed. It must ship with any build installed for a client.
- Check `measure-bundle` output hasn't crept: the first visit is the promise,
  and it is currently ~65 KB.

---

## After deploying

```bash
node scripts/check-deployment.mjs https://sealmark.app
```

This is the check that matters, because it tests the **host**, not the build. It
confirms the security headers actually arrive, the policy still contains every
directive, the service worker and manifest are served, the icons exist, the
service worker is re-checked on each visit, and responses are compressed. A host
that quietly ignores `_headers` passes every local test and fails here.

Then, by hand, once:

1. Open the site, sign a PDF, download it, verify it on the Verify screen.
2. Install it (address-bar install icon), then turn off the network and sign
   something offline.
3. Sign once with a timestamp to confirm `rfc3161.ai.moda` is reachable through
   the deployed policy — the one network call Sealmark makes.

---

## Shipping a fix

Push to `main`; the host rebuilds. Anyone with the app open sees the update
prompt on their next visit, because `index.html` and `sw.js` are served
`no-cache` and the app asks before reloading rather than swapping the page out
mid-signature.

**Rolling back:** every host keeps previous deployments and can promote one
instantly from its dashboard — faster than a revert commit and a rebuild. Do
that first, then fix forward. A rollback also rolls the service worker back, so
installed copies follow within a visit.

---

## Deploying a copy for a client

Same build, a different domain. The parts that change per client are the
Content-Security-Policy `frame-ancestors` line, if it is embedded rather than
linked, and the branding. Ship `THIRD-PARTY-NOTICES.md` alongside it — the
dependencies are all MIT, Apache-2.0 or BSD, which permits paid installation
provided the notices travel with the product.
