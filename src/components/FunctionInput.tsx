import { Fragment } from 'react';
import { CONSTANT_NAMES, FUNCTION_NAMES, type ParseError } from '../lib/parser';

export interface FunctionInputProps {
  value: string;
  onChange: (value: string) => void;
  error: ParseError | null;
}

export function FunctionInput({ value, onChange, error }: FunctionInputProps) {
  return (
    <section className="panel">
      <label className="field">
        <span className="field-label">f(x) =</span>
        <input
          className={`function-input${error ? ' is-invalid' : ''}`}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="sin(x)"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-invalid={error !== null}
          aria-describedby="function-input-message"
        />
      </label>

      <div id="function-input-message" role="status" className="message-area">
        {error ? (
          <>
            {/* A caret under the offending character. The row mirrors the input
                row exactly — same label, same gap — so the caret lines up
                without guessing at the label's width. */}
            <div className="caret-row" aria-hidden="true">
              <span className="field-label caret-spacer">f(x) =</span>
              <pre className="error-caret">
                {`${' '.repeat(Math.max(0, Math.min(error.position, value.length)))}^`}
              </pre>
            </div>
            <p className="error-text">{error.message}</p>
            <p className="hint">Still showing and playing the last valid function.</p>
          </>
        ) : (
          <p className="hint">
            Operators <code>+ - * / ^</code>, implicit multiplication like{' '}
            <code>2x</code> or <code>3sin(x)</code>.
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
