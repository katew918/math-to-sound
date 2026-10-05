import { describe, expect, it } from 'vitest';
import {
  AXIS_LIMIT,
  MIN_SPAN,
  clampAxisValue,
  ensureSpan,
  niceStep,
  spanIsUsable,
  zoomAxis,
} from './viewport';

describe('niceStep', () => {
  it('gives the steps people expect', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(1, 5)).toBe(0.2);
  });

  it('never returns zero, however small the span', () => {
    // This is the one that matters: every caller advances a loop by this value,
    // so a zero step hangs the page. 5e-324 is the smallest positive double.
    for (const range of [1e-6, 1e-100, 1e-320, 1e-323, 5e-324, Number.MIN_VALUE]) {
      const step = niceStep(range, 6);
      expect(step).toBeGreaterThan(0);
      expect(Number.isFinite(step)).toBe(true);
    }
  });

  it('survives nonsense input', () => {
    for (const range of [0, -1, NaN, Infinity, -Infinity]) {
      expect(niceStep(range, 6)).toBeGreaterThan(0);
    }
    for (const count of [0, -5, NaN, Infinity]) {
      expect(niceStep(10, count)).toBeGreaterThan(0);
    }
  });

  it('keeps a grid loop finite for every span the UI allows', () => {
    const spans = [MIN_SPAN, 1e-5, 0.1, 1, 1000, 2 * AXIS_LIMIT];
    for (const span of spans) {
      const step = niceStep(span, 6);
      let lines = 0;
      for (let t = 0; t <= span && lines < 10_000; t += step) lines += 1;
      expect(lines).toBeLessThan(10_000); // i.e. it terminated on its own
    }
  });
});

describe('clampAxisValue', () => {
  it('leaves ordinary numbers alone', () => {
    expect(clampAxisValue(5, 0)).toBe(5);
    expect(clampAxisValue(-10, 0)).toBe(-10);
  });

  it('pulls huge values back to the limit', () => {
    expect(clampAxisValue(1e300, 0)).toBe(AXIS_LIMIT);
    expect(clampAxisValue(-1e300, 0)).toBe(-AXIS_LIMIT);
  });

  it('falls back when given nothing usable', () => {
    expect(clampAxisValue(NaN, -10)).toBe(-10);
    expect(clampAxisValue(Infinity, -10)).toBe(AXIS_LIMIT);
    expect(clampAxisValue(-Infinity, -10)).toBe(-AXIS_LIMIT);
  });
});

describe('spanIsUsable', () => {
  it('accepts a normal domain', () => {
    expect(spanIsUsable(-10, 10)).toBe(true);
  });

  it('rejects a reversed or collapsed one', () => {
    expect(spanIsUsable(10, -10)).toBe(false);
    expect(spanIsUsable(5, 5)).toBe(false);
    expect(spanIsUsable(0, MIN_SPAN / 2)).toBe(false);
  });

  it('accepts exactly the minimum span', () => {
    expect(spanIsUsable(0, MIN_SPAN)).toBe(true);
  });

  it('rejects non-numbers', () => {
    expect(spanIsUsable(NaN, 1)).toBe(false);
    expect(spanIsUsable(0, Infinity)).toBe(false);
  });
});

describe('ensureSpan', () => {
  it('passes a healthy range through untouched', () => {
    expect(ensureSpan(-2, 3)).toEqual({ lo: -2, hi: 3 });
  });

  it('opens out a collapsed range around its centre', () => {
    const { lo, hi } = ensureSpan(5, 5);
    expect(hi - lo).toBeCloseTo(MIN_SPAN, 12);
    expect((lo + hi) / 2).toBeCloseTo(5, 10);
  });

  it('gives something drawable for nonsense', () => {
    expect(ensureSpan(NaN, NaN)).toEqual({ lo: -1, hi: 1 });
    expect(ensureSpan(-Infinity, Infinity)).toEqual({ lo: -1, hi: 1 });
  });

  it('always produces a span a grid can be drawn on', () => {
    const cases: [number, number][] = [
      [0, 0], [1e-320, 1e-320], [-1e9, -1e9], [3, 3],
    ];
    for (const [lo, hi] of cases) {
      const span = ensureSpan(lo, hi);
      expect(span.hi - span.lo).toBeGreaterThanOrEqual(MIN_SPAN * 0.999);
      expect(niceStep(span.hi - span.lo, 5)).toBeGreaterThan(0);
    }
  });
});

describe('zoomAxis', () => {
  it('doubles the span when zooming out', () => {
    expect(zoomAxis(-10, 10, 2)).toEqual({ lo: -20, hi: 20 });
  });

  it('halves it when zooming in', () => {
    expect(zoomAxis(-10, 10, 0.5)).toEqual({ lo: -5, hi: 5 });
  });

  it('keeps the centre put', () => {
    const { lo, hi } = zoomAxis(0, 10, 2);
    expect((lo + hi) / 2).toBeCloseTo(5, 10);
  });

  it('stops at the limit however often you zoom out', () => {
    let lo = -10;
    let hi = 10;
    for (let i = 0; i < 200; i += 1) {
      ({ lo, hi } = zoomAxis(lo, hi, 2));
    }
    expect(lo).toBeGreaterThanOrEqual(-AXIS_LIMIT);
    expect(hi).toBeLessThanOrEqual(AXIS_LIMIT);
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
  });

  it('stops at the minimum span however often you zoom in', () => {
    let lo = -10;
    let hi = 10;
    for (let i = 0; i < 200; i += 1) {
      ({ lo, hi } = zoomAxis(lo, hi, 0.5));
    }
    expect(hi - lo).toBeGreaterThanOrEqual(MIN_SPAN * 0.999);
    expect(niceStep(hi - lo, 6)).toBeGreaterThan(0);
  });

  it('stays drawable when zooming at the very edge of the window', () => {
    const { lo, hi } = zoomAxis(AXIS_LIMIT - 1e-7, AXIS_LIMIT, 0.5);
    expect(hi - lo).toBeGreaterThanOrEqual(MIN_SPAN * 0.999);
    expect(hi).toBeLessThanOrEqual(AXIS_LIMIT);
  });

  it('survives nonsense', () => {
    expect(zoomAxis(NaN, 10, 2)).toEqual({ lo: -10, hi: 10 });
    expect(zoomAxis(0, 10, 0)).toEqual({ lo: -10, hi: 10 });
    expect(zoomAxis(0, 10, -1)).toEqual({ lo: -10, hi: 10 });
  });
});
