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
import { seedFromStandards, cloneSheet, cloneFormat, cloneGodPack } from './standards.js'

// Re-exported for existing call sites (SignatureCardEditor.jsx etc.) — the
// finish system now lives in rarities.js since a whole RARITY can carry
// finishes too, not just a hand-designed signature card. See combinedFinishEffect.
export { FINISHES, getFinish }
import { defaultProducts, finalizeProducts, productPrintCost, validateProducts, DEFAULT_CHANNELS } from './products.js'
import { makePromoCard } from './promos.js'
import { printBillMul, artDirectorRate } from './upgrades.js'
import { getTier, openBlock, refreshBlockWarp, mintTreatmentCards, mintAnniversaryCards, canUnlockAnniversary } from './blocks.js'
import { getGimmick, NO_GIMMICK } from './content/gimmicks.js'
import { createCharacter, getTreatment, recordAppearance, createLineageCharacter } from './characters.js'
import { derivePeople, recordPersonPrinting, continuityVerdict } from './people.js'
import { castIdsOf, castMembers, castPopBonus, withCast } from './cast.js'
import { recordPrinting, standaloneCost, STANDALONE_PRINT_COST, designFromReleasedCard } from './carddesigns.js'
import { archetypeMatchesTheme } from './content/archetypes.js'
import {
  getIllustrationKind,
  DEFAULT_ILLUSTRATION_KIND_ID,
} from './content/illustrationsets.js'
import {
  openGroup, addMembers, makeMember, briefMatches, scoreCohesion,
  groupLift, announcementBuzz, promiseCredibility, illustrationAppealFor,
} from './illustrationsets.js'

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

// Opening an illustration set, and committing one card to it. See the
// illustrationSet line in setCost for how these are anchored.
//
// Halved from 18k/6k after measurement: at that price a three-card trio cost
// $36,000 a release and the harness's illustration strategy finished BEHIND a
// control making the identical art decisions without the group. The cost was
// simply above what the mechanic returns. $21,000 for a trio now sits beside
// the art-director lever, which buys a whole-set +12 for roughly double one
// artist's rate.
const ILLUSTRATION_OPEN_COST = 9_000
const ILLUSTRATION_MEMBER_COST = 4_000

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
//
// `standards` is the player's studio library (see standards.js). If they have
// marked a default rarity sheet, booster format or blueprint, the draft starts
// from a COPY of it instead of the built-ins. Optional and trailing so every
// bare createDraft(n, tier, blocks) call — the playtest harness's included —
// behaves exactly as it always has.
export function createDraft(setNumber, tier = 'major', liveBlocks = [], standards = {}) {
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

    // The full set: `setLength` numbered cards generated across the rarity
    // sheet, plus the cards you hand-designed, numbered ABOVE the count
    // (e.g. 151/150).
    //
    // Which numbering layout this set uses. See generateCards: a set released
    // BEFORE the secret dial was retired put its signature cards at the FIRST
    // collector numbers, and reprintAsUnlimited has to reproduce that exactly.
    // An older set's record has no flag at all, which reads false and gets the
    // legacy layout — that is the whole point of storing it.
    signaturesAboveCount: true,
    // There used to be a second slider here — `secretCount` — for how many
    // cards sat above the count, filled with themed-random chase. It is gone.
    // The cards above the count are the ones the player DESIGNED, and their
    // number is however many they designed; a dial that padded that band with
    // procedural cards was asking the player to buy chase they had not
    // authored. Released sets keep whatever `secretCount` they shipped with, so
    // an in-flight save reprints exactly as it printed (see reprintAsUnlimited).
    setLength: t.defaultLength,
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

    // Illustration set: a named group of cards in this release that are meant
    // to be collected together (see illustrationsets.js). `mode` is 'none',
    // 'open' (start a new group) or 'continue' (add to one already open, which
    // is how a group spans releases). `picks` reuses the spotlight pick shape
    // byte for byte — { kind, ref } against this set's signature cards,
    // treatment cards and reprints — so both resolve through the same
    // resolveCardPicks below rather than through two near-identical resolvers.
    illustrationSet: {
      mode: 'none',
      groupId: null,
      kindId: DEFAULT_ILLUSTRATION_KIND_ID,
      name: '',
      artBrief: '',
      plannedSize: getIllustrationKind(DEFAULT_ILLUSTRATION_KIND_ID).defaultPlannedSize,
      picks: [],
    },

    // The studio's own defaults, spread LAST so they win over the built-in sheet
    // and Classic pack seeded above — `godPack` in particular is declared a few
    // lines up, and in an object literal the later key wins, so seeding it from
    // anywhere but here would be silently clobbered. Empty for a player who has
    // saved no standards, which is what keeps a fresh company's first set (and
    // every harness run) seeded exactly as it always was.
    ...seedFromStandards(standards),
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
    // Which CAST MEMBER a brand-new form belongs to (people.js). Set when the
    // card debuts a new form of somebody already on the roster — Aryla in a
    // shape she has not been printed in before. Null for a brand-new character,
    // whose person is minted from the card face by derivePeople exactly as it
    // always was.
    newCharacterPersonId: null,
    newCharacterArchetype: 'unaligned',
    newCharacterSpecies: '',
    newCharacterHook: '',
    // The roster character(s) this new one grows out of, if any, and the kind
    // of link — see characters.js's lineage section and content/lineages.js.
    // All null for an ordinary debut. A fusion fills the second parent too.
    newCharacterPromotedFrom: null,
    newCharacterLineageKind: null,
    newCharacterSecondParent: null,
    // The FORM's half of a new character (see people.js): what to call this
    // appearance on the roster, how it carries itself, and whether the card face
    // says the character's name at all. Resolved at release beside the
    // newCharacter* fields above.
    newFormName: '',
    newFormDemeanor: [],
    newFormCarriesName: true,
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
  // Unique rarities are excluded — each belongs to exactly the one hand-
  // customized card it was spun off for, never a randomly-filled one.
  const ranked = [...sheet].filter((r) => !r.unique).sort((a, b) => b.valueTier - a.valueTier)
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
// `ctx` carries { illustrationSets } so a continue can be billed against the
// kind of the group it is continuing, and { upgrades } so a print partner or an
// art department (upgrades.js) discounts the lines they touch. Optional — an
// old call site or the harness bills off the draft at full price, which is
// correct for an 'open' and for a studio that bought nothing.
export function setCost(draft, artistOf = getArtist, ctx = {}) {
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
    (20_000 + (draft.printRun / 100) * 180_000) * (1 + richness * 0.25) * (0.85 + 0.15 * size.lengthMul) * finishCostMul
    * printBillMul(ctx.upgrades),
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
  // The cards numbered above the count are extra cards to design and extra
  // plates to print. That band used to be a slider with a per-tier default, and
  // the multiplier was anchored on that default; the band is the signature
  // highlights now and it is genuinely OPTIONAL, so it anchors at zero. A set
  // with no designed cards pays the tier's floor and each one you design adds
  // 2%. Anchoring on the retired seed instead made a stock set 4-6% CHEAPER
  // than it had ever been, quietly, which is not a repricing anyone asked for.
  const tierDef = getTier(draft.tier ?? 'major')
  const aboveCount = clamp((draft.signatureCards ?? []).length, 0, MAX_SIGNATURE_CARDS)
  const secretMul = 1 + aboveCount * 0.02
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
  // An art director is a whole-set commission — double their card rate, less
  // with an in-house art department (upgrades.js).
  const director = draft.artDirectorId ? artistOf(draft.artDirectorId) : null
  const artDirection = director ? Math.round(director.cost * artDirectorRate(ctx.upgrades)) : 0
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
  // A collector-box exclusive built from a LIBRARY DESIGN carries that design's
  // artist, finish and serial cap onto the minted card — but `art` and
  // `serialization` above iterate signatureCards only, so none of it was ever
  // billed. Naming the priciest illustrator and a /1 cap on the box exclusive
  // cost a flat fee and bought a 15x singles multiplier for nothing.
  const spcDesign = (draft.products ?? []).find((p) => p.kind === 'spc' && p.exclusivePromo && p.promoDesignId)
  const spcDesignRecord = spcDesign
    ? (ctx.cardDesigns ?? []).find((d) => d.id === spcDesign.promoDesignId)
    : null
  const spcDesignCost = spcDesignRecord
    ? standaloneCost(spcDesignRecord, artistOf, getTreatment(spcDesignRecord.treatment).costMul) - STANDALONE_PRINT_COST
    : 0
  const exclusivePromo = (draft.products ?? []).some((p) => p.kind === 'spc' && p.exclusivePromo)
    ? EXCLUSIVE_PROMO_COST : 0
  // An illustration set is an ART-DIRECTION commission, not a printing one. The
  // cards have to be designed against each other — a shared brief, a consistent
  // hand, a rarity ladder that reads — and that is billable work on top of
  // whatever each card's own artist already costs (which `art` above charges
  // separately and unchanged). Opening one is the fixed cost of the direction;
  // each card committed to it is the per-piece cost.
  //
  // A three-card trio runs ~$36k against a ~$143k first major. Compare: an SPC
  // exclusive promo $55k, a spotlight reveal $2k each, an art director double
  // their rate ($3k-$60k). Continuing an open group pays only for the cards it
  // adds — the direction was bought when the group opened.
  const ilSpec = draft.illustrationSet
  // On a CONTINUE the kind comes from the group being continued, not from the
  // draft. draft.kindId is a leftover there — the editor never touches it in
  // continue mode — so billing off it charged the same two cards three
  // different prices depending on which kind card the player last clicked
  // before switching modes.
  const ilGroup = ilSpec?.mode === 'continue'
    ? (ctx.illustrationSets ?? []).find((g) => g.id === ilSpec.groupId)
    : null
  const ilKind = getIllustrationKind(ilGroup ? ilGroup.kindId : ilSpec?.kindId)
  const ilPicks = ilSpec && ilSpec.mode !== 'none' ? (ilSpec.picks?.length ?? 0) : 0
  const illustrationSet = ilPicks
    ? Math.round(
      ((ilSpec.mode === 'open' ? ILLUSTRATION_OPEN_COST : 0) + ilPicks * ILLUSTRATION_MEMBER_COST)
      * ilKind.commissionMul,
    )
    : 0
  return {
    dev, printCost, art, artDirection, serialization, prerelease, releaseEvent, skus, spotlight, exclusivePromo, spcDesignCost,
    illustrationSet,
    total: dev + printCost + art + artDirection + serialization + prerelease + releaseEvent + skus + spotlight + exclusivePromo + spcDesignCost + illustrationSet,
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
  // Illustration set rules. A group has to be a group: two members minimum, and
  // never more than the kind allows. A 'continue' has to point at a group that
  // is still open — an abandoned run cannot be quietly reopened, which is the
  // thing that would otherwise let a player farm the announcement buzz forever.
  const il = draft.illustrationSet
  if (il && il.mode !== 'none') {
    const picks = il.picks ?? []
    // Every pick has to point at a signature card that still exists. Nothing
    // checked this, and setCost bills on picks.length regardless — so deleting
    // the cards you had picked shipped a release that charged the full
    // art-direction fee and then created no group at all, with nothing in the
    // feed or the UI to say why.
    const sigCount = (draft.signatureCards ?? []).length
    const dead = picks.filter(
      (pk) => pk?.kind === 'signature'
        && !(Number.isInteger(Number(pk.ref)) && Number(pk.ref) >= 0 && Number(pk.ref) < sigCount),
    ).length
    if (dead > 0) {
      errors.push(`${dead} illustration-set card${dead === 1 ? ' no longer exists' : 's no longer exist'} — re-pick.`)
    }
    const live = picks.length - dead
    const continued = il.mode === 'continue'
      ? (ctx.illustrationSets ?? []).find((g) => g.id === il.groupId)
      : null
    const kind = getIllustrationKind(continued ? continued.kindId : il.kindId)
    if (!continued && live < 2) {
      errors.push(`A ${kind.noun} needs at least two cards in this release to open.`)
    }
    if (il.mode === 'continue') {
      const open = (ctx.illustrationSets ?? []).find((g) => g.id === il.groupId)
      if (!open) errors.push('That illustration set no longer exists — pick another.')
      else if (open.status !== 'open' && open.status !== 'stale') {
        errors.push(`${open.name} is ${open.status} — it cannot take new cards.`)
      } else if (!picks.length) {
        errors.push(`Continuing ${open.name} needs at least one card.`)
      } else if ((open.members?.length ?? 0) + live > (open.plannedSize ?? kind.maxSize)) {
        // Bounded by what was PROMISED, not just by what the kind allows.
        // maxSize alone let a 3-card promise take a fourth card and finish
        // "4/3", which reads as a bug everywhere it is displayed.
        const room = Math.max(0, (open.plannedSize ?? 0) - (open.members?.length ?? 0))
        errors.push(
          `${open.name} promised ${open.plannedSize} cards and already has ${open.members?.length ?? 0}`
          + (room ? ` — room for ${room} more.` : ' — it is already full.'),
        )
      }
    } else {
      if (!il.name?.trim()) errors.push('An illustration set needs a name.')
      if (picks.length > kind.maxSize) errors.push(`A ${kind.noun} holds at most ${kind.maxSize} cards.`)
      const planned = Math.round(il.plannedSize ?? kind.defaultPlannedSize)
      if (planned < kind.minSize || planned > kind.maxSize) {
        errors.push(`A ${kind.noun} runs ${kind.minSize}\u2013${kind.maxSize} cards.`)
      }
      if (picks.length > planned) errors.push(`You picked ${picks.length} cards for a ${kind.noun} of ${planned}.`)
    }
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
  const sigs = (draft.signatureCards ?? []).slice(0, MAX_SIGNATURE_CARDS)

  const counts = new Map(sheet.map((r) => [r.id, 0]))
  // The hand-designed cards sit ABOVE the numbered set now, so they no longer
  // consume body slots: the bulk fill is the whole of `setLength`.
  for (const sig of sigs) counts.set(sig.rarity, (counts.get(sig.rarity) ?? 0) + 1)

  // Unique rarities are excluded from the bulk-fill share — each belongs to
  // exactly the one signature card it was spun off for, so it never dilutes
  // (or is diluted by) the expected count of a shared rarity.
  const nonSecret = sheet.filter((r) => !r.secret && !r.unique && Math.max(0, r.pullWeight) > 0)
  const total = nonSecret.reduce((sum, r) => sum + Math.max(0, r.pullWeight), 0)
  if (total > 0) {
    for (const r of nonSecret) {
      counts.set(r.id, (counts.get(r.id) ?? 0) + length * (Math.max(0, r.pullWeight) / total))
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

// Fold a per-member appeal term over a card's cast: the LEAD in full, every
// supporting member at half, and the whole thing CLAMPED. The card is ABOUT its
// lead — a crowded card is not allowed to farm a flat bonus per name — but a
// supporting credit still has to count for something or naming a second
// character is free and meaningless.
//
// The clamp is the load-bearing half and it was missing: at half a head with no
// ceiling, a card naming fifteen on-theme characters collected +80 art appeal
// and +80 hype, which is exactly the farming the paragraph above forbids.
// castPopBonus was capped from the start; this is the same discipline.
function castWeighted(cast, valueOf, lo, hi) {
  let sum = 0
  cast.forEach((member, i) => { sum += valueOf(member) * (i === 0 ? 1 : 0.5) })
  return clamp(sum, lo, hi)
}

function popFactors(card, draft, theme, sheet, rng, artistOf = getArtist, characters = [], illustrationPop = 0, people = []) {
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

  // Featuring a character bolts on a baseline draw from its accumulated fame —
  // "a new Pikachu card gets built-in demand no matter how it's designed" —
  // scaled up by a richer treatment tier.
  //
  // The whole CAST, not one name. `castIds` is lead-first and falls back to the
  // legacy `characterId`, so a card designed before multi-cast reads exactly as
  // it always did (see cast.js).
  //
  // famePopBonus itself is deliberately untouched, and so are favorMultiplier
  // and saturationMultiplier — castStanding layers on top of all three. That
  // keeps every historical balance number comparable: both multipliers return
  // exactly 1.0 for a character with one form, which is every character in
  // every save that predates the person layer. A change INSIDE famePopBonus
  // would move the whole playtest table at once and hide any real regression
  // underneath it.
  const cast = castMembers(card, characters, people ?? [])
  // Full sum, hard-capped: a genuine team-up out-pulls a solo icon, and five
  // icons on one card still cannot stack into something unbeatable.
  const fameBonus = castPopBonus(cast, card.treatment)
  // Continuity: does this form still read as the character? Scored against what
  // the LINEAGE KIND leads fans to expect, so a fall is meant to break her and a
  // promotion is not. Sized against the +10 an on-theme archetype earns below,
  // so it colours a printing without deciding it.
  // Clamped to a little over one member's own range (-8..+6): a supporting
  // credit colours the read, a crowd of them cannot decide it.
  const continuity = castWeighted(cast, ({ form, person }) => (
    person && form ? continuityVerdict(person, form).appealDelta : 0
  ), -12, 10)
  // A character whose ARCHETYPE matches the set's theme reads as a coherent
  // printing — a frost guardian in a Frostbound set, not a beach episode. The
  // same idea as the artist specialty match above, and deliberately smaller than
  // it (+10 against +20): who is on the card matters less than who drew it.
  // Clamped at 15: an on-theme lead is worth +10, a second on-theme name is
  // worth half of one more, and that is the end of it. Still comfortably under
  // the artist specialty match's +20, which is the band the comment above
  // describes.
  const archetypeMatch = castWeighted(cast, ({ form }) => (
    archetypeMatchesTheme(form.archetypeId, tags) ? 10 : 0
  ), 0, 15)

  // Belonging to a coherent illustration set is worth roughly what an on-theme
  // character is (+10) and rather less than the artist who drew it (+20). It has
  // to stay in that band: an illustrator SUITE is one artist across several
  // cards, and that artist is already collecting the +20 specialty match on
  // every one of them, so a generous group bonus would pay twice for a single
  // decision. See POP_LIFT in illustrationsets.js.
  //
  // Half the lift lands here and half on the card's hype SEED in buildCard,
  // because this line ends in a hard clamp to 100 and the capstone is exactly
  // the card most likely to be sitting on that ceiling already.
  return {
    // `punch` is how loudly this card reads next to its shelfmates — a
    // presentation signal, not a power level. (Name kept: personas.js and
    // events.js read it.)
    punch: clamp(standout + range(rng, -10, 10), 0, 100),
    rarity: rarityTier, // 0–100 collector value tier from the set's sheet
    artAppeal: clamp(artAppeal + fameBonus + archetypeMatch + illustrationPop + continuity, 0, 100),
    hype: clamp(hype + fameBonus + archetypeMatch + illustrationPop + continuity, 0, 100),
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

// The cast fields for a card record, from whichever of the two a spec set.
function castOf(spec) {
  const { characterId, castIds } = withCast(spec)
  return { characterId, castIds }
}

// Build one market-ready card record from a "spec" (id/name/rarity/number + an
// optional designed signature card behind it).
function buildCard(spec, draft, theme, sheet, rng, artistOf, characters = [], lift = null, people = []) {
  const factors = popFactors(spec, draft, theme, sheet, rng, artistOf, characters, lift?.pop ?? 0, people)
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
    // The cast. `characterId` stays the LEAD and `castIds` is lead-first —
    // withCast keeps the two consistent so no reader has to know which was set.
    ...castOf(spec),
    treatment: spec.treatment ?? null,
    serialCap: spec.serialCap ?? null,
    serialIssued: 0,
    graded: false,
    gradedPopulation: 0,
    popFactors: factors,
    sealedPrice: draft.pricePoint,
    singlePrice,
    priceHistory: [singlePrice],
    // The other half of the illustration-set lift (see popFactors above). It
    // rides here rather than in popFactors because this ceiling is ~3, not 100,
    // so it still pays on a capstone whose art appeal is already maxed out.
    hype: (factors.hype / 100) * (draft.prerelease.chasePullable ? 1.3 : 1) * (lift?.hypeMul ?? 1),
    momentum: 0,
  }
}

// Generate the WHOLE set: `setLength` numbered cards distributed across the
// non-secret rarity sheet by pull weight, then the hand-designed signature
// highlights numbered ABOVE the count (keeping their designed name/rarity/art/
// power) — the chase band a real set puts its marquee cards in. Every numbered
// card in the body is themed-random, so any of them — even a humble common —
// can later become a market darling.
//
// The body used to start with the signature cards at 1/N and a separate
// `secretCount` dial padded the above-count band with procedural chase. That
// dial is gone: the cards above the count are the cards the player designed.
// `draft.secretCount` is still READ for a set already on shelves, because
// reprintAsUnlimited rebuilds an entire card pool from the record a released
// set kept — it must reproduce what shipped, not what the builder would make
// today.
// Spec ids: `b1..bN` the numbered body, `s1..sN` any legacy secrets, `c1..cN`
// the hand-designed cards (that prefix is load-bearing — see below).
// `illustrationLift` maps a SPEC id ('c3') to the print-time lift its
// illustration-set membership earns. Keyed by spec rather than card id because
// card ids do not exist until the final map below.
export function generateCards(draft, setId, week, artistOf = getArtist, characters = [], nameStyle = 'creature', illustrationLift = null, people = []) {
  // getTheme returns null for an id it doesn't know (a stale save, a renamed
  // theme). popFactors reads theme.tags unguarded, so fall back the same way
  // blocks.js's mintTreatmentCards already does rather than crash generation.
  const theme = getTheme(draft.themeId) ?? getTheme('dragons')
  const sheet = draft.rarities ?? defaultRaritySheet()
  const rng = makeRng(hashSeed(`${draft.name}:${setId}:${week}`))
  draft = { ...draft, _setId: setId } // buildCard reads _setId

  const length = clamp(Math.round(draft.setLength ?? 60), MIN_SET_LENGTH, MAX_SET_LENGTH)
  const sigs = draft.signatureCards ?? []
  // Unique rarities are excluded from bulk/secret fill — each belongs to
  // exactly the one signature card it was spun off for (see rarities.js's
  // makeUniqueRarity), never a randomly-generated one.
  const nonSecret = sheet.filter((r) => !r.secret && !r.unique && Math.max(0, r.pullWeight) > 0)
  const secretRarities = sheet.filter((r) => r.secret && !r.unique)

  const specs = []

  // WHICH LAYOUT. A set designed today numbers its hand-designed cards ABOVE the
  // count. A set released before that change put them at the FIRST numbers, with
  // the procedural body filling the rest — and reprintAsUnlimited rebuilds an
  // entire card pool from the stored record, so it has to reproduce the layout
  // that set actually shipped with. An older record carries no flag and reads
  // false here, which is what makes an Unlimited run of an old set correct.
  const aboveCount = draft.signaturesAboveCount === true
  const sigCount = Math.min(sigs.length, MAX_SIGNATURE_CARDS)
  // In the legacy layout the signatures consume body slots; in the current one
  // they sit on top of a full-length body.
  const bodyCount = aboveCount ? length : Math.max(0, length - sigCount)

  // A hand-designed card's spec id is ALWAYS `c${i + 1}`, in both layouts —
  // three readers resolve one by its index through `${setId}_c${i + 1}` (the
  // spotlight picker, the illustration-set picks, and the art-notes map). Body
  // cards take `b` so the two can never collide now that both can start at 1.
  const sigSpec = (sig, i, number) => ({
    id: `c${i + 1}`, name: sig.name, rarity: sig.rarity, number,
    artistId: sig.artistId,
    appeal: sig.appeal ?? sig.power, finish: sig.finish, flavorText: sig.flavorText, artNotes: sig.artNotes,
    characterId: sig.characterId ?? null, castIds: castIdsOf(sig), treatment: sig.treatment ?? 'debut',
    serialCap: sig.serialCap ?? null,
    signature: true,
    // Only above the count is a signature card `secret` — that flag means
    // "numbered past the set's own count" everywhere else in the sim.
    secret: aboveCount,
  })

  // 1) The legacy layout puts the hand-designed cards at the first numbers.
  if (!aboveCount) {
    sigs.slice(0, sigCount).forEach((sig, i) => {
      specs.push(sigSpec(sig, i, `${i + 1}/${length}`))
    })
  }

  // 2) The numbered body: themed-random cards, rarity by the set's pull weights.
  //    Bulk cards get a modest random punch so a sleeper can still spike, but
  //    they don't track the loudness dial.
  for (let i = 0; i < bodyCount; i++) {
    const rarityId = nonSecret.length ? pickRarity(nonSecret, rng) : (sheet[0]?.id ?? 'common')
    const num = aboveCount ? i + 1 : sigCount + i + 1
    specs.push({
      id: `b${i + 1}`, name: randomCardName(theme, rng, nameStyle), rarity: rarityId,
      number: `${num}/${length}`,
      appeal: clamp(Math.round(range(rng, 15, 70)), 0, 100), // bulk: low-to-mid, sleepers possible
    })
  }

  // 3) Legacy secret rares. Only a set RELEASED before the secret dial was
  //    retired carries a secretCount, so this reproduces what shipped and mints
  //    nothing for a set designed today.
  const legacySecrets = clamp(Math.round(draft.secretCount ?? 0), 0, MAX_SECRET_CARDS)
  for (let s = 0; s < legacySecrets; s++) {
    const rarityId = secretRarities.length
      ? secretRarities[s % secretRarities.length].id
      : (nonSecret[nonSecret.length - 1]?.id ?? 'rare')
    specs.push({
      id: `s${s + 1}`, name: randomCardName(theme, rng, nameStyle), rarity: rarityId,
      number: `${length + s + 1}/${length}`, secret: true,
      appeal: clamp(Math.round(range(rng, 20, 80)), 0, 100),
    })
  }

  // 4) The current layout puts the hand-designed cards ABOVE the count — the
  //    marquee chase band, past the secrets.
  if (aboveCount) {
    sigs.slice(0, sigCount).forEach((sig, i) => {
      specs.push(sigSpec(sig, i, `${length + legacySecrets + i + 1}/${length}`))
    })
  }

  // 5) Variant printings. A variant is a SECOND card of one the set already
  //    has — same name, same character, same artist — printed with the
  //    variant's own finishes and numbered above the count beside the secrets.
  //    It reprints the rarity's MARQUEE cards (signature highlights first, then
  //    the highest-appeal bulk), because that is which card a real set gives an
  //    alt art to. A variant whose parent rarity drew no cards prints nothing.
  let above = length + legacySecrets + (aboveCount ? sigCount : 0)
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
        castIds: castIdsOf(base),
        flavorText: base.flavorText,
        artNotes: base.artNotes,
        // NOT `finish`: a variant's treatment comes from the variant's own
        // finishes (via its sheet entry), not from the base card's printing.
        variantOf: base.id,
      })
    }
  }

  return specs.map((spec) => buildCard(spec, draft, theme, sheet, rng, artistOf, characters, illustrationLift?.get(spec.id) ?? null, people))
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
  const cost = setCost(draft, artistOf, { illustrationSets: state.illustrationSets, upgrades: state.upgrades, cardDesigns: state.cardDesigns })
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
    const identity = {
      archetypeId: sig.newCharacterArchetype,
      species: sig.newCharacterSpecies,
      hook: sig.newCharacterHook,
      // The cast member this form belongs to, authored rather than inferred.
      // Only set when the card debuts a NEW FORM of somebody already on the
      // roster; a brand-new character leaves it null and derivePeople mints her
      // person from the card face, which is what it has always done.
      personId: (state.people ?? []).some((p) => p.id === sig.newCharacterPersonId)
        ? sig.newCharacterPersonId
        : null,
      // The form's own half: what this appearance of the character is called on
      // the roster, how it carries itself, and whether the card face says the
      // character's name at all. See people.js.
      formName: sig.newFormName,
      demeanorIds: sig.newFormDemeanor,
      carriesName: sig.newFormCarriesName,
    }
    // A new character may grow out of one (or two) already on the roster —
    // Kell, Broken Boy becoming Kell, Royal Soldier. The link is refused if it
    // would close a loop or break the kind's archetype rule; the editor shows the
    // same refusal, so this only bites a stale draft held open across a save
    // load, and then the character still debuts — as a plain new one.
    //
    // Building on a RETIRED form is no longer refused. Retirement closes a path,
    // not a character: a story that went two ways needs the second branch to grow
    // out of the same form the first one did. See validateLineage.
    const parentIds = [sig.newCharacterPromotedFrom, sig.newCharacterSecondParent].filter(Boolean)
    const kindId = sig.newCharacterLineageKind ?? (parentIds.length ? 'promotion' : null)
    const linked = kindId
      ? createLineageCharacter(characters, {
          name: sig.newCharacterName, identity, kindId, parentIds, week: state.week,
          // So the new form debuts off the CHARACTER's recognition, not only its
          // parent form's fame — see createLineageCharacter.
          people: state.people,
        })
      : null
    let created
    if (linked) {
      characters = linked.characters
      created = linked.child
    } else {
      created = createCharacter(sig.newCharacterName, identity)
      characters = [...characters, created]
    }
    // The new character LEADS the card; any cast the player already named on it
    // stays on as support behind her.
    return { ...sig, characterId: created.id, castIds: [created.id, ...castIdsOf(sig).filter((id) => id !== created.id)], treatment: 'debut' }
  })

  draft = { ...draft, signatureCards: resolvedSigs }

  const nameStyle = getConcept(state.config?.conceptId).nameStyle

  // ---- Illustration set, phase A: the print-time lift ---------------------
  // A group's payoff is scored TWICE during a release, and the split is forced
  // by the order things are minted in.
  //
  // Treatment cards and reprints do not exist yet — mintTreatmentCards and
  // applyCardReprints both run further down, after generateCards. So the lift
  // baked into popFactors can only see this release's SIGNATURE cards. That is
  // not merely a workaround: neither of the other two ever goes through
  // popFactors at all. A reprint carries its original's appeal by design, and a
  // treatment card is minted by blocks.js down its own path. There is nothing on
  // either of them to lift.
  //
  // So phase A scores a provisional group from the signature picks (plus the
  // members a continued group already has) and uses it for the appeal and hype
  // bonus. Phase B, after everything is minted, rebuilds the group from ALL the
  // resolved picks and rescores — and that score is the one that is frozen and
  // that the market reads.
  const ilPhaseA = provisionalIllustrationLift(state, draft, setId, characters)
  // The person layer for THIS release is derived before the cards are minted, so
  // a character created moments ago upstairs already carries its favour and
  // saturation into its own debut card's popFactors.
  //
  // BOTH halves of the result are taken, and that matters: derivePeople stamps
  // `personId` onto the forms, and dropping the returned characters left a form
  // minted seconds earlier with a null personId for the rest of the release. Its
  // own debut printing was then charged to nobody, so a brand-new character's
  // first appearance was invisible to saturation.
  const derived = derivePeople({ ...state, characters })
  const peopleAtMint = derived.people
  characters = derived.characters
  const cards = generateCards(draft, setId, state.week, artistOf, characters, nameStyle, ilPhaseA.lift, peopleAtMint)

  // SPC exclusive promo: if the collector-box SKU carries an exclusive promo,
  // mint an SPC-only promo card (unpullable, scarce) that ships with that box.
  //
  // MINTED HERE, before the appearance loop, and not further down beside the
  // treatment cards where it used to sit. It can now carry a CAST (from a
  // library design named on the SKU), and a cast that collects the market
  // premium and the sales lift has to record the printing and be charged the
  // saturation like any other. Minted after the loop, it did neither — which
  // made a collector box the one place you could print your icon every single
  // set and never have the room notice.
  const spc = (draft.products ?? []).find((p) => p.kind === 'spc' && p.exclusivePromo)
  // The box's exclusive can be a card the studio DESIGNED (Studio > Cards,
  // named on the SKU) rather than an auto-minted one. Same doctrine as a pull
  // into a set: this COPIES the design, so editing the library afterwards
  // cannot reach a box already on shelves.
  const spcDesign = spc?.promoDesignId
    ? (state.cardDesigns ?? []).find((d) => d.id === spc.promoDesignId)
    : null
  const promoCards = spc
    ? [makePromoCard(state, {
        label: 'SPC Exclusive', prestige: 0.7, themeId: draft.themeId, nonce: `${setId}_spc`,
        ...(spcDesign ? {
          name: spcDesign.name,
          castIds: castIdsOf(spcDesign),
          artistId: spcDesign.artistId,
          appeal: spcDesign.appeal,
          flavorText: spcDesign.flavorText,
          artNotes: spcDesign.artNotes,
          serialCap: spcDesign.serialCap,
          treatment: spcDesign.treatment,
          fameBonus: castPopBonus(castMembers(spcDesign, characters, peopleAtMint), spcDesign.treatment),
        } : {}),
      })]
    : []

  // Every signature card that features a character (new or existing) records a
  // new appearance — bumps fame, files the debut set on a first printing. Feeds
  // the set builder's next view of fame and, at high fame, the icon treatment slot.
  // The person layer is re-derived first, so a form MINTED above already belongs
  // to a character by the time a printing is recorded against it.
  let people = peopleAtMint
  const formPerson = new Map(characters.map((c) => [c.id, c.personId]))
  const printedFor = new Set()
  for (const card of [...cards, ...promoCards]) {
    // EVERY name on the card, not just the lead. A supporting credit is a real
    // printing of that character — it is what makes a shared appearance worth
    // designing — so it bumps their fame and counts toward their saturation
    // exactly like a solo card does.
    for (const formId of castIdsOf(card)) {
      characters = recordAppearance(characters, formId, {
        cardId: card.id, setId, treatment: card.treatment, popFactors: card.popFactors,
        week: state.week, setName: draft.name,
      })
      // Saturation is per CHARACTER per RELEASE, not per card. A set with three
      // cards of Aryla is one appearance of Aryla to the room, and charging it
      // three times would make an illustration line — the exact thing the game
      // wants you to build — read as overexposure.
      const pid = formPerson.get(formId)
      if (pid && !printedFor.has(pid)) {
        printedFor.add(pid)
        people = recordPersonPrinting(people, pid, { week: state.week })
      }
    }
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
    // DEEP COPIES, not the draft's own arrays. These two used to be assigned by
    // reference, which was harmless only while every draft built its own sheet
    // from scratch. Now a draft can be seeded from — or import — an entry in the
    // studio's standards library, and a reference would make this set ALIAS that
    // entry: renaming a rarity in the Studio afterwards would retroactively
    // rewrite the pull odds, the print cost and the PUBLISHED ODDS of a set
    // already on shelves. A released set is a historical fact, and
    // reprintAsUnlimited proves it has to be — it rebuilds a whole card pool
    // from nothing but this record, and it has to rebuild the set that shipped.
    rarities: cloneSheet(draft.rarities), // the set's rarity sheet (for pricing/packs/display)
    packFormat: cloneFormat(draft.packFormat), // booster structure (slots) for ripping/display
    setLength: draft.setLength,
    // `fromDesignId` is STRIPPED here. carddesigns.js's doctrine is that a pull
    // COPIES and never links, and leaving the id on the released record kept a
    // permanent pointer into the mutable library — one that REMOVE_CARD_DESIGN
    // would dangle, and that reprintAsUnlimited would clone into every Unlimited
    // run. Nothing reads it after release; this makes that true rather than
    // merely current.
    signatureCards: (draft.signatureCards ?? []).map(({ fromDesignId, ...sig }) => sig),
    // 0 for a set designed today; only a save's older sets carry a number, and
    // reprintAsUnlimited needs it to reproduce what actually shipped.
    secretCount: draft.secretCount ?? 0,
    // Likewise: which numbering layout this set actually shipped with.
    signaturesAboveCount: draft.signaturesAboveCount !== false,
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
    // Copied for the same reason as the two above: its rarityIds are keys into
    // this set's sheet, so it is part of the same snapshot.
    godPack: cloneGodPack(draft.godPack),
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
  const spotlightIds = resolveCardPicks(spotlightPicks, { setId, cards, treatmentCards, reprintCards: reprintResult.reprintCards })
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

  // ---- Illustration set, phase B: the real group ---------------------------
  // Everything is minted now, so every pick — signature, treatment card or
  // reprint — resolves to a card that exists. This score is the authoritative
  // one: it is frozen onto the group and it is what the market reads.
  const ilResult = resolveIllustrationSet(state, draft, setId, ilPhaseA.group, {
    setId, cards, treatmentCards, reprintCards: reprintResult.reprintCards,
  }, characters)
  const illustrationSets = ilResult?.illustrationSets ?? null
  // Sealed-demand lift, in the same band and the same place as spotlightAppeal.
  set.illustrationAppeal = ilResult
    ? illustrationAppealFor(setId, ilResult.illustrationSets)
    : 0

  // The set's cover character (if any), resolved once for both the feed line
  // and the launch bump below.
  const cover = draft.coverCharacterId
    ? characters.find((c) => c.id === draft.coverCharacterId) ?? null
    : null

  const feedParts = [
    ilResult
      ? (ilResult.group.status === 'complete'
        ? `${ilResult.group.name} is complete at ${ilResult.group.members.length} cards — collectors are chasing the ${getIllustrationKind(ilResult.group.kindId).noun}, not the card.`
        : `${ilResult.group.name} begins: ${ilResult.group.members.length} of ${ilResult.group.plannedSize} printed, the rest promised.`)
      : null,
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

  // A coherent illustration set is a headline feature of the release, and
  // announcing a run this set does not finish buys extra on top — see
  // announcementBuzz. Both scale with how coherent what shipped actually is.
  const announceBuzz = ilResult
    ? announcementBuzz(ilResult.group, promiseCredibility(state.illustrationSets ?? []))
    : 0
  if (announceBuzz > 0) set.buzz = clamp(set.buzz + announceBuzz, 10, 100)

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

  // The card library (carddesigns.js), in both directions — and neither of them
  // feeds a card, because every placement above already COPIED.
  //
  //   · A card PULLED from the library gets a printing logged against the
  //     design it came from. Display only.
  //   · A card authored HERE, in the builder, is filed back INTO the library as
  //     a new design with that printing already on it. Otherwise the card lived
  //     on the market forever and the studio held no record of it — see
  //     designFromReleasedCard.
  //
  // The two branches are exclusive: a pulled design must never also be filed,
  // or every release would clone the library.
  //
  // Only the SIGNATURE cards. The body (`b1..bN`), the legacy secrets, the
  // variants, the treatment chase and the reprints are all generated rather
  // than authored, and a library of several hundred procedural commons is noise
  // in the one place the player goes to find a card he wrote.
  //
  // `sig` is the RESOLVED card by now (see resolvedSigs above), so a design cut
  // from it carries real roster ids and not a pending `newCharacterName`.
  let cardDesigns = state.cardDesigns ?? []
  // Bounded by what generateCards actually mints, like every other index-based
  // reader here — a 31st signature card would otherwise file a printing against
  // a `${setId}_c31` that does not exist. validateDraft refuses that today, but
  // RELEASE_SET does not re-validate, so a stale draft or the harness reaches it.
  const filedDesigns = []
  ;(draft.signatureCards ?? []).slice(0, MAX_SIGNATURE_CARDS).forEach((sig, i) => {
    const cardId = `${setId}_c${i + 1}`
    if (sig.fromDesignId) {
      cardDesigns = recordPrinting(cardDesigns, sig.fromDesignId, {
        cardId, setId, week: state.week, how: 'set',
      })
    } else {
      filedDesigns.push(designFromReleasedCard(sig, cardId, setId, state.week))
    }
  })
  cardDesigns = [...cardDesigns, ...filedDesigns]
  if (spcDesign && promoCards[0]) {
    cardDesigns = recordPrinting(cardDesigns, spcDesign.id, {
      cardId: promoCards[0].id, setId, week: state.week, how: 'product',
    })
  }

  return {
    set,
    cardDesigns, // state.cardDesigns: pulled designs' printings logged, plus this release's own cards filed in
    existingSets, // state.sets BEFORE appending this release (siblings may be buzz-bumped)
    // The new set's generated cards PLUS treatment chase, reprint instances, SPC promo.
    cards: [...hypedNewCards, ...reprintResult.reprintCards, ...promoCards],
    cashDelta: -cost.total,
    printIntensity,
    newPlayers, // discovery wave to distribute into segments (reducer + harness)
    pendingWave, // a scheduled "wide release" wave from regional staggering, or null
    blocks: blocksPatch, // state.blocks after opening/refreshing this set's block
    characters, // state.characters after recording this release's appearances
    people, // state.people after charging this release's printings to saturation
    block, // the block this set opened or rode (for feed text), null if none
    tier: tier.id,
    // Existing cards softened by card-reprints (null if none fired).
    softenedCards: reprintResult.softenedCards,
    releaseFeed: feedParts.length ? feedParts.join(' ') : null,
    personaSentimentBump, // odds-transparency goodwill bump, or null
    scalperHeatDelta: releaseEventScalperBump || null, // only non-null for a midnight launch
    // state.illustrationSets after opening or extending a group, or null when
    // this release authored none — the reducer keeps the existing array then.
    illustrationSets,
  }
}

// Resolve spotlight picks to concrete card ids in the freshly-minted pool.
// A pick is { kind, ref }:
//   signature — ref is the index into the draft's signatureCards (spec ids are
//               `c${ref+1}`; they are numbered above the set's count)
//   treatment — ref is the index into the block's minted treatment cards
//   reprint   — ref is the index into the resolved reprint instances
// Picks that don't resolve (a signature removed after being spotlit, a
// treatment slot the block didn't end up minting) are silently dropped — the
// player shouldn't pay for, or benefit from, a reveal that has no card.
// Deduped so the same card can't be counted twice toward the reveal curve.
// Renamed from resolveSpotlightIds when illustration sets gained the same
// { kind, ref } pick shape. Two callers now, one resolver: a spotlight reveal
// and an illustration-set membership are the same question ("which real card
// does this pick mean?") asked at two points in the release.
function resolveCardPicks(picks, { setId, cards, treatmentCards, reprintCards }) {
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

// ---- Illustration sets ----------------------------------------------------

// The group a draft is contributing to this release: an existing open one for
// 'continue', or a freshly minted one for 'open'. Null when the draft is not
// authoring a group at all.
function draftGroup(state, draft, setId, week) {
  const spec = draft.illustrationSet
  if (!spec || spec.mode === 'none') return null
  if (spec.mode === 'continue') {
    const open = (state.illustrationSets ?? []).find((g) => g.id === spec.groupId)
    // Guarded rather than trusted: validateDraft rejects a continue against a
    // group that is missing or already finished, but releaseSet is also
    // reachable from the harness and from a stale draft held open across a save
    // load. STALE counts as continuable — see addMembers.
    return open && (open.status === 'open' || open.status === 'stale') ? open : null
  }
  return openGroup(state, spec, setId, week)
}

// Phase A (see the call site in releaseSet). Scores a PROVISIONAL group made of
// whatever the continued group already holds plus this release's signature
// picks, and turns it into a spec-id -> lift map for generateCards.
//
// Returns { lift, group } — `group` is handed back so phase B does not have to
// re-resolve which group is being written to.
function provisionalIllustrationLift(state, draft, setId, characters) {
  const group = draftGroup(state, draft, setId, state.week)
  const lift = new Map()
  if (!group) return { lift, group: null }

  const sheet = draft.rarities ?? defaultRaritySheet()
  const sigs = draft.signatureCards ?? []
  // Only signature picks can be scored here. A ref that is out of range (a
  // signature removed after being picked) is dropped, exactly as a spotlight
  // pick with no card is.
  //
  // Bounded by the same cap generateCards slices to, because a signature past
  // it simply never prints. Left unbounded, phase A scored and lifted a card
  // that phase B would then find missing, so a group could collect a permanent
  // print-time bonus and then fail to exist at all.
  //
  // That bound used to be the SET LENGTH, back when the signatures took the
  // set's first numbers and a micro set's 15-card floor could cut them off.
  // They are numbered above the count now, so the only thing that can drop one
  // is MAX_SIGNATURE_CARDS.
  const printable = Math.min(sigs.length, MAX_SIGNATURE_CARDS)
  const picked = []
  for (const pick of draft.illustrationSet?.picks ?? []) {
    if (pick?.kind !== 'signature') continue
    const i = Number(pick.ref)
    if (!Number.isInteger(i) || i < 0 || i >= printable) continue
    const sig = sigs[i]
    picked.push({
      specId: `c${i + 1}`,
      entry: {
        cardId: `${setId}_c${i + 1}`,
        setId,
        week: state.week,
        artistId: sig.artistId ?? null,
        characterId: sig.characterId ?? null,
        // The whole cast, matching what makeMember records at release. Without
        // it phase A scores relatedCast off the lead alone while the FROZEN
        // group scores it off everyone, so the print-time lift is billed
        // against a cohesion the recorded group does not have.
        castIds: castIdsOf(sig),
        valueTier: getRarity(sheet, sig.rarity).valueTier ?? 0,
        briefMatch: briefMatches(sig.artNotes, group.artBrief),
      },
    })
  }
  if (!picked.length) return { lift, group }

  const provisional = {
    ...group,
    members: [...(group.members ?? []), ...picked.map((p) => p.entry)],
  }
  const { score } = scoreCohesion(provisional, { characters })
  // The capstone is the highest tier across the WHOLE provisional group, so a
  // card continuing a run only takes the crown if it actually out-ranks what
  // has already been printed.
  let topTier = -1
  for (const m of provisional.members) topTier = Math.max(topTier, m.valueTier ?? 0)
  let crowned = false
  // The first pick that REACHES the top tier is the capstone; if none does, an
  // already-printed member keeps the crown and nothing here is crowned.
  //
  // This used to also require that no existing member was at the top tier
  // (`existingTop`, using >=), on the stated grounds that capstoneIdOf breaks a
  // tie toward the already-printed card. It does the opposite: it breaks ties
  // toward the LATER week, so a card printed now at the same top tier takes the
  // crown from one printed earlier. Phase A therefore crowned nobody on a tie
  // while phase B crowned the new card, and the capstone's print lift was
  // silently downgraded to a member's.
  //
  // It bit the CHARACTER RUN kind hardest, which is the one it could least
  // afford to: a run has no ladder requirement, so its members naturally sit at
  // the same rarity and EVERY cross-release continue hit the tie.
  for (const p of picked) {
    const isCapstone = !crowned && (p.entry.valueTier ?? 0) >= topTier
    if (isCapstone) crowned = true
    lift.set(p.specId, groupLift(score, isCapstone, group.kindId))
  }
  return { lift, group }
}

// Phase B. Every resolved pick becomes a real member entry against the cards
// that now exist, the group is rescored, and the full replacement array is
// returned for the reducer. Returns null when the draft authored no group.
function resolveIllustrationSet(state, draft, setId, group, pools, characters) {
  if (!group) return null
  const spec = draft.illustrationSet
  const kind = getIllustrationKind(group.kindId)
  const room = kind.maxSize - (group.members?.length ?? 0)
  if (room <= 0) return null
  // Drop a signature pick whose index is past the end of the draft's signature
  // cards BEFORE resolving. resolveCardPicks maps signature ref i to collector
  // number i+1, and a numbered set has cards at every number — so a stale ref
  // of 99 does not fail to resolve, it silently lands on the BULK card at 100.
  // Phase A already ignores out-of-range refs, so without this the two phases
  // disagree about who is even in the group: phase A scores two members while
  // phase B files three, one of them a randomly generated card the player never
  // picked. (resolveCardPicks itself is left alone — spotlight has always
  // behaved this way and changing it is a separate decision.)
  // Same bound as provisionalIllustrationLift's `printable`, and for the same
  // reason: a pick past what generateCards prints resolves to nothing.
  const sigCount = Math.min((draft.signatureCards ?? []).length, MAX_SIGNATURE_CARDS)
  const usable = (spec.picks ?? []).filter(
    (p) => p?.kind !== 'signature' || (Number.isInteger(Number(p.ref)) && Number(p.ref) >= 0 && Number(p.ref) < sigCount),
  )
  const ids = resolveCardPicks(usable.slice(0, room), pools)
  if (!ids.length) return null

  const all = [...pools.cards, ...pools.treatmentCards, ...pools.reprintCards]
  const byId = new Map(all.map((c) => [c.id, c]))
  const sheet = draft.rarities ?? defaultRaritySheet()
  // artNotes is authored on the DRAFT and never copied onto the card record
  // (buildCard returns twenty-one fields and that is not one of them), so the
  // brief match has to be read back through the signature index. Signature i
  // takes spec id `c${i+1}` and therefore card id `${setId}_c${i+1}` — an
  // exact mapping, unlike matching on name, which a variant printing duplicates.
  const notesByCardId = new Map(
    (draft.signatureCards ?? []).map((sig, i) => [`${setId}_c${i + 1}`, sig.artNotes]),
  )
  const entries = []
  for (const id of ids) {
    const card = byId.get(id)
    if (!card) continue
    entries.push(makeMember(card, {
      setId,
      week: state.week,
      valueTier: getRarity(sheet, card.rarity).valueTier ?? 0,
      briefMatch: briefMatches(notesByCardId.get(id), group.artBrief),
    }))
  }
  if (!entries.length) return null

  const filled = addMembers(group, entries, { characters, week: state.week })
  // A group needs two members to mean anything. One resolved pick on a fresh
  // group is dropped outright rather than left as a one-card group nothing can
  // ever score — validateDraft already refuses this, so it only bites a draft
  // whose other picks all failed to resolve.
  if ((filled.members?.length ?? 0) < 2) return null

  const existing = state.illustrationSets ?? []
  const groups = existing.some((g) => g.id === filled.id)
    ? existing.map((g) => (g.id === filled.id ? filled : g))
    : [...existing, filled]
  return { group: filled, illustrationSets: groups }
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
    // Load-bearing, and absent on every set released before the layout changed —
    // which is exactly the case this reproduces. Without it an old set reprinted
    // with its signature cards renumbered above the count and N extra cards in
    // the pool, so an "Unlimited run of the set that shipped" was neither.
    signaturesAboveCount: original.signaturesAboveCount === true,
    // Cloned, so the reprint's record and the original's are two independent
    // snapshots rather than three aliases of one array (draft -> original set ->
    // reprint set). Nothing edits a released set's sheet today, but an Unlimited
    // run is supposed to be a printing of the set that shipped, and that is only
    // true if it holds its own copy of what shipped.
    rarities: cloneSheet(original.rarities),
    packFormat: cloneFormat(original.packFormat),
    signatureCards: original.signatureCards ?? [],
    prerelease: { enabled: false, chasePullable: false },
  }
  const artistOf = (id) => currentArtist(state, id)
  const nameStyle = getConcept(state.config?.conceptId).nameStyle
  const reprintCards = generateCards(draft, newSetId, state.week, artistOf, state.characters ?? [], nameStyle, null, state.people ?? []).map((c) => ({
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
    // Cloned, so the reprint's record and the original's are two independent
    // snapshots rather than three aliases of one array (draft -> original set ->
    // reprint set). Nothing edits a released set's sheet today, but an Unlimited
    // run is supposed to be a printing of the set that shipped, and that is only
    // true if it holds its own copy of what shipped.
    rarities: cloneSheet(original.rarities),
    packFormat: cloneFormat(original.packFormat),
    // The god pack travels with them. It was simply absent before, and packs.js
    // reads `set.godPack ?? { enabled: true, rarityIds: [] }` for the benefit of
    // sets released before the feature existed — so an Unlimited run of a set
    // the player deliberately shipped with god packs OFF could roll them, and
    // one with a hand-picked combination reverted to "auto: top tier". An
    // Unlimited run is a printing of the set that shipped, and what a god pack
    // of that set contains is part of what shipped.
    godPack: cloneGodPack(original.godPack ?? { enabled: true, rarityIds: [] }),
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

