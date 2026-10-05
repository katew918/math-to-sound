import { Fragment } from 'react';
import { CONSTANT_NAMES, FUNCTION_NAMES, type ParseError } from '../lib/parser';
import { MathField } from './MathField';

export interface FunctionInputProps {
  value: string;
  onChange: (value: string) => void;
  error: ParseError | null;
}

export function FunctionInput({ value, onChange, error }: FunctionInputProps) {
  return (
    <section className="panel">
      <div className="field">
        <span className="field-label">f(x) =</span>
        <MathField
          value={value}
          onChange={onChange}
          errorPosition={error ? error.position : null}
          label="Function of x"
        />
      </div>

      <div id="function-input-message" role="status" className="message-area">
        {error ? (
          <>
            {/* The offending character is highlighted in the field itself; a
                caret underneath can't line up with raised exponents. */}
            <p className="error-text">{error.message}</p>
            <p className="hint">Still showing and playing the last valid function.</p>
          </>
        ) : (
          <p className="hint">
            Press <kbd>^</kbd> for an exponent and <kbd>space</kbd> to drop back
            down. Implicit multiplication like <code>2x</code> works too.
          </p>
        )}
      </div>

      <details className="reference">
        <summary>What can I type?</summary>
        <p>
          <strong>Variable:</strong> <code>x</code> only.
        </p>
        <p>
          <strong>Constants:</strong>{' '}
          {/* The trailing space is load-bearing: without it the chips form one
              unbreakable run and the list cannot wrap on a narrow screen. */}
          {CONSTANT_NAMES.map((name) => (
            <Fragment key={name}>
              <code>{name}</code>{' '}
            </Fragment>
          ))}
        </p>
        <p>
          <strong>Functions:</strong>{' '}
          {FUNCTION_NAMES.map((name) => (
            <Fragment key={name}>
              <code>{name}</code>{' '}
            </Fragment>
          ))}
        </p>
        <p className="hint">
          <code>log</code> is the natural logarithm (same as <code>ln</code>); use{' '}
          <code>log10</code> for base ten.
        </p>
        <p>
          <strong>Remainder:</strong> <code>x mod 2</code>, which can also be written{' '}
          <code>mod(x, 2)</code>.
        </p>
        <p>
          <strong>Comparisons:</strong> <code>&lt;</code> <code>&gt;</code>{' '}
          <code>&lt;=</code> <code>&gt;=</code> <code>=</code>, and they chain, so{' '}
          <code>0 &lt; x &lt; 1</code> means both halves hold.
        </p>
        <p>
          <strong>Piecewise:</strong> <code>{'{x < 0: -1, x < 1: x, 2}'}</code> — pairs of{' '}
          <code>condition: value</code>, with an optional plain value at the end as the
          fallback. The first condition that holds wins, and with nothing matching the
          function is simply undefined there.
        </p>
        <p className="hint">
          Typeset symbols pasted from elsewhere work too: <code>⌊x⌋</code>{' '}
          <code>⌈x⌉</code> <code>≤</code> <code>≥</code> <code>·</code> <code>×</code>.
        </p>
      </details>
    </section>
  );
}
