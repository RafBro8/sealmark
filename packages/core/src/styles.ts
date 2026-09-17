import fontkit from '@pdf-lib/fontkit';

/**
 * The signature faces a signer can choose between.
 *
 * Every face here was checked to cover Polish, Western and Eastern European
 * letters before it was admitted — several attractive script fonts were
 * rejected because they cannot write "ł" or "č", and a style that fails on a
 * signer's own name is worse than no choice at all. The styles test enforces
 * this for any face added later.
 *
 * The core stays asset-free: this lists filenames, and callers load the bytes.
 */

export type SignatureStyleId = 'classic' | 'graceful' | 'relaxed' | 'bold' | 'quill';

export interface SignatureStyle {
  id: SignatureStyleId;
  label: string;
  description: string;
  /** Font file in packages/core/assets. */
  file: string;
  licence: 'OFL-1.1' | 'Apache-2.0';
}

export const SIGNATURE_STYLES: readonly SignatureStyle[] = [
  { id: 'classic', label: 'Classic', description: 'Formal, with flourishes', file: 'GreatVibes-Regular.ttf', licence: 'OFL-1.1' },
  { id: 'graceful', label: 'Graceful', description: 'Round and open', file: 'Parisienne-Regular.ttf', licence: 'OFL-1.1' },
  { id: 'relaxed', label: 'Relaxed', description: 'Light, everyday handwriting', file: 'Sacramento-Regular.ttf', licence: 'OFL-1.1' },
  { id: 'bold', label: 'Bold', description: 'Confident brush strokes', file: 'Yellowtail-Regular.ttf', licence: 'Apache-2.0' },
  { id: 'quill', label: 'Quill', description: 'Old-fashioned pen and ink', file: 'Meddon.ttf', licence: 'OFL-1.1' },
];

export const DEFAULT_SIGNATURE_STYLE: SignatureStyleId = 'classic';

export function isSignatureStyleId(value: unknown): value is SignatureStyleId {
  return SIGNATURE_STYLES.some((style) => style.id === value);
}

export function signatureStyle(id: string): SignatureStyle {
  const style = SIGNATURE_STYLES.find((candidate) => candidate.id === id);
  if (!style) {
    throw new Error(
      `Unknown signature style "${id}". Choose one of: ${SIGNATURE_STYLES.map((s) => s.id).join(', ')}.`,
    );
  }
  return style;
}

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
