/**
 * Deterministic seeded RNG for reproducible sim runs.
 *
 * Why deterministic: when a user replays a saved game, the sim should
 * produce the same result. When a bug is reported with a save file, we need
 * to reproduce the bug exactly. JS's Math.random() can't do that.
 *
 * mulberry32 is a small, fast, well-distributed PRNG. Good enough for game
 * sim — not cryptographic.
 */

export interface Rng {
  /** Uniform [0, 1). */
  random(): number;
  /** Uniform integer [0, n). Throws if n <= 0. */
  randInt(n: number): number;
  /** Pick a random element from a non-empty array. Throws if empty. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted pick. weights array must align with items; sum > 0. */
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** True with probability p (0 to 1). */
  chance(p: number): boolean;
}

/** mulberry32 — small fast 32-bit PRNG. */
export function createRng(seed: number | string): Rng {
  // Hash string seeds to a 32-bit integer
  let s = typeof seed === 'number' ? seed : hashString(seed);
  s = s >>> 0; // coerce to uint32

  function next(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    random: next,
    randInt(n: number): number {
      if (n <= 0) throw new Error(`randInt(${n}) requires n > 0`);
      return Math.floor(next() * n);
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick() requires a non-empty array');
      return arr[Math.floor(next() * arr.length)];
    },
    pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
      if (items.length === 0) throw new Error('pickWeighted() requires non-empty items');
      if (items.length !== weights.length) {
        throw new Error(`pickWeighted: items (${items.length}) and weights (${weights.length}) length mismatch`);
      }
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) throw new Error('pickWeighted: weights must sum > 0');
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      // Floating-point fallthrough; return last
      return items[items.length - 1];
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
