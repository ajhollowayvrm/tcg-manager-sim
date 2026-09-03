// Cast — the relationship between a CARD and the characters printed on it.
//
// This used to be one optional pointer written in three places: a signature
// card at release, a brand-partner promo, and an SPC promo. Every other card in
// the game — the procedural body of a set, the secrets, the variants, the
// treatment cards — carried no cast at all, and no card could carry more than
// one. That made the cast a property of SET DESIGN rather than a thing of its
// own, which is backwards: a character is a persistent identity that appears
// and disappears across sets, and naming the same two characters on two cards
// is exactly what makes a collector pair them.
//
// So the association lives here, in its own module, for two reasons:
//
//   1. It needs BOTH layers — the form (characters.js) that is actually printed
//      and the person (people.js) whose standing the audience is reacting to —
//      and putting it in either would make the two import each other.
//   2. Cast-as-a-relationship is now its own concept, and it earns a file the
//      way lineage earned content/lineages.js.
//
// NAMING. `card.characterId` still points at a FORM and is still the LEAD cast
// member. It is load-bearing in every save (see people.js's header) and must
// never be renamed; `castIds` is additive and its first entry is always the
// lead. Read membership through `cardFeaturesForm` rather than comparing
// `characterId` by hand, or a card's second cast member earns nothing and the
// whole relationship is decorative.

import { clamp } from './simulation.js'
import { famePopBonus } from './characters.js'
import { favorMultiplier, saturationMultiplier } from './people.js'

// How much of a character's RECOGNITION carries a form that is not itself
// famous. Recognition is a floor, not a replacement: a brand-new form of a
// household-name character debuts already wanted (that is the whole point of
// the person layer), but a form that has earned more fame than its character's
// recognition keeps its own number.
export const RECOGNITION_FLOOR = 0.75

// How many names one card may carry. Not a technical limit — past about six
// nobody on the card reads as its subject, and the appeal a crowd earns is
// capped anyway (see CAST_POP_CAP and castWeighted in sets.js). Enforced in the
// PICKER, deliberately not in withCast: that runs on every load, and silently
// dropping a name out of a save someone already has is worse than an
// over-crowded card.
export const MAX_CAST_PER_CARD = 6

// The ceiling on the summed cast bonus. One member already caps at 45
// (famePopBonus), so a genuine team-up can out-pull a solo icon — but five
// icons on one card cannot stack into something unbeatable.
export const CAST_POP_CAP = 60

// The premium a card carries for the standing of who is ON it, applied every
// week rather than frozen at print. Deliberately the same 0.25 as artists.js's
// ARTIST_HEAT_PREMIUM: being drawn by the illustrator of the moment and
// starring the character of the moment are worth about the same.
export const CAST_HEAT_PREMIUM = 0.25

// The set-level sales lift a hot cast earns, in the same 0..0.12 band as
// spotlightAppeal and illustrationAppeal in revenue.js — those are the two
// existing terms of comparable size, and a cast is not allowed to outweigh the
// set's own cards.
export const CAST_APPEAL_MAX = 0.12

// Every form printed on a card, lead first. Falls back to `characterId` so a
// save written before castIds existed reads correctly with no migration.
export function castIdsOf(card) {
  if (!card) return []
  const list = Array.isArray(card.castIds) ? card.castIds : []
  if (!list.length) return card.characterId ? [card.characterId] : []
  // UNION IN THE LEAD. `cardFeaturesForm` below honours `characterId` whether or
  // not the list mentions it, and this used to ignore it whenever the list was
  // non-empty — so the two disagreed for a record with `characterId: 'A'` and
  // `castIds: ['B','C']`. A then drifted on a card that never recorded a printing
  // for her and never counted toward her share of the fandom. withCast keeps the
  // two in step for anything this build writes, so only a hand-edited or
  // imported save reaches it; agreeing by construction is cheaper than trusting
  // every future writer.
  if (card.characterId && !list.includes(card.characterId)) return [card.characterId, ...list]
  return list
}

// Is this form printed on this card? THE membership test. Replaces every
// `card.characterId === id` in the sim — fame drift, the person layer, persona
// chatter and illustration-set cohesion all have to see the whole cast or a
// supporting credit pays nothing.
export function cardFeaturesForm(card, formId) {
  if (!formId) return false
  if (card?.characterId === formId) return true
  return Array.isArray(card?.castIds) && card.castIds.includes(formId)
}

// Keep the lead and the list consistent in both directions. Called wherever a
// card record is built or normalised: a caller that set only `characterId` gets
// a matching list, and one that set only `castIds` gets a matching lead.
export function withCast(card) {
  const ids = castIdsOf(card)
  if (!ids.length) return { ...card, characterId: null, castIds: [] }
  // Dedupe, lead first. A card naming the same character twice is a UI slip,
  // not a doubled bonus.
  const seen = []
  for (const id of ids) if (id && !seen.includes(id)) seen.push(id)
  return { ...card, characterId: seen[0], castIds: seen }
}

// Resolve a card's cast to { form, person } pairs, dropping ids that no longer
// resolve (a save whose roster was edited). Lead first.
export function castMembers(card, characters = [], people = []) {
  const ids = castIdsOf(card)
  if (!ids.length) return []
  const out = []
  for (const id of ids) {
    const form = characters.find((c) => c.id === id)
    if (!form) continue
    const person = form.personId ? people.find((p) => p.id === form.personId) ?? null : null
    out.push({ form, person })
  }
  return out
}

// ---- Standing ---------------------------------------------------------------

// What one cast member is WORTH right now, 0..100 — the number the player means
// by "this character's reputation".
//
// Recognition sets the floor and the form's own fame and the fandom's favour
// move it. Written as a floor rather than a blend on purpose: a form that has
// out-earned its character keeps every point it earned, and a fresh form of a
// household name is never worth nothing. `favorMultiplier` and
// `saturationMultiplier` are reused untouched, and both return exactly 1.0 for
// a one-form character — so a roster with no lineages feels only the floor.
export function castStanding(form, person = null) {
  if (!form) return 0
  const base = Math.max(form.fame ?? 0, (person?.recognition ?? 0) * RECOGNITION_FLOOR)
  return clamp(base * favorMultiplier(person, form.id) * saturationMultiplier(person), 0, 100)
}

// The print-time appeal bonus a card gets from its whole cast: the full sum of
// each member's pull, hard-capped.
//
// famePopBonus itself is deliberately untouched — it is the number every
// historical balance figure was measured against, and layering on top of it
// keeps them comparable, exactly as the person layer chose to do (see the
// comment in sets.js's popFactors).
export function castPopBonus(members, treatmentId = 'debut') {
  let sum = 0
  for (const { form, person } of members) {
    sum += famePopBonus(castStanding(form, person), treatmentId)
  }
  return clamp(sum, 0, CAST_POP_CAP)
}

// The card's LIVE cast standing, 0..100 — the strongest member on it, read
// fresh every week rather than frozen at print. The strongest rather than the
// sum because this one feeds a market multiplier: a card is "an Aryla card" on
// the strength of Aryla, and the supporting cast already paid at print.
export function liveCastStanding(card, characters = [], people = []) {
  let best = 0
  for (const { form, person } of castMembers(card, characters, people)) {
    const s = castStanding(form, person)
    if (s > best) best = s
  }
  return best
}

// The same read, from indexes built once. resolveMarket runs this over several
// thousand cards a week and a `.find()` per member would be O(cards x roster).
export function liveCastStandingIndexed(card, formById, personById) {
  let best = 0
  for (const id of castIdsOf(card)) {
    const form = formById.get(id)
    if (!form) continue
    const person = form.personId ? personById.get(form.personId) ?? null : null
    const s = castStanding(form, person)
    if (s > best) best = s
  }
  return best
}

// ---- The set-level sales term ----------------------------------------------

// How much a set's cast is helping it SELL this week, 0..CAST_APPEAL_MAX.
//
// This is the half of the feature that makes a cast worth building rather than
// worth printing once. popFactors freezes a card's appeal at print, so without
// this a character who becomes a household name three years later does nothing
// for the sets she is already in. Weighted toward the cards the set is actually
// chased for (signatures, secrets, treatments), and normalised by the same
// weight so a 250-card major is not punished for its bulk.
//
// Takes prebuilt indexes rather than the raw rosters: this runs over every card
// in the game once per set, every week.
// One pass over every card, accumulating { sum, weight } per set. ONE pass:
// scoring set by set walked the whole card array once per set, which on a late
// run (~40 sets, several thousand cards) is a few hundred thousand visits a
// week, each with a cast walk inside it.
export function castWeightBySet(cards, formById, personById) {
  const acc = new Map()
  for (const card of cards) {
    if (!card.setId || card.banned || card.rotated) continue
    if (!castIdsOf(card).length) continue
    const w = card.signature || card.secret || card.treatment ? 1.6 : 1
    const entry = acc.get(card.setId) ?? { sum: 0, weight: 0 }
    entry.sum += liveCastStandingIndexed(card, formById, personById) * w
    entry.weight += w
    acc.set(card.setId, entry)
  }
  return acc
}

// Turn one set's accumulated { sum, weight } into its appeal term.
export function castAppealOf(entry) {
  if (!entry || entry.weight <= 0) return 0
  // A set whose chase cards average a 60-recognition cast earns about half the
  // band; only a shelf of genuine icons reaches the top of it.
  const mean = entry.sum / entry.weight
  return Math.round(clamp((mean / 100) * CAST_APPEAL_MAX * 1.4, 0, CAST_APPEAL_MAX) * 1000) / 1000
}

// One set's term, for a caller that wants exactly one. refreshCastAppeal does
// NOT go through here — it wants the whole map and pays for the pass once.
export function castAppealFor(setId, cards, formById, personById) {
  return castAppealOf(castWeightBySet(cards, formById, personById).get(setId))
}

// Write this week's cast pull onto every set, in place, mirroring
// illustrationsets.js's refresh of `illustrationAppeal`. Skips the write when
// the number has not moved, so a quiet week allocates nothing.
export function refreshCastAppeal(next) {
  const formById = new Map((next.characters ?? []).map((c) => [c.id, c]))
  const personById = new Map((next.people ?? []).map((p) => [p.id, p]))
  const bySet = castWeightBySet(next.cards ?? [], formById, personById)
  next.sets = (next.sets ?? []).map((s) => {
    const appeal = castAppealOf(bySet.get(s.id))
    if ((s.castAppeal ?? 0) === appeal) return s
    return { ...s, castAppeal: appeal }
  })
}
