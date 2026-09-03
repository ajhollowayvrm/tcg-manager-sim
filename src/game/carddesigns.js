// The card library — Studio › Cards.
//
// WHY IT EXISTS. Designing a card used to be something you could only do
// INSIDE a set, as one of that set's signature highlights: the card was born
// owned by a release and died with the draft if you never shipped it. That made
// a card an artefact of set design rather than a thing of its own, which is the
// same mistake the cast used to make (see cast.js) and it is wrong for the same
// reason. A studio designs a card; then it decides where the card goes.
//
// A DESIGN IS NOT A CARD. Nothing in this file reaches the market. A design is
// an authored intention — a name, a look, a hand, a cast — and it becomes a real
// card record exactly three ways:
//
//   1. Pulled into a set you are designing, as a signature highlight.
//   2. Printed on its own, as a promo (promos.js) — no set, tiny supply.
//   3. Attached to a product SKU, shipping in the box as its exclusive.
//
// AND IT GOES THE OTHER WAY. A card authored inside a set — the builder's own
// `+ Add card` — is filed back into the library when that set ships, so the two
// screens hold one idea of what a card is. See designFromReleasedCard.
//
// A PULL COPIES; IT NEVER LINKS. Deliberately the same doctrine studio
// standards already follow (see docs/BRIEF.md): editing a library design must
// not be able to reach a card already on shelves. `printings` records where a
// design went so the panel can say so, and that is the ONLY tie back.
//
// NO RARITY. A rarity belongs to a set's own sheet, and a design belongs to no
// set — so the rarity is chosen when the design is placed, not when it is
// authored. That is also why a design cannot carry a unique rarity: the
// spin-off is an edit to a sheet, and there is no sheet here.

import { castIdsOf, withCast } from './cast.js'
import { clamp } from './simulation.js'
import { getFinish } from './rarities.js'

// Same collision hazard as characters.js's characterId(): a fresh `design_1`
// after a reload would land on top of a design already in the save.
let designSeq = 0
function designId() {
  designSeq += 1
  return `design_${Date.now().toString(36)}_${designSeq}`
}

// A design carries everything a signature card carries EXCEPT the set-scoped
// half (rarity, and the new-character lineage fields, which are resolved at
// release against the roster a release is minting into).
export function createCardDesign(week = 0, opts = {}) {
  const base = {
    id: designId(),
    name: opts.name?.trim() || 'Untitled card',
    artistId: opts.artistId ?? null,
    // 0–100: how much this card stands out on a shelf — the designer's own dial,
    // read by sets.js's cardAppeal exactly as a signature card's is.
    appeal: clamp(Math.round(opts.appeal ?? 50), 0, 100),
    finish: opts.finish ?? 'standard',
    flavorText: opts.flavorText ?? '',
    artNotes: opts.artNotes ?? '',
    // The cast. `characterId` is the lead and `castIds` is lead-first; withCast
    // below keeps them consistent whichever the caller set.
    characterId: opts.characterId ?? null,
    castIds: opts.castIds ?? [],
    treatment: opts.treatment ?? 'debut',
    serialCap: opts.serialCap ?? null,
    createdWeek: week,
    // Where this design has actually been printed: { cardId, setId, week, how }.
    // Display only — a printing is a copy, so nothing here feeds a card record.
    printings: [],
  }
  return withCast(base)
}

// The fields the player may edit after a design exists. An explicit allow-list,
// like reducer.js's UPDATE_CHARACTER: `id`, `createdWeek` and `printings` are
// the record's own bookkeeping and a patch must never reach them.
export const EDITABLE_DESIGN_FIELDS = [
  'name', 'artistId', 'appeal', 'finish', 'flavorText', 'artNotes',
  'characterId', 'castIds', 'treatment', 'serialCap',
]

export function applyDesignPatch(design, patch) {
  const next = { ...design }
  for (const key of EDITABLE_DESIGN_FIELDS) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }
  next.appeal = clamp(Math.round(Number(next.appeal) || 0), 0, 100)
  // Do NOT default a blank name here: this runs on every keystroke, and forcing
  // 'Untitled card' back in makes the field impossible to clear while typing a
  // new one. The blank is guarded at the choke points that actually feed a
  // pressed card — designToSignatureCard and normalizeCardDesign — instead.
  return withCast(next)
}

// Fill the additive fields on a design read back from a save, and drop one that
// cannot be made sound. Returns null for a falsy or id-less record — the
// filter(Boolean) in persistence.js's hydrate is load-bearing on that, exactly
// as it is for normalizeCharacter.
export function normalizeCardDesign(d) {
  if (!d || typeof d !== 'object' || !d.id) return null
  return withCast({
    ...d,
    name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Untitled card',
    artistId: d.artistId ?? null,
    appeal: clamp(Math.round(Number(d.appeal) || 50), 0, 100),
    finish: d.finish ?? 'standard',
    flavorText: d.flavorText ?? '',
    artNotes: d.artNotes ?? '',
    treatment: d.treatment ?? 'debut',
    serialCap: d.serialCap ?? null,
    createdWeek: Number(d.createdWeek) || 0,
    printings: Array.isArray(d.printings) ? d.printings : [],
  })
}

// Turn a design into a signature card for the set builder's draft. A COPY: the
// returned card shares no reference with the design and carries no id back to
// it, so editing the library afterwards cannot reach the draft either.
//
// `rarityId` is the set's, because a design has none of its own.
export function designToSignatureCard(design, n, rarityId = 'rare') {
  return {
    id: `sig_${n}`,
    name: typeof design.name === 'string' && design.name.trim() ? design.name : 'Untitled card',
    rarity: rarityId,
    artistId: design.artistId ?? null,
    appeal: design.appeal ?? 50,
    finish: design.finish ?? 'standard',
    flavorText: design.flavorText ?? '',
    artNotes: design.artNotes ?? '',
    characterId: design.characterId ?? null,
    castIds: [...castIdsOf(design)],
    // A design authors no new character: minting one is a release-time act
    // against the roster the release is building, and the library has no
    // release to hang it on. The picker in the builder still offers it.
    newCharacterName: '',
    newCharacterArchetype: 'unaligned',
    newCharacterSpecies: '',
    newCharacterHook: '',
    newCharacterPromotedFrom: null,
    newCharacterLineageKind: null,
    newCharacterSecondParent: null,
    newFormName: '',
    newFormDemeanor: [],
    newFormCarriesName: true,
    treatment: design.treatment ?? 'debut',
    serialCap: design.serialCap ?? null,
    // Where it came from, for the builder to show a provenance line. Stripped
    // before release — generateCards never reads it.
    fromDesignId: design.id,
  }
}

// The other direction: cut a design OUT of a card a set just shipped.
//
// A card could be authored in two places and only one of them kept it. The set
// builder's `+ Add card` and `✨ Add random` both author a real card, and at
// release the draft is thrown away — so the card lived on the market forever
// and the studio that designed it held no record of it. Reprinting it in a
// later set, putting it in a box or building a character run around it meant
// retyping it from the card browser. The header of this file says a studio
// designs a card and then decides where it goes; that was only true one way
// round.
//
// STILL A COPY, in the same doctrine as designToSignatureCard below it. The
// design is cut from the card at the moment it shipped and carries no id back
// to it, so editing the library afterwards cannot reach the card on shelves.
// The printing is filed straight away, because by definition this design has
// already printed once.
//
// `sig` must be a RESOLVED signature card — the release mints any brand-new
// character a card requested BEFORE generating cards (see sets.js's
// resolvedSigs), so `characterId` and `castIds` are real roster ids by then and
// the `newCharacter*` / `newForm*` half is spent. None of it is copied.
//
// No rarity, for the reason at the top of this file: the set's sheet owns it.
export function designFromReleasedCard(sig, cardId, setId, week = 0) {
  return withCast({
    id: designId(),
    name: sig.name?.trim() || 'Untitled card',
    artistId: sig.artistId ?? null,
    appeal: clamp(Math.round(Number(sig.appeal ?? sig.power) || 50), 0, 100),
    finish: sig.finish ?? 'standard',
    flavorText: sig.flavorText ?? '',
    artNotes: sig.artNotes ?? '',
    characterId: sig.characterId ?? null,
    castIds: [...castIdsOf(sig)],
    treatment: sig.treatment ?? 'debut',
    serialCap: sig.serialCap ?? null,
    createdWeek: week,
    printings: [{ cardId, setId, week, how: 'set' }],
  })
}

// What a standalone printing costs: the artist's commission (the same bill a
// signature card's art runs up) plus a flat plate-and-print charge. A promo run
// is tiny, so the print half is small and the hand is most of it.
export const STANDALONE_PRINT_COST = 12000

export function standaloneCost(design, artistOf, treatmentCostMul = 1) {
  const artist = design.artistId ? artistOf(design.artistId) : null
  // A richer printing finish costs more to produce, exactly as it does in a set
  // (sets.js's `art` reducer). It was omitted here, so the same design was
  // billed for its foil inside a set and given it free as a promo.
  const art = artist ? Math.round(artist.cost * treatmentCostMul * getFinish(design.finish).costMul) : 0
  // THE SAME SURCHARGE A SET PAYS — which this did not previously charge. A set
  // bills `4000 + 60000/cap` (sets.js's `serialization`), scaled by the cap
  // because market.js pays a serialLift of up to 15x for a small one. A flat
  // 4000 made a /1 studio promo the cheapest price multiplier in the game: $16k
  // to print, against $64k for the identical card inside a set.
  const serial = design.serialCap ? Math.round(4_000 + 60_000 / Math.max(1, design.serialCap)) : 0
  return STANDALONE_PRINT_COST + art + serial
}

// File a printing against a design. Display only; see the header.
export function recordPrinting(designs, designId, printing) {
  if (!designId) return designs
  return (designs ?? []).map((d) => (
    d.id === designId ? { ...d, printings: [...(d.printings ?? []), printing] } : d
  ))
}
