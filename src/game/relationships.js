// Persona relationships & creator sponsorship — the management layer on top of
// the read-only community. See docs/COMMUNITY_PLAN.md (phase C).
//
// Each persona carries a `relationship` (0–100, how cultivated your bond is) and
// a `sponsored` flag. Relationship DECAYS if you neglect it. Two player actions:
//
//   COMP product  — a one-off: spend cash to send them early product. Builds the
//                   relationship and (usually) a hype/sentiment bump, but can
//                   BACKFIRE (looks like favoritism, or they pan it anyway).
//   SPONSOR       — an ongoing deal: a bigger cash commitment that amplifies
//                   their reach & keeps sentiment warm — but a sponsored creator
//                   who SOURS hits your reputation harder than an unsponsored one.
//
// Costs scale with reach (a big name is expensive). Both cash AND relationship
// are at stake, per the locked decision.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

// Cost of comping / sponsoring a persona, scaled by reach (loud = pricey).
export function compCost(persona) {
  return Math.round(2_000 + persona.reach * 180) // ~$7k for a reach-30, ~$20k for reach-95
}
export function sponsorCost(persona) {
  return Math.round(8_000 + persona.reach * 600) // ~$26k reach-30, ~$65k reach-95 (ongoing/wk)
}

const RELATIONSHIP_DECAY = 0.6 // points/week a cultivated bond cools if untended
const SPONSOR_UPKEEP_WARMTH = 2 // sponsored creators stay a bit warm each week

// ---- One-off: comp product -----------------------------------------------

// Returns reducer patches { personas, cashDelta, feed } or null if unaffordable.
export function compProduct(state, personaId) {
  const persona = state.personas.find((p) => p.id === personaId)
  if (!persona) return null
  const cost = compCost(persona)
  // Cash can go negative (a loan) — comping is fundable on credit.

  const rng = makeRng(hashSeed(`comp:${personaId}:${state.week}`))
  // Backfire chance is higher for low-credibility / already-hostile voices.
  const backfireOdds = 0.18 + (1 - persona.credibility / 100) * 0.22 + (persona.sentiment < 0 ? 0.15 : 0)
  const backfired = rng() < backfireOdds

  const personas = state.personas.map((p) => {
    if (p.id !== personaId) return p
    if (backfired) {
      // They pan it / cry favoritism: relationship still nudges up (you tried),
      // but sentiment sours and a little reach bleeds from the bad look.
      return { ...p, relationship: clamp((p.relationship ?? 10) + 4, 0, 100),
        sentiment: clamp(p.sentiment - range(rng, 6, 14), -100, 100) }
    }
    return { ...p, relationship: clamp((p.relationship ?? 10) + range(rng, 12, 20), 0, 100),
      sentiment: clamp(p.sentiment + range(rng, 6, 12), -100, 100) }
  })

  const feed = backfired
    ? `You comped ${persona.name} early product — and it backfired. They griped about favoritism, and the goodwill soured.`
    : `You sent ${persona.name} early product. They loved the gesture — warmer coverage incoming.`

  return { personas, cashDelta: -cost, feed }
}

// ---- Ongoing: sponsor / drop sponsorship ---------------------------------

export function sponsorCreator(state, personaId) {
  const persona = state.personas.find((p) => p.id === personaId)
  if (!persona || persona.sponsored) return null
  // Sponsoring pays an upfront signing on top of weekly upkeep (charged in sim).
  // Cash can go negative (a loan) — fundable on credit.
  const signing = Math.round(sponsorCost(persona) * 0.5)

  const personas = state.personas.map((p) =>
    p.id === personaId
      ? { ...p, sponsored: true, relationship: clamp((p.relationship ?? 10) + 15, 0, 100),
          sentiment: clamp(p.sentiment + 8, -100, 100) }
      : p,
  )
  return { personas, cashDelta: -signing, feed: `You signed ${persona.name} as a sponsored creator. Expect louder, warmer coverage — as long as you keep them happy.` }
}

export function dropSponsor(state, personaId) {
  const persona = state.personas.find((p) => p.id === personaId)
  if (!persona || !persona.sponsored) return null
  // Dropping a creator stings them — a sponsored relationship ending hurts.
  const personas = state.personas.map((p) =>
    p.id === personaId
      ? { ...p, sponsored: false, sentiment: clamp(p.sentiment - 12, -100, 100),
          relationship: clamp((p.relationship ?? 10) - 20, 0, 100) }
      : p,
  )
  return { personas, cashDelta: 0, feed: `You ended your deal with ${persona.name}. They didn't take it well.` }
}

// ---- Weekly upkeep (called from advanceWeek) -----------------------------

// Relationships decay if untended; sponsored creators draw weekly cash upkeep,
// stay slightly warm, and amplify reach — but a sponsored creator who has soured
// (negative sentiment) inflicts an outsized goodwill drag on the wider base.
export function applyRelationships(next) {
  if (!next.personas) return
  let upkeep = 0
  let souredSponsorDrag = 0

  next.personas = next.personas.map((p) => {
    let relationship = clamp((p.relationship ?? 0) - RELATIONSHIP_DECAY, 0, 100)
    let sentiment = p.sentiment
    if (p.sponsored) {
      upkeep += Math.round(sponsorCost(p) * 0.18) // ongoing weekly cost
      sentiment = clamp(sentiment + SPONSOR_UPKEEP_WARMTH, -100, 100)
      relationship = clamp(relationship + RELATIONSHIP_DECAY + 0.4, 0, 100) // tended by the deal
      if (sentiment < -10) souredSponsorDrag += (p.reach / 100) // a sponsored name turning on you is worse
    }
    return { ...p, relationship, sentiment }
  })

  if (upkeep > 0) next.cash = next.cash - upkeep
  if (souredSponsorDrag > 0) {
    // Their reach makes the betrayal land on the casual base.
    const hit = Math.round(next.segments.casual * 0.01 * souredSponsorDrag)
    next.segments.casual = Math.max(0, next.segments.casual - hit)
    next.playerBase = Math.max(0, next.segments.casual + next.segments.competitive + next.segments.collectors)
  }
  next.lastUpkeep = upkeep
}
