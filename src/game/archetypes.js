// Archetypes — the metashare distribution and the operations on it.
//
// The metagame's archetype health is NOT a single scalar: it's how the field
// splits across the four play styles (the brief's aggro/control/combo/midrange
// rock-paper-scissors). A balanced field keeps everyone; one style at 60% drives
// out the players who prefer the squeezed-out styles.
//
// This module owns the distribution math; sets/bans/simulation/segments all go
// through these helpers so there's one definition of "shift", "concentrate",
// "flatten", and the derived balance number.

import { clamp } from './simulation.js'

export const ARCHETYPES = ['aggro', 'control', 'combo', 'midrange']

export const EVEN_SHARE = 25 // 100 / 4 — a perfectly flat field

// Normalize a {aggro,control,combo,midrange} object so the four shares sum to
// 100 (guards against drift from repeated float ops). Negative clamps to 0.
export function normalize(dist) {
  const safe = {}
  let total = 0
  for (const a of ARCHETYPES) {
    safe[a] = Math.max(0, dist[a] ?? 0)
    total += safe[a]
  }
  if (total === 0) return { aggro: 25, control: 25, combo: 25, midrange: 25 }
  const out = {}
  for (const a of ARCHETYPES) out[a] = (safe[a] / total) * 100
  return out
}

// Shift `points` of metashare into the given target archetypes, drawn
// proportionally from the others. Used on release (theme lean) — a stronger set
// shifts more. Returns a new normalized distribution.
export function shiftToward(dist, targets, points) {
  const d = { ...normalize(dist) }
  const per = points / targets.length
  for (const t of targets) {
    if (!ARCHETYPES.includes(t)) continue
    const others = ARCHETYPES.filter((a) => a !== t)
    const drawPool = others.reduce((s, a) => s + d[a], 0)
    if (drawPool <= 0) continue
    const take = Math.min(per, drawPool) // can't draw more than exists
    for (const a of others) d[a] -= take * (d[a] / drawPool) // proportional
    d[t] += take
  }
  return normalize(d)
}

// Shift `points` of metashare OUT of one archetype, redistributed to the other
// three proportionally to their current share. This is the counter-tech move: an
// anti-aggro card pushes share off aggro and into whatever else is playable.
// Returns a new normalized distribution.
export function shiftAway(dist, archetype, points) {
  if (!ARCHETYPES.includes(archetype)) return normalize(dist)
  const d = { ...normalize(dist) }
  const take = Math.min(points, d[archetype]) // can't remove more than exists
  const others = ARCHETYPES.filter((a) => a !== archetype)
  const pool = others.reduce((s, a) => s + d[a], 0)
  d[archetype] -= take
  if (pool <= 0) {
    // Nothing else on the field — spread evenly.
    for (const a of others) d[a] += take / others.length
  } else {
    for (const a of others) d[a] += take * (d[a] / pool)
  }
  return normalize(d)
}

// Concentrate the field toward its current largest archetype (the community
// solving the format and piling into the best deck). `intensity` 0..1 scales how
// much share migrates this step. Returns a new normalized distribution.
export function concentrate(dist, intensity) {
  const d = { ...normalize(dist) }
  const top = ARCHETYPES.reduce((a, b) => (d[b] > d[a] ? b : a))
  const others = ARCHETYPES.filter((a) => a !== top)
  for (const a of others) {
    const move = d[a] * intensity * 0.5 // fraction of each smaller share migrates up
    d[a] -= move
    d[top] += move
  }
  return normalize(d)
}

// Flatten the field toward an even 25/25/25/25 split (bans/rotations reopening
// the format). `strength` 0..1 — 1 would fully even it out in one step.
// Optionally bias the flattening to pull hardest from one archetype (e.g. the
// one a banned card belonged to). Returns a new normalized distribution.
export function flatten(dist, strength, fromArchetype = null) {
  const d = { ...normalize(dist) }
  for (const a of ARCHETYPES) {
    let pull = strength
    if (fromArchetype && a === fromArchetype) pull = Math.min(1, strength * 1.6)
    d[a] += (EVEN_SHARE - d[a]) * pull
  }
  return normalize(d)
}

// The derived 0–100 "Archetype Balance" the dial shows: high = even field,
// low = one style dominates. Defined as 100 minus the gap between the biggest
// and smallest share, scaled so a perfectly even field reads ~100 and a single
// archetype at 100% reads ~0.
export function balanceScore(dist) {
  const d = normalize(dist)
  const max = Math.max(...ARCHETYPES.map((a) => d[a]))
  const min = Math.min(...ARCHETYPES.map((a) => d[a]))
  // Even field: max=min=25 → spread 0 → 100. Mono field: max=100,min=0 → 100 → 0.
  return clamp(100 - (max - min), 0, 100)
}

// The dominant archetype and its share — handy for events/feed text.
export function dominant(dist) {
  const d = normalize(dist)
  const top = ARCHETYPES.reduce((a, b) => (d[b] > d[a] ? b : a))
  return { archetype: top, share: d[top] }
}
