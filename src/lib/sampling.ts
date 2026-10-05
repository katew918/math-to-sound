import type { CompiledFunction } from './parser';

/**
 * Number of points the function is evaluated at. This is both the graph's
 * resolution and the length of the audio wavetable — a power of two keeps the
 * audio buffer a friendly size.
 */
export const SAMPLE_COUNT = 2048;

/**
 * Evaluate `f` at evenly spaced points across the **half-open** interval
 * `[xMin, xMax)`.
 *
 * The interval is half-open on purpose. The resulting array is looped
 * end-to-start as a single cycle of audio, so including both endpoints would
 * duplicate a sample at the wrap point and put a small kink in every waveform.
 * With the endpoint excluded, `sin(x)` over `[0, 2*pi)` loops into a
 * mathematically perfect sine.
 *
 * Non-finite results (from `1/x` at zero, `tan` at pi/2, `log` of a negative,
 * and so on) are stored as `NaN`, which lets the graph break the line at an
 * asymptote and lets the audio stage zero those samples out.
 */
export function sampleFunction(
  f: CompiledFunction,
  xMin: number,
  xMax: number,
  n: number = SAMPLE_COUNT,
): Float64Array {
  const ys = new Float64Array(n);
  const step = (xMax - xMin) / n;

  for (let i = 0; i < n; i += 1) {
    let value: number;
    try {
      value = f(xMin + i * step);
    } catch {
      value = NaN;
    }
    ys[i] = Number.isFinite(value) ? value : NaN;
  }

  return ys;
}

/**
 * A percentile of the absolute finite values in `ys`.
 *
 * Used instead of a plain maximum so that a single enormous spike beside an
 * asymptote (think `tan(x)` reaching 1e16) doesn't squash the rest of the data
 * into a flat line on the graph, or into near-silence in the audio.
 */
export function robustPeak(ys: ArrayLike<number>, percentile = 0.995): number {
  const magnitudes: number[] = [];
  for (let i = 0; i < ys.length; i += 1) {
    const value = ys[i];
    if (Number.isFinite(value)) magnitudes.push(Math.abs(value));
  }
  if (magnitudes.length === 0) return 0;

  magnitudes.sort((a, b) => a - b);
  const index = Math.floor(percentile * (magnitudes.length - 1));
  return magnitudes[index];
}

/**
 * A robust `[lo, hi]` window for the graph's y-axis, with 10% padding.
 *
 * Unlike {@link robustPeak} this is asymmetric, so a function like `x^2` that
 * is entirely positive doesn't waste half the plot on empty space.
 */
export function robustRange(
  ys: ArrayLike<number>,
  percentile = 0.9975,
): { lo: number; hi: number } {
  const values: number[] = [];
  for (let i = 0; i < ys.length; i += 1) {
    const value = ys[i];
    if (Number.isFinite(value)) values.push(value);
  }
  if (values.length === 0) return { lo: -1, hi: 1 };

  values.sort((a, b) => a - b);
  const last = values.length - 1;
  let lo = values[Math.floor((1 - percentile) * last)];
  let hi = values[Math.ceil(percentile * last)];

  if (!(hi > lo)) {
    // A constant function: invent a window around it so there is something to draw.
    const centre = Number.isFinite(lo) ? lo : 0;
    lo = centre - 1;
    hi = centre + 1;
  }

  const padding = (hi - lo) * 0.1;
  return { lo: lo - padding, hi: hi + padding };
}
