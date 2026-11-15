// Seeded random numbers (mulberry32). The engine never uses Math.random, so a seed fixes a session.

/** Returns a number in [0, 1) and the next generator state. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), 1 | next);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

/** Returns an integer in [-spread, +spread] and the next generator state. */
export function jitter(state: number, spread: number): [number, number] {
  const [r, next] = nextRandom(state);
  return [Math.floor(r * (2 * spread + 1)) - spread, next];
}
