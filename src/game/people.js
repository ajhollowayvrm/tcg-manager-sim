// PEOPLE — the character layer above the forms.
//
// READ THIS FIRST: THE WORD "CHARACTER" MEANS TWO THINGS HERE.
//
// A character is one PERSON printed in many FORMS. Aryla, Destined Trainee is
// promoted to Aryla, Royal Soldier, whose story then goes two ways — Lost One
// Aryla and Royal Commander Aryla — and the Lost One ascends into The Divine
// Channel, whose card face does not carry her name at all. Five cards, five
// personalities, one Aryla. Fans are meant to recognise her in every one of them
// and still keep a favourite.
//
// The code cannot use the obvious names for that, and the reason is the save.
// `state.characters` holds the FORMS, and every card in the save points at one
// through `card.characterId`. Renaming that field to `formId` would orphan every
// card in every run in progress, and there are no migrations (persistence.js:
// loadState discards a save whose VERSION differs). So:
//
//   state.characters   — the FORMS. One record per printing identity.
//   state.people       — the PEOPLE. One record per character, this file.
//   card.characterId   — points at a FORM. Never rename it.
//
// Every user-facing string goes the other way and says what the player means:
// "character" for a person, "form" for a character record. That seam is
// unpleasant and it is deliberate; a run in progress is worth more than a tidy
// vocabulary. This comment is the one place it is written down.
//
// WHAT A PERSON OWNS THAT A FORM CANNOT:
//
//   recognition — how well the audience knows this character, aggregated across
//                 the forms. One number for Aryla, not five. A new form debuts
//                 off THIS, so The Divine Channel arrives famous because Aryla is
//                 famous, not because its parent happened to be hot.
//   favor       — how the fandom divides across the forms. The one they grew up
//                 with can stay the favourite for a whole run while the newest
//                 form gets the printings. This is what makes WHICH Aryla you
//                 print a real decision rather than a cosmetic one.
//   saturation  — overexposure. Printing four forms of one character in thirty
//                 weeks is the thing that costs you, now that a retiring lineage
//                 kind closes a path instead of closing a character.
//   continuity  — the throughline and core demeanour every form is read against,
//                 so the room can say "that isn't Aryla" and mean it.
//
// STRUCTURE IS DERIVED, NOT STORED. derivePeople() below rebuilds which forms
// belong to which person by walking the lineage links, so `personId`,
// `rootFormId` and `descendedFromIds` are recomputed on every load and are
// stripped from the save. Only the AUTHORED text and the EARNED numbers are
// persisted. That is not tidiness: a week-312 run already serialised to 4.07 MB
// against a ~5 MB quota and silently stopped saving, which is why the run save
// moved to IndexedDB at v18. A new top-level array does not get to undo that.
//
// Everything here is additive and normalises on load, so the save VERSION does
// not move. Same route archetypes, traits, beats and the whole lineage feature
// already took.
//
// This module must import in plain Node with no browser global at module scope —
// tools/playtest.mjs imports the real reducer and its whole graph.

import { clamp } from './simulation.js'
// cast.js imports favorMultiplier/saturationMultiplier from here in turn; the
// cycle is hoisted-functions-only on both sides, like the one with simulation.js.
import { castIdsOf } from './cast.js'
import { getLineageKind } from './content/lineages.js'
import { MAX_TRAITS } from './content/traits.js'
import { demeanorCentroid, centroidDistance, MAX_DEMEANORS } from './content/demeanors.js'
import { lineageParents } from './characters.js'

// A rolling year of recognition samples, matching characters.js's
// FAME_HISTORY_WEEKS exactly so the two sparklines in the detail view cover the
// same window and can be read against each other.
const RECOGNITION_HISTORY_WEEKS = 52

// Person-level story beats are rarer than a form's, so the cap is lower.
const MAX_PERSON_BEATS = 8

// How fast recognition follows the forms. An EWMA like franchise.js's, and slow
// for the same reason: a character's standing with the audience is a legacy, not
// a weekly readout. One hot printing should not make an unknown a household name
// inside a month.
const RECOGNITION_ALPHA = 0.12

// Recognition above which the audience knows this character by name rather than
// by card. Files the beat and gates the person-level chatter in personas.js.
export const WIDELY_KNOWN_RECOGNITION = 60

// ---- Favour -----------------------------------------------------------------
// How fast the fandom's affection moves between forms, and the floor an old form
// keeps. The floor is the important one: a form with no live cards decays toward
// it rather than to zero, because the form people grew up with does not stop
// being their favourite the week it leaves print. Without a floor, favour
// collapsed onto whatever printed most recently and the mechanic said nothing.
const FAVOR_ALPHA = 0.08
const FAVOR_FLOOR_SHARE = 0.35 // of an even share
// A form printed this recently still counts as "current" for favour purposes.
const FAVOR_RECENCY_WEEKS = 26

// ---- Saturation -------------------------------------------------------------
// Overexposure. Each printing of any of a character's forms adds; it bleeds off
// weekly. Over the threshold the room starts to say you are milking them.
const SATURATION_PER_PRINTING = 22
// TUNED AGAINST THE CADENCE BAND, not picked. The brief's target cadence is a set
// every 12-20 weeks, and the decay has to grade across that band rather than
// stepping over it. At 1.6/wk one printing was almost exactly cancelled by 14
// weeks of decay, so the dial was a cliff: a studio at a 7-week cadence sat near
// 89 and a studio at 14 weeks sat at 0, with nothing in between. At 1.0/wk the
// equilibrium for printing ONE character in EVERY set runs 93 at a 7-week
// cadence, 86 at 14, 30 at 21 and 0 at 28 — so leaning on one character costs
// you, leaning on them every other release is nearly free, and the gap between
// those is a gradient the player can actually steer by.
const SATURATION_DECAY_PER_WEEK = 1.0
export const SATURATION_THRESHOLD = 55
// The worst appeal multiplier a fully saturated character can inflict. Small on
// purpose: this replaces a hard lock that used to make a branch impossible, so
// it has to bite without becoming the new lock.
const SATURATION_MAX_PENALTY = 0.18

// How far a form's continuity may sit from what its lineage kind expects before
// the room objects. Generous, because the demeanour axes are coarse by design
// (see content/demeanors.js) and a narrow band would punish rounding.
//
// BOUNDED BY WHAT THE ROSTER CAN ACTUALLY EXPRESS. The largest drift any two
// demeanours in content/demeanors.js can produce is 0.735 (cheerful to cold), and
// a two-pick centroid averages well below that. At a tolerance of 0.25 the
// 'not-her' verdict needed a drift above 0.75 on a promotion, which no pick in
// the table can reach — the branch was unreachable, so the loudest thing this
// mechanic can say could never be said. At 0.20 it needs 0.65, which cheerful to
// hollow-and-cold clears: reinventing a character on a promotion now reads as
// somebody else, which is the whole point of scoring continuity at all.
const CONTINUITY_TOLERANCE = 0.2

// Same collision hazard as characters.js's characterId(): a fresh `person_1`
// colliding with a saved one after a reload would silently re-point forms at the
// wrong character. Timestamp plus counter keeps ids unique across sessions.
let _uid = 0
function personId() {
  _uid += 1
  return `person_${Date.now().toString(36)}${_uid.toString(36)}`
}

export function createPerson(name, opts = {}) {
  const o = opts ?? {}
  return {
    id: personId(),
    name: (name ?? '').trim() || 'Unnamed Character',
    pronouns: (o.pronouns ?? '').trim(),
    // The one line that stays true of every form. Read by the community feed and
    // shown at the top of the detail view; never scored.
    throughline: (o.throughline ?? '').trim(),
    coreTraits: (o.coreTraits ?? []).slice(0, MAX_TRAITS),
    // The measurable half of the identity. continuityDrift reads ONLY this.
    coreDemeanor: (o.coreDemeanor ?? []).slice(0, MAX_DEMEANORS),
    rootFormId: o.rootFormId ?? null,
    descendedFromIds: o.descendedFromIds ?? [],
    recognition: clamp(o.recognition ?? 0, 0, 100),
    recognitionHistory: [],
    favor: o.favor ?? {},
    saturation: 0,
    beats: [],
  }
}

export function normalizePerson(p) {
  if (!p) return null
  return {
    ...p,
    name: (p.name ?? '').trim() || 'Unnamed Character',
    pronouns: p.pronouns ?? '',
    throughline: p.throughline ?? '',
    coreTraits: (p.coreTraits ?? []).slice(0, MAX_TRAITS),
    coreDemeanor: (p.coreDemeanor ?? []).slice(0, MAX_DEMEANORS),
    descendedFromIds: p.descendedFromIds ?? [],
    recognition: clamp(p.recognition ?? 0, 0, 100),
    recognitionHistory: p.recognitionHistory ?? [],
    favor: p.favor ?? {},
    saturation: clamp(p.saturation ?? 0, 0, 100),
    beats: p.beats ?? [],
  }
}

export function getPerson(state, id) {
  return (state.people ?? []).find((p) => p.id === id) ?? null
}

// Every form of a person. Reads `personId`, which derivePeople stamps on load.
export function formsOf(state, id) {
  return (state.characters ?? []).filter((c) => c.personId === id)
}

// The person a FORM belongs to. The common lookup, and worth having by name
// because `card.characterId` reaches a form and almost every caller wants the
// character behind it.
export function personOfForm(state, formId) {
  const form = (state.characters ?? []).find((c) => c.id === formId)
  return form ? getPerson(state, form.personId) : null
}

// What a form should be CALLED in a roster: "Aryla — Royal Commander". A form
// whose card face drops the name entirely (The Divine Channel) still needs the
// character attached in the studio's own lists, or the player loses track of
// their own cast.
export function formLabel(person, form) {
  if (!form) return ''
  if (!person || !form.formName) return form.name
  return form.name.includes(person.name) ? form.name : `${person.name} — ${form.formName}`
}

// The CHARACTER's name, inferred from a form's card name.
//
// A card face in this genre is "<who>, <what they are right now>": Aryla,
// Destined Trainee. Kell, Broken Boy. The part before the comma is the person and
// survives every promotion; the part after it is the form and does not. So a
// person seeded from a form takes the first half.
//
// This is a DEFAULT, not a rule. It only ever runs when nothing better is known —
// backfilling a save written before the person layer, or a character the player
// created without naming the person separately — and UPDATE_PERSON can rename it
// afterwards. A form whose name has no comma keeps its whole name, which is the
// right answer for a one-form character called "Greenleaf".
//
// A card face that drops the name entirely (The Divine Channel) must never seed a
// person, and does not: derivePeople always seeds from the ROOT form, and a root
// is by definition the first printing, where the audience is being introduced.
export function personNameFromForm(name) {
  const raw = (name ?? '').trim()
  const comma = raw.indexOf(',')
  if (comma <= 0) return raw
  return raw.slice(0, comma).trim() || raw
}

// The FORM's name, the other half of the same split — "Destined Trainee". Used to
// seed formName when the player did not give one.
export function formNameFromForm(name) {
  const raw = (name ?? '').trim()
  const comma = raw.indexOf(',')
  if (comma <= 0) return ''
  return raw.slice(comma + 1).trim()
}

// ---- Backfill ---------------------------------------------------------------

// Rebuild the people from the forms. Runs in hydrate() on every load and in
// createInitialState, and is what lets this whole feature ship without a VERSION
// bump: an old save arrives with no `people` at all and leaves with a correct
// one, and a pre-lineage character becomes a one-form person.
//
// The graph walked here is the SAME-BEING graph only. A fusion or a successor is
// explicitly not the same person — an heir who takes the mantle is an heir — so
// those links start a new person and are recorded as descendedFromIds instead.
//
// Returns { people, characters } with `personId` stamped on every form. Pure:
// it never mutates its inputs.
export function derivePeople(state) {
  const characters = state.characters ?? []
  const byId = new Map(characters.map((c) => [c.id, c]))

  // Same-being parents of a form, which is the subset of its lineage parents
  // whose kind continues the character.
  const kinParents = (c) => {
    const kind = getLineageKind(c.lineageKindId)
    if (!kind?.sameBeing) return []
    return lineageParents(c).filter((id) => byId.has(id))
  }

  // Walk to the root of a form's same-being chain. Depth-capped for the same
  // reason characters.js's walkers are: a cycle smuggled in through an imported
  // save must not hang the loader.
  const rootOf = (c) => {
    let cur = c
    let depth = 0
    const seen = new Set([c.id])
    while (depth < 16) {
      const [primary] = kinParents(cur)
      if (!primary || seen.has(primary)) break
      seen.add(primary)
      cur = byId.get(primary)
      depth++
    }
    return cur
  }

  // Preserve an existing person record wherever one already covers this root, so
  // the authored text and the earned numbers survive a reload. Matching is by
  // rootFormId first (stable across a rename) and by name second (covers a
  // record whose structure was stripped from the save, which is the normal case).
  const existing = (state.people ?? []).map(normalizePerson).filter(Boolean)
  const byRoot = new Map(existing.filter((p) => p.rootFormId).map((p) => [p.rootFormId, p]))
  // Matched with the SAME derivation the seed uses, or a reload would fail to
  // recognise the person it wrote last time and mint a duplicate beside it.
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]))
  const claimed = new Set()

  const people = []
  const personOf = new Map() // rootId -> person

  for (const c of characters) {
    const root = rootOf(c)
    if (personOf.has(root.id)) continue
    let person = byRoot.get(root.id)
    if (!person || claimed.has(person.id)) person = byName.get(personNameFromForm(root.name).toLowerCase())
    if (!person || claimed.has(person.id)) {
      person = createPerson(personNameFromForm(root.name), {
        coreTraits: root.traits ?? [],
        coreDemeanor: root.demeanorIds ?? [],
        throughline: root.hook ?? '',
        pronouns: root.pronouns ?? '',
      })
    }
    claimed.add(person.id)
    person = { ...person, rootFormId: root.id }
    personOf.set(root.id, person)
    people.push(person)
  }

  // Stamp every form with its person.
  const formToPerson = new Map()
  const stamped = characters.map((c) => {
    const p = personOf.get(rootOf(c).id)
    formToPerson.set(c.id, p.id)
    // Seed formName from the card face when the player gave none, so an old save
    // gets readable roster labels — "Royal Soldier" rather than a blank.
    const formName = c.formName || formNameFromForm(c.name)
    if (c.personId === p.id && c.formName === formName) return c
    return { ...c, personId: p.id, formName }
  })

  // Person-level lineage: a fusion or successor child's person descends from the
  // people its parents belong to. Resolved in a second pass, because it needs
  // every form already assigned.
  const finished = people.map((p) => {
    const root = byId.get(p.rootFormId)
    const kind = root ? getLineageKind(root.lineageKindId) : null
    const from = kind && !kind.sameBeing
      ? lineageParents(root).map((id) => formToPerson.get(id)).filter((id) => id && id !== p.id)
      : []
    // Favour: keep the shares that still name a live form, seed any form that has
    // none, then renormalise. A form added since the last save arrives with an
    // even share rather than zero, which would make it invisible to every
    // consumer on its debut week.
    const forms = stamped.filter((c) => c.personId === p.id)
    const favor = normalizeFavor(forms.map((f) => f.id), p.favor)
    return { ...p, descendedFromIds: [...new Set(from)], favor }
  })

  return { people: finished, characters: stamped }
}

// Spread shares over `ids` so they sum to 1, keeping any existing weight and
// giving an unseen form an even share. An empty roster returns {}.
function normalizeFavor(ids, prior = {}) {
  if (!ids.length) return {}
  const even = 1 / ids.length
  const raw = ids.map((id) => (typeof prior[id] === 'number' && prior[id] > 0 ? prior[id] : even))
  const total = raw.reduce((s, v) => s + v, 0)
  const out = {}
  ids.forEach((id, i) => { out[id] = Math.round((raw[i] / total) * 1000) / 1000 })
  return out
}

export { normalizeFavor }

// ---- Continuity -------------------------------------------------------------

// How far a form's personality sits from the character's core, 0..1, or null
// when either side has no demeanour picked. Null means "no reading available"
// and every caller must skip the comparison rather than assume a middle value —
// see the note on demeanorCentroid.
export function continuityDrift(person, form) {
  return centroidDistance(
    demeanorCentroid(person?.coreDemeanor),
    demeanorCentroid(form?.demeanorIds),
  )
}

// Read a form's drift against what its lineage kind leads fans to expect.
//
// The verdict is NOT "drifting is bad". A fall is supposed to break the
// character, and one that stays cheerful is the failure. What the room objects to
// is drifting the wrong amount for the story being told:
//
//   true-to-her — within tolerance of the kind's expectation
//   a-stretch   — outside it, but not by much, in either direction
//   not-her     — far more change than this kind of link earns
//   toothless   — far less change than this kind of link promised
//
// `appealDelta` is deliberately small, sized against the +10 an on-theme
// archetype already earns in sets.js, so continuity colours a release without
// deciding it.
export function continuityVerdict(person, form, kindId) {
  const drift = continuityDrift(person, form)
  const kind = getLineageKind(kindId ?? form?.lineageKindId)
  // No demeanour on either side, or a root form with no link to judge: nothing
  // to say. A silent verdict is correct here — an unset field is not a mistake.
  if (drift === null || !kind) return { verdict: null, drift, appealDelta: 0 }
  const gap = drift - kind.expectedDrift
  if (Math.abs(gap) <= CONTINUITY_TOLERANCE) {
    return { verdict: 'true-to-her', drift, appealDelta: 6 }
  }
  if (Math.abs(gap) <= CONTINUITY_TOLERANCE * 2) {
    return { verdict: 'a-stretch', drift, appealDelta: 0 }
  }
  return gap > 0
    ? { verdict: 'not-her', drift, appealDelta: -8 }
    : { verdict: 'toothless', drift, appealDelta: -4 }
}

// The words the builder and the feed both use, so a player reads the same
// sentence before release that the room says after it.
export const CONTINUITY_TEXT = {
  'true-to-her': 'Fans will read this as still the same character.',
  'a-stretch': 'A stretch, but fans will follow it.',
  'not-her': 'This is not the character they know.',
  'toothless': 'Too safe for this kind of turn — fans will not believe it.',
}

// ---- Favour and saturation --------------------------------------------------

// A form's pull relative to its character's other forms.
//
// EXACTLY 1.0 when a form holds an even share, which is the load-bearing
// property of this function: a one-form character — every character in every save
// that predates this feature — multiplies by 1 and is numerically untouched, so
// the playtest table stays comparable. The playtest asserts it.
const FAVOR_SWING = 0.4

export function favorMultiplier(person, formId) {
  const ids = Object.keys(person?.favor ?? {})
  if (ids.length < 2) return 1
  const share = person.favor[formId]
  if (typeof share !== 'number') return 1
  // share * count is 1 at an even split, 0 at abandoned, count at total capture.
  const relative = share * ids.length
  return clamp(1 + (relative - 1) * FAVOR_SWING, 1 - FAVOR_SWING, 1 + FAVOR_SWING)
}

// The appeal multiplier an overexposed character drags onto a new printing.
// 1 below the threshold, falling to 1 - SATURATION_MAX_PENALTY at 100.
export function saturationMultiplier(person) {
  const s = person?.saturation ?? 0
  if (s <= SATURATION_THRESHOLD) return 1
  const over = (s - SATURATION_THRESHOLD) / (100 - SATURATION_THRESHOLD)
  return 1 - over * SATURATION_MAX_PENALTY
}

// Record that one of a character's forms was printed. Called from releaseSet
// beside recordAppearance, and from the partner-promo path.
export function recordPersonPrinting(people, id, { week } = {}) {
  return (people ?? []).map((p) => (
    p.id === id
      ? { ...p, saturation: clamp((p.saturation ?? 0) + SATURATION_PER_PRINTING, 0, 100), lastPrintedWeek: week ?? p.lastPrintedWeek ?? null }
      : p
  ))
}

function withPersonBeat(p, week, kind, label) {
  const beats = [...(p.beats ?? []), { week, kind, label }]
  return beats.length <= MAX_PERSON_BEATS ? beats : beats.slice(-MAX_PERSON_BEATS)
}

// ---- The weekly tick --------------------------------------------------------

// Advance every character one week. Mutates next.people and next.characters in
// place, mirroring driftCharacters.
//
// ORDER: this runs immediately AFTER driftCharacters, because a person aggregates
// its forms and the forms must have moved first. Two readers run earlier in the
// same tick and therefore see last week's recognition — applyPersonaEffects and
// applySegmentDrift — which is not a defect: both already read last week's
// character fame for the same reason. Do not "fix" it by moving this call.
export function driftPeople(next) {
  if (!next.people?.length) return
  const week = next.week
  const formsByPerson = new Map()
  for (const c of next.characters ?? []) {
    if (!c.personId) continue
    if (!formsByPerson.has(c.personId)) formsByPerson.set(c.personId, [])
    formsByPerson.get(c.personId).push(c)
  }

  // Live, unbanned, unrotated cards for a form — the same signal characters.js
  // reads for fame drift.
  const liveCards = new Map()
  for (const card of next.cards ?? []) {
    if (card.banned || card.rotated) continue
    // Indexed by EVERY name on the card, not just the lead — same reason
    // characters.js's liveCardsFor reads the whole cast.
    for (const formId of castIdsOf(card)) {
      if (!liveCards.has(formId)) liveCards.set(formId, [])
      liveCards.get(formId).push(card)
    }
  }

  const fameAdjust = new Map() // formId -> new fame

  next.people = next.people.map((p) => {
    const forms = formsByPerson.get(p.id) ?? []
    if (!forms.length) return p
    const favor = normalizeFavor(forms.map((f) => f.id), p.favor)

    // 1. RECOGNITION — an EWMA toward the favour-weighted mean of the forms'
    //    fame. Weighted by favour rather than evenly so the form the audience
    //    actually cares about carries the character's standing, which is the
    //    whole reason favour exists.
    const target = forms.reduce((s, f) => s + (f.fame ?? 0) * (favor[f.id] ?? 0), 0)
    const recognition = clamp((p.recognition ?? 0) + (target - (p.recognition ?? 0)) * RECOGNITION_ALPHA, 0, 100)

    // 2. KIN PULL — each form's fame is drawn toward the character's recognition
    //    by its link's strength. This is what makes a hot form lift its siblings.
    //    It generalises the transformation-only fame link that used to live in
    //    characters.js, which is why transformation keeps the same 0.1 it had.
    for (const f of forms) {
      const kind = getLineageKind(f.lineageKindId)
      const pull = kind?.kinPull ?? 0
      if (!pull) continue
      const moved = (f.fame ?? 0) + (recognition - (f.fame ?? 0)) * pull
      fameAdjust.set(f.id, Math.round(clamp(moved, 0, 100) * 10) / 10)
    }

    // 3. FAVOUR — move each share toward how that form is actually doing. A form
    //    with no live cards decays toward the floor rather than to zero, so the
    //    form fans grew up with keeps its hold long after it left print.
    const even = 1 / forms.length
    const desire = forms.map((f) => {
      const cards = liveCards.get(f.id) ?? []
      if (!cards.length) return even * FAVOR_FLOOR_SHARE
      const heat = cards.reduce((s, c) => (
        s + clamp((c.momentum ?? 0) / 3, -1, 1) * 0.5 + clamp(((c.hype ?? 0) - 0.4) / 1.2, -1, 1) * 0.5
      ), 0) / cards.length
      const recent = f.lastPrintedWeek != null && week - f.lastPrintedWeek <= FAVOR_RECENCY_WEEKS ? 0.25 : 0
      return Math.max(even * FAVOR_FLOOR_SHARE, even * (1 + heat * 0.8 + recent))
    })
    const desireTotal = desire.reduce((s, v) => s + v, 0)
    const nextFavor = {}
    forms.forEach((f, i) => {
      const want = desire[i] / desireTotal
      const cur = favor[f.id] ?? even
      nextFavor[f.id] = Math.round((cur + (want - cur) * FAVOR_ALPHA) * 1000) / 1000
    })

    // 4. SATURATION — bleeds off weekly.
    const saturation = clamp((p.saturation ?? 0) - SATURATION_DECAY_PER_WEEK, 0, 100)

    // Beats. The character becoming widely known is a first-time milestone, so it
    // is filed once; a change of favourite form is not, because a fandom
    // genuinely does swap allegiance more than once over a long run.
    let beats = p.beats ?? []
    const wasKnown = (p.recognition ?? 0) >= WIDELY_KNOWN_RECOGNITION
    if (!wasKnown && recognition >= WIDELY_KNOWN_RECOGNITION && !beats.some((b) => b.kind === 'known')) {
      beats = withPersonBeat({ ...p, beats }, week, 'known', 'Known by name, not just by card')
    }
    const favouriteBefore = topKey(favor)
    const favouriteAfter = topKey(nextFavor)
    if (favouriteBefore && favouriteAfter && favouriteBefore !== favouriteAfter) {
      const form = forms.find((f) => f.id === favouriteAfter)
      if (form) beats = withPersonBeat({ ...p, beats }, week, 'favourite', `${formLabel(p, form)} became the fans' favourite`)
    }

    const rounded = Math.round(recognition * 10) / 10
    return {
      ...p,
      recognition: rounded,
      recognitionHistory: [...(p.recognitionHistory ?? []), Math.round(rounded)].slice(-RECOGNITION_HISTORY_WEEKS),
      favor: nextFavor,
      saturation: Math.round(saturation * 10) / 10,
      beats,
    }
  })

  if (fameAdjust.size) {
    next.characters = next.characters.map((c) => (
      fameAdjust.has(c.id) && fameAdjust.get(c.id) !== c.fame
        ? { ...c, fame: fameAdjust.get(c.id) }
        : c
    ))
  }
}

function topKey(obj) {
  let best = null
  let bestVal = -Infinity
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v > bestVal) { bestVal = v; best = k }
  }
  return best
}

// ---- Cast signal helpers ----------------------------------------------------

// The best form of each character, by fame, ignoring retired forms.
//
// Exists because every "how hot is the cast" reader in the sim used to count
// CHARACTER RECORDS, and a character record is a FORM. A character with five
// forms would fill a top-three list on its own and lock the rest of the cast out,
// while reporting one popular character as though it were three. See segments.js's
// hotCastSignal and franchise.js's trickle.
//
// Reads `personId` straight off the forms and needs no people array: a form that
// has never been through derivePeople falls back to its own id and so counts
// once, which is the correct answer for it.
export function bestFormPerPerson(characters) {
  const best = new Map()
  for (const c of characters ?? []) {
    if (c.retiredWeek) continue
    const key = c.personId ?? c.id // a form with no person still counts once
    const cur = best.get(key)
    if (!cur || (c.fame ?? 0) > (cur.fame ?? 0)) best.set(key, c)
  }
  return [...best.values()]
}
