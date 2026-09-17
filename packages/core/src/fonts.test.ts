import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';

const load = (dir: string, file: string) =>
  fontkit.create(new Uint8Array(readFileSync(fileURLToPath(new URL(`../${dir}/${file}`, import.meta.url)))));

describe('trimmed Great Vibes', () => {
  const source = load('fonts-source', 'GreatVibes-Regular.ttf');
  const shipped = load('assets', 'GreatVibes-Regular.ttf');

  it('can write exactly the characters the published font can', () => {
    expect(shipped.characterSet).toEqual(source.characterSet);
  });

  it('draws every character identically', () => {
    const differing = source.characterSet.filter((codePoint) => {
      const before = source.glyphForCodePoint(codePoint);
      const after = shipped.glyphForCodePoint(codePoint);
      // .notdef is the missing-glyph box. Sealmark refuses text it cannot draw, so
      // it never reaches a document; the trimmer empties its outline.
      if (before.id === 0) return false;
      return before.path.toSVG() !== after.path.toSVG() || before.advanceWidth !== after.advanceWidth;
    });
    expect(differing).toEqual([]);
  });

  it('keeps its name, which the licence allows because it reserves none', () => {
    expect(shipped.familyName).toBe('Great Vibes');
  });

  it('is actually smaller, or the trimming is not worth having', () => {
    const size = (dir: string) => readFileSync(fileURLToPath(new URL(`../${dir}/GreatVibes-Regular.ttf`, import.meta.url))).length;
    expect(size('assets')).toBeLessThan(size('fonts-source') * 0.7);
  });
});
