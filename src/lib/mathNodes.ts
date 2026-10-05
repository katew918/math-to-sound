/**
 * The document model behind the Desmos-style math input.
 *
 * An expression is a flat list of nodes. A character sits on the baseline; a
 * superscript is a nested list that renders raised and smaller. Nothing here
 * touches the DOM — it is all pure functions over the tree and a cursor, which
 * makes the fiddly editing rules (what backspace does at the start of an
 * exponent, where space lands you) straightforward to test.
 *
 * The field writes out ordinary text for `compile()` in parser.ts, so the two
 * never need to know about each other: `x` then a superscript `2` serialises to
 * `x^(2)`.
 */

export type MathNode =
  | { kind: 'char'; value: string }
  | { kind: 'sup'; children: MathNode[] };

export interface Cursor {
  /** Indices of the superscript nodes to descend through to reach the group. */
  path: number[];
  /** Insertion offset within that group. */
  index: number;
}

export interface EditorState {
  nodes: MathNode[];
  cursor: Cursor;
}

/** The list of nodes that `path` points at. */
export function groupAt(nodes: MathNode[], path: number[]): MathNode[] {
  let group = nodes;
  for (const step of path) {
    const node = group[step];
    if (!node || node.kind !== 'sup') return group;
    group = node.children;
  }
  return group;
}

/** Rebuild the tree with the group at `path` replaced. */
function withGroup(
  nodes: MathNode[],
  path: number[],
  group: MathNode[],
): MathNode[] {
  if (path.length === 0) return group;
  const [head, ...rest] = path;
  const node = nodes[head];
  if (!node || node.kind !== 'sup') return nodes;
  const next = nodes.slice();
  next[head] = { kind: 'sup', children: withGroup(node.children, rest, group) };
  return next;
}

/** True when two paths point at the same group. */
export function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function cursorAtEnd(nodes: MathNode[]): Cursor {
  return { path: [], index: nodes.length };
}

/** Leave the innermost superscript, landing just after it. */
function exitGroup(cursor: Cursor): Cursor {
  if (cursor.path.length === 0) return cursor;
  const path = cursor.path.slice(0, -1);
  const supIndex = cursor.path[cursor.path.length - 1];
  return { path, index: supIndex + 1 };
}

/**
 * Type one character.
 *
 * `^` opens a superscript and puts the cursor inside it. A space closes the
 * innermost superscript and returns to the baseline — the Desmos behaviour that
 * lets you write `e^(-3x) + 1` without ever reaching for an arrow key. A space
 * at the baseline is ignored, so it never ends up inside the expression text.
 */
export function insertChar(
  nodes: MathNode[],
  cursor: Cursor,
  ch: string,
): EditorState {
  if (ch === '^') {
    const group = groupAt(nodes, cursor.path);
    const next = group.slice();
    next.splice(cursor.index, 0, { kind: 'sup', children: [] });
    return {
      nodes: withGroup(nodes, cursor.path, next),
      cursor: { path: [...cursor.path, cursor.index], index: 0 },
    };
  }

  if (ch === ' ') {
    return { nodes, cursor: exitGroup(cursor) };
  }

  const group = groupAt(nodes, cursor.path);
  const next = group.slice();
  next.splice(cursor.index, 0, { kind: 'char', value: ch });
  return {
    nodes: withGroup(nodes, cursor.path, next),
    cursor: { path: cursor.path, index: cursor.index + 1 },
  };
}

/** Type a whole string, one character at a time. Used for pasting. */
export function insertText(
  nodes: MathNode[],
  cursor: Cursor,
  text: string,
): EditorState {
  let state: EditorState = { nodes, cursor };
  for (const ch of text) {
    state = insertChar(state.nodes, state.cursor, ch);
  }
  return state;
}

/**
 * Delete backwards.
 *
 * Backspacing onto a superscript steps *into* the end of it rather than
 * throwing the whole exponent away, so a mistyped exponent can be corrected
 * character by character. Backspacing out of an exponent that is already empty
 * removes it.
 */
export function backspace(nodes: MathNode[], cursor: Cursor): EditorState {
  const group = groupAt(nodes, cursor.path);

  if (cursor.index > 0) {
    const previous = group[cursor.index - 1];

    if (previous.kind === 'sup') {
      return {
        nodes,
        cursor: {
          path: [...cursor.path, cursor.index - 1],
          index: previous.children.length,
        },
      };
    }

    const next = group.slice();
    next.splice(cursor.index - 1, 1);
    return {
      nodes: withGroup(nodes, cursor.path, next),
      cursor: { path: cursor.path, index: cursor.index - 1 },
    };
  }

  if (cursor.path.length === 0) return { nodes, cursor };

  const parentPath = cursor.path.slice(0, -1);
  const supIndex = cursor.path[cursor.path.length - 1];
  const parent = groupAt(nodes, parentPath);
  const sup = parent[supIndex];

  if (sup && sup.kind === 'sup' && sup.children.length === 0) {
    const next = parent.slice();
    next.splice(supIndex, 1);
    return {
      nodes: withGroup(nodes, parentPath, next),
      cursor: { path: parentPath, index: supIndex },
    };
  }

  return { nodes, cursor: { path: parentPath, index: supIndex } };
}

/** Move one step left, descending into a superscript or stepping out of one. */
export function moveLeft(nodes: MathNode[], cursor: Cursor): Cursor {
  const group = groupAt(nodes, cursor.path);

  if (cursor.index > 0) {
    const previous = group[cursor.index - 1];
    if (previous.kind === 'sup') {
      return {
        path: [...cursor.path, cursor.index - 1],
        index: previous.children.length,
      };
    }
    return { path: cursor.path, index: cursor.index - 1 };
  }

  if (cursor.path.length === 0) return cursor;
  return {
    path: cursor.path.slice(0, -1),
    index: cursor.path[cursor.path.length - 1],
  };
}

/** Move one step right, descending into a superscript or stepping out of one. */
export function moveRight(nodes: MathNode[], cursor: Cursor): Cursor {
  const group = groupAt(nodes, cursor.path);

  if (cursor.index < group.length) {
    const next = group[cursor.index];
    if (next.kind === 'sup') {
      return { path: [...cursor.path, cursor.index], index: 0 };
    }
    return { path: cursor.path, index: cursor.index + 1 };
  }

  if (cursor.path.length === 0) return cursor;
  return exitGroup(cursor);
}

/** Write the expression out as text for the parser. */
export function serialize(nodes: MathNode[]): string {
  let out = '';
  for (const node of nodes) {
    out += node.kind === 'char' ? node.value : `^(${serialize(node.children)})`;
  }
  return out;
}

/**
 * Serialise, and record which character node produced each character of the
 * output. Characters the field adds itself (`^`, the brackets around an
 * exponent) map to `null`.
 *
 * The ids are the depth-first position of each character node, which is the
 * same order the field renders them in — so a parse error at string offset `n`
 * can be traced back to exactly one character on screen and highlighted.
 */
export function serializeWithOwners(nodes: MathNode[]): {
  text: string;
  owners: (number | null)[];
} {
  const owners: (number | null)[] = [];
  let text = '';
  let counter = 0;

  const walk = (list: MathNode[]): void => {
    for (const node of list) {
      if (node.kind === 'char') {
        text += node.value;
        owners.push(counter);
        counter += 1;
      } else {
        text += '^(';
        owners.push(null, null);
        walk(node.children);
        text += ')';
        owners.push(null);
      }
    }
  };

  walk(nodes);
  return { text, owners };
}

function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const BARE_EXPONENT = /[A-Za-z0-9._]/;

/**
 * Read plain text back into nodes, so presets and pasted text show up with
 * real superscripts.
 *
 * Both `x^(2)` and the bare `x^2` are understood; a bare exponent runs to the
 * end of the number or name, matching how `2^-1` and `x^2y` are normally read.
 */
export function parseToNodes(source: string): MathNode[] {
  const nodes: MathNode[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch !== '^') {
      nodes.push({ kind: 'char', value: ch });
      i += 1;
      continue;
    }

    i += 1; // step past '^'

    if (source[i] === '(') {
      const close = matchingParen(source, i);
      if (close === -1) {
        nodes.push({ kind: 'sup', children: parseToNodes(source.slice(i + 1)) });
        i = source.length;
      } else {
        nodes.push({
          kind: 'sup',
          children: parseToNodes(source.slice(i + 1, close)),
        });
        i = close + 1;
      }
      continue;
    }

    let end = i;
    if (source[end] === '-' || source[end] === '+') end += 1;
    while (end < source.length && BARE_EXPONENT.test(source[end])) end += 1;

    nodes.push({ kind: 'sup', children: parseToNodes(source.slice(i, end)) });
    i = end;
  }

  return nodes;
}
