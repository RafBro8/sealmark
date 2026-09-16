/**
 * Prints the text layer of a PDF, page by page.
 * Development aid: npx tsx scripts/dump-text.ts <file.pdf>
 */
import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [input] = process.argv.slice(2);
if (!input) {
  console.error('usage: tsx scripts/dump-text.ts <file.pdf>');
  process.exit(1);
}

const data = new Uint8Array(await readFile(input));
const pdf = await pdfjs.getDocument({ data }).promise;

for (let n = 1; n <= pdf.numPages; n += 1) {
  const page = await pdf.getPage(n);
  const content = await page.getTextContent();
  console.log(`----- page ${n} of ${pdf.numPages} -----`);
  for (const item of content.items) {
    if ('str' in item && item.str.trim()) {
      const [, , , , x, y] = item.transform as number[];
      console.log(`  ${String(Math.round(x!)).padStart(4)},${String(Math.round(y!)).padStart(4)}  ${item.str}`);
    }
  }
}
