# Sealmark

Tamper-evident electronic signatures for PDF documents.

Sealmark stamps a signature onto a document and produces a record that proves two
things: **what was signed**, and **that the signed file has not changed since**.
Alter one byte of a sealed document — a digit in a price, a word in a clause, a
scrap of metadata — and verification fails.

> **Status:** Phase 1 of 5. The signing engine and command line tool are complete
> and tested. The browser interface is next. See [Roadmap](#roadmap).

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

Not yet implemented: RFC 3161 trusted timestamping, which would replace reliance
on the signing machine's clock with a third-party attestation of time. It is the
next meaningful upgrade to the evidence model.

Nothing here is legal advice. ESIGN carves out wills, certain real-estate
instruments and some court filings; don't use this for those.

---

## Quick start

```bash
npm install
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
                 Node and in the browser.
packages/cli/    Filesystem I/O, argument parsing, terminal output.
scripts/         Development aids (fixture generation, PDF text dumping).
```

The core is isomorphic on purpose. Phase 2's browser app imports the same
`signDocument` and `verifyDocument` with no changes, which is what makes the
privacy position below achievable rather than aspirational.

### Privacy position

The browser build will be a static site that does all work client-side: documents
are read through a file picker, processed in the page, and written back out as a
download. No upload, enforced by a Content-Security-Policy that blocks outbound
connections rather than merely promising not to make them, and verifiable by
anyone with the Network tab open.

Trusted timestamping, when added, will send a SHA-256 hash to a timestamp
authority — never the document, and only when the user enables it.

---

## Development

```bash
npm test           # vitest, 41 tests
npm run typecheck  # tsc --noEmit across workspaces
```

```bash
npx tsx scripts/dump-text.ts <file.pdf>   # inspect the text layer and positions
```

---

## Roadmap

1. **Core engine and CLI** — signing, hashing, certificate, verification. *Complete.*
2. **Browser interface** — render the PDF, click to place fields, live preview, download.
3. **Office documents** — `.docx`, `.odt`, `.rtf` converted to PDF via LibreOffice, then signed.
4. **Evidence hardening** — RFC 3161 trusted timestamps, signed-document archive, offline PWA.
5. **Remote signing** — send a document to a counterparty to sign. Separate product, separate privacy model.

---

## Licence

All rights reserved for now. The Great Vibes font in `packages/core/assets` is
licensed separately under the SIL Open Font License; see the accompanying
`GreatVibes-OFL.txt`.
