import { describe, expect, it } from 'vitest';
import { ParseError, compile } from './parser';

const at = (source: string, x: number): number => compile(source)(x);

const errorFor = (source: string): ParseError => {
  try {
    compile(source);
  } catch (caught) {
    if (caught instanceof ParseError) return caught;
    throw caught;
  }
  throw new Error(`expected "${source}" to fail`);
};

describe('comparisons', () => {
  it('give 1 or 0', () => {
    expect(at('x < 1', 0)).toBe(1);
    expect(at('x < 1', 2)).toBe(0);
    expect(at('x >= 2', 2)).toBe(1);
    expect(at('x = 3', 3)).toBe(1);
    expect(at('x > 0', -1)).toBe(0);
  });

  it('bind looser than arithmetic', () => {
    // Reads as (x + 1) < 4, not x + (1 < 4).
    expect(at('x + 1 < 4', 2)).toBe(1);
    expect(at('x + 1 < 4', 5)).toBe(0);
  });

  it('chain the way maths does', () => {
    // Not (0 < x) < 1, which would compare a 0/1 flag against 1.
    expect(at('0 < x < 1', 0.5)).toBe(1);
    expect(at('0 < x < 1', -0.5)).toBe(0);
    expect(at('0 < x < 1', 1.5)).toBe(0);
    expect(at('0 <= x <= 1', 0)).toBe(1);
  });

  it('accept the typeset ≤ and ≥', () => {
    expect(at('x ≤ 1', 1)).toBe(1);
    expect(at('x ≥ 1', 0)).toBe(0);
  });
});

describe('mod as an infix operator', () => {
  it('works on its own', () => {
    expect(at('x mod 2', 5)).toBe(1);
    expect(at('x mod 2', 4)).toBe(0);
  });

  it('follows the sign of the divisor, like a true modulo', () => {
    expect(at('x mod 3', -1)).toBe(2);
    expect(at('x mod 2', -0.5)).toBeCloseTo(1.5, 12);
  });

  it('binds tighter than a comparison', () => {
    // (x mod 2) < 0.5, which is what the piecewise conditions rely on.
    expect(at('x mod 2 < 0.5', 2.25)).toBe(1);
    expect(at('x mod 2 < 0.5', 2.75)).toBe(0);
  });

  it('binds looser than + and implicit multiplication', () => {
    expect(at('6x mod 1', 0.25)).toBeCloseTo(0.5, 12); // (6*0.25) mod 1
    expect(at('x + 3 mod 2', 0)).toBe(1); // (0 + 3) mod 2
  });

  it('still works as a two-argument call', () => {
    expect(at('mod(x, 3)', -1)).toBe(2);
  });

  it('is not mistaken for implicit multiplication', () => {
    // `mod` must never be read as a variable being multiplied in.
    expect(() => compile('x mod 2')).not.toThrow();
    expect(at('2 x mod 2', 1.5)).toBe(1); // (2*1.5) mod 2
  });
});

describe('floor and ceiling brackets', () => {
  it('round the way the symbols say', () => {
    expect(at('⌊x⌋', 2.7)).toBe(2);
    expect(at('⌈x⌉', 2.1)).toBe(3);
    expect(at('⌊x⌋', -2.1)).toBe(-3);
  });

  it('nest and take whole expressions', () => {
    expect(at('⌊2x + 1/2⌋', 1.3)).toBe(3);
    expect(at('⌊⌈x⌉⌋', 1.2)).toBe(2);
  });

  it('complain when left open', () => {
    expect(errorFor('⌊x').message).toContain('Missing closing');
  });
});

describe('piecewise', () => {
  it('takes the first branch whose condition holds', () => {
    const f = compile('{x < 0: -1, x < 1: 0, 1}');
    expect(f(-5)).toBe(-1);
    expect(f(0.5)).toBe(0);
    expect(f(7)).toBe(1);
  });

  it('is undefined where nothing matches and there is no fallback', () => {
    const f = compile('{x < 0: 1}');
    expect(f(-1)).toBe(1);
    expect(Number.isNaN(f(1))).toBe(true);
  });

  it('allows a single condition with a fallback', () => {
    const f = compile('{x < 0: -1, 1}');
    expect(f(-1)).toBe(-1);
    expect(f(1)).toBe(1);
  });

  it('evaluates full expressions in both halves', () => {
    const f = compile('{x mod 2 < 1: sin(x), x^2}');
    expect(f(0.5)).toBeCloseTo(Math.sin(0.5), 12);
    expect(f(1.5)).toBeCloseTo(1.5 ** 2, 12);
  });

  it('nests', () => {
    const f = compile('{x < 0: {x < -1: -2, -1}, 1}');
    expect(f(-5)).toBe(-2);
    expect(f(-0.5)).toBe(-1);
    expect(f(3)).toBe(1);
  });

  it('rejects an empty definition', () => {
    expect(errorFor('{}').message).toContain('Empty {}');
  });

  it('rejects a fallback that is not last', () => {
    expect(errorFor('{1, x < 2: 3}').message).toContain('last');
  });

  it('rejects an unclosed brace', () => {
    expect(errorFor('{x < 1: 2').message).toContain('Missing closing "}"');
  });
});

describe('the function from the image', () => {
  const IMAGE =
    '{x mod 2 < 0.5: 3(1 - 2floor(2(6x mod 1))), ' +
    'x mod 2 < 1.2: -1.2, ' +
    '2.2*2(2x - floor(2x + 1/2))}';

  /** The same thing written out directly, as an independent reference. */
  function reference(x: number): number {
    const m = x - 2 * Math.floor(x / 2);
    if (m < 0.5) {
      const inner = 6 * x - Math.floor(6 * x);
      return 3 * (1 - 2 * Math.floor(2 * inner));
    }
    if (m < 1.2) return -1.2;
    return 2.2 * 2 * (2 * x - Math.floor(2 * x + 0.5));
  }

  it('matches a direct evaluation right across the domain', () => {
    const fn = compile(IMAGE);
    let checked = 0;
    for (let x = -10; x <= 10; x += 0.00137) {
      expect(fn(x)).toBeCloseTo(reference(x), 9);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(14_000);
  });

  it('reads the same written in typeset symbols', () => {
    const typeset =
      '{x mod 2 < 0.5: 3(1 − 2⌊2(6x mod 1)⌋), ' +
      'x mod 2 < 1.2: −1.2, ' +
      '2.2 · 2(2x − ⌊2x + 1/2⌋)}';
    const a = compile(typeset);
    const b = compile(IMAGE);
    for (let x = -5; x <= 5; x += 0.011) {
      expect(a(x)).toBeCloseTo(b(x), 9);
    }
  });

  it('stays finite everywhere, so it can be graphed and played', () => {
    const fn = compile(IMAGE);
    for (let x = -10; x <= 10; x += 0.01) {
      expect(Number.isFinite(fn(x))).toBe(true);
    }
  });
});
