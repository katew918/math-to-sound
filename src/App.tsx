import { useEffect, useMemo, useState } from 'react';
import { Controls } from './components/Controls';
import { FunctionInput } from './components/FunctionInput';
import { Graph } from './components/Graph';
import { PRESETS, Presets, type Preset } from './components/Presets';
import { Settings } from './components/Settings';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { buildFrequencyCurve, buildWavetable, type SoundMode } from './lib/audio';
import { ParseError, compile, type CompiledFunction } from './lib/parser';
import { SAMPLE_COUNT, robustRange, sampleFunction } from './lib/sampling';
import {
  clampAxisValue,
  ensureSpan,
  spanIsUsable,
  type Range,
} from './lib/viewport';

const INITIAL = PRESETS[0];

/**
 * The domain the app opens on. Deliberately wider than any single preset's,
 * to show plenty of the function at a glance. Presets still carry their own
 * narrower domains, because in timbre mode the domain has to be exactly one
 * cycle for `sin(x)` to sound like a pure tone.
 */
const INITIAL_X_MIN = -10;
const INITIAL_X_MAX = 10;

export default function App() {
  const [text, setText] = useState(INITIAL.expression);
  const [xMin, setXMin] = useState(INITIAL_X_MIN);
  const [xMax, setXMax] = useState(INITIAL_X_MAX);
  const [yAuto, setYAuto] = useState(true);
  const [yMin, setYMin] = useState(-2);
  const [yMax, setYMax] = useState(2);
  const [mode, setMode] = useState<SoundMode>('sweep');
  const [baseFreq, setBaseFreq] = useState(220);
  const [octaves, setOctaves] = useState(2);
  const [duration, setDuration] = useState(2);
  const [volume, setVolume] = useState(0.5);

  // Re-parse on every keystroke. Invalid input produces an error rather than
  // throwing, so the UI can keep showing the last function that worked.
  const parsed = useMemo(() => {
    try {
      return { fn: compile(text), error: null as ParseError | null };
    } catch (caught) {
      const error =
        caught instanceof ParseError
          ? caught
          : new ParseError(caught instanceof Error ? caught.message : String(caught), 0);
      return { fn: null, error };
    }
  }, [text]);

  const [lastGoodFn, setLastGoodFn] = useState<CompiledFunction>(() =>
    compile(INITIAL.expression),
  );

  useEffect(() => {
    const fn = parsed.fn;
    // The extra arrow matters: setState treats a bare function as an updater.
    if (fn) setLastGoodFn(() => fn);
  }, [parsed]);

  const activeFn = parsed.fn ?? lastGoodFn;
  const domainValid = spanIsUsable(xMin, xMax);
  const rangeValid = spanIsUsable(yMin, yMax);

  // One array, used by both the graph and the audio — so the curve on screen
  // is literally the wave being played.
  const ys = useMemo(
    () =>
      domainValid
        ? sampleFunction(activeFn, xMin, xMax)
        : new Float64Array(SAMPLE_COUNT),
    [activeFn, xMin, xMax, domainValid],
  );

  const wavetable = useMemo(() => buildWavetable(ys), [ys]);

  // The auto-fitted y window, also used to seed the manual boxes so switching
  // to Manual doesn't make the graph jump.
  const autoRange = useMemo(() => {
    const fitted = robustRange(ys);
    return ensureSpan(fitted.lo, fitted.hi);
  }, [ys]);

  // Fall back to auto while a hand-typed range is unusable, so the graph keeps
  // drawing instead of going blank while you are halfway through typing.
  const yRange: Range = useMemo(
    () => (yAuto || !rangeValid ? autoRange : ensureSpan(yMin, yMax)),
    [yAuto, rangeValid, autoRange, yMin, yMax],
  );
  const frequencyCurve = useMemo(
    () => buildFrequencyCurve(ys, baseFreq, octaves),
    [ys, baseFreq, octaves],
  );

  const { state, play, pause, resume, stop, setVolume: applyVolume, setBaseFreq: applyBaseFreq } =
    useAudioPlayer();

  // Volume and pitch are AudioParams, so they can change mid-note.
  useEffect(() => applyVolume(volume), [volume, applyVolume]);
  useEffect(() => applyBaseFreq(baseFreq), [baseFreq, applyBaseFreq]);

  // A new function, domain or mapping is a different sound, so stop rather
  // than try to splice it into the note already playing.
  useEffect(() => {
    void stop();
  }, [activeFn, xMin, xMax, mode, stop]);

  const handlePick = (preset: Preset) => {
    setText(preset.expression);
    setXMin(preset.xMin);
    setXMax(preset.xMax);
  };

  // Every axis value the UI can produce goes through the clamp, so nothing
  // outside the drawable window ever reaches the renderer.
  const handleDomainChange = (min: number, max: number) => {
    setXMin(clampAxisValue(min, -10));
    setXMax(clampAxisValue(max, 10));
  };

  const handleYRangeChange = (min: number, max: number) => {
    setYMin(clampAxisValue(min, -2));
    setYMax(clampAxisValue(max, 2));
  };

  const handleYAutoChange = (auto: boolean) => {
    // Seed the manual boxes from what is on screen right now.
    if (!auto) {
      setYMin(Number(autoRange.lo.toPrecision(4)));
      setYMax(Number(autoRange.hi.toPrecision(4)));
    }
    setYAuto(auto);
  };

  return (
    <div className="app">
      <header className="masthead">
        <h1>Math to Sound</h1>
        <p>
          Type a function of <code>x</code>, see its graph, and hear it. Either
          follow the curve as a <strong>pitch</strong> that rises and falls with
          f(x), or play the curve itself as a waveform and hear its{' '}
          <strong>timbre</strong>.
        </p>
      </header>

      <main className="layout">
        <div className="column">
          <FunctionInput value={text} onChange={setText} error={parsed.error} />

          <Graph ys={ys} xMin={xMin} xMax={xMax} yRange={yRange} />

          <Controls
            state={state}
            canPlay={domainValid}
            onPlay={() =>
              void play({ mode, wavetable, frequencyCurve, baseFreq, duration, volume })
            }
            onPause={() => void pause()}
            onResume={() => void resume()}
            onStop={() => void stop()}
          />

          {domainValid && mode === 'sweep' && (
            <p className="notice">
              {frequencyCurve.flat
                ? 'This function is constant across the domain, so the pitch holds steady.'
                : `Sweeping ${Math.round(frequencyCurve.lowestHz)} Hz to ${Math.round(
                    frequencyCurve.highestHz,
                  )} Hz as f(x) rises and falls.`}
            </p>
          )}
          {domainValid && mode === 'waveform' && wavetable.silent && (
            <p className="notice">
              This function is constant across the domain, so there is no wave to
              hear. Try widening the domain.
            </p>
          )}
          {mode === 'waveform' && wavetable.clipped && (
            <p className="notice">
              A spike near an asymptote was clamped so the rest of the wave stays
              audible.
            </p>
          )}
        </div>

        <aside className="column column-side">
          <Presets current={text} onPick={handlePick} />
          <Settings
            mode={mode}
            xMin={xMin}
            xMax={xMax}
            yAuto={yAuto}
            yMin={yMin}
            yMax={yMax}
            baseFreq={baseFreq}
            octaves={octaves}
            duration={duration}
            volume={volume}
            domainValid={domainValid}
            rangeValid={rangeValid}
            onModeChange={setMode}
            onDomainChange={handleDomainChange}
            onYAutoChange={handleYAutoChange}
            onYRangeChange={handleYRangeChange}
            onBaseFreqChange={setBaseFreq}
            onOctavesChange={setOctaves}
            onDurationChange={setDuration}
            onVolumeChange={setVolume}
          />
        </aside>
      </main>

      <footer className="footnote">
        Both mappings normalise the function's own scale away — one to a peak of
        1, the other onto a span of octaves — so how loud and how high it sounds
        stay yours to set, rather than being an accident of the numbers f(x)
        happens to produce.
      </footer>
    </div>
  );
}
