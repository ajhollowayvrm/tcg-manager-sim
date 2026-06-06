// Set creation domain logic: the draft model, cost, card generation, and the
// effects of releasing a set on the world. See docs/BRIEF.md "Set creation flow".

import { makeRng, hashSeed, range } from './rng.js'
import { getArtist } from './content/artists.js'
import { getTheme } from './content/themes.js'
import { clamp } from './simulation.js'
import { printRunUnits } from './revenue.js'
import { shiftToward, balanceScore } from './archetypes.js'

export const RARITIES = ['common', 'uncommon', 'rare', 'mythic']

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

    // 5–10 hand-designed signature cards.
    signatureCards: [], // { id, name, rarity, artistId, mode, power, rulesText }

    // Prerelease: the one real sub-decision.
    prerelease: { enabled: false, chasePullable: false },
  }
}

export function createSignatureCard(n) {
  return {
    id: `sig_${n}`,
    name: `Signature Card ${n}`,
    rarity: 'rare',
    artistId: null,
    mode: 'flavor', // 'flavor' | 'mechanical'
    power: 50, // flavor-mode overall power rating (0–100)
    rulesText: '', // mechanical-mode rules the sim parses (lightly, for now)
  }
}

// ---- Cost ----------------------------------------------------------------

const BASE_DEV_COST = 40_000

// Print cost scales with the run size; bigger runs cost more up front but
// unlock more sealed sales. Artist commissions are summed on top.
export function setCost(draft) {
  const printCost = Math.round(20_000 + (draft.printRun / 100) * 180_000)
  const dev = BASE_DEV_COST
  const art = draft.signatureCards.reduce((sum, c) => {
    const artist = c.artistId ? getArtist(c.artistId) : null
    return sum + (artist ? artist.cost : 0)
  }, 0)
  const prerelease = draft.prerelease.enabled ? 15_000 : 0
  return { dev, printCost, art, prerelease, total: dev + printCost + art + prerelease }
}

// ---- Validation ----------------------------------------------------------

export function validateDraft(draft) {
  const errors = []
  if (!draft.name.trim()) errors.push('Set needs a name.')
  if (draft.signatureCards.length < 5) errors.push('Design at least 5 signature cards.')
  if (draft.signatureCards.length > 10) errors.push('No more than 10 signature cards.')
  if (draft.prerelease.chasePullable && !draft.prerelease.enabled) {
    errors.push('Chase-pullable requires prerelease enabled.')
  }
  return errors
}

// ---- Card generation ------------------------------------------------------

// A signature card's hidden "pop factors" blend playability, rarity, art appeal
// (artist-driven), and theme/hype. The market later resolves price from these.
function popFactors(card, draft, theme, rng) {
  const power = card.mode === 'flavor' ? card.power : estimatePowerFromRules(card.rulesText)
  const artist = card.artistId ? getArtist(card.artistId) : null
  const rarityWeight = { common: 10, uncommon: 30, rare: 65, mythic: 95 }[card.rarity]
  const artAppeal = artist ? artist.reach : 25
  // Theme tags matching the artist's specialty elevate the card.
  const themeMatch = artist && theme.tags.some((t) => artist.specialty.includes(t)) ? 20 : 0

  return {
    playability: clamp(power + range(rng, -10, 10), 0, 100),
    rarity: rarityWeight,
    artAppeal: clamp(artAppeal + themeMatch + range(rng, -8, 8), 0, 100),
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

// Generate the signature cards as real card records for the market. The ~150
// commons/uncommons are summarized on the set rather than spawned individually
// (they don't carry singles value worth tracking) — kept as a count for now.
export function generateCards(draft, setId, week) {
  const theme = getTheme(draft.themeId)
  const rng = makeRng(hashSeed(`${draft.name}:${setId}:${week}`))

  return draft.signatureCards.map((card) => {
    const factors = popFactors(card, draft, theme, rng)
    // Initial single price seeds off rarity + art + hype; the market moves it later.
    const seed = factors.rarity * 0.25 + factors.artAppeal * 0.4 + factors.hype * 0.35
    const scarcity = 1 + (1 - draft.printRun / 100) * 1.5 // under-print → higher prices
    const singlePrice = Math.round(seed * 0.6 * scarcity * 10) / 10

    return {
      id: `${setId}_${card.id}`,
      setId,
      name: card.name,
      rarity: card.rarity,
      artistId: card.artistId,
      popFactors: factors,
      sealedPrice: draft.pricePoint, // launch = MSRP; appreciates via sealedPrice()
      singlePrice,
      priceHistory: [singlePrice],
      // Market state. Launch hype carries the card's hype factor; prerelease
      // with pullable chase front-loads (and later deflates) that buzz.
      hype: (factors.hype / 100) * (draft.prerelease.chasePullable ? 1.3 : 1),
      momentum: 0,
    }
  })
}

// ---- Release effects ------------------------------------------------------

// Applies a released set to the world: deducts cost, generates cards, and
// shifts the metagame (solve resets fresh, power level creeps with the budget).
// Returns { sets, cards, cash, metagame, set } patches for the reducer.
export function releaseSet(state, draft) {
  const setId = `set_${state.sets.length + 1}`
  const cost = setCost(draft)
  const theme = getTheme(draft.themeId)
  const cards = generateCards(draft, setId, state.week)

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
    prerelease: draft.prerelease,
    releasedWeek: state.week,
    commonsCount: 150,
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
