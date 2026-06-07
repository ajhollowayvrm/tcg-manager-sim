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
import { packRichnessDelta } from './rarities.js'

// Map the 0–100 print-run slider to actual units printed. A LOW print run must
// mean genuinely few units (real lost sales — the brief's cost of scarcity), so
// the curve starts near zero and ramps up, rather than sitting on a high floor
// that let under-printing keep all its volume AND charge a scarcity premium.
// Under-print ~30k, mid ~450k, over-print ~900k.
export function printRunUnits(printRun) {
  return Math.round(20_000 + (printRun / 100) * 880_000)
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
  // A booster richer than Classic makes cracking packs feel better — a modest
  // demand lift, paid for by the higher print cost; a leaner pack buzzes a touch
  // less. Relative to Classic, so the default pack is demand-neutral.
  const richness = packRichnessDelta(set.packFormat)
  return clamp((avgHype / 100) * (1 + richness * 0.12), 0.1, 1.3)
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
  // market. Casual players buy the most sealed, competitive some, collectors
  // chase sealed for value. Tuned (see tools/playtest.mjs) so a set's lifetime
  // profit is a modest multiple of its ~$160k cost — not the 50× it was — which
  // keeps cash a real constraint and bankruptcy reachable.
  const seg = state.segments
  const buyerPool = seg.casual * 0.26 + seg.competitive * 0.1 + seg.collectors * 0.16

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
