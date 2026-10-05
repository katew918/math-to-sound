import type { PlaybackState } from '../hooks/useAudioPlayer';

export interface ControlsProps {
  state: PlaybackState;
  /** False when the domain is invalid, so there is nothing playable. */
  canPlay: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function Controls({
  state,
  canPlay,
  onPlay,
  onPause,
  onResume,
  onStop,
}: ControlsProps) {
  const playing = state === 'playing';
  const paused = state === 'paused';

  return (
    <section className="panel controls">
      <button
        type="button"
        className="control control-primary"
        onClick={paused ? onResume : onPlay}
        disabled={!canPlay || playing}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
        {paused ? 'Resume' : 'Play'}
      </button>

      <button
        type="button"
        className="control"
        onClick={onPause}
        disabled={!playing}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
        </svg>
        Pause
      </button>

      <button
        type="button"
        className="control"
        onClick={onStop}
        disabled={state === 'idle'}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5h9v9h-9z" />
        </svg>
        Stop
      </button>

      <span className={`status status-${state}`}>{state}</span>
    </section>
  );
}
