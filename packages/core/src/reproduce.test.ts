import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { imagesToPdf, textToPdf } from './convert.js';
import { signDocument } from './sign.js';
import { reproduceConversion } from './verify.js';
import type { AuditRecord, FieldSpec } from './types.js';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

let jpeg: Uint8Array;
let png: Uint8Array;
let letter: Uint8Array;
let scriptFont: Uint8Array;
let textFont: Uint8Array;

const FIELD: FieldSpec[] = [
  { kind: 'signature', placement: { page: 0, x: 40, y: 40, width: 200, height: 24 } },
];

beforeAll(async () => {
  jpeg = new Uint8Array(await readFile(path('../../../fixtures/scan-landscape.jpg')));
  png = new Uint8Array(await readFile(path('../../../fixtures/scan-landscape.png')));
  letter = new Uint8Array(await readFile(path('../../../fixtures/letter-of-engagement.txt')));
  scriptFont = new Uint8Array(await readFile(path('../assets/GreatVibes-Regular.ttf')));
  textFont = new Uint8Array(await readFile(path('../assets/Lato-Regular.ttf')));
});

async function signedFromPhotos(pageSize: 'letter' | 'a4'): Promise<AuditRecord> {
  const pdf = await imagesToPdf([jpeg, png], { pageSize });
  const { audit } = await signDocument({
    document: pdf,
    documentName: 'contract.pdf',
    signer: { name: 'Rafał Brodziński' },
    fields: FIELD,
    scriptFont,
    textFont,
    now: new Date('2026-09-16T10:00:00Z'),
    source: {
      relation: 'converted',
      method: 'image-to-pdf',
      pageSize,
      files: [
        { name: 'page-1.jpg', mediaType: 'image/jpeg', bytes: jpeg },
        { name: 'page-2.png', mediaType: 'image/png', bytes: png },
      ],
    },
  });
  return audit;
}

describe('reproduceConversion', () => {
  it('rebuilds exactly the PDF that was signed from the original photos', async () => {
    const record = await signedFromPhotos('a4');
    const result = await reproduceConversion(record, [jpeg, png]);
    expect(result.reproduced).toBe(true);
    expect(result.actualHash).toBe(record.originalHash);
  });

  it('matches files by content, so the order they are supplied in does not matter', async () => {
    const record = await signedFromPhotos('letter');
    expect((await reproduceConversion(record, [png, jpeg])).reproduced).toBe(true);
  });

  it('uses the recorded page size — the wrong one does not reproduce', async () => {
    const record = await signedFromPhotos('a4');
    const doctored: AuditRecord = { ...record, source: { ...record.source!, pageSize: 'letter' } };
    expect((await reproduceConversion(doctored, [jpeg, png])).reproduced).toBe(false);
  });

  it('refuses when a source file is missing or has been altered', async () => {
    const record = await signedFromPhotos('letter');
    const edited = new Uint8Array(png);
    const last = edited.length - 1;
    edited[last] = (edited[last] ?? 0) ^ 0xff;
    await expect(reproduceConversion(record, [jpeg, edited])).rejects.toThrow(/Missing: page-2\.png/);
  });

  it('reproduces a text conversion given the text font', async () => {
    const text = new TextDecoder().decode(letter);
    const pdf = await textToPdf(text, textFont, { pageSize: 'a4' });
    const { audit } = await signDocument({
      document: pdf,
      documentName: 'letter.pdf',
      signer: { name: 'Paweł Łukasiewicz' },
      fields: FIELD,
      scriptFont,
      textFont,
      source: {
        relation: 'converted',
        method: 'text-to-pdf',
        pageSize: 'a4',
        files: [{ name: 'letter.txt', mediaType: 'text/plain', bytes: letter }],
      },
    });
    expect((await reproduceConversion(audit, [letter], textFont)).reproduced).toBe(true);
  });

  it('declines, with the reason, when a file was re-encoded by the browser', async () => {
    const { audit } = await signDocument({
      document: await imagesToPdf([png]),
      documentName: 'screenshot.pdf',
      signer: { name: 'Signer' },
      fields: FIELD,
      scriptFont,
      textFont,
      source: {
        relation: 'converted',
        method: 'image-to-pdf',
        files: [{ name: 'photo.webp', mediaType: 'image/webp', bytes: png, reencoded: true }],
      },
    });
    expect(audit.source?.files[0]?.reencoded).toBe(true);
    await expect(reproduceConversion(audit, [png])).rejects.toThrow(/photo.webp had to be re-encoded/);
  });

  it('will not pretend to reproduce a declared source', async () => {
    const { audit } = await signDocument({
      document: await imagesToPdf([png]),
      documentName: 'export.pdf',
      signer: { name: 'Signer' },
      fields: FIELD,
      scriptFont,
      textFont,
      source: {
        relation: 'declared',
        method: 'exported-by-signer',
        files: [{ name: 'contract.docx', mediaType: 'application/octet-stream', bytes: png }],
      },
    });
    await expect(reproduceConversion(audit, [png])).rejects.toThrow(/does not describe a conversion/);
  });
});
