export interface Preset {
  expression: string;
  xMin: number;
  xMax: number;
  /** What this one sounds like, shown as the button's tooltip. */
  sounds: string;
  /** Shown on the button when the expression is too long to read at a glance. */
  label?: string;
}

const TAU = Math.PI * 2;

/**
 * Each preset carries its own domain, because the domain is what decides the
 * shape of the single cycle — and therefore the timbre you hear.
 */
export const PRESETS: readonly Preset[] = [
  { expression: 'sin(x)', xMin: 0, xMax: TAU, sounds: 'A pure tone' },
  { expression: 'x', xMin: -1, xMax: 1, sounds: 'A sawtooth — the curve leaps from -1 to +1 at the wrap' },
  { expression: 'abs(x)', xMin: -1, xMax: 1, sounds: 'A triangle wave' },
  { expression: 'sign(sin(x))', xMin: 0, xMax: TAU, sounds: 'A square wave, hollow and buzzy' },
  { expression: 'x^2', xMin: -1, xMax: 1, sounds: 'Soft and rounded' },
  { expression: 'sin(x) + cos(x)', xMin: 0, xMax: TAU, sounds: 'A pure tone again, just shifted along' },
  {
    expression: 'sin(x) + 0.5sin(2x) + 0.25sin(3x)',
    xMin: 0,
    xMax: TAU,
    sounds: 'Stacked harmonics — organ-like',
  },
  { expression: 'sin(1/x)', xMin: 0.05, xMax: 1, sounds: 'Harsh and chaotic' },
  { expression: '1/x', xMin: 0.1, xMax: 2, sounds: 'Thin and reedy' },
  { expression: 'exp(-x^2)', xMin: -3, xMax: 3, sounds: 'A soft pulse' },
  {
    expression: '{x mod 2 < 1: 1, -1}',
    xMin: 0,
    xMax: 4,
    sounds: 'A square wave, written as two cases instead of as a formula',
  },
  {
    label: 'piecewise mix',
    expression:
      '{x mod 2 < 0.5: 3(1 - 2floor(2(6x mod 1))), ' +
      'x mod 2 < 1.2: -1.2, ' +
      '2.2*2(2x - floor(2x + 1/2))}',
    xMin: 0,
    xMax: 4,
    sounds: 'Three different shapes spliced together, repeating every 2',
  },
];

export interface PresetsProps {
  current: string;
  onPick: (preset: Preset) => void;
}

export function Presets({ current, onPick }: PresetsProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Try one</h2>
      <div className="preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.expression}
            type="button"
            className={`preset${preset.expression === current ? ' is-active' : ''}`}
            onClick={() => onPick(preset)}
            title={
              preset.label ? `${preset.expression}\n\n${preset.sounds}` : preset.sounds
            }
          >
            {preset.label ?? preset.expression}
          </button>
        ))}
      </div>
    </section>
  );
}
