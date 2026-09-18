# Sealmark

Tamper-evident electronic signatures for PDFs, photos of paper documents, and text files.

Sealmark stamps a signature onto a document and produces a record that proves
**what was signed**, **that the signed file has not changed since**, and — when the
document started life as photos or a text file — **what it was made from**. Alter
one byte of a sealed document — a digit in a price, a word in a clause, a scrap of
metadata — and verification fails.

> **Status:** Signing, verification in the browser and on the command line,
> in-browser document conversion, signature styles, trusted timestamps, a 65 KB
> first visit and offline use are complete and tested. Remote signing remains.
> See [Roadmap](#roadmap).

---

## How the tamper-evidence works

Signing produces two files:

| File | Purpose |
| --- | --- |
| `contract.signed.pdf` | The document, with signature fields stamped and a signature certificate appended as the final page. |
| `contract.signed.sealmark.json` | The audit record. Holds the SHA-256 of the original document, the SHA-256 of the sealed document, the signer, the timestamp, and the full event trail. |

`sealmark verify` recomputes the hash of the PDF and compares it to the record.
Because SHA-256 is collision-resistant, any modification produces a different
digest, and the check fails. The record is the evidence — keep it with the
document.

Signing is **reproducible**: identical inputs at an identical timestamp produce
byte-identical output, so a third party can re-derive the hash themselves rather
than taking the record's word for it.

### What this is, and what it is not

This is a hash-based integrity and audit system, which is what the US ESIGN Act
and UETA actually require of an electronic signature — intent to sign, association
of the signature with the record, and retention of the record. It is deliberately
**not** a PAdES cryptographic signature: there is no certificate authority, no
signing certificate, and no green tick in Adobe Reader. Those require a purchased
certificate and solve a different problem — proving *organisational identity*
rather than *document integrity*.

Optionally, a record also carries an RFC 3161 trusted timestamp from DigiCert,
which replaces reliance on the signing machine's clock with an independent,
signed statement of when the signed PDF existed. See
[Trusted timestamps](#trusted-timestamps).

Nothing here is legal advice. ESIGN carves out wills, certain real-estate
instruments and some court filings; don't use this for those.

---

## The browser app

```bash
npm install
npm run dev --workspace @sealmark/web
```

Open the document, type your name, pick a field, and click where it belongs.
Fields drag to reposition, resize from the corner, and nudge with the arrow keys.
The on-page preview uses the same font and the same fitting rules as the stamped
output, so what you place is what you get.

Nothing is uploaded. The document is read through a file picker, processed in the
page, and written back out as a download — open the Network tab while you sign
and you will see only the app's own assets load.

In production the `connect-src 'self'` rule in
[`packages/web/public/_headers`](packages/web/public/_headers) makes that a
browser-enforced constraint rather than a promise. It is read automatically by
Cloudflare Pages and Netlify; on another host, serve the same
`Content-Security-Policy` header.

## Offline, and installable

After one visit Sealmark works with no connection, and it can be installed from
the browser — **Install Sealmark** in Chrome and Edge, **Add to Home Screen** on a
phone — to open in its own window like any other app.

A service worker keeps a copy of every file the app can load, including the code
and fonts that normally arrive on demand, so opening a document, choosing any
signature style and signing all work offline. Only trusted timestamps need a
connection: offline, the header says so, signing still completes, and **Try again**
adds the timestamp once the connection returns.

Tested the direct way: with the production build loaded, the server was stopped
entirely. The page reloaded from the service worker, opened a PDF, rendered all five
signature styles and signed a document, fetching zero bytes from the network.

**Updates never interrupt signing.** When a new version is published, a notice
offers **Reload** or **Later**; the new version waits until the signer chooses,
because a reload in the middle of placing fields would lose them. Tested by serving
a changed build to a page running the saved one: the notice appeared, the page kept
running the old version, and Reload switched it.

**What this costs.** The page itself still becomes usable after 65 KB. The service
worker then saves the rest in the background — 28 files, 1.8 MB gzipped or about
1.5 MB with Brotli — which is what makes offline use possible. `_headers` tells
hosts to re-check `sw.js`, `index.html` and the manifest on every visit, so a
published update reaches people instead of sitting behind a long cache.

The app icons are rendered from the seal logo by `node scripts/make-icons.mjs`,
including a maskable version that keeps the seal inside Android's safe zone.

## Verifying a signed document

Switch the header to **Verify** and drop in the signed PDF with its
`.sealmark.json` record. Add the unsigned original, or the photos, text or Word file
the document came from, and those are checked too — in the tab, like signing.

| Result | Meaning |
| --- | --- |
| Verified | The PDF is byte-for-byte the document the record describes. |
| Changed since signing | The PDF's certificate names this record, but its contents no longer match. |
| These files do not belong together | The PDF's certificate names a different record than the one supplied. |
| Does not match | The contents differ and the PDF has no certificate to say why. |

Telling "changed" from "wrong record" relies on the record id printed on the
certificate page, read back out of the PDF. With the source photos or text, the
page also repeats the conversion and reports whether it reproduces the signed PDF
exactly.

The screen states its own limit plainly: a matching record proves the PDF has not
changed relative to that record, not that the record is genuine. Someone who edits
a PDF could write a fresh record for it. A trusted timestamp narrows that gap: a
forged record carries a timestamp from when it was forged, and a record whose
claimed signing time disagrees with its timestamp is flagged.

## Trusted timestamps

Turn on **Add a trusted timestamp** before signing, or pass `--timestamp` on the
command line. Sealmark sends the signed PDF's SHA-256 — only that — to a timestamp
authority, and stores the signed reply in the record.

```
time      DigiCert SHA256 RSA4096 Timestamp Responder 2026 1 confirms the signed PDF existed at 2026-09-17T02:53:49.000Z.
```

**Why it matters.** Without a timestamp, the signing time is whatever the signer's
computer said. With one, an independent authority has signed a statement that this
exact file existed at that moment. A forger can edit a PDF and write a new record,
but cannot get an authority to sign a timestamp for a date in the past. Verification also flags a
record whose claimed signing time disagrees with its timestamp — exactly what a
backdated record looks like:

```
time      But the record claims it was signed 200 days earlier. Trust the timestamp, not the record's own time.
```

**How it is checked.** A timestamp is accepted only if all of these hold: it is for
this file's hash; it answers the request that was sent (a random nonce stops an old
reply being replayed); the certificate that signed it is authorised specifically
for timestamping; that certificate chains to a pinned root, judged as of the timestamp's own time so
it keeps verifying after certificates expire; and the signature itself is valid.
The purpose check matters: the same roots also stand behind ordinary website and
code-signing certificates, and without it any of those could forge a timestamp. The
tests include that forgery.

**Pinned roots.** [`packages/core/src/tsa-roots.ts`](packages/core/src/tsa-roots.ts)
holds DigiCert Trusted Root G4, DigiCert Assured ID Root CA and USERTrust RSA
Certification Authority (Sectigo), each with a fingerprint matching its authority's
published value and the Windows trust store. Trust is an explicit, reviewable
decision in one file rather than whatever a machine happens to trust.

**Why a relay.** A browser may only call a server that allows it, and of eight
public timestamp authorities tested, none did — except `rfc3161.ai.moda`, a free
relay that forwards to established authorities. Sampled over 40 requests it used
DigiCert 38 times and Sectigo twice, so both are pinned. Should it route a request
to an authority Sealmark does not trust, Sealmark asks again, up to three times,
and never accepts the untrusted reply. Trust rests on the authority's signature,
not on the relay, so if the relay ever disappears, replacing it does not invalidate
a single existing timestamp.

**Not locked in.** The stored token is a standard RFC 3161 response; standard tools
verify it without Sealmark:

```bash
# token.der is the record's timestamp.token, base64-decoded;
# -CAfile is the root of whichever authority signed it (here DigiCert)
openssl ts -verify -in token.der -token_in -data contract.signed.pdf -CAfile DigiCertTrustedRootG4.pem
```

**When it cannot be reached** — offline, or the relay is down — signing still
completes, and the result says so plainly with a **Try again** button. On the
command line, `sealmark timestamp <record>` adds one later. A timestamp added later
proves the document existed by then rather than when it was signed, and the output
says so.

## Signing things that are not PDFs

| You have | What happens | Where |
| --- | --- | --- |
| A PDF | Signed as it is. | In the tab |
| Photos of a paper document (JPEG, PNG, WebP, and HEIC in Safari) | One page per photo, ordered by filename so `page-2` comes before `page-10`, each turned upright from its EXIF orientation. | In the tab |
| A plain text file | Laid out on pages with the same font the certificate uses. | In the tab |
| A Word, Pages, Excel or similar document | You are shown how to save it as a PDF in the app it came from, then sign that PDF. | Your own app |

Office documents are deliberately not converted. Converters that run in a browser
do not reproduce layout faithfully, and a signed contract has to look exactly like
the one that was agreed. Word, Google Docs and Pages all export an accurate PDF in
two clicks.

### What the record says about the source

The record names every source file with its SHA-256, and distinguishes two cases:

- **Converted** — Sealmark made the PDF. Conversion is deterministic, so anyone
  holding the original photos can convert them again and get byte-for-byte the PDF
  that was signed. `sealmark verify --source` does exactly that, and the browser and
  Node produce identical output from the same files.
- **Declared** — you exported the PDF from Word and told Sealmark which `.docx` it
  came from. Its fingerprint is recorded so it can be matched later, but the record
  and the certificate both say this is your declaration, because Sealmark did not
  perform the export.

A photo in a format the PDF library cannot embed directly, such as WebP, is decoded
by the browser first. Browsers do not promise byte-identical re-encoding, so the
record marks that file, and verification will match its fingerprint but declines to
claim the conversion can be repeated.

## Signature styles

Five styles, each shown with the signer's own name so the choice is made by looking
at the signature rather than at a font name:

| Style | Character | Face |
| --- | --- | --- |
| Classic | Formal, with flourishes | Great Vibes |
| Graceful | Round and open | Parisienne |
| Relaxed | Light, everyday handwriting | Sacramento |
| Bold | Confident brush strokes | Yellowtail |
| Quill | Old-fashioned pen and ink | Meddon |

The preview on the page is drawn from the same font file that gets stamped, and the
chosen style is written into the record and onto the certificate. The browser
remembers the last style used. On the command line: `--style quill`.

Script fonts were admitted on coverage, not looks. Fifteen candidates were checked
against Polish, Western and Eastern European letters; several of the most
convincing "real signature" faces cannot write `ł` or `č` and were rejected, and a
test holds every style to that bar. If a name still contains a character a style
cannot write, that style is greyed out with the reason rather than failing at the
moment of signing.

Faces differ in proportion: in the same box Quill's tall loops stamp noticeably
smaller than Classic. The preview shows this before signing — make the field taller
for a larger Quill signature.

### Any language a name comes in

Dates, text fields, converted text and the certificate use Lato, which covers
Latin, Greek and Cyrillic scripts. PDF's built-in fonts cannot encode characters
like `ł` at all, so before this a signer named Rafał could not sign. Text a font has
no glyphs for is refused with the characters listed, rather than silently drawn as
empty boxes.

## Command line

```bash
npx tsx scripts/make-fixture.ts      # generates a sample agreement to sign
```

### Sign

```bash
npx tsx packages/cli/src/index.ts sign fixtures/sample-agreement.pdf \
  --name "Ada Lovelace" \
  --email "ada@example.com" \
  --field "signature:1:60,123,230,24" \
  --field "date:1:334,123,130,20" \
  --out fixtures/out/agreement.signed.pdf
```

```
sealed  fixtures/out/agreement.signed.pdf
record  fixtures/out/agreement.signed.sealmark.json
id      SM-2E38EA5F5023
sha256  7523f8fa 6de7aeab 25717b6f 5efd49c5 61d6b0ae 05f80411 15a5b9b6 b9b18cbc
```

### Verify

```bash
npx tsx packages/cli/src/index.ts verify fixtures/out/agreement.signed.pdf \
  --original fixtures/sample-agreement.pdf
```

```
verified  fixtures/out/agreement.signed.pdf
          Document matches record SM-2E38EA5F5023.
          Signed by Ada Lovelace at 2026-09-16T02:59:30.147Z.

origin    fixtures/sample-agreement.pdf is the document that was signed.
```

Change a single byte of the signed PDF and the same command reports `TAMPERED`
and exits with code `2`, which makes it usable in a script or a CI check.

### Photos, text, and exported Word documents

```bash
# Photos of a paper contract, converted and signed in one step
npx tsx packages/cli/src/index.ts sign scans/page-1.jpg scans/page-2.jpg \
  --name "Rafał Brodziński" --field "signature:2:60,90,220,26" --page-size a4

# Later: confirm the photos are the originals, and that they convert to exactly the signed PDF
npx tsx packages/cli/src/index.ts verify scans/page-1.signed.pdf --source scans/page-1.jpg scans/page-2.jpg
```

```
source    scans/page-1.jpg matches page-1.jpg, which this PDF was converted from.
source    scans/page-2.jpg matches page-2.jpg, which this PDF was converted from.
rebuilt   Converting these files again produces exactly the PDF that was signed.
```

A PDF you exported from Word can name its original, which is fingerprinted and
recorded as declared:

```bash
npx tsx packages/cli/src/index.ts sign contract.pdf --declared-source contract.docx --name "..." --field "..."
```

### Inspect a record

```bash
npx tsx packages/cli/src/index.ts inspect fixtures/out/agreement.signed.sealmark.json
```

---

## Field placement

Fields are positioned in PDF points, with the origin at the **bottom-left** of the
page — the PDF spec's own coordinate system. Pages are 1-based on the command
line because that is how a person reads a document.

```
kind:page:x,y,width,height[:value]
```

| Kind | Value |
| --- | --- |
| `signature` | Signer's name, rendered in a script face. Defaults to `--name`. |
| `initials` | Derived from the signer's name (`Ada Lovelace` → `AL`). |
| `date` | Signing date as `YYYY-MM-DD`. ISO deliberately, since `03/04/2026` means two different days depending on the reader. |
| `text` | Free text. Requires an explicit value. |

Text is fitted to the box: a long name in a short box shrinks rather than
overflowing into neighbouring content.

---

## Architecture

```
packages/core/   The signing engine. No filesystem, no network, no Buffer.
                 Hashing is Web Crypto; PDF work is pdf-lib. Runs unchanged in
                 Node and in the browser. Split into a light entry point and
                 on-demand ones (see Download size).
packages/cli/    Filesystem I/O, argument parsing, terminal output.
packages/web/    React app: pdf.js rendering, click-to-place fields, downloads.
scripts/         Development aids (fixture generation, PDF text dumping).
```

The core is isomorphic on purpose, and the browser app imports the same
`signDocument` it does — no parallel implementation, no drift. A document signed
in the browser and the same document signed by the CLI produce identical hashes.

Two details that are easy to get wrong and are therefore covered by tests:

**Coordinates.** PDF user space has its origin at the bottom-left; the DOM uses
the top-left. Field positions are stored in PDF points, because that is what gets
stamped, and converted for display only.

**Text fitting.** A script face is much taller than its point size, so fitting on
width alone previews far larger than it stamps. The browser measures the font
bounding box to match what pdf-lib does.

### Privacy position

The app is a static site that does all work client-side. No upload, enforced by a
Content-Security-Policy that blocks outbound connections rather than merely
promising not to make them, and verifiable by anyone with the Network tab open.

The single exception in the policy is the timestamp relay. It receives a SHA-256
fingerprint, never the document, and only when timestamping is switched on. The
switch is off until the signer turns it on.

`npm run preview --workspace @sealmark/web` serves the production build under the
exact headers in `_headers`, so the policy can be tested locally: an upload to any
other host is blocked by the browser, and the timestamp request goes through.

### Download size

A first visit downloads **65 KB** of gzipped code — the app shell and the intake
screen. Everything else arrives when it is first needed:

| When | What loads |
| --- | --- |
| The page opens | App shell, styles |
| A document is opened | pdf.js and its worker, pdf-lib, fontkit, the signature style fonts |
| **Sign and seal** is pressed | Signing code, the text font |
| A timestamp is requested, or Verify has something to check | PKI.js and the timestamp verifier |

Before this split the first visit was 750 KB, because everything shipped in one
file. `node scripts/measure-bundle.mjs` reports the current figures after a build.

Two things keep it that way. The core exposes `@sealmark/core/light`, and a test
walks every import reachable from it and fails if pdf-lib, fontkit, PKI.js or asn1js
appears. A second test fails if any module the web app loads with the page imports
signing, conversion, timestamps, verification or pdf.js directly rather than on
demand.

**Fonts** total 675 KB gzipped, or about 510 KB where the host serves Brotli, as
Cloudflare Pages and Netlify do. They were considered for trimming one at a time,
because the SIL Open Font License counts trimming as a modification and forbids a
modified font from keeping a Reserved Font Name (OFL-FAQ 2.6):

- **Great Vibes** reserves no name, so its hinting instructions — which tune
  rendering on low-resolution screens and which PDFs ignore — are removed:
  447 KB to 281 KB. It keeps every character and every outline, and a test compares
  it glyph by glyph with the untouched source in `packages/core/fonts-source/`.
  `node scripts/trim-fonts.mjs` regenerates it.
- **Lato, Parisienne, Sacramento and Meddon** reserve their names and ship exactly
  as published.
- **WOFF2** would have been the lawful alternative — conversion without changing
  font data is not a modification (OFL-FAQ 2.2.1) — and was checked to be lossless,
  but pdf-lib's font subsetter fails on WOFF2 input, and Brotli already brings TTF
  within about 60 KB of it.

---

## Development

```bash
npm test           # vitest, 225 tests
npm run typecheck  # tsc --noEmit across workspaces
npm run build      # production build of the web app
```

```bash
npx tsx scripts/dump-text.ts <file.pdf>   # inspect the text layer and positions
node scripts/measure-bundle.mjs           # first-visit and on-demand sizes, after a build
node scripts/trim-fonts.mjs               # regenerate trimmed fonts from fonts-source/
node scripts/make-icons.mjs               # regenerate the app icons from seal.svg
```

```bash
node scripts/check-deployment.mjs --dist packages/web/dist   # check a build
node scripts/check-deployment.mjs https://sealmark.app       # check a live site
node scripts/sync-host-config.mjs                            # vercel.json from _headers
node scripts/third-party-notices.mjs                         # regenerate the notices
```

```bash
npm run build --workspace @sealmark/web && npm run preview --workspace @sealmark/web
# production build on :5176, under the real security headers and with the service worker
```

---

## Deploying

Sealmark is a static site: `npm run build --workspace @sealmark/web` produces
`packages/web/dist`, and any static host can serve it. There is no server, no
database and no runtime secret — which is the privacy claim restated as
architecture.

The security headers live in `packages/web/public/_headers`, read directly by
Cloudflare Pages and Netlify. Vercel ignores that file, so `vercel.json` is
generated from it by `scripts/sync-host-config.mjs`, and a test fails if the two
drift apart.

`scripts/check-deployment.mjs` is the gate. Against a build directory it runs in
CI and catches anything that only appears in a real build — an inline script the
policy would block, a service worker that failed to precache the app. Against a
URL it checks the host itself: that the headers actually arrive, the policy is
intact, the manifest and icons are served, responses are compressed. A host that
silently ignores `_headers` passes every local test and fails that one.

Full checklist, DNS, rollback: **[docs/deploying.md](docs/deploying.md)**.
Putting signing into someone else's site: **[docs/integrating.md](docs/integrating.md)**.

---

## Roadmap

1. **Core engine and CLI** — signing, hashing, certificate, verification. *Complete.*
2. **Browser interface** — render the PDF, click to place fields, live preview, download. *Complete.*
3. **Document conversion** — photos and text converted in the browser, office documents guided to a faithful export, source files fingerprinted into the record. *Complete.*
4. **Evidence hardening** — RFC 3161 trusted timestamps, a 65 KB first visit, offline use and installation. *Complete.*
5. **Signature styles** — five signature faces to sign in, each previewed with the signer's own name. *Complete.*
6. **Remote signing** — send a document to a counterparty to sign. Separate product, separate privacy model.

---

## Licence

All rights reserved for now. The fonts in `packages/core/assets` are licensed
separately, each with its licence file alongside: Great Vibes, Parisienne,
Sacramento, Meddon and Lato under the SIL Open Font License, and Yellowtail under
the Apache License 2.0. Great Vibes is shipped with its hinting instructions
removed, which its licence permits as it reserves no font name; the unmodified
original is in `packages/core/fonts-source/`.

Everything Sealmark depends on is listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), generated from the lockfile.
All of it is MIT, Apache-2.0, BSD or 0BSD, so Sealmark can be installed on a
client site as paid work — provided those notices are delivered with it.
