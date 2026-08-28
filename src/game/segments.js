// Segment drift — the passive, week-over-week pull the catalog's health exerts
// on the two player segments. See docs/BRIEF.md "Player segments".
//
// Events, grading scandals, and pulling a set from print move segments in
// discrete jolts elsewhere. THIS is the slow current underneath them: a healthy,
// buzzing catalog gently grows the base, a stale/over-designed one bleeds it —
// and each segment reacts to what IT cares about, so a decision that thrills
// one can cost the other.
//
//   casual     — the "crack packs for fun" crowd. Want fresh product on shelves
//                and a hot cast of characters; churn out when the catalog goes
//                quiet, and are mildly soured by cadence overdue.
//   collectors — track value/scarcity/legacy. Grow with franchise reputation,
//                scarcity events, and active grading partners; bleed when
//                modern card design gets too loud (nostalgia erosion) or a
//                counterfeit/grading scandal breaks trust.

import { clamp, communitySentiment } from './simulation.js'

// Max fraction of a segment that can drift in a single week from health
// pressure. Deliberately small so this reads as a current, not a cliff —
// discrete shocks (events/scandals/pulls) remain the dramatic movers.
const MAX_WEEKLY_DRIFT = 0.006

// Map a "health score" in [-1, 1] to a growth rate in [-MAX, +MAX].
function rate(score) {
  return clamp(score, -1, 1) * MAX_WEEKLY_DRIFT
}

// The hottest live (in-print) set's buzz — "is anything fresh on shelves right
// now," 0–100. Deliberately MAX, not average: a big catalog built up over a
// long run shouldn't dilute this toward zero just because most of its back
// catalog has gone quiet — one fresh drop is enough to make the shelf exciting
// again, same as the old global solve-level dial any release refreshed.
function catalogBuzz(sets) {
  const live = (sets ?? []).filter((s) => !s.rotated)
  if (!live.length) return 0
  return Math.max(...live.map((x) => x.buzz ?? 0))
}

// Average fame of the top-3 characters — a "hot cast" signal for casual pull.
function hotCastSignal(characters) {
  const top = [...(characters ?? [])].sort((a, b) => b.fame - a.fame).slice(0, 3)
  if (!top.length) return 0
  return top.reduce((s, c) => s + c.fame, 0) / top.length
}

// Per-segment health scores from the catalog's live state. Each is normalized
// to ~[-1, 1] where positive = this segment is happy and growing, negative =
// churning out.
function segmentHealth(next) {
  const buzz = catalogBuzz(next.sets) // 0–100
  const buzzHealth = (buzz - 50) / 50 // centered on a middling catalog

  const fame = hotCastSignal(next.characters) // 0–100
  const fameHealth = (fame - 35) / 65 // centered so an average/no cast is neutral

  const casual = buzzHealth * 0.75 + fameHealth * 0.25

  const printIntensity = next.printIntensity ?? 40
  const reputation = next.franchise?.reputation ?? 0
  const activeGrading = (next.gradingPartners ?? []).some((p) => p.active)

  const collectors =
    (reputation - 15) / 85 // franchise legacy pull
    + (activeGrading ? 0.15 : 0) // certification trust
    - Math.max(0, printIntensity - 50) / 60 // nostalgia erosion past a mid floor

  return { casual: clamp(casual, -1, 1), collectors: clamp(collectors, -1, 1) }
}

// Additive weekly "word of mouth" — new players DISCOVERING the game. Crucially
// additive (not multiplicative), so a brand-new studio grows from ZERO: a
// fresh, well-stocked catalog with positive buzz attracts a trickle of
// newcomers every week even before its base exists. A stale, undersupplied, or
// disliked catalog attracts few or none. New players distribute into segments
// by the archetype's lean. Mutates seg in place; returns the total added.
const WORD_OF_MOUTH_BASE = 450 // newcomers/week a healthy, in-print game can draw

function applyWordOfMouth(next, seg) {
  const liveSets = (next.sets ?? []).filter((s) => !s.rotated).length
  if (liveSets === 0) return 0 // no product on shelves → nothing to discover yet

  // Health factor 0..~1.4: a buzzing catalog is discoverable; a quiet one
  // isn't. Centered on a MODERATE buzz level (most of a release cycle is spent
  // between the post-launch peak and the pre-launch trough, not pegged at
  // 100), so a typical cadence reads as healthy rather than perpetually stale.
  const freshness = clamp(catalogBuzz(next.sets) / 70, 0, 1.3)
  const health = clamp(0.3 + freshness * 1.0, 0, 1.4)

  // Buzz: positive community sentiment amplifies discovery; hostile buzz suppresses
  // it. Maps reach-weighted sentiment (-100..100) to ~0.4..1.6.
  const sentiment = communitySentiment(next.personas) ?? 0
  const communityBuzz = clamp(1 + sentiment / 60, 0.2, 1.6)

  // More sets in print = more shelf presence (diminishing).
  const presence = clamp(0.6 + Math.log2(1 + liveSets) * 0.35, 0.6, 1.2)

  const newcomers = Math.round(WORD_OF_MOUTH_BASE * health * communityBuzz * presence)
  if (newcomers <= 0) return 0

  distributeNewPlayers(seg, next.segmentLean, newcomers)
  return newcomers
}

// Distribute `count` new players into the segments by the archetype lean (falls
// back to an even split if no lean is recorded — e.g. an old save).
export function distributeNewPlayers(seg, lean, count) {
  const l = lean ?? { casual: 1 / 2, collectors: 1 / 2 }
  seg.casual += Math.round(count * l.casual)
  seg.collectors += Math.round(count * l.collectors)
}

// Apply one week of health-driven drift to the segments in place, then
// recompute the total player base. Mutates `next` (called from advanceWeek).
export function applySegmentDrift(next) {
  const health = segmentHealth(next)
  const seg = next.segments

  // Additive discovery first (grows the base from zero)…
  const newcomers = applyWordOfMouth(next, seg)
  next.lastNewPlayers = newcomers

  // …then the multiplicative drift on the (now non-zero) base — a healthy
  // catalog grows it further, a stale/over-designed one bleeds it.
  for (const key of ['casual', 'collectors']) {
    const delta = Math.round(seg[key] * rate(health[key]))
    seg[key] = Math.max(0, seg[key] + delta)
  }

  next.playerBase = Math.max(0, seg.casual + seg.collectors)
}
