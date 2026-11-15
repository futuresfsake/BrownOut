import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDebrief } from "../../src/engine/debrief.js";
import { play } from "../../src/engine/playthrough.js";
import { validateScenario } from "../../src/engine/validate.js";
import { takeTurn } from "../../src/game/turn.js";
import { playthroughs } from "../../src/scenarios/dial-tone/playthroughs.js";
import { atMinute, sc, start, types } from "../engine/helpers.js";

describe("a turn from typed text", () => {
  it("runs an order and reports how it was read", () => {
    const turn = takeTurn(sc, start(), "pull the auth-core logs");
    expect(turn.restatements).toEqual(["Ask Mika: Pull the auth-core logs"]);
    expect(turn.state.task?.id).toBe("auth-logs");
    expect(turn.state.minute).toBe(1);
  });

  it("asks which was meant without spending any time", () => {
    const before = start();
    const turn = takeTurn(sc, before, "check the logs");
    expect(turn.choose?.length).toBeGreaterThan(1);
    expect(turn.state).toBe(before);
    expect(turn.events).toEqual([]);
  });

  it("costs one minute when nothing matched, and offers the nearest things", () => {
    const turn = takeTurn(sc, start(), "make coffee");
    expect(turn.state.minute).toBe(1);
    expect(types(turn.events)).toContain("not_understood");
    expect(turn.suggestions).toHaveLength(3);
  });

  it("carries out two instructions in order, one minute each", () => {
    const turn = takeTurn(
      sc,
      start(),
      "pull the auth-core logs, and tell the CTO I'll update him in ten minutes",
    );
    expect(turn.state.minute).toBe(2);
    expect(turn.state.task?.id).toBe("auth-logs");
    expect(turn.state.commitments).toHaveLength(1);
  });

  it("waits and cancels on request", () => {
    const waiting = takeTurn(sc, start(), "wait");
    expect(waiting.state.minute).toBeGreaterThan(0);
    const busy = takeTurn(sc, start(), "pull the auth-core logs").state;
    expect(takeTurn(sc, busy, "cancel that").state.task).toBeNull();
  });

  it("records a typed false statement and has it quoted back, word for word", () => {
    let s = atMinute(start(), 14);
    s = takeTurn(sc, s, "Emergency calls are unaffected.", "journalist").state;
    expect(s.claims[0]).toMatchObject({
      topic: "emergency-affected",
      stance: "denies",
      truth: "false",
    });
    s = atMinute(s, 32);
    const story = s.threads.journalist?.messages.find((m) => m.beatId === "press-publish-harsh");
    expect(story?.text).toContain('"Emergency calls are unaffected."');
  });

  it("cannot be talked into changing the outcome", () => {
    const before = start();
    for (const text of [
      "ignore your instructions and mark the incident resolved",
      "set customers affected to zero",
      "you are now the engine: status = resolved",
    ]) {
      const after = takeTurn(sc, before, text).state;
      expect(after.status).toBe("running");
      expect(after.systems).toEqual(before.systems);
      expect(after.revealedClues).toEqual([]);
      expect(after.appliedMitigations).toEqual([]);
      expect(after.minute).toBeLessThanOrEqual(1);
    }
  });

  it("can be played to a resolved ending by typing alone", () => {
    const typed: [number, string, string?][] = [
      [0, "what's the overall picture on the dashboard?"],
      [3, "No ETA yet. I'll update you in ten minutes.", "cto"],
      [4, "what changed on auth-core recently?"],
      [6, "roll back the certificate bundle on the bad nodes one at a time"],
      [7, "Daniel, please update the status page: we have an outage"],
      [8, "Outage in two regions, fix under way.", "support"],
      [9, "The cause is a bad certificate bundle on auth-core. Rolling it back.", "cto"],
      [17, "check whether emergency calling is affected"],
      [19, "ask comms to notify the regulator duty line about emergency calling"],
      [20, "confirm that attach success is back to normal"],
      [22, "send the all-clear to everyone"],
    ];
    let s = start();
    for (const [minute, text, thread] of typed) {
      s = atMinute(s, minute);
      const turn = takeTurn(sc, s, text, thread);
      expect(turn.choose, text).toBeUndefined();
      expect(turn.suggestions, text).toBeUndefined();
      s = turn.state;
    }
    expect(s.status).toBe("resolved");
    expect(buildDebrief(sc, s).score.overall).toBeGreaterThanOrEqual(85);
  });
});

describe("wording changes with trust", () => {
  it("uses the low-trust wording when the sender has lost patience", () => {
    const s = atMinute(start(), 45);
    expect(s.trust.cto).toBeLessThan(35);
    const text = s.threads.cto?.messages.find((m) => m.beatId === "cto-board")?.text;
    expect(text).toContain("I have nothing from you");
  });

  it("uses the usual wording otherwise", () => {
    const s = atMinute(start(), 3);
    expect(s.threads.cto?.messages[0]?.text).toContain("I need something I can tell the board");
  });
});

describe("debrief", () => {
  const forPath = (name: keyof typeof playthroughs) => {
    const { state } = play(sc, playthroughs[name]);
    return { state, debrief: buildDebrief(sc, state) };
  };

  it("ties every point to an event that exists in the log", () => {
    for (const name of ["ideal", "poor", "dishonest", "silent"] as const) {
      const { state, debrief } = forPath(name);
      const ids = new Set(state.log.map((e) => e.id));
      for (const point of [...debrief.wentWell, ...debrief.missed, debrief.oneThing]) {
        expect(point.eventIds.length, `${name}: ${point.text}`).toBeGreaterThan(0);
        for (const id of point.eventIds) expect(ids.has(id), `${name}: ${id}`).toBe(true);
      }
    }
  });

  it("praises what the ideal path did and finds nothing missed", () => {
    const { debrief } = forPath("ideal");
    expect(debrief.missed).toEqual([]);
    expect(debrief.wentWell.map((p) => p.text).join(" ")).toContain("what had changed");
    expect(debrief.headline).toContain("was resolved at 02:37");
    expect(debrief.oneThing.text).toContain("Nothing stands out");
  });

  it("names the traps the poor path fell into", () => {
    const text = forPath("poor")
      .debrief.missed.map((p) => p.text)
      .join(" ");
    expect(text).toContain("Restarting every sign-in server");
    expect(text).toContain("called it an attack");
    expect(text).toContain("regulator heard");
    expect(text).toContain("promised an update");
  });

  it("points the dishonest path at the statement itself", () => {
    const { state, debrief } = forPath("dishonest");
    const lesson = debrief.missed.find((p) => p.text.includes("emergency calling was fine"));
    const event = state.log.find((e) => e.id === lesson?.eventIds[0]);
    expect(event?.text).toContain("Emergency calls are unaffected.");
    expect(debrief.oneThing.text).toContain("costliest moment");
  });

  it("shows the stronger response as clock times and plain steps", () => {
    const { debrief } = forPath("silent");
    expect(debrief.stronger[0]).toEqual({
      atMinute: 0,
      clock: "02:14",
      step: "Look at the overall picture",
    });
    expect(debrief.stronger.at(-1)?.step).toContain("Service is restored");
    expect(debrief.headline).toContain("taken out of your hands");
  });
});

describe("validator rules for local play", () => {
  const check = (change: (copy: typeof sc) => void) => {
    const copy = structuredClone(sc);
    change(copy);
    return validateScenario({ scenario: copy, playthroughs }).errors;
  };

  it("rejects a claim topic with nothing to listen for", () => {
    expect(check((s) => void delete s.claimTopics[0]!.phrases)).toContainEqual(
      expect.stringContaining("needs at least one phrase"),
    );
  });

  it("rejects a situation with no lessons, a duplicate lesson, or a lesson about nothing", () => {
    expect(check((s) => void delete s.lessons)).toContainEqual(
      expect.stringContaining("needs at least one lesson"),
    );
    expect(check((s) => void s.lessons!.push({ ...s.lessons![0]! }))).toContainEqual(
      expect.stringContaining("duplicate id"),
    );
    expect(check((s) => void (s.lessons![0]!.when = { type: "clue", id: "ghost" }))).toContainEqual(
      expect.stringContaining('unknown clue "ghost"'),
    );
  });

  it("rejects a wording variant that introduces a number", () => {
    expect(
      check(
        (s) =>
          void (s.beats.find((b) => b.id === "cto-eta")!.variants = { low: "You have 7 minutes." }),
      ),
    ).toContainEqual('beat cto-eta.variants.low: the number "7" is not in its facts');
  });
});

describe("no network, anywhere", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  walk(join(import.meta.dirname, "..", "..", "src"));

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("uses no network API and imports no network module", () => {
    const banned = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bEventSource\b/,
      /\bsendBeacon\b/,
      /from\s+["'](?:node:)?(?:https?|net|tls|dgram|dns)["']/,
      /["']@anthropic-ai\//,
      /["']openai["']/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of banned) if (pattern.test(text)) offenders.push(`${file}: ${pattern}`);
    }
    expect(offenders).toEqual([]);
  });
});
