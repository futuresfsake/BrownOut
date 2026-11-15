// One turn of play from typed text: the matcher reads it, the engine resolves it.
// This is the whole game loop. It runs the same in a terminal, a test and a browser.
import { resolve } from "../engine/engine.js";
import type { Intent, Scenario } from "../engine/schema.js";
import type { EngineEvent, SessionState } from "../engine/state.js";
import { read, type Candidate } from "../matcher/matcher.js";

export interface TurnResult {
  state: SessionState;
  events: EngineEvent[];
  /** How the text was read, one line per instruction. Empty when nothing was acted on. */
  restatements: string[];
  /** Parts of the input that were not understood. */
  unread: string[];
  /** Set when the player has to pick what they meant. No time has passed. */
  choose?: Candidate[];
  /** Set when nothing matched. A minute has passed; these are the nearest things to try. */
  suggestions?: Candidate[];
}

export function applyIntents(scenario: Scenario, state: SessionState, intents: Intent[]) {
  let current = state;
  const events: EngineEvent[] = [];
  for (const intent of intents) {
    if (current.status !== "running") break;
    const step = resolve(scenario, current, { type: "intent", intent });
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

export function takeTurn(
  scenario: Scenario,
  state: SessionState,
  text: string,
  threadId?: string,
): TurnResult {
  const reading = read(scenario, text, { minute: state.minute, threadId });
  if (reading.kind === "choose") {
    return { state, events: [], restatements: [], unread: [], choose: reading.candidates };
  }
  if (reading.kind === "control") {
    const step = resolve(scenario, state, { type: reading.control });
    return { state: step.state, events: step.events, restatements: [], unread: [] };
  }
  if (reading.kind === "unknown") {
    const step = resolve(scenario, state, { type: "intent", intent: { kind: "other" } });
    return {
      state: step.state,
      events: step.events,
      restatements: [],
      unread: [],
      suggestions: reading.suggestions,
    };
  }
  const done = applyIntents(scenario, state, reading.intents);
  return { ...done, restatements: reading.restatements, unread: reading.unread };
}
