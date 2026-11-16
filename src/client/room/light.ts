// The brownout. Three light levels follow severity; a change is a short fade with at most two
// brief dips, so it reads as mains power sagging without ever flashing fast enough to be a
// hazard (WCAG 2.3.1 allows no more than three flashes in a second; this stays at two).

export const LEVELS = [1, 0.7, 0.45] as const;
export const FADE_MS = 600;

/** When each dip is deepest, as a share of the fade, and how deep and wide it is. */
const DIPS = [
  { at: 0.25, depth: 0.22, width: 0.09 },
  { at: 0.6, depth: 0.14, width: 0.08 },
] as const;

export const brightnessOf = (level: 0 | 1 | 2): number => LEVELS[level];

/**
 * Ceiling brightness part-way through a change. `elapsed` is milliseconds since it began.
 * With `steady` (reduced motion) the change is instant and there are no dips.
 */
export function brightnessAt(from: number, to: number, elapsed: number, steady = false): number {
  if (steady || elapsed >= FADE_MS || from === to) return to;
  if (elapsed <= 0) return from;
  const t = elapsed / FADE_MS;
  const base = from + (to - from) * t;
  // Dips only when the light is going down: power sags on the way out, it does not on the way back.
  if (to >= from) return base;
  let dip = 0;
  for (const d of DIPS) {
    const distance = Math.abs(t - d.at) / d.width;
    if (distance < 1) dip = Math.max(dip, d.depth * (1 - distance));
  }
  return Math.max(0.2, base - dip);
}

/** How many separate dips a fade has. Tests hold this at two or fewer. */
export const DIP_COUNT = DIPS.length;
