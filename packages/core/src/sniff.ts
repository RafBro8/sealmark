/**
 * Recognising images and ordering pages. Kept apart from the converters so the
 * browser can sort out what someone dropped in without loading a PDF library.
 */

export type ConvertibleImageType = 'image/jpeg' | 'image/png';

/** Identifies JPEG and PNG by their leading bytes, which unlike a filename cannot lie. */
export function sniffImageType(bytes: Uint8Array): ConvertibleImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png';
  return null;
}

/** Orders `IMG_2` before `IMG_10`, the way a person numbers pages. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
