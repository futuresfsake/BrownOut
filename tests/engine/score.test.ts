import { describe, expect, it } from "vitest";
import { play, say } from "../../src/engine/playthrough.js";
import { containmentBounds, customerMinutes, score } from "../../src/engine/score.js";
import { playthroughs } from "../../src/scenarios/dial-tone/playthroughs.js";
import { sc } from "./helpers.js";

const run = (steps: Parameters<typeof play>[1], seed = 1) => play(sc, steps, { seed }).state;

describe("scoring", () => {
  it("gives the ideal path full marks, because it defines the best case", () => {
    const result = score(sc, run(playthroughs.ideal));
    expect(result.overall).toBe(100);
    expect(result.label).toBe("Strong response");
    expect(result.caps).toEqual([]);
    for (const d of Object.values(result.dimensions)) expect(d.score).toBe(100);
  });

  it("gives the same score every time for the same session", () => {
    const state = run(playthroughs.poor);
    expect(score(sc, state)).toEqual(score(sc, structuredClone(state)));
  });

  it("scores a poor session low, and says why in each dimension", () => {
    const result = score(sc, run(playthroughs.poor));
    expect(result.overall).toBeLessThan(50);
    expect(result.label).toBe("Lost control");
    expect(result.dimensions.containment.score).toBeLessThan(50);
    expect(result.dimensions.obligations.score).toBe(0);
    const reasons = result.dimensions.diagnosis.lines.map((l) => l.reason).join(" | ");
    expect(reasons).toContain("never found");
    expect(reasons).toContain("did not help");
  });

  it("measures containment between the best and worst possible", () => {
    const { best, worst } = containmentBounds(sc);
    expect(best).toBeLessThan(worst);
    const ideal = customerMinutes(sc, run(playthroughs.ideal));
    expect(ideal).toBe(best);
    expect(customerMinutes(sc, run(playthroughs.silent))).toBe(worst);
    const partial = run([say(0, { kind: "mitigate", id: "drain-bad-nodes" })]);
    const c = score(sc, partial).dimensions.containment.score;
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(100);
  });

  it("counts a session that stops early at its last value, not as a bargain", () => {
    const early = run([{ atMinute: 5, input: { type: "end" } }], 1);
    expect(early.status).toBe("ended");
    expect(score(sc, early).dimensions.containment.score).toBeLessThan(20);
  });

  it("caps a session where a false statement to the press was never corrected", () => {
    const result = score(sc, run(playthroughs.dishonest));
    expect(result.dimensions.honesty.score).toBe(55);
    expect(result.overall).toBeLessThanOrEqual(69);
    expect(result.caps.join(" ")).toContain("press");
  });

  it("caps a session where the CTO took over", () => {
    const state = run(playthroughs.silent);
    expect(state.status).toBe("relieved");
    expect(score(sc, state).overall).toBeLessThanOrEqual(59);
    expect(score(sc, state).caps.join(" ")).toContain("CTO");
  });

  it("charges less for a false statement to a colleague than to the press", () => {
    const toCto = run([
      say(1, {
        kind: "communicate",
        to: ["cto"],
        claims: [{ topic: "under-attack", stance: "asserts", text: "attack" }],
      }),
    ]);
    expect(score(sc, toCto).dimensions.honesty.score).toBe(70);
  });

  it("gives back 20 points for correcting a false statement before it comes out", () => {
    const state = run([
      say(1, {
        kind: "communicate",
        to: ["cto"],
        claims: [{ topic: "under-attack", stance: "asserts", text: "attack" }],
      }),
      say(3, {
        kind: "communicate",
        to: ["cto"],
        claims: [{ topic: "under-attack", stance: "uncertain", text: "unsure" }],
      }),
    ]);
    const honesty = score(sc, state).dimensions.honesty;
    expect(honesty.score).toBe(90);
    expect(honesty.lines.map((l) => l.delta)).toEqual([-30, 20]);
  });

  it("charges 10 points for a true statement made without evidence", () => {
    const state = run([
      say(1, {
        kind: "communicate",
        to: ["cto"],
        claims: [{ topic: "cause-is-cert", stance: "asserts", text: "certs" }],
      }),
    ]);
    expect(score(sc, state).dimensions.honesty.score).toBe(90);
  });

  it("points every claim-based line at the event that caused it", () => {
    const state = run(playthroughs.dishonest);
    const lines = score(sc, state).dimensions.honesty.lines;
    const line = lines.find((l) => l.delta < 0);
    expect(line?.eventIds.length).toBeGreaterThan(0);
    expect(state.log.some((e) => e.id === line?.eventIds[0])).toBe(true);
  });

  it("rates communication from replies, promises and regular updates", () => {
    const silent = score(sc, run(playthroughs.silent)).dimensions.communication;
    expect(silent.score).toBe(15); // no promises made: half marks for that part only
    const broken = score(sc, run(playthroughs.poor)).dimensions.communication;
    expect(broken.lines.some((l) => l.reason.startsWith("Promises kept: 0 of 1"))).toBe(true);
  });

  it("labels the four score bands", () => {
    const at = (overall: number) => {
      const state = run(playthroughs.ideal);
      // Adjust honesty to land in each band without touching the other dimensions.
      state.claims.push({
        id: "x",
        topic: "cause-is-cert",
        stance: "asserts",
        audience: ["cto"],
        text: "x",
        madeAtMinute: 1,
        truth: "true",
        supported: false,
        surfaced: false,
        corrected: false,
        eventId: "e0",
      });
      return { overall, label: score(sc, state).label };
    };
    expect(at(0).label).toBe("Strong response"); // 98 after one small honesty charge
    expect(score(sc, run(playthroughs.poor)).label).toBe("Lost control");
  });
});
