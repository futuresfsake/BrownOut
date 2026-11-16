// Noticing a room that draws slowly, so flat view can be offered (FR-32, US-36). The room draws
// on demand, so most of the time there are no frames at all: only frames that follow one another
// closely say anything about speed. Plain numbers in, plain numbers out, so it is unit tested.

/** A frame slower than this is below 24 frames a second. */
export const SLOW_FRAME_MS = 1000 / 24;
/** This much slow drawing in a row is "sustained". */
export const SLOW_FOR_MS = 5000;
/** A gap longer than this is the room standing still, not a slow frame. */
export const STILL_GAP_MS = 250;

export interface Pace {
  /** Milliseconds of back-to-back slow frames so far. */
  slowFor: number;
  /** When the last frame was drawn. */
  last: number;
  /** The player has been told once. They are not told again. */
  told: boolean;
}

export const startPace = (): Pace => ({ slowFor: 0, last: 0, told: false });

/** Takes the time of a new frame. `tell` is true on the one frame where slowness becomes sustained. */
export function paceStep(pace: Pace, now: number): { pace: Pace; tell: boolean } {
  const gap = now - pace.last;
  if (gap > STILL_GAP_MS) return { pace: { ...pace, slowFor: 0, last: now }, tell: false };
  const slowFor = gap > SLOW_FRAME_MS ? pace.slowFor + gap : 0;
  const tell = slowFor >= SLOW_FOR_MS && !pace.told;
  return { pace: { slowFor, last: now, told: pace.told || tell }, tell };
}

/** What the last frame cost, read from the renderer for the performance evidence. */
export interface FrameCost {
  calls: number;
  triangles: number;
}
