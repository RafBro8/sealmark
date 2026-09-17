import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SIGNATURE_STYLE,
  SIGNATURE_STYLES,
  isSignatureStyleId,
  signatureStyle,
} from './styles.js';
import { missingGlyphs } from './coverage.js';

const asset = (file: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url))));

// Letters real signers have in their names. A face that cannot write these does
// not belong in the list.
const REQUIRED = {
  Polish: 'ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ',
  'Western European': 'äöüß éèêëç ñ àâîïôûù æœøå ÄÖÜÉÑ',
  'Eastern European': 'čšž ďťň řěů őű ğış ĆČŠŽ',
};

describe('SIGNATURE_STYLES', () => {
  it('has unique ids and labels', () => {
    expect(new Set(SIGNATURE_STYLES.map((s) => s.id)).size).toBe(SIGNATURE_STYLES.length);
    expect(new Set(SIGNATURE_STYLES.map((s) => s.label)).size).toBe(SIGNATURE_STYLES.length);
  });

  it('includes the default', () => {
    expect(isSignatureStyleId(DEFAULT_SIGNATURE_STYLE)).toBe(true);
  });

  for (const style of SIGNATURE_STYLES) {
    it(`${style.label} ships its font and licence`, () => {
      expect(asset(style.file).byteLength).toBeGreaterThan(1000);
      const licence = style.licence === 'Apache-2.0'
        ? style.file.replace(/-Regular\.ttf$|\.ttf$/, '-LICENSE.txt')
        : style.file.replace(/-Regular\.ttf$|\.ttf$/, '-OFL.txt');
      expect(asset(licence).byteLength).toBeGreaterThan(100);
    });

    for (const [script, letters] of Object.entries(REQUIRED)) {
      it(`${style.label} can write ${script} letters`, () => {
        expect(missingGlyphs(asset(style.file), letters)).toEqual([]);
      });
    }
  }
});

describe('signatureStyle', () => {
  it('finds a style by id', () => {
    expect(signatureStyle('quill').file).toBe('Meddon.ttf');
  });

  it('names the valid choices when the id is unknown', () => {
    expect(() => signatureStyle('comic')).toThrow(/classic, graceful, relaxed, bold, quill/);
  });
});

describe('missingGlyphs', () => {
  it('lists each missing character once, ignoring whitespace', () => {
    const font = asset('GreatVibes-Regular.ttf');
    expect(missingGlyphs(font, 'Rafal Brodowicz')).toEqual([]);
    expect(missingGlyphs(font, '王 王 Anna')).toEqual(['王']);
  });
});
