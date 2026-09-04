/**
 * Seeded PRNG. xoshiro128** — small, fast, decent statistical quality, and
 * fully serializable so a run reproduces exactly from `seed` + decision log.
 */
import type { RngState } from './types.ts';

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Deterministically expands a string seed into four 32-bit words. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function seedRng(seed: string): RngState {
  const words = cyrb128(seed);
  // xoshiro can't recover from an all-zero state.
  const s: [number, number, number, number] = [
    words[0] || 1, words[1] || 2, words[2] || 3, words[3] || 4,
  ];
  const r: RngState = { algorithm: 'xoshiro128ss', s };
  for (let i = 0; i < 16; i++) rand(r); // scramble away any weak early bits
  return r;
}

/** Advances the generator in place and returns a uniform float in [0, 1). */
export function rand(r: RngState): number {
  const s = r.s;
  const t = (s[1] << 9) >>> 0;
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;

  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);

  return result / 4294967296;
}

export function randRange(r: RngState, min: number, max: number): number {
  return min + rand(r) * (max - min);
}

/** Inclusive on both ends. */
export function randInt(r: RngState, min: number, max: number): number {
  return Math.floor(randRange(r, min, max + 1));
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[randInt(r, 0, arr.length - 1)]!;
}

export function chance(r: RngState, p: number): boolean {
  return rand(r) < p;
}

/** Box-Muller. Cheap over correct: draws two uniforms per call, no cached pair. */
export function gauss(r: RngState, mean = 0, sigma = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = rand(r);
  while (v === 0) v = rand(r);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * sigma;
}
