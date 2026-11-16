import { describe, expect, it } from "vitest";
import {
  boardView,
  control,
  deserialise,
  dismiss,
  feedFrom,
  MAX_INPUT,
  newGame,
  pick,
  serialise,
  setPaused,
  submit,
  threadViews,
  unansweredCount,
  type Game,
} from "../../src/client/app/game.js";
import { buildDebrief } from "../../src/engine/debrief.js";
import type { EngineEvent } from "../../src/engine/state.js";
import { dialTone } from "../../src/scenarios/dial-tone/scenario.js";
import { resolvedPlay, SEED } from "./typed-play.js";

const start = () => newGame(dialTone, SEED);
const tick = (game: Game, minutes: number) => {
  let g = game;
  for (let n = 0; n < minutes; n++) g = control(dialTone, g, { type: "tick", minutes: 1 });
  return g;
};

describe("a new game", () => {
  it("opens with the alert in the log and nothing pending", () => {
    const g = start();
    expect(g.scenarioId).toBe("dial-tone");
    expect(g.seed).toBe(SEED);
    expect(g.pending).toBeNull();
    expect(g.paused).toBe(false);
    expect(g.feed.some((f) => f.who === "alert" && f.signal)).toBe(true);
  });

  it("is the same for the same seed", () => {
    expect(start().feed).toEqual(start().feed);
  });
});

describe("typing", () => {
  it("logs an order as typed, then how it was read, then Mika's answer", () => {
    const g = submit(dialTone, start(), "find out what changed on auth-core");
    const added = g.feed.slice(start().feed.length).map((f) => [f.who, f.text]);
    expect(added).toEqual([
      ["you", "find out what changed on auth-core"],
      ["read", "Find out what changed on auth-core"],
      ["mika", "on it - Find out what changed on auth-core."],
    ]);
    expect(g.session.task?.id).toBe("auth-changes");
  });

  it("does not repeat an order typed exactly as its label", () => {
    const g = submit(dialTone, start(), "Find out what changed on auth-core");
    expect(g.feed.filter((f) => f.who === "read")).toEqual([]);
    expect(g.feed.filter((f) => f.who === "you")).toHaveLength(1);
  });

  it("logs a message once, addressed to the person", () => {
    const g = submit(dialTone, start(), "No ETA yet. I will update you in ten minutes.", "cto");
    const mine = g.feed.filter((f) => f.who === "you");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.text).toBe("To Ramon Villareal: No ETA yet. I will update you in ten minutes.");
    expect(g.feed.some((f) => f.who === "note" && f.text.startsWith("You promised"))).toBe(true);
  });

  it("asks before acting on an unclear order, and no time passes", () => {
    const g = submit(dialTone, start(), "restart");
    expect(g.pending?.kind).toBe("choose");
    expect(g.pending?.typed).toBe("restart");
    expect(g.session.minute).toBe(0);
    expect(g.feed).toEqual(start().feed);
  });

  it("acts on the reading the player picks, and shows what they typed", () => {
    const asked = submit(dialTone, start(), "restart");
    const g = pick(dialTone, asked, 0);
    expect(g.pending).toBeNull();
    expect(g.session.task?.id).toBe("restart-all-auth");
    const added = g.feed.slice(asked.feed.length);
    expect(added[0]).toMatchObject({ who: "you", text: "restart" });
    expect(added[1]).toMatchObject({ who: "read" });
  });

  it("ignores a pick that is not on offer", () => {
    const asked = submit(dialTone, start(), "restart");
    expect(pick(dialTone, asked, 9)).toBe(asked);
    expect(pick(dialTone, start(), 0).feed).toEqual(start().feed);
  });

  it("can drop the question", () => {
    const g = dismiss(submit(dialTone, start(), "restart"));
    expect(g.pending).toBeNull();
    expect(g.session.minute).toBe(0);
  });

  it("offers the nearest options when nothing matches, at the cost of one minute", () => {
    const g = submit(dialTone, start(), "asdf qwer zxcv");
    expect(g.pending?.kind).toBe("suggest");
    expect(g.pending?.candidates.length).toBeGreaterThan(0);
    expect(g.session.minute).toBe(1);
    expect(g.session.task).toBeNull();
    expect(g.feed.slice(-2).map((f) => [f.who, f.text.slice(0, 14)])).toEqual([
      ["you", "asdf qwer zxcv"],
      ["system", "That did not m"],
    ]);
  });

  it("ignores empty input and cuts very long input", () => {
    expect(submit(dialTone, start(), "   ")).toEqual(start());
    const long = submit(dialTone, start(), "x".repeat(MAX_INPUT * 4));
    expect(long.session.minute).toBeLessThanOrEqual(1);
    expect(long.session.task).toBeNull();
  });

  it("changes nothing once the incident is over", () => {
    const ended = control(dialTone, start(), { type: "end" });
    expect(ended.session.status).toBe("ended");
    expect(submit(dialTone, ended, "look at the overall picture")).toBe(ended);
    expect(control(dialTone, ended, { type: "wait" })).toBe(ended);
    expect(pick(dialTone, { ...ended, pending: { kind: "choose", candidates: [] } }, 0)).toEqual({
      ...ended,
      pending: { kind: "choose", candidates: [] },
    });
  });
});

describe("the clock", () => {
  it("moves one minute per idle tick", () => {
    expect(tick(start(), 3).session.minute).toBe(3);
  });

  it("stands still while paused, and moves again after", () => {
    const paused = setPaused(start(), true);
    expect(tick(paused, 5).session.minute).toBe(0);
    expect(tick(setPaused(paused, false), 2).session.minute).toBe(2);
  });

  it("keeps a question open across an idle tick", () => {
    const asked = submit(dialTone, start(), "restart");
    const later = tick(asked, 1);
    expect(later.pending).toEqual(asked.pending);
    expect(later.session.minute).toBe(1);
  });

  it("closes a question when the player waits instead", () => {
    const asked = submit(dialTone, start(), "restart");
    expect(control(dialTone, asked, { type: "wait" }).pending).toBeNull();
  });
});

describe("the board", () => {
  it("starts with a clock, a severity in words and unknown figures", () => {
    const view = boardView(dialTone, start().session);
    expect(view.clock).toBe(dialTone.startClock);
    expect(view.elapsed).toBe(0);
    expect(["Normal", "Incident running", "Severe"]).toContain(view.severityWord);
    expect(view.systems.length).toBe(dialTone.systems.length);
    expect(view.metrics.some((m) => m.value === null)).toBe(true);
    expect(view.task).toBeNull();
    expect(view.queued).toBeNull();
  });

  it("shows the running task with its time left, and the one queued behind it", () => {
    let g = submit(dialTone, start(), "roll back the certificate bundle on the bad nodes");
    g = submit(dialTone, g, "look at the traffic spike");
    const view = boardView(dialTone, g.session);
    expect(view.task?.label).toMatch(/^Roll back the certificate bundle/);
    expect(view.task?.minutesLeft).toBeGreaterThan(0);
    expect(view.queued).toBe("Look at the traffic spike");
  });

  it("logs the words of an order that is turned down, then the reason", () => {
    const g = submit(dialTone, start(), "check whether emergency calls were affected");
    expect(g.session.task).toBeNull();
    expect(g.feed.slice(-2).map((f) => f.who)).toEqual(["you", "mika"]);
    expect(g.feed.at(-2)?.text).toBe("check whether emergency calls were affected");
  });

  it("turns an unknown figure into a number once it is learned", () => {
    const before = boardView(dialTone, start().session);
    let g = start();
    for (const step of resolvedPlay) g = submit(dialTone, g, step.text, step.thread);
    const after = boardView(dialTone, g.session);
    const learned = after.metrics.filter(
      (m) => m.value !== null && before.metrics.find((b) => b.id === m.id)?.value === null,
    );
    expect(learned.length).toBeGreaterThan(0);
    for (const m of learned) expect(m.value).toMatch(/^[\d,]+$/);
  });

  it("says whether a known figure is rising or falling, and nothing for an unknown one", () => {
    const opening = boardView(dialTone, start().session);
    expect(opening.metrics.filter((m) => m.value === null).every((m) => m.trend === "")).toBe(true);

    const trends = new Set<string>();
    let g = start();
    for (const step of resolvedPlay) {
      g = submit(dialTone, g, step.text, step.thread);
      for (const m of boardView(dialTone, g.session).metrics) {
        if (m.value !== null) trends.add(m.trend);
      }
    }
    expect([...trends].sort()).toEqual(["", "falling", "rising"]);
  });

  it("says severe in words after a harmful mitigation", () => {
    let g = pick(dialTone, submit(dialTone, start(), "restart"), 0);
    for (let n = 0; n < 12 && boardView(dialTone, g.session).severity < 2; n++) {
      g = control(dialTone, g, { type: "wait" });
    }
    const view = boardView(dialTone, g.session);
    expect(view.severity).toBe(2);
    expect(view.severityWord).toBe("Severe");
  });
});

describe("the inbox", () => {
  it("has one thread per person, without the engineer, and marks the press", () => {
    const views = threadViews(dialTone, start().session);
    expect(views.map((v) => v.id)).not.toContain("engineer");
    expect(views).toHaveLength(dialTone.stakeholders.length - 1);
    expect(views.filter((v) => v.press).map((v) => v.id)).toEqual(["journalist"]);
    expect(unansweredCount(views)).toBe(0);
    expect(views.every((v) => v.preview === "" && v.lastMinute === -1)).toBe(true);
  });

  it("marks a thread unanswered, then overdue, in words", () => {
    let g = start();
    const seen = new Set<string>();
    for (let n = 0; n < 40 && g.session.status === "running"; n++) {
      g = tick(g, 1);
      const cto = threadViews(dialTone, g.session).find((v) => v.id === "cto");
      if (cto) seen.add(cto.state);
      if (cto?.state === "Overdue") {
        expect(cto.waitingMinutes).toBeGreaterThan(0);
        break;
      }
    }
    expect([...seen]).toEqual(["", "Unanswered", "Overdue"]);
  });

  it("clears the mark when the player replies, and lists the promise with its due time", () => {
    let g = tick(start(), 4);
    expect(unansweredCount(threadViews(dialTone, g.session))).toBeGreaterThan(0);
    g = submit(dialTone, g, "No ETA yet. I will update you in ten minutes.", "cto");
    const cto = threadViews(dialTone, g.session).find((v) => v.id === "cto");
    expect(cto?.state).toBe("");
    expect(cto?.messages.at(-1)).toMatchObject({ mine: true });
    expect(cto?.messages[0]?.clock).toMatch(/^\d\d:\d\d$/);
    expect(cto?.promises).toEqual([{ what: "an update", due: "02:28", status: "open" }]);
    expect(cto?.nextDue).toEqual({ clock: "02:28", soon: false });
  });

  it("says when a promise is due soon, and stops once it is kept", () => {
    let g = submit(dialTone, start(), "No ETA yet. I will update you in ten minutes.", "cto");
    const cto = () => threadViews(dialTone, g.session).find((v) => v.id === "cto");
    expect(cto()?.nextDue?.soon).toBe(false);
    g = tick(g, 5);
    expect(cto()?.nextDue?.soon).toBe(true);
    g = submit(dialTone, g, "Still no ETA, we are looking at auth-core.", "cto");
    expect(cto()?.promises[0]?.status).toBe("kept");
    expect(cto()?.nextDue).toBeNull();
    expect(threadViews(dialTone, g.session).find((v) => v.id === "support")?.nextDue).toBeNull();
  });

  it("points from the log to the thread that wrote", () => {
    const g = tick(start(), 4);
    const pointer = g.feed.find((f) => f.who === "inbox");
    expect(pointer).toMatchObject({ threadId: "cto", text: "Ramon Villareal wrote to you." });
  });
});

describe("the log", () => {
  const event = (type: string, text: string, data?: Record<string, unknown>): EngineEvent =>
    ({ id: `e-${type}`, minute: 2, type, text, data }) as EngineEvent;

  it("marks alerts, broken promises and surfaced claims as needing attention", () => {
    const feed = feedFrom(dialTone, [
      event("alert", "ALERT"),
      event("commitment_broken", "You broke your word"),
      event("claim_surfaced", "The story quotes you"),
      event("commitment_kept", "You kept your word"),
    ]);
    expect(feed.map((f) => Boolean(f.signal))).toEqual([true, true, true, false]);
  });

  it("names the task lines as Mika's and leaves hidden events out", () => {
    const feed = feedFrom(dialTone, [
      event("task_queued", "Mika: I'll do that next."),
      event("task_cancelled", "Mika: stopped."),
      event("trust", "trust up"),
      event("clue_revealed", ""),
      event("refused", "Mika: that is already done."),
      event("message", "hello", { from: "nobody" }),
    ]);
    expect(feed.map((f) => [f.who, f.text])).toEqual([
      ["mika", "I'll do that next."],
      ["mika", "stopped."],
      ["mika", "that is already done."],
      ["inbox", "nobody wrote to you."],
    ]);
  });
});

describe("saving", () => {
  const ids = ["dial-tone"];

  it("round-trips a game", () => {
    const g = submit(dialTone, start(), "find out what changed on auth-core");
    expect(deserialise(serialise(g), ids)).toEqual(g);
  });

  it("continues a restored game exactly as the original would", () => {
    const g = submit(dialTone, start(), "find out what changed on auth-core");
    const restored = deserialise(serialise(g), ids);
    expect(restored).not.toBeNull();
    const a = control(dialTone, g, { type: "wait" });
    const b = control(dialTone, restored as Game, { type: "wait" });
    expect(b.session).toEqual(a.session);
  });

  it("refuses anything it did not write", () => {
    const g = start();
    expect(deserialise(null, ids)).toBeNull();
    expect(deserialise("", ids)).toBeNull();
    expect(deserialise("not json", ids)).toBeNull();
    expect(deserialise("42", ids)).toBeNull();
    expect(deserialise("null", ids)).toBeNull();
    expect(deserialise(JSON.stringify({ v: 99, game: g }), ids)).toBeNull();
    expect(deserialise(JSON.stringify({ v: 1 }), ids)).toBeNull();
    expect(deserialise(serialise(g), ["another"])).toBeNull();
    expect(deserialise(JSON.stringify({ v: 1, game: { ...g, feed: "no" } }), ids)).toBeNull();
    expect(deserialise(JSON.stringify({ v: 1, game: { ...g, session: {} } }), ids)).toBeNull();
  });
});

describe("a whole session, typed", () => {
  it("ends resolved with a score of 85 or more and never needs a second guess", () => {
    let g = start();
    for (const step of resolvedPlay) {
      expect(g.session.status).toBe("running");
      g = submit(dialTone, g, step.text, step.thread);
      expect(g.pending, `"${step.text}" was not read cleanly`).toBeNull();
    }
    expect(g.session.status).toBe("resolved");
    expect(buildDebrief(dialTone, g.session).score.overall).toBeGreaterThanOrEqual(85);
    expect(g.feed.at(-1)).toMatchObject({ who: "system", text: "The incident is resolved." });
  });
});
