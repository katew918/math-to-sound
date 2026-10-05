import { robustPeak } from './sampling';

/**
 * Turning a function into sound
 * -----------------------------
 * The sampled curve becomes **one cycle of a looping waveform**. That cycle is
 * then repeated at whatever pitch you choose, so the shape of the graph is
 * literally the shape of the wave hitting your ears:
 *
 *   sin(x) over [0, 2*pi)   -> a pure tone
 *   x      over [-1, 1)     -> a sawtooth (the curve jumps -1 to +1 at the wrap)
 *   abs(x) over [-1, 1)     -> a triangle wave
 *   sign(sin(x))            -> a square wave
 *
 * The jump between the end of the cycle and its start is deliberately left in
 * place. It is not an artifact: `f(x) = x` really does leap from -1 to +1, and
 * that leap is exactly what makes a sawtooth sound like a sawtooth.
 *
 * No Fourier analysis is involved anywhere.
 */

export interface Wavetable {
  /**
   * One cycle, DC-free and normalised to a peak of 1.
   *
   * Explicitly backed by an `ArrayBuffer` (rather than the default
   * `ArrayBufferLike`) because `AudioBuffer.copyToChannel` will not accept a
   * view over a `SharedArrayBuffer`.
   */
  samples: Float32Array<ArrayBuffer>;
  /** True when the function is constant, so there is nothing to hear. */
  silent: boolean;
  /** True when an asymptote spike was clamped to keep the rest audible. */
  clipped: boolean;
}

/**
 * Convert sampled function values into a playable single-cycle wavetable.
 *
 * 1. Non-finite samples become silence.
 * 2. The mean is subtracted (DC removal) so the wave is centred on zero —
 *    without this, a function like `x^2 + 5` would push the speaker cone
 *    off-centre and waste headroom.
 * 3. Values are clamped to a robust peak, so one spike beside an asymptote
 *    can't normalise everything else down to inaudibility.
 * 4. The result is scaled to a peak of exactly 1.
 */
export function buildWavetable(ys: Float64Array): Wavetable {
  const n = ys.length;
  const samples = new Float32Array(n);

  // Mean of the finite samples only.
  let sum = 0;
  let finiteCount = 0;
  for (let i = 0; i < n; i += 1) {
    const value = ys[i];
    if (Number.isFinite(value)) {
      sum += value;
      finiteCount += 1;
    }
  }
  const mean = finiteCount > 0 ? sum / finiteCount : 0;

  // Sanitise and remove the DC offset in one pass.
  for (let i = 0; i < n; i += 1) {
    const value = ys[i];
    samples[i] = Number.isFinite(value) ? value - mean : 0;
  }

  // Find both the true peak and a robust (outlier-resistant) one.
  let truePeak = 0;
  for (let i = 0; i < n; i += 1) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > truePeak) truePeak = magnitude;
  }
  const robust = robustPeak(samples);

  // Only clamp when the true peak dwarfs the robust one, which means a genuine
  // asymptote spike. Well-behaved waves (a sawtooth, a sine) are left exactly
  // as they are rather than having their tips flattened.
  const spiking = robust > 0 && truePeak > robust * 4;
  const limit = spiking ? robust : truePeak;
  let clipped = false;

  if (limit > 0) {
    const gain = 1 / limit;
    for (let i = 0; i < n; i += 1) {
      const value = samples[i];
      if (value > limit) {
        samples[i] = 1;
        clipped = true;
      } else if (value < -limit) {
        samples[i] = -1;
        clipped = true;
      } else {
        samples[i] = value * gain;
      }
    }
  }

  return { samples, silent: limit === 0, clipped };
}

/**
 * The `playbackRate` that makes a `cycleLength`-sample buffer repeat at
 * `baseFreq` hertz.
 *
 * A buffer of N samples played at its native rate loops at `sampleRate / N`
 * Hz, so to reach `baseFreq` we speed it up by `baseFreq * N / sampleRate`.
 */
export function playbackRateFor(
  baseFreq: number,
  cycleLength: number,
  sampleRate: number,
): number {
  return (baseFreq * cycleLength) / sampleRate;
}
