// Deterministic RNG. Math.random() is unavailable in some harness contexts and
// non-reproducible besides; a seeded generator lets a release resolve the same
// way given the same inputs, which keeps the sim testable.

// mulberry32 — small, fast, good enough for game variance.
export function makeRng(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Derive a stable integer seed from a string (set name + week, etc.).
export function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Random float in [min, max).
export function range(rng, min, max) {
  return min + rng() * (max - min)
}
