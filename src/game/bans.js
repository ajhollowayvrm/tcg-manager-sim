// Pulling a set from publication — the player's collector-native relief lever
// for an overheated set (a card drawing serious controversy, or a print run the
// player wants to cash out on scarcity). See docs/BRIEF.md "Bans & rotations":
// manual banning and format rotation are retired; this is the surviving lever.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

// ---- Pull a set from publication ------------------------------------------

// The player stops printing a chosen set. This inverts the set's collector
// economics:
//
//   • Stops print — the set earns no more sealed revenue (the real cost: you're
//     leaving money on the table). Marked set.outOfPrint.
//   • Scarcity pop — its existing singles JUMP (supply is now fixed and shrinking
//     in the wild) and its sealed appreciates faster. Collectors of it are
//     delighted: their cardboard just got rarer and pricier.
//   • Design-loudness relief — pulling a hot, over-designed set from print eases
//     the collectors segment's nostalgia-erosion pressure a little (see
//     `printIntensity` in simulation.js/segments.js).
//
// The player picks ANY set (not just the oldest). At least one set must remain
// in print so the shelf isn't emptied. Returns reducer patches.
export function pullFromPrint(state, setId) {
  const target = state.sets.find((s) => s.id === setId)
  if (!target || target.rotated || target.outOfPrint) return null
  // Keep at least one set in print.
  const stillInPrint = state.sets.filter((s) => !s.rotated && !s.outOfPrint)
  if (stillInPrint.length < 2) return null

  const rng = makeRng(hashSeed(`pull:${setId}:${state.week}`))

  const sets = state.sets.map((s) =>
    s.id === setId ? { ...s, outOfPrint: true, rotated: true, pulledWeek: state.week } : s,
  )

  // The set's cards leave circulation (rotated) but APPRECIATE on scarcity — a
  // one-time pop. The pop is bigger for a beloved/valuable card (collector hype
  // carries it).
  const cards = state.cards.map((c) => {
    if (c.setId !== setId || c.rotated) return c
    const collectorLove = 1 + (c.popFactors?.hype ?? 30) / 100 * 0.5 // 1.0–1.5
    const pop = clamp(1.25 * collectorLove, 1.1, 1.9)
    const next = Math.round(c.singlePrice * pop * 100) / 100
    return {
      ...c,
      rotated: true, // out of circulation (existing filters honor this)
      outOfPrint: true,
      hype: clamp((c.hype ?? 0) + 0.2, 0, 3), // scarcity buzz
      momentum: Math.max(0, c.momentum ?? 0),
      singlePrice: next,
      priceHistory: [...c.priceHistory, next].slice(-26),
    }
  })

  // Erosion relief is no longer handed out here. It used to be a flat random
  // `-range(rng, 3, 8)` gift, which existed only to compensate for a dial that
  // did not work. Pulling a set now relieves nostalgia erosion STRUCTURALLY
  // and permanently: the set's `printLevel` leaves the buzz-weighted shelf mean
  // that simulation.js relaxes `printIntensity` toward (segments.js's
  // shelfPrintLevel). Pull a LOUD set and the relief is large; pull a quiet one
  // and there was nothing to relieve.
  const printIntensity = state.printIntensity

  // How CYNICAL this pull looks. Yanking a set that is still fresh and still
  // widely available locks people out of something they wanted to buy; retiring
  // a sold-out, cold set is just housekeeping and nobody minds.
  const soldThrough = target.supply > 0 ? clamp((target.sold ?? 0) / target.supply, 0, 1) : 1
  const cynicism = clamp((1 - soldThrough) * ((target.buzz ?? 50) / 100), 0, 1)

  // Goodwill: collectors are HAPPY (scarcity boosts their holdings)…
  const collectorDelta = Math.round(state.segments.collectors * range(rng, 0.03, 0.07))
  // …but the people who had not bought it yet are now locked out, and some
  // leave. This lever used to have no downside at all: every persona's delta
  // was non-negative (the non-collector term was `(fairness + fun) * 3`, and
  // both tastes are in [0,1]), every segment only grew, and the singles only
  // appreciated. The brief says pulling a set should cost goodwill.
  const casualLoss = Math.round(state.segments.casual * range(rng, 0.005, 0.02) * cynicism)
  const segments = {
    casual: Math.max(0, state.segments.casual - casualLoss),
    collectors: Math.max(0, state.segments.collectors + collectorDelta),
  }
  const playerBase = Math.max(0, segments.casual + segments.collectors)

  const personas = state.personas.map((p) => {
    // Collectors cheer the scarcity whatever the circumstances…
    const collectorJoy = p.type === 'collector' ? range(rng, 4, 9) : 0
    // …while fairness-minded voices call a cynical pull manufactured scarcity,
    // and the fun-first crowd just wanted to open the packs.
    const fairnessAnger = (p.taste?.fairness ?? 0) * cynicism * -14
    const accessLoss = (p.taste?.fun ?? 0) * cynicism * -6
    return { ...p, sentiment: clamp(p.sentiment + collectorJoy + fairnessAnger + accessLoss, -100, 100) }
  })

  const feed = cynicism > 0.4
    ? `${target.name} is pulled from publication while it was still selling. Collectors are thrilled; everyone who hadn't bought one yet is not.`
    : `${target.name} is pulled from publication. Out of print — its singles spike on scarcity and collectors are thrilled. (A prime candidate to reprint later.)`

  return { sets, cards, printIntensity, segments, playerBase, personas, feed, pulledName: target.name }
}
