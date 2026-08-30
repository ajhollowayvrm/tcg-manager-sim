// Cadence pledge pressure. At onboarding the player pledges a release rhythm
// (e.g. "a set every 14 weeks"). Hit it and the community is content; let it
// slip and — after a short grace period — unrest ESCALATES: persona sentiment
// sours and the player base bleeds faster the longer you're overdue. Releasing
// a set resets the clock and relieves the pressure.
//
// This is a self-imposed tension lever on top of the format-decay core loop:
// even if the meta is fine, going dark on your promised cadence costs you.

import { clamp } from './simulation.js'
import {
  CADENCE_GRACE, CADENCE_SENTIMENT_PER_WK, CADENCE_BLEED_PER_WK,
  CADENCE_SENTIMENT_FLOOR_BASE, CADENCE_SENTIMENT_FLOOR_PER_WK, CADENCE_SENTIMENT_FLOOR_MIN,
  CADENCE_FLOOR_RAMP_WEEKS, CADENCE_RATE_CAP_WEEKS,
  YOUNG_STUDIO_SETS, YOUNG_STUDIO_GRACE_BONUS, EARLY_STUDIO_SETS, EARLY_STUDIO_GRACE_BONUS,
  YOUNG_STUDIO_BLEED_MUL, TREADMILL_FLOOR_WEEKS, TREADMILL_SENTIMENT_PER_SET,
} from './config.js'

// How much rope this studio gets before unrest starts, by how much it has
// shipped. A startup missing a deadline is forgivable; a publisher with a
// catalogue going dark is not.
function graceFor(setsShipped) {
  if (setsShipped < YOUNG_STUDIO_SETS) return CADENCE_GRACE + YOUNG_STUDIO_GRACE_BONUS
  if (setsShipped < EARLY_STUDIO_SETS) return CADENCE_GRACE + EARLY_STUDIO_GRACE_BONUS
  return CADENCE_GRACE
}

// Apply one week of cadence pressure to `next` in place (called from advanceWeek
// AFTER segment drift, so it layers on top). No-op until the pledge is overdue
// past the grace window.
export function applyCadencePressure(next) {
  const c = next.cadence
  if (!c) return

  const sinceRelease = next.week - c.lastReleaseWeek
  const overdue = sinceRelease - c.weeks // >0 once past the pledged rhythm
  c.overdueWeeks = Math.max(0, overdue)

  // The treadmill: shipping FAR faster than pledged is its own broken promise.
  // Counted two ways, worst wins — against the studio's own pledge (you said a
  // set every 24 weeks and you're shipping six) and against an absolute floor
  // (nothing above one set per 6 weeks reads as anything but a treadmill, even
  // if you promised it). Applied before the overdue check below, because a
  // studio can't be both early and late.
  applyTreadmillPressure(next, c)

  // Within pledge or grace → no penalty.
  const setsShipped = next.sets?.length ?? 0
  const grace = graceFor(setsShipped)
  if (overdue <= grace) return

  const lateBy = overdue - grace // weeks past the grace window

  // Escalating player-base bleed (grows with how late you are). A studio with
  // barely any catalogue bleeds more slowly — there is less to walk away from.
  const bleedMul = setsShipped < YOUNG_STUDIO_SETS ? YOUNG_STUDIO_BLEED_MUL : 1
  const bleed = CADENCE_BLEED_PER_WK * lateBy * bleedMul
  const seg = next.segments
  // Casual fans flake first; collectors care least about cadence.
  seg.casual = Math.max(0, Math.round(seg.casual * (1 - bleed)))
  seg.collectors = Math.max(0, Math.round(seg.collectors * (1 - bleed * 0.3)))
  next.playerBase = Math.max(0, seg.casual + seg.collectors)

  // Sentiment sours across the roster TOWARD A FLOOR, rather than subtracting
  // without limit. See the constants in config.js: the old unbounded
  // `1.5 * lateBy` every week integrated to -100 on a fixed ~11-week schedule
  // and was the only reachable loss in the game. Going dark now drives the room
  // to -60 at worst, which is ruinous for sales and growth but is not, by
  // itself, the end of the run.
  const floor = Math.max(
    CADENCE_SENTIMENT_FLOOR_MIN,
    CADENCE_SENTIMENT_FLOOR_BASE + CADENCE_SENTIMENT_FLOOR_PER_WK * Math.min(lateBy, CADENCE_FLOOR_RAMP_WEEKS),
  )
  const drop = CADENCE_SENTIMENT_PER_WK * Math.min(lateBy, CADENCE_RATE_CAP_WEEKS)
  next.personas = next.personas.map((p) => (
    // Already at or below the floor for another reason? Cadence doesn't pile on.
    p.sentiment <= floor
      ? p
      : { ...p, sentiment: clamp(Math.max(floor, p.sentiment - drop), -100, 100) }
  ))

  // Grumble in the feed at the threshold and periodically after.
  if (lateBy === 1 || lateBy % 4 === 0) {
    const gameName = next.config?.gameName || 'the game'
    const companyName = next.config?.companyName || 'the studio'
    next.eventsFeed = [
      { week: next.week, kind: 'community', tone: 'bad',
        text: `It's been ${sinceRelease} weeks since the last ${gameName} set — fans pledged ${c.weeks}. Is ${companyName} still committed to this game?` },
      ...next.eventsFeed,
    ].slice(0, 60)
  }
}

// Sour the community over a release treadmill. `excess` is how many MORE sets
// shipped in the trailing window than the studio led people to expect; the
// people who care about fairness and value feel it hardest, because a treadmill
// devalues whatever they bought last month.
function applyTreadmillPressure(next, c) {
  const sets = next.sets ?? []
  if (sets.length < 2) return

  const countIn = (weeks) => sets.filter((s) => next.week - s.releasedWeek < weeks).length
  // Against the studio's own pledge…
  const pledgeExcess = Math.max(0, countIn(c.weeks) - 1)
  // …and against the absolute floor, so pledging a 6-week treadmill up front
  // doesn't buy permission to run one.
  const floorExcess = Math.max(0, countIn(TREADMILL_FLOOR_WEEKS) - 1)
  const excess = Math.max(pledgeExcess, floorExcess)
  if (excess <= 0) {
    next.cadence = { ...c, treadmillExcess: 0 }
    return
  }
  next.cadence = { ...c, treadmillExcess: excess }

  const drop = TREADMILL_SENTIMENT_PER_SET * excess
  next.personas = next.personas.map((p) => {
    const cares = 0.4 + (p.taste?.fairness ?? 0) * 0.9 + (p.taste?.value ?? 0) * 0.5
    return { ...p, sentiment: clamp(p.sentiment - drop * cares, -100, 100) }
  })

  // Say it out loud occasionally, so the player can connect cause to effect.
  if (excess >= 2 && next.week % 8 === 0) {
    const gameName = next.config?.gameName || 'the game'
    next.eventsFeed = [
      { week: next.week, kind: 'community', tone: 'bad',
        text: `"Another ${gameName} set already?" — the release treadmill is the discourse. What people bought last month is already yesterday's product.` },
      ...next.eventsFeed,
    ].slice(0, 60)
  }
}

// Reset the cadence clock when a set ships (called from the release reducer).
export function resetCadence(cadence, week) {
  return { ...cadence, lastReleaseWeek: week, overdueWeeks: 0 }
}
