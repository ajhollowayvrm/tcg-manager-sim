// Distributors & scalper culture — the bulk-buyer management layer.
//
// You can sign a distributor (see content/distributors.js) to a specific live
// set: they buy a chunk of its print run NOW at a wholesale discount. That's a
// cash injection up front, paid for two ways:
//
//   1. Margin — they pay below MSRP (discount), so the bulk sale earns less per
//      unit than selling those packs at retail would have.
//   2. The flood — they resell that stock into the channel, dragging your
//      secondary singles and your ongoing sealed demand for weeks. The hotter
//      the flood, the more it raises `scalperHeat`.
//
// SCALPER CULTURE: once scalperHeat crosses a threshold the game tips into a
// scalper-driven market. It's a devil's bargain that hits ALL THREE death
// spirals:
//   • short-term upside — singles spike and sealed demand jumps on FOMO/artificial
//     scarcity (the seductive part: cash + a hot market),
//   • ongoing cost — casual players get priced out (the casual segment bleeds)
//     and your reputation sours (persona sentiment drifts down — a "scalper's
//     game"),
//   • the pop — a probabilistic bubble burst that craters singles and dumps a
//     glut of resold stock, gutting sealed sales. The longer heat runs hot, the
//     likelier and bigger the pop.
//
// A distributor is a relationship (like a sponsored creator): cultivated terms
// soften the flood; dropping one triggers an inventory-dump shock.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { getDistributor } from './content/distributors.js'
import { printRunUnits } from './revenue.js'

// Heat thresholds.
export const SCALPER_THRESHOLD = 55 // scalper culture activates above this
const HEAT_DECAY = 2 // points/week heat cools when not being fed
const SPIKE_HEAT = 9 // heat added per active distributor per week (resale pressure)

// ---- Sign a distributor ---------------------------------------------------

// Up-front bulk buy of a live set. Returns reducer patches:
//   { distributors, sets, cashDelta, scalperHeat, feed }  or null if invalid.
// `sets` is patched to bump the bought units onto set.sold (they're off the
// retail shelf now — you can't sell them again).
export function signDistributor(state, distId, setId) {
  const dist = getDistributor(distId)
  const set = state.sets.find((s) => s.id === setId)
  if (!dist || !set || set.rotated) return null
  // One active deal per distributor at a time.
  if ((state.distributors ?? []).some((d) => d.id === distId && d.active)) return null

  const supply = set.supply ?? printRunUnits(set.printRun)
  const remaining = Math.max(0, supply - (set.sold ?? 0))
  if (remaining <= 0) return null // nothing left to wholesale

  // Volume they take = appetite × remaining; revenue = volume × MSRP × discount.
  const units = Math.round(remaining * dist.appetite)
  if (units <= 0) return null
  const revenue = Math.round(units * set.price * dist.discount)

  const sets = state.sets.map((s) =>
    s.id === setId ? { ...s, sold: Math.min(supply, (s.sold ?? 0) + units) } : s,
  )

  // Record the active deal. relationship starts warm-ish; flood/heat accrue weekly.
  const deal = {
    id: distId,
    setId,
    active: true,
    signedWeek: state.week,
    units,
    relationship: 30,
  }
  const distributors = [...(state.distributors ?? []).filter((d) => d.id !== distId), deal]

  // Signing immediately injects some scalper heat proportional to the deal's
  // flood and size (a big speculative buy gets noticed instantly).
  const heatBump = dist.flood * 16 * (units / Math.max(1, remaining))
  const scalperHeat = clamp((state.scalperHeat ?? 0) + heatBump, 0, 100)

  const feed = `${dist.name} signed on ${set.name}: bulk-bought ${units.toLocaleString('en-US')} units at ${Math.round(dist.discount * 100)}% of MSRP (+$${revenue.toLocaleString('en-US')}). They'll resell into the channel.`

  return { distributors, sets, cashDelta: revenue, scalperHeat, feed }
}

// ---- Drop a distributor ---------------------------------------------------

// Ending a deal triggers an inventory-dump shock: they liquidate remaining stock
// fast, spiking the flood for a moment (a one-off heat jump) and souring the
// relationship. Returns { distributors, scalperHeat, feed } or null.
export function dropDistributor(state, distId) {
  const dist = getDistributor(distId)
  const deal = (state.distributors ?? []).find((d) => d.id === distId && d.active)
  if (!dist || !deal) return null

  const distributors = (state.distributors ?? []).map((d) =>
    d.id === distId ? { ...d, active: false, droppedWeek: state.week } : d,
  )
  // A dump shock: the worse the relationship, the harder they flood on the way out.
  const shock = dist.flood * (1.4 - (deal.relationship ?? 0) / 100) * 12
  const scalperHeat = clamp((state.scalperHeat ?? 0) + shock, 0, 100)

  const feed = `You ended your deal with ${dist.name}. They're dumping remaining inventory to liquidate — a flood of cheap product hits the channel.`
  return { distributors, scalperHeat, feed }
}

// ---- Cultivate a distributor ---------------------------------------------

// A one-off goodwill spend that warms the relationship (better terms, gentler
// flood). Mirrors comping a persona. Returns { distributors, cashDelta, feed }.
export function cultivateDistributor(state, distId) {
  const dist = getDistributor(distId)
  const deal = (state.distributors ?? []).find((d) => d.id === distId && d.active)
  if (!dist || !deal) return null
  const cost = Math.round(4_000 + dist.reach * 120)
  if (state.cash < cost) return null

  const distributors = state.distributors.map((d) =>
    d.id === distId ? { ...d, relationship: clamp((d.relationship ?? 0) + 18, 0, 100) } : d,
  )
  return { distributors, cashDelta: -cost, feed: `You wined and dined ${dist.name}. A warmer relationship means gentler flooding and better future terms.` }
}

// ---- Weekly tick (called from advanceWeek) -------------------------------

// Active distributors resell each week — flooding the market and feeding scalper
// heat. Heat decays otherwise. Above the threshold, scalper culture applies its
// short-term spike, ongoing community cost, and a chance of a bubble pop.
// Mutates `next` in place; attaches next.scalperState for the UI/feed.
export function applyDistributors(next) {
  const rng = makeRng(hashSeed(`distrib:${next.week}`))
  const active = (next.distributors ?? []).filter((d) => d.active)

  // --- Heat: fed by active resale flood, decays otherwise ---
  let heat = next.scalperHeat ?? 0
  let floodPressure = 0
  for (const deal of active) {
    const dist = getDistributor(deal.id)
    if (!dist) continue
    // A cultivated relationship damps the flood (down to ~40% at max warmth).
    const warmth = 1 - (deal.relationship ?? 0) / 100 * 0.6
    floodPressure += dist.flood * warmth
    heat += SPIKE_HEAT * dist.flood * warmth
    // The relationship cools slowly if untended.
    deal.relationship = clamp((deal.relationship ?? 0) - 0.5, 0, 100)
  }
  heat = clamp(heat - HEAT_DECAY, 0, 100)

  const scalping = heat >= SCALPER_THRESHOLD
  // How far over the threshold (0..1) — scales the intensity of every effect.
  const intensity = scalping ? clamp((heat - SCALPER_THRESHOLD) / (100 - SCALPER_THRESHOLD), 0, 1) : 0

  let popped = false

  // --- The flood: ongoing drag on singles + sealed demand (always, scaled by
  //     how much product is being dumped this week) ---
  if (floodPressure > 0 && next.cards?.length) {
    const drag = 1 - clamp(floodPressure * 0.012, 0, 0.06) // up to ~-6%/wk on singles
    next.cards = next.cards.map((c) =>
      c.banned || c.rotated ? c : { ...c, singlePrice: Math.round(c.singlePrice * drag * 100) / 100 }
    )
  }

  if (scalping) {
    // --- Short-term upside: singles spike on artificial scarcity ---
    const spike = 1 + intensity * 0.05 // up to +5%/wk while hot
    next.cards = next.cards.map((c) =>
      c.banned || c.rotated ? c : {
        ...c,
        singlePrice: Math.round(c.singlePrice * spike * 100) / 100,
        hype: clamp((c.hype ?? 0) + intensity * 0.12, 0, 3),
      }
    )

    // --- Ongoing cost: casual players priced out (bleed) + reputation sours ---
    if (next.segments) {
      const bleed = Math.round(next.segments.casual * intensity * 0.012)
      next.segments.casual = Math.max(0, next.segments.casual - bleed)
      next.playerBase = Math.max(0, next.segments.casual + next.segments.competitive + next.segments.collectors)
    }
    if (next.personas) {
      // Reviewers and fairness-minded voices sour fastest on a "scalper's game".
      next.personas = next.personas.map((p) => {
        const sens = 0.4 + (p.taste?.fairness ?? 0) * 0.8 + (p.type === 'reviewer' ? 0.4 : 0)
        return { ...p, sentiment: clamp(p.sentiment - intensity * 2.2 * sens, -100, 100) }
      })
    }

    // --- The pop: a probabilistic bubble burst, likelier the hotter/longer ---
    const popOdds = intensity * 0.05 // up to 5%/wk at max heat
    if (rng() < popOdds) {
      popped = true
      const crater = 1 - range(rng, 0.25, 0.45) // singles lose 25-45%
      next.cards = next.cards.map((c) =>
        c.banned || c.rotated ? c : {
          ...c,
          singlePrice: Math.round(c.singlePrice * crater * 100) / 100,
          hype: 0, momentum: Math.min(0, c.momentum ?? 0),
          priceHistory: [...(c.priceHistory ?? []), Math.round(c.singlePrice * crater * 100) / 100].slice(-26),
        }
      )
      // A glut of dumped stock also guts sealed demand: collapse heat (bubble's
      // gone) and mark live sets so revenue softens for a bit.
      heat = clamp(heat * 0.4, 0, 100)
      next.sets = next.sets.map((s) => (s.rotated ? s : { ...s, glutUntil: next.week + 8 }))
      next.eventsFeed = [
        { week: next.week, text: 'THE BUBBLE POPS: the scalper market collapses. Singles crater and a glut of dumped product floods shelves — sealed sales dry up.', kind: 'market' },
        ...(next.eventsFeed ?? []),
      ].slice(0, 60)
    }
  }

  next.scalperHeat = heat
  next.scalperState = { heat, scalping, intensity, popped, activeDeals: active.length }
}
