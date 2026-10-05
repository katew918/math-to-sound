import { useEffect, useMemo, useState } from 'react';
import { Controls } from './components/Controls';
import { FunctionInput } from './components/FunctionInput';
import { Graph } from './components/Graph';
import { PRESETS, Presets, type Preset } from './components/Presets';
import { Settings } from './components/Settings';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { buildWavetable } from './lib/audio';
import { ParseError, compile, type CompiledFunction } from './lib/parser';
import { SAMPLE_COUNT, sampleFunction } from './lib/sampling';

const INITIAL = PRESETS[0];

export default function App() {
  const [text, setText] = useState(INITIAL.expression);
  const [xMin, setXMin] = useState(INITIAL.xMin);
  const [xMax, setXMax] = useState(INITIAL.xMax);
  const [baseFreq, setBaseFreq] = useState(220);
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
  const domainValid = xMax > xMin;

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

  const { state, play, pause, resume, stop, setVolume: applyVolume, setBaseFreq: applyBaseFreq } =
    useAudioPlayer();

  // Volume and pitch are AudioParams, so they can change mid-note.
  useEffect(() => applyVolume(volume), [volume, applyVolume]);
  useEffect(() => applyBaseFreq(baseFreq), [baseFreq, applyBaseFreq]);

  // A new function or domain is a different wave, so stop rather than splice.
  useEffect(() => {
    void stop();
  }, [activeFn, xMin, xMax, stop]);

  const handlePick = (preset: Preset) => {
    setText(preset.expression);
    setXMin(preset.xMin);
    setXMax(preset.xMax);
  };

  return (
    <div className="app">
      <header className="masthead">
        <h1>Math to Sound</h1>
        <p>
          Type a function of <code>x</code>. Its curve becomes one cycle of a
          waveform, looped at the pitch you choose — so you hear the shape you see.
        </p>
      </header>

      <main className="layout">
        <div className="column">
          <FunctionInput value={text} onChange={setText} error={parsed.error} />

          <Graph ys={ys} xMin={xMin} xMax={xMax} />

          <Controls
            state={state}
            canPlay={domainValid}
            onPlay={() => void play({ wavetable, baseFreq, duration, volume })}
            onPause={() => void pause()}
            onResume={() => void resume()}
            onStop={() => void stop()}
          />

          {wavetable.silent && domainValid && (
            <p className="notice">
              This function is constant across the domain, so there is no wave to
              hear. Try widening the domain.
            </p>
          )}
          {wavetable.clipped && (
            <p className="notice">
              A spike near an asymptote was clamped so the rest of the wave stays
              audible.
            </p>
          )}
        </div>

        <aside className="column column-side">
          <Presets current={text} onPick={handlePick} />
          <Settings
            xMin={xMin}
            xMax={xMax}
            baseFreq={baseFreq}
            duration={duration}
            volume={volume}
            domainValid={domainValid}
            onXMinChange={setXMin}
            onXMaxChange={setXMax}
            onBaseFreqChange={setBaseFreq}
            onDurationChange={setDuration}
            onVolumeChange={setVolume}
          />
        </aside>
      </main>

      <footer className="footnote">
        The wave is centred on zero and normalised before playing, so volume is
        yours to set and not a side effect of the function's scale.
      </footer>
    </div>
  );
}
