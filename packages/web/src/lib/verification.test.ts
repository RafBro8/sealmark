import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { imagesToPdf, signDocument, type SignResult } from '@sealmark/core';
import {
  assignFiles,
  certificateRecordIds,
  looksLikePdf,
  verify,
  type DroppedFile,
} from './verification.js';

const read = (relative: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(relative, import.meta.url))));

const FIELD = [{ kind: 'signature' as const, placement: { page: 0, x: 60, y: 120, width: 200, height: 26 } }];

let agreement: Uint8Array;
let jpeg: Uint8Array;
let png: Uint8Array;
let scriptFont: Uint8Array;
let textFont: Uint8Array;
let signedAgreement: SignResult;
let signedPhotos: SignResult;
let photosPdf: Uint8Array;

const file = (name: string, bytes: Uint8Array): DroppedFile => ({ name, bytes });
const recordFile = (result: SignResult, name = 'doc.sealmark.json') =>
  file(name, new TextEncoder().encode(JSON.stringify(result.audit)));

beforeAll(async () => {
  agreement = read('../../../../fixtures/sample-agreement.pdf');
  jpeg = read('../../../../fixtures/scan-landscape.jpg');
  png = read('../../../../fixtures/scan-landscape.png');
  scriptFont = read('../../../core/assets/GreatVibes-Regular.ttf');
  textFont = read('../../../core/assets/Lato-Regular.ttf');

  signedAgreement = await signDocument({
    document: agreement, documentName: 'agreement.pdf', signer: { name: 'Ada Lovelace' },
    fields: FIELD, scriptFont, textFont, now: new Date('2026-09-16T09:00:00Z'),
  });

  photosPdf = await imagesToPdf([jpeg, png], { pageSize: 'letter' });
  signedPhotos = await signDocument({
    document: photosPdf, documentName: 'scan.pdf', signer: { name: 'Zofia Wójcik' },
    fields: FIELD, scriptFont, textFont, now: new Date('2026-09-16T09:05:00Z'),
    source: {
      relation: 'converted', method: 'image-to-pdf', pageSize: 'letter',
      files: [
        { name: 'page-1.jpg', mediaType: 'image/jpeg', bytes: jpeg },
        { name: 'page-2.png', mediaType: 'image/png', bytes: png },
      ],
    },
  });
});

const tamper = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes);
  const middle = Math.floor(copy.length / 2);
  copy[middle] = (copy[middle] ?? 0) ^ 0xff;
  return copy;
};

describe('certificateRecordIds', () => {
  it('finds the record id printed on a certificate', () => {
    expect(certificateRecordIds('Sealmark · record SM-A1B2C3D4E5F6 Document')).toEqual(['SM-A1B2C3D4E5F6']);
  });

  it('ignores near misses', () => {
    expect(certificateRecordIds('SM-123 sm-a1b2c3d4e5f6 SM-A1B2C3D4E5F6G')).toEqual([]);
  });
});

describe('assignFiles', () => {
  it('tells the record, the PDFs and the rest apart by content', () => {
    const assigned = assignFiles([
      file('photo.jpg', jpeg),
      file('signed.pdf', signedAgreement.pdf),
      recordFile(signedAgreement),
    ]);
    expect(assigned.record?.name).toBe('doc.sealmark.json');
    expect(assigned.pdfs.map((f) => f.name)).toEqual(['signed.pdf']);
    expect(assigned.others.map((f) => f.name)).toEqual(['photo.jpg']);
  });

  it('refuses two record files', () => {
    expect(assignFiles([recordFile(signedAgreement, 'a.json'), recordFile(signedPhotos, 'b.json')]).problem).toMatch(/More than one record/);
  });

  it('does not mistake a PDF for a record', () => {
    expect(looksLikePdf(signedAgreement.pdf)).toBe(true);
    expect(assignFiles([file('odd-name.json', signedAgreement.pdf)]).pdfs).toHaveLength(1);
  });
});

describe('verify', () => {
  it('verifies an untouched document', async () => {
    const report = await verify({
      record: recordFile(signedAgreement),
      pdfs: [file('agreement.signed.pdf', signedAgreement.pdf)],
      others: [],
      certificateIds: { 'agreement.signed.pdf': [signedAgreement.audit.recordId] },
    });
    expect(report.status).toBe('verified');
    expect(report.message).toMatch(/exactly the document Ada Lovelace signed/);
  });

  it('says the document was modified when its certificate names this record', async () => {
    const report = await verify({
      record: recordFile(signedAgreement),
      pdfs: [file('agreement.signed.pdf', tamper(signedAgreement.pdf))],
      others: [],
      certificateIds: { 'agreement.signed.pdf': [signedAgreement.audit.recordId] },
    });
    expect(report.status).toBe('modified');
    expect(report.actualHash).not.toBe(report.expectedHash);
  });

  it('says the files do not belong together when the certificate names another record', async () => {
    const report = await verify({
      record: recordFile(signedPhotos),
      pdfs: [file('agreement.signed.pdf', signedAgreement.pdf)],
      others: [],
      certificateIds: { 'agreement.signed.pdf': [signedAgreement.audit.recordId] },
    });
    expect(report.status).toBe('wrong-record');
    expect(report.message).toContain(signedAgreement.audit.recordId);
    expect(report.message).toContain(signedPhotos.audit.recordId);
  });

  it('recognises its record among several certificates on a document signed twice', async () => {
    const report = await verify({
      record: recordFile(signedAgreement),
      pdfs: [file('resigned.pdf', tamper(signedAgreement.pdf))],
      others: [],
      certificateIds: { 'resigned.pdf': [signedAgreement.audit.recordId, 'SM-000000000000'] },
    });
    expect(report.status).toBe('modified');
  });

  it('falls back to a plain mismatch when there is no certificate to read', async () => {
    const report = await verify({
      record: recordFile(signedAgreement),
      pdfs: [file('x.pdf', tamper(signedAgreement.pdf))],
      others: [],
      certificateIds: {},
    });
    expect(report.status).toBe('mismatch');
  });

  it('reports a malformed record rather than throwing', async () => {
    const report = await verify({
      record: file('broken.json', new TextEncoder().encode('{"version": 1}')),
      pdfs: [file('x.pdf', signedAgreement.pdf)],
      others: [],
      certificateIds: {},
    });
    expect(report.status).toBe('invalid-record');
  });

  it('picks out the signed PDF from the unsigned original, whatever order they come in', async () => {
    const report = await verify({
      record: recordFile(signedAgreement),
      pdfs: [file('original.pdf', agreement), file('signed.pdf', signedAgreement.pdf)],
      others: [],
      certificateIds: {},
    });
    expect(report.status).toBe('verified');
    expect(report.signedPdfName).toBe('signed.pdf');
    expect(report.supporting).toEqual([{ name: 'original.pdf', result: { kind: 'unsigned-original' } }]);
  });

  it('matches source photos and rebuilds the PDF from them', async () => {
    const report = await verify({
      record: recordFile(signedPhotos),
      pdfs: [file('scan.signed.pdf', signedPhotos.pdf)],
      others: [file('IMG_0002.png', png), file('IMG_0001.jpg', jpeg)],
      certificateIds: {},
    });
    expect(report.supporting.map((s) => [s.name, s.result.kind])).toEqual([
      ['IMG_0002.png', 'source'],
      ['IMG_0001.jpg', 'source'],
    ]);
    expect(report.missingSources).toEqual([]);
    expect(report.rebuild).toEqual({ kind: 'reproduced' });
  });

  it('lists the source files still needed, and does not attempt a partial rebuild', async () => {
    const report = await verify({
      record: recordFile(signedPhotos),
      pdfs: [file('scan.signed.pdf', signedPhotos.pdf)],
      others: [file('page-1.jpg', jpeg)],
      certificateIds: {},
    });
    expect(report.missingSources.map((s) => s.name)).toEqual(['page-2.png']);
    expect(report.rebuild).toEqual({ kind: 'skipped', reason: 'Add all 2 source files to rebuild the PDF from them.' });
  });

  it('reports that a record carries no trusted timestamp', async () => {
    const report = await verify({
      record: recordFile(signedAgreement),
      pdfs: [file('a.pdf', signedAgreement.pdf)],
      others: [],
      certificateIds: {},
    });
    expect(report.timestamp).toEqual({ present: false });
  });

  it('flags a supporting file that matches nothing in the record', async () => {
    const report = await verify({
      record: recordFile(signedPhotos),
      pdfs: [file('scan.signed.pdf', signedPhotos.pdf)],
      others: [file('edited.png', tamper(png))],
      certificateIds: {},
    });
    expect(report.supporting).toEqual([{ name: 'edited.png', result: { kind: 'no-match' } }]);
    expect(report.rebuild).toBeUndefined();
  });
});
