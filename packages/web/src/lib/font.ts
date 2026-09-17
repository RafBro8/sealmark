// Bundled from the workspace rather than fetched from a font CDN. Signature
// faces live in styles.ts.
import textFontUrl from '../../../core/assets/Lato-Regular.ttf?url';

let textBytesPromise: Promise<Uint8Array> | undefined;

export function fetchFont(url: string, label: string): Promise<Uint8Array> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load the ${label} font (${response.status}).`);
      return response.arrayBuffer();
    })
    .then((buffer) => new Uint8Array(buffer));
}

/**
 * Font for dates, text fields, converted text and the certificate page.
 *
 * Loaded only when first needed — signing or converting a text file — since
 * browsing the intake screen does not need it.
 */
export function textFontBytes(): Promise<Uint8Array> {
  textBytesPromise ??= fetchFont(textFontUrl, 'text');
  return textBytesPromise;
}

let measurer: CanvasRenderingContext2D | undefined;

function measuringContext(): CanvasRenderingContext2D {
  if (!measurer) {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('Could not get a 2D canvas context for text measurement.');
    measurer = context;
  }
  return measurer;
}

/**
 * Height of a rendered line, matching what pdf-lib reports for the same face.
 *
 * The font bounding box spans ascender to descender, which is the measure
 * pdf-lib's `heightAtSize` uses. Falling back to a ratio keeps older engines
 * that omit these metrics from reporting a height of zero and letting oversized
 * text through.
 */
function lineHeight(metrics: TextMetrics, size: number): number {
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  if (typeof ascent === 'number' && typeof descent === 'number') return ascent + descent;
  return size * 1.3;
}

/**
 * Largest font size at which `text` fits the box, mirroring the core's fitting
 * so the preview does not drift from the stamped result.
 *
 * Both constraints matter. Checking width alone lets a script face — whose
 * glyphs are far taller than their point size — preview much larger than it
 * will be stamped.
 */
export function fitTextSize(
  text: string,
  family: string,
  boxWidth: number,
  boxHeight: number,
  maxSize = 72,
  minSize = 4,
): number {
  if (!text) return minSize;
  const context = measuringContext();
  let size = Math.min(maxSize, boxHeight);

  while (size > minSize) {
    context.font = `${size}px "${family}"`;
    const metrics = context.measureText(text);
    if (metrics.width <= boxWidth && lineHeight(metrics, size) <= boxHeight) return size;
    size -= 0.5;
  }
  return minSize;
}
