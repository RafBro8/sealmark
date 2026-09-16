/**
 * Test-only helpers for building JPEGs with a chosen EXIF orientation.
 * Kept out of *.test.ts files so importing them does not re-register tests.
 */

/** A minimal EXIF APP1 segment carrying only the orientation tag. */
export function exifSegment(orientation: number, littleEndian: boolean): Uint8Array {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian); // IFD0 starts right after the header
  view.setUint16(8, 1, littleEndian); // one entry
  view.setUint16(10, 0x0112, littleEndian); // Orientation
  view.setUint16(12, 3, littleEndian); // SHORT
  view.setUint32(14, 1, littleEndian); // count
  view.setUint16(18, orientation, littleEndian);
  view.setUint32(22, 0, littleEndian); // no next IFD

  const payload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]);
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff]);
  segment.set(payload, 4);
  return segment;
}

/** Inserts an EXIF segment straight after the JPEG start-of-image marker. */
export function withOrientation(jpeg: Uint8Array, orientation: number, littleEndian = false): Uint8Array {
  const segment = exifSegment(orientation, littleEndian);
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2));
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}
