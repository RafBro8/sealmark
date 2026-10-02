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
 * ISO `YYYY-MM-DD` for the signer's own calendar day.
 *
 * Deliberately not locale-formatted: `03/04/2026` means two different days
 * depending on the reader's country, which is exactly the ambiguity you do not
 * want on an executed contract.
 *
 * Deliberately local rather than UTC. Someone signing in Chicago at 7pm on
 * 1 October is already on 2 October in UTC, and `toISOString()` used to date
 * their document a day into the future. The date a person writes next to their
 * signature is the date where they are standing. The UTC instant is still
 * recorded, separately and precisely, as `signedAt` and in the timestamp token.
 */
export function isoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
