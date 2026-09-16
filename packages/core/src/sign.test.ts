import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { signDocument, recordFileNameFor } from './sign.js';
import { verifyDocument, verifyOriginal, parseAuditRecord } from './verify.js';
import { sha256Hex } from './hash.js';
import type { FieldSpec } from './types.js';

const FIXTURE = fileURLToPath(new URL('../../../fixtures/sample-agreement.pdf', import.meta.url));
const FONT = fileURLToPath(new URL('../assets/GreatVibes-Regular.ttf', import.meta.url));

const NOW = new Date('2026-09-15T12:00:00.000Z');
const SIGNER = { name: 'Rafal Brodzinski', email: 'rafbrodi@gmail.com' };
const FIELDS: FieldSpec[] = [
  { kind: 'signature', placement: { page: 0, x: 60, y: 125, width: 230, height: 45 } },
  { kind: 'date', placement: { page: 0, x: 334, y: 126, width: 130, height: 22 } },
];

let document: Uint8Array;
let scriptFont: Uint8Array;

beforeAll(async () => {
  document = new Uint8Array(await readFile(FIXTURE));
  scriptFont = new Uint8Array(await readFile(FONT));
});

const sign = (overrides: Partial<Parameters<typeof signDocument>[0]> = {}) =>
  signDocument({
    document,
    documentName: 'sample-agreement.pdf',
    signer: SIGNER,
    fields: FIELDS,
    scriptFont,
    now: NOW,
    ...overrides,
  });

describe('signDocument', () => {
  it('records the hash of the document that went in', async () => {
    const { audit } = await sign();
    expect(audit.originalHash).toBe(await sha256Hex(document));
  });

  it('records a signed hash that matches the bytes it returns', async () => {
    const { pdf, audit } = await sign();
    expect(audit.signedHash).toBe(await sha256Hex(pdf));
  });

  it('produces identical output for identical input', async () => {
    // Reproducibility is what lets a third party re-derive the hash themselves.
    const a = await sign();
    const b = await sign();
    expect(b.audit.signedHash).toBe(a.audit.signedHash);
    expect(b.audit.recordId).toBe(a.audit.recordId);
  });

  it('appends the certificate page by default', async () => {
    const before = (await PDFDocument.load(document)).getPageCount();
    const { pdf } = await sign();
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(before + 1);
  });

  it('omits the certificate when asked', async () => {
    const before = (await PDFDocument.load(document)).getPageCount();
    const { pdf } = await sign({ appendCertificate: false });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(before);
  });

  it('derives signature and date values from the signer and the clock', async () => {
    const { audit } = await sign();
    expect(audit.fields).toEqual([
      { kind: 'signature', page: 0, value: 'Rafal Brodzinski' },
      { kind: 'date', page: 0, value: '2026-09-15' },
    ]);
  });

  it('logs an audit event for every stage', async () => {
    const { audit } = await sign();
    expect(audit.events.map((e) => e.type)).toEqual([
      'document.received',
      'field.stamped',
      'field.stamped',
      'certificate.appended',
      'document.sealed',
    ]);
  });

  it('refuses to sign with no fields', async () => {
    await expect(sign({ fields: [] })).rejects.toThrow(/At least one field/);
  });

  it('refuses an empty signer name', async () => {
    await expect(sign({ signer: { name: '  ' } })).rejects.toThrow(/Signer name/);
  });

  it('reports a field placed on a page that does not exist', async () => {
    const fields: FieldSpec[] = [
      { kind: 'signature', placement: { page: 7, x: 10, y: 10, width: 100, height: 30 } },
    ];
    await expect(sign({ fields })).rejects.toThrow(/page 7/);
  });

  it('requires a value for text fields', async () => {
    const fields: FieldSpec[] = [
      { kind: 'text', placement: { page: 0, x: 10, y: 10, width: 100, height: 30 } },
    ];
    await expect(sign({ fields })).rejects.toThrow(/requires an explicit/);
  });
});

describe('verifyDocument', () => {
  it('verifies an untouched document', async () => {
    const { pdf, audit } = await sign();
    const result = await verifyDocument(pdf, audit);
    expect(result.status).toBe('verified');
    expect(result.intact).toBe(true);
  });

  it('detects a single changed byte', async () => {
    const { pdf, audit } = await sign();
    const tampered = new Uint8Array(pdf);
    const index = Math.floor(tampered.length / 2);
    tampered[index] = (tampered[index] ?? 0) ^ 0xff;

    const result = await verifyDocument(tampered, audit);
    expect(result.status).toBe('tampered');
    expect(result.intact).toBe(false);
    expect(result.actualHash).not.toBe(result.expectedHash);
  });

  it('confirms which original was signed', async () => {
    const { audit } = await sign();
    expect(await verifyOriginal(document, audit)).toBe(true);
    expect(await verifyOriginal(new Uint8Array([1, 2, 3]), audit)).toBe(false);
  });
});

describe('parseAuditRecord', () => {
  it('accepts a record produced by signing', async () => {
    const { audit } = await sign();
    expect(() => parseAuditRecord(JSON.parse(JSON.stringify(audit)))).not.toThrow();
  });

  it.each([
    ['a non-object', 'JSON object', null],
    ['a future version', 'version', { version: 2 }],
    ['a non-hex hash', 'SHA-256', { version: 1, originalHash: 'nope', signedHash: 'nope' }],
  ])('rejects %s', (_label, message, input) => {
    expect(() => parseAuditRecord(input)).toThrow(new RegExp(message, 'i'));
  });
});

describe('recordFileNameFor', () => {
  it('swaps the pdf extension', () => {
    expect(recordFileNameFor('contract.pdf')).toBe('contract.sealmark.json');
    expect(recordFileNameFor('contract.PDF')).toBe('contract.sealmark.json');
  });
});
