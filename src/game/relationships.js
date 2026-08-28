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

// ---- One-off: invite to a prerelease ---------------------------------------

const PRERELEASE_WINDOW_WEEKS = 3 // how long after release a set still counts as "in its prerelease window"

// Cost to invite a persona to a live set's prerelease — cheaper than a full
// comp since it's a narrower gesture (one event, one set), with a premium if
// the set's chase cards are pullable (a bigger, riskier perk).
export function invitePrereleaseCost(persona, set) {
  return Math.round(1_500 + persona.reach * 120 + (set?.prerelease?.chasePullable ? 2_000 : 0))
}

// Find the set (if any) currently eligible for a prerelease invite: prerelease
// enabled, still in print, and within its window. Ties break toward the most
// recently released set.
export function eligiblePrereleaseSet(state) {
  const candidates = (state.sets ?? []).filter((s) =>
    s.prerelease?.enabled && !s.rotated && !s.outOfPrint &&
    (state.week - s.releasedWeek) <= PRERELEASE_WINDOW_WEEKS,
  )
  if (!candidates.length) return null
  return candidates.reduce((best, s) => (!best || s.releasedWeek > best.releasedWeek ? s : best), null)
}

// Returns reducer patches { personas, sets, cashDelta, feed } or null.
export function invitePrerelease(state, personaId, setId) {
  const persona = state.personas.find((p) => p.id === personaId)
  const set = state.sets.find((s) => s.id === setId)
  if (!persona || !set || !set.prerelease?.enabled || set.rotated || set.outOfPrint) return null
  if (state.week - set.releasedWeek > PRERELEASE_WINDOW_WEEKS) return null
  const cost = invitePrereleaseCost(persona, set)

  const rng = makeRng(hashSeed(`invite:${personaId}:${setId}:${state.week}`))
  // Backfire: lower baseline than compProduct (a curated invite reads better
  // than unsolicited comped product) but chase-pullable adds real scoop risk
  // — they crack chase pulls and leak them before your own reveal.
  const backfireOdds = 0.15 + (1 - persona.credibility / 100) * 0.2
    + (persona.sentiment < 0 ? 0.12 : 0) + (set.prerelease.chasePullable ? 0.08 : 0)
  const backfired = rng() < backfireOdds

  const personas = state.personas.map((p) => {
    if (p.id !== personaId) return p
    if (backfired) {
      return { ...p, relationship: clamp((p.relationship ?? 10) + 4, 0, 100),
        sentiment: clamp(p.sentiment - range(rng, 6, 12), -100, 100) }
    }
    return { ...p, relationship: clamp((p.relationship ?? 10) + range(rng, 10, 16), 0, 100),
      sentiment: clamp(p.sentiment + range(rng, 5, 10), -100, 100) }
  })

  const sets = state.sets.map((s) => {
    if (s.id !== setId) return s
    const buzz = backfired
      ? clamp((s.buzz ?? 50) - range(rng, 3, 6), 0, 100)
      : clamp((s.buzz ?? 50) + range(rng, 6, 10), 0, 100)
    return { ...s, buzz }
  })

  const feed = backfired
    ? `You invited ${persona.name} to ${set.name}'s prerelease — they leaked chase pulls early, stealing your own reveal's thunder.`
    : `You invited ${persona.name} to ${set.name}'s prerelease. Their early cracks are driving buzz ahead of full release.`

  return { personas, sets, cashDelta: -cost, feed }
}

// ---- One-off: sponsor a tournament -----------------------------------------
//
// Unlike sponsorCreator (an ONGOING retainer), this is a one-off marquee
// spend — real tournaments are discrete events, not a weekly upkeep line.
// Its distinct hook: it lifts the current hottest live set's buzz (a bigger
// jolt than invitePrerelease, since it's a public event, not a private
// favor), plus a small goodwill ripple to the wider "competitive-minded"
// slice of the roster — a real event moves the scene, not just the sponsored
// voice.
//
// Gating: there's no dedicated competitor/pro persona TYPE in this roster
// (content/personas.js only has streamer|authenticator|collector|reviewer|
// analyst) — taste.power is used as the closest existing proxy for "a
// competitive-minded voice" instead of adding a new type.
export const COMPETITIVE_TASTE_THRESHOLD = 0.6

export function sponsorTournamentCost(persona) {
  return Math.round(6_000 + persona.reach * 420) // ~$19k reach-30, ~$46k reach-95, one-off
}

function hottestLiveSet(sets) {
  const live = (sets ?? []).filter((s) => !s.rotated && !s.outOfPrint)
  if (!live.length) return null
  return live.reduce((best, s) => (!best || (s.buzz ?? 0) > (best.buzz ?? 0) ? s : best), null)
}

// Returns reducer patches { personas, sets, cashDelta, feed } or null.
export function sponsorTournament(state, personaId) {
  const persona = state.personas.find((p) => p.id === personaId)
  if (!persona || (persona.taste?.power ?? 0) < COMPETITIVE_TASTE_THRESHOLD) return null
  const target = hottestLiveSet(state.sets)
  if (!target) return null
  const cost = sponsorTournamentCost(persona)

  const rng = makeRng(hashSeed(`tourney:${personaId}:${state.week}`))
  // Lowest backfire baseline of the three actions — a curated, run event
  // carries less inherent scandal risk than comped product or an open invite.
  const backfireOdds = 0.12 + (1 - persona.credibility / 100) * 0.18 + (persona.sentiment < 0 ? 0.1 : 0)
  const backfired = rng() < backfireOdds

  const personas = state.personas.map((p) => {
    if (p.id === personaId) {
      if (backfired) {
        // A scandal at YOUR sponsored event hits harder for a bigger name —
        // scale the sting by reach.
        return { ...p, relationship: clamp((p.relationship ?? 10) + 2, 0, 100),
          sentiment: clamp(p.sentiment - range(rng, 8, 16) * (1 + p.reach / 200), -100, 100) }
      }
      return { ...p, relationship: clamp((p.relationship ?? 10) + range(rng, 6, 10), 0, 100),
        sentiment: clamp(p.sentiment + range(rng, 3, 6), -100, 100) }
    }
    // Success ripple: the wider competitive-minded scene notices a real event.
    if (!backfired && (p.taste?.power ?? 0) >= COMPETITIVE_TASTE_THRESHOLD) {
      return { ...p, sentiment: clamp(p.sentiment + range(rng, 2, 4), -100, 100) }
    }
    return p
  })

  const sets = state.sets.map((s) => {
    if (s.id !== target.id) return s
    const buzz = backfired
      ? clamp((s.buzz ?? 50) - range(rng, 4, 8), 0, 100)
      : clamp((s.buzz ?? 50) + range(rng, 12, 18), 0, 100)
    return { ...s, buzz }
  })

  const feed = backfired
    ? `The ${target.name} tournament you sponsored, fronted by ${persona.name}, turned into a scandal — the scene is not impressed.`
    : `You sponsored a ${target.name} tournament with ${persona.name} headlining. Buzz for the set spikes across the competitive-minded crowd.`

  return { personas, sets, cashDelta: -cost, feed }
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
    next.playerBase = Math.max(0, next.segments.casual + next.segments.collectors)
  }
  next.lastUpkeep = upkeep
}
