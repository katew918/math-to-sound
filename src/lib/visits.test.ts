import { describe, expect, it } from 'vitest';
import { COUNTER_URL, SESSION_KEY, recordVisit } from './visits';

/** A stand-in for sessionStorage. */
function fakeSession(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    has: (key: string) => data.has(key),
  };
}

function recorder() {
  const sent: string[] = [];
  return { send: (url: string) => void sent.push(url), sent };
}

describe('recordVisit', () => {
  it('counts a fresh visit', () => {
    const session = fakeSession();
    const { send, sent } = recorder();
    expect(recordVisit({ enabled: true, session, send })).toBe('counted');
    expect(sent).toEqual([COUNTER_URL]);
  });

  it('sends nothing while disabled, so local development is never counted', () => {
    const { send, sent } = recorder();
    expect(recordVisit({ enabled: false, session: fakeSession(), send })).toBe(
      'skipped-disabled',
    );
    expect(sent).toEqual([]);
  });

  it('counts a session only once, so a reload is not a second visit', () => {
    const session = fakeSession();
    const { send, sent } = recorder();

    expect(recordVisit({ enabled: true, session, send })).toBe('counted');
    expect(recordVisit({ enabled: true, session, send })).toBe('skipped-already-counted');
    expect(recordVisit({ enabled: true, session, send })).toBe('skipped-already-counted');
    expect(sent).toHaveLength(1);
  });

  it('remembers that it counted', () => {
    const session = fakeSession();
    recordVisit({ enabled: true, session, send: () => undefined });
    expect(session.has(SESSION_KEY)).toBe(true);
  });

  it('still counts when storage cannot be read', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const { send, sent } = recorder();
    expect(recordVisit({ enabled: true, session: hostile, send })).toBe('counted');
    expect(sent).toHaveLength(1);
  });

  it('counts every call when there is no storage at all', () => {
    const { send, sent } = recorder();
    recordVisit({ enabled: true, session: null, send });
    recordVisit({ enabled: true, session: null, send });
    expect(sent).toHaveLength(2);
  });

  it('reports a failure instead of throwing when the request cannot be made', () => {
    const session = fakeSession();
    const outcome = recordVisit({
      enabled: true,
      session,
      send: () => {
        throw new Error('offline');
      },
    });
    expect(outcome).toBe('failed');
    // A failed send must not mark the session, so the next load can try again.
    expect(session.has(SESSION_KEY)).toBe(false);
  });

  it('points at this site and asks for a plain badge', () => {
    expect(COUNTER_URL).toContain('katew918.github.io/math-to-sound');
    expect(COUNTER_URL.startsWith('https://')).toBe(true);
  });
});
