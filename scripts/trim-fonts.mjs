/**
 * Produces the shipped signature fonts from their untouched sources.
 *
 * Only fonts the licence lets us modify without renaming are trimmed. Great
 * Vibes (SIL OFL, no Reserved Font Name) has its hinting instructions removed:
 * they tune rendering on low-resolution screens, PDFs ignore them, and they were
 * a third of the file. Every character it can write, and every outline, is kept.
 *
 * Fonts with a Reserved Font Name — Lato, Parisienne, Sacramento, Meddon — are
 * shipped exactly as published, because the OFL counts any trimming as a
 * modification that could no longer use the name (OFL-FAQ 2.6).
 *
 * Run: node scripts/trim-fonts.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import subsetFont from 'subset-font';
import fontkit from '@pdf-lib/fontkit';

const TRIM = [{ file: 'GreatVibes-Regular.ttf' }];

for (const { file } of TRIM) {
  const source = readFileSync(new URL(`../packages/core/fonts-source/${file}`, import.meta.url));
  const everyCharacter = String.fromCodePoint(...fontkit.create(source).characterSet);
  const trimmed = await subsetFont(source, everyCharacter, { targetFormat: 'truetype', noHinting: true });
  writeFileSync(new URL(`../packages/core/assets/${file}`, import.meta.url), trimmed);
  console.log(`${file}: ${(source.length / 1024).toFixed(0)} KB -> ${(trimmed.length / 1024).toFixed(0)} KB`);
}
