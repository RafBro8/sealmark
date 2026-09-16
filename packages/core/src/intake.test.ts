import { describe, it, expect } from 'vitest';
import { detectKind, extensionOf, mediaTypeFor, planIntake, type IntakeFile } from './intake.js';

const PDF_HEAD = new TextEncoder().encode('%PDF-1.7\n');
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // docx is a zip
const TEXT_HEAD = new TextEncoder().encode('Dear client,');

const file = (name: string, head: Uint8Array, mediaType?: string): IntakeFile => ({
  name,
  head,
  ...(mediaType ? { mediaType } : {}),
});

describe('extensionOf / mediaTypeFor', () => {
  it('reads the last extension, case-insensitively', () => {
    expect(extensionOf('Contract.Final.DOCX')).toBe('docx');
    expect(extensionOf('README')).toBe('');
  });

  it('prefers the reported media type and falls back to the extension', () => {
    expect(mediaTypeFor('scan.jpg', 'image/jpeg')).toBe('image/jpeg');
    expect(mediaTypeFor('scan.webp')).toBe('image/webp');
    expect(mediaTypeFor('mystery.xyz')).toBe('application/octet-stream');
  });
});

describe('detectKind', () => {
  it('trusts content over the filename', () => {
    expect(detectKind(file('actually-a-pdf.txt', PDF_HEAD))).toBe('pdf');
    expect(detectKind(file('photo.png', JPEG_HEAD))).toBe('image');
  });

  it('recognises images the browser must decode by type or extension', () => {
    expect(detectKind(file('photo.heic', new Uint8Array([0, 0, 0, 24])))).toBe('image');
    expect(detectKind(file('shot', new Uint8Array([1]), 'image/webp'))).toBe('image');
  });

  it('recognises office documents', () => {
    expect(detectKind(file('contract.docx', ZIP_HEAD))).toBe('office');
    expect(detectKind(file('quote.pages', ZIP_HEAD))).toBe('office');
  });

  it('recognises plain text', () => {
    expect(detectKind(file('letter.txt', TEXT_HEAD))).toBe('text');
    expect(detectKind(file('terms.md', TEXT_HEAD))).toBe('text');
    expect(detectKind(file('note', TEXT_HEAD, 'text/plain'))).toBe('text');
  });

  it('refuses a file named .pdf that is not a PDF', () => {
    expect(detectKind(file('invoice.pdf', ZIP_HEAD))).toBe('unsupported');
  });

  it('refuses everything else', () => {
    expect(detectKind(file('archive.zip', ZIP_HEAD))).toBe('unsupported');
  });
});

describe('planIntake', () => {
  it('takes a single PDF as it is', () => {
    expect(planIntake([file('a.pdf', PDF_HEAD)]).kind).toBe('pdf');
  });

  it('takes several photos and orders them as numbered pages', () => {
    const plan = planIntake([
      file('page-10.jpg', JPEG_HEAD),
      file('page-2.png', PNG_HEAD),
      file('page-1.jpg', JPEG_HEAD),
    ]);
    expect(plan.kind === 'images' && plan.files.map((f) => f.name)).toEqual([
      'page-1.jpg',
      'page-2.png',
      'page-10.jpg',
    ]);
  });

  it('routes a Word document to the export instructions', () => {
    expect(planIntake([file('contract.docx', ZIP_HEAD)]).kind).toBe('office');
  });

  it('refuses a mix it cannot combine', () => {
    const plan = planIntake([file('a.pdf', PDF_HEAD), file('b.jpg', JPEG_HEAD)]);
    expect(plan).toEqual({
      kind: 'rejected',
      reason: 'Choose one PDF or text file, or several photos of the same document.',
    });
  });

  it('names the file it cannot open', () => {
    const plan = planIntake([file('page.jpg', JPEG_HEAD), file('backup.zip', ZIP_HEAD)]);
    expect(plan.kind === 'rejected' && plan.reason).toMatch(/^backup\.zip is not a format/);
  });

  it('refuses an empty selection', () => {
    expect(planIntake([]).kind).toBe('rejected');
  });
});
