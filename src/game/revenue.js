// Revenue — weekly sealed-product sales. The income half of the economy that
// pairs with the costs already paid at set creation. See docs/BRIEF.md
// "Economy & loss conditions".
//
// Sealed sales are driven by: launch + prerelease buzz (a spike that decays),
// set age and how solved the format is (stale formats sell fewer packs), the
// set's hype (carried by its signature cards / reviews), the player base
// (casual players buy the most sealed), and a price-elasticity curve (a higher
// MSRP earns more per pack but sells fewer). Crucially, you can never sell more
// than you PRINTED — under-printing caps revenue (lost sales), while
// over-printing leaves unsold stock that drags the secondary market.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

// Map the 0–100 print-run slider to actual units printed. Under-print ~120k,
// over-print ~900k. This is the hard ceiling on lifetime sealed sales.
export function printRunUnits(printRun) {
  return Math.round(120_000 + (printRun / 100) * 780_000)
}

// Price elasticity: demand multiplier as a function of MSRP. ~$4.50 is the
// reference sweet spot (×1). Cheap packs move more units; an over-priced pack
// collapses demand hard (a $12 pack sells a small fraction of a $4.50 one).
function priceElasticity(price) {
  return clamp(1.7 - price / 5.5, 0.06, 1.5)
}

// A set's average signature-card hype, as a buzz signal for how much people
// want to crack packs of it. Falls back to neutral if a set somehow has no cards.
function setBuzz(set, cards) {
  const own = cards.filter((c) => c.setId === set.id)
  if (own.length === 0) return 0.5
  const avgHype = own.reduce((s, c) => s + (c.popFactors?.hype ?? 50), 0) / own.length
  return clamp(avgHype / 100, 0.1, 1.2)
}

// Weekly pack demand for one set, before the supply cap. Returns a unit count.
function weeklyDemand(set, state, rng) {
  const age = state.week - set.releasedWeek

  // Launch curve: a big spike in the first weeks that decays. Prerelease and
  // chase-pullable prerelease front-load more of it.
  const launchPeak = set.prerelease?.enabled ? 3.0 : 2.4
  const launch = 1 + (launchPeak - 1) * Math.exp(-age / 6)

  // Staleness: as the format gets solved, sealed interest for an aging set fades,
  // but never fully dies while the set is in print (floor keeps a long tail).
  const freshness = clamp(1 - state.metagame.solveLevel / 220, 0.55, 1)
  const ageDecay = clamp(Math.exp(-age / 30), 0.12, 1) // gentle, long-lived tail

  const buzz = 0.3 + setBuzz(set, state.cards) * 1.1 // 0.41 (dead) .. 1.62 (hot)
  const elasticity = priceElasticity(set.price)

  // Buyer pool: each tracked player stands in for a slice of the wider sealed
  // market, so per-capita pack rates are high. Casual players buy the most
  // sealed, competitive some, collectors chase sealed for value.
  const seg = state.segments
  const buyerPool = seg.casual * 1.1 + seg.competitive * 0.45 + seg.collectors * 0.7

  const noise = range(rng, 0.85, 1.15)

  const units = buyerPool * launch * freshness * ageDecay * buzz * elasticity * noise
  return Math.max(0, Math.round(units))
}

// Resolve sealed sales for every live set this week. Mutates set.sold and
// returns { cashDelta, unitsSold, perSet:[{id,name,units,revenue}] }.
export function resolveRevenue(state) {
  const rng = makeRng(hashSeed(`revenue:${state.week}`))
  let cashDelta = 0
  let unitsSold = 0
  const perSet = []

  const sets = state.sets.map((set) => {
    if (set.rotated) return set // out of print / out of the channel

    const supply = set.supply ?? printRunUnits(set.printRun)
    const sold = set.sold ?? 0
    const remaining = supply - sold
    if (remaining <= 0) return { ...set, supply, sold }

    const demand = weeklyDemand(set, state, rng)
    const units = Math.min(demand, remaining)
    const revenue = Math.round(units * set.price)

    cashDelta += revenue
    unitsSold += units
    if (units > 0) perSet.push({ id: set.id, name: set.name, units, revenue })

    return { ...set, supply, sold: sold + units }
  })

  return { sets, cashDelta, unitsSold, perSet }
}
