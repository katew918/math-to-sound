/**
 * Counting visits to the published site.
 *
 * A static site can't count its own visitors — there is no server of ours to
 * ask — so the page pings a third-party counter keyed on its own URL. Nothing
 * is rendered in the app: visitors see no counter, and the number is read
 * separately (see "Visit count" in the README).
 *
 * What this means in practice, and what it doesn't:
 *
 * - The request goes to hits.sh, which inevitably sees the visitor's IP and
 *   user agent. We send nothing ourselves, and suppress the referrer.
 * - It counts raw hits, so bots and crawlers are in the number too.
 * - The count is public to anyone who knows the URL. It is unlisted, not
 *   private.
 */

/** Keyed on the site's own address, so it counts this site and nothing else. */
export const COUNTER_URL = 'https://hits.sh/katew918.github.io/math-to-sound.svg';

/** Marks a browsing session as counted, so a reload isn't a second visit. */
export const SESSION_KEY = 'math-to-sound:visit-counted';

export type VisitOutcome =
  | 'counted'
  | 'skipped-disabled'
  | 'skipped-already-counted'
  | 'failed';

type SessionLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface VisitOptions {
  /** False during development, so local work never inflates the count. */
  enabled: boolean;
  /**
   * Where "already counted" is remembered. Defaults to sessionStorage;
   * `null` disables the check. Tests pass their own.
   */
  session?: SessionLike | null;
  /** How the request is sent. Tests pass their own. */
  send?: (url: string) => void;
}

/**
 * An `<img>` request needs no CORS permission from the other end and cannot
 * block rendering. The response is a badge image we simply throw away.
 */
function sendByImage(url: string): void {
  const beacon = new Image();
  beacon.referrerPolicy = 'no-referrer';
  beacon.src = url;
}

function defaultSession(): SessionLike | null {
  try {
    return window.sessionStorage;
  } catch {
    // Blocked cookies or a locked-down private mode: carry on without it.
    return null;
  }
}

/**
 * Count this visit, at most once per browsing session.
 *
 * Never throws: a counter that breaks the page would be far worse than a
 * counter that misses a visit.
 */
export function recordVisit(options: VisitOptions): VisitOutcome {
  const { enabled, send = sendByImage } = options;

  if (!enabled) return 'skipped-disabled';

  const session = options.session === undefined ? defaultSession() : options.session;

  if (session) {
    try {
      if (session.getItem(SESSION_KEY) !== null) return 'skipped-already-counted';
    } catch {
      // Reading can throw even when the object exists. Count rather than crash.
    }
  }

  try {
    send(COUNTER_URL);
  } catch {
    return 'failed';
  }

  if (session) {
    try {
      session.setItem(SESSION_KEY, '1');
    } catch {
      // Full or blocked storage just means this session may count twice.
    }
  }

  return 'counted';
}
