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

  // A small relief on design-loudness — pulling a hot set eases nostalgia
  // erosion a touch.
  const printIntensity = clamp((state.printIntensity ?? 40) - range(rng, 3, 8), 0, 100)

  // Goodwill: collectors are HAPPY (scarcity boosts their holdings).
  const collectorDelta = Math.round(state.segments.collectors * range(rng, 0.03, 0.07))
  const segments = {
    casual: state.segments.casual,
    collectors: Math.max(0, state.segments.collectors + collectorDelta),
  }
  const playerBase = Math.max(0, segments.casual + segments.collectors)

  const personas = state.personas.map((p) => {
    // Collectors cheer the scarcity; fairness/fun lovers like a fresh catalog.
    const d = p.type === 'collector' ? range(rng, 6, 12) : (p.taste.fairness + p.taste.fun) * 3
    return { ...p, sentiment: clamp(p.sentiment + d, -100, 100) }
  })

  const feed = `${target.name} is pulled from publication. Out of print — its singles spike on scarcity and collectors are thrilled. (A prime candidate to reprint later.)`

  return { sets, cards, printIntensity, segments, playerBase, personas, feed, pulledName: target.name }
}
