// Studio standards — named rarity sheets and booster formats the player authors
// ONCE and imports into any set, plus blueprints that pin a known-good pair.
//
// The two things this file exists to make reusable were always first-class
// editable objects; they were just scoped to one draft. createDraft seeds
// `rarities` from defaultRaritySheet() and `packFormat` from the Classic preset
// every single time, so a chase sheet tuned over ten minutes for set 4 had to be
// rebuilt from memory for set 5. PACK_PRESETS (rarities.js) is already a named,
// cloning, importable format library — it simply isn't authorable. This is that
// library, opened up, and the same idea applied to the sheet.
//
// FOUR RULES SHAPE EVERYTHING BELOW.
//
//   1. IMPORT COPIES, IT DOES NOT LINK. releaseSet stores `rarities:
//      draft.rarities` and `packFormat: draft.packFormat` by REFERENCE, which is
//      harmless today only because every draft gets a freshly built sheet. Hand a
//      draft a shared array and the released set aliases the library entry, so
//      renaming a rarity in the Studio would retroactively rewrite the pull odds,
//      the print cost and the published odds of every set already shipped.
//      reprintAsUnlimited makes a third alias of the same arrays when it rebuilds
//      a card pool from a stored set record, which is the proof that a released
//      set has to stay a self-sufficient historical fact. So everything that
//      crosses in or out of a standard goes through cloneSheet/cloneFormat.
//
//   2. RARITY IDS ARE KEPT, NEVER RE-MINTED. Every lookup in the game is
//      getRarity(set.rarities, card.rarity), scoped to one set — `common` and
//      `sir` are already shared across every set ever printed, so ids do not need
//      to be globally unique. Keeping them is precisely what lets a booster
//      format authored against one sheet resolve against another.
//
//   3. FOUR THINGS REFERENCE THE SHEET BY ID, not one. The pack format's slots,
//      the god pack's picks, each signature card's rarity (and a unique rarity's
//      `derivedFrom`), and an anniversary reprint's upgrade target. Nothing in
//      the game validates that any of them resolve — a format whose every slot
//      names a rarity that does not exist passes release validation cleanly and
//      then lies in the odds table. Reconciling all four is the whole job of
//      checkStandardFit/applyStandard.
//
//   4. A STANDARD HOLDS NO `unique` RARITIES. Those are spun off from one
//      signature card and are filtered out of the shared sheet at every site that
//      touches it. They belong to the draft, so an import has to merge the
//      draft's own back in before reconciling — see applyStandard.
//
// Costs nothing to define and nothing to hold, deliberately. A live block is
// charged upkeep because it is a standing commitment; a rarity sheet is a design
// document that confers no mechanical advantage, only convenience, so there is
// no dominant strategy here to price against.

import {
  rid,
  getRarity,
  expandRaritySheet,
  syncFormatWithVariants,
  withSlotIds,
  defaultRaritySheet,
  defaultPackFormat,
  validateRaritySheet,
  validatePackFormat,
} from './rarities.js'

// Kind id -> the top-level state array it lives in. The reducer's SAVE_STANDARD
// and DELETE_STANDARD are one shared body over this map rather than six
// near-identical cases, the way the grading-partner actions already are.
// THESE KIND IDS REACH THE SAVE (through nothing today, but a stored blueprint
// names them in error messages) — treat them as permanent.
export const STANDARD_KINDS = {
  raritySheet: 'raritySheets',
  packFormat: 'packFormats',
  blueprint: 'blueprints',
}

export const MAX_STANDARD_NAME = 48
export const MAX_STANDARD_NOTE = 160

// ---- Copying ---------------------------------------------------------------

// Field-by-field rather than structuredClone, because being explicit makes this
// a NORMALISER as well as a copy: a sheet arriving from an imported save, or
// from a standard authored before a field existed, comes out with every field
// present and of the right type. validateRaritySheet calls `r.name.trim()` with
// no guard at all, so a rarity that reached it without a name would throw on the
// release button rather than fail validation.
export function cloneSheet(sheet) {
  // Array.isArray rather than `?? []`: hydrate runs inside loadState's try, so a
  // corrupt record that THROWS here discards the entire save instead of the one
  // bad entry — the exact opposite of what the normalisers' filter(Boolean) is
  // for. Same reasoning for `finishes` and `variants` below.
  if (!Array.isArray(sheet)) return []
  return sheet.filter(Boolean).map((r) => {
    const out = {
      id: String(r.id ?? rid('rar')),
      name: String(r.name ?? ''),
      pullWeight: Number(r.pullWeight) || 0,
      valueTier: Number(r.valueTier) || 0,
      secret: !!r.secret,
      finishes: (Array.isArray(r.finishes) ? r.finishes : []).map(String),
      variants: (Array.isArray(r.variants) ? r.variants : []).filter(Boolean).map((v) => ({
        id: String(v.id ?? rid('var')),
        name: String(v.name ?? ''),
        pullWeight: Number(v.pullWeight) || 0,
        valueTier: Number(v.valueTier) || 0,
        count: Math.max(0, Math.round(Number(v.count) || 0)),
        finishes: (Array.isArray(v.finishes) ? v.finishes : []).map(String),
      })),
    }
    // Carried only when present, so a shared sheet never grows the two keys that
    // mean "this rarity belongs to one card". A standard is built from a sheet
    // with the uniques already filtered out; a DRAFT's sheet goes through here
    // too, and there they must survive.
    if (r.unique) {
      out.unique = true
      out.derivedFrom = r.derivedFrom ?? null
    }
    return out
  })
}

export function cloneFormat(format) {
  const raw = Array.isArray(format?.slots) ? format.slots : []
  const slots = raw.filter(Boolean).map((s) => ({
    id: String(s.id ?? rid('slot')),
    count: Math.max(0, Math.round(Number(s.count) || 0)),
    rarityIds: [...new Set((Array.isArray(s.rarityIds) ? s.rarityIds : []).map(String))],
    escalate: !!s.escalate,
    iconOnly: !!s.iconOnly,
  }))
  return { preset: format?.preset ?? null, slots }
}

export function cloneGodPack(godPack) {
  return {
    enabled: godPack?.enabled ?? true,
    rarityIds: [...new Set((Array.isArray(godPack?.rarityIds) ? godPack.rarityIds : []).map(String))],
  }
}

// ---- Records ---------------------------------------------------------------

// Ids use rid()'s timestamp scheme, NOT the `set_${n+1}` / `block_${n+1}` length
// scan. A length scan is authoritative only for something minted BY a state
// write, where what exists is the whole truth. A standard is authored in a panel
// before any write and rid()'s own comment describes exactly this hazard: the
// counter resets on page load, so two sessions both mint a `_1`.

export function makeRaritySheetStandard(name, sheet, week = 1) {
  return {
    id: rid('rsheet'),
    name: cleanName(name, 'Rarity sheet'),
    note: '',
    // Uniques are per-card and never travel with a shared sheet — rule 4.
    sheet: cloneSheet(sheet ?? defaultRaritySheet()).filter((r) => !r.unique),
    createdWeek: week,
    isDefault: false,
  }
}

export function makePackFormatStandard(name, format, godPack, week = 1) {
  return {
    id: rid('pfmt'),
    name: cleanName(name, 'Booster format'),
    note: '',
    format: withSlotIds(cloneFormat(format ?? defaultPackFormat())),
    // The god pack rides HERE rather than standing on its own: its `rarityIds`
    // are foreign keys into a sheet, and "what fills a god pack" is meaningless
    // apart from the pack it is a god version of.
    godPack: cloneGodPack(godPack),
    createdWeek: week,
    isDefault: false,
  }
}

export function makeBlueprint(name, sheetId, formatId, week = 1) {
  return {
    id: rid('blueprint'),
    name: cleanName(name, 'Set blueprint'),
    note: '',
    sheetId: sheetId ?? null,
    formatId: formatId ?? null,
    createdWeek: week,
    isDefault: false,
  }
}

function cleanName(name, fallback) {
  return String(name ?? '').trim().slice(0, MAX_STANDARD_NAME) || fallback
}

// ---- Normalisers (hydrate) -------------------------------------------------
//
// Each returns null for a record that cannot be made sound, and hydrate() drops
// those with .filter(Boolean). That filter is load-bearing for the reason
// persistence.js already gives for characters: importSave validates the version
// and nothing else, so one malformed entry in an imported array otherwise
// survives into state and throws the first time a panel renders it.

export function normalizeRaritySheetStandard(std) {
  if (!std?.id) return null
  const sheet = cloneSheet(std.sheet).filter((r) => !r.unique)
  // A sheet the game would refuse to release is worse than no sheet: it would
  // sit in the library looking importable and then block the release button.
  if (validateRaritySheet(sheet).length) return null
  return {
    id: String(std.id),
    name: cleanName(std.name, 'Rarity sheet'),
    note: String(std.note ?? '').slice(0, MAX_STANDARD_NOTE),
    sheet,
    createdWeek: Number(std.createdWeek) || 1,
    isDefault: !!std.isDefault,
  }
}

export function normalizePackFormatStandard(std) {
  if (!std?.id) return null
  // withSlotIds is what gives a slot authored before ids existed (a preset, an
  // older save) the stable React key the editor needs. It was exported and
  // called nowhere; this is the load-time normaliser it was written for.
  const format = withSlotIds(cloneFormat(std.format))
  if (validatePackFormat(format).length) return null
  return {
    id: String(std.id),
    name: cleanName(std.name, 'Booster format'),
    note: String(std.note ?? '').slice(0, MAX_STANDARD_NOTE),
    format,
    godPack: cloneGodPack(std.godPack),
    createdWeek: Number(std.createdWeek) || 1,
    isDefault: !!std.isDefault,
  }
}

// `ctx` carries the live standard ids, so a blueprint cannot keep pointing at a
// sheet the player has since deleted — the same defence normalizeIllustrationSet
// applies with the live card ids.
export function normalizeBlueprint(bp, ctx = {}) {
  if (!bp?.id) return null
  const sheetIds = ctx.sheetIds ?? null
  const formatIds = ctx.formatIds ?? null
  const sheetId = bp.sheetId && (!sheetIds || sheetIds.has(bp.sheetId)) ? String(bp.sheetId) : null
  const formatId = bp.formatId && (!formatIds || formatIds.has(bp.formatId)) ? String(bp.formatId) : null
  // A blueprint that pins nothing is not a blueprint. Dropped rather than kept
  // as an empty row that does nothing when applied.
  if (!sheetId && !formatId) return null
  return {
    id: String(bp.id),
    name: cleanName(bp.name, 'Set blueprint'),
    note: String(bp.note ?? '').slice(0, MAX_STANDARD_NOTE),
    sheetId,
    formatId,
    createdWeek: Number(bp.createdWeek) || 1,
    isDefault: !!bp.isDefault,
  }
}

// ---- Lookup ----------------------------------------------------------------

// The entry a new draft should start from, or null for "the built-in default".
export function defaultOf(list) {
  return (list ?? []).find((s) => s.isDefault) ?? null
}

// What a blueprint actually pins, resolved against the libraries. Either half
// may be missing (deleted since, or never set), and the caller falls back to the
// built-in default for that half — a half-usable blueprint still beats refusing.
export function resolveBlueprint(bp, standards = {}) {
  if (!bp) return null
  const sheet = (standards.raritySheets ?? []).find((s) => s.id === bp.sheetId) ?? null
  const format = (standards.packFormats ?? []).find((f) => f.id === bp.formatId) ?? null
  return { blueprint: bp, sheetStandard: sheet, formatStandard: format }
}

// The starting sheet/format/godPack for a brand-new draft: the default blueprint
// if there is one, else the default of each library on its own, else the
// built-ins. Returns nothing at all when the player has authored nothing, so a
// fresh company's first set is seeded exactly as it always was.
export function seedFromStandards(standards = {}) {
  const bp = defaultOf(standards.blueprints)
  const resolved = bp ? resolveBlueprint(bp, standards) : null
  const sheetStd = resolved?.sheetStandard ?? defaultOf(standards.raritySheets)
  const formatStd = resolved?.formatStandard ?? defaultOf(standards.packFormats)
  if (!sheetStd && !formatStd) return {}
  const out = {}
  // Cloned on the way out — rule 1. Without this a fresh draft would edit the
  // library entry in place, and the player's "default" would drift every set.
  const rarities = sheetStd ? cloneSheet(sheetStd.sheet) : defaultRaritySheet()
  const format = formatStd ? cloneFormat(formatStd.format) : defaultPackFormat()
  const godPack = formatStd ? cloneGodPack(formatStd.godPack) : { enabled: true, rarityIds: [] }

  // AND RECONCILED, because nothing forces these two to have been authored
  // against each other. Marking a custom sheet as the default without a matching
  // booster pairs it with the Classic preset, whose slots hardcode the eight
  // built-in ids; a blueprint lets you pin any sheet to any booster. Seeded
  // unreconciled, every slot would name ids the sheet has never had — which does
  // not error anywhere: drawSlotRarity falls back to "any rarity present", so a
  // "7 x common" slot becomes a weighted draw over the whole sheet and a 10-card
  // pack quietly has ten hit slots. computePackOdds applies the same fallback,
  // so the published odds agree with the draw and nothing looks wrong.
  //
  // This is the only import path with no confirmation dialog in front of it, so
  // it is the one that most needs to be right by construction.
  const fitted = fitToSheet({ format, godPack }, rarities)
  if (sheetStd) out.rarities = rarities
  if (formatStd || fitted.changed) {
    // A variant the sheet introduces joins the slots its parent is already in,
    // so a chase printing the standard carries is actually chaseable.
    out.packFormat = syncFormatWithVariants(fitted.format, rarities)
    out.godPack = fitted.godPack
  }
  out.standardFrom = { raritySheet: sheetStd?.id ?? null, packFormat: formatStd?.id ?? null }
  return out
}

// Which standard, if any, a draft's sheet or format came from, and whether the
// player has since edited it. Drift is a deep compare rather than a dirty flag
// because every edit path in the builder already writes the whole object —
// a flag would have to be cleared by hand at each of them, and one missed site
// would have the bar claiming a set matches a standard it no longer does.
export function provenanceOf(draft, standards = {}, kind) {
  const id = draft?.standardFrom?.[kind]
  if (!id) return null
  const list = kind === 'raritySheet' ? standards.raritySheets : standards.packFormats
  const std = (list ?? []).find((s) => s.id === id)
  if (!std) return null
  const drifted = kind === 'raritySheet'
    ? !same(cloneSheet((draft.rarities ?? []).filter((r) => !r.unique)), std.sheet)
    : !same(cloneFormat(draft.packFormat), std.format)
      || !same(cloneGodPack(draft.godPack), std.godPack)
  return { standard: std, drifted }
}

// Both sides go through the cloners first, so this compares VALUES and never
// trips on key order, an absent-vs-undefined field, or a stray extra key.
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ---- Reconciliation --------------------------------------------------------

// The surviving rarity closest in VALUE TIER to the one being replaced, ties
// broken toward the commoner of the two.
//
// Remapping rather than dropping, because dropping is both lossier and unsafe:
// an orphaned id stripped from a slot that held only that id leaves an empty
// slot, which validatePackFormat rejects outright — so "drop what doesn't fit"
// can hand back a draft the player cannot release. Value tier is the right axis
// because it is the one thing every consumer of a rarity actually reads.
export function nearestRarityId(entry, toSheet) {
  let best = null
  let bestGap = Infinity
  for (const r of toSheet ?? []) {
    // A unique rarity belongs to one signature card. Nothing may be remapped ONTO
    // one, or an unrelated card would start sharing that card's one-off pull pool
    // — the same reason the reprint picker hides them as upgrade targets.
    if (r.unique) continue
    const gap = Math.abs((r.valueTier ?? 0) - (entry?.valueTier ?? 0))
    if (gap < bestGap || (gap === bestGap && (r.pullWeight ?? 0) > (best?.pullWeight ?? 0))) {
      best = r
      bestGap = gap
    }
  }
  return best?.id ?? null
}

// Rewrite a format's slots so every id resolves against `sheet`, remapping what
// does not by the same nearest-value-tier rule the import uses.
//
// Needed because PACK_PRESETS hardcode the eight default rarity ids: applying
// "Premium" to a format being authored against a custom sheet yields slots
// naming rarities that sheet has never had. Left alone, that is invisible in the
// Studio (the chips simply do not light) and only surfaces as a pile of remaps
// the first time the format is imported anywhere. Reconciling as the format is
// edited keeps a saved booster expressible in the sheet it was designed against,
// which is what lets a blueprint pairing the two report nothing to move.
//
// Idempotent: an id already in the sheet is left exactly as it is, so this can
// run on every keystroke without fighting the player.
// Rewrite a format's slots and a god pack's picks so every id resolves against
// `sheet`, remapping what does not by the nearest-value-tier rule above.
//
// Needed because PACK_PRESETS hardcode the eight default rarity ids: applying
// "Premium" to a format being authored against a custom sheet yields slots
// naming rarities that sheet has never had. Left alone, that is invisible in the
// Studio (the chips simply do not light) and only surfaces as a pile of remaps
// the first time the format is imported anywhere.
//
// `fromSheet` is where a DEPARTING id is looked up, and passing the right one is
// what makes the remap mean anything. The destination sheet by definition has no
// answer for it, so asked there getRarity returns its neutral stub at value tier
// 40 and every orphan lands mid-ladder regardless of what it was — a custom
// "Prismatic Chase" at tier 95 demoted to Rare. Callers that know the sheet the
// format was previously expressed in (a context switch in the editor) must pass
// it. What is left over falls back to the BUILT-IN sheet, whose eight permanent
// content ids are exactly what the presets hardcode, so 'sir' still resolves at
// 88 and moves to the top of the new sheet rather than to its middle.
//
// Idempotent: an id already in the sheet is left exactly as it is, so this can
// run on every keystroke without fighting the player.
export function fitToSheet({ format, godPack }, sheet, fromSheet = null) {
  const shared = (sheet ?? []).filter((r) => !r.unique)
  if (!shared.length) return { format, godPack, changed: false }
  const live = new Set(expandRaritySheet(sheet ?? []).map((r) => r.id))
  const reference = [
    ...(fromSheet ?? []),
    ...shared,
    ...defaultRaritySheet().filter((d) => !live.has(d.id)),
  ]
  let changed = false
  const move = (id) => {
    if (live.has(id)) return id
    changed = true
    return nearestRarityId(getRarity(reference, id), shared)
  }
  // Two orphans can land on the same survivor, or on one the list already holds;
  // a slot naming a rarity twice would weight it twice in the draw.
  const mapIds = (ids) => {
    const out = []
    for (const id of ids ?? []) {
      const keep = move(id)
      if (keep && !out.includes(keep)) out.push(keep)
    }
    return out
  }
  const slots = (format?.slots ?? []).map((slot) => ({ ...slot, rarityIds: mapIds(slot.rarityIds) }))
  const picks = mapIds(godPack?.rarityIds)
  if (!changed) return { format, godPack, changed: false }
  return {
    // Slots that no longer name the preset's rarities are no longer that preset,
    // so the record of where the shape came from has to go with them — the same
    // honesty the editor's own mutators enforce.
    format: { ...format, preset: null, slots },
    godPack: godPack ? { ...godPack, rarityIds: picks } : godPack,
    changed: true,
  }
}

// Work out what importing `incoming` into `draft` would do, and do it. One
// function for both, so the report the player confirms and the draft they get
// can never describe different operations.
//
// `incoming` is a PARTIAL: { sheet } for a rarity-sheet standard, { format,
// godPack } for a booster standard, both for a blueprint. Whatever it omits is
// taken from the draft, which is what makes a sheet import check the draft's
// existing pack and a pack import check the draft's existing sheet — the same
// four channels, in both directions.
function planImport(draft, incoming = {}) {
  const oldSheet = draft.rarities ?? []
  const uniques = oldSheet.filter((r) => r.unique)
  const shared = incoming.sheet ? cloneSheet(incoming.sheet) : oldSheet.filter((r) => !r.unique)
  // Rule 4: the draft's own uniques come back in BEFORE anything is reconciled.
  // syncFormatWithVariants below builds its live-id set from whatever sheet it is
  // handed, so given the shared half alone it would decide every `uniq_*` id in
  // every slot was dead and strip them — silently unpicking each signature card
  // the player had made individually pullable.
  const merged = [...shared, ...uniques]
  const format = withSlotIds(cloneFormat(incoming.format ?? draft.packFormat))
  const godPack = cloneGodPack(incoming.godPack ?? draft.godPack)

  // Variant ids are pullable in their own right, so a slot may legitimately name
  // one; the expanded sheet is the real universe of ids a reference can resolve to.
  const live = new Set(expandRaritySheet(merged).map((r) => r.id))
  const report = { slots: [], godPack: [], signatureCards: [], reprintUpgrades: [], variantsAdded: [] }

  // Resolve a stale id against the sheet it CAME from, so the report can name it
  // ("Illustration Rare", not `ir`) and so the remap is by the tier the player
  // actually chose. getRarity falls back to a neutral mid entry for an id that is
  // already stale in the old sheet too, which lands it mid-ladder — the honest
  // answer when there is nothing left to read.
  const remap = (id, bucket, extra) => {
    if (!id || live.has(id)) return id
    const from = getRarity(oldSheet, id)
    const toId = nearestRarityId(from, shared)
    if (!toId) return null
    const to = getRarity(merged, toId)
    bucket.push({ ...extra, fromId: id, fromName: from.name, toId, toName: to.name })
    return toId
  }

  const slots = format.slots.map((slot, slotIndex) => {
    const next = []
    for (const id of slot.rarityIds ?? []) {
      const mapped = remap(id, report.slots, { slotIndex })
      // Two orphans can land on the same survivor, or on one the slot already
      // holds. A slot listing a rarity twice would weight it twice in the draw.
      if (mapped && !next.includes(mapped)) next.push(mapped)
    }
    return { ...slot, rarityIds: next }
  })
  // Preset provenance goes with the slots, exactly as fitToSheet and the
  // editor's own mutators do: slots remapped off a preset's rarities are not
  // that preset any more.
  const nextPreset = report.slots.length ? null : format.preset

  const gpIds = []
  for (const id of godPack.rarityIds) {
    const mapped = remap(id, report.godPack, {})
    if (mapped && !gpIds.includes(mapped)) gpIds.push(mapped)
  }

  const signatureCards = (draft.signatureCards ?? []).map((sig, index) => {
    // A card printed at its OWN unique rarity keeps it — that entry travelled
    // across in `uniques` and is still live. Only what it was cloned from can go
    // stale, and it has to follow, or reverting the card to a shared rarity would
    // send it to a dangling id.
    const rarity = remap(sig.rarity, report.signatureCards, { index, cardName: sig.name })
    return rarity === sig.rarity ? sig : { ...sig, rarity: rarity ?? shared[0]?.id ?? 'rare' }
  })

  const nextUniques = uniques.map((u) => {
    if (!u.derivedFrom || live.has(u.derivedFrom)) return u
    return { ...u, derivedFrom: nearestRarityId(getRarity(oldSheet, u.derivedFrom), shared) }
  })

  const reprintedCards = (draft.reprintedCards ?? []).map((rp, index) => {
    if (!rp?.upgradeRarityId) return rp
    const upgradeRarityId = remap(rp.upgradeRarityId, report.reprintUpgrades, { index })
    if (upgradeRarityId === rp.upgradeRarityId) return rp
    // Nothing survives to upgrade to — drop the upgrade rather than leave a
    // dangling id, which getRarity would price off its neutral stub.
    const { upgradeRarityId: _drop, ...rest } = rp
    return upgradeRarityId ? { ...rest, upgradeRarityId } : rest
  })

  const rarities = [...shared, ...nextUniques]
  report.count = report.slots.length + report.godPack.length
    + report.signatureCards.length + report.reprintUpgrades.length
  report.uniquesKept = nextUniques.length

  // The standing reconciliation pass, LAST and against the merged sheet: it puts
  // a variant the incoming sheet introduced into the slots its parent is already
  // in, so a chase printing the player is importing is actually chaseable
  // without a second trip to the booster section.
  const before = { ...format, preset: nextPreset, slots }
  const packFormat = syncFormatWithVariants(before, rarities)
  // Which is a real change to what a pack contains, so it has to be REPORTED.
  // Without this the dialog could say "everything still resolves, nothing else
  // changes" and then add an Alt Art to the hit slot — and the provenance line
  // would immediately flip to "edited since" with the player having touched
  // nothing.
  packFormat.slots.forEach((slot, slotIndex) => {
    const had = new Set(before.slots[slotIndex]?.rarityIds ?? [])
    for (const id of slot.rarityIds ?? []) {
      if (!had.has(id)) report.variantsAdded.push({ slotIndex, name: getRarity(rarities, id).name })
    }
  })
  report.count += report.variantsAdded.length

  return {
    report,
    draft: {
      ...draft,
      rarities,
      packFormat,
      godPack: { ...godPack, rarityIds: gpIds },
      signatureCards,
      reprintedCards,
    },
  }
}

// What importing would change, for the confirmation the player sees. Does not
// touch the draft — the only write it can make is minting a slot id on a format
// that has none, which the normalisers already rule out for anything stored.
export function checkStandardFit(draft, incoming) {
  return planImport(draft, incoming).report
}

// The draft after the import, with all four id channels reconciled.
export function applyStandard(draft, incoming) {
  return planImport(draft, incoming).draft
}
