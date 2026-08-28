// Franchise Reputation — a single slow-moving stat tracking how big/culturally
// established the whole company is, independent of any one card's hype. This is
// the collector-economy engine behind "old cards climb for reasons that have
// nothing to do with the card" (the real-world Base Set Charizard effect):
//
//   - it grows off SUSTAINED health — a steady release cadence and a community
//     that's stayed happy over a long window, not a single good week — plus
//     characters that have made it big (icon/established fame reflects on the
//     whole brand)
//   - it acts as a slow-compounding multiplier on the FLOOR value of old/vintage
//     sets' singles (see legacyMultiplier, consumed by market.js) and raises how
//     high speculative bubbles can climb before bursting
//
// Reputation is sticky and one-directional in spirit: a bad week barely dents
// it (a brand's reputation is a legacy asset), but a genuinely hostile,
// sustained community can slowly erode it.

import { clamp, communitySentiment } from './simulation.js'

// EWMA smoothing rates — small, so both trackers reflect a LONG window rather
// than this week's blip (mirrors the "sustained, not spiky" framing).
const CADENCE_EWMA_ALPHA = 0.06 // ~16-week-ish window
const SENTIMENT_EWMA_ALPHA = 0.04 // slower still — a mood swing shouldn't move this

// Weekly reputation trickle from having made-it-big characters on the roster —
// an icon contributes more than a merely established name.
const ICON_TRICKLE_PER_CHAR = 0.06
const ESTABLISHED_TRICKLE_PER_CHAR = 0.02

// Growth tapers as reputation climbs so it never hard-caps but slows a lot near
// this soft ceiling — fast early-game gains, a long grind toward legendary.
const GROWTH_TAPER_REFERENCE = 260
const MIN_TAPER = 0.08

// Only a genuinely soured community erodes reputation, and slowly.
const EROSION_SENTIMENT_FLOOR = -40
const EROSION_RATE = 0.004

function freshState() {
  return { reputation: 5, cadenceEwma: 50, sentimentEwma: 0 }
}

// Advance franchise reputation one week. Mutates next.franchise in place.
// Reads next.cadence.overdueWeeks, next.personas (via communitySentiment), and
// next.characters — call AFTER driftCharacters/applyPersonaEffects have
// settled this week's numbers.
export function updateFranchiseReputation(next) {
  const f = next.franchise ?? freshState()

  const overdueWeeks = next.cadence?.overdueWeeks ?? 0
  const cadenceHealthNow = clamp(100 - overdueWeeks * 12, 0, 100)
  const cadenceEwma = f.cadenceEwma + (cadenceHealthNow - f.cadenceEwma) * CADENCE_EWMA_ALPHA

  const sentimentNow = communitySentiment(next.personas) ?? 0
  const sentimentEwma = f.sentimentEwma + (sentimentNow - f.sentimentEwma) * SENTIMENT_EWMA_ALPHA

  const characters = next.characters ?? []
  const icons = characters.filter((c) => c.trajectory === 'icon').length
  const established = characters.filter((c) => c.trajectory === 'established').length
  const castTrickle = icons * ICON_TRICKLE_PER_CHAR + established * ESTABLISHED_TRICKLE_PER_CHAR

  // Growth needs BOTH a healthy cadence AND a happy-enough community to compound
  // fully; either one being bad slows growth toward zero (not negative on its
  // own — see erosion below for that).
  const healthTerm = (cadenceEwma / 100) * clamp((sentimentEwma + 100) / 200, 0, 1)
  const taper = clamp(1 - f.reputation / GROWTH_TAPER_REFERENCE, MIN_TAPER, 1)
  const growth = (healthTerm * 0.35 + castTrickle) * taper

  const erosion = sentimentEwma < EROSION_SENTIMENT_FLOOR
    ? (Math.abs(sentimentEwma) - Math.abs(EROSION_SENTIMENT_FLOOR)) * EROSION_RATE
    : 0

  const reputation = clamp(f.reputation + growth - erosion, 0, Infinity)

  next.franchise = { reputation: Math.round(reputation * 100) / 100, cadenceEwma, sentimentEwma }
}

// How much a vintage set's collector floor is lifted by franchise reputation.
// Ramps in over a set's first ~60 weeks (a brand-new set hasn't earned "legacy"
// status yet, however big the company is), then scales with reputation.
// `anniversaryBoost` (default off — every existing call site is unaffected):
// an anniversary-tier set (see blocks.js) is FRAMED as a celebration of the
// franchise's history, so it skips the vintage ramp entirely (reads as
// "instantly vintage") and carries a flat premium on top.
export function legacyMultiplier(reputation, ageWeeks, { anniversaryBoost = false } = {}) {
  const vintage = anniversaryBoost ? 1 : clamp(ageWeeks / 60, 0, 1)
  const base = 1 + vintage * (reputation / 100) * 0.9
  return anniversaryBoost ? base * 1.25 : base
}
