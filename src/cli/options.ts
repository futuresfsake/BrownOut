// The menu for the terminal runner, which plays a scenario with no model. Pure, so it is tested.
import type { EngineInput } from "../engine/state.js";
import type { Scenario } from "../engine/schema.js";

export interface MenuOption {
  label: string;
  input: EngineInput;
}

const WATCHED = ["cto", "support", "comms"];

export function buildMenu(scenario: Scenario): MenuOption[] {
  const options: MenuOption[] = [];
  for (const i of scenario.investigations) {
    options.push({
      label: `Look into: ${i.label}`,
      input: { type: "intent", intent: { kind: "investigate", id: i.id } },
    });
  }
  for (const m of scenario.mitigations) {
    options.push({
      label: `Do: ${m.label}`,
      input: { type: "intent", intent: { kind: "mitigate", id: m.id } },
    });
  }
  const people = scenario.stakeholders.filter((s) => s.id !== "engineer");
  for (const s of people) {
    options.push({
      label: `Reply to ${s.name}: "Working on it, update soon."`,
      input: {
        type: "intent",
        intent: { kind: "communicate", to: [s.id], text: "Working on it. I will update you soon." },
      },
    });
  }
  for (const d of scenario.directives) {
    const ask = (to: string[], who: string) =>
      options.push({
        label: `Tell ${who}: ${d.label}`,
        input: {
          type: "intent",
          intent: { kind: "communicate", to, text: `${d.label}.`, directives: [d.id] },
        },
      });
    if (d.toAny) {
      // Only some people can carry it out: one option each.
      for (const who of d.toAny) {
        ask([who], scenario.stakeholders.find((s) => s.id === who)?.name ?? who);
      }
    } else {
      // Anyone can: one broadcast to the people who need to hear it.
      const everyone = WATCHED.filter((id) => scenario.stakeholders.some((s) => s.id === id));
      const names = everyone.map(
        (id) => scenario.stakeholders.find((s) => s.id === id)?.name ?? id,
      );
      ask(everyone, names.join(", "));
    }
  }
  options.push({ label: "Wait for the next development", input: { type: "wait" } });
  options.push({ label: "Cancel what Mika is doing", input: { type: "cancelTask" } });
  options.push({ label: "End the incident", input: { type: "end" } });
  return options;
}
