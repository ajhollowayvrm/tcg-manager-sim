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
import { channelBlend } from './products.js'

// Anti-scalping toolkit — phantom-stock policy (see toggleAntiScalpingPolicy):
// damps the channel-mix heat contribution, at a small real-demand cost.
const PHANTOM_STOCK_REACH_DAMP = 0.9
const PHANTOM_STOCK_HEAT_DAMP = 0.6

// How hard channel-mix scalper exposure feeds the shared heat gauge, per unit
// sold. Small — this is a slow ambient pressure alongside signed distributor
// deals, not a replacement for them (see distributors.js's SPIKE_HEAT).
const CHANNEL_HEAT_SCALE = 0.00004

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
// Exported for merch.js — merch's own weekly demand needs the same curve.
export function priceElasticity(price, ref = 4.5) {
  const scale = ref / 4.5 // stretch the curve to the SKU's price band
  return clamp(1.7 - price / (5.5 * scale), 0.06, 1.5)
}

// A set's average signature-card hype, as an appeal signal for how much people
// want to crack packs of it. Falls back to neutral if a set somehow has no
// cards. (Distinct from `set.buzz` — the persisted, release-pressure stat that
// decays weekly in simulation.js; this is recomputed fresh each week from the
// set's live cards.)
// How much a single card contributes to its set's pack demand.
//
// LIVE hype, not the frozen release-time number. `popFactors.hype` is the card's
// intrinsic desirability, fixed at printing; `card.hype` is what the community
// is ACTUALLY excited about right now — moved every week by personas, box
// breaks, god packs and pre-launch reveals. Reading only the former is why the
// community's loudest effect on cards used to have no path into pack sales at
// all (it reached singles prices via market.js and stopped there).
//
// Anchored with `max`, not a blend, for a specific reason: `card.hype` seeds at
// `popFactors.hype / 100` and then decays ~14%/wk (market.js's stepCard). Using
// it raw would decay a set's demand a THIRD time, on top of `ageDecay` and
// `freshness`, and quietly gut every back-catalogue set. Taking the max means a
// set never sells worse than its intrinsic quality, but a card the community
// talks itself into a frenzy over really does move packs.
function cardPull(card) {
  const intrinsic = card.popFactors?.hype ?? 50
  const live = (card.hype ?? 0) * 100 // card.hype is 0..~3 on a /100 scale
  return clamp(Math.max(intrinsic, live), 0, 150)
}

// How much a card COUNTS toward its set's appeal. A 120-card set is mostly bulk
// commons nobody buys a box for, so a flat mean buried the player's design work
// (driving every signature card from 5 to 100 moved the old average ~6 points).
// Weighting by collector tier means the cards people actually chase are the ones
// that sell the packs.
function cardWeight(card) {
  const tier = (card.popFactors?.rarity ?? 40) / 100
  const chase = card.treatment || card.secret || card.signature ? 1.4 : 1
  return (0.35 + Math.pow(clamp(tier, 0, 1), 1.5) * 2.2) * chase
}

function setAppeal(set, cards) {
  const own = cards.filter((c) => c.setId === set.id)
  if (own.length === 0) return 0.5
  let wSum = 0
  let weight = 0
  for (const c of own) {
    const w = cardWeight(c)
    wSum += cardPull(c) * w
    weight += w
  }
  const avgHype = weight > 0 ? wSum / weight : 50
  // A booster richer than Classic makes cracking packs feel better — a modest
  // demand lift, paid for by the higher print cost; a leaner pack buzzes a touch
  // less. Relative to Classic, so the default pack is demand-neutral. Reprinting
  // fan-favorite cards into the set adds a further fan-service buzz lift.
  const richness = packRichnessDelta(set.packFormat)
  const reprintBuzz = set.reprintBuzz ?? 0
  // Block-gimmick treatment cards (the era's chase subtype) make cracking
  // packs feel better — a further demand lift on top of richness/reprints.
  const treatmentBuzz = set.treatmentBuzz ?? 0
  // Cards previewed before launch arrive already wanted — a modest sealed-demand
  // lift on top of the rest (see sets.js's spotlight curve).
  const spotlightAppeal = set.spotlightAppeal ?? 0
  // A coherent illustration set in this release makes the sealed product a more
  // attractive thing to buy — you are not chasing one card, you are chasing a
  // page. Same 0..0.12 band as spotlightAppeal above, because the two are
  // pre-launch marketing acts of comparable size. Written onto the set record by
  // illustrationsets.js and REFRESHED weekly, which buys something real for
  // free: completing a run years later lifts the OLD set's sales again, exactly
  // as a long-awaited capstone revives interest in the product its predecessors
  // came in.
  const illustrationAppeal = set.illustrationAppeal ?? 0
  // WHO is in this set, read fresh every week (cast.js's castAppealFor, written
  // onto the set record by simulation.js). Same 0..0.12 band as the two above
  // because it is an act of the same size — and it buys the thing a persistent
  // cast is FOR: a set whose characters became household names two years later
  // keeps moving product, and one whose cast went quiet stops. popFactors
  // freezes a card's cast bonus at print, so without this term a character's
  // whole career after her debut set was worth nothing to that set.
  const castAppeal = set.castAppeal ?? 0
  // Rider fatigue (sets.js): the Nth consecutive rider since the last major
  // sells worse for its WHOLE LIFE, not just its launch week. Fatigue used to
  // scale only the discovery wave, so a studio shipping a cheap rider every
  // four weeks recruited badly but still moved packs at full appeal — which is
  // how rider spam became the highest-earning strategy in the game.
  const fatigue = set.riderFatigue ?? 1
  return clamp((avgHype / 100) * (1 + richness * 0.12 + reprintBuzz + treatmentBuzz + spotlightAppeal + illustrationAppeal + castAppeal) * fatigue, 0.1, 1.5)
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

  // Staleness: as THIS set's own buzz cools, sealed interest fades, but never
  // fully dies while the set is in print (floor keeps a long tail).
  const freshness = clamp(0.55 + (set.buzz ?? 50) / 100 * 0.45, 0.55, 1)
  const ageDecay = clamp(Math.exp(-age / 30), 0.12, 1) // gentle, long-lived tail

  const buzz = 0.3 + setAppeal(set, state.cards) * 1.1 // 0.41 (dead) .. 1.62 (hot)
  const elasticity = priceElasticity(product.price, product.elasticityRef ?? 4.5)

  // A bigger, more established franchise sells sealed product a little easier —
  // brand pull, not just this set's own hype (mirrors legacyMultiplier's lift on
  // the collector side in market.js; here it's the SEALED-demand side of the same
  // reputation stat). Small and capped so a young studio's own hype still carries
  // most of the weight.
  const reputationMul = clamp(1 + (state.franchise?.reputation ?? 0) / 400, 1, 1.35)

  // Buyer pool, weighted by THIS SKU's appeal to each segment. A collector box
  // leans hard on collectors, a bundle on casuals, etc.
  const seg = state.segments
  const a = product.appeal ?? { casual: 0.32, collectors: 0.20 }
  const buyerPool = seg.casual * a.casual + seg.collectors * a.collectors

  const noise = range(rng, 0.85, 1.15)

  // A post-pop glut (set.glutUntil) means dumped product is sitting on shelves —
  // nobody buys sealed at retail when it's cheaper resold. Halve demand until it
  // clears.
  const glut = set.glutUntil && state.week < set.glutUntil ? 0.5 : 1

  // demandMul scales volume for the SKU's form factor (a $90 box moves far fewer
  // units than a pack). 1 for boosters → identical to the old formula.
  const mul = product.demandMul ?? 1

  // Channel mix (direct/LGS/big-box/international) further scales volume by
  // audience reach — a big-box-heavy split reaches more buyers, a direct-only
  // split fewer (see products.js CHANNELS/channelBlend).
  let reachMul = channelBlend(product.channels, 'reachMul')
  // Phantom-stock policy (see toggleAntiScalpingPolicy): showing "sold out"
  // before stock is truly gone deters bots, but some genuine customers bounce
  // off the fake sign too — a small real demand cost for the anti-scalping win.
  if (state.phantomStockPolicy) reachMul *= PHANTOM_STOCK_REACH_DAMP

  const units = buyerPool * launch * freshness * ageDecay * buzz * elasticity * noise * glut * mul * reachMul * reputationMul
  return Math.max(0, Math.round(units))
}

// The product lineup to sell for a set: its authored `products`, or — for sets
// saved before SKUs existed — a synthetic single booster line built from the
// legacy supply/price/sold fields, so old saves keep selling exactly as before.
function setProducts(set) {
  if (set.products?.length) return set.products
  return [{
    kind: 'booster', name: 'Booster packs', price: set.price,
    appeal: { casual: 0.32, collectors: 0.20 }, demandMul: 1, elasticityRef: 4.5,
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
  let channelHeatDelta = 0
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
      // Channel margin: a big-box/international-heavy split nets less per unit
      // than direct/LGS (see products.js CHANNELS); the booster/SKU price stays
      // the sticker price, marginMul is what you actually keep.
      const marginMul = channelBlend(p.channels, 'marginMul')
      const revenue = Math.round(units * p.price * marginMul)
      const exposure = channelBlend(p.channels, 'scalperExposure')

      cashDelta += revenue
      unitsSold += units
      setUnits += units
      setRevenue += revenue
      const phantomDamp = state.phantomStockPolicy ? PHANTOM_STOCK_HEAT_DAMP : 1
      channelHeatDelta += units * exposure * CHANNEL_HEAT_SCALE * phantomDamp
      if (units > 0) perProduct.push({ kind: p.kind, name: p.name, units, revenue })

      return { ...p, supply, sold: sold + units }
    })

    if (setUnits > 0) perSet.push({ id: set.id, name: set.name, units: setUnits, revenue: setRevenue, perProduct })

    // Keep the legacy booster-line fields (supply/sold) in sync with products[0]
    // so market scarcity, distributors, events, and the sets panel are unchanged.
    const booster = nextProducts[0]
    return { ...set, products: nextProducts, supply: booster.supply, sold: booster.sold }
  })

  return { sets, cashDelta, unitsSold, perSet, channelHeatDelta }
}
