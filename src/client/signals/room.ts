// What the room shows, decided from the same views the panels use. Pure, so "given this session
// the phone lamp is on and the lights are at level 2" is a unit test, not a screenshot.
import type { BoardView, ThreadView } from "../app/game.js";

export type LampState = "off" | "on" | "overdue";

export interface RoomSignals {
  /** 0 full light, 1 incident running, 2 browned out with the emergency strip on. */
  level: 0 | 1 | 2;
  emergencyStrip: boolean;
  /** Sim time for the wall clock. The hands stop while paused. */
  clock: { hours: number; minutes: number; text: string; running: boolean };
  board: {
    severityWord: string;
    systems: { label: string; status: string; ok: boolean }[];
    figures: { label: string; value: string; changed: boolean }[];
  };
  /** Lines written in the logbook. The room shows how full the page is, not the words. */
  logLines: number;
  /** The desk monitor: how many people are waiting. */
  monitorCount: number;
  /** Who is standing in the room, longest wait first (at most three). */
  visitors: { name: string; overdue: boolean; press: boolean; waitingMinutes: number }[];
  /** The phone: lit while anyone other than the press is unanswered. */
  phone: LampState;
  phoneFrom: string | null;
  /** The television: off until the press first writes. */
  tv: { on: boolean; outlet: string; headline: string; waiting: LampState };
  /** Mika's desk lamp: on while a task runs. */
  mikaLamp: boolean;
}

const HEADLINE_MAX = 64;

/** The first sentence of a press message, without the "Name, Outlet:" in front of it. */
export function headlineOf(text: string): string {
  const body = text.replace(/^[^:]{1,60}:\s+/, "");
  const first = body.split(/(?<=[.!?])\s+/)[0] ?? body;
  const clean = first.replace(/[.!]$/, "").trim();
  if (clean.length <= HEADLINE_MAX) return clean;
  const cut = clean.slice(0, HEADLINE_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
}

/** "Reporter, The Daily Circuit" gives "The Daily Circuit". */
export const outletOf = (role: string): string => role.split(",").slice(1).join(",").trim() || role;

const lampOf = (threads: readonly ThreadView[]): LampState =>
  threads.some((t) => t.state === "Overdue")
    ? "overdue"
    : threads.some((t) => t.state === "Unanswered")
      ? "on"
      : "off";

export function roomSignals(
  board: BoardView,
  threads: readonly ThreadView[],
  logLines: number,
  status: { running: boolean; paused: boolean },
): RoomSignals {
  const people = threads.filter((t) => !t.press);
  const press = threads.filter((t) => t.press);
  const [hours = 0, minutes = 0] = board.clock.split(":").map(Number);

  const latestPress = press
    .flatMap((t) => t.messages.filter((m) => !m.mine).map((m) => ({ ...m, role: t.role })))
    .sort((a, b) => a.minute - b.minute)
    .at(-1);

  // The phone shows whoever has waited longest among the people still unanswered.
  const waiting = people
    .filter((t) => t.state !== "")
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes);

  return {
    level: board.severity,
    emergencyStrip: board.severity === 2,
    clock: {
      hours,
      minutes,
      text: board.clock,
      running: status.running && !status.paused,
    },
    board: {
      severityWord: board.severityWord,
      systems: board.systems.map((s) => ({ label: s.label, status: s.status, ok: s.ok })),
      figures: board.metrics.map((m) => ({
        label: m.label,
        value: m.value ?? "unknown",
        changed: m.trend !== "",
      })),
    },
    logLines,
    monitorCount: threads.filter((t) => t.state !== "").length,
    visitors: threads
      .filter((t) => t.state !== "")
      .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
      .slice(0, 3)
      .map((t) => ({
        name: t.name,
        overdue: t.state === "Overdue",
        press: t.press,
        waitingMinutes: t.waitingMinutes,
      })),
    phone: lampOf(people),
    phoneFrom: waiting[0]?.name ?? null,
    tv: {
      on: latestPress !== undefined,
      outlet: latestPress ? outletOf(latestPress.role) : "",
      headline: latestPress ? headlineOf(latestPress.text) : "",
      waiting: lampOf(press),
    },
    mikaLamp: status.running && board.task !== null,
  };
}

/** One line for screen readers and for tests: what the room is showing right now. */
export function describeRoom(s: RoomSignals): string {
  const parts = [
    `Lights at level ${s.level}${s.emergencyStrip ? ", emergency strip on" : ""}.`,
    `Clock ${s.clock.text}${s.clock.running ? "" : ", stopped"}.`,
    s.phone === "off"
      ? "Phone quiet."
      : `Phone lit: ${s.phoneFrom ?? "someone"} is ${s.phone === "overdue" ? "overdue" : "waiting"}.`,
    s.tv.on ? `Television on: ${s.tv.headline}.` : "Television off.",
    s.mikaLamp ? "Mika's lamp on." : "Mika's lamp off.",
  ];
  return parts.join(" ");
}
