// Rarity system. A set carries its own editable rarity "sheet" — the player can
// rename/add/remove rarities and pick which a set includes, so one set can have a
// "Mega Hyper Rare" another doesn't. Each rarity drives two things:
//
//   pullWeight — relative frequency in a pack (higher = MORE common). A common
//                has a huge weight; a secret rare a tiny one.
//   valueTier  — collector desirability 0–100. This is the COLLECTOR side of a
//                card's value (independent of playability) — a high-tier rarity
//                makes a card worth money even if it's competitively useless.
//   secret     — a "secret rare" sits ABOVE the numbered set count (e.g. 151/150)
//                and is the scarcest chase.
//
// Cards reference their rarity by id; helpers resolve the id against the set's
// sheet (falling back to the default sheet for safety).

let _uid = 0
function rid(base) {
  _uid += 1
  return `${base}_${_uid}`
}

// The default sheet a new set starts from. The player edits a copy of this.
export function defaultRaritySheet() {
  return [
    { id: 'common', name: 'Common', pullWeight: 100, valueTier: 8, secret: false },
    { id: 'uncommon', name: 'Uncommon', pullWeight: 45, valueTier: 22, secret: false },
    { id: 'rare', name: 'Rare', pullWeight: 18, valueTier: 45, secret: false },
    { id: 'holo', name: 'Holo Rare', pullWeight: 8, valueTier: 62, secret: false },
    { id: 'ultra', name: 'Ultra Rare', pullWeight: 3, valueTier: 80, secret: false },
    { id: 'secret', name: 'Secret Rare', pullWeight: 0.6, valueTier: 96, secret: true },
  ]
}

// A blank custom rarity for the editor's "add rarity" button.
export function makeRarity(name = 'New Rarity') {
  return { id: rid('rar'), name, pullWeight: 10, valueTier: 50, secret: false }
}

// Resolve a rarity id against a sheet; fall back to a neutral mid rarity so a
// missing/renamed id never crashes pricing or display.
export function getRarity(sheet, id) {
  return (sheet ?? []).find((r) => r.id === id) ?? { id, name: id, pullWeight: 10, valueTier: 40, secret: false }
}

// Pick a rarity id from a sheet weighted by pullWeight (a pack pull, or assigning
// a generated card its rarity). `rng` is a seeded 0–1 function.
export function pickRarity(sheet, rng) {
  const total = sheet.reduce((s, r) => s + Math.max(0, r.pullWeight), 0)
  if (total <= 0) return sheet[0]?.id ?? 'common'
  let x = rng() * total
  for (const r of sheet) {
    x -= Math.max(0, r.pullWeight)
    if (x < 0) return r.id
  }
  return sheet[sheet.length - 1].id
}

// Map a rarity (by id, against a sheet) to one of four VISUAL tiers the UI knows
// how to foil/colour: common / uncommon / rare / mythic. Custom or renamed
// rarities still render sensibly, bucketed by their valueTier (and secrets always
// read as the top 'mythic' tier).
export function visualTier(sheet, id) {
  const r = getRarity(sheet, id)
  if (r.secret || r.valueTier >= 75) return 'mythic'
  if (r.valueTier >= 50) return 'rare'
  if (r.valueTier >= 25) return 'uncommon'
  return 'common'
}

// ---- Booster format (pack structure) -------------------------------------
// A set's rarity SHEET says what rarities exist; its pack FORMAT says how a
// booster is built from them — how many cards, and what each slot can pull. A
// slot is { count, rarityIds:[...], escalate }: `count` cards, each drawn from
// `rarityIds` (weighted by pullWeight), and if `escalate` the draw biases toward
// the rarer end of that list (the classic "this slot is holo→ultra→secret").
//
// rarityIds reference the sheet by id; ids that don't resolve are skipped, and a
// slot with no resolvable rarities falls back to the sheet's commonest — so a
// format authored before a rarity was renamed/removed never breaks a pull.

// Default sheet rarity ids, for building presets that line up with it.
const D = { common: 'common', uncommon: 'uncommon', rare: 'rare', holo: 'holo', ultra: 'ultra', secret: 'secret' }

// Named pack templates the builder offers as a starting point. Each yields a
// fresh format object (slots are cloned so editing one set never mutates another).
export const PACK_PRESETS = [
  {
    id: 'classic', name: 'Classic', blurb: '7 common · 2 uncommon→holo · 1 hit',
    build: () => ({
      preset: 'classic',
      slots: [
        { count: 7, rarityIds: [D.common], escalate: false },
        { count: 2, rarityIds: [D.uncommon, D.holo], escalate: false },
        { count: 1, rarityIds: [D.rare, D.holo, D.ultra, D.secret], escalate: true },
      ],
    }),
  },
  {
    id: 'premium', name: 'Premium', blurb: '5 common · 3 uncommon→holo · 2 hits',
    build: () => ({
      preset: 'premium',
      slots: [
        { count: 5, rarityIds: [D.common], escalate: false },
        { count: 3, rarityIds: [D.uncommon, D.holo], escalate: false },
        { count: 2, rarityIds: [D.holo, D.ultra, D.secret], escalate: true },
      ],
    }),
  },
  {
    id: 'jumbo', name: 'Jumbo', blurb: '10 common · 4 uncommon · 1 guaranteed holo+',
    build: () => ({
      preset: 'jumbo',
      slots: [
        { count: 10, rarityIds: [D.common], escalate: false },
        { count: 4, rarityIds: [D.uncommon], escalate: false },
        { count: 1, rarityIds: [D.holo, D.ultra, D.secret], escalate: true },
      ],
    }),
  },
]

// The format a new draft starts with (Classic). Always returns a fresh object.
export function defaultPackFormat() {
  return PACK_PRESETS[0].build()
}

// Look up a preset by id and instantiate it (null if unknown).
export function buildPreset(id) {
  return PACK_PRESETS.find((p) => p.id === id)?.build() ?? null
}

// A blank slot for the editor's "add slot" button.
export function makePackSlot() {
  return { count: 1, rarityIds: [], escalate: false }
}

// Total cards in a pack = sum of slot counts. Safe on a missing/empty format.
export function packSize(format) {
  if (!format?.slots?.length) return 0
  return format.slots.reduce((n, s) => n + Math.max(0, Math.round(s.count || 0)), 0)
}

// A 0..~1+ "richness" score for a pack format: how loaded it is with hits. Used
// for the light economy tie-in — richer boosters cost a touch more to print and
// generate a touch more buzz. Driven by hit-slot card count relative to size, so
// "2 hits in a 10-card pack" reads richer than "1 hit in 14". Returns ~0 for an
// all-common pack, ~0.5+ for a hit-heavy one.
// Rarity ids that read as a genuine "hit" (chase) when a slot can reach them.
// We don't have the sheet here, so this is a name-based heuristic on the default
// ids; custom rarities just won't be counted as hits (a safe under-count).
const HIT_RARITY_IDS = new Set(['holo', 'ultra', 'secret'])

export function packRichness(format) {
  const size = packSize(format)
  if (!size) return 0
  // A slot is a "hit" only if it escalates (chase-slot) OR can reach a holo+
  // rarity. A plain common or uncommon slot is NOT a hit — so the Classic preset
  // (one escalating hit slot) scores low and stays near-free, while a hit-heavy
  // pack (multiple escalating/holo slots) scores high and costs more.
  let hitCards = 0
  for (const s of format.slots) {
    const c = Math.max(0, Math.round(s.count || 0))
    const reachesHit = (s.rarityIds ?? []).some((id) => HIT_RARITY_IDS.has(id))
    if (s.escalate || reachesHit) hitCards += c
  }
  return clampUnit(hitCards / size)
}

// Richness of the Classic preset — the historical baseline every set implicitly
// used before booster formats existed. Cost/buzz tie-ins measure RELATIVE to
// this, so the default pack is economically neutral and only a richer-than-
// Classic (or leaner) booster moves the numbers. Computed once.
export const BASELINE_PACK_RICHNESS = packRichness(PACK_PRESETS[0].build())

// Pack richness relative to the Classic baseline, in roughly [-0.3, +0.8]. This
// is what the economy reads: 0 = a Classic-equivalent pack, positive = richer
// (costs more, buzzes more), negative = leaner (cheaper, less buzz).
export function packRichnessDelta(format) {
  return packRichness(format) - BASELINE_PACK_RICHNESS
}

function clampUnit(x) {
  return Math.min(1.2, Math.max(0, x))
}

// Validate a pack format for the builder. A pack needs at least one card and
// every slot needs at least one rarity to pull from.
export function validatePackFormat(format) {
  const errors = []
  if (!format?.slots?.length) { errors.push('A booster needs at least one slot.'); return errors }
  if (packSize(format) < 1) errors.push('A booster needs at least one card.')
  if (packSize(format) > 30) errors.push('A booster can hold at most 30 cards.')
  if (format.slots.some((s) => !s.rarityIds || s.rarityIds.length === 0)) {
    errors.push('Every booster slot needs at least one rarity to pull from.')
  }
  return errors
}

// Validate a sheet for the set builder.
export function validateRaritySheet(sheet) {
  const errors = []
  if (!sheet || sheet.length === 0) { errors.push('A set needs at least one rarity.'); return errors }
  if (sheet.some((r) => !r.name.trim())) errors.push('Every rarity needs a name.')
  if (sheet.every((r) => r.secret)) errors.push('A set needs at least one non-secret rarity.')
  if (!sheet.some((r) => Math.max(0, r.pullWeight) > 0 && !r.secret)) {
    errors.push('At least one non-secret rarity must be pullable (pull weight > 0).')
  }
  return errors
}
