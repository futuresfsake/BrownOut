import { describe, expect, it } from "vitest";
import { createSession, obligationState, severityLevel } from "../../src/engine/engine.js";
import {
  act,
  atMinute,
  intent,
  keepAlive,
  sc,
  series,
  start,
  tell,
  tick,
  types,
} from "./helpers.js";

describe("starting a session", () => {
  it("opens with the alert at minute 0, with unknown numbers still hidden", () => {
    const { state, events } = createSession(sc, 1);
    expect(state.minute).toBe(0);
    expect(state.status).toBe("running");
    expect(events.find((e) => e.type === "alert")?.text).toContain("ALERT 02:14");
    expect(state.visibleMetrics).toEqual([]);
    expect(series(state)[0]).toBe(60000);
  });

  it("gives the same session for the same seed and varies timing between seeds", () => {
    const a = JSON.stringify(createSession(sc, 5).state);
    expect(JSON.stringify(createSession(sc, 5).state)).toBe(a);
    const offsets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      offsets.add(JSON.stringify(createSession(sc, seed).state.beatOffsets));
    }
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("never changes the state it was given", () => {
    const before = start();
    const snapshot = JSON.stringify(before);
    intent(before, { kind: "investigate", id: "overview" });
    act(before, { type: "tick", minutes: 10 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("time and tasks", () => {
  it("an order costs the player one minute and the task runs for its own duration", () => {
    const first = intent(start(), { kind: "investigate", id: "overview" });
    expect(first.state.minute).toBe(1);
    expect(first.state.task?.endMinute).toBe(2);
    expect(types(first.events)).toContain("task_started");
    const done = act(first.state, { type: "tick", minutes: 1 });
    expect(types(done.events)).toContain("task_completed");
    expect(done.state.task).toBeNull();
    expect(done.state.revealedClues).toEqual(["two-regions", "auth-errors-high"]);
  });

  it("runs one task at a time, keeps one waiting, and refuses a third order", () => {
    let r = intent(start(), { kind: "investigate", id: "auth-logs" });
    r = intent(r.state, { kind: "investigate", id: "overview" });
    expect(types(r.events)).toContain("task_queued");
    expect(r.state.queuedTask?.id).toBe("overview");
    const minute = r.state.minute;
    const refused = intent(r.state, { kind: "investigate", id: "network-core" });
    expect(types(refused.events)).toEqual(["refused"]);
    expect(refused.state.minute).toBe(minute);
  });

  it("starts the queued task the minute the running one ends", () => {
    let r = intent(start(), { kind: "investigate", id: "overview" });
    r = intent(r.state, { kind: "investigate", id: "network-core" });
    const after = act(r.state, { type: "tick", minutes: 1 }).state;
    expect(after.task?.id).toBe("network-core");
    expect(after.task?.startMinute).toBe(2);
    expect(after.task?.endMinute).toBe(7);
    expect(after.queuedTask).toBeNull();
  });

  it("refuses an order whose requirement is not met, at no cost, and allows it later", () => {
    const early = intent(start(), { kind: "investigate", id: "emergency-calls" });
    expect(types(early.events)).toEqual(["refused"]);
    expect(early.state.minute).toBe(0);
    const later = intent(atMinute(start(), 10), { kind: "investigate", id: "emergency-calls" });
    expect(types(later.events)).toContain("task_started");
  });

  it("treats an unknown id or an unmatched action as not understood and still costs a minute", () => {
    for (const i of [
      { kind: "investigate", id: "nonsense" } as const,
      { kind: "mitigate", id: "nonsense" } as const,
      { kind: "other" } as const,
    ]) {
      const r = intent(start(), i);
      expect(types(r.events)).toContain("not_understood");
      expect(r.state.minute).toBe(1);
      expect(r.state.revealedClues).toEqual([]);
    }
  });

  it("wait moves on to the next notable event, and never more than five minutes", () => {
    let r = intent(start(), { kind: "investigate", id: "overview" });
    r = act(r.state, { type: "wait" });
    expect(r.state.minute).toBe(2);
    expect(types(r.events)).toContain("task_completed");
    const quiet = act(atMinute(start(), 21), { type: "wait" });
    expect(quiet.state.minute).toBeLessThanOrEqual(26);
    expect(quiet.state.minute).toBeGreaterThan(21);
  });

  it("can cancel the running task and starts the queued one", () => {
    expect(types(act(start(), { type: "cancelTask" }).events)).toEqual(["refused"]);
    let r = intent(start(), { kind: "investigate", id: "auth-logs" });
    r = intent(r.state, { kind: "investigate", id: "overview" });
    r = act(r.state, { type: "cancelTask" });
    expect(types(r.events)).toContain("task_cancelled");
    expect(r.state.task?.id).toBe("overview");
  });

  it("closes the incident when the player ends it, and then refuses everything", () => {
    const ended = act(start(), { type: "end" });
    expect(ended.state.status).toBe("ended");
    const after = act(ended.state, { type: "tick", minutes: 5 });
    expect(types(after.events)).toEqual(["refused"]);
    expect(after.state.minute).toBe(ended.state.minute);
  });
});

describe("the driving metric", () => {
  it("grows along the fault curve and fills in the derived numbers", () => {
    const s = tick(start(), 30);
    expect(series(s)[30]).toBe(240000);
    expect(series(s, "tickets")[30]).toBe(Math.round(series(s)[25]! / 150));
    expect(series(s, "attachSuccess")[0]).toBe(71);
  });

  it("a rollback freezes the damage while it runs, then recovers to zero", () => {
    let s = atMinute(start(), 6);
    const frozen = series(s)[6]!;
    s = intent(s, { kind: "mitigate", id: "rollback-bundle" }).state;
    s = atMinute(s, 15);
    expect(series(s)[15]).toBe(frozen);
    s = atMinute(s, 19);
    expect(series(s)[19]).toBe(0);
    expect(s.systems["auth-core"]).toBe("ok");
    expect(s.appliedMitigations.map((m) => m.id)).toEqual(["rollback-bundle"]);
  });

  it("restarting every node spikes the damage, then settles above the fault curve", () => {
    let s = intent(start(), { kind: "mitigate", id: "restart-all-auth" }).state;
    s = atMinute(s, 6);
    expect(series(s)[6]).toBe(780000);
    s = atMinute(s, 40);
    expect(series(s)[40]).toBe(Math.round(((240000 + (420000 - 240000) / 3) as number) * 1.15));
  });

  it("draining the bad nodes cuts the damage to a fraction but does not fix auth-core", () => {
    let s = atMinute(start(), 10);
    s = intent(s, { kind: "mitigate", id: "drain-bad-nodes" }).state;
    s = atMinute(s, 15); // the drain finishes here, and 15 percent applies to the damage at that point
    const atCompletion = series(s)[15]!;
    s = atMinute(s, 30);
    expect(series(s)[30]).toBe(Math.round(atCompletion * 0.15));
    expect(s.systems["auth-core"]).toBe("degraded");
  });

  it("cancelling a rollback puts the fault curve back", () => {
    let s = intent(start(), { kind: "mitigate", id: "rollback-bundle" }).state;
    s = atMinute(s, 3);
    s = act(s, { type: "cancelTask" }).state;
    expect(s.mode.name).toBe("fault");
    s = atMinute(s, 30);
    expect(series(s)[30]).toBe(240000);
  });

  it("reports severity from the damage and from the session status", () => {
    expect(severityLevel(sc, start())).toBe(1);
    const spiked = atMinute(intent(start(), { kind: "mitigate", id: "restart-all-auth" }).state, 6);
    expect(severityLevel(sc, spiked)).toBe(2);
    expect(severityLevel(sc, act(start(), { type: "end" }).state)).toBe(0);
  });
});

describe("investigations", () => {
  it("only confirms recovery once the damage is gone", () => {
    let s = atMinute(start(), 10);
    s = intent(s, { kind: "mitigate", id: "drain-bad-nodes" }).state;
    s = atMinute(s, 20);
    const check = intent(s, { kind: "investigate", id: "verify-recovery" });
    const done = act(check.state, { type: "tick", minutes: 2 });
    expect(done.events.find((e) => e.type === "task_completed")?.text).toContain("Not yet");
    expect(done.state.revealedClues).not.toContain("recovered");
  });

  it("does not reveal a clue twice when an investigation is repeated", () => {
    let s = intent(start(), { kind: "investigate", id: "overview" }).state;
    s = atMinute(s, 5);
    s = intent(s, { kind: "investigate", id: "overview" }).state;
    s = atMinute(s, 9);
    expect(s.revealedClues.filter((c) => c === "two-regions")).toHaveLength(1);
  });

  it("reveals numbers on the board only after the player has learned them", () => {
    let s = start();
    expect(s.visibleMetrics).not.toContain("customersAffected");
    s = intent(s, { kind: "investigate", id: "overview" }).state;
    s = atMinute(s, 2);
    expect(s.visibleMetrics).toEqual(
      expect.arrayContaining(["customersAffected", "attachSuccess"]),
    );
    expect(s.visibleMetrics).not.toContain("tickets");
  });
});

describe("messages, trust and commitments", () => {
  it("delivers beats into the sender's thread and marks it unanswered", () => {
    const s = atMinute(start(), 3);
    expect(s.threads.cto?.messages.at(-1)?.text).toContain("ETA");
    expect(s.threads.cto?.unansweredSince).toBe(3);
    expect(s.replyStats.episodes).toBe(1);
  });

  it("rewards a reply in time, once, and clears the unanswered mark", () => {
    const s = atMinute(start(), 3);
    const trust = s.trust.cto!;
    const r = intent(s, tell(["cto"]));
    expect(r.state.trust.cto).toBe(trust + 4);
    expect(r.state.threads.cto?.unansweredSince).toBeUndefined();
    expect(r.state.replyStats.inTime).toBe(1);
  });

  it("gives no bonus for a late reply, and costs trust for every minute of silence", () => {
    let s = atMinute(start(), 3);
    const trust = s.trust.cto!;
    s = atMinute(s, 12);
    expect(s.trust.cto).toBe(trust - 4); // minutes 9 to 12 are past the 5 minute patience
    const late = intent(s, tell(["cto"]));
    expect(late.state.trust.cto).toBe(trust - 4);
    expect(late.state.replyStats.inTime).toBe(0);
  });

  it("rewards a proactive update, but not more often than the spacing allows", () => {
    let s = intent(start(), tell(["comms"])).state;
    expect(s.trust.comms).toBe(65);
    s = intent(s, tell(["comms"])).state;
    expect(s.trust.comms).toBe(65);
    s = atMinute(s, 12);
    s = intent(s, tell(["comms"])).state;
    expect(s.trust.comms).toBe(70);
  });

  it("keeps a promise made with a time when the person is told before it is due", () => {
    let s = intent(
      start(),
      tell(["cto"], { promises: [{ to: "cto", what: "an update", dueInMinutes: 5 }] }),
    ).state;
    expect(s.commitments[0]).toMatchObject({ status: "open", dueMinute: 5 });
    s = atMinute(s, 4);
    const r = intent(s, tell(["cto"]));
    expect(r.state.commitments[0]?.status).toBe("kept");
    expect(types(r.events)).toContain("commitment_kept");
  });

  it("breaks a promise that passes its time, and the CTO says exactly which time", () => {
    let s = intent(
      start(),
      tell(["cto"], { promises: [{ to: "cto", what: "an update", dueInMinutes: 5 }] }),
    ).state;
    const trust = s.trust.cto!;
    s = atMinute(s, 8);
    expect(s.commitments[0]?.status).toBe("broken");
    expect(s.trust.cto).toBeLessThan(trust - 11);
    const text = s.threads.cto?.messages.find((m) => m.beatId === "cto-missed")?.text;
    expect(text).toContain("02:19"); // 5 minutes after the promise was made at 02:14
  });

  it("a promise with no time is kept by the next message to that person", () => {
    let s = intent(
      start(),
      tell(["cto"], { promises: [{ to: "cto", what: "a call", dueInMinutes: null }] }),
    ).state;
    expect(s.commitments[0]?.dueMinute).toBeNull();
    s = atMinute(s, 30);
    expect(s.commitments[0]?.status).toBe("open");
    s = intent(s, tell(["cto"])).state;
    expect(s.commitments[0]?.status).toBe("kept");
  });

  it("does not let one message both make and keep a promise", () => {
    const s = intent(
      start(),
      tell(["cto"], { promises: [{ to: "cto", what: "x", dueInMinutes: 5 }] }),
    ).state;
    expect(s.commitments[0]?.status).toBe("open");
  });

  it("says so when nobody by that name can be told, and ignores the engineer", () => {
    expect(types(intent(start(), tell(["nobody"])).events)).toContain("not_understood");
    expect(types(intent(start(), tell(["engineer"])).events)).toContain("not_understood");
  });

  it("ignores a promise to someone who does not exist", () => {
    const r = intent(
      start(),
      tell(["cto"], { promises: [{ to: "ghost", what: "x", dueInMinutes: 5 }] }),
    );
    expect(r.state.commitments).toHaveLength(0);
  });

  it("never lets trust leave 0 to 100", () => {
    let s = start();
    for (let i = 0; i < 40; i++) s = intent(atMinute(s, s.minute + 11), tell(["support"])).state;
    expect(s.trust.support).toBeLessThanOrEqual(100);
    const quiet = atMinute(start(), 89);
    for (const v of Object.values(quiet.trust)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("claims", () => {
  const say = (topic: string, stance: "asserts" | "denies" | "uncertain", to = ["cto"]) =>
    tell(to, { claims: [{ topic, stance, text: `about ${topic}` }] });

  it("marks a true statement with evidence as supported and builds trust", () => {
    let s = intent(start(), { kind: "investigate", id: "auth-changes" }).state;
    s = atMinute(s, 3);
    const trust = s.trust.cto!;
    s = intent(s, say("cause-is-cert", "asserts")).state;
    expect(s.claims[0]).toMatchObject({ truth: "true", supported: true });
    expect(s.trust.cto).toBe(trust + 4 + 3); // answered in time, and an accurate statement
  });

  it("marks a true statement made without evidence as unsupported", () => {
    const s = intent(start(), say("cause-is-cert", "asserts")).state;
    expect(s.claims[0]).toMatchObject({ truth: "true", supported: false });
  });

  it("works out truth from the statement, the stance and the time", () => {
    const early = intent(start(), say("emergency-affected", "denies", ["journalist"])).state;
    expect(early.claims[0]?.truth).toBe("true"); // calling is not yet affected
    const late = intent(
      atMinute(start(), 12),
      say("emergency-affected", "denies", ["journalist"]),
    ).state;
    expect(late.claims[0]?.truth).toBe("false");
    const asserted = intent(atMinute(start(), 12), say("emergency-affected", "asserts")).state;
    expect(asserted.claims[0]?.truth).toBe("true");
  });

  it("treats 'we do not know yet' as unknowable and costs nothing", () => {
    const s = intent(start(), say("data-exposed", "uncertain", ["counsel"])).state;
    expect(s.claims[0]).toMatchObject({ truth: "unknowable", supported: true });
  });

  it("ignores a claim on a topic the scenario does not track", () => {
    expect(intent(start(), say("weather", "asserts")).state.claims).toHaveLength(0);
  });

  it("brings a false claim back when its truth comes out, and costs trust", () => {
    let s = intent(start(), say("under-attack", "asserts")).state;
    const trust = s.trust.cto!;
    expect(s.claims[0]?.surfaced).toBe(false);
    s = intent(atMinute(s, 3), { kind: "investigate", id: "traffic-spike" }).state;
    s = atMinute(s, 9);
    expect(s.claims[0]?.surfaced).toBe(true);
    expect(s.trust.cto).toBeLessThan(trust - 15);
    const confrontation = s.threads.counsel?.messages.find((m) => m.beatId === "counsel-attack");
    expect(confrontation?.text).toContain("about under-attack");
  });

  it("lets a player correct a statement before it comes out, which stops it surfacing", () => {
    let s = intent(start(), say("under-attack", "asserts")).state;
    s = intent(s, say("under-attack", "uncertain")).state;
    expect(s.claims[0]?.corrected).toBe(true);
    s = intent(atMinute(s, 3), { kind: "investigate", id: "traffic-spike" }).state;
    s = atMinute(s, 9);
    expect(s.claims[0]?.surfaced).toBe(false);
  });

  it("asks on what basis when the player denies data exposure without checking", () => {
    const s = atMinute(intent(start(), say("data-exposed", "denies", ["counsel"])).state, 4);
    expect(s.threads.counsel?.messages.some((m) => m.beatId === "counsel-basis")).toBe(true);
  });
});

describe("directives and obligations", () => {
  it("a status page request changes the system and meets the obligation", () => {
    expect(obligationState(sc, start(), "status-page")).toBe("open");
    const r = intent(start(), tell(["comms"], { directives: ["update-status-page"] }));
    expect(r.state.systems["status-page"]).toBe("degraded");
    expect(obligationState(sc, r.state, "status-page")).toBe("met");
  });

  it("refuses a directive aimed at someone who cannot act on it", () => {
    const r = intent(start(), tell(["support"], { directives: ["update-status-page"] }));
    expect(types(r.events)).toContain("refused");
    expect(r.state.systems["status-page"]).toBe("ok");
    expect(r.state.directivesSent).toHaveLength(0);
  });

  it("ignores a directive the scenario does not define", () => {
    expect(
      intent(start(), tell(["comms"], { directives: ["nonsense"] })).state.directivesSent,
    ).toHaveLength(0);
  });

  it("an obligation becomes missed when its time passes, and late if met afterwards", () => {
    let s = atMinute(start(), 27);
    expect(obligationState(sc, s, "status-page")).toBe("missed");
    expect(s.threads.comms?.messages.some((m) => m.beatId === "comms-status")).toBe(true);
    s = intent(s, tell(["comms"], { directives: ["update-status-page"] })).state;
    expect(obligationState(sc, s, "status-page")).toBe("late");
  });

  it("stays dormant until its trigger, and the regulator calls when it is missed", () => {
    expect(obligationState(sc, start(), "notify-regulator")).toBe("dormant");
    const s = keepAlive(start(), 58);
    expect(s.status).toBe("running");
    expect(obligationState(sc, s, "notify-regulator")).toBe("missed");
    expect(s.threads.regulator?.messages.some((m) => m.beatId === "regulator-calls")).toBe(true);
  });

  it("the all-clear needs every named person to hear it", () => {
    let s = start();
    s.revealedClues.push("recovered");
    s = tick(s, 1);
    s = intent(s, tell(["cto"], { directives: ["all-clear"] })).state;
    expect(obligationState(sc, s, "all-clear")).toBe("open");
    s = intent(s, tell(["support", "comms"], { directives: ["all-clear"] })).state;
    expect(obligationState(sc, s, "all-clear")).toBe("met");
  });

  it("an unknown obligation is dormant", () => {
    expect(obligationState(sc, start(), "nothing")).toBe("dormant");
  });
});

describe("beats", () => {
  it("fires each beat once, at its time, and skips one whose 'unless' holds", () => {
    const s = atMinute(start(), 60);
    expect(new Set(s.firedBeats).size).toBe(s.firedBeats.length);
    expect(s.firedBeats).toContain("cto-eta");
    let quick = intent(start(), tell(["comms"], { directives: ["update-status-page"] })).state;
    quick = atMinute(quick, 30);
    expect(quick.firedBeats).not.toContain("comms-status");
    expect(quick.skippedBeats).toContain("comms-status");
  });

  it("only says 'ten minutes are up' to a CTO who has not been answered", () => {
    const answered = atMinute(intent(atMinute(start(), 3), tell(["cto"])).state, 14);
    expect(answered.firedBeats).not.toContain("cto-ten-minutes");
    const ignored = atMinute(start(), 14);
    expect(ignored.firedBeats).toContain("cto-ten-minutes");
  });

  it("fills live numbers into the text it writes", () => {
    const s = atMinute(start(), 10);
    const text =
      s.threads.support?.messages.find((m) => m.beatId === "support-tickets")?.text ?? "";
    expect(text).toMatch(/About [\d,]+ tickets/);
    expect(text).not.toContain("{");
  });

  it("returns a render request, with its facts and fallback text, for every message", () => {
    const { renderRequests } = act(start(), { type: "tick", minutes: 3 });
    const cto = renderRequests.find((r) => r.from === "cto");
    expect(cto).toMatchObject({ kind: "message", channel: "chat" });
    expect(cto?.facts[0]).toContain("10 minutes");
    expect(cto?.fallbackText).toContain("ETA");
  });
});

describe("endings", () => {
  it("the CTO takes over when trust falls below the floor", () => {
    const s = atMinute(start(), 70);
    expect(s.status).toBe("relieved");
  });

  it("time runs out at the hard end", () => {
    let s = start();
    for (let m = 5; m <= 90 && s.status === "running"; m += 5) {
      s = intent(atMinute(s, m), tell(["cto"])).state;
    }
    s = tick(s, 90);
    expect(s.status).toBe("timeout");
    expect(s.minute).toBe(90);
  });

  it("closing the incident records why", () => {
    const ended = act(start(), { type: "end" });
    expect(ended.events.at(-1)).toMatchObject({ type: "ended", data: { status: "ended" } });
  });
});
