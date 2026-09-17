import { describe, it, expect } from 'vitest';
import { SIGNATURE_STYLES } from '@sealmark/core';
import { STYLE_FONT_URLS, familyFor } from './styles.js';

describe('STYLE_FONT_URLS', () => {
  it('bundles exactly the font file the core names for each style', () => {
    // Guards against the web app previewing one face while signing with another.
    for (const style of SIGNATURE_STYLES) {
      expect(STYLE_FONT_URLS[style.id]).toContain(style.file);
    }
    expect(Object.keys(STYLE_FONT_URLS).sort()).toEqual(SIGNATURE_STYLES.map((s) => s.id).sort());
  });
});

describe('familyFor', () => {
  it('gives each style its own family name', () => {
    const families = SIGNATURE_STYLES.map((style) => familyFor(style.id));
    expect(new Set(families).size).toBe(SIGNATURE_STYLES.length);
  });
});
