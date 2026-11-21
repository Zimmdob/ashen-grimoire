// Seeded PRNG (mulberry32). All gameplay randomness reads and advances world.seed,
// so the same seed plus the same actions always produce the same game.
export interface Seeded { seed: number }

export function rand(s: Seeded): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (s: Seeded, n: number) => Math.floor(rand(s) * n);
export const pick = <T>(s: Seeded, a: readonly T[]): T => a[randInt(s, a.length)];
export function shuffle<T>(s: Seeded, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
