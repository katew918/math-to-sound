import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  backspace,
  cursorAtEnd,
  insertChar,
  insertText,
  moveLeft,
  moveRight,
  parseToNodes,
  samePath,
  serialize,
  serializeWithOwners,
  type EditorState,
  type MathNode,
} from '../lib/mathNodes';

export interface MathFieldProps {
  /** The expression as plain text, e.g. `e^(-3x)`. */
  value: string;
  onChange: (value: string) => void;
  /** Character offset of a parse error in `value`, or null. */
  errorPosition: number | null;
  label: string;
}

const initialState = (value: string): EditorState => {
  const nodes = parseToNodes(value);
  return { nodes, cursor: cursorAtEnd(nodes) };
};

/**
 * A Desmos-style input for a function of x.
 *
 * Typing `^` raises into an exponent and a space drops back out of it, so
 * `e^(-3x) + 1` can be typed straight through. The `^` itself is never shown:
 * the raised position is what says "exponent".
 *
 * Editing is driven by a hidden `<input>` that holds focus. That is what makes
 * a mobile keyboard appear, and it gives us `beforeinput` for devices whose
 * soft keyboards don't report useful `keydown` events.
 */
export function MathField({ value, onChange, errorPosition, label }: MathFieldProps) {
  const [state, setState] = useState<EditorState>(() => initialState(value));
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The live document, updated synchronously.
   *
   * Handlers read from here rather than from the values captured when they were
   * created. Several input events can arrive before React re-renders — key
   * autorepeat, a soft keyboard emitting a burst, an IME committing a word — and
   * reading the render's copy would make every event in the burst start from the
   * same stale document, so only the last one would survive.
   */
  const live = useRef(state);

  // The last text we handed to onChange, so a value arriving from outside
  // (a preset) can be told apart from our own echo.
  const lastEmitted = useRef(value);

  const commit = (next: EditorState, emit: boolean): void => {
    live.current = next;
    setState(next);

    if (emit) {
      const serialized = serialize(next.nodes);
      lastEmitted.current = serialized;
      onChange(serialized);
    }
  };

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const next = initialState(value);
    live.current = next;
    setState(next);
  }, [value]);

  const { text, owners } = useMemo(() => serializeWithOwners(state.nodes), [state.nodes]);

  // Only trust the error offset when the text we rendered is the text that was
  // parsed; right after a preset loads they can briefly differ (`x^2` vs
  // `x^(2)`), and highlighting the wrong character would be worse than none.
  const errorCharId =
    errorPosition !== null && text === value ? (owners[errorPosition] ?? null) : null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // Leave shortcuts (copy, paste, select-all) to the browser.
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const { nodes, cursor } = live.current;

    switch (event.key) {
      case 'ArrowLeft':
        commit({ nodes, cursor: moveLeft(nodes, cursor) }, false);
        break;
      case 'ArrowRight':
        commit({ nodes, cursor: moveRight(nodes, cursor) }, false);
        break;
      case 'Home':
        commit({ nodes, cursor: { path: [], index: 0 } }, false);
        break;
      case 'End':
        commit({ nodes, cursor: cursorAtEnd(nodes) }, false);
        break;
      case 'Backspace':
        commit(backspace(nodes, cursor), true);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'Enter':
        break;
      default:
        if (event.key.length !== 1) return;
        commit(insertChar(nodes, cursor, event.key), true);
        break;
    }

    // Reaching here means we handled it, so stop the hidden input reacting too.
    // This also prevents `beforeinput` firing, which is why the two handlers
    // can't double-insert a character.
    event.preventDefault();
  };

  /**
   * Text that arrives without a usable `keydown`: a soft keyboard, an IME, dictation.
   *
   * This has to be a native listener. React's `onBeforeInput` is a legacy
   * synthetic event, not the DOM's `beforeinput`, so its `nativeEvent` carries
   * no `inputType` and this branch would never run.
   */
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;

    const onBeforeInput = (event: Event): void => {
      const input = event as InputEvent;
      event.preventDefault();
      const { nodes, cursor } = live.current;

      if (input.inputType === 'insertText' && input.data) {
        commit(insertText(nodes, cursor, input.data), true);
      } else if (input.inputType === 'deleteContentBackward') {
        commit(backspace(nodes, cursor), true);
      }
    };

    field.addEventListener('beforeinput', onBeforeInput);
    return () => field.removeEventListener('beforeinput', onBeforeInput);
  });

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    const { nodes, cursor } = live.current;
    commit(insertText(nodes, cursor, pasted), true);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    inputRef.current?.focus();
    const { nodes } = live.current;

    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-path]');
    if (!hit) {
      commit({ nodes, cursor: cursorAtEnd(nodes) }, false);
      event.preventDefault();
      return;
    }

    const path = (hit.dataset.path ?? '').split('.').filter(Boolean).map(Number);
    const index = Number(hit.dataset.index);
    const box = hit.getBoundingClientRect();
    const pastMiddle = event.clientX > box.left + box.width / 2;

    commit({ nodes, cursor: { path, index: pastMiddle ? index + 1 : index } }, false);
    event.preventDefault();
  };

  const renderGroup = (
    list: MathNode[],
    path: number[],
    counter: { next: number },
  ): ReactNode[] => {
    const here = samePath(path, state.cursor.path);
    const out: ReactNode[] = [];

    const caret = (key: string): void => {
      if (focused && here) out.push(<span className="mf-caret" key={key} />);
    };

    list.forEach((node, i) => {
      if (here && state.cursor.index === i) caret(`caret-${i}`);

      if (node.kind === 'char') {
        const id = counter.next;
        counter.next += 1;
        out.push(
          <span
            key={`c${i}`}
            className={`mf-char${id === errorCharId ? ' is-error' : ''}`}
            data-path={path.join('.')}
            data-index={i}
          >
            {node.value}
          </span>,
        );
      } else {
        out.push(
          <span
            className="mf-sup"
            key={`s${i}`}
            data-path={path.join('.')}
            data-index={i}
          >
            {node.children.length === 0 && <span className="mf-empty" />}
            {renderGroup(node.children, [...path, i], counter)}
          </span>,
        );
      }
    });

    if (here && state.cursor.index === list.length) caret('caret-end');
    return out;
  };

  const invalid = errorPosition !== null;

  return (
    <div
      className={`mathfield${focused ? ' is-focused' : ''}${invalid ? ' is-invalid' : ''}`}
      onMouseDown={handleMouseDown}
      role="presentation"
    >
      <span className="mf-body">
        {state.nodes.length === 0 && !focused && <span className="mf-hint">sin(x)</span>}
        {renderGroup(state.nodes, [], { next: 0 })}
      </span>

      <input
        ref={inputRef}
        className="mf-input"
        type="text"
        value=""
        onChange={() => undefined}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* Screen readers can't follow the rendered layout, so announce the text. */}
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
    </div>
  );
}
