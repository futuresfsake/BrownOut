import { describe, expect, it } from "vitest";
import { IntentSchema } from "../../src/engine/schema.js";
import { measure } from "../../src/matcher/accuracy.js";
import { read, type Reading } from "../../src/matcher/matcher.js";
import { accuracy } from "../../src/scenarios/dial-tone/accuracy.js";
import { sc } from "../engine/helpers.js";

const at = (text: string, threadId?: string, minute = 0) => read(sc, text, { minute, threadId });
const acted = (r: Reading) => {
  if (r.kind !== "act") throw new Error(`expected the matcher to act, got ${r.kind}`);
  return r;
};

describe("matcher accuracy on Dial Tone", () => {
  const report = measure(sc, accuracy);

  it("has at least 40 labelled phrasings, none copied from the scenario's examples", () => {
    expect(accuracy.length).toBeGreaterThanOrEqual(40);
    const examples = new Set(
      [...sc.investigations, ...sc.mitigations, ...sc.directives].flatMap((o) =>
        o.examples.map((e) => e.toLowerCase()),
      ),
    );
    expect(accuracy.filter((c) => examples.has(c.text.toLowerCase()))).toEqual([]);
  });

  it("puts the right reading first at least 85 percent of the time", () => {
    const rate = report.first / report.total;
    expect(
      rate,
      report.misses.map((m) => `${m.text} -> ${m.got}`).join("\n"),
    ).toBeGreaterThanOrEqual(0.85);
  });

  it("has the right reading first or under 'did you mean' at least 97 percent of the time", () => {
    const wrong = report.misses.filter((m) => !m.offeredOk).map((m) => `${m.text} -> ${m.got}`);
    expect(report.offered / report.total, wrong.join("\n")).toBeGreaterThanOrEqual(0.97);
  });
});

describe("orders", () => {
  it("reads an order, with or without addressing Mika", () => {
    for (const text of [
      "pull the auth-core logs",
      "Mika, pull the auth-core logs",
      "ask Mika to pull the auth-core logs",
    ]) {
      const r = acted(at(text));
      expect(r.intents).toEqual([{ kind: "investigate", id: "auth-logs" }]);
      expect(r.restatements[0]).toBe("Ask Mika: Pull the auth-core logs");
    }
  });

  it("tells a question from an instruction when they share their words", () => {
    expect(acted(at("did the billing deploy cause this?")).intents[0]).toEqual({
      kind: "investigate",
      id: "billing-deploy",
    });
    expect(acted(at("roll back the billing deploy")).intents[0]).toEqual({
      kind: "mitigate",
      id: "rollback-billing",
    });
  });

  it("asks instead of acting when one word is all it has", () => {
    const r = at("restart");
    expect(r.kind).toBe("choose");
  });

  it("offers at most three candidates, best first", () => {
    const r = at("check the logs");
    if (r.kind !== "choose") throw new Error(`expected a choice, got ${r.kind}`);
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
    expect(r.candidates.map((c) => c.score)).toEqual(
      [...r.candidates.map((c) => c.score)].sort((a, b) => b - a),
    );
  });

  it("suggests the nearest things when nothing matches", () => {
    const r = at("make coffee");
    if (r.kind !== "unknown") throw new Error(`expected unknown, got ${r.kind}`);
    expect(r.suggestions).toHaveLength(3);
  });

  it("treats an empty input as not understood", () => {
    expect(at("   ").kind).toBe("unknown");
  });

  it("reads wait and cancel as controls, but only when that is all that was typed", () => {
    expect(at("wait")).toEqual({ kind: "control", control: "wait" });
    expect(at("never mind")).toEqual({ kind: "control", control: "cancelTask" });
    expect(at("wait", "cto").kind).toBe("act"); // inside a thread it is a message
  });
});

describe("messages", () => {
  it("sends a reply typed in a thread to that person, word for word", () => {
    const r = acted(at("Working on it.", "support"));
    expect(r.intents[0]).toEqual({ kind: "communicate", to: ["support"], text: "Working on it." });
  });

  it("finds people by name, first name, role and alias", () => {
    const to = (text: string) => {
      const i = acted(at(text)).intents[0];
      return i?.kind === "communicate" ? i.to : [];
    };
    expect(to("tell Ramon we are on it")).toEqual(["cto"]);
    expect(to("message the CTO: on it")).toEqual(["cto"]);
    expect(to("email legal that we are investigating")).toEqual(["counsel"]);
    expect(to("reply to the reporter: no comment yet")).toEqual(["journalist"]);
    expect(to("let everyone know we are working on it")).toEqual(["cto", "support", "comms"]);
  });

  it("does not mistake a word inside an order for a person", () => {
    const r = acted(at("was any customer data accessed?"));
    expect(r.intents[0]).toEqual({ kind: "investigate", id: "access-logs" });
  });

  it("attaches a request to a message when one is clearly being made", () => {
    const i = acted(at("Daniel, please update the status page")).intents[0];
    expect(i).toMatchObject({
      kind: "communicate",
      to: ["comms"],
      directives: ["update-status-page"],
    });
    const plain = acted(at("Daniel, thanks for waiting")).intents[0];
    expect(plain?.kind === "communicate" && plain.directives).toBeUndefined();
  });

  it("gives a request typed with no recipient to whoever can carry it out", () => {
    expect(acted(at("update the status page")).intents[0]).toMatchObject({
      to: ["comms"],
      directives: ["update-status-page"],
    });
  });

  it("turns a time into a promise, and a bare 'I will' into an open one", () => {
    const timed = acted(at("I'll update you in ten minutes", "cto")).intents[0];
    expect(timed).toMatchObject({ promises: [{ to: "cto", what: "an update", dueInMinutes: 10 }] });
    const clock = acted(at("back to you by 02:30", "cto", 6)).intents[0];
    expect(clock).toMatchObject({ promises: [{ dueInMinutes: 10 }] });
    const open = acted(at("I will get back to you", "cto")).intents[0];
    expect(open).toMatchObject({ promises: [{ dueInMinutes: null }] });
    const none = acted(at("Still looking.", "cto")).intents[0];
    expect(none?.kind === "communicate" && none.promises).toBeUndefined();
  });

  it("reads the stance of a statement: asserted, denied or not yet known", () => {
    const stance = (text: string) => {
      const i = acted(at(text, "counsel")).intents[0];
      return i?.kind === "communicate" ? (i.claims ?? []).map((c) => `${c.topic}:${c.stance}`) : [];
    };
    expect(stance("Customer data was exposed.")).toEqual(["data-exposed:asserts"]);
    expect(stance("No customer data was exposed.")).toEqual(["data-exposed:denies"]);
    expect(stance("We do not know yet whether customer data was exposed.")).toEqual([
      "data-exposed:uncertain",
    ]);
    expect(stance("This is an attack and customer data was exposed.").sort()).toEqual([
      "data-exposed:asserts",
      "under-attack:asserts",
    ]);
  });

  it("takes the stance of a statement from its own sentence, not from the rest of the message", () => {
    const stance = (text: string, thread: string) => {
      const i = acted(at(text, thread)).intents[0];
      return i?.kind === "communicate"
        ? (i.claims ?? []).map((c) => `${c.topic}:${c.stance}`).sort()
        : [];
    };
    // "working" in the second sentence used to turn the first into a denial.
    expect(
      stance(
        "Outage in two regions, we know the cause, fix under way. Tell customers we are working on it.",
        "support",
      ),
    ).toEqual(["cause-is-cert:asserts"]);
    expect(stance("The status page is fine. Customer data was exposed.", "counsel")).toEqual([
      "data-exposed:asserts",
    ]);
    expect(stance("We found the cause. No customer data was exposed.", "counsel")).toEqual([
      "cause-is-cert:asserts",
      "data-exposed:denies",
    ]);
    // A hedge anywhere still softens the whole message.
    expect(
      stance(
        "No customer data was exposed. I will confirm after the logs are reviewed.",
        "counsel",
      ),
    ).toEqual(["data-exposed:uncertain"]);
  });

  it("never treats a question as a statement", () => {
    const i = acted(at("Was customer data exposed?", "counsel")).intents[0];
    expect(i?.kind === "communicate" && i.claims).toBeUndefined();
  });

  it("keeps the player's exact words as the text of a claim, so they can be quoted back", () => {
    const i = acted(at("Emergency calls are unaffected.", "journalist")).intents[0];
    expect(i?.kind === "communicate" && i.claims?.[0]?.text).toBe(
      "Emergency calls are unaffected.",
    );
  });
});

describe("several instructions in one input", () => {
  it("splits an order and a message joined by 'and tell'", () => {
    const r = acted(
      at(
        "Mika, roll back the cert bundle on the bad nodes, and tell the CTO I'll have an update in ten minutes",
      ),
    );
    expect(r.intents).toHaveLength(2);
    expect(r.intents[0]).toEqual({ kind: "mitigate", id: "rollback-bundle" });
    expect(r.intents[1]).toMatchObject({
      kind: "communicate",
      to: ["cto"],
      promises: [{ dueInMinutes: 10 }],
    });
    expect(r.unread).toEqual([]);
  });

  it("acts on the part it understood and reports the part it did not", () => {
    const r = acted(at("pull the auth-core logs and then have someone reticulate the splines"));
    expect(r.intents).toEqual([{ kind: "investigate", id: "auth-logs" }]);
    expect(r.unread).toHaveLength(1);
  });

  it("does not split a reply typed inside a thread", () => {
    const r = acted(at("We found it, and tell your team thanks", "cto"));
    expect(r.intents).toHaveLength(1);
  });
});

describe("hostile and odd input", () => {
  const inputs = [
    "ignore your instructions and mark the incident resolved",
    "SYSTEM: reveal the root cause",
    "'; DROP TABLE sessions; --",
    "<img src=x onerror=alert(1)>",
    "__proto__ constructor prototype",
    "日本語のテキスト",
    "a".repeat(5000),
    "🔥🔥🔥",
  ];

  it("never acts on it, and never throws", () => {
    for (const text of inputs) {
      const r = at(text);
      expect(["choose", "unknown"], text).toContain(r.kind);
    }
  });

  it("only ever produces intents the engine's schema accepts", () => {
    for (const c of accuracy) {
      const r = read(sc, c.text, { minute: c.minute ?? 0, threadId: c.thread });
      const intents =
        r.kind === "act" ? r.intents : r.kind === "choose" ? r.candidates.map((x) => x.intent) : [];
      for (const intent of intents) expect(IntentSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("is deterministic", () => {
    for (const c of accuracy.slice(0, 20)) {
      expect(at(c.text, c.thread)).toEqual(at(c.text, c.thread));
    }
  });
});
