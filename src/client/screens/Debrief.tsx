import { useCallback, useMemo, useState } from "react";
import { clockAt } from "../../engine/clock.js";
import { buildDebrief } from "../../engine/debrief.js";
import type { Scenario } from "../../engine/schema.js";
import { useFocusOnOpen } from "../app/focus.js";
import type { Game } from "../app/game.js";
import {
  chartPath,
  citedIn,
  strongerBeside,
  timelineOf,
  timingWords,
  type Timeline,
} from "../app/review.js";
import { exportSession, fileName, fileText } from "../app/session-file.js";

interface Props {
  scenario: Scenario;
  game: Game;
  /** Set when this is the debrief of a recorded session that was watched, not played. */
  watched: boolean;
  onAgain: () => void;
  onNewSeed: () => void;
  onWatch: () => void;
  onStart: () => void;
}

const DIMENSIONS: Record<string, string> = {
  containment: "Containment",
  diagnosis: "Diagnosis",
  communication: "Communication",
  honesty: "Honesty",
  obligations: "Duties",
};

const ENDED: Record<string, string> = {
  running: "Stopped while still running",
  resolved: "Resolved",
  relieved: "Taken over by the CTO",
  timeout: "Out of time",
  ended: "Closed by you",
};

const CHART = { width: 720, height: 150, left: 8, right: 8, top: 14, bottom: 26 } as const;

/** The session on one axis: the figure as a line, the key moments as ticks under it. */
function Chart({ timeline, at }: { timeline: Timeline; at: string | null }) {
  const inner = {
    width: CHART.width - CHART.left - CHART.right,
    height: CHART.height - CHART.top - CHART.bottom,
  };
  const x = (minute: number) => CHART.left + (minute / timeline.minutes) * inner.width;
  const floor = CHART.top + inner.height;
  const line = chartPath(timeline.metric.values, timeline.metric.max, inner.width, inner.height);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      role="img"
      aria-label={`${timeline.metric.label} from ${timeline.startClock} to ${timeline.endClock}, with the moments listed below marked on it.`}
    >
      <line
        className="chart-axis"
        x1={CHART.left}
        x2={CHART.left + inner.width}
        y1={floor}
        y2={floor}
      />
      <g transform={`translate(${CHART.left} ${CHART.top})`}>
        <path className="chart-line" d={line} />
      </g>
      {timeline.marks.map((m) => (
        <line
          key={m.eventId}
          className={`chart-mark${m.bad ? " chart-mark-bad" : ""}${at === m.eventId ? " chart-mark-now" : ""}`}
          x1={x(m.minute)}
          x2={x(m.minute)}
          y1={at === m.eventId ? CHART.top - 8 : floor - 12}
          y2={floor + 6}
        />
      ))}
      <text className="chart-text" x={CHART.left} y={CHART.height - 4}>
        {timeline.startClock}
      </text>
      <text
        className="chart-text"
        x={CHART.left + inner.width}
        y={CHART.height - 4}
        textAnchor="end"
      >
        {timeline.endClock}
      </text>
    </svg>
  );
}

/** The end-of-session report. A document to read, not a dashboard. */
export function Debrief({ scenario, game, watched, onAgain, onNewSeed, onWatch, onStart }: Props) {
  const session = game.session;
  const debrief = useMemo(() => buildDebrief(scenario, session), [scenario, session]);
  const timeline = useMemo(
    () => timelineOf(scenario, session, citedIn(debrief)),
    [scenario, session, debrief],
  );
  const stronger = useMemo(() => strongerBeside(scenario, session), [scenario, session]);
  const marked = useMemo(() => new Set(timeline.marks.map((m) => m.eventId)), [timeline]);
  const [at, setAt] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const screen = useFocusOnOpen<HTMLElement>();

  // The words for a moment are the ones on the timeline, so the link and where it leads agree.
  const eventText = (id: string) => {
    const mark = timeline.marks.find((m) => m.eventId === id);
    return mark ? `${mark.clock}  ${mark.label}` : null;
  };

  /** Goes to a moment on the timeline and puts focus there, so a keyboard carries on from it. */
  const jump = useCallback((eventId: string) => {
    setAt(eventId);
    const row = document.getElementById(`moment-${eventId}`);
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  }, []);

  /** The evidence under a line or a point: the event in words, as a way to the timeline. */
  const evidence = (ids: readonly string[]) => {
    const id = ids.find((x) => marked.has(x));
    if (!id) return null;
    return (
      <button type="button" className="link evidence mono" onClick={() => jump(id)}>
        {eventText(id) ?? "See it on the timeline"}
      </button>
    );
  };

  const save = () => {
    const file = exportSession(scenario, game);
    const url = URL.createObjectURL(new Blob([fileText(file)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(file);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(fileName(file));
  };

  const peak = timeline.metric.values[timeline.metric.peakMinute] ?? 0;

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
      <dl className="facts mono">
        <div>
          <dt>Ending</dt>
          <dd>{ENDED[session.status] ?? session.status}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>
            {session.minute} min, {timeline.startClock} to{" "}
            {clockAt(scenario.startClock, session.minute)}
          </dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd>{game.seed}</dd>
        </div>
      </dl>
      {watched && (
        <p className="muted">This is the debrief of a recorded session that you watched.</p>
      )}

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
                    {evidence(line.eventIds)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <h2 className="rule-heading" id="timeline-title">
        Timeline
      </h2>
      <p className="muted">
        {timeline.metric.label}:{" "}
        {peak > 0
          ? `at most ${peak.toLocaleString("en-US")}, at ${clockAt(scenario.startClock, timeline.metric.peakMinute)}.`
          : "none."}{" "}
        Each tick is one of the moments listed under the chart.
      </p>
      <Chart timeline={timeline} at={at} />
      <ol className="moments" aria-labelledby="timeline-title">
        {timeline.marks.map((m) => (
          <li
            key={m.eventId}
            id={`moment-${m.eventId}`}
            tabIndex={-1}
            className={m.bad ? "moment moment-bad" : "moment"}
            aria-current={at === m.eventId ? "true" : undefined}
          >
            <time className="mono">{m.clock}</time>
            <span className="moment-word">{m.word}</span>
            <span>{m.label}</span>
          </li>
        ))}
      </ol>

      {debrief.wentWell.length > 0 && (
        <>
          <h2 className="rule-heading">What went well</h2>
          <ul className="points serif">
            {debrief.wentWell.map((p) => (
              <li key={p.text}>
                {p.text}
                {evidence(p.eventIds)}
              </li>
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
                {evidence(p.eventIds)}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="rule-heading">One thing</h2>
      <p className="serif">
        {debrief.oneThing.text}
        {evidence(debrief.oneThing.eventIds)}
      </p>

      <h2 className="rule-heading">A stronger response, beside yours</h2>
      <table className="stronger">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">The stronger response</th>
            <th scope="col">What you did</th>
          </tr>
        </thead>
        <tbody>
          {stronger.map((row, n) => (
            <tr key={n}>
              <td className="mono">{row.clock}</td>
              <td>
                <span className="stronger-step">{row.step}</span>
                {row.why && <span className="stronger-why serif">{row.why}</span>}
              </td>
              <td className={row.did ? "" : "stronger-not"}>
                {row.did ? `You did this ${timingWords(row.did)}.` : "You did not do this."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
        <button type="button" onClick={save}>
          Save this session
        </button>
        <button type="button" onClick={onWatch}>
          Watch it back
        </button>
        <button type="button" onClick={onStart}>
          All situations
        </button>
      </div>
      <p className="muted" role="status">
        {saved
          ? `Saved as ${saved}. It is a file on this device and was sent nowhere. Open it from the start screen to watch it again.`
          : ""}
      </p>
    </main>
  );
}
