// Cadence pledge pressure. At onboarding the player pledges a release rhythm
// (e.g. "a set every 14 weeks"). Hit it and the community is content; let it
// slip and — after a short grace period — unrest ESCALATES: persona sentiment
// sours and the player base bleeds faster the longer you're overdue. Releasing
// a set resets the clock and relieves the pressure.
//
// This is a self-imposed tension lever on top of the format-decay core loop:
// even if the meta is fine, going dark on your promised cadence costs you.

import { clamp } from './simulation.js'
import { CADENCE_GRACE, CADENCE_SENTIMENT_PER_WK, CADENCE_BLEED_PER_WK } from './config.js'

// Apply one week of cadence pressure to `next` in place (called from advanceWeek
// AFTER segment drift, so it layers on top). No-op until the pledge is overdue
// past the grace window.
export function applyCadencePressure(next) {
  const c = next.cadence
  if (!c) return

  const sinceRelease = next.week - c.lastReleaseWeek
  const overdue = sinceRelease - c.weeks // >0 once past the pledged rhythm
  c.overdueWeeks = Math.max(0, overdue)

  // Within pledge or grace → no penalty.
  if (overdue <= CADENCE_GRACE) return

  const lateBy = overdue - CADENCE_GRACE // weeks past the grace window

  // Escalating player-base bleed (grows with how late you are).
  const bleed = CADENCE_BLEED_PER_WK * lateBy
  const seg = next.segments
  // Casual fans flake first, then competitive; collectors care least about cadence.
  seg.casual = Math.max(0, Math.round(seg.casual * (1 - bleed)))
  seg.competitive = Math.max(0, Math.round(seg.competitive * (1 - bleed * 0.7)))
  seg.collectors = Math.max(0, Math.round(seg.collectors * (1 - bleed * 0.3)))
  next.playerBase = Math.max(0, seg.casual + seg.competitive + seg.collectors)

  // Sentiment sours across the roster, scaled by how late.
  const drop = CADENCE_SENTIMENT_PER_WK * lateBy
  next.personas = next.personas.map((p) => ({ ...p, sentiment: clamp(p.sentiment - drop, -100, 100) }))

  // Grumble in the feed at the threshold and periodically after.
  if (lateBy === 1 || lateBy % 4 === 0) {
    const gameName = next.config?.gameName || 'the game'
    next.eventsFeed = [
      { week: next.week, kind: 'community', tone: 'bad',
        text: `It's been ${sinceRelease} weeks since the last ${gameName} set — fans pledged ${c.weeks}. The community is getting restless.` },
      ...next.eventsFeed,
    ].slice(0, 60)
  }
}

// Reset the cadence clock when a set ships (called from the release reducer).
export function resetCadence(cadence, week) {
  return { ...cadence, lastReleaseWeek: week, overdueWeeks: 0 }
}
