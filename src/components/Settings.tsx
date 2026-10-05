import { useEffect, useRef, useState } from 'react';
import type { SoundMode } from '../lib/audio';
import { AXIS_LIMIT, zoomAxis } from '../lib/viewport';

export interface SettingsProps {
  mode: SoundMode;
  xMin: number;
  xMax: number;
  yAuto: boolean;
  yMin: number;
  yMax: number;
  baseFreq: number;
  octaves: number;
  duration: number;
  volume: number;
  domainValid: boolean;
  rangeValid: boolean;
  onModeChange: (mode: SoundMode) => void;
  onDomainChange: (min: number, max: number) => void;
  onYAutoChange: (auto: boolean) => void;
  onYRangeChange: (min: number, max: number) => void;
  onBaseFreqChange: (value: number) => void;
  onOctavesChange: (value: number) => void;
  onDurationChange: (value: number) => void;
  onVolumeChange: (value: number) => void;
}

/** Trim a value for display: 2*pi shows as 6.28319, not 6.283185307179586. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Number(value.toPrecision(6)));
}

interface NumberFieldProps {
  label: string;
  value: number;
  invalid: boolean;
  onChange: (value: number) => void;
}

/**
 * A number input that keeps its own text while being edited.
 *
 * Two things it has to balance. A half-typed value like "-" or "1." must not be
 * rewritten under the cursor, and neither must a value the parent has clamped:
 * typing "1e999" would otherwise snap the box to "1000000" the moment "1e9"
 * became a number, and the rest of the keystrokes would land on the end of
 * that. So while the box has focus its text is left alone, and on blur it
 * resyncs to whatever the value actually ended up being — which is where you
 * see the clamp take effect.
 *
 * Infinity is passed up rather than swallowed, so the parent's clamp decides
 * what to do with it. Only a genuine non-number is held back, since that is
 * what a half-typed entry looks like.
 */
function NumberField({ label, value, invalid, onChange }: NumberFieldProps) {
  const [text, setText] = useState(() => formatNumber(value));
  const [focused, setFocused] = useState(false);
  const committed = useRef(value);

  useEffect(() => {
    if (focused) return;
    if (value !== committed.current) {
      committed.current = value;
      setText(formatNumber(value));
    }
  }, [value, focused]);

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    committed.current = parsed;
    onChange(parsed);
  };

  return (
    <label className="field field-inline">
      <span className="field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          committed.current = value;
          setText(formatNumber(value));
        }}
        aria-invalid={invalid}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  );
}

interface AxisControlProps {
  name: string;
  lo: number;
  hi: number;
  invalid: boolean;
  onChange: (lo: number, hi: number) => void;
}

/** Two endpoints plus zoom, for one axis. */
function AxisControl({ name, lo, hi, invalid, onChange }: AxisControlProps) {
  const zoom = (factor: number) => {
    const next = zoomAxis(lo, hi, factor);
    onChange(next.lo, next.hi);
  };

  return (
    <div className="axis">
      <NumberField
        label={`${name} from`}
        value={lo}
        invalid={invalid}
        onChange={(value) => onChange(value, hi)}
      />
      <NumberField
        label="to"
        value={hi}
        invalid={invalid}
        onChange={(value) => onChange(lo, value)}
      />
      <div className="axis-zoom">
        <button
          type="button"
          onClick={() => zoom(2)}
          aria-label={`Zoom out the ${name} axis`}
          title={`Zoom out the ${name} axis`}
        >
          &minus;
        </button>
        <button
          type="button"
          onClick={() => zoom(0.5)}
          aria-label={`Zoom in the ${name} axis`}
          title={`Zoom in the ${name} axis`}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function Slider({ label, value, display, min, max, step, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <output>{display}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

const MODES: { value: SoundMode; label: string; blurb: string }[] = [
  {
    value: 'sweep',
    label: 'Pitch',
    blurb: 'f(x) sets the pitch as it moves, so you hear the curve as a melody.',
  },
  {
    value: 'waveform',
    label: 'Timbre',
    blurb:
      'The curve becomes one cycle of a looping wave. Every function plays at the same pitch; only the tone colour changes.',
  },
];

export function Settings({
  mode,
  xMin,
  xMax,
  yAuto,
  yMin,
  yMax,
  baseFreq,
  octaves,
  duration,
  volume,
  domainValid,
  rangeValid,
  onModeChange,
  onDomainChange,
  onYAutoChange,
  onYRangeChange,
  onBaseFreqChange,
  onOctavesChange,
  onDurationChange,
  onVolumeChange,
}: SettingsProps) {
  const sweeping = mode === 'sweep';

  return (
    <section className="panel">
      <h2 className="panel-title">What you hear</h2>

      <div className="mode-switch" role="group" aria-label="Sound mapping">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`mode-option${option.value === mode ? ' is-active' : ''}`}
            onClick={() => onModeChange(option.value)}
            aria-pressed={option.value === mode}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="hint">{MODES.find((m) => m.value === mode)?.blurb}</p>

      <h2 className="panel-title panel-title-spaced">Graph scale</h2>

      <AxisControl
        name="x"
        lo={xMin}
        hi={xMax}
        invalid={!domainValid}
        onChange={onDomainChange}
      />

      {domainValid ? (
        <p className="hint">
          {sweeping
            ? 'The stretch of the function you listen to.'
            : 'This span becomes one cycle of the wave, so it decides the shape you hear.'}
        </p>
      ) : (
        <p className="error-text">
          The left end must be below the right by at least 0.000001.
        </p>
      )}

      <div className="axis-mode">
        <span className="axis-mode-label">y axis</span>
        <div className="mode-switch mode-switch-small" role="group" aria-label="Y axis scale">
          <button
            type="button"
            className={`mode-option${yAuto ? ' is-active' : ''}`}
            onClick={() => onYAutoChange(true)}
            aria-pressed={yAuto}
          >
            Auto
          </button>
          <button
            type="button"
            className={`mode-option${yAuto ? '' : ' is-active'}`}
            onClick={() => onYAutoChange(false)}
            aria-pressed={!yAuto}
          >
            Manual
          </button>
        </div>
      </div>

      {yAuto ? (
        <p className="hint">The y axis fits the function, ignoring asymptote spikes.</p>
      ) : (
        <>
          <AxisControl
            name="y"
            lo={yMin}
            hi={yMax}
            invalid={!rangeValid}
            onChange={onYRangeChange}
          />
          {rangeValid ? (
            <p className="hint">
              Changes the view only — it doesn't alter how the function sounds.
            </p>
          ) : (
            <p className="error-text">
              The bottom must be below the top by at least 0.000001.
            </p>
          )}
        </>
      )}

      <p className="hint">
        Both axes are capped at &plusmn;{AXIS_LIMIT.toExponential(0)} so the graph
        stays drawable.
      </p>

      <h2 className="panel-title panel-title-spaced">Sound</h2>

      <Slider
        label={sweeping ? 'Centre pitch' : 'Pitch'}
        value={baseFreq}
        display={`${Math.round(baseFreq)} Hz`}
        min={55}
        max={880}
        step={1}
        onChange={onBaseFreqChange}
      />
      {sweeping && (
        <Slider
          label="Pitch range"
          value={octaves}
          display={`±${octaves.toFixed(1)} oct`}
          min={0.5}
          max={4}
          step={0.1}
          onChange={onOctavesChange}
        />
      )}
      <Slider
        label="Duration"
        value={duration}
        display={`${duration.toFixed(2)} s`}
        min={0.25}
        max={5}
        step={0.05}
        onChange={onDurationChange}
      />
      <Slider
        label="Volume"
        value={volume}
        display={`${Math.round(volume * 100)}%`}
        min={0}
        max={1}
        step={0.01}
        onChange={onVolumeChange}
      />
    </section>
  );
}
