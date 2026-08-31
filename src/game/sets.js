// Set creation domain logic: the draft model, cost, card generation, and the
// effects of releasing a set on the world. See docs/BRIEF.md "Set creation flow".

import { makeRng, hashSeed, range } from './rng.js'
import { getArtist } from './content/artists.js'
import { getTheme } from './content/themes.js'
import { getConcept, CREATURE_NAME_PREFIX, CREATURE_NAME_NOUN, CHARACTER_FIRST_NAMES, CHARACTER_SURNAMES } from './content/concepts.js'
import { clamp, communitySentiment } from './simulation.js'
import { PRINT_INTENSITY_NEUTRAL } from './config.js'
import { printRunUnits } from './revenue.js'
import { currentArtist } from './artists.js'
import { defaultRaritySheet, getRarity, pickRarity, validateRaritySheet, defaultPackFormat, validatePackFormat, packRichnessDelta, FINISHES, getFinish, combinedFinishEffect, expandRaritySheet, variantEntries, variantScarcityPremium } from './rarities.js'

// Re-exported for existing call sites (SignatureCardEditor.jsx etc.) — the
// finish system now lives in rarities.js since a whole RARITY can carry
// finishes too, not just a hand-designed signature card. See combinedFinishEffect.
export { FINISHES, getFinish }
import { defaultProducts, finalizeProducts, productPrintCost, validateProducts, DEFAULT_CHANNELS } from './products.js'
import { makePromoCard } from './promos.js'
import { getTier, openBlock, refreshBlockWarp, mintTreatmentCards, mintAnniversaryCards, canUnlockAnniversary } from './blocks.js'
import { getGimmick, NO_GIMMICK } from './content/gimmicks.js'
import { createCharacter, famePopBonus, getTreatment, recordAppearance } from './characters.js'
import { archetypeMatchesTheme } from './content/archetypes.js'

export const MIN_SIGNATURE_CARDS = 0 // signature highlights are optional now
// Raised from 15. A major runs up to 250 cards, so a cap of fifteen marquee
// cards meant the player could hand-design at most 6% of a landmark set and the
// rest was procedural filler.
export const MAX_SIGNATURE_CARDS = 30
export const MIN_SET_LENGTH = 1
export const MAX_SET_LENGTH = 250
export const MAX_SECRET_CARDS = 12
export const MAX_SPOTLIGHT_PICKS = 5
export const SPOTLIGHT_COST_EACH = 2_000

// Nostalgia-erosion levelling (see the block in releaseSet and config.js's
// PRINT_INTENSITY_NEUTRAL). A set declares the erosion level it sustains;
// releasing pulls the live dial partway toward it.
const LOUDNESS_NEUTRAL = 50 // the design-loudness slider's balance-neutral point
const LOUDNESS_TO_LEVEL = 0.8 // ±40 erosion points across the full slider
const GIMMICK_LEVEL_WEIGHT = 12 // how much a splashy era raises the resting level
const RELEASE_PULL = 0.45 // how far toward its own level a fresh drop drags the dial

// A collector-box exclusive promo: a short run of an unpullable card, plus its
// own commission. Previously free — see setCost.
const EXCLUSIVE_PROMO_COST = 55_000

// Spacing at which a rider set stops reading as part of a treadmill.
const RIDER_SPACING_WEEKS = 12

// Design loudness, formerly `powerBudget`. Reads either key so a set record
// built before the rename (or a reprint reconstructing a draft from one) still
// resolves mid-session. Saves themselves are handled by the persistence VERSION
// bump, not this — see persistence.js.
export function loudnessOf(x) {
  return x?.designLoudness ?? x?.powerBudget ?? 50
}

// A fresh draft the player edits in the set-creation panel.
//
// `tier` is 'major' | 'minor' | 'micro'. A MAJOR opens a block (carries the
// `block` spec the player tunes); a MINOR/MICRO rides a live block (carries
// `attachBlockId`). `liveBlocks` lets the builder seed a sensible attach target
// and inherit theme — defaults keep the bare signature working for tests.
export function createDraft(setNumber, tier = 'major', liveBlocks = []) {
  const t = getTier(tier)
  // Theme is a per-SET flavor motif, not locked to the block or the company —
  // Pokémon's Base Set era shipped Jungle, Fossil, and Team Rocket back to
  // back, each its own motif riding the same era. So this is only a starting
  // SUGGESTION (the most recent block's theme, or dragons for a fresh
  // company) — the player can always change it; nothing enforces it later.
  const attach = t.ridesBlock ? (liveBlocks[liveBlocks.length - 1] ?? null) : null
  const themeId = attach?.themeId ?? liveBlocks[liveBlocks.length - 1]?.themeId ?? 'dragons'
  return {
    name: `${t.name === 'Major set' ? 'Set' : t.name.replace(' set', '')} ${setNumber}`,
    themeId,

    // Release tier and its block wiring.
    tier,
    // Major: the block this set OPENS. Defaults seed the first gimmick; the
    // builder lets the player pick/tune. Ignored for minors/micros.
    block: {
      // No gimmick by default — a plain themed era is a legitimate (and cheaper)
      // way to open a block. The builder offers the roster as an opt-in.
      gimmickId: null,
      gimmickName: '', // blank → falls back to the gimmick's own name
      // null until a gimmick is picked — intensity is meaningless without one,
      // and leaving it null lets openBlock fall back to whichever gimmick ends
      // up selected DEFAULT intensity rather than a generic midpoint.
      intensity: null, // 0 subtle .. 100 maximal chase
    },
    // Minor/micro: the live block this set ATTACHES to (rides). null for a major.
    attachBlockId: attach?.id ?? null,

    // Slider layer (the bulk of the set).
    // 0–100: how hard this set's cards are pushed to outshine what came before —
    // bigger frames, splashier foils, more presentation. A DESIGN dial, not a
    // balance one: loud sells now, but it ages the back catalogue (see the
    // nostalgia-erosion creep in releaseSet).
    designLoudness: 50,
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

    // The set's FACE: one existing roster character on the box art. Purely a
    // marketing choice — it doesn't add a card, it lends the set that
    // character's accumulated fame. null = no cover character.
    coverCharacterId: null,

    // An art director commissioned across the WHOLE set rather than card by
    // card. Costs double their normal commission, but their specialty match
    // lifts every generated card instead of only the ones they drew.
    artDirectorId: null,

    // Spotlight reveals: cards shown off publicly ahead of launch. Each pick is
    // { kind: 'signature'|'reprint'|'treatment', ref } — resolved to concrete
    // card ids at release. A few reveals build anticipation; revealing
    // everything spoils the rip (see releaseSet's diminishing curve).
    spotlight: { picks: [] },

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

    // God packs: the real-hobby legend where every card in a pack hits (see
    // packs.js's GOD_PACK_CHANCE — still a vanishingly rare roll, this is
    // just what fills one when it happens). `enabled` on by default (matches
    // the sim's original always-on behavior). `rarityIds` picks WHICH
    // rarities a god pack of this set guarantees — empty means "auto: this
    // set's single highest-value rarity," the original fixed behavior;
    // picking several lets a god pack draw from any of them (a real
    // combination, not just the very top tier).
    godPack: { enabled: true, rarityIds: [] },
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
    // 0–100: how much this card stands out on a shelf — the designer's own dial.
    // Lifted by the printing finish and a written flavor line (see cardAppeal).
    appeal: 50,
    finish: 'standard', // printing finish — see FINISHES
    flavorText: '', // the italic line under the art. Cosmetic, small appeal nudge.
    artNotes: '', // art-direction brief for the commission. Cosmetic; may match theme.
    // Optional: this card FEATURES a character (see characters.js) instead of
    // being a one-off. `characterId` references an EXISTING roster entry.
    // The `newCharacter*` fields request a BRAND-NEW character — minted (and
    // given a stable id) at release time, when this card becomes its debut
    // appearance. Only one of the two paths is ever active on a card.
    // `newCharacterArchetype` is the one with mechanical weight: it earns the
    // theme-cohesion bonus in popFactors and biases the character's fame drift
    // for the rest of the run (see content/archetypes.js). The species field is
    // now just an optional epithet.
    // `treatment` is the printing tier (debut/standard/premium/icon) — it scales
    // both the art commission cost and the fame bonus the card gets.
    characterId: null,
    newCharacterName: '',
    newCharacterArchetype: 'unaligned',
    newCharacterSpecies: '',
    newCharacterHook: '',
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
// motifs so a Dragons set yields "Scorch Warden", a Cyber set "Uplink Spec".
// Which pool this draws from is the founding concept's `nameStyle` (see
// content/concepts.js) — 'creature' (the default) or 'character'.
function randomCardName(theme, rng, nameStyle = 'creature') {
  if (nameStyle === 'character') {
    const first = pickFrom(CHARACTER_FIRST_NAMES, rng)
    const last = pickFrom(CHARACTER_SURNAMES, rng)
    // Sometimes fold in a theme motif as a nickname, so the set's flavor still
    // shows even when the naming style itself is character-first.
    if (theme?.motifs?.length && rng() < 0.4) {
      return `${first} "${pickFrom(theme.motifs, rng)}" ${last}`
    }
    return `${first} ${last}`
  }
  // Sometimes lead with one of the theme's motifs for flavor cohesion.
  const lead = theme?.motifs?.length && rng() < 0.5 ? pickFrom(theme.motifs, rng) : pickFrom(CREATURE_NAME_PREFIX, rng)
  return `${lead} ${pickFrom(CREATURE_NAME_NOUN, rng)}`
}

function pickFrom(pool, rng) {
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

// A themed-random signature card. Picks a rarity from the upper end of the set's
// sheet (signatures are the chase highlights), appeal scattered around the set's
// design-loudness dial.
export function makeRandomCard(n, theme, loudness, rng, sheet = defaultRaritySheet(), nameStyle = 'creature') {
  const card = createSignatureCard(n)
  card.name = randomCardName(theme, rng, nameStyle)
  // Signatures lean rare: pick from the top half of the sheet by value tier.
  const ranked = [...sheet].sort((a, b) => b.valueTier - a.valueTier)
  const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)))
  card.rarity = top[Math.floor(rng() * top.length) % top.length].id
  card.appeal = clamp(Math.round(loudness + range(rng, -18, 18)), 5, 100)
  return card
}

// Append randomly-generated signature highlights up to `target`, keeping the
// player's hand-made ones. Caps at MAX_SIGNATURE_CARDS.
export function fillRandomCards(existing, target, theme, loudness, seedKey, sheet = defaultRaritySheet(), nameStyle = 'creature') {
  const rng = makeRng(hashSeed(`fill:${seedKey}:${existing.length}:${target}`))
  const out = [...existing]
  const cap = Math.min(target, MAX_SIGNATURE_CARDS)
  let n = nextCardIndex(out)
  while (out.length < cap) out.push(makeRandomCard(n++, theme, loudness, rng, sheet, nameStyle))
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

// ---- Set size -------------------------------------------------------------

// Where this set sits in its TIER'S OWN size band, normalized to -1 (tightest)
// .. +1 (largest). Everything size-related derives from this one number so the
// tiers stay comparable: a 35-card micro is "big for a micro" exactly the way a
// 250-card major is "big for a major".
//
// The shape we're after: a bigger set is a bigger EVENT (more news, a bigger
// discovery wave, a richer dev budget) — but past roughly two-thirds of the band
// it starts to read as BLOAT: the chase thins out across more cards, the set
// stops being completable, and reviewers say so. A tight set is the inverse:
// a weaker growth event, but dense, completable, and beloved by collectors.
export function sizeProfile(draft) {
  const tier = getTier(draft?.tier ?? 'major')
  const [lo, hi] = tier.lengthRange
  const def = clamp(tier.defaultLength, lo, hi)
  const len = clamp(Math.round(draft?.setLength ?? def), lo, hi)
  // Normalized around the tier's DEFAULT length, not the band midpoint: -1 at
  // the floor, 0 at the default, +1 at the ceiling. The two halves are scaled
  // independently because the bands aren't symmetric (a major defaults to 120
  // in a 90–250 band). This matters — anchoring at the default is what keeps a
  // default-length set exactly balance-neutral against the pre-size-math game.
  const s = len === def
    ? 0
    : len < def
      ? -clamp((def - len) / Math.max(1, def - lo), 0, 1)
      : clamp((len - def) / Math.max(1, hi - def), 0, 1)
  return {
    len,
    s,
    eventScale: 1 + 0.35 * s, // 0.65× .. 1.35× the discovery wave
    sizeBuzz: 10 * s, // is this release news? -10 .. +10
    bloat: clamp((s - 0.35) / 0.65, 0, 1), // 0 until ~68% of the band, then ramps
    chaseDensity: 1 / (1 + 0.5 * Math.max(0, s)), // hits per card opened: 1.0 .. 0.67
    completionAppeal: 1 - 0.12 * s, // 1.12 (tight) .. 0.88 (sprawling)
    lengthMul: clamp(len / tier.defaultLength, 0.5, 2), // vs the tier's default
  }
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
  const size = sizeProfile(draft)
  // Rarity-wide finishes (holo/gold-etch/etc. assigned to a whole rarity, not
  // just a hand-designed signature — see rarity.finishes) are a real
  // production cost: every card printed at that rarity needs the extra foil
  // stamp/etch step. Weighted by each rarity's SHARE of the sheet's pull
  // weight, so a finish on a common (most of the print run) costs far more
  // than the same finish on a rare secret (a sliver of it).
  // Variants count here too: a separate printing is a separate production run,
  // so the expanded sheet (rarities + their variants) is what carries cost.
  const sheet = expandRaritySheet(draft.rarities ?? defaultRaritySheet())
  const totalPullWeight = sheet.reduce((s, r) => s + Math.max(0, r.pullWeight), 0) || 1
  const finishCostMul = 1 + sheet.reduce((sum, r) => {
    if (!r.finishes?.length) return sum
    const share = Math.max(0, r.pullWeight) / totalPullWeight
    return sum + (combinedFinishEffect(r.finishes).costMul - 1) * share
  }, 0)
  // A bigger set needs more plates and sheets — a modest print-line premium on
  // top of the run size itself.
  const printCost = Math.round(
    (20_000 + (draft.printRun / 100) * 180_000) * (1 + richness * 0.25) * (0.85 + 0.15 * size.lengthMul) * finishCostMul,
  )
  // Development scales with three things: the tier's floor, how hard THIS
  // gimmick is to design (a die-cut era costs real money; a plain themed era is
  // the cheapest thing you can ship), and how many cards actually have to be
  // designed. Calibrated so a tier's DEFAULT length with a 1.0× gimmick lands
  // exactly on the old flat floor — existing balance is preserved.
  const gimmick = draft.block?.gimmickId ? getGimmick(draft.block.gimmickId) : null
  const gimmickMul = gimmick?.devCostMul ?? (draft.block?.gimmickId ? 1 : NO_GIMMICK.devCostMul)
  // Chase intensity is NOT free. It scales how many treatment cards the era
  // mints and how rich they are (blocks.js's gimmickIntensity), so it has to
  // scale their design cost too — otherwise cranking it to maximum is strictly
  // dominant. Weighted by the gimmick's own treatmentWeight for the same reason.
  const intensity = clamp(draft.block?.intensity ?? gimmick?.defaultIntensity ?? 50, 0, 100)
  const chaseMul = gimmick ? 1 + (intensity / 100) * (gimmick.treatmentWeight ?? 1) * 0.35 : 1
  // Louder presentation costs more to produce: bigger frames, more foil, more
  // art direction across the whole set. Anchored at 1.0 for the default
  // loudness of 50, so this doesn't silently reprice every existing set.
  const loudnessMul = 0.85 + (loudnessOf(draft) / 100) * 0.3
  // Secret rares are extra cards to design and extra plates to print. They used
  // to be entirely free — and, being excluded from sizeProfile, couldn't even
  // create bloat, so the dial was pure upside. Charged RELATIVE to the tier's
  // own default, so a stock set is unchanged and only padding costs extra.
  const tierDef = getTier(draft.tier ?? 'major')
  const secretBase = tierDef.ridesBlock ? 3 : 2 // mirrors createDraft's seed
  const secretMul = 1 + (clamp(draft.secretCount ?? 0, 0, MAX_SECRET_CARDS) - secretBase) * 0.02
  const dev = Math.round(
    tierDef.devCostFloor
    * gimmickMul * chaseMul * loudnessMul * secretMul
    * (0.55 + 0.45 * size.lengthMul),
  )
  const art = draft.signatureCards.reduce((sum, c) => {
    const artist = c.artistId ? artistOf(c.artistId) : null
    if (!artist) return sum
    // Featuring an existing character costs more at a richer treatment tier —
    // that's the price of leaning on the character's accumulated pull.
    const mul = c.characterId ? getTreatment(c.treatment).costMul : 1
    // A richer printing finish costs more to produce, too.
    return sum + artist.cost * mul * getFinish(c.finish).costMul
  }, 0)
  // Serialized chase cards: hand-numbering a capped run is a real production
  // line, and the scarcer the cap the more it costs per card. Previously free —
  // a /1 was a 15× singles multiplier (market.js) that cost nothing to print.
  const serialization = draft.signatureCards.reduce((sum, c) => {
    if (!c.serialCap) return sum
    return sum + Math.round(4_000 + 60_000 / Math.max(1, c.serialCap))
  }, 0)
  // An art director is a whole-set commission — double their card rate.
  const director = draft.artDirectorId ? artistOf(draft.artDirectorId) : null
  const artDirection = director ? Math.round(director.cost * 2) : 0
  const prerelease = draft.prerelease.enabled ? 15_000 : 0
  // A midnight launch pays for the event itself; a themed drop is a curated
  // presentation angle, not extra staffing — free.
  const releaseEvent = draft.releaseEvent?.type === 'midnight' ? 6_000 : 0
  // Each EXTRA SKU (bundle/spc/tin) costs its own print run. Boosters are already
  // covered by printCost above, so a boosters-only set's total is unchanged.
  const skus = (draft.products ?? []).reduce((sum, p) => sum + productPrintCost(p), 0)
  // Previewing cards ahead of launch buys placement — a real, if modest, spend.
  const spotlight = Math.min((draft.spotlight?.picks?.length ?? 0), MAX_SPOTLIGHT_PICKS) * SPOTLIGHT_COST_EACH
  // An SPC exclusive promo is its own short print run and its own commission.
  // It used to be FREE: neither setCost nor productPrintCost read the flag, so
  // ticking one checkbox minted a scarce, high-value, unpullable grail for
  // nothing. (It also draws a `gated` grievance now — see personas.js.)
  const exclusivePromo = (draft.products ?? []).some((p) => p.kind === 'spc' && p.exclusivePromo)
    ? EXCLUSIVE_PROMO_COST : 0
  return {
    dev, printCost, art, artDirection, serialization, prerelease, releaseEvent, skus, spotlight, exclusivePromo,
    total: dev + printCost + art + artDirection + serialization + prerelease + releaseEvent + skus + spotlight + exclusivePromo,
  }
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
  // A gimmick is OPTIONAL — a block opened without one is a plain themed era.
  // Only a non-null id that doesn't resolve is an error (stale saved draft).
  if (tier.opensBlock && draft.block?.gimmickId && !getGimmick(draft.block.gimmickId)) {
    errors.push('That gimmick no longer exists — pick another, or run a plain themed era.')
  }
  if (tier.id === 'anniversary') {
    const gate = canUnlockAnniversary({ franchise: ctx.franchise, setsShipped: ctx.setsShipped, perks: ctx.perks })
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
  if ((draft.spotlight?.picks?.length ?? 0) > MAX_SPOTLIGHT_PICKS) {
    errors.push(`No more than ${MAX_SPOTLIGHT_PICKS} spotlight reveals.`)
  }
  errors.push(...validateRaritySheet(draft.rarities))
  errors.push(...validatePackFormat(draft.packFormat))
  errors.push(...validateProducts(draft.products))
  if (draft.prerelease.chasePullable && !draft.prerelease.enabled) {
    errors.push('Chase-pullable requires prerelease enabled.')
  }
  return errors
}

// How many cards each rarity can expect to draw in this draft, before any
// variant printings. A variant REPRINTS its parent rarity's cards, so a variant
// on a rarity that draws none prints nothing — which is invisible at release
// time unless the editor says so. Signature highlights are exact (the player
// placed them by hand); bulk cards are the expected value of the pull-weight
// distribution, and secrets divide the secret count between secret rarities.
export function expectedRarityCounts(draft) {
  const sheet = draft.rarities ?? defaultRaritySheet()
  const length = clamp(Math.round(draft.setLength ?? 60), MIN_SET_LENGTH, MAX_SET_LENGTH)
  const secretCount = clamp(Math.round(draft.secretCount ?? 0), 0, MAX_SECRET_CARDS)
  const sigs = (draft.signatureCards ?? []).slice(0, length)

  const counts = new Map(sheet.map((r) => [r.id, 0]))
  for (const sig of sigs) counts.set(sig.rarity, (counts.get(sig.rarity) ?? 0) + 1)

  const nonSecret = sheet.filter((r) => !r.secret && Math.max(0, r.pullWeight) > 0)
  const total = nonSecret.reduce((sum, r) => sum + Math.max(0, r.pullWeight), 0)
  const bulk = Math.max(0, length - sigs.length)
  if (total > 0) {
    for (const r of nonSecret) {
      counts.set(r.id, (counts.get(r.id) ?? 0) + bulk * (Math.max(0, r.pullWeight) / total))
    }
  }

  const secretRarities = sheet.filter((r) => r.secret)
  if (secretRarities.length) {
    for (let i = 0; i < secretCount; i++) {
      const r = secretRarities[i % secretRarities.length]
      counts.set(r.id, (counts.get(r.id) ?? 0) + 1)
    }
  }
  return counts
}

// ---- Card generation ------------------------------------------------------

// A card's hidden "pop factors" — the inputs the market prices from. Rarity's
// collector weight comes from the set's sheet (valueTier). `power` is the card's
// punch seed (signatures carry an explicit one; bulk cards get a low/random
// one so the occasional sleeper can still pop).
// Does the art-direction brief share a word with the theme's own tags? Cheap
// bag-of-words check — the note is free text, so this stays forgiving.
function artNotesMatchTheme(notes, theme) {
  if (!notes?.trim() || !theme?.tags?.length) return false
  const words = notes.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  return theme.tags.some((t) => words.includes(t.toLowerCase()))
}

function popFactors(card, draft, theme, sheet, rng, artistOf = getArtist, characters = []) {
  const standout = cardAppeal(card, sheet)
  const artist = card.artistId ? artistOf(card.artistId) : null
  const rarityTier = getRarity(sheet, card.rarity).valueTier
  const baseArt = artist ? artist.reach : 25
  // Theme tags matching the artist's specialty elevate the card.
  // An art DIRECTOR sets the look of the whole set, so their specialty match
  // applies to every card — not just the ones they personally illustrated.
  const director = draft?.artDirectorId ? artistOf(draft.artDirectorId) : null
  // Belt and braces: the two call paths into here now fall back to a known
  // theme, but this must never be the thing that crashes card generation.
  const tags = theme?.tags ?? []
  const directed = director && tags.some((t) => director.specialty.includes(t)) ? 12 : 0
  const themeMatch = (artist && tags.some((t) => artist.specialty.includes(t)) ? 20 : 0) + directed
  // An art-direction brief that actually leans into the set's theme reads as a
  // more cohesive commission — the same idea as the artist specialty match.
  const notesMatch = artNotesMatchTheme(card.artNotes, theme) ? 6 : 0
  const artAppeal = clamp(baseArt + themeMatch + notesMatch + range(rng, -8, 8), 0, 100)
  const hype = clamp((standout + artAppeal) / 2 + range(rng, -12, 12), 0, 100)

  // Featuring an existing character bolts on a baseline draw from its
  // accumulated fame — "a new Pikachu card gets built-in demand no matter how
  // it's designed" — scaled up by a richer treatment tier.
  const character = card.characterId ? characters.find((c) => c.id === card.characterId) : null
  const fameBonus = character ? famePopBonus(character.fame, card.treatment) : 0
  // A character whose ARCHETYPE matches the set's theme reads as a coherent
  // printing — a frost guardian in a Frostbound set, not a beach episode. The
  // same idea as the artist specialty match above, and deliberately smaller than
  // it (+10 against +20): who is on the card matters less than who drew it.
  const archetypeMatch = character && archetypeMatchesTheme(character.archetypeId, tags) ? 10 : 0

  return {
    // `punch` is how loudly this card reads next to its shelfmates — a
    // presentation signal, not a power level. (Name kept: personas.js and
    // events.js read it.)
    punch: clamp(standout + range(rng, -10, 10), 0, 100),
    rarity: rarityTier, // 0–100 collector value tier from the set's sheet
    artAppeal: clamp(artAppeal + fameBonus + archetypeMatch, 0, 100),
    hype: clamp(hype + fameBonus + archetypeMatch, 0, 100),
  }
}

// A card's STANDOUT APPEAL — how loudly it reads next to its shelfmates. The
// designer's own dial, lifted by the card's own printing finish (signature
// cards only), by whatever finishes its RARITY carries as a blanket
// production choice (every card at that rarity, signature or bulk — see
// rarity.finishes/combinedFinishEffect in rarities.js), and by having a
// written flavor line. `sheet` is optional so old call sites without rarity
// context still resolve (just without the rarity-finish lift).
export function cardAppeal(card, sheet) {
  const base = card?.appeal ?? card?.power ?? 50 // ?? power: in-session legacy records
  const ownFinish = getFinish(card?.finish).appealBonus
  const rarityFinishIds = sheet ? (getRarity(sheet, card?.rarity)?.finishes ?? []) : []
  const rarityFinish = combinedFinishEffect(rarityFinishIds).appealBonus
  const flavor = card?.flavorText?.trim() ? 4 : 0
  return clamp(base + ownFinish + rarityFinish + flavor, 0, 100)
}

// Build one market-ready card record from a "spec" (id/name/rarity/number + an
// optional designed signature card behind it).
function buildCard(spec, draft, theme, sheet, rng, artistOf, characters = []) {
  const factors = popFactors(spec, draft, theme, sheet, rng, artistOf, characters)
  // Initial price seeds off rarity + art + hype; the market moves it from here.
  const seed = factors.rarity * 0.25 + factors.artAppeal * 0.4 + factors.hype * 0.35
  const scarcity = 1 + (1 - draft.printRun / 100) * 1.5
  // An alternate printing is priced off how much rarer it is than the card it
  // reprints — the actual reason an alt art costs a multiple of the base copy.
  // 1 for every ordinary card, so no non-variant price moves because of this.
  const variantPremium = variantScarcityPremium(sheet, spec.rarity)
  const singlePrice = Math.max(0.1, Math.round(seed * 0.6 * scarcity * variantPremium * 10) / 10)
  return {
    id: `${draft._setId}_${spec.id}`,
    setId: draft._setId,
    name: spec.name,
    rarity: spec.rarity,
    number: spec.number, // collector number, e.g. "73/60" or secret "61/60"
    secret: spec.secret ?? false,
    signature: spec.signature ?? false,
    // The card this is an alternate printing of. Built with the same set-id
    // prefix as `id` above, because generateCards works in spec ids and this
    // has to resolve against the finished card records.
    variantOf: spec.variantOf ? `${draft._setId}_${spec.variantOf}` : null,
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
export function generateCards(draft, setId, week, artistOf = getArtist, characters = [], nameStyle = 'creature') {
  // getTheme returns null for an id it doesn't know (a stale save, a renamed
  // theme). popFactors reads theme.tags unguarded, so fall back the same way
  // blocks.js's mintTreatmentCards already does rather than crash generation.
  const theme = getTheme(draft.themeId) ?? getTheme('dragons')
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
      artistId: sig.artistId,
      appeal: sig.appeal ?? sig.power, finish: sig.finish, flavorText: sig.flavorText, artNotes: sig.artNotes,
      characterId: sig.characterId ?? null, treatment: sig.treatment ?? 'debut',
      serialCap: sig.serialCap ?? null,
      signature: true,
    })
  })

  // 2) Fill the rest of the numbered set with themed-random cards, rarity by the
  //    set's pull weights. Bulk cards get a modest random punch so a
  //    sleeper can still spike, but they don't track the loudness dial.
  for (let i = specs.length; i < length; i++) {
    const rarityId = nonSecret.length ? pickRarity(nonSecret, rng) : (sheet[0]?.id ?? 'common')
    specs.push({
      id: `c${i + 1}`, name: randomCardName(theme, rng, nameStyle), rarity: rarityId,
      number: `${i + 1}/${length}`,
      appeal: clamp(Math.round(range(rng, 15, 70)), 0, 100), // bulk: low-to-mid, sleepers possible
    })
  }

  // 3) Secret rares: numbered ABOVE the count, scarcest chase.
  for (let s = 0; s < secretCount; s++) {
    const rarityId = secretRarities.length
      ? secretRarities[s % secretRarities.length].id
      : (nonSecret[nonSecret.length - 1]?.id ?? 'rare')
    const num = length + s + 1
    specs.push({
      id: `s${s + 1}`, name: randomCardName(theme, rng, nameStyle), rarity: rarityId,
      number: `${num}/${length}`, secret: true,
      appeal: clamp(Math.round(range(rng, 20, 80)), 0, 100),
    })
  }

  // 4) Variant printings. A variant is a SECOND card of one the set already
  //    has — same name, same character, same artist — printed with the
  //    variant's own finishes and numbered above the count beside the secrets.
  //    It reprints the rarity's MARQUEE cards (signature highlights first, then
  //    the highest-appeal bulk), because that is which card a real set gives an
  //    alt art to. A variant whose parent rarity drew no cards prints nothing.
  let above = length + secretCount
  for (const { parent, entry } of variantEntries(sheet)) {
    const pool = [...specs.filter((sp) => sp.rarity === parent.id)].sort(
      (a, b) => (b.signature ? 1 : 0) - (a.signature ? 1 : 0) || (b.appeal ?? 0) - (a.appeal ?? 0),
    )
    if (!pool.length) continue
    const want = Math.min(entry.variantCount, pool.length)
    for (let i = 0; i < want; i++) {
      const base = pool[i]
      above += 1
      specs.push({
        id: `${entry.id}_${i + 1}`,
        name: base.name,
        rarity: entry.id,
        number: `${above}/${length}`,
        secret: true, // numbered above the count, and a chase — both true of a variant
        appeal: base.appeal,
        artistId: base.artistId ?? null,
        characterId: base.characterId ?? null,
        flavorText: base.flavorText,
        artNotes: base.artNotes,
        // NOT `finish`: a variant's treatment comes from the variant's own
        // finishes (via its sheet entry), not from the base card's printing.
        variantOf: base.id,
      })
    }
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
// release's design loudness. Returns { sets, cards, cash, printIntensity, set }
// patches for the reducer.
export function releaseSet(state, draft) {
  const setId = `set_${state.sets.length + 1}`
  // Resolve artists to their CURRENT drifted cost/reach so a risen star costs
  // (and elevates a card) what they're worth now, not their seed value.
  const artistOf = (id) => currentArtist(state, id)
  const tier = getTier(draft.tier ?? 'major')
  const cost = setCost(draft, artistOf)
  // How this set's SIZE reads: event scale, chase density, and bloat.
  const size = sizeProfile(draft)

  // Block resolution. A MAJOR opens a fresh block (with the player's gimmick spec);
  // a MINOR/MICRO rides a live block but keeps its own theme (a Jungle set and a
  // Fossil set can both ride the same Base-era block with different flavor).
  // Blocks coexist — a new major never retires the old ones (their warps
  // stack). `block` is the block this set belongs to (new or attached);
  // `blocksPatch` is the full state.blocks array after opening/refreshing.
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
  // The set's own theme — a per-set flavor pick, independent of the block it
  // rides (the block's `themeId` is only that block's OPENING set's theme;
  // every rider is free to pick its own, same as Jungle/Fossil/Team Rocket).
  const themeId = draft.themeId
  draft = { ...draft, themeId }
  const theme = getTheme(themeId) ?? getTheme('dragons')

  // Characters: mint any BRAND-NEW characters a signature card requested, before
  // generating cards, so the character exists (with a stable id) in time both for
  // its own fame lookup and the debut appearance recorded below.
  let characters = state.characters ?? []
  const resolvedSigs = (draft.signatureCards ?? []).map((sig) => {
    if (sig.characterId || !sig.newCharacterName?.trim()) return sig
    const created = createCharacter(sig.newCharacterName, {
      archetypeId: sig.newCharacterArchetype,
      species: sig.newCharacterSpecies,
      hook: sig.newCharacterHook,
    })
    characters = [...characters, created]
    return { ...sig, characterId: created.id, treatment: 'debut' }
  })
  draft = { ...draft, signatureCards: resolvedSigs }

  const nameStyle = getConcept(state.config?.conceptId).nameStyle
  const cards = generateCards(draft, setId, state.week, artistOf, characters, nameStyle)

  // Every signature card that features a character (new or existing) records a
  // new appearance — bumps fame, files the debut set on a first printing. Feeds
  // the set builder's next view of fame and, at high fame, the icon treatment slot.
  for (const card of cards) {
    if (!card.characterId) continue
    characters = recordAppearance(characters, card.characterId, {
      cardId: card.id, setId, treatment: card.treatment, popFactors: card.popFactors,
      week: state.week, setName: draft.name,
    })
  }

  const set = {
    id: setId,
    name: draft.name,
    tier: tier.id,
    blockId: block?.id ?? null,
    themeId,
    theme: theme.name,
    designLoudness: loudnessOf(draft),
    rarityChase: draft.rarityChase,
    printRun: draft.printRun,
    price: draft.pricePoint,
    signatureCards: draft.signatureCards,
    rarities: draft.rarities, // the set's rarity sheet (for pricing/packs/display)
    packFormat: draft.packFormat, // booster structure (slots) for ripping/display
    setLength: draft.setLength,
    secretCount: draft.secretCount,
    // How this set's size reads to the world — persisted so the weekly
    // reaction engines (personas/segments/events) can judge it long after
    // release without re-deriving it from the tier band.
    bloat: size.bloat,
    sizeScore: size.s,
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
    // What a god pack of THIS set contains, if it ever hits — see packs.js's
    // drawGodPack. Falls back to the pre-feature default (on, auto top-tier)
    // via the same shape createDraft seeds, so this is never missing on a
    // freshly-released set.
    godPack: draft.godPack ?? { enabled: true, rarityIds: [] },
  }

  // Design loudness → the nostalgia-erosion level THIS set sustains while it
  // is on the shelf (see printIntensity, read by segments.js and rival.js).
  //
  // This replaced a delta-push, `creep = (loudnessOf(draft) - 50) / 5`, which
  // is exactly 0 at the default loudness of 50 — so a default release moved the
  // dial by nothing AND multiplied every gimmick's creep weight by zero. The
  // set now declares a LEVEL, the release pulls the live dial partway toward
  // it, and simulation.js relaxes toward the buzz-weighted mean of every
  // in-print set's level. A default-loudness plain era lands exactly on neutral,
  // so a stock set is still precisely balance-neutral — but now because it
  // HOLDS the dial where it is, rather than because its effect is zero.
  const setLevel = clamp(
    PRINT_INTENSITY_NEUTRAL
      + (loudnessOf(draft) - LOUDNESS_NEUTRAL) * LOUDNESS_TO_LEVEL // ±40 across the slider
      + (block?.creep ?? 0) * GIMMICK_LEVEL_WEIGHT, // a Mega era rests higher than a plain one
    0, 100,
  )
  set.printLevel = setLevel

  // Card reprints: popular cards from older sets re-issued into this one. They're
  // added as fresh instances in the new set (carrying the original's identity and
  // appeal — a fan-service draw that lifts the set's hype) and SOFTEN their old
  // originals (no longer unique to their set).
  const reprintResult = applyCardReprints(
    state, draft, setId, theme, draft.rarities ?? defaultRaritySheet(),
    cards, state.cards, artistOf,
  )

  // A release pulls the live dial partway toward the level this set sustains —
  // a new drop dominates the room immediately, then simulation.js's weekly
  // relaxation carries the rest of the way as the shelf settles around it.
  const prevIntensity = state.printIntensity ?? PRINT_INTENSITY_NEUTRAL
  const printIntensity = clamp(prevIntensity + (setLevel - prevIntensity) * RELEASE_PULL, 0, 100)

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

  // ---- Spotlight reveals --------------------------------------------------
  // Cards shown off publicly ahead of launch. Resolve each pick to a concrete
  // card id in this set's freshly-minted pool, so the reveal actually lands on
  // a real card people can then chase.
  const spotlightPicks = (draft.spotlight?.picks ?? []).slice(0, MAX_SPOTLIGHT_PICKS)
  const spotlightIds = resolveSpotlightIds(spotlightPicks, { setId, cards, treatmentCards, reprintCards: reprintResult.reprintCards })
  const spotlightNames = spotlightIds
    .map((id) => [...cards, ...treatmentCards, ...reprintResult.reprintCards].find((c) => c.id === id)?.name)
    .filter(Boolean)
  const revealShare = spotlightIds.length / MAX_SPOTLIGHT_PICKS
  // Diminishing returns, then an OVER-REVEAL penalty: a couple of previews
  // build anticipation, but show the whole set and there's nothing left to find
  // in the pack. Peaks around three reveals.
  const spotlightBuzz = clamp(9 * Math.sqrt(revealShare) - 15 * Math.max(0, revealShare - 0.6), 0, 9)
  set.spotlight = spotlightIds
  // The sealed-demand side of the same lift (read by revenue.js's setAppeal),
  // with its own gentler over-reveal taper.
  set.spotlightAppeal = clamp(0.05 * spotlightIds.length - 0.05 * Math.max(0, spotlightIds.length - 3), 0, 0.12)

  // The set's cover character (if any), resolved once for both the feed line
  // and the launch bump below.
  const cover = draft.coverCharacterId
    ? characters.find((c) => c.id === draft.coverCharacterId) ?? null
    : null

  const feedParts = [
    reprintResult.feed,
    promoCards.length ? `Collector box includes an exclusive promo.` : null,
    anniversaryCards.length ? `${anniversaryCards.length} anniversary chase card${anniversaryCards.length > 1 ? 's' : ''} debut — instant nostalgia for the faithful.` : null,
    treatmentCards.length ? `${treatmentCards.length} ${block.treatmentLabel} chase card${treatmentCards.length > 1 ? 's' : ''} debut — the chase pulls driving extra demand for this set's packs.` : null,
    draft.releaseEvent?.type === 'midnight' ? `A midnight launch draws a line out the door for ${draft.name} — buzz spikes, and scalper chatter with it.` : null,
    draft.releaseEvent?.type === 'themed' ? `A themed drop event gives ${draft.name} a curated spotlight — the shelf feels like an occasion.` : null,
    cover ? `${cover.name} fronts the box art.` : null,
    spotlightNames.length
      ? `Previewed ahead of launch: ${spotlightNames.join(', ')}.`
      : null,
    spotlightIds.length >= 4
      ? `Some fans grumble that the previews gave away most of what's worth pulling.`
      : null,
    size.bloat > 0.5
      ? `At ${set.setLength} cards it's a landmark ${tier.name.toLowerCase()} — though "that's a lot of cardboard" is already the discourse.`
      : size.s <= -0.5
        ? `A tight ${set.setLength}-card ${tier.name.toLowerCase()} — completable, and collectors notice.`
        : null,
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
  // Set SIZE reads as event scale, with a bloat penalty at the top of the band:
  // a landmark expansion is news, and a sprawling one is news people complain
  // about. Net peaks in the upper-middle of the band — both extremes cost you.
  set.buzz = clamp(40 + avgHype * 0.6 + size.sizeBuzz - 10 * size.bloat, 10, 100)

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

  // Previews stoke the launch on top of the event itself.
  set.buzz = clamp(set.buzz + spotlightBuzz, 10, 100)

  // Cover character: putting a known face on the box lends the set that
  // character's accumulated fame. Costs nothing (they're already yours) — the
  // real decision is WHICH face, and a fresh no-name lends nothing.
  if (cover) {
    set.coverCharacterId = cover.id
    set.coverCharacterName = cover.name
    // Same shape as famePopBonus but at set scale: a marquee face is worth a
    // real launch bump, an unknown one is worth almost nothing. A face whose
    // archetype suits the theme sells the box a little harder still.
    const onTheme = archetypeMatchesTheme(cover.archetypeId, theme?.tags) ? 1.15 : 1
    // The multiplier sits OUTSIDE the per-face cap, so the theme match still pays
    // at the top of the fame range instead of being clamped away exactly where a
    // marquee cover matters most.
    set.buzz = clamp(set.buzz + clamp((cover.fame ?? 0) * 0.12, 0, 10) * onTheme, 10, 100)
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
  // Fatigue also has to read SPACING, not just count. A rider four weeks after
  // the last drop is a treadmill; the same rider twelve weeks later is a
  // legitimate in-between release, and the old count-only formula could not
  // tell them apart — which is why shipping a cheap rider every four weeks was
  // the single most profitable strategy in the game.
  let fatigue = 1
  if (tier.ridesBlock) {
    const sinceMajor = countRidersSinceLastMajor(state.sets)
    const lastSet = state.sets[state.sets.length - 1]
    const weeksSince = lastSet ? state.week - lastSet.releasedWeek : RIDER_SPACING_WEEKS
    const spacing = clamp(weeksSince / RIDER_SPACING_WEEKS, 0, 1) // 0 = same week, 1 = 12+ weeks apart
    fatigue = clamp(1 / (1 + sinceMajor * 0.85 * (1 - spacing * 0.7)), 0.12, 1)
  }
  // Persist it: fatigue used to apply ONLY to the discovery wave, so a
  // rider-spam studio recruited badly but still sold packs at full price for
  // the life of every set. It now damps the set's buzz and — via revenue.js's
  // setAppeal — its ongoing pack demand too.
  set.riderFatigue = fatigue
  set.buzz = clamp(set.buzz * (0.55 + 0.45 * fatigue), 10, 100)
  // ...and with SIZE: a big set is a bigger launch event (more to talk about,
  // more shelf presence), a tight one a smaller one. Neutral at the tier's
  // default length, so this doesn't quietly move the existing balance.
  const fullWave = Math.round(
    (3500 + (avgHype / 100) * 13000) * moodMul * tier.discoveryMul * fatigue * size.eventScale,
  )

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
  // A sprawling set spreads the same chase across more cards, so each pack
  // opened feels thinner; a tight one concentrates it.
  set.treatmentBuzz = clamp(
    treatmentCards.length * 0.04 * (block?.treatment ?? 0) * tier.collectorMul * size.chaseDensity, 0, 0.3,
  )
  // Riders pop harder on the secondary market — and a completable set pops
  // harder still, because people actually chase the whole thing.
  set.collectorMul = tier.collectorMul * size.completionAppeal

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
  // A previewed card arrives already wanted — people have been looking at it
  // for weeks before they could buy it.
  const spotlitSet = new Set(spotlightIds)
  const hypedNewCards = [...cards, ...treatmentCards, ...anniversaryCards].map((c) => ({
    ...c,
    hype: clamp((c.hype ?? 0) * hypeMul * (spotlitSet.has(c.id) ? 1.25 : 1), 0, 3),
  }))
  // Odds transparency also nudges community trust: publishing wins over
  // fairness-minded voices most, with a small ambient goodwill bump for
  // everyone; obscuring carries no bump (its cost is the backlash-event risk
  // instead — see events.js's odds_transparency_backlash).
  const personaSentimentBump = draft.oddsPublished
    ? { tasteKey: 'fairness', floor: 0.4, amount: 3, ambientAmount: 1 }
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

// Resolve spotlight picks to concrete card ids in the freshly-minted pool.
// A pick is { kind, ref }:
//   signature — ref is the index into the draft's signatureCards (they take the
//               set's first collector numbers, so `c${ref+1}`)
//   treatment — ref is the index into the block's minted treatment cards
//   reprint   — ref is the index into the resolved reprint instances
// Picks that don't resolve (a signature removed after being spotlit, a
// treatment slot the block didn't end up minting) are silently dropped — the
// player shouldn't pay for, or benefit from, a reveal that has no card.
// Deduped so the same card can't be counted twice toward the reveal curve.
function resolveSpotlightIds(picks, { setId, cards, treatmentCards, reprintCards }) {
  const out = []
  for (const pick of picks ?? []) {
    const i = Number(pick?.ref)
    if (!Number.isInteger(i) || i < 0) continue
    let id = null
    if (pick.kind === 'signature') id = cards.find((c) => c.id === `${setId}_c${i + 1}`)?.id ?? null
    else if (pick.kind === 'treatment') id = treatmentCards[i]?.id ?? null
    else if (pick.kind === 'reprint') id = reprintCards[i]?.id ?? null
    if (id && !out.includes(id)) out.push(id)
  }
  return out
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
    designLoudness: loudnessOf(original),
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
  const nameStyle = getConcept(state.config?.conceptId).nameStyle
  const reprintCards = generateCards(draft, newSetId, state.week, artistOf, state.characters ?? [], nameStyle).map((c) => ({
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
    designLoudness: loudnessOf(original),
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

  // The community has an opinion about this. Re-issuing a set people already
  // bought is a genuine trade: it makes the game accessible again (newcomers
  // and casuals can finally get in), but a HEAVY Unlimited run reads as
  // devaluing what collectors already own. Value-minded voices feel it most.
  //
  // Scaled by how big the reprint run is: a modest re-issue is welcomed, a
  // flood is resented.
  const flood = clamp((printRun - 45) / 55, 0, 1)
  const reprintSentimentBump = {
    tasteKey: 'value',
    floor: 0.4,
    // Collectors: welcome at a light run, resentful at a flood.
    amount: Math.round((2.5 - flood * 8) * 10) / 10,
    // Everyone else mostly just sees more product on shelves.
    ambientAmount: Math.round((1.5 - flood * 2) * 10) / 10,
  }

  return {
    set: reprintSetRecord,
    cards: reprintCards,
    firstEditionCards,
    cashDelta: -cost,
    feed,
    personaSentimentBump: reprintSentimentBump,
  }
}

