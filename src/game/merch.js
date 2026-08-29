// Merchandise — official plush/apparel/accessories/art-book lines. The
// "revenue decoupled from metagame health" lever from docs/BRIEF.md's v2
// layer C: unlike a booster/bundle/SPC/tin (products.js), a merch line has
// NO print run or supply cap — it's produced to order, so it sells every
// week it's active regardless of whether any set is currently live or hot.
//
// Its demand instead reads franchise reputation (the primary driver — this IS
// what merch monetizes) and top-character fame (a hot mascot moves plush),
// scaled by the player segments who'd actually buy it (still needs a base to
// sell to — "decoupled from metagame health" isn't the same as "decoupled
// from player base"). It deliberately never touches any set/card state, and
// never feeds scalperHeat — merch is the STABLE lever, immune to scalper
// drama by design.
//
// Sign/cultivate/drop shape mirrors distributors.js: launch (sign), refresh
// (cultivate), retire (drop). One active line per kind at a time.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { priceElasticity } from './revenue.js'
import { hotCastSignal } from './segments.js'
import { getMerchType } from './content/merch.js'

const MERCH_BUZZ_DECAY_PER_WEEK = 0.985 // slow — evergreen fan demand, not a set's hype cycle
const MERCH_BUZZ_FLOOR = 35 // a launched line never goes fully cold
const MERCH_BUZZ_REFRESH = 50 // how much a refresh bumps buzz back up

// ---- Launch / refresh / retire --------------------------------------------

// Returns { merchLines, cashDelta, feed } or null. One active line per kind.
export function launchMerchLine(state, kind) {
  const t = getMerchType(kind)
  if (!t) return null
  if ((state.merchLines ?? []).some((m) => m.kind === kind && m.active)) return null
  const line = {
    kind, name: t.name, price: t.defaultPrice, launchedWeek: state.week,
    merchBuzz: 100, totalSold: 0, totalRevenue: 0, active: true,
  }
  const merchLines = [...(state.merchLines ?? []).filter((m) => m.kind !== kind), line]

  // The community has a view on merch, and it turns on RESTRAINT. A line
  // fronted by a beloved character is a delight; a shelf groaning with tie-in
  // product reads as a cash grab and sours the people who care about value.
  // (Merch used to be a pure cash faucet — three actions, tens of thousands of
  // dollars each, and not one persona ever mentioned it.)
  const activeCount = merchLines.filter((m) => m.active).length
  const fame = hotCastSignal(state.characters) // 0–100
  const delight = clamp((fame - 30) / 70, 0, 1) // a hot cast makes merch wanted
  const overreach = clamp((activeCount - 2) / 3, 0, 1) // past two lines it's a lot
  const bump = {
    tasteKey: 'value',
    floor: 0.4,
    amount: Math.round((delight * 3 - overreach * 6) * 10) / 10,
    ambientAmount: Math.round((delight * 2 - overreach * 2) * 10) / 10,
  }

  return {
    merchLines,
    cashDelta: -t.launchCost,
    personaSentimentBump: bump,
    feed: overreach > 0.5
      ? `Launched a ${t.name} line — that's ${activeCount} merch lines running now, and people are starting to say so.`
      : `Launched a ${t.name} line — official merch now on shelves, independent of any one set.`,
  }
}

// A smaller spend (new print/variant/drop) that bumps buzz back up.
export function refreshMerchLine(state, kind) {
  const t = getMerchType(kind)
  const line = (state.merchLines ?? []).find((m) => m.kind === kind && m.active)
  if (!t || !line) return null
  const merchLines = state.merchLines.map((m) =>
    m.kind === kind && m.active ? { ...m, merchBuzz: clamp(m.merchBuzz + MERCH_BUZZ_REFRESH, MERCH_BUZZ_FLOOR, 100) } : m,
  )
  return { merchLines, cashDelta: -t.refreshCost, feed: `Refreshed the ${t.name} line with a new drop — demand picks back up.` }
}

// Stops the line, freeing the kind slot. No dump-shock unlike dropDistributor
// — merch isn't flooding a resale channel, so ending it is clean.
export function retireMerchLine(state, kind) {
  const t = getMerchType(kind)
  const line = (state.merchLines ?? []).find((m) => m.kind === kind && m.active)
  if (!t || !line) return null
  const merchLines = state.merchLines.map((m) => (m.kind === kind && m.active ? { ...m, active: false } : m))
  return { merchLines, cashDelta: 0, feed: `Retired the ${t.name} line.` }
}

// ---- Weekly revenue (called from advanceWeek, sibling to resolveRevenue) --

function weeklyMerchDemand(line, t, state, rng) {
  const freshness = clamp(MERCH_BUZZ_FLOOR / 100 + (line.merchBuzz / 100) * (1 - MERCH_BUZZ_FLOOR / 100), MERCH_BUZZ_FLOOR / 100, 1)
  const reputationPull = clamp(1 + (state.franchise?.reputation ?? 0) / 120, 1, 3.2) // the core driver
  const fame = hotCastSignal(state.characters)
  const castPull = clamp(1 + fame / 140, 1, 1.7)
  const elasticity = priceElasticity(line.price, t.elasticityRef)
  const seg = state.segments ?? { casual: 0, collectors: 0 }
  const buyerPool = seg.casual * t.appeal.casual + seg.collectors * t.appeal.collectors
  const noise = range(rng, 0.85, 1.15)
  return Math.max(0, Math.round(buyerPool * freshness * reputationPull * castPull * elasticity * t.demandMul * noise))
}

// Returns { merchLines, cashDelta }.
export function resolveMerchRevenue(state) {
  const rng = makeRng(hashSeed(`merch:${state.week}`))
  let cashDelta = 0
  const merchLines = (state.merchLines ?? []).map((line) => {
    if (!line.active) return line
    const t = getMerchType(line.kind)
    if (!t) return line
    const units = weeklyMerchDemand(line, t, state, rng)
    const revenue = Math.round(units * line.price)
    cashDelta += revenue
    return {
      ...line,
      merchBuzz: clamp(line.merchBuzz * MERCH_BUZZ_DECAY_PER_WEEK, MERCH_BUZZ_FLOOR, 100),
      totalSold: line.totalSold + units,
      totalRevenue: line.totalRevenue + revenue,
    }
  })
  return { merchLines, cashDelta }
}
