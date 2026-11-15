// How the driving metric moves. Pure functions of time and the active mode.
import type { Segment } from "./schema.js";

export function interpolate(points: readonly (readonly [number, number])[], t: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new Error("a curve needs at least one point");
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b && t <= b[0]) {
      const span = b[0] - a[0];
      return span === 0 ? b[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / span;
    }
  }
  return last[1];
}

export interface ModeStart {
  minute: number;
  value: number;
}

/** The value of a mode at minute `t`, given when it was switched on and the value at that time. */
export function evalMode(
  modes: Readonly<Record<string, readonly Segment[]>>,
  name: string,
  t: number,
  start: ModeStart,
  depth = 0,
): number {
  const segments = modes[name];
  if (!segments) throw new Error(`unknown mode "${name}"`);
  if (depth > 4) throw new Error(`modes nest too deeply at "${name}"`);
  let from = start.value;
  let elapsed = t - start.minute;
  for (const seg of segments) {
    if (seg.kind === "curve") return interpolate(seg.points, t);
    if (seg.kind === "follow") {
      return evalMode(modes, seg.mode, t, start, depth + 1) * (seg.multiplier ?? 1);
    }
    if (seg.kind === "hold") {
      if (seg.for === undefined || elapsed < seg.for) return from;
      elapsed -= seg.for;
      continue;
    }
    const target = seg.to ?? start.value * (seg.toFactor ?? 1);
    if (elapsed < seg.over) return from + (target - from) * (elapsed / seg.over);
    elapsed -= seg.over;
    from = target;
  }
  return from;
}
