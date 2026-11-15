// The debrief, assembled from the score, the event log and the situation's authored lessons.
// No model writes any of it. Every point is tied to events that exist in the log.
import { checkCondition, clockOf } from "./engine.js";
import type { Intent, Scenario } from "./schema.js";
import { score, type ScoreResult } from "./score.js";
import type { EngineEvent, SessionState } from "./state.js";

export interface DebriefPoint {
  text: string;
  eventIds: string[];
}

export interface StrongerStep {
  atMinute: number;
  clock: string;
  step: string;
}

export interface Debrief {
  headline: string;
  score: ScoreResult;
  wentWell: DebriefPoint[];
  missed: DebriefPoint[];
  stronger: StrongerStep[];
  oneThing: DebriefPoint;
}

const ENDINGS: Record<SessionState["status"], string> = {
  running: "is still running",
  resolved: "was resolved",
  relieved: "was taken out of your hands by the CTO",
  timeout: "ran out of time unresolved",
  ended: "was closed by you",
};

function evidenceFor(state: SessionState, type: string, id?: string): EngineEvent | undefined {
  return state.log.find(
    (e) => e.type === type && (id === undefined || e.data?.id === id || e.data?.topic === id),
  );
}

function describe(sc: Scenario, intent: Intent): string {
  if (intent.kind === "investigate") {
    return sc.investigations.find((i) => i.id === intent.id)?.label ?? intent.id;
  }
  if (intent.kind === "mitigate") {
    return sc.mitigations.find((m) => m.id === intent.id)?.label ?? intent.id;
  }
  if (intent.kind === "communicate") {
    const names = intent.to.map((id) => sc.stakeholders.find((s) => s.id === id)?.name ?? id);
    return `Tell ${names.join(", ")}: ${intent.text ?? ""}`.trim();
  }
  return "Something else";
}

export function buildDebrief(sc: Scenario, state: SessionState): Debrief {
  const result = score(sc, state);
  const lastEvent = state.log[state.log.length - 1];
  const fallbackIds = lastEvent ? [lastEvent.id] : [];

  const wentWell: DebriefPoint[] = [];
  const missed: DebriefPoint[] = [];
  for (const lesson of sc.lessons ?? []) {
    if (!checkCondition(sc, state, lesson.when)) continue;
    const event = lesson.evidence
      ? evidenceFor(state, lesson.evidence.type, lesson.evidence.id)
      : undefined;
    const point = { text: lesson.text, eventIds: event ? [event.id] : fallbackIds };
    (lesson.kind === "avoided" ? wentWell : missed).push(point);
  }

  // The single largest loss, wherever it came from.
  let worst: { delta: number; reason: string; eventIds: string[] } | undefined;
  for (const d of Object.values(result.dimensions)) {
    for (const line of d.lines) {
      if (line.delta < 0 && (!worst || line.delta < worst.delta)) worst = line;
    }
  }
  const weakest = Object.entries(result.dimensions).sort((a, b) => a[1].score - b[1].score)[0];
  let oneThing: DebriefPoint;
  if (worst) {
    oneThing = {
      text: `The costliest moment: ${worst.reason}.`,
      eventIds: worst.eventIds.length > 0 ? worst.eventIds : fallbackIds,
    };
  } else if (weakest && weakest[1].score < 100) {
    oneThing = {
      text: `Your weakest area was ${weakest[0]}, at ${weakest[1].score} out of 100.`,
      eventIds: fallbackIds,
    };
  } else {
    oneThing = {
      text: "Nothing stands out. Try another seed, or another situation.",
      eventIds: fallbackIds,
    };
  }

  return {
    headline: `${result.label}: the incident ${ENDINGS[state.status]} at ${clockOf(sc, state.minute)}, with a score of ${result.overall}.`,
    score: result,
    wentWell,
    missed,
    stronger: sc.idealPath.map((s) => ({
      atMinute: s.atMinute,
      clock: clockOf(sc, s.atMinute),
      step: describe(sc, s.intent),
    })),
    oneThing,
  };
}
