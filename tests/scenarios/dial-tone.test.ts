import { describe, expect, it } from "vitest";
import { play } from "../../src/engine/playthrough.js";
import { IntentSchema, ScenarioSchema } from "../../src/engine/schema.js";
import { score } from "../../src/engine/score.js";
import type { SessionState } from "../../src/engine/state.js";
import { findScenario, scenarios } from "../../src/scenarios/index.js";
import { playthroughs } from "../../src/scenarios/dial-tone/playthroughs.js";
import { sc } from "../engine/helpers.js";

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);
const names = Object.keys(playthroughs) as (keyof typeof playthroughs)[];

describe("Dial Tone scripted playthroughs", () => {
  it("ideal: resolves, scores 85 or more with every seed, and no consequence beat fires", () => {
    for (const seed of SEEDS) {
      const { state } = play(sc, playthroughs.ideal, { seed });
      expect(state.status).toBe("resolved");
      expect(score(sc, state).overall).toBeGreaterThanOrEqual(85);
      for (const consequence of [
        "cto-missed",
        "counsel-attack",
        "counsel-basis",
        "press-publish-harsh",
        "regulator-calls",
      ]) {
        expect(state.firedBeats).not.toContain(consequence);
      }
    }
  });

  it("poor: chases the red herrings, spikes the damage, and the regulator calls", () => {
    const { state } = play(sc, playthroughs.poor);
    expect(state.status).toBe("timeout");
    expect(score(sc, state).dimensions.containment.score).toBeLessThan(50);
    expect(Math.max(...(state.series.customersAffected ?? []))).toBe(780000);
    for (const beat of [
      "support-restart",
      "cto-restart",
      "counsel-attack",
      "counsel-basis",
      "cto-missed",
      "regulator-calls",
    ]) {
      expect(state.firedBeats).toContain(beat);
    }
  });

  it("dishonest: the press quotes the denial back exactly, and honesty and the cap show it", () => {
    const { state } = play(sc, playthroughs.dishonest);
    const story = state.threads.journalist?.messages.find(
      (m) => m.beatId === "press-publish-harsh",
    );
    expect(story?.text).toContain('"Emergency calls are unaffected."');
    expect(state.firedBeats).not.toContain("press-publish-fair");
    const result = score(sc, state);
    expect(result.dimensions.honesty.score).toBeLessThan(60);
    expect(result.overall).toBeLessThanOrEqual(69);
  });

  it("silent: nothing is resolved, the unconditional beats still fire, and the CTO takes over", () => {
    const { state } = play(sc, playthroughs.silent);
    expect(state.status).toBe("relieved");
    for (const beat of [
      "alert",
      "cto-eta",
      "support-tickets",
      "journalist-comment",
      "counsel-exposure",
      "comms-status",
      "hospital",
      "press-publish-fair",
    ]) {
      expect(state.firedBeats).toContain(beat);
    }
  });
});

describe("properties that must hold in every session", () => {
  const sessions: [string, number, SessionState][] = [];
  for (const name of names) {
    for (const seed of SEEDS)
      sessions.push([name, seed, play(sc, playthroughs[name], { seed }).state]);
  }

  it("is deterministic: the same seed and steps give an identical session", () => {
    for (const name of names) {
      const a = JSON.stringify(play(sc, playthroughs[name], { seed: 9 }).state);
      expect(JSON.stringify(play(sc, playthroughs[name], { seed: 9 }).state)).toBe(a);
    }
  });

  it("keeps every metric a non-negative whole number", () => {
    for (const [, , state] of sessions) {
      for (const values of Object.values(state.series)) {
        for (const v of values) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("keeps trust between 0 and 100", () => {
    for (const [, , state] of sessions) {
      for (const v of Object.values(state.trust)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("fires no beat twice and never both fires and skips one", () => {
    for (const [, , state] of sessions) {
      expect(new Set(state.firedBeats).size).toBe(state.firedBeats.length);
      expect(state.firedBeats.filter((b) => state.skippedBeats.includes(b))).toEqual([]);
    }
  });

  it("keeps the event log ordered with unique ids, and inside the scenario's length", () => {
    for (const [, , state] of sessions) {
      expect(new Set(state.log.map((e) => e.id)).size).toBe(state.log.length);
      state.log.reduce((last, e) => {
        expect(e.minute).toBeGreaterThanOrEqual(last);
        return e.minute;
      }, 0);
      expect(state.minute).toBeLessThanOrEqual(sc.lengthMinutes);
    }
  });

  it("ends every session in exactly one of the four endings", () => {
    for (const [, , state] of sessions) {
      expect(["resolved", "relieved", "timeout", "ended"]).toContain(state.status);
      expect(state.log.filter((e) => e.type === "ended")).toHaveLength(1);
    }
  });

  it("scores every session between 0 and 100", () => {
    for (const [, , state] of sessions) {
      const result = score(sc, state);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
    }
  });
});

describe("scenario data", () => {
  it("parses against the schema and is registered", () => {
    expect(ScenarioSchema.safeParse(sc).success).toBe(true);
    expect(scenarios[0]?.scenario).toBe(sc);
    expect(findScenario("dial-tone")?.scenario).toBe(sc);
    expect(findScenario("nope")).toBeUndefined();
  });

  it("has an ideal path made only of valid intents", () => {
    for (const step of sc.idealPath) expect(IntentSchema.safeParse(step.intent).success).toBe(true);
  });

  it("matches the design: nine investigations, five mitigations, five claim topics", () => {
    expect(sc.investigations).toHaveLength(9);
    expect(sc.mitigations).toHaveLength(5);
    expect(sc.claimTopics).toHaveLength(5);
    expect(sc.mitigations.filter((m) => m.kind === "harmful").length).toBeGreaterThanOrEqual(1);
    expect(sc.clues.filter((c) => c.kind === "redHerring").length).toBeGreaterThanOrEqual(2);
  });
});
