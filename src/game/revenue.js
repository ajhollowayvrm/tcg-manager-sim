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

// Price elasticity: demand multiplier as a function of MSRP, relative to a
// product's reference sweet spot (~$4.50 for boosters). Cheaper-than-reference
// moves more units; over-priced collapses demand hard. `ref` lets each SKU have
// its own sweet spot (a $90 collector box isn't judged against $4.50). With
// ref=4.5 this reproduces the original booster curve exactly.
function priceElasticity(price, ref = 4.5) {
  const scale = ref / 4.5 // stretch the curve to the SKU's price band
  return clamp(1.7 - price / (5.5 * scale), 0.06, 1.5)
}

// A set's average signature-card hype, as a buzz signal for how much people
// want to crack packs of it. Falls back to neutral if a set somehow has no cards.
function setBuzz(set, cards) {
  const own = cards.filter((c) => c.setId === set.id)
  if (own.length === 0) return 0.5
  const avgHype = own.reduce((s, c) => s + (c.popFactors?.hype ?? 50), 0) / own.length
  // A booster richer than Classic makes cracking packs feel better — a modest
  // demand lift, paid for by the higher print cost; a leaner pack buzzes a touch
  // less. Relative to Classic, so the default pack is demand-neutral. Reprinting
  // fan-favorite cards into the set adds a further fan-service buzz lift.
  const richness = packRichnessDelta(set.packFormat)
  const reprintBuzz = set.reprintBuzz ?? 0
  // Block-gimmick treatment cards (Mega/Ascended/Phantasmal chase) make cracking
  // packs feel better — a further demand lift on top of richness/reprints.
  const treatmentBuzz = set.treatmentBuzz ?? 0
  return clamp((avgHype / 100) * (1 + richness * 0.12 + reprintBuzz + treatmentBuzz), 0.1, 1.5)
}

// Weekly demand for ONE product SKU of a set, before its supply cap. Returns a
// unit count. The set-wide drivers (launch curve, freshness, age, buzz, glut)
// are shared; the per-SKU drivers are its segment APPEAL (who buys it), its
// volume multiplier, and its own price elasticity. The booster SKU's appeal/mul
// reproduce the original single-product formula exactly.
function weeklyDemand(set, product, state, rng) {
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
  const elasticity = priceElasticity(product.price, product.elasticityRef ?? 4.5)

  // Buyer pool, weighted by THIS SKU's appeal to each segment. Boosters use the
  // original weights (0.26/0.1/0.16) so they're unchanged; a collector box leans
  // hard on collectors, a bundle on casuals, etc.
  const seg = state.segments
  const a = product.appeal ?? { casual: 0.26, competitive: 0.1, collectors: 0.16 }
  const buyerPool = seg.casual * a.casual + seg.competitive * a.competitive + seg.collectors * a.collectors

  const noise = range(rng, 0.85, 1.15)

  // A post-pop glut (set.glutUntil) means dumped product is sitting on shelves —
  // nobody buys sealed at retail when it's cheaper resold. Halve demand until it
  // clears.
  const glut = set.glutUntil && state.week < set.glutUntil ? 0.5 : 1

  // demandMul scales volume for the SKU's form factor (a $90 box moves far fewer
  // units than a pack). 1 for boosters → identical to the old formula.
  const mul = product.demandMul ?? 1

  const units = buyerPool * launch * freshness * ageDecay * buzz * elasticity * noise * glut * mul
  return Math.max(0, Math.round(units))
}

// The product lineup to sell for a set: its authored `products`, or — for sets
// saved before SKUs existed — a synthetic single booster line built from the
// legacy supply/price/sold fields, so old saves keep selling exactly as before.
function setProducts(set) {
  if (set.products?.length) return set.products
  return [{
    kind: 'booster', name: 'Booster packs', price: set.price,
    appeal: { casual: 0.26, competitive: 0.1, collectors: 0.16 }, demandMul: 1, elasticityRef: 4.5,
    supply: set.supply ?? printRunUnits(set.printRun), sold: set.sold ?? 0,
  }]
}

// Resolve sealed sales for every live set this week, across all of each set's
// product SKUs. Mutates each product's sold (and keeps the legacy set.sold synced
// to the booster line). Returns { cashDelta, unitsSold, perSet:[{id,name,units,
// revenue,perProduct}] }.
export function resolveRevenue(state) {
  const rng = makeRng(hashSeed(`revenue:${state.week}`))
  let cashDelta = 0
  let unitsSold = 0
  const perSet = []

  const sets = state.sets.map((set) => {
    if (set.rotated) return set // out of print / out of the channel

    const products = setProducts(set)
    let setUnits = 0
    let setRevenue = 0
    const perProduct = []

    const nextProducts = products.map((p) => {
      const supply = p.supply ?? 0
      const sold = p.sold ?? 0
      const remaining = supply - sold
      if (remaining <= 0) return { ...p, supply, sold }

      const demand = weeklyDemand(set, p, state, rng)
      const units = Math.min(demand, remaining)
      const revenue = Math.round(units * p.price)

      cashDelta += revenue
      unitsSold += units
      setUnits += units
      setRevenue += revenue
      if (units > 0) perProduct.push({ kind: p.kind, name: p.name, units, revenue })

      return { ...p, supply, sold: sold + units }
    })

    if (setUnits > 0) perSet.push({ id: set.id, name: set.name, units: setUnits, revenue: setRevenue, perProduct })

    // Keep the legacy booster-line fields (supply/sold) in sync with products[0]
    // so market scarcity, distributors, events, and the sets panel are unchanged.
    const booster = nextProducts[0]
    return { ...set, products: nextProducts, supply: booster.supply, sold: booster.sold }
  })

  return { sets, cashDelta, unitsSold, perSet }
}
