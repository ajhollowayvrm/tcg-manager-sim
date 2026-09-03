// The secondary market. Resolves card prices week by week with fair-value
// gravity, momentum (trends), hype bubbles (that can burst), and seeded
// variance. Sealed product and singles move on different drivers.
// See docs/BRIEF.md "The secondary market".

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { liveCastStandingIndexed, CAST_HEAT_PREMIUM } from './cast.js'
import { legacyMultiplier } from './franchise.js'
import { COLLECTOR_MARKET_TILT } from './config.js'
import { illustrationContext, completionPremium, HALO_MAX } from './illustrationsets.js'

// The most a sought-after illustrator adds to their cards' value. Capped at the
// same 1.25x as a block-gimmick treatment card, deliberately: being by the
// illustrator of the moment is worth about what being an era's chase subtype is.
//
// Defined here rather than imported from artists.js on purpose. artists.js
// imports clamp from simulation.js, and simulation.js imports resolveMarket from
// this file — so importing a CONST across that edge would put it in the temporal
// dead zone if the modules ever evaluate in the other order. The existing cycles
// in this graph survive only because what they import (clamp) is a hoisted
// function declaration. Not worth the risk for one number.
const ARTIST_HEAT_PREMIUM = 0.25

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
export function fairValue(card, set, legacyMul = 1, groupPremium = 1, artistHeat = 0, castStanding = 0) {
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
  // Belonging to an illustration set (illustrationsets.js). A capstone that
  // FINISHES a coherent run carries the big multiplier — that is what a
  // collector is actually paying for — and every other member holds a smaller
  // floor because somebody needs it to complete the run. Both scale by how much
  // of what was promised has actually been printed, so an abandoned trilogy
  // pays nothing at all.
  //
  // It tops out around 1.8x, which is far below serialLift (15x) and
  // variantScarcityPremium (12x), and that gap is the design statement: a group
  // is a DESIGN act, not a scarcity act. Nothing about grouping three cards
  // reduces how many copies are printed. Exactly 1 for a card in no group, so
  // this is safe to fold in unconditionally.
  // Who DREW it. artistId was written onto every signature card at print time,
  // spent on a one-off art-appeal bonus, and then read by nothing — so the
  // forty-four-name roster was a price list, and no card was ever worth more
  // because of the hand behind it. An artist's collector heat (artists.js)
  // drifts off how their live cards actually perform, and tops out at the same
  // 1.25x as a block-gimmick treatment card: being by the illustrator of the
  // moment is worth about what being an era's chase subtype is.
  const artistLift = 1 + clamp(artistHeat / 100, 0, 1) * ARTIST_HEAT_PREMIUM
  // WHO is on it, read fresh every week rather than frozen at print. popFactors
  // banks a card's cast bonus the moment it is printed, so without this a
  // character who becomes a household name three years later does nothing for
  // the cards she is already on — and "this is an Aryla card" is precisely the
  // sentence a collector prices off. Same 0.25 band as the illustrator premium
  // above: the hand and the face are worth about the same.
  const castLift = 1 + clamp(castStanding / 100, 0, 1) * CAST_HEAT_PREMIUM
  // `card.treatment === true`, NOT truthiness. THE FIELD CARRIES TWO DIFFERENT
  // THINGS and this line only ever meant one of them:
  //
  //   blocks.js writes `treatment: true` — a boolean flag marking a block-gimmick
  //     chase card (and an anniversary card), which is what this 1.25x is for;
  //   sets.js writes `treatment: 'debut'|'standard'|'premium'|'icon'` — the
  //     CHARACTER PRINTING TIER on a signature card, an unrelated system that
  //     already pays through famePopBonus's appealMul.
  //
  // Testing truthiness gave every signature card in the game a 25% collector
  // premium it was never designed to have, on top of the fame bonus it had
  // already earned. An older save's gimmick cards store the boolean, so they
  // keep the premium; signature cards stop double-dipping.
  const collectorLift = (set.collectorMul ?? 1) * (card.treatment === true ? 1.25 : 1) * serialLift * gradedLift * chaseLift * groupPremium * artistLift * castLift
  const collectorVal = collectorBase * scarcity * 0.6 * collectorLift * legacyMul * COLLECTOR_MARKET_TILT

  return clamp(collectorVal, 0.25, 12000)
}

// ---- Per-card weekly step -------------------------------------------------

// Mutates a card-market record in place for one week and returns a "mover"
// descriptor if the move is big enough to surface on the ticker.
function stepCard(card, set, rng, legacyMul = 1, groupPremium = 1, artistHeat = 0, castStanding = 0) {
  const fair = fairValue(card, set, legacyMul, groupPremium, artistHeat, castStanding)
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
// How hard a promo is pulled toward its fair value each week. Gentler than
// stepCard's 0.18: a promo trades thinly, so it takes a while to find its level.
const PROMO_GRAVITY = 0.06
// The ceiling on a promo. Deliberately above fairValue's 12000 clamp — a promo
// IS meant to be among the scarcest, priciest singles in the game — but finite,
// which is the part that was missing.
const PROMO_PRICE_CAP = 20000

export function resolveMarket(state) {
  const setById = new Map(state.sets.map((s) => [s.id, s]))
  const rng = makeRng(hashSeed(`market:${state.week}`))
  const reputation = state.franchise?.reputation ?? 0
  // Built ONCE, beside setById, for the same reason: a `.find()` over groups
  // inside the per-card loop below would be O(cards x groups) every week, and a
  // late run holds several thousand cards. Empty Map on a run with no groups,
  // so every lookup misses and completionPremium returns exactly 1.
  const groups = illustrationContext(state)
  // Artist collector heat, indexed once for the same reason.
  const heatById = new Map((state.artists ?? []).map((a) => [a.id, a.heat ?? 0]))
  // And the cast, for the same reason again: liveCastStanding walks a card's
  // whole cast, and a `.find()` per member over a late-run roster inside the
  // per-card loop would be O(cards x roster x cast) every single week.
  const formById = new Map((state.characters ?? []).map((c) => [c.id, c]))
  const personById = new Map((state.people ?? []).map((p) => [p.id, p]))

  // A promo belongs to no set, so it has no release week to age from. It still
  // rides the franchise's growing reputation like the rest of the back
  // catalogue; the age term is simply the run so far.
  const legacyMulFor = (card) => legacyMultiplier(reputation, state.week - (card.mintedWeek ?? 0), {})

  const movers = []
  const cards = state.cards.map((orig) => {
    const card = { ...orig, priceHistory: [...orig.priceHistory] }

    // Promo cards belong to no set (they're never pulled). They trade purely as
    // scarce collectibles — a gentle upward drift (supply is tiny and fixed),
    // with occasional speculative pops. They CAN surface as movers.
    if (card.promo) {
      const prev = card.singlePrice
      const spike = rng() < 0.05 ? range(rng, 0.08, 0.3) : 0
      // Promo SUPPLY prices. `promoSupply` (promos.js) is the whole point of a
      // promo — a championship run is a few hundred copies, a league run a few
      // thousand. Anchored on promos.js's own output band (~150 copies at
      // prestige 1, ~5,150 at prestige 0).
      const scarcity = clamp((PROMO_SUPPLY_MAX - (card.promoSupply ?? 2000)) / PROMO_SUPPLY_MAX, 0, 1)
      // A promo has no set behind it, so fairValue's castLift never reaches it —
      // and a promo is exactly the card a cast sells.
      const standing = liveCastStandingIndexed(card, formById, personById)

      // A PROMO HAS A FAIR VALUE, and it converges toward it.
      //
      // This branch used to be a bare compounding drift: a random walk with a
      // positive mean, no gravity and no ceiling, on a price that multiplies
      // itself every week. Over a full run that diverges without limit — a $100
      // promo measured at $2.9M after 312 weeks with no cast at all, and $1.17B
      // with a famous one. Every other card in the game is pulled toward
      // fairValue instead, which is exactly why none of them do this.
      //
      // So promos get the same treatment, from what a promo actually IS: its own
      // pop factors, its supply, the franchise's legacy lift, and who is on it.
      // The cast term rides HERE rather than on the drift, which also makes it
      // bidirectional by construction — a nobody's promo is no longer helped by
      // a term that could only ever add.
      const f = card.popFactors ?? {}
      const collectorBase = ((f.rarity ?? 60) / 100) ** 1.6 * 100 * 0.95
        + (f.artAppeal ?? 60) * 0.35 + (f.hype ?? 60) * 0.2
      const castLift = 1 + clamp(standing / 100, 0, 1) * CAST_HEAT_PREMIUM
      const serialLift = card.serialCap ? clamp(120 / card.serialCap, 1.5, 15) : 1
      // Scarcity is worth more to a promo than to a set card: the run is tiny
      // and fixed, which is the entire proposition.
      const fair = clamp(
        collectorBase * (1 + scarcity * 1.8) * 0.6 * castLift * serialLift * legacyMulFor(card)
          * COLLECTOR_MARKET_TILT,
        1, PROMO_PRICE_CAP,
      )

      // Gravity toward it, plus the same speculative spike the branch always had
      // so a grail can still run. Gentler than stepCard's 0.18 because a promo
      // trades thinly — it takes a while to find its level, it just has to find
      // one.
      const gravity = (fair - prev) * PROMO_GRAVITY
      const noise = range(rng, -0.02, 0.02) * prev
      const next = Math.round(clamp(prev + gravity + noise + prev * spike, 1, PROMO_PRICE_CAP) * 100) / 100
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
    const mover = stepCard(
      card, set, rng, legacyMul,
      completionPremium(groups.get(card.id)),
      card.artistId ? (heatById.get(card.artistId) ?? 0) : 0,
      liveCastStandingIndexed(card, formById, personById),
    )
    card.sealedPrice = sealedPrice(set, ageWeeks)
    // A rough dollar estimate of how much of this week's price is the franchise-
    // reputation "legacy" premium, for the ticker to show as a distinct line.
    card.legacyValue = legacyMul > 1 ? Math.round((legacyMul - 1) * card.singlePrice * 100) / 100 : 0

    // Surface only meaningful moves (>=6%) as ticker movers.
    if (Math.abs(mover.pct) >= 0.06) movers.push(mover)
    return card
  })

  // ---- Illustration-set halo ----------------------------------------------
  // The thing that makes a group FEEL like a group rather than a hidden
  // multiplier: its members move together. Each member's hype is nudged toward
  // the group's mean price move this week, scaled by how coherent the group is.
  //
  // It acts on `hype` and never on price or momentum, and that is load-bearing.
  // stepCard already carries memory (`momentum = momentum*0.5 + delta*0.5`), so
  // coupling N members through a shared PRICE move would feed each member's
  // momentum, which raises next week's mean, which feeds it again — a runaway
  // with nothing bounding it. `hype` decays 14%/week against a hard cap and is
  // the designed bubble channel, so the coupling is bounded by construction.
  //
  // Capped at HALO_MAX (0.1), deliberately below a loud collector persona's bump
  // (0.22 x reach/100) and below a god pack (+0.15): a group is a slow story,
  // not a spike. Writing hype AFTER the step is safe — nothing else reads it
  // this week; stepCard picks it up at the start of the next one.
  if (groups.size) {
    const byId = new Map(cards.map((c) => [c.id, c]))
    const seen = new Set()
    // This week's move, read off the card's own price history rather than off
    // `movers`. movers only holds cards past the 6% reporting threshold, so
    // taking the mean from it would score a member that moved 5% as having not
    // moved at all — and quietly bias every group's mean toward zero.
    const moveOf = (c) => {
      const h = c.priceHistory ?? []
      if (h.length < 2) return 0
      const prev = h[h.length - 2]
      return prev > 0 ? (h[h.length - 1] - prev) / prev : 0
    }
    for (const entry of groups.values()) {
      const group = entry.group
      if (seen.has(group.id) || !group.cohesion) continue
      seen.add(group.id)
      const members = (group.members ?? []).map((m) => byId.get(m.cardId)).filter(Boolean)
      if (members.length < 2) continue
      let sum = 0
      for (const c of members) sum += moveOf(c)
      const mean = sum / members.length
      if (mean === 0) continue
      const pull = clamp(mean, -HALO_MAX, HALO_MAX) * group.cohesion
      for (const c of members) {
        c.hype = clamp((c.hype ?? 0) + pull, 0, 3)
      }
    }
  }

  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  return { cards, movers: movers.slice(0, 8) }
}
