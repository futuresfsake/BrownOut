// Scoring. A pure function of the scenario and the session's event log and ledgers, so the same
// session always gets the same score. See docs/03-design/scoring-and-debrief.md.
import { evalMode } from "./curves.js";
import { obligationState } from "./engine.js";
import { fromIdeal, play } from "./playthrough.js";
import type { Scenario } from "./schema.js";
import type { SessionState } from "./state.js";

export type Dimension = "containment" | "diagnosis" | "communication" | "honesty" | "obligations";

export const WEIGHTS: Record<Dimension, number> = {
  containment: 30,
  diagnosis: 20,
  communication: 20,
  honesty: 20,
  obligations: 10,
};

export interface ScoreLine {
  delta: number;
  reason: string;
  eventIds: string[];
}

export interface DimensionScore {
  score: number;
  lines: ScoreLine[];
}

export interface ScoreResult {
  overall: number;
  label: "Strong response" | "Solid response" | "Shaky response" | "Lost control";
  dimensions: Record<Dimension, DimensionScore>;
  caps: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * Customer-minutes over the whole scenario. A session that stops early is projected forward as if
 * nothing more were done, so walking away from an unfixed incident does not look like a good result.
 */
export function customerMinutes(scenario: Scenario, state: SessionState): number {
  const series = state.series[scenario.driverMetric] ?? [];
  const { name, startMinute, startValue } = state.mode;
  let total = 0;
  for (let t = 0; t <= scenario.lengthMinutes; t++) {
    total +=
      series[t] ??
      Math.round(evalMode(scenario.modes, name, t, { minute: startMinute, value: startValue }));
  }
  return total;
}

const boundsCache = new WeakMap<Scenario, { best: number; worst: number }>();

/** Best is the authored ideal path. Worst is doing nothing at all. */
export function containmentBounds(scenario: Scenario): { best: number; worst: number } {
  const cached = boundsCache.get(scenario);
  if (cached) return cached;
  const best = customerMinutes(scenario, play(scenario, fromIdeal(scenario.idealPath)).state);
  const worst = customerMinutes(scenario, play(scenario, []).state);
  const bounds = { best, worst };
  boundsCache.set(scenario, bounds);
  return bounds;
}

function containment(scenario: Scenario, state: SessionState): DimensionScore {
  const { best, worst } = containmentBounds(scenario);
  const actual = customerMinutes(scenario, state);
  const lines: ScoreLine[] = [];
  const base = worst === best ? 100 : clamp((100 * (worst - actual)) / (worst - best));
  lines.push({
    delta: Math.round(base),
    reason: `Customers affected over the incident, compared with the best and worst possible (${actual.toLocaleString("en-US")} customer-minutes)`,
    eventIds: [],
  });
  let score = base;
  for (const applied of state.appliedMitigations) {
    const m = scenario.mitigations.find((x) => x.id === applied.id);
    if (m?.kind === "harmful") {
      score -= 10;
      const event = state.log.find((e) => e.type === "mitigation_applied" && e.data?.id === m.id);
      lines.push({
        delta: -10,
        reason: `Applied a harmful change: ${m.label}`,
        eventIds: event ? [event.id] : [],
      });
    }
  }
  return { score: Math.round(clamp(score)), lines };
}

function diagnosis(scenario: Scenario, state: SessionState): DimensionScore {
  const lines: ScoreLine[] = [];
  const rootId = scenario.scoring.rootCauseClue;
  const revealEvent = state.log.find((e) => e.type === "clue_revealed" && e.data?.id === rootId);
  let score = 0;
  if (revealEvent) {
    score += 40;
    lines.push({ delta: 40, reason: "You found the root cause", eventIds: [revealEvent.id] });
    const target = scenario.scoring.causeTargetMinute;
    const at = revealEvent.minute;
    const timePoints = Math.round(30 * clamp(1 - (at - target) / (2 * target), 0, 1));
    score += timePoints;
    lines.push({
      delta: timePoints,
      reason: `Time to the root cause: minute ${at}, target ${target}`,
      eventIds: [revealEvent.id],
    });
  } else {
    lines.push({ delta: 0, reason: "The root cause was never found", eventIds: [] });
  }
  let clean = 30;
  for (const applied of state.appliedMitigations) {
    const m = scenario.mitigations.find((x) => x.id === applied.id);
    if (m && (m.kind === "noEffect" || m.kind === "harmful")) {
      clean -= 10;
      const event = state.log.find((e) => e.type === "mitigation_applied" && e.data?.id === m.id);
      lines.push({
        delta: -10,
        reason: `A change that did not help: ${m.label}`,
        eventIds: event ? [event.id] : [],
      });
    }
  }
  if (revealEvent) {
    for (const done of state.completedInvestigations) {
      const inv = scenario.investigations.find((i) => i.id === done.id);
      const onlyNoise =
        inv !== undefined &&
        inv.reveals.length > 0 &&
        inv.reveals.every((c) => scenario.clues.find((k) => k.id === c)?.kind !== "true");
      if (onlyNoise && done.minute > revealEvent.minute) {
        clean -= 5;
        lines.push({
          delta: -5,
          reason: `Checked something already ruled out: ${inv.label}`,
          eventIds: [],
        });
      }
    }
  }
  score += Math.max(0, clean);
  return { score: Math.round(clamp(score)), lines };
}

function communication(scenario: Scenario, state: SessionState): DimensionScore {
  const lines: ScoreLine[] = [];
  const { episodes, inTime } = state.replyStats;
  const answered = episodes === 0 ? 40 : Math.round((40 * inTime) / episodes);
  lines.push({
    delta: answered,
    reason: `Messages answered in time: ${inTime} of ${episodes}`,
    eventIds: [],
  });

  const made = state.commitments;
  const kept = made.filter((c) => c.status === "kept").length;
  const promises = made.length === 0 ? 15 : Math.round((30 * kept) / made.length);
  lines.push({
    delta: promises,
    reason:
      made.length === 0
        ? "No promises made (half marks)"
        : `Promises kept: ${kept} of ${made.length}`,
    eventIds: made.filter((c) => c.status === "broken").map((c) => c.eventId),
  });

  const watched = ["cto", "support", "comms"].filter((id) =>
    scenario.stakeholders.some((s) => s.id === id),
  );
  const end = Math.max(1, state.minute);
  const windows = Math.ceil(end / 20);
  const told = state.log.filter((e) => e.type === "player_message");
  let covered = 0;
  for (const who of watched) {
    for (let w = 0; w < windows; w++) {
      const heard = told.some(
        (e) =>
          e.minute >= w * 20 &&
          e.minute < (w + 1) * 20 &&
          Array.isArray(e.data?.to) &&
          e.data.to.includes(who),
      );
      if (heard) covered += 1;
    }
  }
  const proactive =
    watched.length === 0 ? 30 : Math.round((30 * covered) / (watched.length * windows));
  lines.push({
    delta: proactive,
    reason: `Regular updates to the CTO, support and comms: ${covered} of ${watched.length * windows} windows covered`,
    eventIds: [],
  });
  return { score: clamp(answered + promises + proactive), lines };
}

function honesty(scenario: Scenario, state: SessionState): DimensionScore {
  const lines: ScoreLine[] = [];
  let score = 100;
  for (const claim of state.claims) {
    if (claim.truth === "unknowable") continue;
    const kinds = claim.audience.map(
      (a) => scenario.stakeholders.find((s) => s.id === a)?.audience ?? "internal",
    );
    const severe = kinds.some((k) => k !== "internal");
    if (claim.truth === "false") {
      const penalty = severe ? 45 : 30;
      score -= penalty;
      lines.push({
        delta: -penalty,
        reason: `A false statement: "${claim.text}"`,
        eventIds: [claim.eventId],
      });
      if (claim.corrected && !claim.surfaced) {
        score += 20;
        lines.push({
          delta: 20,
          reason: "You corrected it before it was exposed",
          eventIds: [claim.eventId],
        });
      }
    } else if (!claim.supported) {
      score -= 10;
      lines.push({
        delta: -10,
        reason: `True, but you had no evidence yet: "${claim.text}"`,
        eventIds: [claim.eventId],
      });
    }
  }
  return { score: Math.round(clamp(score)), lines };
}

function obligations(scenario: Scenario, state: SessionState): DimensionScore {
  const lines: ScoreLine[] = [];
  const points: number[] = [];
  for (const ob of scenario.obligations) {
    const s = obligationState(scenario, state, ob.id);
    if (s === "dormant") continue;
    const value = s === "met" ? 100 : s === "late" ? 50 : 0;
    points.push(value);
    const event = [...state.log]
      .reverse()
      .find((e) => e.type === "obligation" && e.data?.id === ob.id);
    lines.push({
      delta: value,
      reason: `${ob.label}: ${s === "open" ? "not done" : s}`,
      eventIds: event ? [event.id] : [],
    });
  }
  const score =
    points.length === 0 ? 100 : Math.round(points.reduce((a, b) => a + b, 0) / points.length);
  return { score, lines };
}

function labelFor(overall: number): ScoreResult["label"] {
  if (overall >= 85) return "Strong response";
  if (overall >= 70) return "Solid response";
  if (overall >= 50) return "Shaky response";
  return "Lost control";
}

export function score(scenario: Scenario, state: SessionState): ScoreResult {
  const dimensions: Record<Dimension, DimensionScore> = {
    containment: containment(scenario, state),
    diagnosis: diagnosis(scenario, state),
    communication: communication(scenario, state),
    honesty: honesty(scenario, state),
    obligations: obligations(scenario, state),
  };
  let overall = 0;
  for (const d of Object.keys(WEIGHTS) as Dimension[])
    overall += (dimensions[d].score * WEIGHTS[d]) / 100;
  overall = Math.round(overall);
  const caps: string[] = [];
  const pressLie = state.claims.some(
    (c) =>
      c.truth === "false" &&
      !c.corrected &&
      c.audience.some((a) => scenario.stakeholders.find((s) => s.id === a)?.audience === "press"),
  );
  if (pressLie) {
    caps.push("A false statement to the press was never corrected: capped at 69");
    overall = Math.min(overall, 69);
  }
  if (state.status === "relieved") {
    caps.push("The CTO took over the incident: capped at 59");
    overall = Math.min(overall, 59);
  }
  return { overall, label: labelFor(overall), dimensions, caps };
}
