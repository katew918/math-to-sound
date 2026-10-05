import { useCallback, useEffect, useRef, useState } from 'react';
import {
  playbackRateFor,
  type FrequencyCurve,
  type SoundMode,
  type Wavetable,
} from '../lib/audio';

export type PlaybackState = 'idle' | 'playing' | 'paused';

/** Fade in/out lengths, long enough to stop a click, short enough to feel instant. */
const ATTACK_SECONDS = 0.015;
const RELEASE_SECONDS = 0.03;

/** A beat of lead time so every ramp is scheduled in the future. */
const LEAD_SECONDS = 0.02;

export interface PlayOptions {
  /** Which mapping to play: a looping waveform, or a pitch sweep. */
  mode: SoundMode;
  /** Used by 'waveform' mode. */
  wavetable: Wavetable;
  /** Used by 'sweep' mode. */
  frequencyCurve: FrequencyCurve;
  /** Waveform mode: the pitch the cycle repeats at. Sweep mode: the centre pitch. */
  baseFreq: number;
  /** How long to hold the note, in seconds. */
  duration: number;
  /** Master volume, 0 to 1. */
  volume: number;
}

/**
 * Owns the Web Audio graph and the play / pause / stop state machine.
 *
 * The graph is `AudioBufferSourceNode -> envelope gain -> master gain -> output`.
 * The `AudioContext` is created lazily on the first play, because browsers
 * refuse to start audio without a user gesture.
 */
export function useAudioPlayer() {
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const envelopeRef = useRef<GainNode | null>(null);
  // Either an AudioBufferSourceNode (waveform) or an OscillatorNode (sweep).
  const sourceRef = useRef<AudioScheduledSourceNode | null>(null);
  const cycleLengthRef = useRef(0);

  const [state, setState] = useState<PlaybackState>('idle');

  const ensureContext = useCallback(() => {
    let context = contextRef.current;
    let master = masterRef.current;

    // A context can end up closed without us closing it — iOS in particular
    // may close one after an audio interruption — and a closed context can
    // never be resumed, so build a fresh one rather than playing into a
    // dead graph.
    if (context && context.state === 'closed') {
      context = null;
      master = null;
      contextRef.current = null;
      masterRef.current = null;
    }

    if (!context || !master) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }

    return { context, master };
  }, []);

  const teardownSource = useCallback(() => {
    const source = sourceRef.current;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped, or never started — nothing to do.
      }
      source.disconnect();
      sourceRef.current = null;
    }

    const envelope = envelopeRef.current;
    if (envelope) {
      envelope.disconnect();
      envelopeRef.current = null;
    }
  }, []);

  const play = useCallback(
    async ({
      mode,
      wavetable,
      frequencyCurve,
      baseFreq,
      duration,
      volume,
    }: PlayOptions) => {
      const { context, master } = ensureContext();
      if (context.state === 'suspended') await context.resume();

      teardownSource();

      const envelope = context.createGain();

      // Never let the note be shorter than its own fade in and out.
      const held = Math.max(duration, ATTACK_SECONDS + RELEASE_SECONDS);
      const start = context.currentTime + LEAD_SECONDS;
      const end = start + held;

      const cycleLength = wavetable.samples.length;
      let source: AudioScheduledSourceNode;

      if (mode === 'waveform') {
        // One cycle of the curve, looped at the chosen pitch.
        const buffer = context.createBuffer(1, cycleLength, context.sampleRate);
        buffer.copyToChannel(wavetable.samples, 0);

        const bufferSource = context.createBufferSource();
        bufferSource.buffer = buffer;
        bufferSource.loop = true;
        bufferSource.loopStart = 0;
        bufferSource.loopEnd = buffer.duration;
        bufferSource.playbackRate.value = playbackRateFor(
          baseFreq,
          cycleLength,
          context.sampleRate,
        );
        source = bufferSource;
      } else {
        // A plain tone whose frequency traces the curve over the note.
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        // No setValueAtTime beforehand: an event overlapping the curve's own
        // window makes setValueCurveAtTime throw.
        oscillator.frequency.setValueCurveAtTime(frequencyCurve.values, start, held);
        source = oscillator;
      }

      source.connect(envelope);
      envelope.connect(master);
      master.gain.setTargetAtTime(volume, context.currentTime, 0.01);

      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(1, start + ATTACK_SECONDS);
      envelope.gain.setValueAtTime(1, end - RELEASE_SECONDS);
      envelope.gain.linearRampToValueAtTime(0, end);

      source.onended = () => {
        // Ignore the `onended` of a source we have already replaced.
        if (sourceRef.current !== source) return;
        teardownSource();
        setState('idle');
      };

      source.start(start);
      source.stop(end + 0.01);

      sourceRef.current = source;
      envelopeRef.current = envelope;
      cycleLengthRef.current = cycleLength;
      setState('playing');
    },
    [ensureContext, teardownSource],
  );

  /**
   * Suspending the whole context freezes `currentTime`, so every ramp and the
   * scheduled stop stay correct relative to the note — no rescheduling needed.
   */
  const pause = useCallback(async () => {
    const context = contextRef.current;
    if (!context || !sourceRef.current) return;
    await context.suspend();
    setState('paused');
  }, []);

  const resume = useCallback(async () => {
    const context = contextRef.current;
    if (!context) return;
    await context.resume();
    if (sourceRef.current) setState('playing');
  }, []);

  const stop = useCallback(async () => {
    const context = contextRef.current;
    const source = sourceRef.current;

    if (!context || !source) {
      setState('idle');
      return;
    }

    // Ramps only run while the clock is moving, so un-pause before fading out.
    if (context.state === 'suspended') await context.resume();

    const now = context.currentTime;
    const envelope = envelopeRef.current;
    if (envelope) {
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setValueAtTime(envelope.gain.value, now);
      envelope.gain.linearRampToValueAtTime(0, now + 0.02);
    }

    try {
      // A later `stop` call supersedes the one scheduled in `play`.
      source.stop(now + 0.03);
    } catch {
      // Never started; `onended` will not fire, so clean up here.
      teardownSource();
      setState('idle');
    }
  }, [teardownSource]);

  const setVolume = useCallback((volume: number) => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (context && master) {
      master.gain.setTargetAtTime(volume, context.currentTime, 0.01);
    }
  }, []);

  /**
   * Re-pitch a note that is already sounding, without restarting it.
   *
   * Only meaningful in waveform mode. A sweep's frequency is an already
   * scheduled curve, so re-centring it mid-note would mean tearing that curve
   * up and rebuilding it; there the new pitch applies on the next play.
   */
  const setBaseFreq = useCallback((baseFreq: number) => {
    const context = contextRef.current;
    const source = sourceRef.current;
    if (
      context &&
      source instanceof AudioBufferSourceNode &&
      cycleLengthRef.current > 0
    ) {
      source.playbackRate.setTargetAtTime(
        playbackRateFor(baseFreq, cycleLengthRef.current, context.sampleRate),
        context.currentTime,
        0.01,
      );
    }
  }, []);

  useEffect(
    () => () => {
      teardownSource();
      const context = contextRef.current;
      contextRef.current = null;
      masterRef.current = null;
      if (context) void context.close();
    },
    [teardownSource],
  );

  return { state, play, pause, resume, stop, setVolume, setBaseFreq };
}
