import { describe, expect, it } from 'vitest';
import { compile } from './parser';
import {
  backspace,
  cursorAtEnd,
  insertChar,
  insertText,
  moveLeft,
  moveRight,
  parseToNodes,
  serialize,
  serializeWithOwners,
  type Cursor,
  type EditorState,
} from './mathNodes';

/** Type a string into an empty field, one character at a time. */
const type = (text: string): EditorState =>
  insertText([], { path: [], index: 0 }, text);

const press = (
  state: EditorState,
  key: 'backspace' | 'left' | 'right',
): EditorState => {
  if (key === 'backspace') return backspace(state.nodes, state.cursor);
  const cursor =
    key === 'left'
      ? moveLeft(state.nodes, state.cursor)
      : moveRight(state.nodes, state.cursor);
  return { nodes: state.nodes, cursor };
};

const at = (c: Cursor) => `${c.path.join('.')}|${c.index}`;

describe('typing', () => {
  it('writes plain characters straight through', () => {
    expect(serialize(type('sin(x)').nodes)).toBe('sin(x)');
  });

  it('raises into an exponent on ^ and drops back out on space', () => {
    // The space is the whole point: it ends the exponent without an arrow key.
    const state = type('e^-3x +1');
    expect(serialize(state.nodes)).toBe('e^(-3x)+1');
  });

  it('keeps everything after ^ in the exponent until a space', () => {
    expect(serialize(type('2^10').nodes)).toBe('2^(10)');
  });

  it('never leaves a literal ^ in the text', () => {
    const text = serialize(type('e^-3x 1').nodes);
    expect(text).not.toContain('^-');
    // The space was spent leaving the exponent, so none survives here.
    expect(text).not.toContain(' ');
  });

  it('nests exponents', () => {
    expect(serialize(type('2^2^2').nodes)).toBe('2^(2^(2))');
  });

  it('drops out one level per space', () => {
    const state = type('2^2^2 9 7');
    expect(serialize(state.nodes)).toBe('2^(2^(2)9)7');
  });

  it('keeps a space typed at the baseline', () => {
    // Needed for `x mod 2`: swallowing these would leave the single name
    // `xmod2`, which is not a thing.
    expect(serialize(type('x + 1').nodes)).toBe('x + 1');
    expect(serialize(type('x mod 2').nodes)).toBe('x mod 2');
  });

  it('still uses a space to leave an exponent', () => {
    expect(serialize(type('2^8 +1').nodes)).toBe('2^(8)+1');
  });

  it('puts the cursor inside the new exponent', () => {
    const state = type('x^');
    expect(at(state.cursor)).toBe('1|0');
  });

  it('produces something the parser accepts', () => {
    const fn = compile(serialize(type('e^-3x +1').nodes));
    expect(fn(0)).toBeCloseTo(2, 10); // e^0 + 1
    expect(fn(1)).toBeCloseTo(Math.exp(-3) + 1, 10);
  });

  it('agrees with ordinary typed syntax', () => {
    const viaField = compile(serialize(type('e^-3x').nodes));
    const viaText = compile('e^(-3x)');
    for (const x of [-2, -0.5, 0, 0.5, 2]) {
      expect(viaField(x)).toBeCloseTo(viaText(x), 10);
    }
  });
});

describe('backspace', () => {
  it('removes the character before the cursor', () => {
    expect(serialize(press(type('sin'), 'backspace').nodes)).toBe('si');
  });

  it('steps into an exponent rather than deleting it whole', () => {
    const state = press(type('x^23 '), 'backspace');
    expect(serialize(state.nodes)).toBe('x^(23)');
    expect(at(state.cursor)).toBe('1|2'); // inside the exponent, at its end
  });

  it('then deletes inside the exponent', () => {
    let state = press(type('x^23 '), 'backspace');
    state = press(state, 'backspace');
    expect(serialize(state.nodes)).toBe('x^(2)');
  });

  it('removes an exponent that has been emptied', () => {
    let state = type('x^2');
    state = press(state, 'backspace'); // delete the 2, leaving an empty exponent
    expect(serialize(state.nodes)).toBe('x^()');
    state = press(state, 'backspace'); // and now the exponent itself
    expect(serialize(state.nodes)).toBe('x');
    expect(at(state.cursor)).toBe('|1');
  });

  it('does nothing at the very start', () => {
    const state = press({ nodes: [], cursor: { path: [], index: 0 } }, 'backspace');
    expect(serialize(state.nodes)).toBe('');
  });
});

describe('arrow keys', () => {
  it('walks into an exponent and back out', () => {
    const state = type('x^2 ');
    expect(at(state.cursor)).toBe('|2'); // after the exponent

    const intoEnd = press(state, 'left');
    expect(at(intoEnd.cursor)).toBe('1|1');

    const beforeTwo = press(intoEnd, 'left');
    expect(at(beforeTwo.cursor)).toBe('1|0');

    const outLeft = press(beforeTwo, 'left');
    expect(at(outLeft.cursor)).toBe('|1');
  });

  it('round-trips left then right', () => {
    const start = type('x^2 ');
    let state = start;
    for (let i = 0; i < 6; i += 1) state = press(state, 'left');
    for (let i = 0; i < 6; i += 1) state = press(state, 'right');
    expect(at(state.cursor)).toBe(at(start.cursor));
  });

  it('stops at both ends instead of running off', () => {
    let state = type('ab');
    for (let i = 0; i < 5; i += 1) state = press(state, 'left');
    expect(at(state.cursor)).toBe('|0');
    for (let i = 0; i < 9; i += 1) state = press(state, 'right');
    expect(at(state.cursor)).toBe('|2');
  });
});

describe('parseToNodes', () => {
  it('reads a bracketed exponent', () => {
    expect(serialize(parseToNodes('e^(-3x)'))).toBe('e^(-3x)');
  });

  it('reads a bare exponent', () => {
    expect(serialize(parseToNodes('x^2'))).toBe('x^(2)');
  });

  it('keeps a bare exponent to one term', () => {
    expect(serialize(parseToNodes('x^2+1'))).toBe('x^(2)+1');
  });

  it('reads a signed bare exponent', () => {
    expect(serialize(parseToNodes('2^-1'))).toBe('2^(-1)');
  });

  it('survives a trailing ^ without hanging', () => {
    expect(serialize(parseToNodes('x^'))).toBe('x^()');
  });

  it('survives an unclosed bracket without hanging', () => {
    expect(serialize(parseToNodes('x^(2'))).toBe('x^(2)');
  });

  it('round-trips every preset to the same function', () => {
    const presets = [
      'sin(x)', 'x', 'abs(x)', 'sign(sin(x))', 'x^2',
      'sin(x) + cos(x)', 'sin(x) + 0.5sin(2x) + 0.25sin(3x)',
      'sin(1/x)', '1/x', 'exp(-x^2)',
    ];
    for (const source of presets) {
      const original = compile(source);
      const roundTripped = compile(serialize(parseToNodes(source)));
      for (const x of [-2.5, -0.3, 0.7, 1.5, 3]) {
        const a = original(x);
        const b = roundTripped(x);
        if (Number.isFinite(a)) expect(b).toBeCloseTo(a, 10);
      }
    }
  });
});

describe('serializeWithOwners', () => {
  it('maps each output character back to the character that made it', () => {
    const { text, owners } = serializeWithOwners(type('x^2').nodes);
    expect(text).toBe('x^(2)');
    //                 x ^ (  2  )
    expect(owners).toEqual([0, null, null, 1, null]);
  });

  it('numbers characters in the order they are rendered', () => {
    const { text, owners } = serializeWithOwners(type('ab^c d').nodes);
    expect(text).toBe('ab^(c)d');
    expect(owners).toEqual([0, 1, null, null, 2, null, 3]);
  });

  it('lines an error offset up with the right character', () => {
    // `x^()` — the empty exponent. The parser points at the '(' it cannot read.
    const { text, owners } = serializeWithOwners(type('x^').nodes);
    expect(text).toBe('x^()');
    expect(owners[2]).toBeNull(); // structural, so nothing gets highlighted
  });
});

describe('cursorAtEnd', () => {
  it('lands after the last node', () => {
    expect(at(cursorAtEnd(parseToNodes('x^2')))).toBe('|2');
  });
});

describe('insertChar', () => {
  it('inserts in the middle, not just at the end', () => {
    let state = type('ac');
    state = { nodes: state.nodes, cursor: { path: [], index: 1 } };
    state = insertChar(state.nodes, state.cursor, 'b');
    expect(serialize(state.nodes)).toBe('abc');
    expect(at(state.cursor)).toBe('|2');
  });
});
