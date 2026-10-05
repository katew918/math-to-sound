/**
 * Limits and helpers for the graph's axes.
 *
 * Two jobs: keep the numbers a person can type inside a range the renderer can
 * actually draw, and make the grid-step calculation incapable of returning a
 * step that would hang the browser.
 */

/** Furthest from zero either end of an axis may sit. */
export const AXIS_LIMIT = 1e6;

/**
 * Closest the two ends of an axis may get.
 *
 * Far above the point where doubles lose their footing: a span near 1e-323
 * makes a "nice" grid step round down to exactly zero, and a `t += step` loop
 * with a zero step never finishes.
 */
export const MIN_SPAN = 1e-6;

/** Most grid lines to draw on one axis, whatever the numbers say. */
export const MAX_GRID_LINES = 200;

export interface Range {
  lo: number;
  hi: number;
}

/**
 * Pull a single axis endpoint into range.
 *
 * An infinity lands on the limit rather than the fallback: typing `1e999`
 * parses to Infinity, and the person reaching for it meant "very large", so the
 * largest value we can draw is the honest answer. Only a genuine non-number
 * falls back.
 */
export function clampAxisValue(value: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  if (value < -AXIS_LIMIT) return -AXIS_LIMIT;
  if (value > AXIS_LIMIT) return AXIS_LIMIT;
  return value;
}

/** True when `lo`..`hi` is the right way round and wide enough to draw. */
export function spanIsUsable(lo: number, hi: number): boolean {
  return Number.isFinite(lo) && Number.isFinite(hi) && hi - lo >= MIN_SPAN;
}

/**
 * Widen a range that is too narrow (or back to front) around its own centre,
 * so there is always something drawable. Used on the auto-fitted y range,
 * which can collapse for a function that barely moves.
 */
export function ensureSpan(lo: number, hi: number): Range {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: -1, hi: 1 };
  if (hi - lo >= MIN_SPAN) return { lo, hi };

  const centre = (lo + hi) / 2;
  const safeCentre = Number.isFinite(centre)
    ? clampAxisValue(centre, 0)
    : 0;
  return { lo: safeCentre - MIN_SPAN / 2, hi: safeCentre + MIN_SPAN / 2 };
}

/**
 * Scale a range about its centre. `factor` above 1 zooms out, below 1 zooms in.
 * The result is always inside the limits and wide enough to draw.
 */
export function zoomAxis(lo: number, hi: number, factor: number): Range {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(factor > 0)) {
    return { lo: -10, hi: 10 };
  }

  const centre = (lo + hi) / 2;
  const half = Math.abs(hi - lo) / 2;
  let nextHalf = half * factor;

  // Keep the span inside both ends of the allowed window.
  if (nextHalf < MIN_SPAN / 2) nextHalf = MIN_SPAN / 2;
  if (nextHalf > AXIS_LIMIT) nextHalf = AXIS_LIMIT;

  let nextLo = clampAxisValue(centre - nextHalf, -AXIS_LIMIT);
  let nextHi = clampAxisValue(centre + nextHalf, AXIS_LIMIT);

  // Clamping one end can squash the span; push the other end out to restore it.
  if (nextHi - nextLo < MIN_SPAN) {
    if (nextLo <= -AXIS_LIMIT) nextHi = nextLo + MIN_SPAN;
    else nextLo = nextHi - MIN_SPAN;
  }

  return { lo: nextLo, hi: nextHi };
}

/**
 * A grid step of 1, 2 or 5 times a power of ten — the steps people expect.
 *
 * Guaranteed to return a finite, strictly positive number. An earlier version
 * could return 0 for a span around 1e-323, because the power of ten underflowed
 * to zero; every caller advances a loop by this value, so a zero step froze the
 * page. The limits above make that span unreachable from the UI, but the
 * guarantee lives here too rather than resting on the UI getting it right.
 */
export function niceStep(range: number, targetCount: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  if (!Number.isFinite(targetCount) || targetCount <= 0) return 1;

  const raw = range / targetCount;
  if (!Number.isFinite(raw) || raw <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(raw));
  if (!Number.isFinite(magnitude) || magnitude <= 0) return 1;

  const normalised = raw / magnitude;
  const factor = normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10;
  const step = factor * magnitude;

  return Number.isFinite(step) && step > 0 ? step : 1;
}
