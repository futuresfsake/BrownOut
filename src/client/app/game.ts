// The game as the interface sees it: the engine's session plus what is on screen.
// Pure functions, so the whole flow is tested without a browser.
import { clockOf, createSession, resolve, severityLevel } from "../../engine/engine.js";
import type { Scenario } from "../../engine/schema.js";
import type { EngineEvent, EngineInput, SessionState } from "../../engine/state.js";
import { applyIntents, takeTurn } from "../../game/turn.js";
import type { Candidate } from "../../matcher/matcher.js";

export type FeedWho = "alert" | "you" | "read" | "mika" | "inbox" | "note" | "system";

export interface FeedItem {
  id: string;
  minute: number;
  who: FeedWho;
  text: string;
  /** For inbox pointers: whose thread to open. */
  threadId?: string | undefined;
  signal?: boolean | undefined;
}

export interface Pending {
  kind: "choose" | "suggest";
  candidates: Candidate[];
  /** What the player typed, kept so the log can show it once they choose. */
  typed?: string | undefined;
}

export interface Game {
  scenarioId: string;
  seed: number;
  session: SessionState;
  feed: FeedItem[];
  pending: Pending | null;
  paused: boolean;
  /** Counts notes the interface adds itself, so their ids stay unique. */
  notes: number;
}

export const MAX_INPUT = 600;

const strip = (text: string) => text.replace(/^(?:Mika|You): /, "").replace(/^You to /, "To ");

/**
 * Turns engine events into lines for the duty log. Some events are not shown at all.
 * When the typed words are known, an order is logged as typed, followed by how it was read.
 */
export function feedFrom(
  scenario: Scenario,
  events: readonly EngineEvent[],
  typed?: string,
): FeedItem[] {
  const items: FeedItem[] = [];
  let words = typed;
  for (const e of events) {
    const base = { id: e.id, minute: e.minute };
    const text = e.text ?? "";
    switch (e.type) {
      case "alert":
        items.push({ ...base, who: "alert", text, signal: true });
        break;
      case "player_action":
        if (words !== undefined && words !== strip(text)) {
          items.push({ id: `${e.id}-typed`, minute: e.minute, who: "you", text: words });
          items.push({ ...base, who: "read", text: strip(text) });
        } else {
          items.push({ ...base, who: "you", text: strip(text) });
        }
        words = undefined;
        break;
      case "player_message":
        items.push({ ...base, who: "you", text: strip(text) });
        break;
      case "task_started":
      case "task_queued":
      case "task_cancelled":
      case "task_completed":
        items.push({ ...base, who: "mika", text: strip(text) });
        break;
      case "message": {
        const from = String(e.data?.from ?? "");
        const name = scenario.stakeholders.find((s) => s.id === from)?.name ?? from;
        items.push({ ...base, who: "inbox", text: `${name} wrote to you.`, threadId: from });
        break;
      }
      case "commitment_made":
      case "commitment_kept":
      case "obligation":
      case "claim_corrected":
        items.push({ ...base, who: "note", text });
        break;
      case "commitment_broken":
      case "claim_surfaced":
        items.push({ ...base, who: "note", text, signal: true });
        break;
      case "not_understood":
      case "refused":
        // Nothing was done, so the engine logged no action: show the words that were turned down.
        if (words !== undefined) {
          items.push({ id: `${e.id}-typed`, minute: e.minute, who: "you", text: words });
          words = undefined;
        }
        items.push({
          ...base,
          who: text.startsWith("Mika: ") ? "mika" : "system",
          text: strip(text),
        });
        break;
      case "ended":
        items.push({ ...base, who: "system", text: strip(text) });
        break;
      default:
        break; // trust, clues, raw claims and the like stay behind the scenes
    }
  }
  return items;
}

export function newGame(scenario: Scenario, seed: number): Game {
  const { state, events } = createSession(scenario, seed);
  return {
    scenarioId: scenario.id,
    seed,
    session: state,
    feed: feedFrom(scenario, events),
    pending: null,
    paused: false,
    notes: 0,
  };
}

function withEvents(
  scenario: Scenario,
  game: Game,
  session: SessionState,
  events: EngineEvent[],
  typed?: string,
): Game {
  return {
    ...game,
    session,
    feed: [...game.feed, ...feedFrom(scenario, events, typed)],
    pending: null,
  };
}

function note(game: Game, text: string): Game {
  const item: FeedItem = {
    id: `n${game.notes + 1}`,
    minute: game.session.minute,
    who: "system",
    text,
  };
  return { ...game, feed: [...game.feed, item], notes: game.notes + 1 };
}

/** The player typed something, in the decision box or as a reply in a thread. */
export function submit(scenario: Scenario, game: Game, text: string, threadId?: string): Game {
  const trimmed = text.trim().slice(0, MAX_INPUT);
  if (trimmed === "" || game.session.status !== "running") return game;
  const turn = takeTurn(scenario, game.session, trimmed, threadId);
  if (turn.choose) {
    return { ...game, pending: { kind: "choose", candidates: turn.choose, typed: trimmed } };
  }
  let next = withEvents(scenario, game, turn.state, turn.events, trimmed);
  for (const part of turn.unread) next = note(next, `Not understood: "${part}"`);
  if (turn.suggestions && turn.suggestions.length > 0) {
    next = { ...next, pending: { kind: "suggest", candidates: turn.suggestions } };
  }
  return next;
}

/** The player picked one of the offered readings. */
export function pick(scenario: Scenario, game: Game, index: number): Game {
  const candidate = game.pending?.candidates[index];
  if (!candidate || game.session.status !== "running") return game;
  const done = applyIntents(scenario, game.session, [candidate.intent]);
  return withEvents(scenario, game, done.state, done.events, game.pending?.typed);
}

export const dismiss = (game: Game): Game => ({ ...game, pending: null });

/** Wait, cancel, end, or an idle tick of the clock. */
export function control(scenario: Scenario, game: Game, input: EngineInput): Game {
  if (game.session.status !== "running") return game;
  if (input.type === "tick" && game.paused) return game;
  const step = resolve(scenario, game.session, input);
  // An idle tick must not wipe a question the player is still answering.
  const next = withEvents(scenario, game, step.state, step.events);
  return input.type === "tick" ? { ...next, pending: game.pending } : next;
}

export const setPaused = (game: Game, paused: boolean): Game => ({ ...game, paused });

// ---------------------------------------------------------------------------------------------
// What the panels show. Derived, never stored.

export interface BoardView {
  clock: string;
  elapsed: number;
  severity: 0 | 1 | 2;
  severityWord: string;
  systems: { id: string; label: string; status: string; ok: boolean }[];
  /** `value` is null while the figure is unknown. `trend` compares it with a minute ago. */
  metrics: { id: string; label: string; value: string | null; trend: "" | "rising" | "falling" }[];
  task: { label: string; minutesLeft: number } | null;
  queued: string | null;
}

const SEVERITY_WORDS = ["Normal", "Incident running", "Severe"] as const;

export function boardView(scenario: Scenario, session: SessionState): BoardView {
  const labelOf = (kind: "investigate" | "mitigate", id: string) =>
    (kind === "investigate"
      ? scenario.investigations.find((i) => i.id === id)?.label
      : scenario.mitigations.find((m) => m.id === id)?.label) ?? id;
  const severity = severityLevel(scenario, session);
  return {
    clock: clockOf(scenario, session.minute),
    elapsed: session.minute,
    severity,
    severityWord: SEVERITY_WORDS[severity],
    systems: scenario.systems.map((s) => {
      const status = session.systems[s.id] ?? "ok";
      return {
        id: s.id,
        label: s.label,
        status: s.labels?.[status] ?? status,
        ok: status === "ok",
      };
    }),
    metrics: scenario.metrics.map((m) => {
      const known = session.visibleMetrics.includes(m.id);
      const now = session.series[m.id]?.[session.minute] ?? 0;
      const before = session.series[m.id]?.[session.minute - 1] ?? now;
      return {
        id: m.id,
        label: m.label,
        value: known ? now.toLocaleString("en-US") : null,
        trend: !known || now === before ? "" : now > before ? "rising" : "falling",
      };
    }),
    task: session.task
      ? {
          label: labelOf(session.task.kind, session.task.id),
          minutesLeft: Math.max(0, session.task.endMinute - session.minute),
        }
      : null,
    queued: session.queuedTask ? labelOf(session.queuedTask.kind, session.queuedTask.id) : null,
  };
}

export interface ThreadView {
  id: string;
  name: string;
  role: string;
  /** Press threads are listed apart and set in the published face. */
  press: boolean;
  /** "", "Unanswered" or "Overdue". Never colour alone. */
  state: "" | "Unanswered" | "Overdue";
  waitingMinutes: number;
  preview: string;
  lastMinute: number;
  messages: { minute: number; clock: string; mine: boolean; text: string }[];
  promises: { what: string; due: string | null; status: "open" | "kept" | "broken" }[];
  /** The nearest open promise with a time on it. `soon` means five minutes or less. */
  nextDue: { clock: string; soon: boolean } | null;
}

const DUE_SOON_MINUTES = 5;

export function threadViews(scenario: Scenario, session: SessionState): ThreadView[] {
  return scenario.stakeholders
    .filter((s) => s.id !== "engineer")
    .map((s) => {
      const thread = session.threads[s.id] ?? { messages: [] };
      const since = thread.unansweredSince;
      const waiting = since === undefined ? 0 : session.minute - since;
      const last = thread.messages[thread.messages.length - 1];
      const state: ThreadView["state"] =
        since === undefined ? "" : waiting > s.patienceMinutes ? "Overdue" : "Unanswered";
      const dueMinutes = session.commitments
        .filter((c) => c.to === s.id && c.status === "open" && c.dueMinute !== null)
        .map((c) => c.dueMinute as number);
      const due = dueMinutes.length > 0 ? Math.min(...dueMinutes) : null;
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        press: s.channel === "press",
        state,
        waitingMinutes: waiting,
        preview: last ? last.text : "",
        lastMinute: last ? last.minute : -1,
        messages: thread.messages.map((m) => ({
          minute: m.minute,
          clock: clockOf(scenario, m.minute),
          mine: m.from === "player",
          text: m.text,
        })),
        promises: session.commitments
          .filter((c) => c.to === s.id)
          .map((c) => ({
            what: c.what,
            due: c.dueMinute === null ? null : clockOf(scenario, c.dueMinute),
            status: c.status,
          })),
        nextDue:
          due === null
            ? null
            : { clock: clockOf(scenario, due), soon: due - session.minute <= DUE_SOON_MINUTES },
      };
    });
}

export const unansweredCount = (views: readonly ThreadView[]): number =>
  views.filter((v) => v.state !== "").length;

// ---------------------------------------------------------------------------------------------
// Saving a game in the tab, so a reload does not lose it.

const SAVE_VERSION = 1;

export function serialise(game: Game): string {
  return JSON.stringify({ v: SAVE_VERSION, game });
}

/** Returns the saved game, or null if the text is not one this version wrote. */
export function deserialise(text: string | null, scenarioIds: readonly string[]): Game | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { v, game } = parsed as { v?: unknown; game?: Game };
    if (v !== SAVE_VERSION || !game || !scenarioIds.includes(game.scenarioId)) return null;
    if (!Array.isArray(game.feed) || typeof game.session?.minute !== "number") return null;
    return game;
  } catch {
    return null;
  }
}
