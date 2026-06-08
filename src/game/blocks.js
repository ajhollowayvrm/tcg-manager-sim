// Blocks & set tiers — the major/minor/micro release model and the era-defining
// "block" a major opens. See docs/BRIEF.md and content/gimmicks.js.
//
// THREE TIERS. Every set carries a `tier`:
//   • major — the full expansion. OPENS A BLOCK: introduces a gimmick (Mega /
//     Ascended / Phantasmal / Tera), drives a big solve-reset + meta shift, and
//     anchors the format. Normal collector density.
//   • minor — a smaller in-between set (~40–90 cards) that RIDES a live block:
//     inherits its theme + gimmick, small format impact, chase-leaning (high
//     collector density — the secondary-market drops between the big beats).
//   • micro — a tiny special set (~15–35 cards), also riding a block: near-zero
//     format impact, very high collector density, typically one product.
//
// BLOCKS COEXIST. The first set you ever ship MUST be a major. A new major opens
// a NEW block without retiring the old ones — multiple gimmick warps stay live
// and STACK, so power-creep accumulates and the player must reach for bans /
// pull-from-print (the existing relief levers) to dig out. There is no automatic
// retirement; that's the tension of a stacking gimmick economy.
//
// This module owns the tier table, the block record, the gimmick nature math,
// the persistent meta-warp + decay, and treatment-card minting — sets.js and
// simulation.js go through these helpers so there's one definition of each.

import { clamp } from './simulation.js'
import { makeRng, hashSeed, range } from './rng.js'
import { getGimmick } from './content/gimmicks.js'
import { getTheme } from './content/themes.js'
import { defaultRaritySheet } from './rarities.js'
import { shiftToward, normalize, balanceScore } from './archetypes.js'

// ---- Tiers ----------------------------------------------------------------

// Per-tier scale + effect profile. Multipliers are relative to a major (1.0).
//   devCostFloor   — the base development spend for this tier (minors/micros are
//                    cheaper to make: smaller sets, no new gimmick design).
//   defaultLength  — the set-length the builder seeds for this tier.
//   lengthRange    — [min,max] the builder clamps this tier to.
//   solveResetMul  — how much releasing refreshes the format (minors barely do).
//   shiftMul       — how hard the release tilts the archetype field.
//   discoveryMul   — size of the new-player discovery wave (majors are events).
//   collectorMul   — secondary-market / collector pop on the set's cards. Minors
//                    and micros are chase-dense, so they pop HARDER per card.
//   opensBlock     — only a major opens a block.
//   ridesBlock     — minors/micros must attach to a live block.
//   treatmentBase  — base count of gimmick treatment cards the set mints (scaled
//                    by the block gimmick's treatment weight + nature).
export const TIERS = {
  major: {
    id: 'major', name: 'Major set', symbol: '◆',
    blurb: 'A full expansion that opens a new block — introduces a gimmick, refreshes the format, and draws a big launch wave.',
    devCostFloor: 40_000,
    defaultLength: 120, lengthRange: [90, 250],
    solveResetMul: 1.0, shiftMul: 1.0, discoveryMul: 1.0, collectorMul: 1.0,
    opensBlock: true, ridesBlock: false, treatmentBase: 3,
  },
  minor: {
    id: 'minor', name: 'Minor set', symbol: '◇',
    blurb: 'A smaller in-between set that rides the current block — chase-dense, light on the format, a quick collector drop.',
    devCostFloor: 18_000,
    defaultLength: 60, lengthRange: [40, 90],
    // A rider barely recruits — only a MAJOR is a real growth event (it introduces
    // a new gimmick the wider world hears about). Riders feed the existing base.
    solveResetMul: 0.35, shiftMul: 0.3, discoveryMul: 0.22, collectorMul: 1.4,
    opensBlock: false, ridesBlock: true, treatmentBase: 2,
  },
  micro: {
    id: 'micro', name: 'Micro set', symbol: '·',
    blurb: 'A tiny special set — pure collector bait riding the block. Negligible format impact, the densest chase of all.',
    devCostFloor: 9_000,
    defaultLength: 25, lengthRange: [15, 35],
    solveResetMul: 0.12, shiftMul: 0.1, discoveryMul: 0.1, collectorMul: 1.8,
    opensBlock: false, ridesBlock: true, treatmentBase: 1,
  },
}

export const TIER_IDS = ['major', 'minor', 'micro']
export function getTier(id) {
  return TIERS[id] ?? TIERS.major
}

// ---- Gimmick nature -------------------------------------------------------

// Resolve a block's gimmick into its two live effect intensities, blended by the
// player's NATURE slider (0 = pure competitive / meta-warp, 100 = pure collector
// / treatment). Returns { warp, treatment } 0..~1.5 each.
//
// At nature 0 the warp runs at the gimmick's full warpWeight and the treatment is
// dialed down; at nature 100 it's the reverse. The gimmick's base weights set the
// ceilings so a treatment-first gimmick (Phantasmal) still barely warps even at
// full-competitive nature.
export function gimmickIntensity(gimmick, nature) {
  const g = typeof gimmick === 'string' ? getGimmick(gimmick) : gimmick
  if (!g) return { warp: 0, treatment: 0 }
  const collector = clamp(nature, 0, 100) / 100 // 0..1 toward collector
  const competitive = 1 - collector
  // Each lever scales from a 0.35 floor (it never fully vanishes — a competitive
  // block still mints some chase; a collector block still nudges the meta) up to
  // its full base weight as the slider favors it.
  const warp = g.warpWeight * (0.35 + 0.65 * competitive)
  const treatment = g.treatmentWeight * (0.35 + 0.65 * collector)
  return { warp, treatment }
}

// ---- Block lifecycle ------------------------------------------------------

// Build the block record a major opens. `blockSpec` comes off the draft:
//   { gimmickId, gimmickName, nature, lean }  (lean = archetype the warp targets)
// Returns the block stored in state.blocks. `warp` is the block's CURRENT live
// warp strength (decays weekly in simulation, refreshed when a set prints into
// the block — see refreshBlockWarp / decayBlocks).
export function openBlock(state, setId, themeId, blockSpec) {
  const gimmick = getGimmick(blockSpec.gimmickId) ?? null
  const nature = clamp(blockSpec.nature ?? gimmick?.defaultNature ?? 50, 0, 100)
  const lean = blockSpec.lean ?? gimmick?.defaultLean ?? 'midrange'
  const intensity = gimmickIntensity(gimmick, nature)
  const blockId = `block_${(state.blocks?.length ?? 0) + 1}`
  return {
    id: blockId,
    name: blockSpec.gimmickName?.trim() || gimmick?.name || 'Block',
    gimmickId: gimmick?.id ?? null,
    gimmickName: gimmick?.name ?? 'Gimmick',
    treatmentLabel: gimmick?.treatmentLabel ?? 'Special',
    nature, // 0 competitive .. 100 collector
    lean, // archetype the warp pushes toward
    themeId,
    openedWeek: state.week,
    majorSetId: setId,
    setIds: [setId],
    // Live warp strength: starts at full intensity, decays weekly, refreshes when
    // a set prints into the block. `warpBase` is the ceiling the gimmick can warp
    // to (used to size each refresh + the persistent pull).
    warpBase: intensity.warp,
    warp: intensity.warp,
    treatment: intensity.treatment,
    creep: gimmick?.creep ?? 0.8,
  }
}

// How far toward full warp each tier re-tops a block it prints into. A major
// fully reinforces the gimmick; a minor brings it back to half; a micro barely
// nudges it. (Majors that OPEN a block don't refresh — openBlock seeds it full.)
const WARP_REFRESH = { major: 1, minor: 0.5, micro: 0.18 }

// A set printing into a live block refreshes its warp toward full (the gimmick
// gets reinforced — a rider keeps the era alive against weekly decay) and records
// the set. Only raises the warp, never lowers it. Returns a new block; non-mutating.
export function refreshBlockWarp(block, setId, tier) {
  const target = block.warpBase * (WARP_REFRESH[tier] ?? 0.5)
  const warp = clamp(Math.max(block.warp ?? 0, target), 0, block.warpBase)
  return { ...block, warp, setIds: [...(block.setIds ?? []), setId] }
}

export const BLOCK_WARP_DECAY = 0.04 // warp lost per week (per unit of warpBase)

// Decay every live block's warp one week (called from advanceWeek). A block whose
// warp has decayed to ~0 is effectively dormant (its era has faded) but still
// listed for its set grouping. Returns a new blocks array; non-mutating.
export function decayBlocks(blocks) {
  if (!blocks?.length) return blocks
  return blocks.map((b) => ({
    ...b,
    warp: Math.max(0, (b.warp ?? 0) - (b.warpBase ?? 0) * BLOCK_WARP_DECAY),
  }))
}

// The total persistent pull every live block exerts on the archetype field each
// week, applied in advanceWeek. Each block nudges the field toward its lean by a
// small amount proportional to its live warp — so a high-power competitive block
// keeps the format bent toward its archetype for its whole era, and STACKED
// blocks compound (the coexistence creep). Returns a new distribution.
export const BLOCK_PULL_PER_WEEK = 1.6 // points/wk at full warp, per block
export function applyBlockPull(archetypes, blocks) {
  if (!blocks?.length) return normalize(archetypes)
  let dist = normalize(archetypes)
  for (const b of blocks) {
    const w = b.warp ?? 0
    if (w <= 0.01) continue
    const points = BLOCK_PULL_PER_WEEK * w
    dist = shiftToward(dist, [b.lean], points)
  }
  return dist
}

// ---- Treatment cards ------------------------------------------------------

// Mint the gimmick's special treatment cards for a release (Mega/Ascended/etc.).
// These are scarce, high-appeal chase cards carrying the block's identity — the
// collector engine of the gimmick. Count scales with the tier's treatmentBase and
// the block's treatment intensity. They live in the set's pull pool (unlike
// promos) but seed rich. Returns an array of card records to append to the set.
export function mintTreatmentCards(state, { block, setId, tier, themeId, nature, sheet }) {
  const t = getTier(tier)
  const treatment = block?.treatment ?? gimmickIntensity(getGimmick(block?.gimmickId), nature ?? block?.nature ?? 50).treatment
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
    // Treatment cards are top-tier collectibles: huge art-appeal + hype, with a
    // playability that scales with the block's warp (a competitive gimmick's
    // treatments are also format-relevant; a collector gimmick's are pure chase).
    const artAppeal = clamp(70 + treatment * 18 + range(rng, -8, 8), 0, 100)
    const hype = clamp(65 + treatment * 22 + range(rng, -10, 10), 0, 100)
    const playability = clamp(45 + (block.warp ?? 0) * 30 + range(rng, -12, 12), 0, 100)
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
      popFactors: { playability, rarity: rarityTier, artAppeal, hype },
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

// Derive the archetypeBalance scalar after block pulls settle — convenience
// re-export so callers don't import from two modules.
export { balanceScore }
