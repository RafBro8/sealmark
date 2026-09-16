import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import {
  imagesToPdf,
  naturalCompare,
  normaliseText,
  sniffImageType,
  textToPdf,
  wrapLine,
} from './convert.js';
import { sha256Hex } from './hash.js';
import { withOrientation } from './exif.fixture.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const asset = (name: string) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));

let jpeg: Uint8Array;
let png: Uint8Array;
let letter: string;
let textFont: Uint8Array;

beforeAll(async () => {
  // Both images are 80 x 40: landscape as stored.
  jpeg = new Uint8Array(await readFile(fixture('scan-landscape.jpg')));
  png = new Uint8Array(await readFile(fixture('scan-landscape.png')));
  letter = await readFile(fixture('letter-of-engagement.txt'), 'utf8');
  textFont = new Uint8Array(await readFile(asset('Lato-Regular.ttf')));
});

const pageSizes = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((page) => page.getSize());

describe('sniffImageType', () => {
  it('identifies JPEG and PNG by content', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
  });

  it('rejects anything else, whatever it is called', () => {
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
  });
});

describe('naturalCompare', () => {
  it('orders numbered scans the way a person would', () => {
    const names = ['IMG_10.jpg', 'IMG_2.jpg', 'img_1.jpg'];
    expect([...names].sort(naturalCompare)).toEqual(['img_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
  });
});

describe('imagesToPdf', () => {
  it('makes one page per image, in the order given', async () => {
    const sizes = await pageSizes(await imagesToPdf([jpeg, png, jpeg]));
    expect(sizes).toHaveLength(3);
  });

  it('gives a landscape image a landscape page', async () => {
    const [size] = await pageSizes(await imagesToPdf([png]));
    expect(size).toEqual({ width: 792, height: 612 });
  });

  it('turns the page for a photo whose EXIF says it was shot portrait', async () => {
    // Stored 80x40 but tagged "rotate 90° clockwise": displays as 40x80.
    const [size] = await pageSizes(await imagesToPdf([withOrientation(jpeg, 6)]));
    expect(size).toEqual({ width: 612, height: 792 });
  });

  it('keeps the page landscape for a half turn, which does not swap axes', async () => {
    const [size] = await pageSizes(await imagesToPdf([withOrientation(jpeg, 3)]));
    expect(size).toEqual({ width: 792, height: 612 });
  });

  it('supports A4', async () => {
    const [size] = await pageSizes(await imagesToPdf([png], { pageSize: 'a4' }));
    expect(size?.width).toBeCloseTo(841.89, 1);
    expect(size?.height).toBeCloseTo(595.28, 1);
  });

  it('is deterministic, so a conversion can be repeated and checked', async () => {
    const a = await imagesToPdf([jpeg, png]);
    const b = await imagesToPdf([jpeg, png]);
    expect(await sha256Hex(b)).toBe(await sha256Hex(a));
  });

  it('produces a different PDF when the photo changes', async () => {
    const a = await imagesToPdf([jpeg]);
    const b = await imagesToPdf([withOrientation(jpeg, 6)]);
    expect(await sha256Hex(b)).not.toBe(await sha256Hex(a));
  });

  it('rejects an empty list and unsupported bytes', async () => {
    await expect(imagesToPdf([])).rejects.toThrow(/At least one image/);
    await expect(imagesToPdf([new Uint8Array([1, 2, 3])])).rejects.toThrow(/Image 1 is not a JPEG or PNG/);
  });
});

describe('normaliseText', () => {
  it('strips a byte-order mark and unifies line endings', () => {
    expect(normaliseText('\uFEFFone\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('expands tabs and drops invisible control characters', () => {
    expect(normaliseText('a\tb\u0007c')).toBe('a    bc');
  });
});

describe('wrapLine', () => {
  // One unit per character, so widths are easy to reason about.
  const measure = (value: string) => value.length;

  it('wraps on word boundaries', () => {
    expect(wrapLine('aaa bbb ccc', measure, 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('breaks a word too long for any line', () => {
    expect(wrapLine('abcdefghij', measure, 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('keeps a blank line blank', () => {
    expect(wrapLine('', measure, 10)).toEqual(['']);
  });

  it('preserves leading indentation', () => {
    expect(wrapLine('  aa bb', measure, 5)).toEqual(['  aa', 'bb']);
  });
});

describe('textToPdf', () => {
  it('converts a letter containing Polish and currency characters', async () => {
    const sizes = await pageSizes(await textToPdf(letter, textFont));
    expect(sizes).toEqual([{ width: 612, height: 792 }]);
  });

  it('flows long text onto further pages', async () => {
    const long = Array.from({ length: 200 }, (_, index) => `Line ${index + 1} of the agreement.`).join('\n');
    expect((await pageSizes(await textToPdf(long, textFont))).length).toBeGreaterThan(1);
  });

  it('is deterministic', async () => {
    const a = await textToPdf(letter, textFont);
    const b = await textToPdf(letter, textFont);
    expect(await sha256Hex(b)).toBe(await sha256Hex(a));
  });

  it('refuses an empty file', async () => {
    await expect(textToPdf('  \n\n ', textFont)).rejects.toThrow(/empty/);
  });

  it('refuses characters the font cannot draw instead of dropping them', async () => {
    await expect(textToPdf('Contract 合同', textFont)).rejects.toThrow(/cannot be rendered: 合 同/);
  });
});
