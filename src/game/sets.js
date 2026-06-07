// Set creation domain logic: the draft model, cost, card generation, and the
// effects of releasing a set on the world. See docs/BRIEF.md "Set creation flow".

import { makeRng, hashSeed, range } from './rng.js'
import { getArtist } from './content/artists.js'
import { getTheme } from './content/themes.js'
import { clamp } from './simulation.js'
import { printRunUnits } from './revenue.js'
import { shiftToward, balanceScore } from './archetypes.js'
import { currentArtist } from './artists.js'
import { defaultRaritySheet, getRarity, pickRarity, validateRaritySheet } from './rarities.js'

export const MIN_SIGNATURE_CARDS = 0 // signature highlights are optional now
export const MAX_SIGNATURE_CARDS = 15
export const MIN_SET_LENGTH = 1
export const MAX_SET_LENGTH = 250
export const MAX_SECRET_CARDS = 12

// A fresh draft the player edits in the set-creation panel.
export function createDraft(setNumber) {
  return {
    name: `Set ${setNumber}`,
    themeId: 'dragons',

    // Slider layer (the bulk of the set).
    powerBudget: 50, // 0–100: strength ceiling
    rarityChase: 50, // 0–100: accessible ↔ chase-heavy
    printRun: 50, // 0–100: under-print ↔ over-print
    pricePoint: 4.5, // MSRP of a sealed pack, dollars

    // The full set: `setLength` numbered cards generated across the rarity sheet,
    // plus `secretCount` secret rares numbered ABOVE the count (e.g. 151/150).
    setLength: 60,
    secretCount: 2,
    // Editable per-set rarity sheet (add/remove/rename; pick which a set has).
    rarities: defaultRaritySheet(),

    // 0–15 signature cards — designated highlights, hand-designed and/or auto.
    signatureCards: [], // { id, name, rarity, artistId, mode, power, rulesText }

    // Prerelease: the one real sub-decision.
    prerelease: { enabled: false, chasePullable: false },
  }
}

export function createSignatureCard(n, rarityId = 'rare') {
  return {
    id: `sig_${n}`,
    name: `Signature Card ${n}`,
    rarity: rarityId,
    artistId: null,
    mode: 'flavor', // 'flavor' | 'mechanical'
    power: 50, // flavor-mode overall power rating (0–100)
    rulesText: '', // mechanical-mode rules the sim parses (lightly, for now)
  }
}

// ---- Auto-generated signature cards --------------------------------------
// The player doesn't have to hand-design every signature card — they can fill
// the rest with themed-random cards and tweak any of them afterward.

// Title fragments for procedural card names, blended with the theme's own
// mechanics so a Dragons set yields "Scorch Warden", a Cyber set "Uplink Spec".
const NAME_PREFIX = ['Elder', 'Grand', 'Feral', 'Hollow', 'Radiant', 'Dread', 'Iron', 'Wild', 'Lost', 'First', 'Crimson', 'Gilded']
const NAME_NOUN = ['Warden', 'Herald', 'Sovereign', 'Specter', 'Champion', 'Oracle', 'Reaver', 'Sentinel', 'Avatar', 'Colossus', 'Vanguard', 'Harbinger']

function randomCardName(theme, rng) {
  // Sometimes lead with one of the theme's mechanics for flavor cohesion.
  const lead = theme && rng() < 0.5 ? pickFrom(theme.mechanics, rng) : pickFrom(NAME_PREFIX, rng)
  return `${lead} ${pickFrom(NAME_NOUN, rng)}`
}

function pickFrom(pool, rng) {
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

// A themed-random signature card. Picks a rarity from the upper end of the set's
// sheet (signatures are the chase highlights), power scattered around the budget.
export function makeRandomCard(n, theme, powerBudget, rng, sheet = defaultRaritySheet()) {
  const card = createSignatureCard(n)
  card.name = randomCardName(theme, rng)
  // Signatures lean rare: pick from the top half of the sheet by value tier.
  const ranked = [...sheet].sort((a, b) => b.valueTier - a.valueTier)
  const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)))
  card.rarity = top[Math.floor(rng() * top.length) % top.length].id
  card.power = clamp(Math.round(powerBudget + range(rng, -18, 18)), 5, 100)
  return card
}

// Append randomly-generated signature highlights up to `target`, keeping the
// player's hand-made ones. Caps at MAX_SIGNATURE_CARDS.
export function fillRandomCards(existing, target, theme, powerBudget, seedKey, sheet = defaultRaritySheet()) {
  const rng = makeRng(hashSeed(`fill:${seedKey}:${existing.length}:${target}`))
  const out = [...existing]
  const cap = Math.min(target, MAX_SIGNATURE_CARDS)
  let n = nextCardIndex(out)
  while (out.length < cap) out.push(makeRandomCard(n++, theme, powerBudget, rng, sheet))
  return out
}

// Find a fresh card-index that won't collide with existing ids (sig_N).
function nextCardIndex(cards) {
  let max = 0
  for (const c of cards) {
    const m = /sig_(\d+)/.exec(c.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

// ---- Cost ----------------------------------------------------------------

const BASE_DEV_COST = 40_000

// Print cost scales with the run size; bigger runs cost more up front but
// unlock more sealed sales. Artist commissions are summed on top.
//
// `artistOf` resolves an artist id to its CURRENT (possibly drifted) record;
// defaults to the static roster so old call sites / tests still work. The live
// game passes a state-aware resolver so a risen star costs what they cost now.
export function setCost(draft, artistOf = getArtist) {
  const printCost = Math.round(20_000 + (draft.printRun / 100) * 180_000)
  const dev = BASE_DEV_COST
  const art = draft.signatureCards.reduce((sum, c) => {
    const artist = c.artistId ? artistOf(c.artistId) : null
    return sum + (artist ? artist.cost : 0)
  }, 0)
  const prerelease = draft.prerelease.enabled ? 15_000 : 0
  return { dev, printCost, art, prerelease, total: dev + printCost + art + prerelease }
}

// ---- Validation ----------------------------------------------------------

export function validateDraft(draft) {
  const errors = []
  if (!draft.name.trim()) errors.push('Set needs a name.')
  const len = draft.setLength ?? 0
  if (len < MIN_SET_LENGTH) errors.push(`Set needs at least ${MIN_SET_LENGTH} card.`)
  if (len > MAX_SET_LENGTH) errors.push(`No more than ${MAX_SET_LENGTH} cards in a set.`)
  if (draft.signatureCards.length > MAX_SIGNATURE_CARDS) {
    errors.push(`No more than ${MAX_SIGNATURE_CARDS} signature highlights.`)
  }
  errors.push(...validateRaritySheet(draft.rarities))
  if (draft.prerelease.chasePullable && !draft.prerelease.enabled) {
    errors.push('Chase-pullable requires prerelease enabled.')
  }
  return errors
}

// ---- Card generation ------------------------------------------------------

// A card's hidden "pop factors" — the inputs the market prices from. Rarity's
// collector weight comes from the set's sheet (valueTier). `power` is the card's
// playability seed (signatures carry an explicit one; bulk cards get a low/random
// one so the occasional sleeper can still pop).
function popFactors(card, draft, theme, sheet, rng, artistOf = getArtist) {
  const power = card.mode === 'flavor' ? card.power : estimatePowerFromRules(card.rulesText)
  const artist = card.artistId ? artistOf(card.artistId) : null
  const rarityTier = getRarity(sheet, card.rarity).valueTier
  const baseArt = artist ? artist.reach : 25
  // Theme tags matching the artist's specialty elevate the card.
  const themeMatch = artist && theme.tags.some((t) => artist.specialty.includes(t)) ? 20 : 0
  const artAppeal = clamp(baseArt + themeMatch + range(rng, -8, 8), 0, 100)

  return {
    playability: clamp(power + range(rng, -10, 10), 0, 100),
    rarity: rarityTier, // 0–100 collector value tier from the set's sheet
    artAppeal,
    hype: clamp((power + artAppeal) / 2 + range(rng, -12, 12), 0, 100),
  }
}

// Very light "parser": longer/keyword-heavier rules text reads as stronger.
// A real balance pass comes later; this just gives mechanical mode teeth.
function estimatePowerFromRules(text) {
  if (!text) return 40
  const KEYWORDS = ['draw', 'destroy', 'free', 'extra', 'double', 'search', 'discard', 'untap', 'counter', 'haste']
  const lower = text.toLowerCase()
  const hits = KEYWORDS.filter((k) => lower.includes(k)).length
  return clamp(45 + hits * 9 + Math.min(text.length / 20, 15), 0, 100)
}

// Build one market-ready card record from a "spec" (id/name/rarity/number + an
// optional designed signature card behind it).
function buildCard(spec, draft, theme, sheet, rng, artistOf) {
  const factors = popFactors(spec, draft, theme, sheet, rng, artistOf)
  // Initial price seeds off rarity + art + hype; the market moves it from here.
  const seed = factors.rarity * 0.25 + factors.artAppeal * 0.4 + factors.hype * 0.35
  const scarcity = 1 + (1 - draft.printRun / 100) * 1.5
  const singlePrice = Math.max(0.1, Math.round(seed * 0.6 * scarcity * 10) / 10)
  return {
    id: `${draft._setId}_${spec.id}`,
    setId: draft._setId,
    name: spec.name,
    rarity: spec.rarity,
    number: spec.number, // collector number, e.g. "73/60" or secret "61/60"
    secret: spec.secret ?? false,
    signature: spec.signature ?? false,
    artistId: spec.artistId ?? null,
    popFactors: factors,
    sealedPrice: draft.pricePoint,
    singlePrice,
    priceHistory: [singlePrice],
    hype: (factors.hype / 100) * (draft.prerelease.chasePullable ? 1.3 : 1),
    momentum: 0,
  }
}

// Generate the WHOLE set: `setLength` numbered cards distributed across the
// non-secret rarity sheet by pull weight, plus `secretCount` secret rares
// numbered above the count. Signature highlights are slotted in as the top cards
// (keeping their designed name/rarity/art/power); the rest are themed-random, so
// any of them — even a humble common — can later become a market darling.
export function generateCards(draft, setId, week, artistOf = getArtist) {
  const theme = getTheme(draft.themeId)
  const sheet = draft.rarities ?? defaultRaritySheet()
  const rng = makeRng(hashSeed(`${draft.name}:${setId}:${week}`))
  draft = { ...draft, _setId: setId } // buildCard reads _setId

  const length = clamp(Math.round(draft.setLength ?? 60), MIN_SET_LENGTH, MAX_SET_LENGTH)
  const secretCount = clamp(Math.round(draft.secretCount ?? 0), 0, MAX_SECRET_CARDS)
  const sigs = draft.signatureCards ?? []
  const nonSecret = sheet.filter((r) => !r.secret && Math.max(0, r.pullWeight) > 0)
  const secretRarities = sheet.filter((r) => r.secret)

  const specs = []

  // 1) Signature highlights take the first numbers (they're the marquee cards).
  sigs.slice(0, length).forEach((sig, i) => {
    specs.push({
      id: `c${i + 1}`, name: sig.name, rarity: sig.rarity, number: `${i + 1}/${length}`,
      artistId: sig.artistId, mode: sig.mode, power: sig.power, rulesText: sig.rulesText,
      signature: true,
    })
  })

  // 2) Fill the rest of the numbered set with themed-random cards, rarity by the
  //    set's pull weights. Bulk cards get a modest random playability so a
  //    sleeper can still spike, but they're not balanced around the power budget.
  for (let i = specs.length; i < length; i++) {
    const rarityId = nonSecret.length ? pickRarity(nonSecret, rng) : (sheet[0]?.id ?? 'common')
    specs.push({
      id: `c${i + 1}`, name: randomCardName(theme, rng), rarity: rarityId,
      number: `${i + 1}/${length}`, mode: 'flavor',
      power: clamp(Math.round(range(rng, 15, 70)), 0, 100), // bulk: low-to-mid, sleepers possible
    })
  }

  // 3) Secret rares: numbered ABOVE the count, scarcest chase.
  for (let s = 0; s < secretCount; s++) {
    const rarityId = secretRarities.length
      ? secretRarities[s % secretRarities.length].id
      : (nonSecret[nonSecret.length - 1]?.id ?? 'rare')
    const num = length + s + 1
    specs.push({
      id: `s${s + 1}`, name: randomCardName(theme, rng), rarity: rarityId,
      number: `${num}/${length}`, secret: true, mode: 'flavor',
      power: clamp(Math.round(range(rng, 20, 80)), 0, 100),
    })
  }

  return specs.map((spec) => buildCard(spec, draft, theme, sheet, rng, artistOf))
}

// ---- Release effects ------------------------------------------------------

// Applies a released set to the world: deducts cost, generates cards, and
// shifts the metagame (solve resets fresh, power level creeps with the budget).
// Returns { sets, cards, cash, metagame, set } patches for the reducer.
export function releaseSet(state, draft) {
  const setId = `set_${state.sets.length + 1}`
  // Resolve artists to their CURRENT drifted cost/reach so a risen star costs
  // (and elevates a card) what they're worth now, not their seed value.
  const artistOf = (id) => currentArtist(state, id)
  const cost = setCost(draft, artistOf)
  const theme = getTheme(draft.themeId)
  const cards = generateCards(draft, setId, state.week, artistOf)

  const set = {
    id: setId,
    name: draft.name,
    themeId: draft.themeId,
    theme: theme.name,
    powerBudget: draft.powerBudget,
    rarityChase: draft.rarityChase,
    printRun: draft.printRun,
    price: draft.pricePoint,
    signatureCards: draft.signatureCards,
    rarities: draft.rarities, // the set's rarity sheet (for pricing/packs/display)
    setLength: draft.setLength,
    secretCount: draft.secretCount,
    prerelease: draft.prerelease,
    releasedWeek: state.week,
    // Sealed economy: units printed (hard sales ceiling) and units sold to date.
    supply: printRunUnits(draft.printRun),
    sold: 0,
  }

  // Metagame shift. Releasing refreshes the format (solve resets toward fresh);
  // a higher power budget creeps the power level and can compress diversity.
  const creep = (draft.powerBudget - 50) / 5 // -10..+10
  // Prerelease with chase pullable lets the community start solving early.
  const solveReset = draft.prerelease.chasePullable ? 20 : 8

  // The set pushes the field toward its theme's archetype lean, scaled by power
  // budget: a stronger set in an archetype warps the meta toward it harder. This
  // is what lets "spam high-power aggro sets" actually create an aggro-dominated
  // format — and lets a player release a counter-archetype set to correct a tilt.
  const shiftPoints = 8 + Math.max(0, creep) * 1.2 // ~8 at budget 50, ~20 at 100
  const archetypes = shiftToward(state.metagame.archetypes, theme.archetypes, shiftPoints)

  const metagame = {
    // A fresh set reopens the field a little (+3), but a high-power-budget set
    // also crowds out weaker archetypes (the creep term claws some back). Modest
    // so it doesn't ratchet diversity to 100 against the weekly erosion.
    diversity: clamp(state.metagame.diversity - Math.max(0, creep) * 0.6 + 3, 0, 100),
    powerLevel: clamp(state.metagame.powerLevel + Math.max(0, creep), 0, 100),
    archetypes,
    archetypeBalance: balanceScore(archetypes), // derived from the new split
    solveLevel: solveReset,
  }

  return {
    set,
    cards,
    cashDelta: -cost.total,
    metagame,
  }
}
