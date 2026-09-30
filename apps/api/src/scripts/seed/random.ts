/**
 * Deterministic PRNG (mulberry32) so every developer gets the same seed data for a given
 * seed value — screenshots, bug reports and tests stay reproducible.
 */
export interface Random {
  next(): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: (probability) => next() < probability,
  };
}
