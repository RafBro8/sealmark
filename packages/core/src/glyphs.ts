import type { PDFFont } from 'pdf-lib';

const coverage = new WeakMap<PDFFont, Set<number>>();

function characterSet(font: PDFFont): Set<number> {
  let set = coverage.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    coverage.set(font, set);
  }
  return set;
}

/** Characters in `text` the font has no glyph for, deduplicated, in order of appearance. */
export function unsupportedCharacters(text: string, font: PDFFont): string[] {
  const set = characterSet(font);
  const missing: string[] = [];
  for (const char of text) {
    if (/\s/.test(char)) continue;
    const code = char.codePointAt(0)!;
    if (!set.has(code) && !missing.includes(char)) missing.push(char);
  }
  return missing;
}

/**
 * Refuses text the font cannot draw.
 *
 * A missing glyph does not fail loudly on its own: it renders as an empty box.
 * On a contract that is silent loss of content, which is worse than an error.
 */
export function assertRenderable(text: string, font: PDFFont, context: string): void {
  const missing = unsupportedCharacters(text, font);
  if (missing.length === 0) return;

  const shown = missing.slice(0, 8).join(' ');
  const more = missing.length > 8 ? ` and ${missing.length - 8} more` : '';
  throw new Error(`${context} contains characters that cannot be rendered: ${shown}${more}.`);
}
