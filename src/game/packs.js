// Pack ripping — open your own product. A pack draws a handful of cards from a
// released set, weighted by the set's rarity pull-rates, so you feel the same
// lottery your players do: mostly commons, the occasional chase, and once in a
// while a secret rare. This is the dopamine loop — and it's where you discover a
// sleeper common is suddenly worth a fortune.
//
// Mechanically a pack consumes one unit of the set's printed supply (you're
// cracking your own stock) and returns the pulled card instances (live market
// records, so their current price shows on the reveal).

import { makeRng, hashSeed } from './rng.js'
import { getRarity } from './rarities.js'

const PACK_SIZE = 6 // cards per pack

// Draw one pack from a released set. Returns { pulls, bestPull } where pulls is
// an array of the live card records pulled (with a per-pull seededness so the
// same week/pack is reproducible). Does NOT mutate state — the reducer applies
// supply changes. `nonce` varies the draw so repeated rips differ.
export function ripPack(state, setId, nonce = 0) {
  const set = state.sets.find((s) => s.id === setId)
  if (!set || set.rotated) return null
  const setCards = state.cards.filter((c) => c.setId === setId && !c.banned && !c.rotated)
  if (!setCards.length) return null

  const sheet = set.rarities ?? []
  const rng = makeRng(hashSeed(`pack:${setId}:${state.week}:${nonce}`))

  // Bucket the set's cards by rarity id so we can pull a card OF the drawn rarity.
  const byRarity = new Map()
  for (const c of setCards) {
    if (!byRarity.has(c.rarity)) byRarity.set(c.rarity, [])
    byRarity.get(c.rarity).push(c)
  }

  // Per-slot rarity odds. Most slots are "base" (commons/uncommons); the last
  // slot is the "hit" slot, pulling from the rarer end by pull weight, including
  // secrets at their (tiny) rate.
  const pulls = []
  for (let i = 0; i < PACK_SIZE; i++) {
    const hitSlot = i === PACK_SIZE - 1
    const rarityId = drawRarity(sheet, byRarity, rng, hitSlot)
    const pool = byRarity.get(rarityId)
    if (!pool || !pool.length) continue
    pulls.push(pool[Math.floor(rng() * pool.length) % pool.length])
  }

  // The "best" pull = highest current single price (what you'd brag about).
  const bestPull = pulls.reduce((a, b) => (b.singlePrice > (a?.singlePrice ?? -1) ? b : a), null)
  return { pulls, bestPull }
}

// Draw a rarity id for one slot. Base slots bias hard toward the commonest
// rarities; the hit slot weights by pullWeight across all non-secret rarities and
// gives secrets their long-shot chance.
function drawRarity(sheet, byRarity, rng, hitSlot) {
  const present = sheet.filter((r) => byRarity.has(r.id))
  if (!present.length) return [...byRarity.keys()][0]

  if (!hitSlot) {
    // Base slot: weight = pullWeight, but exclude secrets and damp the rarest.
    const pool = present.filter((r) => !r.secret)
    return weightedPick(pool.length ? pool : present, (r) => Math.max(0, r.pullWeight), rng)
  }
  // Hit slot: full sheet incl. secrets, weighted by pullWeight (so a secret is a
  // rare thrill, a holo/ultra common-ish, etc.).
  return weightedPick(present, (r) => Math.max(0.0001, r.pullWeight) * (r.secret ? 1 : 1), rng)
}

function weightedPick(items, weightOf, rng) {
  const total = items.reduce((s, r) => s + weightOf(r), 0)
  if (total <= 0) return items[0].id
  let x = rng() * total
  for (const r of items) {
    x -= weightOf(r)
    if (x < 0) return r.id
  }
  return items[items.length - 1].id
}

// Rarity display name for a pulled card (resolves against its set's sheet).
export function pulledRarityName(state, card) {
  const set = state.sets.find((s) => s.id === card.setId)
  return getRarity(set?.rarities, card.rarity).name
}
