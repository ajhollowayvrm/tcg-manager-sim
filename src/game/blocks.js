// Blocks & set tiers — the major/minor/micro release model and the era-defining
// "block" a major opens. See docs/BRIEF.md and content/gimmicks.js.
//
// FOUR TIERS. Every set carries a `tier`:
//   • major — the full expansion. OPENS A BLOCK: introduces a gimmick (Mega /
//     Ascended / Phantasmal / Tera), drives a big buzz reset, and anchors the
//     shelf. Normal collector density.
//   • minor — a smaller in-between set (~40–90 cards) that RIDES a live block:
//     inherits its theme + gimmick, chase-leaning (high collector density —
//     the secondary-market drops between the big beats).
//   • micro — a tiny special set (~15–35 cards), also riding a block: very high
//     collector density, typically one product.
//   • anniversary — a freestanding celebration set: no block, no gimmick, just
//     throwback reprints and nostalgia-themed chase cards. Gated behind an
//     established franchise (see canUnlockAnniversary below) — you have to
//     have a history worth celebrating first.
//
// BLOCKS COEXIST. The first set you ever ship MUST be a major. A new major opens
// a NEW block without retiring the old ones. There is no automatic retirement —
// pulling a set from print (bans.js) is the player's relief lever if a block's
// era has run its course.
//
// This module owns the tier table, the block record, the gimmick intensity math,
// and treatment-card minting — sets.js and simulation.js go through these
// helpers so there's one definition of each.

import { clamp } from './simulation.js'
import { makeRng, hashSeed, range } from './rng.js'
import { getGimmick } from './content/gimmicks.js'
import { getTheme } from './content/themes.js'
import { defaultRaritySheet } from './rarities.js'

// ---- Tiers ----------------------------------------------------------------

// Per-tier scale + effect profile. Multipliers are relative to a major (1.0).
//   devCostFloor   — the base development spend for this tier (minors/micros are
//                    cheaper to make: smaller sets, no new gimmick design).
//   defaultLength  — the set-length the builder seeds for this tier.
//   lengthRange    — [min,max] the builder clamps this tier to.
//   discoveryMul   — size of the new-player discovery wave (majors are events).
//   collectorMul   — secondary-market / collector pop on the set's cards. Minors
//                    and micros are chase-dense, so they pop HARDER per card.
//   opensBlock     — only a major opens a block.
//   ridesBlock     — minors/micros must attach to a live block.
//   treatmentBase  — base count of gimmick treatment cards the set mints (scaled
//                    by the block gimmick's treatment weight + intensity).
export const TIERS = {
  major: {
    id: 'major', name: 'Major set', symbol: '◆',
    blurb: 'A full expansion that opens a new block — introduces a gimmick and draws a big launch wave.',
    devCostFloor: 40_000,
    defaultLength: 120, lengthRange: [90, 250],
    discoveryMul: 1.0, collectorMul: 1.0,
    opensBlock: true, ridesBlock: false, treatmentBase: 3,
  },
  minor: {
    id: 'minor', name: 'Minor set', symbol: '◇',
    blurb: 'A smaller in-between set that rides the current block — chase-dense, a quick collector drop.',
    devCostFloor: 18_000,
    defaultLength: 60, lengthRange: [40, 90],
    // A rider barely recruits — only a MAJOR is a real growth event (it introduces
    // a new gimmick the wider world hears about). Riders feed the existing base.
    discoveryMul: 0.22, collectorMul: 1.4,
    opensBlock: false, ridesBlock: true, treatmentBase: 2,
  },
  micro: {
    id: 'micro', name: 'Micro set', symbol: '·',
    blurb: 'A tiny special set — pure collector bait riding the block. The densest chase of all.',
    devCostFloor: 9_000,
    defaultLength: 25, lengthRange: [15, 35],
    discoveryMul: 0.1, collectorMul: 1.8,
    opensBlock: false, ridesBlock: true, treatmentBase: 1,
  },
  anniversary: {
    id: 'anniversary', name: 'Anniversary set', symbol: '★',
    blurb: 'A freestanding celebration set — throwback reprints, legacy crossovers, anniversary tins. No block, no gimmick; pure legacy-fed collector value.',
    devCostFloor: 25_000,
    defaultLength: 45, lengthRange: [20, 80],
    discoveryMul: 0.5, collectorMul: 2.2, // richest of any tier
    opensBlock: false, ridesBlock: false, // freestanding — no block dependency
    treatmentBase: 2,
  },
}

export const TIER_IDS = ['major', 'minor', 'micro', 'anniversary']
export function getTier(id) {
  return TIERS[id] ?? TIERS.major
}

// ---- Anniversary gate -------------------------------------------------------

// An anniversary set is a reward for an established franchise, not a day-one
// option — mirrors how a real anniversary set needs an actual history to
// celebrate. Gated on BOTH a minimum franchise reputation AND a minimum
// number of sets shipped (reputation alone could theoretically be bought via
// other levers; shipping history can't be).
export const ANNIVERSARY_REPUTATION_GATE = 40
export const ANNIVERSARY_MIN_SETS_SHIPPED = 6

export function canUnlockAnniversary({ franchise, setsShipped } = {}) {
  const reputation = franchise?.reputation ?? 0
  setsShipped = setsShipped ?? 0
  if (reputation < ANNIVERSARY_REPUTATION_GATE) {
    return { ok: false, reason: `Needs ${ANNIVERSARY_REPUTATION_GATE} franchise reputation (currently ${Math.round(reputation)}).` }
  }
  if (setsShipped < ANNIVERSARY_MIN_SETS_SHIPPED) {
    return { ok: false, reason: `Needs ${ANNIVERSARY_MIN_SETS_SHIPPED} sets shipped (currently ${setsShipped}).` }
  }
  return { ok: true, reason: null }
}

// ---- Gimmick intensity -----------------------------------------------------

// Resolve a block's gimmick into its live treatment-density intensity, scaled by
// the player's INTENSITY slider (0 = subtle/understated era, 100 = maximal
// chase). Returns { treatment } — treatment never fully vanishes at 0 (a subtle
// era still mints some chase cards), just leaner.
export function gimmickIntensity(gimmick, intensity) {
  const g = typeof gimmick === 'string' ? getGimmick(gimmick) : gimmick
  if (!g) return { treatment: 0 }
  const t = clamp(intensity, 0, 100) / 100
  const treatment = g.treatmentWeight * (0.35 + 0.65 * t)
  return { treatment }
}

// ---- Block lifecycle ------------------------------------------------------

// Build the block record a major opens. `blockSpec` comes off the draft:
//   { gimmickId, gimmickName, intensity }
// Returns the block stored in state.blocks.
export function openBlock(state, setId, themeId, blockSpec) {
  const gimmick = getGimmick(blockSpec.gimmickId) ?? null
  const intensity = clamp(blockSpec.intensity ?? gimmick?.defaultIntensity ?? 50, 0, 100)
  const derived = gimmickIntensity(gimmick, intensity)
  const blockId = `block_${(state.blocks?.length ?? 0) + 1}`
  return {
    id: blockId,
    name: blockSpec.gimmickName?.trim() || gimmick?.name || 'Block',
    gimmickId: gimmick?.id ?? null,
    gimmickName: gimmick?.name ?? 'Gimmick',
    treatmentLabel: gimmick?.treatmentLabel ?? 'Special',
    intensity, // 0 subtle .. 100 maximal chase
    themeId,
    openedWeek: state.week,
    majorSetId: setId,
    setIds: [setId],
    treatment: derived.treatment,
    // How much this gimmick nudges the collectors' nostalgia-erosion dial when
    // a set prints into it (a splashy gimmick like Mega reads louder than a
    // quiet one like Phantasmal). See sets.js / simulation.js's printIntensity.
    creep: gimmick?.creep ?? 0.8,
  }
}

// A set printing into a live block records it (a rider keeps the era's product
// line going). Returns a new block; non-mutating.
export function refreshBlockWarp(block, setId) {
  return { ...block, setIds: [...(block.setIds ?? []), setId] }
}

// ---- Treatment cards ------------------------------------------------------

// Mint the gimmick's special treatment cards for a release (Mega/Ascended/etc.).
// These are scarce, high-appeal chase cards carrying the block's identity — the
// collector engine of the gimmick. Count scales with the tier's treatmentBase and
// the block's treatment intensity. They live in the set's pull pool (unlike
// promos) but seed rich. Returns an array of card records to append to the set.
export function mintTreatmentCards(state, { block, setId, tier, themeId, intensity, sheet }) {
  const t = getTier(tier)
  const treatment = block?.treatment ?? gimmickIntensity(getGimmick(block?.gimmickId), intensity ?? block?.intensity ?? 50).treatment
  const count = Math.max(0, Math.round(t.treatmentBase * (0.6 + treatment)))
  if (count <= 0 || !block) return []
  const theme = getTheme(themeId) ?? getTheme('dragons')
  const label = block.treatmentLabel ?? 'Special'
  const rng = makeRng(hashSeed(`treatment:${setId}:${block.id}:${state.week}`))
  const NOUNS = ['Ascendant', 'Eidolon', 'Paragon', 'Revenant', 'Sovereign', 'Phantasm', 'Apex', 'Vanguard']

  // Treatment cards carry the set's TOP rarity (its scarcest secret, or the
  // highest value tier) so they slot into the chase pull naturally and resolve a
  // real display name / value tier — while `treatment:true` flags their special
  // market behavior. Falls back to the default sheet's top rarity.
  const sh = (sheet?.length ? sheet : defaultRaritySheet())
  const topRarity = [...sh].sort((a, b) => (b.valueTier ?? 0) - (a.valueTier ?? 0))[0] ?? { id: 'secret', valueTier: 96 }

  const cards = []
  for (let i = 0; i < count; i++) {
    const lead = theme?.mechanics?.length ? theme.mechanics[Math.floor(rng() * theme.mechanics.length)] : label
    const name = `${lead} ${NOUNS[Math.floor(rng() * NOUNS.length)]} (${label})`
    // Treatment cards are top-tier collectibles: huge art-appeal + hype, with
    // punch scaling with the block's intensity (a louder gimmick's treatments
    // feel splashier too).
    const artAppeal = clamp(70 + treatment * 18 + range(rng, -8, 8), 0, 100)
    const hype = clamp(65 + treatment * 22 + range(rng, -10, 10), 0, 100)
    const punch = clamp(45 + (block.treatment ?? 0) * 30 + range(rng, -12, 12), 0, 100)
    // Collector tier: the set's top rarity, floored high (treatments are grails).
    const rarityTier = clamp(Math.max(82, topRarity.valueTier ?? 82) + treatment * 8, 0, 100)
    const seed = (rarityTier * 0.35 + artAppeal * 0.4 + hype * 0.25) * (1 + treatment * 0.6)
    const singlePrice = Math.round(Math.max(4, seed) * 100) / 100
    cards.push({
      id: `${setId}_tr${i + 1}`,
      setId,
      name,
      rarity: topRarity.id, // a real sheet rarity → slots into the chase pull
      number: `${label} ${i + 1}`,
      secret: false,
      signature: false,
      treatment: true, // THE flag: a block-gimmick chase card
      treatmentLabel: label,
      blockId: block.id,
      artistId: null,
      popFactors: { punch, rarity: rarityTier, artAppeal, hype },
      sealedPrice: 0,
      singlePrice,
      priceHistory: [singlePrice],
      hype: hype / 100,
      momentum: 0,
      themeId: theme?.id ?? null,
    })
  }
  return cards
}

// Mint an anniversary set's own nostalgia-themed chase cards — a standalone
// sibling to mintTreatmentCards, NOT block-gated (an anniversary set has no
// block/gimmick to draw intensity from). Flat high art-appeal/hype (no
// block.treatment dependency, since there is none) at the sheet's top rarity
// tier, so on the current 8-tier ladder these mint at Hyper Rare automatically.
const ANNIVERSARY_NOUNS = ['Vintage', 'Legacy', 'Retrospective', 'Commemorative', 'Genesis', 'Timeless']

export function mintAnniversaryCards(state, { setId, themeId, sheet }) {
  const t = getTier('anniversary')
  const count = t.treatmentBase
  const theme = getTheme(themeId) ?? getTheme('dragons')
  const rng = makeRng(hashSeed(`anniversary:${setId}:${state.week}`))

  const sh = (sheet?.length ? sheet : defaultRaritySheet())
  const topRarity = [...sh].sort((a, b) => (b.valueTier ?? 0) - (a.valueTier ?? 0))[0] ?? { id: 'secret', valueTier: 96 }

  const cards = []
  for (let i = 0; i < count; i++) {
    const lead = theme?.mechanics?.length ? theme.mechanics[Math.floor(rng() * theme.mechanics.length)] : 'Anniversary'
    const name = `${lead} ${ANNIVERSARY_NOUNS[Math.floor(rng() * ANNIVERSARY_NOUNS.length)]}`
    const artAppeal = clamp(80 + range(rng, -6, 6), 0, 100)
    const hype = clamp(75 + range(rng, -8, 8), 0, 100)
    const punch = clamp(45 + range(rng, -12, 12), 0, 100)
    const rarityTier = clamp(Math.max(88, topRarity.valueTier ?? 88), 0, 100)
    const seed = rarityTier * 0.35 + artAppeal * 0.4 + hype * 0.25
    const singlePrice = Math.round(Math.max(4, seed) * 100) / 100
    cards.push({
      id: `${setId}_ann${i + 1}`,
      setId,
      name,
      rarity: topRarity.id,
      number: `Anniversary ${i + 1}`,
      secret: false,
      signature: false,
      treatment: true, // reads as a grail on the market same as a block treatment card
      treatmentLabel: 'Anniversary',
      blockId: null,
      artistId: null,
      popFactors: { punch, rarity: rarityTier, artAppeal, hype },
      sealedPrice: 0,
      singlePrice,
      priceHistory: [singlePrice],
      hype: hype / 100,
      momentum: 0,
      themeId: theme?.id ?? null,
    })
  }
  return cards
}
