// The room holds no game state of its own (FR-36): what it shows is worked out here from the
// same views the panels use, and that working-out is tested without a browser or a graphics card.
import { describe, expect, it } from "vitest";
import {
  boardView,
  control,
  newGame,
  setPaused,
  submit,
  threadViews,
  unansweredCount,
  type Game,
} from "../../src/client/app/game.js";
import {
  cuesFor,
  heardOf,
  lengthOf,
  SEEN_AS,
  TONES,
  type Cue,
} from "../../src/client/app/sound.js";
import {
  brightnessAt,
  brightnessOf,
  DIP_COUNT,
  FADE_MS,
  LEVELS,
} from "../../src/client/room/light.js";
import {
  paceStep,
  SLOW_FOR_MS,
  startPace,
  STILL_GAP_MS,
  type Pace,
} from "../../src/client/room/meter.js";
import {
  ease,
  fieldOfView,
  mix,
  MOVE_MS,
  neighbour,
  stationForKey,
  stationOf,
  STATIONS,
} from "../../src/client/room/stations.js";
import { flickerAt } from "../../src/client/room/light.js";
import { fit, wrap } from "../../src/client/room/textures.js";
import {
  describeRoom,
  headlineOf,
  outletOf,
  roomSignals,
  type RoomSignals,
} from "../../src/client/signals/room.js";
import { dialTone } from "../../src/scenarios/dial-tone/scenario.js";
import { resolvedPlay, SEED } from "./typed-play.js";

const start = () => newGame(dialTone, SEED);
const wait = (game: Game, times = 1) => {
  let g = game;
  for (let n = 0; n < times; n++) g = control(dialTone, g, { type: "wait" });
  return g;
};
const severityOf = (game: Game) => boardView(dialTone, game.session).severity;
const signalsOf = (game: Game): RoomSignals => {
  const board = boardView(dialTone, game.session);
  const threads = threadViews(dialTone, game.session);
  return roomSignals(board, threads, game.feed.length, {
    running: game.session.status === "running",
    paused: game.paused,
  });
};

/** The harmful restart, then waiting until the incident is severe. */
const severe = () => {
  let g = submit(dialTone, start(), "restart every auth-core node");
  for (let n = 0; n < 8 && severityOf(g) !== 2; n++) g = wait(g);
  return g;
};

const played = () => {
  let g = start();
  for (const step of resolvedPlay) g = submit(dialTone, g, step.text, step.thread);
  return g;
};

describe("what the room shows", () => {
  it("opens with the incident running: lights at level 1, everything else quiet", () => {
    const s = signalsOf(start());
    expect(s.level).toBe(1);
    expect(s.emergencyStrip).toBe(false);
    expect(s.phone).toBe("off");
    expect(s.phoneFrom).toBeNull();
    expect(s.tv).toEqual({ on: false, outlet: "", headline: "", waiting: "off" });
    expect(s.mikaLamp).toBe(false);
    expect(s.monitorCount).toBe(0);
    expect(s.clock).toMatchObject({ hours: 2, minutes: 14, text: "02:14", running: true });
  });

  it("lights Mika's lamp while a task runs and puts it out when the task ends", () => {
    const working = submit(dialTone, start(), "find out what changed on auth-core");
    expect(signalsOf(working).mikaLamp).toBe(true);
    const done = wait(working);
    expect(done.session.task).toBeNull();
    expect(signalsOf(done).mikaLamp).toBe(false);
  });

  it("lights the phone while a person is unanswered, and names who has waited longest", () => {
    const g = wait(start(), 2);
    const s = signalsOf(g);
    expect(s.phone).toBe("on");
    expect(s.phoneFrom).toBe("Ramon Villareal");
    expect(s.monitorCount).toBe(unansweredCount(threadViews(dialTone, g.session)));

    // Answering Ramon takes his name off the phone. Whether it goes dark depends on who else
    // is waiting, which is exactly what the inbox panel says.
    const answered = submit(dialTone, g, "No ETA yet. I will update you in ten minutes.", "cto");
    const after = signalsOf(answered);
    const stillWaiting = threadViews(dialTone, answered.session).filter(
      (t) => !t.press && t.state !== "",
    );
    expect(after.phoneFrom).not.toBe("Ramon Villareal");
    expect(after.phone === "off").toBe(stillWaiting.length === 0);
    expect(after.phoneFrom === null).toBe(stillWaiting.length === 0);
  });

  it("puts a named person in the room for each waiting thread, longest wait first", () => {
    const g = wait(start(), 2);
    const s = signalsOf(g);
    const waiting = threadViews(dialTone, g.session)
      .filter((t) => t.state !== "")
      .sort((a, b) => b.waitingMinutes - a.waitingMinutes);
    expect(s.visitors.length).toBe(Math.min(waiting.length, 3));
    expect(s.visitors.map((v) => v.name)).toEqual(waiting.slice(0, 3).map((t) => t.name));
    for (const v of s.visitors) {
      const thread = waiting.find((t) => t.name === v.name);
      expect(v.overdue).toBe(thread?.state === "Overdue");
    }
    expect(signalsOf(start()).visitors).toEqual([]);
  });

  it("agrees with the inbox panel at every step of a whole session", () => {
    let g = start();
    let lit = 0;
    let dark = 0;
    for (const step of resolvedPlay) {
      g = submit(dialTone, g, step.text, step.thread);
      const threads = threadViews(dialTone, g.session);
      const people = threads.filter((t) => !t.press && t.state !== "");
      const s = signalsOf(g);
      expect(s.phone === "off").toBe(people.length === 0);
      expect(s.phone === "overdue").toBe(people.some((t) => t.state === "Overdue"));
      expect(s.monitorCount).toBe(unansweredCount(threads));
      if (s.phone === "off") dark += 1;
      else lit += 1;
    }
    // The session has both: the lamp is not simply always on or always off.
    expect(lit).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
  });

  it("turns the lamp to overdue once someone has waited past their patience", () => {
    let g = wait(start(), 2);
    for (let n = 0; n < 30 && signalsOf(g).phone !== "overdue"; n++) {
      g = control(dialTone, g, { type: "tick", minutes: 1 });
    }
    expect(signalsOf(g).phone).toBe("overdue");
    expect(describeRoom(signalsOf(g))).toContain("is overdue");
  });

  it("dims to level 2 with the emergency strip when the incident is severe", () => {
    const s = signalsOf(severe());
    expect(s.level).toBe(2);
    expect(s.emergencyStrip).toBe(true);
    expect(s.board.severityWord.toLowerCase()).toContain("severe");
  });

  it("keeps the television off until the press writes, then shows their headline", () => {
    let g = severe();
    expect(signalsOf(start()).tv.on).toBe(false);
    for (let n = 0; n < 6 && !signalsOf(g).tv.on; n++) g = wait(g);
    const tv = signalsOf(g).tv;
    expect(tv.on).toBe(true);
    expect(tv.outlet).toBe("The Daily Circuit");
    expect(tv.headline.length).toBeGreaterThan(10);
    expect(tv.headline).not.toMatch(/^Carla/);
    expect(tv.waiting).toBe("on");
    // The press is not the phone: an unanswered reporter does not light it on their own.
    const people = threadViews(dialTone, g.session).filter((t) => !t.press && t.state !== "");
    expect(signalsOf(g).phone === "off").toBe(people.length === 0);
  });

  it("returns to full light after recovery, with the clock stopped at the end", () => {
    const s = signalsOf(played());
    expect(s.level).toBe(0);
    expect(s.emergencyStrip).toBe(false);
    expect(s.clock.running).toBe(false);
    expect(s.mikaLamp).toBe(false);
  });

  it("stops the clock while paused and says so", () => {
    const s = signalsOf(setPaused(start(), true));
    expect(s.clock.running).toBe(false);
    expect(describeRoom(s)).toContain("Clock 02:14, stopped.");
  });

  it("copies the board's systems and figures, marking the ones that changed", () => {
    const g = severe();
    const board = boardView(dialTone, g.session);
    const s = signalsOf(g);
    expect(s.board.systems.map((x) => x.label)).toEqual(board.systems.map((x) => x.label));
    expect(s.board.figures.map((x) => x.value)).toEqual(
      board.metrics.map((m) => m.value ?? "unknown"),
    );
    expect(s.board.figures.some((f) => f.changed)).toBe(board.metrics.some((m) => m.trend !== ""));
  });

  it("is the same for the same session", () => {
    expect(signalsOf(severe())).toEqual(signalsOf(severe()));
  });

  it("describes the room in one line for people who cannot see it", () => {
    expect(describeRoom(signalsOf(start()))).toBe(
      "Lights at level 1. Clock 02:14. Phone quiet. Television off. Mika's lamp off.",
    );
    const text = describeRoom(signalsOf(wait(severe(), 2)));
    expect(text).toContain("Lights at level 2, emergency strip on.");
    expect(text).toContain("Phone lit:");
  });
});

describe("headlines", () => {
  it("takes the first sentence and drops the name in front", () => {
    expect(
      headlineOf("Carla Whitlock, The Daily Circuit: Customers say it is down. Comment?"),
    ).toBe("Customers say it is down");
    expect(headlineOf("Is it true?")).toBe("Is it true?");
  });

  it("cuts a long sentence at a word, with an ellipsis", () => {
    const long = `Press: ${"word ".repeat(30)}end.`;
    const cut = headlineOf(long);
    expect(cut.length).toBeLessThanOrEqual(65);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/ …$/);
  });

  it("reads the outlet from a role", () => {
    expect(outletOf("Reporter, The Daily Circuit")).toBe("The Daily Circuit");
    expect(outletOf("Reporter")).toBe("Reporter");
  });
});

describe("stations", () => {
  it("has five, on keys 1 to 5, each with a name for its object", () => {
    expect(STATIONS.map((s) => s.key)).toEqual(["1", "2", "3", "4", "5"]);
    expect(STATIONS.map((s) => s.id)).toEqual(["desk", "log", "inbox", "board", "press"]);
    for (const s of STATIONS) expect(s.object.length).toBeGreaterThan(5);
    expect(stationOf("desk").panel).toBeNull();
    expect(STATIONS.filter((s) => s.panel !== null)).toHaveLength(4);
  });

  it("finds a station by key and ignores other keys", () => {
    expect(stationForKey("4")).toBe("board");
    expect(stationForKey("6")).toBeNull();
    expect(stationForKey("a")).toBeNull();
  });

  it("moves one along on a swipe and stops at the ends", () => {
    expect(neighbour("desk", 1)).toBe("log");
    expect(neighbour("log", -1)).toBe("desk");
    expect(neighbour("desk", -1)).toBe("desk");
    expect(neighbour("press", 1)).toBe("press");
  });

  it("keeps every camera inside the room, above the desk and looking at the back half", () => {
    for (const s of STATIONS) {
      const [x, y, z] = s.position;
      expect(Math.abs(x)).toBeLessThan(5);
      expect(y).toBeGreaterThan(1.2);
      expect(y).toBeLessThan(3.2);
      expect(Math.abs(z)).toBeLessThan(3.7);
      expect(s.target[2]).toBeLessThan(z);
    }
  });

  it("takes half a second to move, easing in and out", () => {
    expect(MOVE_MS).toBe(500);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    for (let t = 0; t < 1; t += 0.05) expect(ease(t + 0.05)).toBeGreaterThanOrEqual(ease(t));
  });

  it("mixes two points", () => {
    expect(mix([0, 0, 0], [2, 4, -6], 0.5)).toEqual([1, 2, -3]);
    expect(mix([1, 1, 1], [2, 4, -6], 0)).toEqual([1, 1, 1]);
    expect(mix([1, 1, 1], [2, 4, -6], 1)).toEqual([2, 4, -6]);
  });

  it("uses 40 degrees on a wide screen and opens up on a narrow one, within a limit", () => {
    expect(fieldOfView(16 / 9)).toBe(40);
    expect(fieldOfView(1.45)).toBe(40);
    expect(fieldOfView(1)).toBeGreaterThan(40);
    expect(fieldOfView(0.6)).toBeGreaterThan(fieldOfView(1));
    expect(fieldOfView(0.1)).toBeLessThanOrEqual(78);
    expect(fieldOfView(0)).toBeLessThanOrEqual(78);
  });
});

describe("the brownout", () => {
  it("has three levels: full, 70 percent and 45 percent", () => {
    expect([...LEVELS]).toEqual([1, 0.7, 0.45]);
    expect(brightnessOf(0)).toBe(1);
    expect(brightnessOf(2)).toBe(0.45);
  });

  it("fades over 600 ms and ends exactly on the new level", () => {
    expect(FADE_MS).toBe(600);
    expect(brightnessAt(1, 0.45, 0)).toBe(1);
    expect(brightnessAt(1, 0.45, -5)).toBe(1);
    expect(brightnessAt(1, 0.45, 600)).toBe(0.45);
    expect(brightnessAt(1, 0.45, 5000)).toBe(0.45);
    expect(brightnessAt(0.7, 0.7, 100)).toBe(0.7);
  });

  /** How many times the light turns from falling to rising during a fade, sampled every 2 ms. */
  const dipsIn = (from: number, to: number) => {
    let dips = 0;
    let falling = false;
    let last = brightnessAt(from, to, 0);
    for (let ms = 2; ms <= FADE_MS; ms += 2) {
      const now = brightnessAt(from, to, ms);
      if (now < last - 1e-9) falling = true;
      else if (now > last + 1e-9 && falling) {
        dips += 1;
        falling = false;
      }
      last = now;
    }
    return dips;
  };

  it("never flashes more than twice in a change, so never more than twice in a second", () => {
    expect(DIP_COUNT).toBeLessThanOrEqual(2);
    expect(dipsIn(1, 0.7)).toBeLessThanOrEqual(2);
    expect(dipsIn(0.7, 0.45)).toBeLessThanOrEqual(2);
    expect(dipsIn(1, 0.45)).toBeLessThanOrEqual(2);
    expect(dipsIn(1, 0.45)).toBeGreaterThan(0);
    // The whole change is shorter than a second, so its dips are all there can be in one.
    expect(FADE_MS).toBeLessThan(1000);
  });

  it("does not dip when the light comes back, and never goes black", () => {
    expect(dipsIn(0.45, 1)).toBe(0);
    for (let ms = 0; ms <= FADE_MS; ms += 5) {
      expect(brightnessAt(1, 0.45, ms)).toBeGreaterThanOrEqual(0.2);
      expect(brightnessAt(0.45, 1, ms)).toBeGreaterThanOrEqual(0.45);
    }
  });

  it("is instant with reduced motion: no fade and no dips", () => {
    for (const ms of [0, 1, 150, 360, 599]) expect(brightnessAt(1, 0.45, ms, true)).toBe(0.45);
  });
});

describe("noticing a slow room", () => {
  const run = (gaps: readonly number[], from: Pace = startPace()) => {
    let pace = from;
    let now = pace.last;
    let told = 0;
    for (const gap of gaps) {
      now += gap;
      const step = paceStep(pace, now);
      pace = step.pace;
      if (step.tell) told += 1;
    }
    return { pace, told };
  };
  const frames = (gap: number, forMs: number) => Array<number>(Math.ceil(forMs / gap)).fill(gap);

  it("says nothing about a room that draws at 60 or at 30 frames a second", () => {
    expect(run(frames(16.7, 20_000)).told).toBe(0);
    expect(run(frames(33.4, 20_000)).told).toBe(0);
  });

  it("tells once after five seconds under 24 frames a second, and not again", () => {
    const slow = frames(60, SLOW_FOR_MS + 200);
    const first = run([1000, ...slow]);
    expect(first.told).toBe(1);
    expect(run(slow, first.pace).told).toBe(0);
  });

  it("does not tell before the five seconds are up", () => {
    expect(run([1000, ...frames(60, SLOW_FOR_MS - 500)]).told).toBe(0);
  });

  it("starts again after a fast frame or after the room stands still", () => {
    const almost = frames(60, SLOW_FOR_MS - 500);
    expect(run([1000, ...almost, 16, ...almost]).told).toBe(0);
    expect(run([1000, ...almost, STILL_GAP_MS + 1, ...almost]).told).toBe(0);
  });

  it("does not take a still room for a slow one", () => {
    // One frame every two seconds is the idle clock redrawing the wall clock, not a slow device.
    expect(run(frames(2000, 60_000)).told).toBe(0);
  });
});

describe("text drawn on objects", () => {
  // Every character is ten units wide.
  const measure = (text: string) => text.length * 10;

  it("leaves text that fits alone and cuts text that does not, with an ellipsis", () => {
    expect(fit(measure, "auth-core", 200)).toBe("auth-core");
    const cut = fit(measure, "Subscriber authentication (auth-core)", 200);
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(200);
    expect(fit(measure, "ab cdefgh", 40)).toBe("ab…");
  });

  it("wraps at spaces and cuts the last line when there are too many", () => {
    expect(wrap(measure, "one two three", 80, 3)).toEqual(["one two", "three"]);
    expect(wrap(measure, "", 80, 3)).toEqual([]);
    const lines = wrap(measure, "one two three four five six seven", 80, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("one two");
    expect(lines[1]?.endsWith("…")).toBe(true);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(80);
  });
});

describe("sound", () => {
  const cues = (before: Game, after: Game) =>
    cuesFor(heardOf(before, severityOf(before)), after, severityOf(after));

  it("is silent when nothing happened", () => {
    expect(cues(start(), start())).toEqual([]);
    expect(cues(start(), setPaused(start(), true))).toEqual([]);
  });

  it("buzzes when a message arrives", () => {
    const before = start();
    let after = before;
    for (let n = 0; n < 4 && !cues(before, after).includes("message"); n++) after = wait(after);
    expect(cues(before, after)).toContain("message");
  });

  it("buzzes once for several messages at the same moment", () => {
    const before = start();
    const after = wait(severe(), 3);
    const inbox = after.feed.slice(before.feed.length).filter((f) => f.who === "inbox");
    expect(inbox.length).toBeGreaterThan(1);
    expect(cues(before, after).filter((c) => c === "message")).toHaveLength(1);
  });

  it("drops the hum when the incident gets worse, and not when it gets better", () => {
    const worse = severe();
    expect(cues(start(), worse)).toContain("worse");
    expect(cues(worse, played())).not.toContain("worse");
  });

  it("clicks when a task finishes", () => {
    const working = submit(dialTone, start(), "find out what changed on auth-core");
    expect(cues(start(), working)).not.toContain("done");
    expect(cues(working, wait(working))).toContain("done");
  });

  it("plays alerts first and the click last", () => {
    const order: Cue[] = ["alert", "worse", "message", "done"];
    const all = cues(start(), wait(severe(), 3));
    expect(all).toEqual(order.filter((c) => all.includes(c)));
  });

  it("has something on screen for every sound", () => {
    for (const cue of Object.keys(TONES) as Cue[]) {
      expect(SEEN_AS[cue].length).toBeGreaterThan(10);
    }
  });

  it("keeps every sound short and quiet, and never faster than three pulses a second", () => {
    for (const cue of Object.keys(TONES) as Cue[]) {
      expect(lengthOf(cue)).toBeLessThanOrEqual(1.2);
      const tones = TONES[cue];
      for (const tone of tones) expect(tone.peak).toBeLessThanOrEqual(0.1);
      expect(tones.length / Math.max(lengthOf(cue), 1)).toBeLessThanOrEqual(3);
    }
  });
});

describe("the hum of the lights", () => {
  it("does nothing while all is well", () => {
    for (let t = 0; t < 30; t += 0.05) expect(flickerAt(t, 0)).toBe(1);
  });

  it("wavers once the incident runs, and stutters when browned out, but never goes dark", () => {
    let low = 1;
    for (let t = 0; t < 60; t += 0.01) {
      const v = flickerAt(t, 2);
      expect(v).toBeGreaterThanOrEqual(0.6);
      expect(v).toBeLessThanOrEqual(1);
      low = Math.min(low, v);
    }
    expect(low).toBeLessThan(0.8);
    let running = 1;
    for (let t = 0; t < 60; t += 0.01) running = Math.min(running, flickerAt(t, 1));
    expect(running).toBeGreaterThan(0.9);
  });

  it("never dips by 10 percent or more more than three times in any second (WCAG 2.3.1)", () => {
    for (const level of [1, 2] as const) {
      const step = 0.005;
      const dips: number[] = [];
      // A dip is one unbroken stretch below 90 percent, however it wobbles inside.
      let below = false;
      for (let t = 0; t < 60; t += step) {
        const now = flickerAt(t, level) < 0.9;
        if (now && !below) dips.push(t);
        below = now;
      }
      for (const start of dips) {
        const inWindow = dips.filter((x) => x >= start && x < start + 1).length;
        expect(inWindow, `level ${level} near ${start.toFixed(2)}s`).toBeLessThanOrEqual(3);
      }
    }
  });
});
