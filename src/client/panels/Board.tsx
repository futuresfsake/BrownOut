import type { BoardView } from "../app/game.js";

/** The wall board: clock, system status and the hard numbers. */
export function Board({ view, paused }: { view: BoardView; paused: boolean }) {
  return (
    <section className="board" aria-labelledby="board-title">
      <h2 id="board-title" className="panel-title">
        Board
      </h2>
      <p className="clock mono" aria-label={`Time ${view.clock}`}>
        {view.clock}
      </p>
      <p className="mono muted">
        T+{view.elapsed} min{paused ? " · paused" : ""}
      </p>
      <p className={`severity severity-${view.severity}`}>{view.severityWord}</p>

      <h3 className="label">Systems</h3>
      <ul className="systems">
        {view.systems.map((s) => (
          <li key={s.id}>
            <span>{s.label}</span>
            <span className={s.ok ? "status" : "status status-bad"}>{s.status}</span>
          </li>
        ))}
      </ul>

      <h3 className="label">Numbers</h3>
      <dl className="metrics">
        {view.metrics.map((m) => (
          <div key={m.id}>
            <dt>{m.label}</dt>
            <dd className="mono figure">
              {m.value ?? (
                <>
                  <span aria-hidden="true">–</span> <span className="unknown">unknown</span>
                </>
              )}
              {m.trend && <span className={`trend trend-${m.trend}`}> {m.trend}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="label">Mika is</h3>
      {view.task ? (
        <p>
          {view.task.label}
          <span className="mono muted"> · {view.task.minutesLeft} min left</span>
        </p>
      ) : (
        <p className="muted">Free. Waiting for an order.</p>
      )}
      {view.queued && <p className="muted">Next: {view.queued}</p>}
    </section>
  );
}
