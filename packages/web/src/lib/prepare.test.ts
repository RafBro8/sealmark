import { describe, it, expect } from 'vitest';
import { defaultPageSize, pdfNameFor } from './prepare.js';

describe('defaultPageSize', () => {
  it('uses Letter where Letter is the norm', () => {
    expect(defaultPageSize('en-US')).toBe('letter');
    expect(defaultPageSize('es-MX')).toBe('letter');
    expect(defaultPageSize('fr-CA')).toBe('letter');
  });

  it('uses A4 everywhere else', () => {
    expect(defaultPageSize('pl-PL')).toBe('a4');
    expect(defaultPageSize('en-GB')).toBe('a4');
    expect(defaultPageSize('de')).toBe('a4');
  });

  it('infers the region from a bare language tag', () => {
    // "pl" maximises to pl-PL, "en" to en-US.
    expect(defaultPageSize('pl')).toBe('a4');
    expect(defaultPageSize('en')).toBe('letter');
  });

  it('falls back to A4 for a tag it cannot parse', () => {
    expect(defaultPageSize('not a locale!')).toBe('a4');
  });
});

describe('pdfNameFor', () => {
  it('swaps the extension', () => {
    expect(pdfNameFor('IMG_2041.HEIC')).toBe('IMG_2041.pdf');
    expect(pdfNameFor('letter.of.engagement.txt')).toBe('letter.of.engagement.pdf');
  });

  it('adds one when there is none', () => {
    expect(pdfNameFor('contract')).toBe('contract.pdf');
  });
});
