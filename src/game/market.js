// The secondary market. Resolves card prices week by week with fair-value
// gravity, momentum (trends), hype bubbles (that can burst), and seeded
// variance. Sealed product and singles move on different drivers.
// See docs/BRIEF.md "The secondary market".

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

const PRICE_HISTORY_LEN = 26 // ~half a year of weekly points kept per card

// ---- Fair value ----------------------------------------------------------

// A card's fair value is the MAX of two independent economies — a card is worth
// whatever it's most valuable FOR. This game has a thriving collector base AND a
// player base, and they can want completely different cards:
//
//   PLAYER value  — competitive relevance: playability × live-meta relevance.
//                   The staples of the best deck cost money; cards the format has
//                   passed by drift to bulk. This is the "actually played" side.
//   COLLECTOR value — rarity tier + art + the card's collector hype, scaled by
//                   scarcity. A gorgeous secret rare is a GRAIL worth a fortune
//                   even if it's competitively unplayable (the Pokémon side).
//
// max() means either path alone makes a card expensive: a meta common is valued
// on play, an unplayable chase mythic on collectibility, and a card strong in
// both is a true grail.
export function fairValue(card, set, metagame) {
  const f = card.popFactors

  // Under-printed sets keep singles scarce and pricey; over-print drags them.
  const scarcity = 1 + (1 - set.printRun / 100) * 1.4

  // --- Player value: playability modulated by the live meta ---
  const freshness = 1 - metagame.solveLevel / 140
  const obsolescence = 1 - Math.max(0, metagame.powerLevel - f.playability) / 200
  const relevance = clamp(freshness * obsolescence + 0.4, 0.35, 1.4)
  const playerVal = f.playability * relevance * 0.85 * scarcity * 0.6

  // --- Collector value: rarity tier + art + collector hype, fully scarcity-fed.
  // Rarity tier (0–100 from the set's sheet) dominates; rarity scarcity is
  // squared in so high-tier secret rares climb HARD. Independent of playability.
  const raritySq = (f.rarity / 100) ** 1.6 * 100 // convex: top tiers pull away
  const collectorBase = raritySq * 0.95 + f.artAppeal * 0.35 + f.hype * 0.2
  const collectorVal = collectorBase * scarcity * 0.6

  return clamp(Math.max(playerVal, collectorVal), 0.25, 12000)
}

// ---- Per-card weekly step -------------------------------------------------

// Mutates a card-market record in place for one week and returns a "mover"
// descriptor if the move is big enough to surface on the ticker.
function stepCard(card, set, metagame, rng) {
  const fair = fairValue(card, set, metagame)
  const prev = card.singlePrice

  // Hype is a self-reinforcing bubble term that decays. While elevated it
  // pushes price above fair value; when it collapses the price falls back —
  // a burst. Seeded by the card's own hype pop factor at release.
  card.hype = card.hype ?? card.popFactors.hype / 100 // 0..~1+
  // Speculative drift: hype occasionally spikes (persona-driven later), then bleeds off.
  const spike = rng() < 0.06 ? range(rng, 0.15, 0.5) : 0
  card.hype = clamp(card.hype * 0.86 + spike, 0, 2)

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
  const printScarcity = 1 + (1 - set.printRun / 100) * 2.2 // 1.0 (over) .. ~3.2 (under)
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

  const movers = []
  const cards = state.cards.map((orig) => {
    const card = { ...orig, priceHistory: [...orig.priceHistory] }

    // Promo cards belong to no set (they're never pulled). They trade purely as
    // scarce collectibles — a gentle upward drift (supply is tiny and fixed),
    // with occasional speculative pops. They CAN surface as movers.
    if (card.promo) {
      const prev = card.singlePrice
      const spike = rng() < 0.05 ? range(rng, 0.08, 0.3) : 0
      const drift = range(rng, -0.01, 0.03) + spike
      const next = Math.round(Math.max(1, prev * (1 + drift)) * 100) / 100
      card.singlePrice = next
      card.priceHistory = [...card.priceHistory, next].slice(-PRICE_HISTORY_LEN)
      const pct = prev > 0 ? (next - prev) / prev : 0
      if (Math.abs(pct) >= 0.06) movers.push({ id: card.id, name: card.name, price: next, prevPrice: prev, pct })
      return card
    }

    const set = setById.get(card.setId)
    if (!set) return card

    // Banned/rotated cards leave the competitive market — they drift on a
    // collector floor rather than trading on playability, and never appear as
    // movers. An OUT-OF-PRINT (pulled) set is different from a banned/legacy-
    // rotated one: its supply is fixed and shrinking, so it drifts gently UPWARD
    // (scarcity appreciation) instead of flat, and its sealed is priced as a
    // permanently out-of-print collectible.
    if (card.banned || card.rotated) {
      const outOfPrint = card.outOfPrint || set.outOfPrint
      const drift = outOfPrint ? range(rng, 0.0, 0.025) : range(rng, -0.01, 0.015)
      card.singlePrice = Math.round(card.singlePrice * (1 + drift) * 100) / 100
      card.priceHistory = [...card.priceHistory, card.singlePrice].slice(-26)
      card.sealedPrice = sealedPrice(set, state.week - set.releasedWeek)
      return card
    }

    const mover = stepCard(card, set, state.metagame, rng)
    card.sealedPrice = sealedPrice(set, state.week - set.releasedWeek)

    // Surface only meaningful moves (>=6%) as ticker movers.
    if (Math.abs(mover.pct) >= 0.06) movers.push(mover)
    return card
  })

  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  return { cards, movers: movers.slice(0, 8) }
}
