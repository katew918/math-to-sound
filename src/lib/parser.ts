/**
 * A tiny, dependency-free parser for single-variable mathematical expressions.
 *
 * `compile("sin(x) + x^2")` returns a plain function `(x) => number`.
 *
 * It is a hand-written tokenizer plus a recursive-descent parser that compiles
 * straight to nested closures, so there is no `eval`, no `new Function`, and no
 * runtime dependency. Precedence and associativity follow ordinary maths:
 *
 *   expr   -> term (('+' | '-') term)*
 *   term   -> unary (('*' | '/') unary | <implicit multiply> power)*
 *   unary  -> ('-' | '+') unary | power
 *   power  -> atom ('^' unary)?          right-associative: 2^3^2 === 2^(3^2)
 *   atom   -> number | '(' expr ')' | name | name '(' args ')'
 *
 * Because `power` recurses into `unary` on its right-hand side, both `-x^2`
 * (which is `-(x^2)`) and `2^-1` parse the way a mathematician expects.
 */

/** Thrown for any malformed expression. `position` is a 0-based character index. */
export class ParseError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

/** A compiled expression: maps a single number to a single number. */
export type CompiledFunction = (x: number) => number;

/** Single-argument functions available in expressions. */
const FN1: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log, // natural log, as in most programming languages; use log10 for base 10
  log10: Math.log10,
  log2: Math.log2,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

/** Two-argument functions available in expressions. */
const FN2: Record<string, (a: number, b: number) => number> = {
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  atan2: Math.atan2,
  mod: (a, b) => a - b * Math.floor(a / b),
};

/** Named constants available in expressions. */
const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

/** Every function name, for display in the UI's help text. */
export const FUNCTION_NAMES: readonly string[] = [
  ...Object.keys(FN1),
  ...Object.keys(FN2),
];

/** Every constant name, for display in the UI's help text. */
export const CONSTANT_NAMES: readonly string[] = Object.keys(CONSTANTS);

interface Token {
  kind: 'num' | 'name' | 'op' | 'end';
  text: string;
  value: number;
  pos: number;
}

// Sticky (`y`) regexes so they only ever match at the current scan position.
const NUMBER_RE = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const NAME_RE = /[A-Za-z_][A-Za-z0-9_]*/y;

// Longest operators first, so `**` beats `*` and `<=` beats `<`.
const OPERATORS = [
  '**', '<=', '>=',
  '+', '-', '*', '/', '^', '(', ')', ',',
  '{', '}', ':', '<', '>', '=',
];

/**
 * Symbols that get pasted in from typeset maths, each mapped to what we parse.
 * Means an expression copied out of a textbook or a LaTeX render mostly works.
 */
const ALIASES: Record<string, string> = {
  '\u00b7': '*',   // middle dot
  '\u00d7': '*',   // multiplication sign
  '\u2212': '-',   // minus sign (not a hyphen)
  '\u2264': '<=',  // less than or equal
  '\u2265': '>=',  // greater than or equal
  '\u230a': '|_',  // left floor
  '\u230b': '_|',  // right floor
  '\u2308': '|^',  // left ceiling
  '\u2309': '^|',  // right ceiling
};

/** Comparisons, lowest-binding of the operators. */
const COMPARISONS: Record<string, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
  '=': (a, b) => a === b,
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    NUMBER_RE.lastIndex = i;
    const num = NUMBER_RE.exec(source);
    if (num) {
      tokens.push({ kind: 'num', text: num[0], value: Number(num[0]), pos: i });
      i += num[0].length;
      continue;
    }

    NAME_RE.lastIndex = i;
    const name = NAME_RE.exec(source);
    if (name) {
      tokens.push({ kind: 'name', text: name[0], value: 0, pos: i });
      i += name[0].length;
      continue;
    }

    const alias = ALIASES[ch];
    if (alias) {
      tokens.push({ kind: 'op', text: alias, value: 0, pos: i });
      i += 1;
      continue;
    }

    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (op) {
      // `**` is accepted as a friendly alias for `^`.
      tokens.push({ kind: 'op', text: op === '**' ? '^' : op, value: 0, pos: i });
      i += op.length;
      continue;
    }

    throw new ParseError(`Unexpected character "${ch}"`, i);
  }

  tokens.push({ kind: 'end', text: '', value: 0, pos: source.length });
  return tokens;
}

/**
 * Parse `source` into a callable function of `x`.
 *
 * @throws {ParseError} if the expression is malformed.
 */
export function compile(source: string): CompiledFunction {
  if (source.trim() === '') {
    throw new ParseError('Enter a function of x', 0);
  }

  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token => tokens[pos];

  const atOp = (text: string): boolean => {
    const token = tokens[pos];
    return token.kind === 'op' && token.text === text;
  };

  const eatOp = (text: string): boolean => {
    if (!atOp(text)) return false;
    pos += 1;
    return true;
  };

  const atName = (text: string): boolean => {
    const token = tokens[pos];
    return token.kind === 'name' && token.text.toLowerCase() === text;
  };

  /**
   * True when the next token could begin a new atom, implying multiplication.
   *
   * `mod` is deliberately excluded. It reads as an infix operator here, so
   * `x mod 2` must not be mistaken for `x` times something called `mod`.
   * Written as a call, `mod(a, b)`, it is reached through parseAtom instead.
   */
  const startsAtom = (): boolean => {
    const token = tokens[pos];
    if (atName('mod')) return false;
    return (
      token.kind === 'num' ||
      token.kind === 'name' ||
      (token.kind === 'op' &&
        (token.text === '(' || token.text === '{' ||
         token.text === '|_' || token.text === '|^'))
    );
  };

  /**
   * The top of the grammar: comparisons, which bind loosest of all.
   *
   * Chains the way maths does, so `0 < x < 1` means both halves hold rather
   * than comparing a boolean against 1. The result is 1 or 0, which is what
   * makes a comparison usable as a piecewise condition.
   */
  function parseExpression(): CompiledFunction {
    let left = parseMod();
    const parts: { op: (a: number, b: number) => boolean; right: CompiledFunction }[] = [];

    for (;;) {
      const token = tokens[pos];
      if (token.kind !== 'op') break;
      const compare = COMPARISONS[token.text];
      if (!compare) break;
      pos += 1;
      parts.push({ op: compare, right: parseMod() });
    }

    if (parts.length === 0) return left;

    const first = left;
    return (x) => {
      let previous = first(x);
      for (const part of parts) {
        const next = part.right(x);
        if (!part.op(previous, next)) return 0;
        previous = next;
      }
      return 1;
    };
  }

  /**
   * `a mod b`, binding tighter than a comparison and looser than `+`, so
   * `x mod 2 < 0.5` and `6x mod 1` both read the way they look.
   */
  function parseMod(): CompiledFunction {
    let left = parseAdditive();
    while (atName('mod')) {
      pos += 1;
      const l = left;
      const r = parseAdditive();
      // True modulo, so the result follows the sign of the divisor.
      left = (x) => {
        const a = l(x);
        const b = r(x);
        return a - b * Math.floor(a / b);
      };
    }
    return left;
  }

  function parseAdditive(): CompiledFunction {
    let left = parseTerm();
    for (;;) {
      if (eatOp('+')) {
        const l = left;
        const r = parseTerm();
        left = (x) => l(x) + r(x);
      } else if (eatOp('-')) {
        const l = left;
        const r = parseTerm();
        left = (x) => l(x) - r(x);
      } else {
        return left;
      }
    }
  }

  function parseTerm(): CompiledFunction {
    let left = parseUnary();
    for (;;) {
      if (eatOp('*')) {
        const l = left;
        const r = parseUnary();
        left = (x) => l(x) * r(x);
      } else if (eatOp('/')) {
        const l = left;
        const r = parseUnary();
        left = (x) => l(x) / r(x);
      } else if (startsAtom()) {
        // Implicit multiplication: `2x`, `3sin(x)`, `2(x+1)`, `(x+1)(x-1)`.
        // Recurse into `power`, not `unary`, so `2x^2` is `2*(x^2)` and a
        // following `-` is still read as subtraction by parseExpr.
        const l = left;
        const r = parsePower();
        left = (x) => l(x) * r(x);
      } else {
        return left;
      }
    }
  }

  function parseUnary(): CompiledFunction {
    if (eatOp('-')) {
      const r = parseUnary();
      return (x) => -r(x);
    }
    if (eatOp('+')) {
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower(): CompiledFunction {
    const base = parseAtom();
    if (eatOp('^')) {
      const exponent = parseUnary();
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }

  /**
   * A piecewise definition, written the way Desmos writes it:
   *
   *     {x < 0: -1, x < 1: x, 2}
   *
   * Comma-separated `condition: value` branches, with an optional bare value
   * at the end as the fallback. Branches are tried in order and the first
   * whose condition holds wins, so later conditions only need to say what the
   * earlier ones didn't already cover.
   *
   * With no branch matching and no fallback the result is undefined rather
   * than zero — the graph breaks and the audio falls silent there, which is
   * honest about the function simply not being defined.
   */
  function parsePiecewise(openPos: number): CompiledFunction {
    const branches: { when: CompiledFunction; then: CompiledFunction }[] = [];
    let fallback: CompiledFunction | null = null;

    if (atOp('}')) {
      throw new ParseError('Empty {} — add at least one condition', openPos);
    }

    for (;;) {
      const first = parseExpression();

      if (eatOp(':')) {
        branches.push({ when: first, then: parseExpression() });
      } else {
        // A bare value is the fallback, and nothing may follow it.
        fallback = first;
        if (atOp(',')) {
          throw new ParseError(
            'The fallback must be the last thing in {}',
            peek().pos,
          );
        }
      }

      if (eatOp(',')) continue;
      break;
    }

    if (!eatOp('}')) {
      throw new ParseError('Missing closing "}"', peek().pos);
    }

    const otherwise = fallback;
    return (x) => {
      for (const branch of branches) {
        if (branch.when(x) !== 0) return branch.then(x);
      }
      return otherwise ? otherwise(x) : NaN;
    };
  }

  function parseAtom(): CompiledFunction {
    const token = tokens[pos];
    pos += 1;

    if (token.kind === 'num') {
      const value = token.value;
      return () => value;
    }

    if (token.kind === 'op' && token.text === '(') {
      // The math field writes an exponent as `^()`, so an empty pair of
      // brackets usually means an exponent was opened but never filled in.
      if (atOp(')')) {
        throw new ParseError('Empty brackets — type something inside', token.pos);
      }
      const inner = parseExpression();
      if (!eatOp(')')) {
        throw new ParseError('Missing closing ")"', peek().pos);
      }
      return inner;
    }

    // ⌊x⌋ and ⌈x⌉, so an expression pasted from typeset maths works as written.
    if (token.kind === 'op' && (token.text === '|_' || token.text === '|^')) {
      const closing = token.text === '|_' ? '_|' : '^|';
      const round = token.text === '|_' ? Math.floor : Math.ceil;
      const inner = parseExpression();
      if (!eatOp(closing)) {
        throw new ParseError(
          `Missing closing "${token.text === '|_' ? '⌋' : '⌉'}"`,
          peek().pos,
        );
      }
      return (x) => round(inner(x));
    }

    if (token.kind === 'op' && token.text === '{') {
      return parsePiecewise(token.pos);
    }

    if (token.kind === 'name') {
      const key = token.text.toLowerCase();

      if (atOp('(')) {
        pos += 1; // consume '('
        const args: CompiledFunction[] = [];
        if (!atOp(')')) {
          args.push(parseExpression());
          while (eatOp(',')) args.push(parseExpression());
        }
        if (!eatOp(')')) {
          throw new ParseError(`Missing closing ")" for ${token.text}(`, peek().pos);
        }

        const fn1 = FN1[key];
        if (fn1) {
          if (args.length !== 1) {
            throw new ParseError(
              `${token.text}() takes 1 argument, got ${args.length}`,
              token.pos,
            );
          }
          const a = args[0];
          return (x) => fn1(a(x));
        }

        const fn2 = FN2[key];
        if (fn2) {
          if (args.length !== 2) {
            throw new ParseError(
              `${token.text}() takes 2 arguments, got ${args.length}`,
              token.pos,
            );
          }
          const a = args[0];
          const b = args[1];
          return (x) => fn2(a(x), b(x));
        }

        throw new ParseError(`Unknown function "${token.text}"`, token.pos);
      }

      if (key === 'x') {
        return (x) => x;
      }

      if (key in CONSTANTS) {
        const value = CONSTANTS[key];
        return () => value;
      }

      if (key in FN1 || key in FN2) {
        throw new ParseError(
          `"${token.text}" is a function — did you mean ${token.text}(x)?`,
          token.pos,
        );
      }

      throw new ParseError(
        `Unknown name "${token.text}" — the only variable is x`,
        token.pos,
      );
    }

    if (token.kind === 'end') {
      throw new ParseError('Unexpected end of expression', token.pos);
    }

    throw new ParseError(`Unexpected "${token.text}"`, token.pos);
  }

  const fn = parseExpression();

  const trailing = peek();
  if (trailing.kind !== 'end') {
    throw new ParseError(`Unexpected "${trailing.text}"`, trailing.pos);
  }

  return fn;
}
