import { describe, expect, it } from "vitest";
import { buildMenu } from "../../src/cli/options.js";
import { resolve } from "../../src/engine/engine.js";
import { IntentSchema } from "../../src/engine/schema.js";
import { sc, start } from "../engine/helpers.js";

describe("terminal menu", () => {
  const menu = buildMenu(sc);

  it("offers every investigation, every mitigation, and the controls", () => {
    expect(menu.filter((o) => o.label.startsWith("Look into"))).toHaveLength(
      sc.investigations.length,
    );
    expect(menu.filter((o) => o.label.startsWith("Do:"))).toHaveLength(sc.mitigations.length);
    expect(menu.map((o) => o.label)).toEqual(
      expect.arrayContaining([
        "Wait for the next development",
        "Cancel what Mika is doing",
        "End the incident",
      ]),
    );
  });

  it("offers each directive to the people who can act on it, and a broadcast for the rest", () => {
    const labels = menu.map((o) => o.label);
    expect(labels).toContain("Tell Daniel Osei: Update the public status page");
    expect(labels).toContain("Tell Duty officer: Notify the regulator duty line");
    expect(labels).toContain("Tell Ramon Villareal, Joy Antolin, Daniel Osei: Send the all-clear");
  });

  it("never offers a reply to the engineer", () => {
    expect(menu.some((o) => o.label.startsWith("Reply to Mika"))).toBe(false);
  });

  it("builds only inputs the engine accepts", () => {
    for (const option of menu) {
      if (option.input.type === "intent")
        expect(IntentSchema.safeParse(option.input.intent).success).toBe(true);
      const result = resolve(sc, start(), option.input);
      expect(result.state.log.length).toBeGreaterThan(0);
    }
  });
});
