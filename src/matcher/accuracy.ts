// Scores the matcher against a situation's labelled phrasings. Used by the tests and by authors.
import type { Scenario } from "../engine/schema.js";
import type { AccuracyCase } from "../scenarios/dial-tone/accuracy.js";
import { read, type Reading } from "./matcher.js";

export interface AccuracyReport {
  total: number;
  /** The right reading came first. */
  first: number;
  /** The right reading came first or was offered under "did you mean". */
  offered: number;
  misses: { text: string; got: string; firstOk: boolean; offeredOk: boolean }[];
}

const same = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

function intentMatches(
  c: AccuracyCase,
  intent: Extract<Reading, { kind: "act" }>["intents"][number],
): boolean {
  const e = c.expect;
  if (e.kind === "investigate" || e.kind === "mitigate") {
    return intent.kind === e.kind && intent.id === e.id;
  }
  if (e.kind !== "communicate" || intent.kind !== "communicate") return false;
  if (!same(intent.to, e.to)) return false;
  if (e.directives && !same(intent.directives ?? [], e.directives)) return false;
  if (e.claims) {
    const got = (intent.claims ?? []).map((k) => `${k.topic}:${k.stance}`);
    if (
      !same(
        got,
        e.claims.map(([topic, stance]) => `${topic}:${stance}`),
      )
    )
      return false;
  }
  if (e.promise !== undefined) {
    const promises = intent.promises ?? [];
    if (e.promise === "none") return promises.length === 0;
    return promises.length > 0 && promises.every((p) => p.dueInMinutes === e.promise);
  }
  return true;
}

function describe(reading: Reading): string {
  if (reading.kind === "act") return `act: ${JSON.stringify(reading.intents[0])}`;
  if (reading.kind === "choose")
    return `choose: ${reading.candidates.map((c) => c.label).join(" / ")}`;
  if (reading.kind === "control") return `control: ${reading.control}`;
  return `unknown (nearest: ${reading.suggestions.map((c) => c.label).join(" / ")})`;
}

export function measure(scenario: Scenario, cases: readonly AccuracyCase[]): AccuracyReport {
  const report: AccuracyReport = { total: cases.length, first: 0, offered: 0, misses: [] };
  for (const c of cases) {
    const reading = read(scenario, c.text, { minute: c.minute ?? 0, threadId: c.thread });
    let firstOk = false;
    let offeredOk = false;
    if (c.expect.kind === "notAct") {
      firstOk = offeredOk = reading.kind === "choose" || reading.kind === "unknown";
    } else if (c.expect.kind === "control") {
      firstOk = offeredOk = reading.kind === "control" && reading.control === c.expect.control;
    } else if (reading.kind === "act") {
      const intent = reading.intents[0];
      firstOk = offeredOk = intent !== undefined && intentMatches(c, intent);
    } else if (reading.kind === "choose") {
      offeredOk = reading.candidates.some((cand) => intentMatches(c, cand.intent));
    }
    if (firstOk) report.first += 1;
    if (offeredOk) report.offered += 1;
    if (!firstOk) report.misses.push({ text: c.text, got: describe(reading), firstOk, offeredOk });
  }
  return report;
}
