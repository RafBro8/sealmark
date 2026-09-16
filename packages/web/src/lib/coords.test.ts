import { describe, it, expect } from 'vitest';
import type { Placement } from '@sealmark/core';
import { clampToPage, tidy, toPdf, toScreen, type PageGeometry, type ScreenBox } from './coords.js';

/** US Letter at 100%. */
const LETTER: PageGeometry = { widthPt: 612, heightPt: 792, zoom: 1 };
const ZOOMED: PageGeometry = { widthPt: 612, heightPt: 792, zoom: 1.5 };

describe('toScreen', () => {
  it('flips the vertical axis, accounting for box height', () => {
    // A box sitting on the page bottom edge should render at the very bottom.
    const placement: Placement = { page: 0, x: 0, y: 0, width: 100, height: 20 };
    expect(toScreen(placement, LETTER)).toEqual({ left: 0, top: 772, width: 100, height: 20 });
  });

  it('places a box at the top of the page at screen top', () => {
    const placement: Placement = { page: 0, x: 10, y: 772, width: 100, height: 20 };
    expect(toScreen(placement, LETTER)).toEqual({ left: 10, top: 0, width: 100, height: 20 });
  });

  it('scales by zoom', () => {
    const placement: Placement = { page: 0, x: 100, y: 100, width: 200, height: 40 };
    expect(toScreen(placement, ZOOMED)).toEqual({
      left: 150,
      top: (792 - 100 - 40) * 1.5,
      width: 300,
      height: 60,
    });
  });
});

describe('toPdf', () => {
  it('is the inverse of toScreen', () => {
    const placement: Placement = { page: 2, x: 60, y: 123, width: 230, height: 24 };
    const roundTripped = toPdf(toScreen(placement, LETTER), 2, LETTER);
    expect(tidy(roundTripped)).toEqual(placement);
  });

  it('round-trips under zoom without drift', () => {
    const placement: Placement = { page: 0, x: 72.5, y: 240.25, width: 180, height: 32 };
    expect(tidy(toPdf(toScreen(placement, ZOOMED), 0, ZOOMED))).toEqual(placement);
  });

  it('keeps the page index it is given', () => {
    const box: ScreenBox = { left: 0, top: 0, width: 10, height: 10 };
    expect(toPdf(box, 4, LETTER).page).toBe(4);
  });
});

describe('clampToPage', () => {
  it('pulls a box back inside the left and top edges', () => {
    const box: ScreenBox = { left: -50, top: -30, width: 100, height: 20 };
    expect(clampToPage(box, LETTER)).toEqual({ left: 0, top: 0, width: 100, height: 20 });
  });

  it('pulls a box back inside the right and bottom edges', () => {
    const box: ScreenBox = { left: 600, top: 790, width: 100, height: 20 };
    expect(clampToPage(box, LETTER)).toEqual({ left: 512, top: 772, width: 100, height: 20 });
  });

  it('shrinks a box that is larger than the page', () => {
    const box: ScreenBox = { left: 0, top: 0, width: 900, height: 1000 };
    expect(clampToPage(box, LETTER)).toEqual({ left: 0, top: 0, width: 612, height: 792 });
  });

  it('leaves a box that already fits untouched', () => {
    const box: ScreenBox = { left: 100, top: 100, width: 200, height: 40 };
    expect(clampToPage(box, LETTER)).toEqual(box);
  });

  it('accounts for zoom when deciding the page bounds', () => {
    // At 1.5x the page occupies 918 x 1188 screen pixels.
    const box: ScreenBox = { left: 900, top: 0, width: 100, height: 20 };
    expect(clampToPage(box, ZOOMED).left).toBe(918 - 100);
  });
});

describe('tidy', () => {
  it('rounds to two decimals so records stay readable', () => {
    const placement: Placement = {
      page: 0,
      x: 59.499999,
      y: 120.700001,
      width: 200.00004,
      height: 26.126,
    };
    expect(tidy(placement)).toEqual({ page: 0, x: 59.5, y: 120.7, width: 200, height: 26.13 });
  });
});
