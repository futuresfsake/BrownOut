import { describe, expect, it } from "vitest";
import { clockAt, formatClock, parseClock } from "../../src/engine/clock.js";
import { evalMode, interpolate } from "../../src/engine/curves.js";
import { jitter, nextRandom } from "../../src/engine/rng.js";
import type { Segment } from "../../src/engine/schema.js";

describe("clock", () => {
  it("parses and formats clock times", () => {
    expect(parseClock("02:14")).toBe(134);
    expect(formatClock(134)).toBe("02:14");
  });

  it("counts on from the scenario start and wraps past midnight", () => {
    expect(clockAt("02:14", 16)).toBe("02:30");
    expect(clockAt("23:50", 20)).toBe("00:10");
    expect(formatClock(-10)).toBe("23:50");
  });
});

describe("rng", () => {
  it("is deterministic and stays in range", () => {
    const [a, s1] = nextRandom(42);
    const [b] = nextRandom(42);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(nextRandom(s1)[0]).not.toBe(a);
  });

  it("gives jitter within the spread, and covers both ends over many draws", () => {
    let state = 7;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const [offset, next] = jitter(state, 2);
      expect(offset).toBeGreaterThanOrEqual(-2);
      expect(offset).toBeLessThanOrEqual(2);
      seen.add(offset);
      state = next;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });
});

describe("curves", () => {
  const points: [number, number][] = [
    [0, 100],
    [10, 200],
    [20, 200],
  ];

  it("interpolates, clamps before the start and holds after the end", () => {
    expect(interpolate(points, -5)).toBe(100);
    expect(interpolate(points, 5)).toBe(150);
    expect(interpolate(points, 15)).toBe(200);
    expect(interpolate(points, 99)).toBe(200);
  });

  it("rejects an empty curve and handles a vertical step", () => {
    expect(() => interpolate([], 1)).toThrow();
    expect(
      interpolate(
        [
          [0, 1],
          [5, 1],
          [5, 9],
          [10, 9],
        ],
        5,
      ),
    ).toBe(1);
  });

  const modes: Record<string, Segment[]> = {
    base: [{ kind: "curve", points: [[0, 100]] }],
    ramp: [{ kind: "ramp", over: 10, to: 0 }],
    factor: [{ kind: "ramp", over: 4, toFactor: 0.5 }, { kind: "hold" }],
    spike: [
      { kind: "ramp", over: 1, to: 1000 },
      { kind: "hold", for: 4 },
      { kind: "follow", mode: "base", multiplier: 2 },
    ],
    loop: [{ kind: "follow", mode: "loop" }],
  };
  const from = { minute: 10, value: 80 };

  it("ramps linearly from the value at the switch, then holds the target", () => {
    expect(evalMode(modes, "ramp", 10, from)).toBe(80);
    expect(evalMode(modes, "ramp", 15, from)).toBe(40);
    expect(evalMode(modes, "ramp", 99, from)).toBe(0);
  });

  it("supports a target given as a factor of the starting value", () => {
    expect(evalMode(modes, "factor", 12, from)).toBe(60);
    expect(evalMode(modes, "factor", 50, from)).toBe(40);
  });

  it("runs segments in order: ramp, hold for a time, then follow another mode", () => {
    expect(evalMode(modes, "spike", 10.5, from)).toBe(540);
    expect(evalMode(modes, "spike", 13, from)).toBe(1000);
    expect(evalMode(modes, "spike", 20, from)).toBe(200);
  });

  it("fails clearly on an unknown or endlessly nested mode", () => {
    expect(() => evalMode(modes, "nope", 1, from)).toThrow(/unknown mode/);
    expect(() => evalMode(modes, "loop", 1, from)).toThrow(/nest/);
  });
});
