import { describe, expect, it } from 'vitest';
import { ParseError, compile } from './parser';
import { buildWavetable } from './audio';
import { robustPeak, sampleFunction } from './sampling';

/** Evaluate an expression at a single x. */
const at = (source: string, x: number): number => compile(source)(x);

const mean = (values: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
};

const peak = (values: Float32Array): number => {
  let max = 0;
  for (let i = 0; i < values.length; i += 1) {
    const magnitude = Math.abs(values[i]);
    if (magnitude > max) max = magnitude;
  }
  return max;
};

describe('compile — arithmetic and precedence', () => {
  it('multiplies before adding', () => {
    expect(at('1 + 2 * 3', 0)).toBe(7);
    expect(at('(1 + 2) * 3', 0)).toBe(9);
  });

  it('treats ^ as right-associative', () => {
    expect(at('2^3^2', 0)).toBe(512); // 2^(3^2), not (2^3)^2 === 64
  });

  it('binds ^ more tightly than unary minus', () => {
    expect(at('-x^2', 3)).toBe(-9); // -(3^2), not (-3)^2
  });

  it('allows a signed exponent', () => {
    expect(at('2^-1', 0)).toBe(0.5);
  });

  it('accepts ** as an alias for ^', () => {
    expect(at('x**3', 2)).toBe(8);
  });

  it('subtracts left-to-right', () => {
    expect(at('10 - 3 - 2', 0)).toBe(5);
  });

  it('handles a unary minus after an operator', () => {
    expect(at('2 - -3', 0)).toBe(5);
  });
});

describe('compile — implicit multiplication', () => {
  it('multiplies a number by a following variable or call', () => {
    expect(at('2x', 3)).toBe(6);
    expect(at('3sin(x)', 0)).toBe(0);
    expect(at('2(x + 1)', 2)).toBe(6);
  });

  it('multiplies adjacent parenthesised groups', () => {
    expect(at('(x + 1)(x - 1)', 3)).toBe(8);
  });

  it('applies ^ to the right operand only', () => {
    expect(at('2x^2', 3)).toBe(18); // 2*(3^2), not (2*3)^2
  });

  it('does not swallow a following minus as multiplication', () => {
    expect(at('2 - 3', 0)).toBe(-1);
    expect(at('2x - 1', 3)).toBe(5);
  });
});

describe('compile — names', () => {
  it('knows the constants', () => {
    expect(at('pi', 0)).toBeCloseTo(Math.PI, 12);
    expect(at('e', 0)).toBeCloseTo(Math.E, 12);
    expect(at('tau', 0)).toBeCloseTo(Math.PI * 2, 12);
  });

  it('is case-insensitive', () => {
    expect(at('SIN(X)', Math.PI / 2)).toBeCloseTo(1, 12);
    expect(at('PI', 0)).toBeCloseTo(Math.PI, 12);
  });

  it('supports two-argument functions', () => {
    expect(at('max(x, 4)', 7)).toBe(7);
    expect(at('min(x, 4)', 7)).toBe(4);
  });

  it('uses a true modulo, not the remainder operator', () => {
    expect(at('mod(-1, 3)', 0)).toBe(2);
  });

  it('reads scientific notation', () => {
    expect(at('1.5e2', 0)).toBe(150);
  });
});

describe('compile — errors', () => {
  const errorFor = (source: string): ParseError => {
    try {
      compile(source);
    } catch (caught) {
      if (caught instanceof ParseError) return caught;
      throw caught;
    }
    throw new Error(`expected "${source}" to fail`);
  };

  it('rejects an empty expression', () => {
    expect(() => compile('   ')).toThrow(ParseError);
  });

  it('rejects an unknown variable, naming the position', () => {
    const error = errorFor('x + y');
    expect(error.message).toContain('y');
    expect(error.position).toBe(4);
  });

  it('rejects an unknown function', () => {
    expect(errorFor('wobble(x)').message).toContain('Unknown function');
  });

  it('suggests parentheses for a bare function name', () => {
    expect(errorFor('sin').message).toContain('sin(x)');
  });

  it('rejects the wrong number of arguments', () => {
    expect(errorFor('sin(x, 2)').message).toContain('1 argument');
    expect(errorFor('max(x)').message).toContain('2 arguments');
  });

  it('rejects an unclosed bracket', () => {
    expect(errorFor('sin(x').message).toContain('Missing closing');
  });

  it('rejects trailing junk', () => {
    const error = errorFor('x +');
    expect(error.message).toContain('end of expression');
  });

  it('rejects an unexpected character', () => {
    const error = errorFor('x & 1');
    expect(error.position).toBe(2);
  });
});

describe('sampleFunction', () => {
  it('covers the half-open interval, so a cycle loops seamlessly', () => {
    const ys = sampleFunction((x) => x, 0, 1, 4);
    expect(Array.from(ys)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('records non-finite results as NaN', () => {
    const ys = sampleFunction((x) => 1 / x, 0, 1, 4);
    expect(Number.isNaN(ys[0])).toBe(true); // 1/0
    expect(ys[1]).toBe(4); // 1/0.25
  });
});

describe('robustPeak', () => {
  it('ignores a lone outlier', () => {
    const values = new Float64Array(1000);
    values.fill(1);
    values[0] = 1e9;
    expect(robustPeak(values)).toBe(1);
  });

  it('returns 0 when there is nothing finite', () => {
    expect(robustPeak(new Float64Array([NaN, NaN]))).toBe(0);
  });
});

describe('buildWavetable', () => {
  it('normalises sin(x) to a centred, full-scale cycle', () => {
    const table = buildWavetable(sampleFunction(compile('sin(x)'), 0, Math.PI * 2));
    expect(table.silent).toBe(false);
    expect(table.clipped).toBe(false);
    expect(peak(table.samples)).toBeCloseTo(1, 5);
    expect(mean(table.samples)).toBeCloseTo(0, 6);
    expect(table.samples.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('removes a DC offset', () => {
    const table = buildWavetable(sampleFunction(compile('x^2 + 5'), -1, 1));
    expect(mean(table.samples)).toBeCloseTo(0, 6);
    expect(peak(table.samples)).toBeCloseTo(1, 5);
  });

  it('leaves a sawtooth unclipped', () => {
    const table = buildWavetable(sampleFunction(compile('x'), -1, 1));
    expect(table.clipped).toBe(false);
    expect(peak(table.samples)).toBeCloseTo(1, 5);
  });

  it('reports a constant function as silent', () => {
    const table = buildWavetable(sampleFunction(compile('7'), -1, 1));
    expect(table.silent).toBe(true);
    expect(peak(table.samples)).toBe(0);
  });

  it('tames an asymptote instead of going near-silent', () => {
    const table = buildWavetable(sampleFunction(compile('1/x'), -1, 1));
    expect(table.clipped).toBe(true);
    expect(table.samples.every((v) => Number.isFinite(v))).toBe(true);
    expect(peak(table.samples)).toBeCloseTo(1, 5);
  });
});
