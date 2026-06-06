// The secondary market. Resolves card prices week by week with fair-value
// gravity, momentum (trends), hype bubbles (that can burst), and seeded
// variance. Sealed product and singles move on different drivers.
// See docs/BRIEF.md "The secondary market".

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

const PRICE_HISTORY_LEN = 26 // ~half a year of weekly points kept per card

// ---- Fair value ----------------------------------------------------------

// A card's fair value. This is a PLAYED game (not a pure collectible), so a
// card's competitive relevance — its playability, modulated by the live meta —
// is the PRIMARY price driver: the staples of the best deck are what cost money,
// and a card the format has passed by drifts toward bulk no matter how it looks.
//
// But rarity and art still carry real collectible value (the "Pokémon" pull): a
// gorgeous chase mythic holds a respectable premium even if it's not a 4-of, it
// just won't out-price the meta staples. So rarity/art form a collectible BASE
// that meta-relevance is layered on top of.
export function fairValue(card, set, metagame) {
  const f = card.popFactors
  // Meta relevance multiplier, 0.35–1.4. High solve & high power erode it; a
  // fresh format where the card is on-curve maxes it.
  const freshness = 1 - metagame.solveLevel / 140 // fresher meta → higher
  const obsolescence = 1 - Math.max(0, metagame.powerLevel - f.playability) / 200
  const relevance = clamp(freshness * obsolescence + 0.4, 0.35, 1.4)

  // Playability is the dominant term (~60% of a typical card's value), and it's
  // the only one scaled by meta-relevance — so the meta genuinely moves prices.
  const playabilityVal = f.playability * relevance * 0.7

  // Collectible base: rarity + art give a price even to unplayed cards, but it's
  // a secondary floor/premium, not enough to crown a pretty-but-useless card.
  const rarityVal = f.rarity * 0.12
  const artVal = f.artAppeal * 0.16

  // Under-printed sets keep singles scarce and pricey; over-print drags them.
  const scarcity = 1 + (1 - set.printRun / 100) * 1.4

  return clamp((playabilityVal + rarityVal + artVal) * scarcity * 0.6, 0.25, 5000)
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
  const scarcity = 1 + (1 - set.printRun / 100) * 2.2 // 1.0 (over) .. ~3.2 (under)
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
    const set = setById.get(card.setId)
    if (!set) return card

    // Banned/rotated cards leave the competitive market — they drift gently on a
    // collector floor rather than trading on playability, and never appear as
    // movers. Sealed for a rotated set still ages as a collectible.
    if (card.banned || card.rotated) {
      card.singlePrice = Math.round(card.singlePrice * (1 + range(rng, -0.01, 0.015)) * 100) / 100
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
