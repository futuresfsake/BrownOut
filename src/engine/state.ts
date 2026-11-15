// Session state and the things the engine returns. All of it is plain JSON, so a session can be
// exported, replayed and compared byte for byte.
import type { Intent, Stance, SystemStatus, Truth } from "./schema.js";

export type EventType =
  | "session_started"
  | "player_action"
  | "not_understood"
  | "refused"
  | "task_started"
  | "task_queued"
  | "task_cancelled"
  | "task_completed"
  | "clue_revealed"
  | "mitigation_applied"
  | "message"
  | "alert"
  | "player_message"
  | "directive"
  | "claim"
  | "claim_surfaced"
  | "claim_corrected"
  | "commitment_made"
  | "commitment_kept"
  | "commitment_broken"
  | "trust"
  | "obligation"
  | "ended";

export type EventData = Record<string, string | number | boolean | string[]>;

export interface EngineEvent {
  id: string;
  minute: number;
  type: EventType;
  text?: string | undefined;
  data?: EventData | undefined;
}

export type Status = "running" | "resolved" | "relieved" | "timeout" | "ended";

export interface ModeState {
  name: string;
  startMinute: number;
  startValue: number;
}

export interface Task {
  kind: "investigate" | "mitigate";
  id: string;
  startMinute: number;
  endMinute: number;
  priorMode: ModeState;
}

export interface QueuedTask {
  kind: "investigate" | "mitigate";
  id: string;
}

export interface ThreadMessage {
  minute: number;
  from: string; // a stakeholder id, or "player"
  text: string;
  beatId?: string | undefined;
}

export interface Thread {
  messages: ThreadMessage[];
  unansweredSince?: number | undefined;
  lastProactive?: number | undefined;
}

export interface Commitment {
  id: string;
  to: string;
  what: string;
  madeAtMinute: number;
  dueMinute: number | null;
  status: "open" | "kept" | "broken";
  eventId: string;
}

export interface Claim {
  id: string;
  topic: string;
  stance: Stance;
  audience: string[];
  text: string;
  madeAtMinute: number;
  truth: Truth;
  supported: boolean;
  surfaced: boolean;
  corrected: boolean;
  eventId: string;
}

export interface DirectiveSent {
  id: string;
  to: string[];
  minute: number;
}

export interface ObligationRecord {
  triggeredAt?: number | undefined;
  lastState: string;
}

export interface SessionState {
  scenarioId: string;
  scenarioVersion: number;
  seed: number;
  rng: number;
  minute: number;
  status: Status;
  systems: Record<string, SystemStatus>;
  mode: ModeState;
  series: Record<string, number[]>;
  visibleMetrics: string[];
  revealedClues: string[];
  completedInvestigations: { id: string; minute: number }[];
  appliedMitigations: { id: string; minute: number }[];
  task: Task | null;
  queuedTask: QueuedTask | null;
  firedBeats: string[];
  skippedBeats: string[];
  beatOffsets: Record<string, number>;
  beatPending: Record<string, number>;
  threads: Record<string, Thread>;
  trust: Record<string, number>;
  commitments: Commitment[];
  claims: Claim[];
  directivesSent: DirectiveSent[];
  obligations: Record<string, ObligationRecord>;
  replyStats: { episodes: number; inTime: number };
  log: EngineEvent[];
  nextEventId: number;
}

export type EngineInput =
  | { type: "intent"; intent: Intent }
  | { type: "wait" }
  | { type: "tick"; minutes: number }
  | { type: "cancelTask" }
  | { type: "end" };

/** One piece of text the narrator will write in M2. Until then `fallbackText` is shown as is. */
export interface RenderRequest {
  id: string; // the id of the event it belongs to
  kind: "taskResult" | "message" | "alert";
  from: string;
  channel: "log" | "chat" | "email" | "press";
  purpose: string;
  facts: string[];
  quote?: string | undefined;
  fallbackText: string;
}

export interface Resolution {
  state: SessionState;
  events: EngineEvent[];
  renderRequests: RenderRequest[];
}
