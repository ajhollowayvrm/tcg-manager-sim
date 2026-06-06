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

import { clamp } from './simulation.js'

// Max fraction of a segment that can drift in a single week from dial pressure.
// Deliberately small so this reads as a current, not a cliff — discrete shocks
// (events/bans) remain the dramatic movers.
const MAX_WEEKLY_DRIFT = 0.025

// Map a "health score" in [-1, 1] to a growth rate in [-MAX, +MAX].
function rate(score) {
  return clamp(score, -1, 1) * MAX_WEEKLY_DRIFT
}

// Per-segment health scores from the live dials. Each is normalized to ~[-1, 1]
// where positive = this segment is happy and growing, negative = churning out.
function segmentHealth(metagame) {
  const { diversity, powerLevel, solveLevel } = metagame

  // Competitive: thrives on a fresh, diverse format; hates a solved or
  // oppressive one. Diversity centered at 60 (initial baseline), solve at 50.
  const competitive =
    ((diversity - 60) / 50) * 0.6 + ((50 - solveLevel) / 50) * 0.6

  // Casual: chases freshness above all (solve hurts most); a little put off by a
  // low-diversity meta with no room for their pet decks.
  const casual =
    ((55 - solveLevel) / 55) * 0.8 + ((diversity - 50) / 60) * 0.25

  // Collectors: power creep is the enemy — it obsoletes their collection.
  // Restrained power (below ~50) reads as a stable, value-preserving environment.
  const collectors = ((50 - powerLevel) / 55) * 0.8

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
