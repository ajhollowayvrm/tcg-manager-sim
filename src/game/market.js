// The secondary market. Resolves card prices week by week with fair-value
// gravity, momentum (trends), hype bubbles (that can burst), and seeded
// variance. Sealed product and singles move on different drivers.
// See docs/BRIEF.md "The secondary market".

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { legacyMultiplier } from './franchise.js'
import { COLLECTOR_MARKET_TILT } from './config.js'

const PRICE_HISTORY_LEN = 26 // ~half a year of weekly points kept per card

// The widest promo run promos.js can mint (prestige 0 → 5000 * 1 + 150). Used
// to normalize a promo's supply into a 0..1 scarcity term below.
const PROMO_SUPPLY_MAX = 5150

// ---- Fair value ----------------------------------------------------------

// A card's fair value is a pure COLLECTOR economy — rarity tier + art + the
// card's collector hype, scaled by scarcity. A gorgeous secret rare is a GRAIL
// worth a fortune purely on collectibility; there is no separate "actually
// played" price path.
// `legacyMul` (default 1, from franchise.js's legacyMultiplier) lifts old
// vintage cards for reasons independent of any one card's own stats — a
// franchise's growing reputation makes the whole back-catalog worth more.
export function fairValue(card, set, legacyMul = 1) {
  const f = card.popFactors

  // Under-printed sets keep singles scarce and pricey; over-print drags them.
  // A set that's actually SOLD THROUGH (live sell-through, not just its static
  // print-run dial) is scarcer in practice than one sitting on shelves at the
  // same print run — depletion sharpens scarcity beyond the authored number.
  const sellThrough = set.supply > 0 ? clamp((set.sold ?? 0) / set.supply, 0, 1) : 0
  const scarcity = 1 + (1 - set.printRun / 100) * 1.4 + sellThrough * 0.5

  // Rarity tier (0–100 from the set's sheet) dominates; rarity scarcity is
  // squared in so high-tier secret rares climb HARD.
  const raritySq = (f.rarity / 100) ** 1.6 * 100 // convex: top tiers pull away
  const collectorBase = raritySq * 0.95 + f.artAppeal * 0.35 + f.hype * 0.2
  // Chase-dense sets (minors/micros, set.collectorMul > 1) and block-gimmick
  // treatment cards trade RICHER — that's the secondary-market draw of a
  // collector drop.
  // A hard-capped serialized card (see sets.js) is worth dramatically more the
  // smaller its cap — a true 1-of-1 caps at 15×, a /99 barely lifts at ~1.5×.
  const serialLift = card.serialCap ? clamp(120 / card.serialCap, 1.5, 15) : 1
  // A third-party-graded card (see grading.js) carries a flat, permanent
  // certification premium.
  // Grading lifts a card — but the POPULATION REPORT is the thing collectors
  // actually price off: a high-grade card is worth more when few others exist.
  // `gradedPopulation` was tracked (grading.js) and displayed (MarketTicker)
  // but never priced, so the defining mechanic of grading did nothing.
  // Anchored so a TYPICAL population (~25 slabs) reproduces the historical flat
  // 1.4×: a freshly-slabbed rarity runs up to ~1.65×, a mass-graded card decays
  // toward ~1.19×. Population matters, without repricing the whole market.
  const pop = card.gradedPopulation ?? 0
  const popScarcity = clamp(1.18 - Math.log10(1 + pop) * 0.13, 0.85, 1.18)
  const gradedLift = card.graded ? 1.4 * popScarcity : 1
  // A set the player tuned chase-heavy (draft.rarityChase, 0=accessible..
  // 100=chase-heavy, see SetBuilder's "Rarity distribution" slider) trades
  // richer across every card in it — the design choice to make pulls feel
  // special pays off directly in secondary-market value.
  const chaseLift = 0.7 + ((set.rarityChase ?? 50) / 100) * 0.6
  const collectorLift = (set.collectorMul ?? 1) * (card.treatment ? 1.25 : 1) * serialLift * gradedLift * chaseLift
  const collectorVal = collectorBase * scarcity * 0.6 * collectorLift * legacyMul * COLLECTOR_MARKET_TILT

  return clamp(collectorVal, 0.25, 12000)
}

// ---- Per-card weekly step -------------------------------------------------

// Mutates a card-market record in place for one week and returns a "mover"
// descriptor if the move is big enough to surface on the ticker.
function stepCard(card, set, rng, legacyMul = 1) {
  const fair = fairValue(card, set, legacyMul)
  const prev = card.singlePrice

  // Hype is a self-reinforcing bubble term that decays. While elevated it
  // pushes price above fair value; when it collapses the price falls back —
  // a burst. Seeded by the card's own hype pop factor at release.
  card.hype = card.hype ?? card.popFactors.hype / 100 // 0..~1+
  // Speculative drift: hype occasionally spikes (persona-driven later), then bleeds off.
  const spike = rng() < 0.06 ? range(rng, 0.15, 0.5) : 0
  // A bigger, more established franchise can support a bigger bubble before it
  // matters — the hype ceiling rises a little with legacyMul (i.e. reputation).
  const hypeCap = 2 + (legacyMul - 1) * 1.2
  card.hype = clamp(card.hype * 0.86 + spike, 0, hypeCap)

  // Momentum: last week's move persists a little (trends), creating runs.
  card.momentum = card.momentum ?? 0

  // Gravity pulls price toward fair value; hype lifts the target above it.
  const target = fair * (1 + card.hype * 0.6)
  const gravity = (target - prev) * 0.18

  // Variance scales with price so cheap cards aren't whipsawed in absolute terms.
  const noise = range(rng, -0.08, 0.08) * prev

  const delta = gravity + card.momentum * 0.4 + noise
  card.momentum = card.momentum * 0.5 + delta * 0.5

  let next = clamp(prev + delta, 0.1, 6000)
  next = Math.round(next * 100) / 100
  card.singlePrice = next

  card.priceHistory = [...card.priceHistory, next].slice(-PRICE_HISTORY_LEN)

  const pctRaw = prev > 0 ? (next - prev) / prev : 0
  return { id: card.id, name: card.name, price: next, prevPrice: prev, pct: pctRaw }
}

// ---- Sealed product -------------------------------------------------------

// Sealed value tracks scarcity and age rather than the metagame. Sealed product
// *starts at MSRP* and appreciates toward a scarcity-driven ceiling as supply
// dries up — under-printed sets climb high; over-printed sets barely move.
// The curve is continuous from week 0 (weeksSince=0 → MSRP), so there's no
// cliff on the first tick. Set-level (every pack of a set is the same product).
export function sealedPrice(set, weeksSince) {
  // An out-of-print (pulled) set is no longer being made — treat it as maximally
  // scarce so its sealed asymptotes to a higher ceiling (the out-of-print bump).
  // Live sell-through sharpens this beyond the static print-run dial, same as
  // fairValue — a set that's actually sold out prices tighter than one that
  // merely has a low print run but is sitting unsold.
  const sellThrough = set.supply > 0 ? clamp((set.sold ?? 0) / set.supply, 0, 1) : 0
  const printScarcity = 1 + (1 - set.printRun / 100) * 2.2 + sellThrough * 0.8 // 1.0 (over) .. ~4.0 (under+sold out)
  const scarcity = set.outOfPrint ? Math.max(printScarcity, 3.0) * 1.25 : printScarcity
  const ceiling = set.price * scarcity // where sealed asymptotes as it dries up
  // Exponential approach to the ceiling: 0 weeks → MSRP, → ceiling over time.
  // Scarcer sets dry up faster (steeper rate).
  const rate = 0.05 * scarcity
  const t = 1 - Math.exp(-rate * weeksSince)
  const price = set.price + (ceiling - set.price) * t
  return Math.round(price * 100) / 100
}

// ---- Public: resolve the whole market for one week ------------------------

// Returns { cards, movers } — the updated card list and the notable movers
// this week (sorted by absolute % move), for the ticker to animate.
export function resolveMarket(state) {
  const setById = new Map(state.sets.map((s) => [s.id, s]))
  const rng = makeRng(hashSeed(`market:${state.week}`))
  const reputation = state.franchise?.reputation ?? 0

  const movers = []
  const cards = state.cards.map((orig) => {
    const card = { ...orig, priceHistory: [...orig.priceHistory] }

    // Promo cards belong to no set (they're never pulled). They trade purely as
    // scarce collectibles — a gentle upward drift (supply is tiny and fixed),
    // with occasional speculative pops. They CAN surface as movers.
    if (card.promo) {
      const prev = card.singlePrice
      const spike = rng() < 0.05 ? range(rng, 0.08, 0.3) : 0
      // Promo SUPPLY finally prices. `promoSupply` (promos.js) is the whole
      // point of a promo — a championship run is a few hundred copies, a league
      // run a few thousand — and it was written on the card record and read
      // nowhere, so every promo drifted identically. A scarce run appreciates;
      // a mass-issued one bleeds. Anchored on promos.js's own output band
      // (~150 copies at prestige 1, ~5,150 at prestige 0).
      const scarcity = clamp((PROMO_SUPPLY_MAX - (card.promoSupply ?? 2000)) / PROMO_SUPPLY_MAX, 0, 1)
      const drift = range(rng, -0.02 + scarcity * 0.02, 0.01 + scarcity * 0.035) + spike
      const next = Math.round(Math.max(1, prev * (1 + drift)) * 100) / 100
      card.singlePrice = next
      card.priceHistory = [...card.priceHistory, next].slice(-PRICE_HISTORY_LEN)
      const pct = prev > 0 ? (next - prev) / prev : 0
      if (Math.abs(pct) >= 0.06) movers.push({ id: card.id, name: card.name, price: next, prevPrice: prev, pct })
      return card
    }

    const set = setById.get(card.setId)
    if (!set) return card

    // A pulled-from-print card's supply is fixed and shrinking — it drifts
    // gently UPWARD (scarcity appreciation) instead of trading on the normal
    // gravity/hype step, and its sealed is priced as a permanently
    // out-of-print collectible.
    if (card.outOfPrint) {
      const drift = range(rng, 0.0, 0.025)
      card.singlePrice = Math.round(card.singlePrice * (1 + drift) * 100) / 100
      card.priceHistory = [...card.priceHistory, card.singlePrice].slice(-26)
      card.sealedPrice = sealedPrice(set, state.week - set.releasedWeek)
      return card
    }

    const ageWeeks = state.week - set.releasedWeek
    const legacyMul = legacyMultiplier(reputation, ageWeeks, { anniversaryBoost: set.tier === 'anniversary' })
    const mover = stepCard(card, set, rng, legacyMul)
    card.sealedPrice = sealedPrice(set, ageWeeks)
    // A rough dollar estimate of how much of this week's price is the franchise-
    // reputation "legacy" premium, for the ticker to show as a distinct line.
    card.legacyValue = legacyMul > 1 ? Math.round((legacyMul - 1) * card.singlePrice * 100) / 100 : 0

    // Surface only meaningful moves (>=6%) as ticker movers.
    if (Math.abs(mover.pct) >= 0.06) movers.push(mover)
    return card
  })

  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  return { cards, movers: movers.slice(0, 8) }
}
