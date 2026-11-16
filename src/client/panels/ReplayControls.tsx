interface Props {
  step: number;
  total: number;
  /** The move that led to this step, in words. */
  what: string;
  playing: boolean;
  onStep: (step: number) => void;
  onPlaying: (playing: boolean) => void;
}

/** What sits in the dock while a recorded session is watched, where the decision box would be. */
export function ReplayControls({ step, total, what, playing, onStep, onPlaying }: Props) {
  const atStart = step <= 0;
  const atEnd = step >= total;
  return (
    <section className="replay" aria-labelledby="replay-title">
      <h2 id="replay-title" className="label">
        Recorded session
        <span className="mono replay-count">
          {" "}
          step {step} of {total}
        </span>
      </h2>
      <p className="replay-what" aria-live="polite">
        {what}
      </p>
      <div className="row">
        <button type="button" onClick={() => onStep(0)} disabled={atStart}>
          To the start
        </button>
        <button type="button" onClick={() => onStep(step - 1)} disabled={atStart}>
          Back
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onPlaying(!playing)}
          disabled={atEnd && !playing}
          aria-pressed={playing}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <button type="button" onClick={() => onStep(step + 1)} disabled={atEnd}>
          Forward
        </button>
        <button type="button" onClick={() => onStep(total)} disabled={atEnd}>
          To the end
        </button>
      </div>
    </section>
  );
}
