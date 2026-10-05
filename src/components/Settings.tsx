import { useEffect, useRef, useState } from 'react';

export interface SettingsProps {
  xMin: number;
  xMax: number;
  baseFreq: number;
  duration: number;
  volume: number;
  domainValid: boolean;
  onXMinChange: (value: number) => void;
  onXMaxChange: (value: number) => void;
  onBaseFreqChange: (value: number) => void;
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

export function Settings({
  xMin,
  xMax,
  baseFreq,
  duration,
  volume,
  domainValid,
  onXMinChange,
  onXMaxChange,
  onBaseFreqChange,
  onDurationChange,
  onVolumeChange,
}: SettingsProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Settings</h2>

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
          This span becomes one cycle of the wave, so it decides the shape you hear.
        </p>
      ) : (
        <p className="error-text">
          The left end of the domain must be smaller than the right.
        </p>
      )}

      <Slider
        label="Pitch"
        value={baseFreq}
        display={`${Math.round(baseFreq)} Hz`}
        min={55}
        max={880}
        step={1}
        onChange={onBaseFreqChange}
      />
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
