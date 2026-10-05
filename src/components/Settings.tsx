import { useEffect, useRef, useState } from 'react';
import type { SoundMode } from '../lib/audio';

export interface SettingsProps {
  mode: SoundMode;
  xMin: number;
  xMax: number;
  baseFreq: number;
  octaves: number;
  duration: number;
  volume: number;
  domainValid: boolean;
  onModeChange: (mode: SoundMode) => void;
  onXMinChange: (value: number) => void;
  onXMaxChange: (value: number) => void;
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
 * A number input that keeps its own text while being edited, so a half-typed
 * value like "-" or "1." isn't rewritten under the cursor, and so a value set
 * from outside (by a preset) still refreshes the box.
 */
function NumberField({ label, value, invalid, onChange }: NumberFieldProps) {
  const [text, setText] = useState(() => formatNumber(value));
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(formatNumber(value));
    }
  }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      committed.current = parsed;
      onChange(parsed);
    }
  };

  return (
    <label className="field field-inline">
      <span className="field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => setText(formatNumber(value))}
        aria-invalid={invalid}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
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
  baseFreq,
  octaves,
  duration,
  volume,
  domainValid,
  onModeChange,
  onXMinChange,
  onXMaxChange,
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

      <h2 className="panel-title panel-title-spaced">Settings</h2>

      <div className="domain">
        <NumberField
          label="x from"
          value={xMin}
          invalid={!domainValid}
          onChange={onXMinChange}
        />
        <NumberField
          label="to"
          value={xMax}
          invalid={!domainValid}
          onChange={onXMaxChange}
        />
      </div>

      {domainValid ? (
        <p className="hint">
          {sweeping
            ? 'The stretch of the function you listen to.'
            : 'This span becomes one cycle of the wave, so it decides the shape you hear.'}
        </p>
      ) : (
        <p className="error-text">
          The left end of the domain must be smaller than the right.
        </p>
      )}

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
