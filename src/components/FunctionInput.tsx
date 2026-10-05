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
      </details>
    </section>
  );
}
