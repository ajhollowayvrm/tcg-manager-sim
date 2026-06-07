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

const LEGACY_PACK_SIZE = 6 // cards per pack for sets saved before authored formats

// Draw one pack from a released set. Returns { pulls, bestPull } where pulls is
// an array of the live card records pulled (with a per-pull seededness so the
// same week/pack is reproducible). Does NOT mutate state — the reducer applies
// supply changes. `nonce` varies the draw so repeated rips differ.
//
// The set's authored pack FORMAT (slot list) drives the draw: each slot pulls
// `count` cards from its allowed rarities, escalate slots biasing toward the
// rarer end. Sets released before booster formats existed (no packFormat) fall
// back to the old fixed-6 / single-hit-slot behavior so old saves still rip.
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

  const slots = resolveSlots(set, sheet)

  const pulls = []
  for (const slot of slots) {
    const count = Math.max(0, Math.round(slot.count || 0))
    for (let i = 0; i < count; i++) {
      const rarityId = drawSlotRarity(slot, sheet, byRarity, rng)
      const pool = byRarity.get(rarityId)
      if (!pool || !pool.length) continue
      pulls.push(pool[Math.floor(rng() * pool.length) % pool.length])
    }
  }

  // The "best" pull = highest current single price (what you'd brag about).
  const bestPull = pulls.reduce((a, b) => (b.singlePrice > (a?.singlePrice ?? -1) ? b : a), null)
  return { pulls, bestPull }
}

// The slot list to draw from: the set's authored format, or a legacy fallback
// (N base slots + one hit slot) synthesized from the sheet for old sets.
function resolveSlots(set, sheet) {
  if (set.packFormat?.slots?.length) return set.packFormat.slots
  // Legacy: rebuild the old behavior — (size-1) base slots over non-secrets, plus
  // one hit slot over the whole sheet.
  const baseIds = sheet.filter((r) => !r.secret).map((r) => r.id)
  const allIds = sheet.map((r) => r.id)
  return [
    { count: LEGACY_PACK_SIZE - 1, rarityIds: baseIds, escalate: false },
    { count: 1, rarityIds: allIds.length ? allIds : baseIds, escalate: true },
  ]
}

// Draw a rarity id for one authored slot. The slot's `rarityIds` restrict the
// pool; only rarities actually present in the set's cards are eligible. Weight is
// pullWeight; an `escalate` slot squares the rarity bias so it leans to the top
// of its list (the chase-slot feel). Falls back to the commonest present rarity.
function drawSlotRarity(slot, sheet, byRarity, rng) {
  const ids = new Set(slot.rarityIds ?? [])
  let pool = sheet.filter((r) => ids.has(r.id) && byRarity.has(r.id))
  // If nothing in the slot's list is present, fall back to any present rarity so
  // a renamed/removed rarity never yields an empty pull.
  if (!pool.length) pool = sheet.filter((r) => byRarity.has(r.id))
  if (!pool.length) return [...byRarity.keys()][0]

  if (slot.escalate) {
    // Escalate: bias toward the rarer end WITHOUT inverting the order. We compress
    // pullWeight toward equal (sqrt), which flattens the steep common→secret
    // falloff so the rare end shows up far more than in a flat draw — but the
    // natural ordering holds (a holo still beats an ultra beats a secret). The
    // result is a chase slot that mostly lands holo/ultra with a secret thrill.
    return weightedPick(pool, (r) => Math.max(0.0001, r.pullWeight) ** 0.5, rng)
  }
  return weightedPick(pool, (r) => Math.max(0, r.pullWeight), rng)
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
