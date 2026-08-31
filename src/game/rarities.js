// Rarity system. A set carries its own editable rarity "sheet" — the player can
// rename/add/remove rarities and pick which a set includes, so one set can have a
// "Mega Hyper Rare" another doesn't. Each rarity drives two things:
//
//   pullWeight — relative frequency in a pack (higher = MORE common). A common
//                has a huge weight; a secret rare a tiny one.
//   valueTier  — collector desirability 0–100. This is the COLLECTOR side of a
//                card's value (independent of punch) — a high-tier rarity
//                makes a card worth money even if it's competitively useless.
//   secret     — a "secret rare" sits ABOVE the numbered set count (e.g. 151/150)
//                and is the scarcest chase.
//
// A rarity also carries FINISHES and VARIANTS, and the two answer different
// questions. Finishes are ADDITIVE: every card at the rarity gets all of them
// on the one card (Full Art + Rainbow Foil = one card that is both). A variant
// is a SEPARATE PRINTING: an Alt Art of an Ultra Rare is its own card, with its
// own finishes, its own pull weight, its own value, and its own collector
// number above the set count — the base Ultra Rare still exists beside it.
//
// Cards reference their rarity by id; helpers resolve the id against the set's
// sheet (falling back to the default sheet for safety). A variant's id resolves
// the same way, because expandRaritySheet lifts variants into real sheet
// entries — so packs, odds and displays treat one as just another rarity.

// Ids for player-created rarities. The counter alone is NOT enough: it resets
// to 0 on every page load, so a custom `rar_1` saved in one session collided
// with a fresh `rar_1` created in the next. Timestamp + counter keeps ids
// unique across reloads and within a single tight loop.
let _uid = 0
function rid(base) {
  _uid += 1
  return `${base}_${Date.now().toString(36)}${_uid.toString(36)}`
}

// ---- Finishes ---------------------------------------------------------
// How a card is PRINTED — a presentation/production choice, not a rules one.
// A single card (a hand-designed signature) can carry its own finish; a whole
// RARITY can also carry one or more (see rarity.finishes below) — every card
// printed at that rarity gets it automatically, stacked with anything the
// card's own finish already adds. (Distinct from characters.js's TREATMENTS,
// which price a character's fame, not a printing style.)
export const FINISHES = [
  { id: 'standard', name: 'Standard', appealBonus: 0, costMul: 1, blurb: 'A normal printing.' },
  { id: 'holo', name: 'Holofoil', appealBonus: 6, costMul: 1.1, blurb: 'Foil in the art box — the classic chase look.' },
  { id: 'reverseholo', name: 'Reverse Holo', appealBonus: 4, costMul: 1.05, blurb: 'Foil everywhere EXCEPT the art box. A quiet, common-tier chase.' },
  { id: 'fullart', name: 'Full Art', appealBonus: 12, costMul: 1.35, blurb: 'The art breaks the frame and fills the card.' },
  { id: 'extendedart', name: 'Extended Art', appealBonus: 9, costMul: 1.24, blurb: 'The illustration stretches past the text box, short of a true full art.' },
  { id: 'altart', name: 'Alternate Art', appealBonus: 13, costMul: 1.38, blurb: 'A second, rarer illustration of a card people already own.' },
  { id: 'textured', name: 'Textured Foil', appealBonus: 16, costMul: 1.5, blurb: 'You can feel the art with your thumb.' },
  { id: 'goldetch', name: 'Gold Etch', appealBonus: 20, costMul: 1.8, blurb: 'Etched gold. Unmistakable in a binder.' },
  { id: 'etchedfoil', name: 'Etched Foil', appealBonus: 10, costMul: 1.28, blurb: 'A fine etched-line foil pattern, quieter than gold etch.' },
  { id: 'rainbow', name: 'Rainbow Foil', appealBonus: 14, costMul: 1.4, blurb: 'Every color at once. Loud, and everyone knows what it means in a binder.' },
  { id: 'prism', name: 'Prism Rare', appealBonus: 10, costMul: 1.25, blurb: 'A faceted foil pattern that throws light in every direction.' },
  { id: 'cosmos', name: 'Cosmos Holo', appealBonus: 8, costMul: 1.2, blurb: 'A starfield foil texture across the whole card face.' },
  { id: 'galaxy', name: 'Galaxy Foil', appealBonus: 9, costMul: 1.22, blurb: 'Swirling nebula-pattern foil — a step up from cosmos.' },
  { id: 'kaleidoscope', name: 'Kaleidoscope Foil', appealBonus: 12, costMul: 1.32, blurb: 'A shifting geometric foil pattern, different from every angle.' },
  { id: 'crackedice', name: 'Cracked Ice Foil', appealBonus: 7, costMul: 1.18, blurb: 'A shattered-glass foil texture over the full card.' },
  { id: 'checkerboard', name: 'Checkerboard Foil', appealBonus: 6, costMul: 1.12, blurb: 'A classic alternating foil/non-foil checker texture.' },
  { id: 'shadowless', name: 'Shadowless', appealBonus: 7, costMul: 1.15, blurb: 'An early-print quirk collectors specifically hunt for.' },
  { id: 'firstedition', name: '1st Edition Stamp', appealBonus: 11, costMul: 1.3, blurb: 'A stamped mark of the very first print run.' },
  { id: 'goldstar', name: 'Gold Star', appealBonus: 18, costMul: 1.7, blurb: 'A rare gold-starred variant. One of the biggest grails there is.' },
  { id: 'silverfoil', name: 'Silver Foil', appealBonus: 5, costMul: 1.1, blurb: 'A cooler, quieter cousin of standard holo.' },
  { id: 'staplefoil', name: 'Staple Foil', appealBonus: 8, costMul: 1.2, blurb: 'The name and stat line foiled, the art left alone.' },
  { id: 'diecut', name: 'Die-Cut Shape', appealBonus: 15, costMul: 1.6, blurb: 'Cut to the shape of the art. Expensive, unmistakable on a shelf.' },
]

export function getFinish(id) {
  return FINISHES.find((f) => f.id === id) ?? FINISHES[0]
}

// The combined effect of stacking several finishes on one card (a signature's
// own pick plus its rarity's blanket finishes, or several finishes assigned
// to one rarity at once). Diminishing returns on appeal — ranked strongest
// first, each extra one contributing less — so ten stacked treatments don't
// dwarf one well-chosen one; cost compounds multiplicatively (each treatment
// really is its own extra production step).
export function combinedFinishEffect(ids = []) {
  const finishes = [...new Set(ids)]
    .map(getFinish)
    .filter((f) => f.id !== 'standard')
  if (!finishes.length) return { appealBonus: 0, costMul: 1 }
  const ranked = [...finishes].sort((a, b) => b.appealBonus - a.appealBonus)
  const appealBonus = Math.round(ranked.reduce((sum, f, i) => sum + f.appealBonus * 0.6 ** i, 0))
  const costMul = finishes.reduce((mul, f) => mul * f.costMul, 1)
  return { appealBonus, costMul }
}

// The default sheet a new set starts from. The player edits a copy of this.
// An 8-tier chase ladder in the vein of the current Pokémon TCG: Common through
// Rare are the accessible base, Double Rare/Ace Spec are the first real chase,
// Illustration Rare/Special Illustration Rare are the art-chase tier, and Hyper
// Rare is the top gold grail (the only tier numbered above the set count).
export function defaultRaritySheet() {
  return [
    { id: 'common', name: 'Common', pullWeight: 100, valueTier: 5, secret: false, finishes: [] },
    { id: 'uncommon', name: 'Uncommon', pullWeight: 50, valueTier: 15, secret: false, finishes: [] },
    { id: 'rare', name: 'Rare', pullWeight: 20, valueTier: 32, secret: false, finishes: [] },
    { id: 'dbl', name: 'Double Rare', pullWeight: 6, valueTier: 50, secret: false, finishes: ['holo'] },
    { id: 'ace', name: 'Ace Spec', pullWeight: 1.2, valueTier: 62, secret: false, finishes: ['holo'] },
    { id: 'ir', name: 'Illustration Rare', pullWeight: 0.6, valueTier: 74, secret: false, finishes: ['fullart'] },
    { id: 'sir', name: 'Special Illustration Rare', pullWeight: 0.18, valueTier: 88, secret: false, finishes: ['fullart', 'rainbow'] },
    { id: 'hyper', name: 'Hyper Rare', pullWeight: 0.05, valueTier: 97, secret: true, finishes: ['goldetch'] },
  ]
}

// A blank custom rarity for the editor's "add rarity" button.
export function makeRarity(name = 'New Rarity') {
  return { id: rid('rar'), name, pullWeight: 10, valueTier: 50, secret: false, finishes: [], variants: [] }
}

// ---- Unique (per-signature-card) rarities ---------------------------------
// A signature card defaults to whatever rarity it's assigned — no separate
// storage needed, since everything downstream resolves the card's rarity id
// live against the sheet. Only when the player customizes a card's pull
// rate/value/secret/finishes does it need a rarity of its own: a normal sheet
// entry, cloned from the rarity it was picked from, but flagged `unique` and
// scoped to that one card so nothing else can land on it (see the `unique`
// filters in sets.js's bulk/random rarity pools).

// Clone `base`'s characteristics into a new one-card rarity. `label` is the
// card's own name, so the entry reads e.g. "Emberwing (Unique)" everywhere a
// rarity name is shown (pack odds, card frame). `derivedFrom` remembers what
// it was cloned from, so the card can revert to sharing that rarity again.
export function makeUniqueRarity(base, label) {
  return {
    id: rid('uniq'),
    name: `${label || 'Signature card'} (Unique)`,
    pullWeight: base?.pullWeight ?? 10,
    valueTier: base?.valueTier ?? 50,
    secret: base?.secret ?? false,
    finishes: [...(base?.finishes ?? [])],
    unique: true,
    derivedFrom: base?.id ?? null,
  }
}

// Join a freshly spun-off unique rarity to every slot its base rarity is
// already in — the same "a new chase card must be pullable somewhere" idea
// as syncFormatWithVariants, but a one-shot call at spin-off time rather than
// a standing reconciliation pass.
export function syncFormatWithUniqueRarity(format, baseId, newId) {
  const slots = format?.slots ?? []
  if (!slots.length) return format
  return {
    ...format,
    slots: slots.map((slot) =>
      (slot.rarityIds ?? []).includes(baseId)
        ? { ...slot, rarityIds: [...slot.rarityIds, newId] }
        : slot,
    ),
  }
}

// Strip one rarity id out of every slot — used both when a customized card
// reverts to a shared rarity and when a customized card is removed outright,
// so its one-off rarity never lingers as an orphaned, unpullable sheet row.
export function pruneRarityFromFormat(format, rarityId) {
  const slots = format?.slots ?? []
  if (!slots.length) return format
  return {
    ...format,
    slots: slots.map((slot) =>
      (slot.rarityIds ?? []).includes(rarityId)
        ? { ...slot, rarityIds: slot.rarityIds.filter((id) => id !== rarityId) }
        : slot,
    ),
  }
}

// The most cards one variant may print. A variant card is numbered above the
// set count, so without a ceiling a player could quietly triple the set's real
// size and the completionist maths behind it.
export const MAX_VARIANT_COUNT = 20

// A blank variant printing for the editor's "add variant" button. Defaults sit
// deliberately BELOW its parent on pull weight and ABOVE it on value: a variant
// that is neither rarer nor more wanted than its base printing has no reason to
// exist, and starting it that way makes the point without a tooltip.
export function makeVariant(parent, name = 'Alt Art') {
  return {
    id: rid('var'),
    name,
    pullWeight: Math.round(Math.max(0, parent?.pullWeight ?? 1) * 0.15 * 1000) / 1000,
    valueTier: Math.min(100, (parent?.valueTier ?? 50) + 8),
    count: 3,
    finishes: [...(parent?.finishes ?? [])],
  }
}

// One variant as a full sheet entry. `secret` is true because a variant IS
// numbered above the set count — that flag is what the rest of the game reads
// to mean "above the count, and a chase", and both are true here.
function expandVariant(parent, variant) {
  return {
    id: variant.id,
    name: `${parent.name} · ${variant.name}`,
    pullWeight: Math.max(0, variant.pullWeight ?? 0),
    valueTier: variant.valueTier ?? parent.valueTier,
    secret: true,
    finishes: variant.finishes ?? [],
    variantOf: parent.id,
    variantName: variant.name,
    variantCount: Math.max(0, Math.round(variant.count ?? 0)),
  }
}

// The authored sheet flattened into the list packs, odds and the slot picker
// actually draw from: every rarity, each followed by its own variants. The
// nested form is what a set STORES (and what the editor edits); this is what
// everything downstream reads, so a variant needs no special case to be
// pullable, priced, or shown in the odds table.
export function expandRaritySheet(sheet) {
  const out = []
  for (const r of sheet ?? []) {
    out.push(r)
    for (const v of r.variants ?? []) out.push(expandVariant(r, v))
  }
  return out
}

// How much more a variant is worth than the base printing it reprints, from the
// one thing that actually drives an alt-art premium in a real hobby: it is
// RARER than the card it reprints. Nothing else in the sim reads this. A
// variant's value tier and finishes only nudge the price seed (a few percent),
// so before this a 6×-rarer Alt Art traded at 1.02× the base copy — the chase
// card the player designed was worth the same as the thing it was chasing.
//
// The exponent softens the ratio hard: 7× rarer is ~3× the price, not 7×. That
// matches how alt arts actually trade, and it keeps a player who sets a
// near-zero pull weight from minting an infinitely valuable card. A variant no
// rarer than its base earns no premium at all, which is the honest answer —
// if everyone has one, it is not a chase.
export function variantScarcityPremium(sheet, rarityId) {
  const entry = getRarity(sheet, rarityId)
  if (!entry.variantOf) return 1
  const parent = getRarity(sheet, entry.variantOf)
  const mine = Math.max(0.0001, entry.pullWeight)
  const theirs = Math.max(0.0001, parent.pullWeight)
  const ratio = theirs / mine
  if (ratio <= 1) return 1
  return Math.min(12, ratio ** 0.55)
}

// What PRINTING a card is, for anything that lists cards next to each other.
// A variant shares its base card's NAME by design — an Alt Art of Emberwing is
// Emberwing — so a price list that shows names alone shows the same card twice
// at two prices with nothing to tell them apart. Every card row needs this.
//
// Returns the parent rarity's name plus, for a variant, the variant's own name
// on its own ("Alt Art", not "Rare · Alt Art") so a row can badge it compactly.
export function printingOf(sheet, rarityId) {
  const entry = getRarity(sheet, rarityId)
  if (!entry.variantOf) return { rarityName: entry.name, variantName: null, isVariant: false }
  const parent = getRarity(sheet, entry.variantOf)
  return { rarityName: parent.name, variantName: entry.variantName ?? entry.name, isVariant: true }
}

// Keep the booster format honest about a sheet that has changed under it. Two
// things go stale, and both are silent:
//
//   A new variant is in no slot, so it reads "not in this pack" in the odds
//   panel and never pulls — the player authored a chase card that cannot be
//   chased. It joins every slot its PARENT is in, which is what "an Alt Art of
//   a Rare" means: pullable wherever a Rare is.
//
//   A deleted rarity leaves its id behind in the slots. Harmless to the draw
//   (drawSlotRarity ignores ids the set has no cards for) but it makes the slot
//   editor lie about what a slot contains.
//
// A variant the player has since removed from every slot ON PURPOSE stays
// removed: only a variant in NO slot at all is treated as new.
export function syncFormatWithVariants(format, sheet) {
  const slots = format?.slots ?? []
  if (!slots.length) return format
  const live = new Set(expandRaritySheet(sheet).map((r) => r.id))
  const inAnySlot = new Set(slots.flatMap((s) => s.rarityIds ?? []))

  let changed = false
  const next = slots.map((slot) => {
    const ids = (slot.rarityIds ?? []).filter((id) => live.has(id))
    const add = []
    for (const { parent, entry } of variantEntries(sheet)) {
      if (!inAnySlot.has(entry.id) && ids.includes(parent.id)) add.push(entry.id)
    }
    if (add.length || ids.length !== (slot.rarityIds ?? []).length) changed = true
    return add.length ? { ...slot, rarityIds: [...ids, ...add] } : { ...slot, rarityIds: ids }
  })
  return changed ? { ...format, slots: next } : format
}

// Just the variant entries, parent included — generateCards needs the pairing
// to know which cards a variant reprints.
export function variantEntries(sheet) {
  const out = []
  for (const r of sheet ?? []) {
    for (const v of r.variants ?? []) out.push({ parent: r, variant: v, entry: expandVariant(r, v) })
  }
  return out
}

// Resolve a rarity id against a sheet; fall back to a neutral mid rarity so a
// missing/renamed id never crashes pricing or display.
export function getRarity(sheet, id) {
  const list = sheet ?? []
  const direct = list.find((r) => r.id === id)
  if (direct) return direct
  // A card printed as a variant carries the VARIANT's id, which lives nested
  // under its parent rather than at the top level of an authored sheet. Resolve
  // it to the same expanded entry packs and odds see, so a variant card's
  // finishes and value tier read correctly wherever a sheet is passed raw.
  for (const r of list) {
    const v = (r.variants ?? []).find((x) => x.id === id)
    if (v) return expandVariant(r, v)
  }
  return { id, name: id, pullWeight: 10, valueTier: 40, secret: false, finishes: [] }
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

// Map a rarity (by id, against a sheet) to one of six VISUAL tiers the UI knows
// how to foil/colour: common / uncommon / rare / ultra / illustration / mythic.
// Custom or renamed rarities still render sensibly, bucketed by their valueTier
// (and secrets always read as the top 'mythic' tier).
export function visualTier(sheet, id) {
  const r = getRarity(sheet, id)
  if (r.secret || r.valueTier >= 91) return 'mythic'
  if (r.valueTier >= 69) return 'illustration'
  if (r.valueTier >= 45) return 'ultra'
  if (r.valueTier >= 25) return 'rare'
  if (r.valueTier >= 12) return 'uncommon'
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
const D = { common: 'common', uncommon: 'uncommon', rare: 'rare', dbl: 'dbl', ace: 'ace', ir: 'ir', sir: 'sir', hyper: 'hyper' }

// Named pack templates the builder offers as a starting point. Each yields a
// fresh format object (slots are cloned so editing one set never mutates another).
export const PACK_PRESETS = [
  {
    id: 'classic', name: 'Classic', blurb: '7 common · 2 uncommon · 1 hit (rare→hyper)',
    build: () => ({
      preset: 'classic',
      slots: [
        { id: rid('slot'), count: 7, rarityIds: [D.common], escalate: false },
        { id: rid('slot'), count: 2, rarityIds: [D.uncommon], escalate: false },
        { id: rid('slot'), count: 1, rarityIds: [D.rare, D.dbl, D.ace, D.ir, D.sir, D.hyper], escalate: true },
      ],
    }),
  },
  {
    id: 'premium', name: 'Premium', blurb: '5 common · 3 uncommon · 2 hits (double rare→hyper)',
    build: () => ({
      preset: 'premium',
      slots: [
        { id: rid('slot'), count: 5, rarityIds: [D.common], escalate: false },
        { id: rid('slot'), count: 3, rarityIds: [D.uncommon], escalate: false },
        { id: rid('slot'), count: 2, rarityIds: [D.dbl, D.ace, D.ir, D.sir, D.hyper], escalate: true },
      ],
    }),
  },
  {
    id: 'jumbo', name: 'Jumbo', blurb: '10 common · 4 uncommon · 1 guaranteed illustration+',
    build: () => ({
      preset: 'jumbo',
      slots: [
        { id: rid('slot'), count: 10, rarityIds: [D.common], escalate: false },
        { id: rid('slot'), count: 4, rarityIds: [D.uncommon], escalate: false },
        { id: rid('slot'), count: 1, rarityIds: [D.ir, D.sir, D.hyper], escalate: true },
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

// A blank slot for the editor's "add slot" button. `iconOnly` reserves the
// slot for cards featuring an icon-status character (see characters.js) — a
// no-op until the set actually has one, at which point it's the dedicated
// alt-art/foil chase slot for that character.
export function makePackSlot() {
  return { id: rid('slot'), count: 1, rarityIds: [], escalate: false, iconOnly: false }
}

// Slots authored before they carried ids (presets, older drafts) get one
// assigned on the way into the editor. React needs a stable key per row:
// keying by array index meant removing a middle slot shifted every later slot
// while React reused the DOM nodes by position, so focus and caret state landed
// on the wrong row.
export function withSlotIds(format) {
  if (!format?.slots?.length) return format
  if (format.slots.every((s) => s.id)) return format
  return { ...format, slots: format.slots.map((s) => (s.id ? s : { ...s, id: rid('slot') })) }
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
const HIT_RARITY_IDS = new Set(['dbl', 'ace', 'ir', 'sir', 'hyper'])

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

// The weight one rarity carries in a slot's draw — shared by the REAL draw
// (packs.js) and the odds panel below, so a published "these are the odds"
// claim can never drift from what actually pulls. An escalating (chase) slot
// compresses pullWeight toward equal (sqrt), biasing toward the rarer end
// without inverting the natural ordering.
export function slotWeightOf(rarity, escalate) {
  return escalate ? Math.max(0.0001, rarity.pullWeight) ** 0.5 : Math.max(0, rarity.pullWeight)
}

// Derive the REAL per-slot and per-pack pull odds from a set's rarity sheet +
// pack format — nothing here is authored separately, so there's no odds data
// to go stale. Returns:
//   { packSize, slots: [{ index, count, escalate, breakdown:[{rarityId,name,prob}] }],
//     perRarity: [{ rarityId, name, probAtLeastOnePerPack, oddsOneIn }] }
// `prob` is the chance a single card drawn FROM THAT SLOT is the given rarity.
// `probAtLeastOnePerPack` is the chance at least one copy of that rarity shows
// up anywhere in the whole pack (independent draws across slots/counts).
export function computePackOdds(sheet, format) {
  const slots = format?.slots ?? []
  const perSlot = slots.map((slot, index) => {
    const ids = new Set(slot.rarityIds ?? [])
    const pool = sheet.filter((r) => ids.has(r.id))
    const usable = pool.length ? pool : sheet
    const total = usable.reduce((s, r) => s + slotWeightOf(r, slot.escalate), 0)
    const breakdown = usable.map((r) => ({
      rarityId: r.id,
      name: r.name,
      prob: total > 0 ? slotWeightOf(r, slot.escalate) / total : 0,
    }))
    return { index, count: Math.max(0, Math.round(slot.count || 0)), escalate: !!slot.escalate, breakdown }
  })

  const perRarity = sheet.map((r) => {
    let probNone = 1
    for (const s of perSlot) {
      const hit = s.breakdown.find((b) => b.rarityId === r.id)
      const p = hit ? hit.prob : 0
      probNone *= (1 - p) ** s.count
    }
    const probAtLeastOnePerPack = 1 - probNone
    const oddsOneIn = probAtLeastOnePerPack > 0 ? Math.round(1 / probAtLeastOnePerPack) : Infinity
    return { rarityId: r.id, name: r.name, probAtLeastOnePerPack, oddsOneIn }
  })

  return { packSize: packSize(format), slots: perSlot, perRarity }
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
  for (const r of sheet) {
    for (const v of r.variants ?? []) {
      if (!v.name.trim()) errors.push(`A variant of ${r.name || 'a rarity'} needs a name.`)
      if (Math.round(v.count ?? 0) < 1) {
        errors.push(`${r.name} · ${v.name || 'variant'} prints 0 cards — set a count or remove it.`)
      }
      if (Math.round(v.count ?? 0) > MAX_VARIANT_COUNT) {
        errors.push(`${r.name} · ${v.name || 'variant'} prints more than ${MAX_VARIANT_COUNT} cards.`)
      }
    }
  }
  return errors
}
