# Deploying Sealmark

Sealmark is a static site. There is no server, no database and no runtime
secret - the build produces a folder of files, and any static host can serve it.
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
| `_headers` | the security headers; the source `vercel.json` is generated from |
| `_redirects` | keeps deep links on the app instead of a host 404 |

`_headers` and `_redirects` are plain files copied from `packages/web/public/`.
Some hosts read them as they are; Vercel does not, and gets the same rules from
the generated `vercel.json` instead - see below.

---

## Where it is deployed now

**https://sealmark-ten.vercel.app** - Vercel project `raf-dev/sealmark`, no
custom domain attached, so `sealmark.app` is still free to point wherever you
like.

A note on how it got there: `vercel deploy` normally creates a *preview*, but
Vercel promotes a project's **first** deployment to production automatically. So
that URL is the production target of the Vercel project. It is still only a
`.vercel.app` address - "production" in Vercel's sense, not in yours. Every later
`vercel deploy` is a preview with its own URL; `--prod` is what promotes one.

---

## Host settings

The same two values everywhere:

- **Build command:** `npm run build --workspace @sealmark/web`
- **Publish directory:** `packages/web/dist`
- **Node version:** 24

| Host | Configuration | Headers |
| --- | --- | --- |
| **Vercel** *(in use)* | `vercel.json` in the repo root | from `vercel.json` |
| **Render** | static site; needs its own header config | see below |
| Cloudflare Pages | set the two values in the dashboard | reads `_headers` |

Sealmark is a folder of static files, so any of these can serve it and switching
hosts is a rebuild, not a rewrite. What differs is only how each one is told
about the security headers.

### Vercel

`vercel.json` carries the build settings, the security headers and the SPA
fallback. Vercel reads neither `_headers` nor `_redirects`, so both are
translated into it - see below.

**The GitHub repo is connected, so a push to `main` deploys on its own** -
confirmed by watching a deployment start one second after a push, with nothing
run locally. Pull requests get their own preview URLs. Note that `vercel project
inspect` does not show the Git connection, so do not read its absence there as
meaning it is not connected; push and watch `vercel ls` instead.

Deploying by hand, when you want to skip the repo:

```bash
npx vercel deploy          # a preview, with its own URL
npx vercel deploy --prod   # promote to the project's production URL
npx vercel ls sealmark     # what is deployed, and what is still building
```

### Render

Render is a fine alternative but needs more setting up, because it reads neither
`_headers` nor `_redirects` **and** has no generated config in this repo yet.
Create a **Static Site**, point it at the repo, set the build command and
publish directory above, and then add, in `render.yaml` or the dashboard:

- every header from `packages/web/public/_headers`, including the
  Content-Security-Policy - without it the privacy claim is a promise rather
  than something the browser enforces
- a rewrite of `/*` to `/index.html`

If you do move to Render, extend `scripts/sync-host-config.mjs` to emit
`render.yaml` the way it emits `vercel.json`, rather than hand-copying the
policy. Two hand-maintained copies of a security header is precisely the drift
that config generator exists to prevent.

### Keeping vercel.json honest

Vercel ignores `_headers`, so its copy is generated rather than hand-maintained:

```bash
node scripts/sync-host-config.mjs
```

`packages/web/host-config.test.ts` fails if `vercel.json` has drifted from
`_headers`, so the two cannot silently disagree - a tightened policy in one file
and a stale one in the other is exactly the failure that would go unnoticed.

The generated config also contains the equivalent of `_redirects`: a rewrite of
everything to `/index.html`. Vercel checks rewrites only after looking for a real
file, so it cannot shadow the assets, the service worker or the manifest - all
verified against the live deployment.

---

## Headers, and why each one is there

From `packages/web/public/_headers`:

- **Content-Security-Policy** - `default-src 'self'` with
  `connect-src 'self' https://rfc3161.ai.moda`. This is the privacy claim made
  enforceable: the browser itself blocks any attempt to send a document
  anywhere. The one allowed outside host is the timestamp authority, which
  receives a 67-byte hash and never the document.
- **frame-ancestors 'none'** - nobody can frame sealmark.app and overlay a fake
  signing prompt.
- **X-Content-Type-Options, Referrer-Policy, Cross-Origin-Opener-Policy,
  Permissions-Policy** - ordinary hardening; the last one switches off camera,
  microphone, geolocation and payment, none of which Sealmark asks for.
- **no-cache on `/sw.js`, `/index.html`, `/manifest.webmanifest`** - so a
  deployed fix actually reaches people who already installed the app. Hashed
  assets under `/assets/` are immutable and cached for a year.

When the embeddable version ships, `frame-ancestors 'none'` is the line that has
to change for that build, and only for that build - see
[integrating.md](integrating.md).

---

## DNS

Nothing here is done yet - `sealmark.app` points nowhere, which is why the app
is on a `.vercel.app` address for now.

When you are ready, add the domain in **Vercel → Project → Settings → Domains**
first, then create the records it displays at the registrar. Use the values
Vercel shows rather than any written here; they are per-project and they change.
The shape is always:

- apex `sealmark.app` - an A record at the host's address (an apex CNAME is not
  valid DNS, which is why hosts publish an IP for this)
- `www.sealmark.app` - a CNAME to the host, redirecting to the apex

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

- `node scripts/third-party-notices.mjs` - regenerate THIRD-PARTY-NOTICES.md if
  dependencies changed. It must ship with any build installed for a client.
- Check `measure-bundle` output hasn't crept: the first visit is the promise,
  and it is currently ~66 KB.

---

## After deploying

```bash
node scripts/check-deployment.mjs https://sealmark-ten.vercel.app
```

This is the check that matters, because it tests the **host**, not the build. It
confirms the security headers actually arrive, the policy still contains every
directive, the service worker and manifest are served, the icons exist, the
service worker is re-checked on each visit, and the code and fonts are
compressed. A host that quietly ignores its header config passes every local test
and fails here.

Against the Vercel deployment it currently passes 26 of 26. Run it again after
attaching `sealmark.app`, because a custom domain is a different route into the
host and is worth re-proving.

Then, by hand, once:

1. Open the site, sign a PDF, download it, verify it on the Verify screen.
2. Install it (address-bar install icon), then turn off the network and sign
   something offline.
3. Sign once with a timestamp to confirm `rfc3161.ai.moda` is reachable through
   the deployed policy - the one network call Sealmark makes.

---

## Shipping a fix

Push to `main`; the host rebuilds. Anyone with the app open sees the update
prompt on their next visit, because `index.html` and `sw.js` are served
`no-cache` and the app asks before reloading rather than swapping the page out
mid-signature.

**Rolling back:** every host keeps previous deployments and can promote one
instantly from its dashboard - faster than a revert commit and a rebuild. Do
that first, then fix forward. A rollback also rolls the service worker back, so
installed copies follow within a visit.

---

## Checking it on an iPhone

Everything so far has been exercised in Chromium. iOS is a genuinely different
engine, and every browser on it is WebKit, so testing Safari on a phone covers
the lot. In rough order of how likely each is to actually break:

1. **Saving the two files.** Signing produces a PDF *and* a `.sealmark.json`
   record, saved one after the other. iOS Safari has historically been awkward
   about a second programmatic download. Check that **both** land in Files - the
   record is the evidence, and a signed PDF without it is much weaker.
2. **Placing fields by touch.** Tap to place, drag to move, drag the corner
   handle to resize. The code uses pointer events, which should cover touch, but
   that has never been tried on a touchscreen. Watch for the page scrolling when
   you meant to drag a field.
3. **A photo straight from the camera.** Take a picture of a paper page and sign
   it. iPhones shoot HEIC, and Safari is the only browser that can decode it -
   so this is the one place it should work *better* than on a desktop. If it
   cannot, the app should say so and point at Settings › Camera › Formats rather
   than failing silently.
4. **Add to Home Screen**, open it from the icon, confirm it runs without Safari
   chrome around it, then turn on aeroplane mode and sign something. Offline is a
   promise the app makes on its own front page.
5. **A real PDF from Files**, ideally a few pages. pdf.js renders to canvas, and
   iOS is stricter about canvas memory than a desktop.
6. **The rest:** signature styles all render, a trusted timestamp succeeds,
   rotating to landscape does not break the layout, and the Verify screen accepts
   the two files you just saved and reports Verified.

Anything that fails here is worth reporting with the iOS version - WebKit bugs
tend to be version-specific.

---

## Deploying a copy for a client

Same build, a different domain. The parts that change per client are the
Content-Security-Policy `frame-ancestors` line, if it is embedded rather than
linked, and the branding. Ship `THIRD-PARTY-NOTICES.md` alongside it - the
dependencies are all MIT, Apache-2.0 or BSD, which permits paid installation
provided the notices travel with the product.
