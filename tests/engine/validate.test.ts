import { describe, expect, it } from "vitest";
import { say } from "../../src/engine/playthrough.js";
import type { Scenario } from "../../src/engine/schema.js";
import { numbersIn, validateScenario } from "../../src/engine/validate.js";
import { playthroughs } from "../../src/scenarios/dial-tone/playthroughs.js";
import { sc } from "./helpers.js";

const check = (change: (copy: Scenario) => void) => {
  const copy = structuredClone(sc);
  change(copy);
  return validateScenario({ scenario: copy, playthroughs }).errors;
};

describe("scenario validator", () => {
  it("accepts Dial Tone", () => {
    const report = validateScenario({ scenario: sc, playthroughs });
    expect(report.errors).toEqual([]);
    expect(report.notes[0]).toContain("resolves in minute");
  });

  it("rejects a scenario that does not match the schema", () => {
    const errors = check((s) => {
      (s as { title: unknown }).title = "";
    });
    expect(errors[0]).toMatch(/^schema: title/);
  });

  it("rejects an unknown id, wherever it appears", () => {
    expect(check((s) => void (s.investigations[0]!.reveals = ["ghost"]))).toContainEqual(
      expect.stringContaining('unknown clue "ghost"'),
    );
    expect(check((s) => void (s.beats[1]!.from = "ghost"))).toContainEqual(
      expect.stringContaining('unknown stakeholder "ghost"'),
    );
    expect(
      check((s) => void (s.endings.resolvedWhen = { type: "clue", id: "ghost" })),
    ).toContainEqual(expect.stringContaining("endings.resolvedWhen"));
    expect(check((s) => void (s.mitigations[0]!.onComplete.mode = "ghost"))).toContainEqual(
      expect.stringContaining('unknown mode "ghost"'),
    );
    expect(
      check(
        (s) =>
          void (s.idealPath[0] = { atMinute: 0, intent: { kind: "investigate", id: "ghost" } }),
      ),
    ).toContainEqual(expect.stringContaining("idealPath[0]"));
  });

  it("rejects duplicate ids", () => {
    expect(check((s) => void s.clues.push({ ...s.clues[0]! }))).toContainEqual(
      expect.stringContaining("duplicate id"),
    );
  });

  it("rejects a clue that nothing reveals", () => {
    const errors = check((s) => {
      s.clues.push({ id: "orphan", kind: "true", fact: "A fact.", leakTerms: ["x"] });
    });
    expect(errors).toContainEqual("clue orphan: no investigation reveals it");
  });

  it("rejects an investigation whose requirement can never be met", () => {
    // auth-changes needs the very clue that only auth-changes can reveal.
    const errors = check((s) => {
      const inv = s.investigations.find((i) => i.id === "auth-changes")!;
      inv.requires = { type: "clue", id: "cert-rotation-0152" };
    });
    expect(errors).toContainEqual("investigation auth-changes: its requirement can never be met");
    const mitigationErrors = check((s) => {
      s.mitigations[0]!.requires = { type: "mitigation", id: s.mitigations[0]!.id };
    });
    expect(mitigationErrors.join(" ")).toContain("mitigation rollback-bundle");
  });

  it("rejects too few example phrasings", () => {
    expect(check((s) => void (s.directives[0]!.examples = ["only one"]))).toContainEqual(
      expect.stringContaining("needs at least 5 example phrasings"),
    );
  });

  it("rejects fallback text with a number that is not in its facts", () => {
    const errors = check((s) => void (s.beats[0]!.fallbackText = "ALERT: 9999 devices are down."));
    expect(errors).toContainEqual('beat alert: the number "9999" is not in its facts');
  });

  it("rejects an ideal path that does not resolve the incident", () => {
    const broken = { ...playthroughs, ideal: playthroughs.ideal.slice(0, 3) };
    const report = validateScenario({ scenario: sc, playthroughs: broken });
    expect(report.errors.join(" ")).toContain("not resolved");
  });

  it("rejects a scenario where doing nothing resolves it", () => {
    const errors = check((s) => {
      s.endings.resolvedWhen = { type: "minuteAtLeast", value: 1 };
    });
    expect(errors.join(" ")).toContain("doing nothing resolves");
  });

  it("rejects a harmful mitigation that is not actually harmful", () => {
    const errors = check((s) => {
      const harmful = s.mitigations.find((m) => m.id === "restart-all-auth")!;
      harmful.onComplete.mode = "recovered";
    });
    expect(errors).toContainEqual(expect.stringContaining("does not make containment worse"));
  });

  it("rejects a beat that never fires in any scripted playthrough", () => {
    const errors = check((s) => {
      s.beats.push({
        id: "unreachable",
        from: "cto",
        channel: "chat",
        when: { atMinute: 500 },
        purpose: "never",
        facts: [],
        fallbackText: "Never.",
      });
    });
    expect(errors).toContainEqual("beat unreachable: never fires in any scripted playthrough");
  });

  it("rejects two messages from one person in the same minute on the ideal path", () => {
    const errors = check((s) => {
      for (const id of ["double-a", "double-b"]) {
        s.beats.push({
          id,
          from: "support",
          channel: "chat",
          when: { atMinute: 4 },
          purpose: "p",
          facts: [],
          fallbackText: "Hello.",
        });
      }
    });
    expect(errors.join(" ")).toContain("two messages from support in minute 4");
  });

  it("rejects a harmful mitigation that cannot be applied in the test run", () => {
    const errors = check((s) => {
      s.mitigations.find((m) => m.id === "restart-all-auth")!.requires = {
        type: "minuteAtLeast",
        value: 80,
      };
    });
    expect(errors).toContainEqual(expect.stringContaining("could not be applied"));
  });
});

describe("numbersIn", () => {
  it("finds digits and clock times and ignores placeholders", () => {
    expect(numbersIn("At 02:45, {tickets} tickets and 6 of 12 nodes")).toEqual([
      "02:45",
      "6",
      "12",
    ]);
    expect(numbersIn("no numbers here")).toEqual([]);
  });
});

describe("play helper", () => {
  it("moves the clock to a step's minute before applying it", () => {
    const steps = [say(5, { kind: "other" })];
    expect(steps[0]?.atMinute).toBe(5);
  });
});
