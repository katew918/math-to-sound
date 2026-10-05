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

// Longest operators first, so `**` is preferred over `*`.
const OPERATORS = ['**', '+', '-', '*', '/', '^', '(', ')', ','];

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

  /** True when the next token could begin a new atom, implying multiplication. */
  const startsAtom = (): boolean => {
    const token = tokens[pos];
    return (
      token.kind === 'num' ||
      token.kind === 'name' ||
      (token.kind === 'op' && token.text === '(')
    );
  };

  function parseExpr(): CompiledFunction {
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

  function parseAtom(): CompiledFunction {
    const token = tokens[pos];
    pos += 1;

    if (token.kind === 'num') {
      const value = token.value;
      return () => value;
    }

    if (token.kind === 'op' && token.text === '(') {
      const inner = parseExpr();
      if (!eatOp(')')) {
        throw new ParseError('Missing closing ")"', peek().pos);
      }
      return inner;
    }

    if (token.kind === 'name') {
      const key = token.text.toLowerCase();

      if (atOp('(')) {
        pos += 1; // consume '('
        const args: CompiledFunction[] = [];
        if (!atOp(')')) {
          args.push(parseExpr());
          while (eatOp(',')) args.push(parseExpr());
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

  const fn = parseExpr();

  const trailing = peek();
  if (trailing.kind !== 'end') {
    throw new ParseError(`Unexpected "${trailing.text}"`, trailing.pos);
  }

  return fn;
}
