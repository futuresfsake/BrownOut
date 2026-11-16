import { scenarios } from "../../scenarios/index.js";

export function Start({ onChoose }: { onChoose: (scenarioId: string) => void }) {
  return (
    <main className="page">
      <header className="masthead">
        <p className="wordmark">BrownOut</p>
        <p className="lede">
          A crisis war-room simulator. You run a company incident by typing what you do, and the
          people who need something from you answer back.
        </p>
        <p className="fineprint">
          Nothing you type leaves this page. There is no account, no AI service and no charge.
        </p>
      </header>

      <section aria-labelledby="situations">
        <h1 id="situations" className="rule-heading">
          Situations
        </h1>
        <ol className="situations">
          {scenarios.map(({ scenario }, n) => (
            <li key={scenario.id}>
              <span className="mono situation-number">{String(n + 1).padStart(3, "0")}</span>
              <div>
                <h2>{scenario.title}</h2>
                <p>{scenario.briefing.role}</p>
                <p className="muted">Starts at {scenario.startClock}. About ten minutes to play.</p>
              </div>
              <button type="button" className="primary" onClick={() => onChoose(scenario.id)}>
                Read the briefing
              </button>
            </li>
          ))}
        </ol>
        <p className="muted">
          {scenarios.length === 1 ? "One situation is" : `${scenarios.length} situations are`}{" "}
          playable. Ninety-nine more are planned.
        </p>
      </section>
    </main>
  );
}
