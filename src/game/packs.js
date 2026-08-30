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
import { getRarity, packSize, slotWeightOf } from './rarities.js'

const LEGACY_PACK_SIZE = 6 // cards per pack for sets saved before authored formats

// A god pack: the real-hobby legend where every slot in the pack hits high
// rarity (real odds run roughly 1-in-several-thousand). Deliberately rare —
// this is a story players tell, not a routine outcome.
const GOD_PACK_CHANCE = 1 / 2500

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
  // Promos never appear in a booster — that's what makes them promos. A fully-
  // issued serialized card (see sets.js) is equally unpullable — it's gone.
  const setCards = state.cards.filter((c) =>
    c.setId === setId && !c.banned && !c.rotated && !c.promo &&
    !(c.serialCap && c.serialIssued >= c.serialCap),
  )
  if (!setCards.length) return null

  const sheet = set.rarities ?? []
  const rng = makeRng(hashSeed(`pack:${setId}:${state.week}:${nonce}`))

  // Bucket the set's cards by rarity id so we can pull a card OF the drawn rarity.
  const byRarity = new Map()
  for (const c of setCards) {
    if (!byRarity.has(c.rarity)) byRarity.set(c.rarity, [])
    byRarity.get(c.rarity).push(c)
  }

  // Tracks how many of each serialized card THIS rip has already issued, so
  // pulling the same one twice in one pack numbers them sequentially instead
  // of colliding (seeded from the card's live serialIssued count).
  const issuedThisRip = new Map()

  // God pack: a vanishingly rare roll where every position in the pack hits —
  // the real-hobby "every card in the box is a hit" legend. `set.godPack`
  // (authored in the set builder — see sets.js's createDraft) says whether
  // this set can roll one at all, and which rarities it draws from when it
  // does; a set from before the feature existed defaults to the original
  // fixed behavior (always on, auto top rarity tier).
  const godPack = set.godPack ?? { enabled: true, rarityIds: [] }
  if (godPack.enabled && rng() < GOD_PACK_CHANCE) {
    const godPulls = drawGodPack(setCards, sheet, packSize(set.packFormat) || LEGACY_PACK_SIZE, issuedThisRip, rng, godPack.rarityIds)
    const bestPull = godPulls.reduce((a, b) => (b.singlePrice > (a?.singlePrice ?? -1) ? b : a), null)
    return { pulls: godPulls, bestPull, isGodPack: true }
  }

  const slots = resolveSlots(set, sheet)

  const pulls = []
  for (const slot of slots) {
    const count = Math.max(0, Math.round(slot.count || 0))
    for (let i = 0; i < count; i++) {
      const rarityId = drawSlotRarity(slot, sheet, byRarity, rng)
      let pool = byRarity.get(rarityId)
      if (!pool || !pool.length) continue
      // An icon-only slot is reserved for cards featuring an icon-status
      // character (see characters.js) — the alt-art/foil chase slot. Falls
      // back to the normal pool if the set has no icon card at this rarity yet,
      // so the slot never fails to pull.
      if (slot.iconOnly) {
        const iconPool = pool.filter((c) => c.treatment === 'icon')
        if (iconPool.length) pool = iconPool
      }
      // A serialized card fully issued EARLIER IN THIS SAME RIP (e.g. a /1
      // already pulled by an earlier slot) is excluded too, not just ones
      // exhausted before the rip started.
      const eligible = pool.filter((c) => {
        if (!c.serialCap) return true
        const issuedSoFar = c.serialIssued + (issuedThisRip.get(c.id) ?? 0)
        return issuedSoFar < c.serialCap
      })
      const drawPool = eligible.length ? eligible : pool
      const card = drawPool[Math.floor(rng() * drawPool.length) % drawPool.length]
      if (card.serialCap) {
        const nextNumber = card.serialIssued + (issuedThisRip.get(card.id) ?? 0) + 1
        issuedThisRip.set(card.id, (issuedThisRip.get(card.id) ?? 0) + 1)
        pulls.push({ ...card, _serialPulled: nextNumber })
      } else {
        pulls.push(card)
      }
    }
  }

  // The "best" pull = highest current single price (what you'd brag about).
  const bestPull = pulls.reduce((a, b) => (b.singlePrice > (a?.singlePrice ?? -1) ? b : a), null)
  return { pulls, bestPull }
}

// Fill every position of a god pack. `restrictRarityIds` (from the set's
// authored godPack.rarityIds) draws only from those rarities when given and
// non-empty — a real player-picked combination, not just the top tier.
// Empty (or a restriction that happens to match zero live cards) falls back
// to the original behavior: the set's single highest-value rarity tier (by
// the sheet's valueTier). Still honors serial caps so a god pack can't mint
// more copies of a numbered chase card than its cap allows. `issuedThisRip`
// is shared with the caller so a serialized card pulled here is correctly
// reflected if (implausibly) the god-pack roll ever coexists with other
// draws — it never does today, but keeps the bookkeeping honest.
function drawGodPack(setCards, sheet, count, issuedThisRip, rng, restrictRarityIds = []) {
  let pool = null
  if (restrictRarityIds?.length) {
    const ids = new Set(restrictRarityIds)
    const restricted = setCards.filter((c) => ids.has(c.rarity))
    if (restricted.length) pool = restricted
  }
  if (!pool) {
    const tierOf = new Map(sheet.map((r) => [r.id, r.valueTier ?? 0]))
    const topTier = setCards.reduce((max, c) => Math.max(max, tierOf.get(c.rarity) ?? 0), 0)
    const topPool = setCards.filter((c) => (tierOf.get(c.rarity) ?? 0) >= topTier)
    pool = topPool.length ? topPool : setCards
  }

  const pulls = []
  for (let i = 0; i < count; i++) {
    const eligible = pool.filter((c) => {
      if (!c.serialCap) return true
      const issuedSoFar = c.serialIssued + (issuedThisRip.get(c.id) ?? 0)
      return issuedSoFar < c.serialCap
    })
    const drawPool = eligible.length ? eligible : pool
    const card = drawPool[Math.floor(rng() * drawPool.length) % drawPool.length]
    if (card.serialCap) {
      const nextNumber = card.serialIssued + (issuedThisRip.get(card.id) ?? 0) + 1
      issuedThisRip.set(card.id, (issuedThisRip.get(card.id) ?? 0) + 1)
      pulls.push({ ...card, _serialPulled: nextNumber })
    } else {
      pulls.push(card)
    }
  }
  return pulls
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
// pool; only rarities actually present in the set's cards are eligible. Weight
// comes from slotWeightOf (rarities.js) — shared with the odds-panel math so a
// published "these are the odds" claim can never drift from the real draw.
// Falls back to the commonest present rarity.
function drawSlotRarity(slot, sheet, byRarity, rng) {
  const ids = new Set(slot.rarityIds ?? [])
  let pool = sheet.filter((r) => ids.has(r.id) && byRarity.has(r.id))
  // If nothing in the slot's list is present, fall back to any present rarity so
  // a renamed/removed rarity never yields an empty pull.
  if (!pool.length) pool = sheet.filter((r) => byRarity.has(r.id))
  if (!pool.length) return [...byRarity.keys()][0]

  return weightedPick(pool, (r) => slotWeightOf(r, slot.escalate), rng)
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
