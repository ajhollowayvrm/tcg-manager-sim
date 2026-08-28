// Set creation domain logic: the draft model, cost, card generation, and the
// effects of releasing a set on the world. See docs/BRIEF.md "Set creation flow".

import { makeRng, hashSeed, range } from './rng.js'
import { getArtist } from './content/artists.js'
import { getTheme } from './content/themes.js'
import { clamp, communitySentiment } from './simulation.js'
import { printRunUnits } from './revenue.js'
import { currentArtist } from './artists.js'
import { defaultRaritySheet, getRarity, pickRarity, validateRaritySheet, defaultPackFormat, validatePackFormat, packRichnessDelta } from './rarities.js'
import { defaultProducts, finalizeProducts, productPrintCost, validateProducts, DEFAULT_CHANNELS } from './products.js'
import { makePromoCard } from './promos.js'
import { getTier, openBlock, refreshBlockWarp, mintTreatmentCards, mintAnniversaryCards, canUnlockAnniversary } from './blocks.js'
import { getGimmick } from './content/gimmicks.js'
import { createCharacter, famePopBonus, getTreatment, recordAppearance } from './characters.js'

export const MIN_SIGNATURE_CARDS = 0 // signature highlights are optional now
export const MAX_SIGNATURE_CARDS = 15
export const MIN_SET_LENGTH = 1
export const MAX_SET_LENGTH = 250
export const MAX_SECRET_CARDS = 12

// A fresh draft the player edits in the set-creation panel.
//
// `tier` is 'major' | 'minor' | 'micro'. A MAJOR opens a block (carries the
// `block` spec the player tunes); a MINOR/MICRO rides a live block (carries
// `attachBlockId`). `liveBlocks` lets the builder seed a sensible attach target
// and inherit theme — defaults keep the bare signature working for tests.
export function createDraft(setNumber, tier = 'major', liveBlocks = []) {
  const t = getTier(tier)
  // A rider inherits its block's theme; a major defaults to dragons.
  const attach = t.ridesBlock ? (liveBlocks[liveBlocks.length - 1] ?? null) : null
  const themeId = attach?.themeId ?? 'dragons'
  return {
    name: `${t.name === 'Major set' ? 'Set' : t.name.replace(' set', '')} ${setNumber}`,
    themeId,

    // Release tier and its block wiring.
    tier,
    // Major: the block this set OPENS. Defaults seed the first gimmick; the
    // builder lets the player pick/tune. Ignored for minors/micros.
    block: {
      gimmickId: 'mega',
      gimmickName: '', // blank → falls back to the gimmick's own name
      intensity: getGimmick('mega')?.defaultIntensity ?? 40, // 0 subtle .. 100 maximal chase
    },
    // Minor/micro: the live block this set ATTACHES to (rides). null for a major.
    attachBlockId: attach?.id ?? null,

    // Slider layer (the bulk of the set).
    powerBudget: 50, // 0–100: strength ceiling
    rarityChase: t.ridesBlock ? 70 : 50, // riders lean chase-heavy by default
    printRun: 50, // 0–100: under-print ↔ over-print
    pricePoint: 4.5, // MSRP of a sealed pack, dollars
    // Where the booster line's supply actually goes — see products.js CHANNELS.
    boosterChannels: { ...DEFAULT_CHANNELS },
    // Major-only: split the discovery wave into a lead-region drop now and a
    // wider "rest of the world" wave a few weeks later (see releaseSet below).
    regionalStagger: false,
    // Cosmetic flavor name for the lead-region printing (e.g. "genre norm"
    // regional re-titling) — only meaningful when regionalStagger is on.
    leadRegionName: '',

    // The full set: `setLength` numbered cards generated across the rarity sheet,
    // plus `secretCount` secret rares numbered ABOVE the count (e.g. 151/150).
    setLength: t.defaultLength,
    secretCount: t.ridesBlock ? 3 : 2, // riders are chase-dense → more secrets
    // Editable per-set rarity sheet (add/remove/rename; pick which a set has).
    rarities: defaultRaritySheet(),
    // Booster structure: how a pack is built from the sheet (slot counts + which
    // rarities each slot pulls). Starts from the Classic preset; editable.
    packFormat: defaultPackFormat(),

    // Product lineup — the SKUs this set ships in. Starts as boosters only
    // (matching the historical single-product economy); the player can add
    // bundles, a collector box (SPC), and tins, each its own price/print run.
    products: defaultProducts(),

    // 0–15 signature cards — designated highlights, hand-designed and/or auto.
    signatureCards: [], // { id, name, rarity, artistId, mode, power, rulesText }

    // Cards reprinted from older sets into this one — fan-service / hype draws.
    // Each: { cardId } referencing a live card; resolved on release.
    reprintedCards: [],

    // Prerelease: the one real sub-decision.
    prerelease: { enabled: false, chasePullable: false },

    // Special release event: an optional marketing flavor on top of a normal
    // release. 'none' | 'midnight' | 'themed'. Mutually exclusive — different
    // presentations of the SAME release, not stackable levers.
    releaseEvent: { type: 'none' },

    // Pack-odds transparency: publish the real pull rates (see rarities.js's
    // computePackOdds) to the community, or keep them obscured. Obscured is
    // the historical default — publishing trades a little hype/mystique for
    // trust (see releaseSet).
    oddsPublished: false,
  }
}

export const MAX_REPRINTED_CARDS = 5 // default cap (major/minor/micro)
// Anniversary sets are reprint-centric — a much higher cap fits the tier's
// whole point (throwback reprints as the centerpiece, not a side flourish).
const MAX_REPRINTED_CARDS_BY_TIER = { anniversary: 12 }
export function maxReprintedCards(tierId) {
  return MAX_REPRINTED_CARDS_BY_TIER[tierId] ?? MAX_REPRINTED_CARDS
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
    // Optional: this card FEATURES a character (see characters.js) instead of
    // being a one-off. `characterId` references an EXISTING roster entry.
    // `newCharacterName`/`newCharacterSpecies` request a BRAND-NEW character —
    // minted (and given a stable id) at release time, when this card becomes its
    // debut appearance. Only one of the two paths is ever active on a card.
    // `treatment` is the printing tier (debut/standard/premium/icon) — it scales
    // both the art commission cost and the fame bonus the card gets.
    characterId: null,
    newCharacterName: '',
    newCharacterSpecies: '',
    treatment: 'debut',
    // Optional: a hard-capped total copy count (10/25/50/99/1) independent of
    // the set's print run — a true serialized chase card. Once this many
    // copies have been pulled from packs, ever, it stops appearing (see
    // packs.js). null = not serialized (the default, unlimited within the
    // normal print-run odds).
    serialCap: null,
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

// Print cost scales with the run size; bigger runs cost more up front but
// unlock more sealed sales. Artist commissions are summed on top.
//
// `artistOf` resolves an artist id to its CURRENT (possibly drifted) record;
// defaults to the static roster so old call sites / tests still work. The live
// game passes a state-aware resolver so a risen star costs what they cost now.
export function setCost(draft, artistOf = getArtist) {
  // A booster richer than the Classic baseline costs more to manufacture; a
  // leaner one costs a touch less. Measured relative to Classic so the default
  // pack is cost-neutral. Light: a hit-heavy pack runs ~+15-20% on the print line.
  const richness = packRichnessDelta(draft.packFormat)
  const printCost = Math.round((20_000 + (draft.printRun / 100) * 180_000) * (1 + richness * 0.25))
  // Development cost floors by tier: a major is a full expansion (designs a new
  // gimmick); minors/micros are cheaper, smaller efforts. Defaults to the major
  // floor so old call sites / tierless drafts are unchanged.
  const dev = getTier(draft.tier ?? 'major').devCostFloor
  const art = draft.signatureCards.reduce((sum, c) => {
    const artist = c.artistId ? artistOf(c.artistId) : null
    if (!artist) return sum
    // Featuring an existing character costs more at a richer treatment tier —
    // that's the price of leaning on the character's accumulated pull.
    const mul = c.characterId ? getTreatment(c.treatment).costMul : 1
    return sum + artist.cost * mul
  }, 0)
  const prerelease = draft.prerelease.enabled ? 15_000 : 0
  // A midnight launch pays for the event itself; a themed drop is a curated
  // presentation angle, not extra staffing — free.
  const releaseEvent = draft.releaseEvent?.type === 'midnight' ? 6_000 : 0
  // Each EXTRA SKU (bundle/spc/tin) costs its own print run. Boosters are already
  // covered by printCost above, so a boosters-only set's total is unchanged.
  const skus = (draft.products ?? []).reduce((sum, p) => sum + productPrintCost(p), 0)
  return { dev, printCost, art, prerelease, releaseEvent, skus, total: dev + printCost + art + prerelease + releaseEvent + skus }
}

// ---- Validation ----------------------------------------------------------

// `ctx` carries the world facts the tier/block rules need: { blocks, isFirstSet }.
// Defaults treat it as the first-ever set with no blocks (so a bare validate of a
// default major draft passes) — the live builder passes the real context.
export function validateDraft(draft, ctx = {}) {
  const blocks = ctx.blocks ?? []
  const isFirstSet = ctx.isFirstSet ?? blocks.length === 0
  const tier = getTier(draft.tier ?? 'major')
  const errors = []
  if (!draft.name.trim()) errors.push('Set needs a name.')

  // Tier / block rules.
  if (isFirstSet && !tier.opensBlock) {
    errors.push('Your first set must be a Major — it opens your first block.')
  }
  if (tier.ridesBlock) {
    // A minor/micro must attach to a live block.
    if (!blocks.length) {
      errors.push(`A ${tier.id} set rides a block — release a Major first.`)
    } else if (draft.attachBlockId && !blocks.some((b) => b.id === draft.attachBlockId)) {
      errors.push('The block this set rides no longer exists — pick another.')
    }
  }
  if (tier.opensBlock && draft.block && !getGimmick(draft.block.gimmickId)) {
    errors.push('Pick a gimmick for this block.')
  }
  if (tier.id === 'anniversary') {
    const gate = canUnlockAnniversary({ franchise: ctx.franchise, setsShipped: ctx.setsShipped })
    if (!gate.ok) errors.push(`Anniversary set locked — ${gate.reason}`)
  }

  // Tier length bounds (tighter than the global set-length cap).
  const len = draft.setLength ?? 0
  const [lo, hi] = tier.lengthRange
  if (len < MIN_SET_LENGTH) errors.push(`Set needs at least ${MIN_SET_LENGTH} card.`)
  if (len > MAX_SET_LENGTH) errors.push(`No more than ${MAX_SET_LENGTH} cards in a set.`)
  if (len < lo) errors.push(`A ${tier.id} set runs at least ${lo} cards.`)
  if (len > hi) errors.push(`A ${tier.id} set runs at most ${hi} cards.`)
  if (draft.signatureCards.length > MAX_SIGNATURE_CARDS) {
    errors.push(`No more than ${MAX_SIGNATURE_CARDS} signature highlights.`)
  }
  errors.push(...validateRaritySheet(draft.rarities))
  errors.push(...validatePackFormat(draft.packFormat))
  errors.push(...validateProducts(draft.products))
  if (draft.prerelease.chasePullable && !draft.prerelease.enabled) {
    errors.push('Chase-pullable requires prerelease enabled.')
  }
  return errors
}

// ---- Card generation ------------------------------------------------------

// A card's hidden "pop factors" — the inputs the market prices from. Rarity's
// collector weight comes from the set's sheet (valueTier). `power` is the card's
// punch seed (signatures carry an explicit one; bulk cards get a low/random
// one so the occasional sleeper can still pop).
function popFactors(card, draft, theme, sheet, rng, artistOf = getArtist, characters = []) {
  const power = card.mode === 'flavor' ? card.power : estimatePowerFromRules(card.rulesText)
  const artist = card.artistId ? artistOf(card.artistId) : null
  const rarityTier = getRarity(sheet, card.rarity).valueTier
  const baseArt = artist ? artist.reach : 25
  // Theme tags matching the artist's specialty elevate the card.
  const themeMatch = artist && theme.tags.some((t) => artist.specialty.includes(t)) ? 20 : 0
  const artAppeal = clamp(baseArt + themeMatch + range(rng, -8, 8), 0, 100)
  const hype = clamp((power + artAppeal) / 2 + range(rng, -12, 12), 0, 100)

  // Featuring an existing character bolts on a baseline draw from its
  // accumulated fame — "a new Pikachu card gets built-in demand no matter how
  // it's designed" — scaled up by a richer treatment tier.
  const character = card.characterId ? characters.find((c) => c.id === card.characterId) : null
  const fameBonus = character ? famePopBonus(character.fame, card.treatment) : 0

  return {
    punch: clamp(power + range(rng, -10, 10), 0, 100),
    rarity: rarityTier, // 0–100 collector value tier from the set's sheet
    artAppeal: clamp(artAppeal + fameBonus, 0, 100),
    hype: clamp(hype + fameBonus, 0, 100),
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
function buildCard(spec, draft, theme, sheet, rng, artistOf, characters = []) {
  const factors = popFactors(spec, draft, theme, sheet, rng, artistOf, characters)
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
    characterId: spec.characterId ?? null,
    treatment: spec.treatment ?? null,
    serialCap: spec.serialCap ?? null,
    serialIssued: 0,
    graded: false,
    gradedPopulation: 0,
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
export function generateCards(draft, setId, week, artistOf = getArtist, characters = []) {
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
      characterId: sig.characterId ?? null, treatment: sig.treatment ?? 'debut',
      serialCap: sig.serialCap ?? null,
      signature: true,
    })
  })

  // 2) Fill the rest of the numbered set with themed-random cards, rarity by the
  //    set's pull weights. Bulk cards get a modest random punch so a
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

  return specs.map((spec) => buildCard(spec, draft, theme, sheet, rng, artistOf, characters))
}

// ---- Release effects ------------------------------------------------------

// How many rider sets (minor/micro) have shipped since the last major — drives
// rider fatigue (each consecutive rider recruits less; a new major resets it).
// Walks the set list backward, counting riders until it hits a major.
function countRidersSinceLastMajor(sets) {
  let n = 0
  for (let i = sets.length - 1; i >= 0; i--) {
    const t = sets[i].tier ?? 'major'
    if (t === 'major') break
    n++
  }
  return n
}

// Applies a released set to the world: deducts cost, generates cards, seeds the
// set's own buzz, and nudges the collectors' nostalgia-erosion dial by the
// release's power budget. Returns { sets, cards, cash, printIntensity, set }
// patches for the reducer.
export function releaseSet(state, draft) {
  const setId = `set_${state.sets.length + 1}`
  // Resolve artists to their CURRENT drifted cost/reach so a risen star costs
  // (and elevates a card) what they're worth now, not their seed value.
  const artistOf = (id) => currentArtist(state, id)
  const tier = getTier(draft.tier ?? 'major')
  const cost = setCost(draft, artistOf)

  // Block resolution. A MAJOR opens a fresh block (with the player's gimmick spec);
  // a MINOR/MICRO rides a live block and INHERITS its theme. Blocks coexist — a new
  // major never retires the old ones (their warps stack). `block` is the block this
  // set belongs to (new or attached); `blocksPatch` is the full state.blocks array
  // after opening/refreshing.
  const blocks = state.blocks ?? []
  let block = null
  let blocksPatch = blocks
  if (tier.opensBlock) {
    block = openBlock(state, setId, draft.themeId, draft.block ?? {})
    blocksPatch = [...blocks, block]
  } else if (tier.ridesBlock) {
    const attached = blocks.find((b) => b.id === draft.attachBlockId) ?? blocks[blocks.length - 1] ?? null
    if (attached) {
      block = refreshBlockWarp(attached, setId)
      blocksPatch = blocks.map((b) => (b.id === block.id ? block : b))
    }
  }
  // A rider inherits the block's theme (the draft is seeded with it, but enforce
  // here so a stale draft can't ship the wrong theme into a block).
  const themeId = (tier.ridesBlock && block?.themeId) ? block.themeId : draft.themeId
  draft = { ...draft, themeId }
  const theme = getTheme(themeId)

  // Characters: mint any BRAND-NEW characters a signature card requested, before
  // generating cards, so the character exists (with a stable id) in time both for
  // its own fame lookup and the debut appearance recorded below.
  let characters = state.characters ?? []
  const resolvedSigs = (draft.signatureCards ?? []).map((sig) => {
    if (sig.characterId || !sig.newCharacterName?.trim()) return sig
    const created = createCharacter(sig.newCharacterName, sig.newCharacterSpecies)
    characters = [...characters, created]
    return { ...sig, characterId: created.id, treatment: 'debut' }
  })
  draft = { ...draft, signatureCards: resolvedSigs }

  const cards = generateCards(draft, setId, state.week, artistOf, characters)

  // Every signature card that features a character (new or existing) records a
  // new appearance — bumps fame, files the debut set on a first printing. Feeds
  // the set builder's next view of fame and, at high fame, the icon treatment slot.
  for (const card of cards) {
    if (!card.characterId) continue
    characters = recordAppearance(characters, card.characterId, {
      cardId: card.id, setId, treatment: card.treatment, popFactors: card.popFactors,
    })
  }

  const set = {
    id: setId,
    name: draft.name,
    tier: tier.id,
    blockId: block?.id ?? null,
    themeId,
    theme: theme.name,
    powerBudget: draft.powerBudget,
    rarityChase: draft.rarityChase,
    printRun: draft.printRun,
    price: draft.pricePoint,
    signatureCards: draft.signatureCards,
    rarities: draft.rarities, // the set's rarity sheet (for pricing/packs/display)
    packFormat: draft.packFormat, // booster structure (slots) for ripping/display
    setLength: draft.setLength,
    secretCount: draft.secretCount,
    prerelease: draft.prerelease,
    releasedWeek: state.week,
    // Sealed economy. `products` is the full SKU lineup (booster line first, then
    // any extras), each with its own supply/sold. The top-level supply/sold/price
    // mirror the BOOSTER line so existing reads (market scarcity, distributors,
    // events, the sets panel) keep working unchanged.
    products: finalizeProducts(draft),
    supply: printRunUnits(draft.printRun),
    sold: 0,
    // Pack-odds transparency: whether this set's real pull rates (see
    // rarities.js's computePackOdds) are published to the community.
    oddsPublished: !!draft.oddsPublished,
    oddsPublishedWeek: draft.oddsPublished ? state.week : null,
  }

  // Design loudness: a stronger power budget nudges the collectors' nostalgia-
  // erosion dial up a little — louder modern design, missed by the folks who
  // love the old stuff (see printIntensity, read by segments.js). The block
  // gimmick's `creep` scales how loud THIS gimmick reads (Mega louder than
  // Phantasmal). Only pushes up on release; it decays on its own each week.
  const creep = (draft.powerBudget - 50) / 5 // -10..+10
  const blockCreep = block?.creep ?? 1

  // Card reprints: popular cards from older sets re-issued into this one. They're
  // added as fresh instances in the new set (carrying the original's identity and
  // appeal — a fan-service draw that lifts the set's hype) and SOFTEN their old
  // originals (no longer unique to their set).
  const reprintResult = applyCardReprints(
    state, draft, setId, theme, draft.rarities ?? defaultRaritySheet(),
    cards, state.cards, artistOf,
  )

  // Nostalgia-erosion dial: only pushed UP by a high-power-budget release
  // (scaled by the block gimmick's creep weight); it decays on its own weekly
  // and can be relieved by pulling a hot set from print (bans.js).
  const printIntensity = clamp((state.printIntensity ?? 40) + Math.max(0, creep) * blockCreep * 0.5, 0, 100)

  // Set buzz lift from reprinting fan-favorite cards (carried on the set record
  // so revenue/market can read it).
  set.reprintBuzz = reprintResult.buzzLift

  // SPC exclusive promo: if the collector-box SKU carries an exclusive promo,
  // mint an SPC-only promo card (unpullable, scarce) that ships with that box.
  const spc = (draft.products ?? []).find((p) => p.kind === 'spc' && p.exclusivePromo)
  const promoCards = spc
    ? [makePromoCard(state, { label: 'SPC Exclusive', prestige: 0.7, themeId: draft.themeId, nonce: `${setId}_spc` })]
    : []

  // Treatment cards: the block gimmick's signature chase cards (Mega/Ascended/
  // Phantasmal). Every set in a block can print them; count + appeal scale with
  // the block's treatment intensity and the tier (riders are chase-dense). These
  // ARE pullable (they live in the set's pool) — the collector engine of the era.
  const treatmentCards = block
    ? mintTreatmentCards(state, { block, setId, tier: tier.id, themeId, intensity: block.intensity, sheet: draft.rarities ?? defaultRaritySheet() })
    : []

  // Anniversary sets mint their own nostalgia-themed chase cards — no block or
  // gimmick to draw from, so this is a standalone sibling to treatment cards.
  const anniversaryCards = tier.id === 'anniversary'
    ? mintAnniversaryCards(state, { setId, themeId, sheet: draft.rarities ?? defaultRaritySheet() })
    : []

  const feedParts = [
    reprintResult.feed,
    promoCards.length ? `Collector box includes an exclusive promo.` : null,
    anniversaryCards.length ? `${anniversaryCards.length} anniversary chase card${anniversaryCards.length > 1 ? 's' : ''} debut — instant nostalgia for the faithful.` : null,
    treatmentCards.length ? `${treatmentCards.length} ${block.treatmentLabel} chase card${treatmentCards.length > 1 ? 's' : ''} debut — the chase pulls driving extra demand for this set's packs.` : null,
    draft.releaseEvent?.type === 'midnight' ? `A midnight launch draws a line out the door for ${draft.name} — buzz spikes, and scalper chatter with it.` : null,
    draft.releaseEvent?.type === 'themed' ? `A themed drop event gives ${draft.name} a curated spotlight — the shelf feels like an occasion.` : null,
    draft.oddsPublished
      ? `Pull rates published — the community's watching.`
      : `Pull rates kept under wraps for this one.`,
  ].filter(Boolean)

  // Release spike: a new set draws a WAVE of new players discovering the game,
  // sized by the set's chase hype (the marquee cards people hear about). This is
  // the big growth engine on top of the weekly word-of-mouth trickle — and the
  // launch that takes a brand-new studio from a trickle to a real base.
  const avgHype = cards.length
    ? cards.reduce((s, c) => s + (c.popFactors?.hype ?? 40), 0) / cards.length
    : 40
  // Buzz: how fresh/talked-about THIS release currently feels — the per-set
  // release-pressure engine (see simulation.js's weekly decay). Seeded from the
  // set's own average hype; always starts high, decays over the following
  // weeks until the next drop.
  set.buzz = clamp(40 + avgHype * 0.6, 10, 100)

  // Special release event: a midnight launch trades cash + a scalper-heat bump
  // (real lines draw flippers) for a bigger immediate buzz spike; a themed drop
  // is a free, smaller, safe lift — a curated-presentation angle instead of an
  // event-staffing spend. Deterministic (not a backfire roll) — the "risk" for
  // midnight is the compounding scalperHeat it feeds, not a random failure.
  const eventRng = makeRng(hashSeed(`releaseEvent:${setId}:${state.week}`))
  const releaseEventType = draft.releaseEvent?.type ?? 'none'
  let releaseEventScalperBump = 0
  if (releaseEventType === 'midnight') {
    set.buzz = clamp(set.buzz + range(eventRng, 8, 14), 0, 100)
    releaseEventScalperBump = range(eventRng, 2, 5) // a line out the door draws flippers
  } else if (releaseEventType === 'themed') {
    set.buzz = clamp(set.buzz + range(eventRng, 4, 8), 0, 100)
  }

  // A launch wave. Early sets (when you have few players) need to be a real
  // growth engine, so this is sized to take a fledgling studio from a trickle to
  // a viable base over its first few releases. Scales with chase hype — AND with
  // how the community already feels: a game people are souring on draws weak
  // launches (word doesn't spread for a disliked game), so reckless/greedy
  // strategies that tank sentiment can't keep buying their way to growth.
  const mood = communitySentiment(state.personas) ?? 0
  const moodMul = clamp(1 + mood / 35, 0.05, 1.5) // -100 → 0.05×, 0 → 1×, +35 → 1.5×
  // The discovery wave scales with the TIER: a major is a marquee launch event; a
  // minor draws a fraction; a micro barely registers as a growth driver (it's a
  // collector drop, not a tentpole). This is the structural reason a player can't
  // just spam cheap micros to keep the base growing — only majors really recruit.
  //
  // RIDER FATIGUE: a collector drop's audience is finite without a fresh format
  // beat. Each consecutive rider since the last major recruits progressively less
  // (the people who'd discover the game via a side-set already have), so spamming
  // riders hits diminishing returns — a NEW MAJOR re-opens the funnel. This is the
  // teeth behind "minors can't substitute for majors": they reset the pledge, but
  // they can't keep growing the base on their own.
  let fatigue = 1
  if (tier.ridesBlock) {
    const sinceMajor = countRidersSinceLastMajor(state.sets)
    fatigue = clamp(1 / (1 + sinceMajor * 0.6), 0.18, 1) // 1st rider ~1×, 5th ~0.25×
  }
  const fullWave = Math.round((3500 + (avgHype / 100) * 13000) * moodMul * tier.discoveryMul * fatigue)

  // Regional staggered release (majors only): a lead region drops first as a
  // hype/preview engine — a smaller immediate wave — with the wider "rest of
  // the world" wave landing automatically a few weeks later (see
  // simulation.js's pendingWaves check). Riders never stagger — their wave is
  // already too small to split meaningfully.
  const staggering = tier.id === 'major' && draft.regionalStagger
  const LEAD_SHARE = 0.3
  const WAVE_DELAY_WEEKS = 3
  const newPlayers = staggering ? Math.round(fullWave * LEAD_SHARE) : fullWave
  const pendingWave = staggering
    ? {
        setId, setName: draft.name,
        // Purely cosmetic — used only in feed flavor text, never a second card pool.
        leadRegionName: draft.leadRegionName?.trim() || `${draft.name} (Regional)`,
        amount: Math.round(fullWave * (1 - LEAD_SHARE)),
        applyWeek: state.week + WAVE_DELAY_WEEKS,
        adjusted: false,
      }
    : null

  // Treatment cards lift the set's buzz (gorgeous chase product sells packs) — the
  // collector pop the tier multiplier amplifies. Carried on the set so revenue can
  // read it (alongside the reprint buzz).
  set.treatmentBuzz = clamp(treatmentCards.length * 0.04 * (block?.treatment ?? 0) * tier.collectorMul, 0, 0.3)
  set.collectorMul = tier.collectorMul // riders pop harder on the secondary market

  // A major is real news — it gives every other in-print set a small
  // newsworthiness bump (a "the whole catalog is buzzing again" beat). Minors
  // and micros are too small to make sibling headlines.
  const existingSets = tier.id === 'major'
    ? state.sets.map((s) => (s.rotated ? s : { ...s, buzz: clamp((s.buzz ?? 50) + 8, 0, 100) }))
    : state.sets

  // Publishing pull odds trades a little hype/mystique for community trust —
  // obscured sells a touch more mystery. Only touches this release's freshly
  // minted cards' live market hype, not the discovery-wave/buzz sizing above
  // (which already settled off the unhyped popFactors numbers).
  const hypeMul = draft.oddsPublished ? 0.94 : 1.06
  const hypedNewCards = [...cards, ...treatmentCards, ...anniversaryCards].map((c) => ({ ...c, hype: clamp((c.hype ?? 0) * hypeMul, 0, 3) }))
  // Odds transparency also nudges community trust: publishing wins over
  // fairness-minded voices most, with a small ambient goodwill bump for
  // everyone; obscuring carries no bump (its cost is the backlash-event risk
  // instead — see events.js's odds_transparency_backlash).
  const personaSentimentBump = draft.oddsPublished
    ? { fairnessFloor: 0.4, fairnessAmount: 3, ambientAmount: 1 }
    : null

  return {
    set,
    existingSets, // state.sets BEFORE appending this release (siblings may be buzz-bumped)
    // The new set's generated cards PLUS treatment chase, reprint instances, SPC promo.
    cards: [...hypedNewCards, ...reprintResult.reprintCards, ...promoCards],
    cashDelta: -cost.total,
    printIntensity,
    newPlayers, // discovery wave to distribute into segments (reducer + harness)
    pendingWave, // a scheduled "wide release" wave from regional staggering, or null
    blocks: blocksPatch, // state.blocks after opening/refreshing this set's block
    characters, // state.characters after recording this release's appearances
    block, // the block this set opened or rode (for feed text), null if none
    tier: tier.id,
    // Existing cards softened by card-reprints (null if none fired).
    softenedCards: reprintResult.softenedCards,
    releaseFeed: feedParts.length ? feedParts.join(' ') : null,
    personaSentimentBump, // odds-transparency goodwill bump, or null
    scalperHeatDelta: releaseEventScalperBump || null, // only non-null for a midnight launch
  }
}

// Resolve card reprints on a draft: re-issue chosen old cards into the new set.
// Each adds a fresh instance to the new set (carrying the original's name/appeal,
// at a reprint discount since it's now more available) and softens the old
// original's price. Reprinting fan-favorites also lifts the new set's buzz.
// An anniversary-tier reprint may instead request `upgradeRarityId` — it prints
// at a NEW, richer rarity tier and reads as a premium re-release, not a discount.
//
// Returns { reprintCards, softenedCards|null, buzzLift, feed|null }.
//   reprintCards   — new card instances to append to the set's cards
//   softenedCards  — full replacement for the existing-cards array (originals
//                    softened), chained onto `baseCards`; null if nothing reprinted
//   buzzLift       — 0..~0.3 demand/appeal lift for the new set
function applyCardReprints(state, draft, setId, theme, sheet, newCards, baseCards, artistOf) {
  const reqs = (draft.reprintedCards ?? []).filter((r) => r && r.cardId)
  if (!reqs.length) return { reprintCards: [], softenedCards: null, buzzLift: 0, feed: null }

  const byId = new Map(baseCards.map((c) => [c.id, c]))
  const reprintCards = []
  let softened = baseCards
  let didSoften = false
  let buzzLift = 0
  const names = []

  reqs.slice(0, maxReprintedCards(draft.tier)).forEach((req, i) => {
    const orig = byId.get(req.cardId)
    if (!orig || orig.banned) return

    // The reprint instance: same identity/appeal, fresh in this set. A plain
    // reprint prices at a discount (it's more available now); an upgraded one
    // (anniversary tier only) prints at a richer rarity tier and reads as a
    // premium re-release instead.
    const f = orig.popFactors ?? {}
    const upgrade = req.upgradeRarityId ? getRarity(sheet, req.upgradeRarityId) : null
    const rarityId = upgrade?.id ?? orig.rarity
    const factors = upgrade ? { ...f, rarity: upgrade.valueTier } : f
    const price = upgrade
      ? Math.round(Math.max(orig.singlePrice ?? 1, (upgrade.valueTier / 100) ** 1.6 * 100 * 0.9) * 100) / 100
      : Math.round((orig.singlePrice ?? 1) * 0.7 * 100) / 100
    reprintCards.push({
      ...orig,
      id: `${setId}_rp${i + 1}`,
      setId,
      number: `RP${i + 1}`,
      reprintOfCardId: orig.id,
      rarity: rarityId,
      popFactors: factors,
      controversy: 0,
      singlePrice: price,
      priceHistory: [price],
      hype: clamp((f.hype ?? 30) / 100 + (upgrade ? 0.25 : 0.1), 0, 2),
      momentum: 0,
    })

    // The new set gains buzz proportional to how beloved the reprinted card is.
    buzzLift += clamp((f.hype ?? 30) / 100 * 0.12, 0, 0.12)

    // Soften the original (no longer unique to its set).
    softened = softened.map((c) =>
      c.id === orig.id
        ? { ...c, singlePrice: Math.round(c.singlePrice * 0.82 * 100) / 100,
            priceHistory: [...(c.priceHistory ?? []), Math.round(c.singlePrice * 0.82 * 100) / 100].slice(-26) }
        : c,
    )
    didSoften = true
    names.push(orig.name)
  })

  return {
    reprintCards,
    softenedCards: didSoften ? softened : null,
    buzzLift: clamp(buzzLift, 0, 0.3),
    feed: names.length ? `Reprinted fan favorites: ${names.join(', ')} — the nostalgia lifts pack demand for this set.` : null,
  }
}

// ---- Regional stagger: scale the pending wide release ---------------------

// A real decision point during the stagger window: react to how the lead
// region actually performed by investing more marketing into the wide
// release (bigger wave, real cash cost) or pulling back (smaller wave, a
// partial refund). One-shot per wave — `adjusted` disables it after use, so
// it's a single read-the-room call, not a grinding lever.
const WAVE_BOOST_MUL = 1.2
const WAVE_CUTBACK_MUL = 0.8

export function adjustPendingWave(state, setId, direction) {
  const wave = (state.pendingWaves ?? []).find((w) => w.setId === setId)
  if (!wave || wave.adjusted) return null

  const boosting = direction === 'up'
  const cost = boosting ? Math.round(wave.amount * 6) : -Math.round(wave.amount * 2)
  const nextAmount = Math.round(wave.amount * (boosting ? WAVE_BOOST_MUL : WAVE_CUTBACK_MUL))

  const pendingWaves = state.pendingWaves.map((w) =>
    w.setId === setId ? { ...w, amount: nextAmount, adjusted: true } : w,
  )
  const feed = boosting
    ? `You poured extra marketing into ${wave.setName}'s wide release — the wave grows to ${nextAmount.toLocaleString()} players.`
    : `You pulled back marketing on ${wave.setName}'s wide release — the wave shrinks to ${nextAmount.toLocaleString()} players, and you save some cash.`
  return { pendingWaves, cashDelta: -cost, feed }
}

// ---- Set-level reprint (Base → Unlimited) ---------------------------------

// What it costs to reprint a set at `printRun`: just the manufacturing (no dev,
// no art — the cards are already designed and commissioned).
export function reprintCost(printRun) {
  return Math.round(20_000 + (printRun / 100) * 180_000)
}

// Reprint an existing set as a new "Unlimited" printing. The ORIGINAL becomes a
// permanent first-edition premium; the reprint is a fresh, cheaper printing with
// its own supply to sell (a real revenue stream — especially lucrative for an
// out-of-print set whose scarcity you already pumped). Returns reducer patches:
//   { set, cards, firstEditionCards, cashDelta, feed }
//   - set: the new reprint set (push onto state.sets)
//   - cards: the reprint's fresh card instances (cheaper — more supply)
//   - firstEditionCards: the ORIGINAL set's cards, flagged firstEdition with a
//     permanent value premium (full replacement for those ids in state.cards)
// `printRun` 0..100 (defaults to a mid run). The reprint re-enters the format.
// Named distinctly from applyCardReprints below: that one SOFTENS an old
// card's price by re-issuing it into a NEW set; this one RAISES the original's
// price by re-issuing the SAME set as a fresh Unlimited run. Same word,
// opposite economics — worth not confusing at a glance.
export function reprintAsUnlimited(state, originalSetId, printRun = 55) {
  const original = state.sets.find((s) => s.id === originalSetId)
  if (!original) return null
  // Can't reprint a set that's already a reprint of something (one level only),
  // and can't reprint the same original twice (one Unlimited run per set).
  if (original.reprintOf || original.reprinted) return null
  // Reprint only once the FIRST printing has ended — the set is out of print
  // (pulled) or fully sold out. Reprinting a set that's still actively printing
  // would mean two simultaneous runs, and the first-edition premium only makes
  // sense once the original run is done.
  const soldOut = (original.supply ?? 0) > 0 && (original.sold ?? 0) >= (original.supply ?? 0)
  if (!original.outOfPrint && !soldOut) return null

  // A reprint is a real manufacturing spend — but cash can go negative (a loan),
  // so it's allowed even on credit; the debt-interest + ruin floor are the limits.
  const cost = reprintCost(printRun)
  const newSetId = `set_${state.sets.length + 1}`

  // Build the reprint's cards from the original's design (same names/rarities/
  // art), as fresh instances. We reconstruct a draft-like object from the set.
  const draft = {
    name: `${original.name} (Unlimited)`,
    themeId: original.themeId,
    powerBudget: original.powerBudget,
    rarityChase: original.rarityChase,
    printRun,
    pricePoint: original.price,
    setLength: original.setLength,
    secretCount: original.secretCount,
    rarities: original.rarities,
    packFormat: original.packFormat,
    signatureCards: original.signatureCards ?? [],
    prerelease: { enabled: false, chasePullable: false },
  }
  const artistOf = (id) => currentArtist(state, id)
  const reprintCards = generateCards(draft, newSetId, state.week, artistOf, state.characters ?? []).map((c) => ({
    ...c,
    // Reprints carry more supply → priced below the originals from the start.
    singlePrice: Math.round(c.singlePrice * 0.6 * 100) / 100,
    priceHistory: [Math.round(c.singlePrice * 0.6 * 100) / 100],
    reprint: true,
  }))

  const reprintSetRecord = {
    id: newSetId,
    name: draft.name,
    themeId: original.themeId,
    theme: original.theme,
    powerBudget: original.powerBudget,
    rarityChase: original.rarityChase,
    printRun,
    price: original.price,
    signatureCards: original.signatureCards,
    rarities: original.rarities,
    packFormat: original.packFormat,
    setLength: original.setLength,
    secretCount: original.secretCount,
    prerelease: { enabled: false, chasePullable: false },
    releasedWeek: state.week,
    supply: printRunUnits(printRun),
    sold: 0,
    reprintOf: originalSetId, // links back to the first edition
  }

  // The ORIGINAL printing becomes a permanent first-edition premium: flag it and
  // bump its cards' value (1st-ed Charizard effect). They keep their elevated
  // status even as the cheaper reprint floods the market.
  const firstEditionCards = state.cards.map((c) => {
    if (c.setId !== originalSetId) return c
    const next = Math.round(c.singlePrice * 1.15 * 100) / 100 // first-ed premium
    return {
      ...c,
      firstEdition: true,
      singlePrice: next,
      priceHistory: [...(c.priceHistory ?? []), next].slice(-26),
    }
  })

  const feed = `${original.name} reprinted as an Unlimited run (${printRunUnits(printRun).toLocaleString('en-US')} units). Fresh supply to sell — and the original printing is now a first-edition premium.`

  return {
    set: reprintSetRecord,
    cards: reprintCards,
    firstEditionCards,
    cashDelta: -cost,
    feed,
  }
}

