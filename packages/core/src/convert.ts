import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { assertRenderable } from './glyphs.js';
import { displaySize, jpegOrientation, orientationMatrix, type Orientation } from './orientation.js';
import { PRODUCER } from './version.js';
import { sniffImageType } from './sniff.js';

export { sniffImageType, naturalCompare } from './sniff.js';
export type { ConvertibleImageType } from './sniff.js';

/**
 * Converts photos and plain text into PDFs that can then be signed.
 *
 * Both converters are deterministic: the same input always yields byte-identical
 * output. That is what lets the audit record link a signed PDF back to the photo
 * it came from in a way a third party can check - convert the photo again, and
 * the hash matches.
 */

export type PageSize = 'letter' | 'a4';

const PAGE_SIZES: Record<PageSize, [number, number]> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
};

async function createDeterministicDocument(): Promise<PDFDocument> {
  // updateMetadata:false stops pdf-lib stamping the current time into the file,
  // which would make every conversion of the same photo hash differently.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.registerFontkit(fontkit);
  return pdf;
}

export interface ImageToPdfOptions {
  pageSize?: PageSize;
  /** Space kept clear around each image, in points. */
  margin?: number;
}

/**
 * One page per image, in the order given. Each page takes the orientation of
 * its image - a landscape photo gets a landscape page - and the image is scaled
 * to fit inside the margin without cropping or distortion.
 */
export async function imagesToPdf(
  images: Uint8Array[],
  { pageSize = 'letter', margin = 18 }: ImageToPdfOptions = {},
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('At least one image is required.');

  const pdf = await createDeterministicDocument();
  const [shortSide, longSide] = PAGE_SIZES[pageSize];

  for (const [index, bytes] of images.entries()) {
    const type = sniffImageType(bytes);
    if (!type) {
      throw new Error(`Image ${index + 1} is not a JPEG or PNG.`);
    }

    const image = type === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const orientation: Orientation = type === 'image/jpeg' ? jpegOrientation(bytes) : 1;
    const shown = displaySize(image.width, image.height, orientation);

    const landscape = shown.width > shown.height;
    const pageWidth = landscape ? longSide : shortSide;
    const pageHeight = landscape ? shortSide : longSide;
    const page = pdf.addPage([pageWidth, pageHeight]);

    const scale = Math.min(
      (pageWidth - margin * 2) / shown.width,
      (pageHeight - margin * 2) / shown.height,
    );
    const width = shown.width * scale;
    const height = shown.height * scale;
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;

    // drawImage cannot mirror, and orientations 2, 4, 5 and 7 do. Writing the
    // transformation matrix directly handles all eight cases the same way.
    const name = page.node.newXObject('Image', image.ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...orientationMatrix(orientation, x, y, width, height)),
      drawObject(name),
      popGraphicsState(),
    );
  }

  return pdf.save({ useObjectStreams: false });
}

export interface TextToPdfOptions {
  pageSize?: PageSize;
  fontSize?: number;
}

const TEXT_MARGIN = 72;

/** Removes a byte-order mark, unifies line endings, and drops invisible control characters. */
export function normaliseText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/**
 * Lays plain text out on pages: fixed margins, words wrapped to the line width,
 * blank lines preserved, and a word too long for a line broken across lines
 * rather than running off the page.
 */
export async function textToPdf(
  text: string,
  font: Uint8Array,
  { pageSize = 'letter', fontSize = 11 }: TextToPdfOptions = {},
): Promise<Uint8Array> {
  const content = normaliseText(text);
  if (!content.trim()) throw new Error('The text file is empty.');

  const pdf = await createDeterministicDocument();
  const face = await pdf.embedFont(font, { subset: true });
  assertRenderable(content, face, 'The text');

  const [pageWidth, pageHeight] = PAGE_SIZES[pageSize];
  const maxWidth = pageWidth - TEXT_MARGIN * 2;
  const leading = fontSize * 1.45;
  const ink = rgb(0.06, 0.09, 0.16);

  const lines: string[] = [];
  for (const paragraph of content.replace(/\n+$/, '').split('\n')) {
    lines.push(...wrapLine(paragraph, (value) => face.widthOfTextAtSize(value, fontSize), maxWidth));
  }

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - TEXT_MARGIN - fontSize;

  for (const line of lines) {
    if (y < TEXT_MARGIN) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - TEXT_MARGIN - fontSize;
    }
    if (line) page.drawText(line, { x: TEXT_MARGIN, y, size: fontSize, font: face, color: ink });
    y -= leading;
  }

  return pdf.save({ useObjectStreams: false });
}

/** Word-wraps one paragraph. An empty paragraph stays as one blank line. */
export function wrapLine(
  paragraph: string,
  measure: (value: string) => number,
  maxWidth: number,
): string[] {
  if (!paragraph.trim()) return [''];

  // Keep leading indentation; it often carries meaning in plain-text documents.
  const indent = /^ */.exec(paragraph)![0];
  const words = paragraph.slice(indent.length).split(/ +/);
  const lines: string[] = [];
  let line = indent;

  for (const word of words) {
    const candidate = line.trim() ? `${line} ${word}` : `${line}${word}`;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line.trim()) lines.push(line);

    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }

    // A single word wider than the line: break it character by character.
    let chunk = '';
    for (const char of word) {
      if (measure(chunk + char) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }

  if (line.trim()) lines.push(line);
  return lines;
}
