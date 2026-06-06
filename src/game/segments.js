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

import { clamp } from './simulation.js'
import { normalize, balanceScore, EVEN_SHARE } from './archetypes.js'

// Max fraction of a segment that can drift in a single week from dial pressure.
// Deliberately small so this reads as a current, not a cliff — discrete shocks
// (events/bans) remain the dramatic movers.
const MAX_WEEKLY_DRIFT = 0.025

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

// Apply one week of dial-driven drift to the segments in place, then recompute
// the total player base. Mutates `next` (called from advanceWeek).
export function applySegmentDrift(next) {
  const health = segmentHealth(next.metagame)
  const seg = next.segments

  for (const key of ['competitive', 'casual', 'collectors']) {
    const delta = Math.round(seg[key] * rate(health[key]))
    seg[key] = Math.max(0, seg[key] + delta)
  }

  next.playerBase = Math.max(0, seg.competitive + seg.casual + seg.collectors)
}
