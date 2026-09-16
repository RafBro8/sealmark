import type { Placement } from '@sealmark/core';

/**
 * Bridges two coordinate systems that disagree about which way is up.
 *
 * PDF user space puts the origin at the bottom-left of the page and measures in
 * points. The DOM puts it at the top-left and measures in CSS pixels. Field
 * positions are stored in PDF points — that is what gets stamped, so it is the
 * source of truth — and converted for display only.
 */

export interface PageGeometry {
  /** Page width in PDF points. */
  widthPt: number;
  /** Page height in PDF points. */
  heightPt: number;
  /** CSS pixels per PDF point. */
  zoom: number;
}

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** PDF points -> CSS pixels, flipping the vertical axis. */
export function toScreen(placement: Placement, geometry: PageGeometry): ScreenBox {
  const { zoom, heightPt } = geometry;
  return {
    left: placement.x * zoom,
    // A box is anchored at its bottom edge in PDF space and its top edge in the
    // DOM, so the height has to come out of the flip as well.
    top: (heightPt - placement.y - placement.height) * zoom,
    width: placement.width * zoom,
    height: placement.height * zoom,
  };
}

/** CSS pixels -> PDF points. Inverse of `toScreen`. */
export function toPdf(box: ScreenBox, page: number, geometry: PageGeometry): Placement {
  const { zoom, heightPt } = geometry;
  const height = box.height / zoom;
  return {
    page,
    x: box.left / zoom,
    y: heightPt - box.top / zoom - height,
    width: box.width / zoom,
    height,
  };
}

/** Keeps a box inside the page, preserving its size where possible. */
export function clampToPage(box: ScreenBox, geometry: PageGeometry): ScreenBox {
  const pageWidth = geometry.widthPt * geometry.zoom;
  const pageHeight = geometry.heightPt * geometry.zoom;

  const width = Math.min(box.width, pageWidth);
  const height = Math.min(box.height, pageHeight);

  return {
    width,
    height,
    left: Math.max(0, Math.min(box.left, pageWidth - width)),
    top: Math.max(0, Math.min(box.top, pageHeight - height)),
  };
}

/** Rounds to two decimals so stored placements stay readable in the audit record. */
export function tidy(placement: Placement): Placement {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    page: placement.page,
    x: round(placement.x),
    y: round(placement.y),
    width: round(placement.width),
    height: round(placement.height),
  };
}
