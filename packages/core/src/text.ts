import type { PDFFont } from 'pdf-lib';

export interface FittedText {
  size: number;
  width: number;
  height: number;
}

/**
 * Largest font size at which `text` fits inside `boxWidth` x `boxHeight`.
 *
 * Signature fields are placed by eye on a page, so a long name in a short box
 * has to shrink rather than overflow into neighbouring content.
 */
export function fitText(
  text: string,
  font: PDFFont,
  boxWidth: number,
  boxHeight: number,
  maxSize = 72,
  minSize = 4,
): FittedText {
  // Start from the height-constrained size, then pull down until the width fits.
  let size = Math.min(maxSize, boxHeight);

  while (size > minSize) {
    const width = font.widthOfTextAtSize(text, size);
    const height = font.heightAtSize(size);
    if (width <= boxWidth && height <= boxHeight) {
      return { size, width, height };
    }
    size -= 0.5;
  }

  return {
    size: minSize,
    width: font.widthOfTextAtSize(text, minSize),
    height: font.heightAtSize(minSize),
  };
}

/** `Jordan Reyes` -> `JR`. Falls back to the first two characters. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * ISO `YYYY-MM-DD` in UTC.
 *
 * Deliberately not locale-formatted: `03/04/2026` means two different days
 * depending on the reader's country, which is exactly the ambiguity you do not
 * want on an executed contract.
 */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
