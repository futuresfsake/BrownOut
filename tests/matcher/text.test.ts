import { describe, expect, it } from "vitest";
import { applySynonyms, clean, minutesFromNow, stem, tokens } from "../../src/matcher/text.js";

describe("clean", () => {
  it("lower-cases, expands contractions and drops punctuation", () => {
    expect(clean("What's going on? We CAN'T connect!")).toBe("what is going on we can not connect");
    expect(clean("I’ll update you by 02:30.")).toBe("i will update you by 02:30");
  });

  it("keeps digits, clock times and hyphenated names", () => {
    expect(clean("auth-core: 6 of 12 nodes at 01:52")).toBe("auth-core: 6 of 12 nodes at 01:52");
  });

  it("copes with symbols, other scripts and empty text", () => {
    expect(clean("<script>alert(1)</script>")).toBe("script alert 1 script");
    expect(clean("日本語 только")).toBe("");
    expect(clean("   ")).toBe("");
  });
});

describe("synonyms", () => {
  it("replaces whole phrases, longest first, and leaves other words alone", () => {
    expect(applySynonyms("roll back the certificates")).toBe("rollback the cert");
    expect(applySynonyms("is this a ddos")).toBe("is this a attack");
    expect(applySynonyms("check the catalogue")).toBe("check the catalogue");
  });

  it("does not replace inside a longer word", () => {
    expect(applySynonyms("the dialog is logged")).toBe("the dialog is logged");
  });

  it("applies a situation's own words as well", () => {
    expect(applySynonyms("the auth cluster", { auth: ["auth cluster"] })).toBe("the auth");
  });
});

describe("stem", () => {
  it("brings different forms of a word together", () => {
    for (const forms of [
      ["restart", "restarts", "restarted", "restarting"],
      ["node", "nodes"],
      ["change", "changed", "changes"],
      ["fail", "failed", "failing", "fails"],
      ["call", "calls", "calling", "called"],
      ["box", "boxes"],
    ]) {
      expect(new Set(forms.map(stem)).size).toBe(1);
    }
  });

  it("leaves short words and words ending in ss alone", () => {
    expect(stem("is")).toBe("is");
    expect(stem("bus")).toBe("bus");
    expect(stem("access")).toBe("acces");
    expect(stem("accesses")).toBe("acces");
  });
});

describe("tokens", () => {
  it("drops filler words and stems the rest", () => {
    expect(tokens("Can you please check the logs for me?")).toEqual(["check", "log"]);
    expect(tokens("do something")).toEqual([]);
  });
});

describe("minutesFromNow", () => {
  const at0214 = 2 * 60 + 14;

  it("reads durations in digits and in words", () => {
    expect(minutesFromNow("I'll update you in ten minutes", at0214)).toBe(10);
    expect(minutesFromNow("within 15 min", at0214)).toBe(15);
    expect(minutesFromNow("give me five more minutes", at0214)).toBe(5);
    expect(minutesFromNow("in an hour", at0214)).toBe(60);
    expect(minutesFromNow("in half an hour", at0214)).toBe(30);
    expect(minutesFromNow("within the hour", at0214)).toBe(60);
    expect(minutesFromNow("in a couple of minutes", at0214)).toBeNull();
  });

  it("reads a clock time, including across midnight", () => {
    expect(minutesFromNow("back to you by 02:30", at0214)).toBe(16);
    expect(minutesFromNow("by 00:10", 23 * 60 + 50)).toBe(20);
  });

  it("returns nothing when there is no usable time", () => {
    expect(minutesFromNow("soon", at0214)).toBeNull();
    expect(minutesFromNow("in banana minutes", at0214)).toBeNull();
    expect(minutesFromNow("in 0 minutes", at0214)).toBeNull();
    expect(minutesFromNow("by 02:14", at0214)).toBeNull();
    expect(minutesFromNow("in 900 minutes", at0214)).toBeNull();
    expect(minutesFromNow("by 20:00", at0214)).toBeNull();
  });
});
