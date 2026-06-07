// Segment drift — the passive, week-over-week pull the four metagame dials
// exert on the three player segments. See docs/BRIEF.md "Player segments".
//
// Events, bans, rotations, and persona sway move segments in discrete jolts
// elsewhere. THIS is the slow current underneath them: a healthy meta gently
// grows the base, a rotting one bleeds it — and crucially, each segment reacts
// to the dials IT cares about, so almost no dial configuration pleases all three.
// That standing tension is what gives the player-base death spiral teeth.
//
//   competitive — care about diversity & solve level. Bleed when the format is
//                 solved (high solveLevel) or oppressive (low diversity); grow
//                 when it's fresh and diverse.
//   casual      — the "new toys" crowd. Want fresh mechanics & power; churn out
//                 of a stale (highly-solved) format; mildly soured by an
//                 oppressive low-diversity meta.
//   collectors  — track value/scarcity/art. Resent power creep — it obsoletes
//                 the cards they hold — so they bleed as power level climbs, and
//                 hold steady (slight growth) when power is restrained.
//
// Segments also react to the SHAPE of the metashare (which play styles are
// viable), per the brief's "if one style dominates, the players who prefer the
// squeezed-out styles leave":
//   competitive — want an interactive, varied field; unhappy as it concentrates
//                 toward any single dominant deck (style-agnostic, cares about
//                 evenness).
//   casual      — the "new toys" crowd; happiest when aggro/combo have real
//                 share, soured when grindy control/midrange dominate.
//   collectors  — style-agnostic (value-driven); the metashape doesn't move them.

import { clamp, communitySentiment } from './simulation.js'
import { normalize, balanceScore, EVEN_SHARE } from './archetypes.js'

// Max fraction of a segment that can drift in a single week from dial pressure.
// Deliberately small so this reads as a current, not a cliff — discrete shocks
// (events/bans) remain the dramatic movers.
const MAX_WEEKLY_DRIFT = 0.006

// Map a "health score" in [-1, 1] to a growth rate in [-MAX, +MAX].
function rate(score) {
  return clamp(score, -1, 1) * MAX_WEEKLY_DRIFT
}

// How each segment feels about the current metashare shape, returned as a small
// additive term in ~[-0.5, +0.5] folded into segment health below.
function archetypeHappiness(archetypes) {
  if (!archetypes) return { competitive: 0, casual: 0, collectors: 0 }
  const d = normalize(archetypes)

  // Competitive: evenness IS the goal. balanceScore 100 (flat) → +0.4;
  // a one-deck field (balanceScore ~0) → -0.5.
  const competitive = (balanceScore(d) / 100 - 0.6) * 1.0

  // Casual: like aggro + combo "new toys". Their share above the even baseline
  // pleases; a field dominated by control/midrange grind sours them.
  const funShare = d.aggro + d.combo // 50 at a flat field
  const casual = ((funShare - 2 * EVEN_SHARE) / 50) * 0.5

  // Collectors: indifferent to play-style shape.
  const collectors = 0

  return { competitive, casual, collectors }
}

// Per-segment health scores from the live dials. Each is normalized to ~[-1, 1]
// where positive = this segment is happy and growing, negative = churning out.
function segmentHealth(metagame) {
  const { diversity, powerLevel, solveLevel, archetypes } = metagame
  const arch = archetypeHappiness(archetypes)

  // Competitive: thrives on a fresh, diverse format; hates a solved or
  // oppressive one. Diversity centered at 60 (initial baseline), solve at 50.
  // Also wants an even archetype field (no single dominant deck).
  const competitive =
    ((diversity - 60) / 50) * 0.5 + ((50 - solveLevel) / 50) * 0.5 + arch.competitive

  // Casual: chases freshness above all (solve hurts most); a little put off by a
  // low-diversity meta — and happiest when aggro/combo styles are viable.
  const casual =
    ((55 - solveLevel) / 55) * 0.7 + ((diversity - 50) / 60) * 0.2 + arch.casual

  // Collectors: power creep is the enemy — it obsoletes their collection.
  // Restrained power (below ~50) reads as a stable, value-preserving environment.
  const collectors = ((50 - powerLevel) / 55) * 0.8 + arch.collectors

  return { competitive, casual, collectors }
}

// Additive weekly "word of mouth" — new players DISCOVERING the game. Crucially
// additive (not multiplicative), so a brand-new studio grows from ZERO: a fresh,
// diverse, well-stocked game with positive buzz attracts a trickle of newcomers
// every week even before its base exists. A stale, undersupplied, or disliked
// game attracts few or none. New players distribute into segments by the
// archetype's lean. Mutates seg in place; returns the total added.
const WORD_OF_MOUTH_BASE = 310 // newcomers/week a healthy, in-print game can draw

function applyWordOfMouth(next, seg) {
  const m = next.metagame
  const liveSets = (next.sets ?? []).filter((s) => !s.rotated).length
  if (liveSets === 0) return 0 // no product on shelves → nothing to discover yet

  // Health factor 0..~1.4: a fresh (low solve), diverse, balanced field is
  // discoverable; a solved/oppressive one isn't. Centered so an average game
  // draws a modest trickle.
  const freshness = clamp(1 - m.solveLevel / 120, 0, 1)
  const diversity = clamp(m.diversity / 100, 0, 1)
  const health = clamp(0.2 + freshness * 0.4 + diversity * 0.7, 0, 1.4)

  // Buzz: positive community sentiment amplifies discovery; hostile buzz suppresses
  // it. Maps reach-weighted sentiment (-100..100) to ~0.4..1.6.
  const sentiment = communitySentiment(next.personas) ?? 0
  const buzz = clamp(1 + sentiment / 60, 0.2, 1.6)

  // More sets in print = more shelf presence (diminishing).
  const presence = clamp(0.6 + Math.log2(1 + liveSets) * 0.35, 0.6, 1.2)

  const newcomers = Math.round(WORD_OF_MOUTH_BASE * health * buzz * presence)
  if (newcomers <= 0) return 0

  distributeNewPlayers(seg, next.segmentLean, newcomers)
  return newcomers
}

// Distribute `count` new players into the segments by the archetype lean (falls
// back to an even split if no lean is recorded — e.g. an old save).
export function distributeNewPlayers(seg, lean, count) {
  const l = lean ?? { competitive: 1 / 3, casual: 1 / 3, collectors: 1 / 3 }
  seg.competitive += Math.round(count * l.competitive)
  seg.casual += Math.round(count * l.casual)
  seg.collectors += Math.round(count * l.collectors)
}

// Apply one week of dial-driven drift to the segments in place, then recompute
// the total player base. Mutates `next` (called from advanceWeek).
export function applySegmentDrift(next) {
  const health = segmentHealth(next.metagame)
  const seg = next.segments

  // Additive discovery first (grows the base from zero)…
  const newcomers = applyWordOfMouth(next, seg)
  next.lastNewPlayers = newcomers

  // …then the multiplicative drift on the (now non-zero) base — a healthy meta
  // grows it further, a rotting one bleeds it.
  for (const key of ['competitive', 'casual', 'collectors']) {
    const delta = Math.round(seg[key] * rate(health[key]))
    seg[key] = Math.max(0, seg[key] + delta)
  }

  next.playerBase = Math.max(0, seg.competitive + seg.casual + seg.collectors)
}
