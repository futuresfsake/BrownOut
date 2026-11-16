// The five places the camera can be. There is no free movement: the game is decisions under
// time pressure, not navigation (DL-21). Plain data and pure functions, no three.js here.

export type StationId = "desk" | "log" | "inbox" | "board" | "press";
export type PanelId = "log" | "inbox" | "board" | "press";
type Vec3 = readonly [number, number, number];

export interface Station {
  id: StationId;
  key: "1" | "2" | "3" | "4" | "5";
  label: string;
  /** The object the camera looks at, named for people who cannot see it. */
  object: string;
  position: Vec3;
  target: Vec3;
  panel: PanelId | null;
}

export const STATIONS: readonly Station[] = [
  {
    id: "desk",
    key: "1",
    label: "Desk",
    object: "The whole room from your desk",
    position: [0, 1.55, 3.6],
    target: [0, 1.38, -3.5],
    panel: null,
  },
  {
    id: "log",
    key: "2",
    label: "Log",
    object: "The logbook",
    position: [-1.2, 1.5, 2.3],
    target: [-1.2, 0.8, 1.15],
    panel: "log",
  },
  {
    id: "inbox",
    key: "3",
    label: "Inbox",
    object: "The phone and the desk monitor",
    position: [0.9, 1.5, 2.75],
    target: [0.9, 0.95, 1.1],
    panel: "inbox",
  },
  {
    id: "board",
    key: "4",
    label: "Board",
    object: "The wall board",
    position: [-1.9, 1.72, 0.4],
    target: [-1.9, 1.78, -3.5],
    panel: "board",
  },
  {
    id: "press",
    key: "5",
    label: "Press",
    object: "The television",
    // Past the front edge of Mika's desk, so nothing on it stands between you and the screen.
    position: [2.55, 1.85, -1.1],
    target: [2.55, 1.88, -3.5],
    panel: "press",
  },
];

export const stationOf = (id: StationId): Station =>
  STATIONS.find((s) => s.id === id) ?? (STATIONS[0] as Station);

export const stationForKey = (key: string): StationId | null =>
  STATIONS.find((s) => s.key === key)?.id ?? null;

/** Swiping moves one station along, and stops at the ends. */
export function neighbour(id: StationId, step: 1 | -1): StationId {
  const at = STATIONS.findIndex((s) => s.id === id);
  const next = Math.min(STATIONS.length - 1, Math.max(0, at + step));
  return (STATIONS[next] as Station).id;
}

export const MOVE_MS = 500;

/** Ease in and out, so the camera does not start or stop with a jolt. */
export const ease = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};

export const mix = (a: Vec3, b: Vec3, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The vertical field of view. 40 degrees on a wide screen for a model-like look; wider on a
 * narrow one so the wall board and the television still fit across the frame.
 */
export function fieldOfView(aspect: number): number {
  const base = 40;
  const wide = 1.45;
  if (aspect >= wide) return base;
  const half = Math.atan((Math.tan(((base / 2) * Math.PI) / 180) * wide) / Math.max(aspect, 0.3));
  return Math.min(78, (half * 2 * 180) / Math.PI);
}
