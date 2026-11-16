import type { Scenario } from "../../engine/schema.js";

interface Props {
  scenario: Scenario;
  onStart: () => void;
  onBack: () => void;
}

export function Briefing({ scenario, onStart, onBack }: Props) {
  return (
    <main className="page">
      <p className="wordmark small">BrownOut</p>
      <h1 className="rule-heading">{scenario.title}</h1>
      <dl className="briefing">
        <dt>You are</dt>
        <dd>{scenario.briefing.role}</dd>
        <dt>The time</dt>
        <dd className="mono">{scenario.startClock}</dd>
        <dt>The situation</dt>
        <dd>{scenario.briefing.situation}</dd>
        <dt>What you can do</dt>
        <dd>{scenario.briefing.canDo}</dd>
        <dt>Good to know</dt>
        <dd>
          The clock moves when you act, and slowly while you think. You can pause it. If the game is
          unsure what you meant, it asks, and asking costs no time.
        </dd>
      </dl>
      <div className="row">
        <button type="button" className="primary" onClick={onStart} autoFocus>
          Start
        </button>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </main>
  );
}
