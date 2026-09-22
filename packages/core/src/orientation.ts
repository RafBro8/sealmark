/**
 * EXIF orientation for JPEG photos.
 *
 * Phone cameras usually store the sensor image as captured and record how it
 * should be displayed in an EXIF tag. PDF has no idea that tag exists, so
 * embedding the raw JPEG draws a portrait photo of a contract on its side. The
 * orientation has to be read and applied when the image is placed.
 */

/** EXIF orientation values 1-8. 1 means "already upright". */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const TAG_ORIENTATION = 0x0112;

/**
 * Reads the EXIF orientation of a JPEG. Anything unexpected - no EXIF, a
 * truncated file, a malformed segment - yields 1, because a photo drawn as
 * stored is a better failure than no photo at all.
 */
export function jpegOrientation(bytes: Uint8Array): Orientation {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1]!;

    // Start of scan or end of image: the metadata segments are behind us.
    if (marker === 0xda || marker === 0xd9) return 1;

    const length = view.getUint16(offset + 2);
    if (length < 2) return 1;

    const segmentEnd = Math.min(offset + 2 + length, bytes.length);
    if (marker === 0xe1) {
      const found = readExifOrientation(view, offset + 4, segmentEnd);
      if (found !== null) return found;
    }
    offset += 2 + length;
  }
  return 1;
}

function readExifOrientation(view: DataView, start: number, end: number): Orientation | null {
  // APP1 carries either EXIF ("Exif\0\0") or XMP; only EXIF has the tag.
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  if (end - start < header.length + 8) return null;
  for (const [index, byte] of header.entries()) {
    if (view.getUint8(start + index) !== byte) return null;
  }

  const tiff = start + header.length;
  const byteOrder = view.getUint16(tiff);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiff + 2, little) !== 42) return null;

  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;

  const entries = view.getUint16(ifd, little);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === TAG_ORIENTATION) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? (value as Orientation) : null;
    }
  }
  return null;
}

/** Orientations 5-8 turn the image a quarter turn, swapping its display axes. */
export function swapsAxes(orientation: Orientation): boolean {
  return orientation >= 5;
}

export function displaySize(
  width: number,
  height: number,
  orientation: Orientation,
): { width: number; height: number } {
  return swapsAxes(orientation) ? { width: height, height: width } : { width, height };
}

/** A PDF transformation matrix, `[a b c d e f]` as used by the `cm` operator. */
export type Matrix = [number, number, number, number, number, number];

/**
 * The `cm` matrix that draws an image's unit square upright into the box
 * `(x, y, width, height)`, where the box is measured in display orientation.
 *
 * Derived per case from where the stored image's corners must land: for
 * example orientation 6 is a quarter turn clockwise, so the stored top-left
 * corner has to end up at the box's top-right.
 */
export function orientationMatrix(
  orientation: Orientation,
  x: number,
  y: number,
  width: number,
  height: number,
): Matrix {
  const w = width;
  const h = height;
  switch (orientation) {
    case 1:
      return [w, 0, 0, h, x, y];
    case 2: // mirrored horizontally
      return [-w, 0, 0, h, x + w, y];
    case 3: // half turn
      return [-w, 0, 0, -h, x + w, y + h];
    case 4: // mirrored vertically
      return [w, 0, 0, -h, x, y + h];
    case 5: // mirrored across the main diagonal
      return [0, -h, -w, 0, x + w, y + h];
    case 6: // quarter turn clockwise
      return [0, -h, w, 0, x, y + h];
    case 7: // mirrored across the anti-diagonal
      return [0, h, w, 0, x, y];
    case 8: // quarter turn anticlockwise
      return [0, h, -w, 0, x + w, y];
  }
}
