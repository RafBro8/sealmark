import type { PDFDocument, PDFFont } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { FieldKind, FieldSpec, Signer } from './types.js';
import { fitText, initialsOf, isoDate } from './text.js';
import { assertRenderable } from './glyphs.js';

export interface StampedField {
  kind: FieldKind;
  page: number;
  value: string;
}

export interface StampFonts {
  /** Script face used for signature and initials fields. */
  script: PDFFont;
  /** Upright face used for date and free-text fields. */
  plain: PDFFont;
}

const INK = rgb(0.06, 0.09, 0.16);

/** Resolves what a field should actually display. */
function resolveValue(field: FieldSpec, signer: Signer, now: Date): string {
  if (field.value !== undefined && field.value !== '') return field.value;

  switch (field.kind) {
    case 'signature':
      return signer.name;
    case 'initials':
      return initialsOf(signer.name);
    case 'date':
      return isoDate(now);
    case 'text':
      throw new Error('A `text` field requires an explicit `value`.');
  }
}

/**
 * Draws every field onto the document in place and reports what was written.
 *
 * Positions are treated as a box; text is fitted and vertically centred inside
 * it so that a placement made by eye in the UI lands where the user expects.
 */
export function stampFields(
  pdf: PDFDocument,
  fields: FieldSpec[],
  signer: Signer,
  fonts: StampFonts,
  now: Date,
): StampedField[] {
  const pages = pdf.getPages();
  const stamped: StampedField[] = [];

  for (const [index, field] of fields.entries()) {
    const { page: pageIndex, x, y, width, height } = field.placement;
    const page = pages[pageIndex];

    if (!page) {
      throw new Error(
        `Field ${index} targets page ${pageIndex}, but the document has ${pages.length} page(s).`,
      );
    }
    if (width <= 0 || height <= 0) {
      throw new Error(`Field ${index} has a non-positive size (${width} x ${height}).`);
    }

    const value = resolveValue(field, signer, now);
    const font = field.kind === 'signature' || field.kind === 'initials' ? fonts.script : fonts.plain;
    assertRenderable(value, font, `The ${field.kind} field on page ${pageIndex + 1}`);
    const fitted = fitText(value, font, width, height);

    // drawText positions the baseline. Offset by the descender so the glyph
    // body sits centred in the box rather than riding its bottom edge.
    const descender = fitted.height - font.heightAtSize(fitted.size, { descender: false });
    const baseline = y + (height - fitted.height) / 2 + descender;

    page.drawText(value, { x, y: baseline, size: fitted.size, font, color: INK });
    stamped.push({ kind: field.kind, page: pageIndex, value });
  }

  return stamped;
}
