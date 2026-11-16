// What the debrief draws besides the score: the session on one axis with its key moments marked,
// and the stronger response set beside what the player actually did. Pure functions over the
// finished session, so that "every mark is an event in the log" is a unit test.
import { clockAt } from "../../engine/clock.js";
import { describeIntent, type Debrief } from "../../engine/debrief.js";
import type { IdealStep, Scenario } from "../../engine/schema.js";
import type { EngineEvent, SessionState } from "../../engine/state.js";

export type MarkKind =
  | "cause"
  | "mitigation"
  | "harm"
  | "kept"
  | "broken"
  | "claim"
  | "wrong"
  | "duty"
  | "end"
  | "other";

export interface Mark {
  eventId: string;
  minute: number;
  clock: string;
  kind: MarkKind;
  /** One or two words for the kind, shown beside the time so colour is never the only sign. */
  word: string;
  label: string;
  /** Marked in the signal colour: something that cost the player. */
  bad: boolean;
}

export interface Timeline {
  /** The last minute on the axis. At least 1, so the axis has a length. */
  minutes: number;
  startClock: string;
  endClock: string;
  /** The figure drawn as a line, one value for each minute from 0 to `minutes`. */
  metric: { label: string; values: number[]; max: number; peakMinute: number };
  marks: Mark[];
}

const WORDS: Record<MarkKind, string> = {
  cause: "Cause found",
  mitigation: "Fix applied",
  harm: "Made it worse",
  kept: "Promise kept",
  broken: "Promise broken",
  claim: "Statement",
  wrong: "Statement wrong",
  duty: "Duty",
  end: "End",
  other: "Noted",
};

/** Words for events that are on the timeline only because the debrief points at them. */
const OTHER_WORDS: Partial<Record<EngineEvent["type"], string>> = {
  commitment_made: "Promise made",
  directive: "Instruction",
  obligation: "Duty",
  task_started: "Order",
  task_completed: "Result",
  player_message: "Message",
  message: "Message to you",
};

const short = (text: string, max = 140): string =>
  text.length <= max ? text : `${text.slice(0, text.lastIndexOf(" ", max - 1))}…`;

function markFor(sc: Scenario, e: EngineEvent): { kind: MarkKind; label: string } | null {
  const text = e.text ?? "";
  switch (e.type) {
    case "clue_revealed":
      return e.data?.id === sc.scoring.rootCauseClue
        ? { kind: "cause", label: "The root cause came into view." }
        : null;
    case "mitigation_applied": {
      const m = sc.mitigations.find((x) => x.id === e.data?.id);
      return { kind: m?.kind === "harmful" ? "harm" : "mitigation", label: m?.label ?? "A change" };
    }
    case "commitment_kept":
      return { kind: "kept", label: text };
    case "commitment_broken":
      return { kind: "broken", label: text };
    case "claim":
      return { kind: "claim", label: text };
    case "claim_surfaced":
      return { kind: "wrong", label: text };
    case "claim_corrected":
      return { kind: "claim", label: text };
    case "obligation":
      // A duty coming due is not a moment of the player's. Meeting it or missing it is.
      return e.data?.state === "open" || e.data?.state === "dormant"
        ? null
        : { kind: "duty", label: text.replace(/^Duty - /, "") };
    case "ended":
      return { kind: "end", label: text };
    default:
      return null;
  }
}

/** Every event id the debrief points at: score lines, lessons and the one thing. */
export function citedIn(debrief: Debrief): string[] {
  const ids = new Set<string>();
  for (const d of Object.values(debrief.score.dimensions)) {
    for (const line of d.lines) for (const id of line.eventIds) ids.add(id);
  }
  for (const point of [...debrief.wentWell, ...debrief.missed, debrief.oneThing]) {
    for (const id of point.eventIds) ids.add(id);
  }
  return [...ids];
}

/**
 * The session on one axis. Marked on it: the first sight of the root cause, each change made,
 * each promise kept or broken, each statement, each duty, the end, and anything else the debrief
 * points at, so that every line of the debrief has somewhere on the timeline to go.
 */
export function timelineOf(
  sc: Scenario,
  session: SessionState,
  cited: readonly string[],
): Timeline {
  const minutes = Math.max(1, session.minute);
  const series = session.series[sc.driverMetric] ?? [];
  const values = Array.from({ length: minutes + 1 }, (_, t) => series[t] ?? 0);
  const max = Math.max(1, ...values);
  const wanted = new Set(cited);

  const marks: Mark[] = [];
  for (const e of session.log) {
    const made = markFor(sc, e);
    const mark =
      made ?? (wanted.has(e.id) ? { kind: "other" as const, label: e.text ?? e.type } : null);
    if (!mark) continue;
    marks.push({
      eventId: e.id,
      minute: e.minute,
      clock: clockAt(sc.startClock, e.minute),
      kind: mark.kind,
      word: made ? WORDS[mark.kind] : (OTHER_WORDS[e.type] ?? WORDS.other),
      label: short(mark.label.replace(/^(?:Mika|You): /, "")),
      bad: mark.kind === "harm" || mark.kind === "broken" || mark.kind === "wrong",
    });
  }

  return {
    minutes,
    startClock: clockAt(sc.startClock, 0),
    endClock: clockAt(sc.startClock, minutes),
    metric: {
      label: sc.metrics.find((m) => m.id === sc.driverMetric)?.label ?? sc.driverMetric,
      values,
      max,
      peakMinute: values.indexOf(max),
    },
    marks,
  };
}

export interface StrongerRow {
  clock: string;
  step: string;
  why: string;
  /** When the player did the same thing, or null if they never did. */
  did: { clock: string; minute: number; minutesLater: number } | null;
}

/** The first event of a type, at or after a position in the log, that passes a test. */
function findFrom(
  log: readonly EngineEvent[],
  from: number,
  test: (e: EngineEvent) => boolean,
): number {
  for (let n = from; n < log.length; n++) if (test(log[n] as EngineEvent)) return n;
  return -1;
}

/**
 * The stronger response, step by step, beside what the player did. A step counts as done when
 * the same order was given, the same change made, the same instruction sent, or, for a plain
 * message, when the player wrote to the same person. Messages are matched in order, so two
 * authored messages to the CTO need two from the player.
 */
export function strongerBeside(sc: Scenario, session: SessionState): StrongerRow[] {
  const authored = sc.idealPath.filter((s) => s.why);
  const steps: readonly IdealStep[] = authored.length > 0 ? authored : sc.idealPath;
  const log = session.log;
  // Where to look from next, for each person written to.
  const next = new Map<string, number>();

  return steps.map((s) => {
    const intent = s.intent;
    let at = -1;
    if (intent.kind === "investigate") {
      at = findFrom(log, 0, (e) => e.type === "task_started" && e.data?.id === intent.id);
      if (at < 0) {
        at = findFrom(log, 0, (e) => e.type === "task_completed" && e.data?.id === intent.id);
      }
    } else if (intent.kind === "mitigate") {
      at = findFrom(log, 0, (e) => e.type === "task_started" && e.data?.id === intent.id);
      if (at < 0) {
        at = findFrom(log, 0, (e) => e.type === "mitigation_applied" && e.data?.id === intent.id);
      }
    } else if (intent.kind === "communicate") {
      const directive = intent.directives?.[0];
      if (directive) {
        at = findFrom(log, 0, (e) => e.type === "directive" && e.data?.id === directive);
      } else {
        const to = intent.to[0] ?? "";
        const from = next.get(to) ?? 0;
        at = findFrom(log, from, (e) => {
          if (e.type !== "player_message") return false;
          const sent = e.data?.to;
          return Array.isArray(sent) ? sent.includes(to) : sent === to;
        });
        if (at >= 0) next.set(to, at + 1);
      }
    }
    const event = at >= 0 ? log[at] : undefined;
    return {
      clock: clockAt(sc.startClock, s.atMinute),
      step: describeIntent(sc, intent),
      why: s.why ?? "",
      did: event
        ? {
            clock: clockAt(sc.startClock, event.minute),
            minute: event.minute,
            minutesLater: event.minute - s.atMinute,
          }
        : null,
    };
  });
}

/** "at 02:20, on time" / "at 02:31, 11 minutes later" / "at 02:16, 2 minutes sooner" */
export function timingWords(did: NonNullable<StrongerRow["did"]>): string {
  const gap = did.minutesLater;
  if (Math.abs(gap) <= 1) return `at ${did.clock}, on time`;
  const minutes = `${Math.abs(gap)} minutes`;
  return gap > 0 ? `at ${did.clock}, ${minutes} later` : `at ${did.clock}, ${minutes} sooner`;
}

/** The line of the chart as SVG path data, in a box `width` by `height` with the origin top left. */
export function chartPath(values: readonly number[], max: number, width: number, height: number) {
  const last = Math.max(1, values.length - 1);
  return values
    .map((v, t) => {
      const x = (t / last) * width;
      const y = height - (Math.max(0, v) / Math.max(1, max)) * height;
      return `${t === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
