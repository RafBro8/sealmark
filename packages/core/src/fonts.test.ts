import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { SIGNATURE_STYLES } from './styles.js';

const load = (file: string) =>
  fontkit.create(new Uint8Array(readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url))))) as any;

/**
 * Subsets a font exactly as pdf-lib does when embedding with { subset: true },
 * and reports the characters whose outline did not survive.
 *
 * This is the stage that matters and the stage nothing used to check. A font can
 * be perfectly valid on its own - render correctly in CSS, pass every check made
 * against the whole file - and still produce blank glyphs once it has been
 * subsetted into a PDF. Great Vibes did exactly that for months: it was shipped
 * pre-subsetted by a build script, and subsetting it a second time to embed it
 * emptied most of its outlines. Signatures came out as a letter here and there.
 */
async function blankAfterSubsetting(font: any, text: string): Promise<string[]> {
  const glyphs = font.layout(text).glyphs;

  const subset = font.createSubset();
  const subsetIdFor = new Map<number, number>();
  for (const glyph of glyphs) {
    if (!subsetIdFor.has(glyph.id)) subsetIdFor.set(glyph.id, subset.includeGlyph(glyph));
  }

  const encoded: Uint8Array = await new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    subset
      .encodeStream()
      .on('data', (chunk: Uint8Array) => parts.push(chunk))
      .on('end', () => {
        const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
        let at = 0;
        for (const part of parts) {
          out.set(part, at);
          at += part.length;
        }
        resolve(out);
      })
      .on('error', reject);
  });

  const embedded = fontkit.create(Buffer.from(encoded)) as any;
  const blank: string[] = [];
  [...text].forEach((character, index) => {
    if (character === ' ') return;
    const id = subsetIdFor.get(glyphs[index].id);
    let commands = 0;
    try {
      commands = embedded.getGlyph(id).path.commands.length;
    } catch {
      commands = 0;
    }
    if (commands === 0) blank.push(character);
  });
  return blank;
}

/** What a signature, initials or a typed line actually draws from. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

describe('every shipped font survives being embedded in a PDF', () => {
  const fonts = [...SIGNATURE_STYLES.map((style) => style.file), 'Lato-Regular.ttf'];

  for (const file of fonts) {
    it(`${file} draws every letter it claims to support`, async () => {
      const font = load(file);
      // Only ask for what the font says it has; coverage is checked separately.
      const supported = [...ALPHABET].filter((character) => font.hasGlyphForCodePoint(character.codePointAt(0)!));
      expect(supported.length).toBeGreaterThan(40);

      const blank = await blankAfterSubsetting(font, supported.join(''));
      expect(blank).toEqual([]);
    });
  }

  it('draws a full name, the way a signature field does', async () => {
    const font = load('GreatVibes-Regular.ttf');
    expect(await blankAfterSubsetting(font, 'Rafal Brodowicz')).toEqual([]);
  });
});

describe('the signature fonts are the published files', () => {
  it('reports the name the licence requires it to keep', () => {
    // Nothing is modified any more, so every Reserved Font Name is safe and the
    // notices can say "shipped as published" for all of them.
    expect(load('GreatVibes-Regular.ttf').familyName).toBe('Great Vibes');
  });
});
