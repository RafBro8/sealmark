import fontkit from '@pdf-lib/fontkit';

type FontkitFont = ReturnType<typeof fontkit.create>;
const parsed = new WeakMap<Uint8Array, FontkitFont>();

/**
 * Characters in `text` that a font file has no glyph for.
 *
 * Works from raw bytes, before any PDF exists, so an interface can tell a
 * signer up front that a style cannot write their name rather than failing at
 * the moment of signing.
 */
export function missingGlyphs(fontBytes: Uint8Array, text: string): string[] {
  let font = parsed.get(fontBytes);
  if (!font) {
    font = fontkit.create(fontBytes);
    parsed.set(fontBytes, font);
  }
  const missing: string[] = [];
  for (const char of text) {
    if (/\s/.test(char)) continue;
    if (!font.hasGlyphForCodePoint(char.codePointAt(0)!) && !missing.includes(char)) missing.push(char);
  }
  return missing;
}
