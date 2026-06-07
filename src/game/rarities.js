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
