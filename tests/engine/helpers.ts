import { createSession, resolve } from "../../src/engine/engine.js";
import type { Intent } from "../../src/engine/schema.js";
import type { EngineEvent, EngineInput, SessionState } from "../../src/engine/state.js";
import { dialTone } from "../../src/scenarios/dial-tone/scenario.js";

export const sc = dialTone;

export const start = (seed = 1): SessionState => createSession(sc, seed).state;

export const act = (state: SessionState, input: EngineInput) => resolve(sc, state, input);

export const tick = (state: SessionState, minutes: number): SessionState =>
  resolve(sc, state, { type: "tick", minutes }).state;

export const intent = (state: SessionState, i: Intent) =>
  resolve(sc, state, { type: "intent", intent: i });

/** Runs the engine up to a minute, then applies an intent. */
export const atMinute = (state: SessionState, minute: number): SessionState =>
  state.minute >= minute ? state : tick(state, minute - state.minute);

/** Keeps the CTO answered every 8 minutes, so the session is not ended before `until`. */
export const keepAlive = (state: SessionState, until: number): SessionState => {
  let s = state;
  while (s.status === "running" && s.minute < until) {
    s = atMinute(s, Math.min(until, s.minute + 8));
    if (s.status === "running" && s.minute < until) {
      s = intent(s, tell(["cto"], { text: "Still working it." })).state;
    }
  }
  return s;
};

export const tell = (
  to: string[],
  extra: Partial<Extract<Intent, { kind: "communicate" }>> = {},
): Intent => ({ kind: "communicate", to, text: "Update.", ...extra });

export const types = (events: EngineEvent[]): string[] => events.map((e) => e.type);

export const series = (state: SessionState, metric = "customersAffected"): number[] =>
  state.series[metric] ?? [];
