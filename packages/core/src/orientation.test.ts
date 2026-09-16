import { describe, it, expect } from 'vitest';
import { displaySize, jpegOrientation, orientationMatrix, type Orientation } from './orientation.js';
import { withOrientation } from './exif.fixture.js';

/** Bare SOI + a JFIF-ish APP0 + SOS, enough for the metadata walker. */
const BARE_JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x02,
]);

describe('jpegOrientation', () => {
  it('reads every orientation value, big-endian', () => {
    for (let value = 1; value <= 8; value += 1) {
      expect(jpegOrientation(withOrientation(BARE_JPEG, value))).toBe(value);
    }
  });

  it('reads every orientation value, little-endian', () => {
    for (let value = 1; value <= 8; value += 1) {
      expect(jpegOrientation(withOrientation(BARE_JPEG, value, true))).toBe(value);
    }
  });

  it('treats a JPEG without EXIF as upright', () => {
    expect(jpegOrientation(BARE_JPEG)).toBe(1);
  });

  it('treats an out-of-range value as upright', () => {
    expect(jpegOrientation(withOrientation(BARE_JPEG, 9))).toBe(1);
  });

  it('does not throw on truncated or foreign bytes', () => {
    const truncated = withOrientation(BARE_JPEG, 6).subarray(0, 20);
    expect(jpegOrientation(truncated)).toBe(1);
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(jpegOrientation(new Uint8Array())).toBe(1);
  });
});

describe('displaySize', () => {
  it('swaps axes only for the quarter-turn orientations', () => {
    expect(displaySize(80, 40, 1)).toEqual({ width: 80, height: 40 });
    expect(displaySize(80, 40, 3)).toEqual({ width: 80, height: 40 });
    expect(displaySize(80, 40, 6)).toEqual({ width: 40, height: 80 });
    expect(displaySize(80, 40, 8)).toEqual({ width: 40, height: 80 });
  });
});

describe('orientationMatrix', () => {
  const box = { x: 10, y: 20, width: 100, height: 50 };
  const left = box.x;
  const right = box.x + box.width;
  const bottom = box.y;
  const top = box.y + box.height;

  /** Applies a `cm` matrix to a point in the image's unit square. */
  const apply = (m: number[], u: number, v: number) => ({
    x: m[0]! * u + m[2]! * v + m[4]!,
    y: m[1]! * u + m[3]! * v + m[5]!,
  });

  // Where the stored image's top-left pixel must appear once displayed upright,
  // per the EXIF specification. In PDF image space that pixel is (u=0, v=1).
  const expectedTopLeft: Record<Orientation, { x: number; y: number }> = {
    1: { x: left, y: top },
    2: { x: right, y: top },
    3: { x: right, y: bottom },
    4: { x: left, y: bottom },
    5: { x: left, y: top },
    6: { x: right, y: top },
    7: { x: right, y: bottom },
    8: { x: left, y: bottom },
  };

  for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
    it(`orientation ${orientation} puts the stored top-left corner in the right place`, () => {
      const m = orientationMatrix(orientation, box.x, box.y, box.width, box.height);
      expect(apply(m, 0, 1)).toEqual(expectedTopLeft[orientation]);
    });

    it(`orientation ${orientation} fills exactly the target box`, () => {
      const m = orientationMatrix(orientation, box.x, box.y, box.width, box.height);
      const corners = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
      expect(Math.min(...corners.map((c) => c.x))).toBe(left);
      expect(Math.max(...corners.map((c) => c.x))).toBe(right);
      expect(Math.min(...corners.map((c) => c.y))).toBe(bottom);
      expect(Math.max(...corners.map((c) => c.y))).toBe(top);
    });
  }
});
