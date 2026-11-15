// Runs a scripted list of inputs through the engine. Used by tests, the validator, scoring bounds
// and the terminal runner's auto-play.
import { createSession, resolve } from "./engine.js";
import type { IdealStep, Intent, Scenario } from "./schema.js";
import type { EngineInput, EngineEvent, SessionState } from "./state.js";

export interface Step {
  atMinute: number;
  input: EngineInput;
}

export const say = (atMinute: number, intent: Intent): Step => ({
  atMinute,
  input: { type: "intent", intent },
});

export const fromIdeal = (steps: readonly IdealStep[]): Step[] =>
  steps.map((s) => ({ atMinute: s.atMinute, input: { type: "intent", intent: s.intent } }));

export interface Playthrough {
  state: SessionState;
  events: EngineEvent[];
}

/**
 * Plays the steps in order. Before each step the clock is moved forward to its minute. When the
 * steps run out the session is carried on to its hard end unless `finish` is false.
 */
export function play(
  scenario: Scenario,
  steps: readonly Step[],
  { seed = 1, finish = true }: { seed?: number; finish?: boolean } = {},
): Playthrough {
  let { state } = createSession(scenario, seed);
  for (const step of steps) {
    if (state.status !== "running") break;
    if (state.minute < step.atMinute) {
      ({ state } = resolve(scenario, state, {
        type: "tick",
        minutes: step.atMinute - state.minute,
      }));
      if (state.status !== "running") break;
    }
    ({ state } = resolve(scenario, state, step.input));
  }
  if (finish && state.status === "running") {
    ({ state } = resolve(scenario, state, {
      type: "tick",
      minutes: scenario.lengthMinutes - state.minute,
    }));
  }
  return { state, events: state.log };
}
