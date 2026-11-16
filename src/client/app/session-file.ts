// A session as a file: saved from the debrief, and opened again to watch it (F-44, F-45).
//
// The file holds the seed and the player's moves. Everything else in it is a record for a person
// reading the file, or a figure to check the replay against. Nothing in a file is ever shown as
// it stands: a file is checked whole, then its moves are played through the same functions that
// typed text goes through, and the page shows what that produces (FR-29).
import { z } from "zod";
import { clockAt } from "../../engine/clock.js";
import { buildDebrief } from "../../engine/debrief.js";
import type { Scenario } from "../../engine/schema.js";
import type { SessionState } from "../../engine/state.js";
import { MAX_INPUT, replay, type Game, type Move } from "./game.js";

export const FILE_FORMAT = "brownout-session";
export const FILE_VERSION = 1;
/** NFR-10. Checked on the bytes, before anything is parsed. */
export const MAX_FILE_BYTES = 512 * 1024;
/** A session is a few dozen moves. This is far above any real one and far below a nuisance. */
export const MAX_MOVES = 2000;
const MAX_LOG = 5000;

const shortId = z.string().min(1).max(64);

const MoveSchema = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("say"),
    text: z.string().min(1).max(MAX_INPUT),
    thread: shortId.optional(),
  }),
  z.strictObject({ t: z.literal("pick"), index: z.number().int().min(0).max(20) }),
  z.strictObject({ t: z.literal("dismiss") }),
  z.strictObject({ t: z.literal("wait") }),
  z.strictObject({ t: z.literal("cancel") }),
  z.strictObject({ t: z.literal("end") }),
  z.strictObject({ t: z.literal("tick"), n: z.number().int().min(1).max(1000) }),
]);

const FileSchema = z.strictObject({
  format: z.literal(FILE_FORMAT),
  version: z.number().int().min(1),
  scenarioId: shortId,
  scenarioVersion: z.number().int().min(1),
  seed: z.number().int().min(0).max(999_999_999),
  moves: z.array(MoveSchema).max(MAX_MOVES),
  /** How the session stood when it was saved. The replay is compared with this. */
  result: z.strictObject({
    status: z.enum(["running", "resolved", "relieved", "timeout", "ended"]),
    minute: z.number().int().min(0).max(100_000),
    score: z.number().int().min(0).max(100),
    events: z.number().int().min(0).max(MAX_LOG),
    digest: z.string().regex(/^[0-9a-f]{8}$/),
  }),
  /** The event log in words, for someone reading the file. Never drawn from. */
  log: z
    .array(
      z.strictObject({
        id: shortId,
        clock: z.string().max(8),
        type: z.string().min(1).max(40),
        text: z.string().max(4000).optional(),
      }),
    )
    .max(MAX_LOG),
});

export type SessionFile = z.infer<typeof FileSchema>;

/** A short fingerprint of a whole session state. For telling two sessions apart, not for secrecy. */
export function digestOf(session: SessionState): string {
  const text = JSON.stringify(session);
  let hash = 0x811c9dc5;
  for (let n = 0; n < text.length; n++) {
    hash ^= text.charCodeAt(n);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const resultOf = (scenario: Scenario, session: SessionState): SessionFile["result"] => ({
  status: session.status,
  minute: session.minute,
  score: buildDebrief(scenario, session).score.overall,
  events: session.log.length,
  digest: digestOf(session),
});

export function exportSession(scenario: Scenario, game: Game): SessionFile {
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    seed: game.seed,
    moves: game.moves,
    result: resultOf(scenario, game.session),
    log: game.session.log.map((e) => ({
      id: e.id,
      clock: clockAt(scenario.startClock, e.minute),
      type: e.type,
      ...(e.text ? { text: e.text } : {}),
    })),
  };
}

export const fileText = (file: SessionFile): string => `${JSON.stringify(file, null, 2)}\n`;

/** "brownout-dial-tone-seed-7.json" */
export const fileName = (file: Pick<SessionFile, "scenarioId" | "seed">): string =>
  `brownout-${file.scenarioId}-seed-${file.seed}.json`;

export type Loaded =
  | {
      ok: true;
      scenario: Scenario;
      seed: number;
      moves: Move[];
      /** One game for each point in the record, the opening first. */
      steps: Game[];
      /** False when the moves no longer give the session the file says they gave. */
      exact: boolean;
    }
  | { ok: false; reason: string };

const NOT_OURS = "This file is not a BrownOut session, or it is damaged. Nothing was opened.";

/** The size of a text as a file, in bytes. */
export const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

/**
 * Checks a file's text and, if it is a session this copy can play, plays it. Every way of failing
 * gives a sentence to show and nothing else.
 */
export function loadSession(text: string, find: (id: string) => Scenario | undefined): Loaded {
  if (bytesOf(text) > MAX_FILE_BYTES) {
    return { ok: false, reason: "This file is larger than 512 KB, so it was not opened." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: NOT_OURS };
  }
  const isNewer =
    typeof raw === "object" &&
    raw !== null &&
    (raw as { format?: unknown }).format === FILE_FORMAT &&
    typeof (raw as { version?: unknown }).version === "number" &&
    (raw as { version: number }).version > FILE_VERSION;
  if (isNewer) {
    return {
      ok: false,
      reason: "This session was saved by a newer version of BrownOut than this one.",
    };
  }
  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: NOT_OURS };
  const file = parsed.data;
  const scenario = find(file.scenarioId);
  if (!scenario) {
    return {
      ok: false,
      reason: "This session is for a situation that this copy of BrownOut does not have.",
    };
  }
  let steps: Game[];
  try {
    steps = replay(scenario, file.seed, file.moves);
  } catch {
    return { ok: false, reason: "This session could not be played back. Nothing was opened." };
  }
  const last = steps[steps.length - 1] as Game;
  const now = resultOf(scenario, last.session);
  const exact =
    scenario.version === file.scenarioVersion &&
    now.digest === file.result.digest &&
    now.status === file.result.status &&
    now.minute === file.result.minute &&
    now.events === file.result.events;
  return { ok: true, scenario, seed: file.seed, moves: file.moves, steps, exact };
}

/** What a move was, in words, for the line under the replay controls. */
export function describeMove(scenario: Scenario, move: Move | undefined): string {
  if (!move) return "The opening.";
  switch (move.t) {
    case "say": {
      const to = move.thread
        ? (scenario.stakeholders.find((s) => s.id === move.thread)?.name ?? move.thread)
        : null;
      return to ? `Replied to ${to}: "${move.text}"` : `Typed: "${move.text}"`;
    }
    case "pick":
      return `Chose option ${move.index + 1} of the ones offered.`;
    case "dismiss":
      return "Closed the question without choosing.";
    case "wait":
      return "Waited for the next thing to happen.";
    case "cancel":
      return "Cancelled the running task.";
    case "end":
      return "Ended the incident.";
    case "tick":
      return move.n === 1 ? "One minute passed." : `${move.n} minutes passed.`;
  }
}
