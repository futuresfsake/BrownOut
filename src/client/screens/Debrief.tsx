import { useMemo } from "react";
import { clockAt } from "../../engine/clock.js";
import { buildDebrief } from "../../engine/debrief.js";
import type { Scenario } from "../../engine/schema.js";
import { useFocusOnOpen } from "../app/focus.js";
import type { Game } from "../app/game.js";

interface Props {
  scenario: Scenario;
  game: Game;
  onAgain: () => void;
  onNewSeed: () => void;
  onStart: () => void;
}

const DIMENSIONS: Record<string, string> = {
  containment: "Containment",
  diagnosis: "Diagnosis",
  communication: "Communication",
  honesty: "Honesty",
  obligations: "Duties",
};

/** The end-of-session report. A document to read, not a dashboard. */
export function Debrief({ scenario, game, onAgain, onNewSeed, onStart }: Props) {
  const session = game.session;
  const debrief = useMemo(() => buildDebrief(scenario, session), [scenario, session]);
  const screen = useFocusOnOpen<HTMLElement>();
  const eventText = (id: string) => {
    const e = session.log.find((x) => x.id === id);
    return e?.text ? `${clockAt(scenario.startClock, e.minute)}  ${e.text}` : null;
  };

  return (
    <main className="page debrief" ref={screen} tabIndex={-1}>
      <p className="wordmark small">BrownOut</p>
      <h1 className="rule-heading">Debrief: {scenario.title}</h1>

      <p className="score">
        <span className="mono score-number">{debrief.score.overall}</span>
        <span className="score-label">{debrief.score.label}</span>
      </p>
      <p className="serif">{debrief.headline}</p>
      {debrief.score.caps.map((cap) => (
        <p key={cap} className="cap">
          {cap}
        </p>
      ))}

      <h2 className="rule-heading">The score</h2>
      <div className="dimensions">
        {Object.entries(debrief.score.dimensions).map(([key, d]) => (
          <section key={key} aria-label={DIMENSIONS[key] ?? key}>
            <h3>
              <span>{DIMENSIONS[key] ?? key}</span>
              <span className="mono">{d.score}</span>
            </h3>
            <ul>
              {d.lines.map((line, n) => (
                <li key={n}>
                  <span className="mono delta">
                    {line.delta > 0 ? "+" : ""}
                    {line.delta}
                  </span>
                  <span>
                    {line.reason}
                    {line.eventIds.slice(0, 1).map((id) => {
                      const text = eventText(id);
                      return text ? (
                        <span key={id} className="evidence mono">
                          {text}
                        </span>
                      ) : null;
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {debrief.wentWell.length > 0 && (
        <>
          <h2 className="rule-heading">What went well</h2>
          <ul className="points serif">
            {debrief.wentWell.map((p) => (
              <li key={p.text}>{p.text}</li>
            ))}
          </ul>
        </>
      )}

      {debrief.missed.length > 0 && (
        <>
          <h2 className="rule-heading">What you missed</h2>
          <ul className="points serif">
            {debrief.missed.map((p) => (
              <li key={p.text}>
                {p.text}
                {p.eventIds.slice(0, 1).map((id) => {
                  const text = eventText(id);
                  return text ? (
                    <span key={id} className="evidence mono">
                      {text}
                    </span>
                  ) : null;
                })}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="rule-heading">One thing</h2>
      <p className="serif">{debrief.oneThing.text}</p>

      <h2 className="rule-heading">A stronger response</h2>
      <ol className="stronger">
        {debrief.stronger.map((s, n) => (
          <li key={n}>
            <time className="mono">{s.clock}</time>
            <span>{s.step}</span>
          </li>
        ))}
      </ol>

      <p className="muted mono">
        Seed {game.seed}. The same seed and the same actions always give the same session.
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={onAgain}>
          Play again, same seed
        </button>
        <button type="button" onClick={onNewSeed}>
          Play again, new seed
        </button>
        <button type="button" onClick={onStart}>
          All situations
        </button>
      </div>
    </main>
  );
}
