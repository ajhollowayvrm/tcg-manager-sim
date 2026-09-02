// Character roster — the persistent "who", parallel to artists.js's persistent
// "whose art". A character isn't tied to one card or one set: it recurs across
// printings, and each new appearance both DRAWS ON and FEEDS its accumulated
// fame — the Charizard-as-a-character effect from the v2 addendum.
//
// Unlike an artist (static identity + a drifting career the roster seeds), a
// character has NO static identity — the player mints one from scratch in the
// set builder. So there's no seed/live split here: the record in state.characters
// IS the character, full stop.
//
// Fame (0–100) drifts weekly, driven by how its LIVE cards are actually doing —
// price momentum and hype (chase pulls), punch, and any controversy heat —
// rather than a pure random walk. A character with no live cards just idles.
//
// A character also has an IDENTITY: an archetype (content/archetypes.js), up to
// two traits (content/traits.js), a one-line hook and pronouns. The archetype is
// the only one of those with mechanical weight — it bends the fame curve here and
// earns a theme-cohesion bonus in sets.js. The rest exists to be SAID: the
// community chatter in personas.js and the detail view read it, because a cast
// nobody talks about is a cast nobody gets attached to.
//
// The career itself is recorded as STORY BEATS — debut, breakout, icon, a fall,
// a comeback — so a fame curve reads as a narrative instead of a line.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { getArchetype } from './content/archetypes.js'
import { getLineageKind, archetypeAllowed, archetypeRuleText } from './content/lineages.js'
import { MAX_TRAITS } from './content/traits.js'
import { MAX_DEMEANORS } from './content/demeanors.js'
// cast.js imports famePopBonus from here in turn. The cycle is fine and matches
// the one this file already has with simulation.js: both sides use only hoisted
// function declarations, never a module-scope value from the other.
import { cardFeaturesForm } from './cast.js'

// Weeks a trajectory must hold before it can graduate, so an arc unfolds over a
// real run instead of flipping every card release.
const ICON_FAME_FLOOR = 85
const ICON_WEEKS_REQUIRED = 40
const ICON_DEMOTE_FAME = 30 // an icon this neglected can (rarely) fall from grace
const ICON_DEMOTE_WEEKS = 80
const ESTABLISHED_FAME_FLOOR = 55
const ESTABLISHED_WEEKS_REQUIRED = 20
const RECOVERY_WEEKS_REQUIRED = 26

// A character's STORY: the handful of moments in a career worth remembering, so
// a fame curve reads as a narrative instead of a line. Capped, because a 312-week
// run would otherwise grow this array without bound inside the save.
const MAX_BEATS = 12
// A rolling year of fame samples — enough for the detail view's sparkline, and a
// hard ceiling on what one character costs the save.
const FAME_HISTORY_WEEKS = 52

// How far a lineage chain may be walked. Guards a cycle smuggled in through an
// imported save; the assignment path refuses to create one in the first place.
export const MAX_PROMOTION_DEPTH = 5

// Treatment tiers a signature card can carry when it features an EXISTING
// character. Each is a cost multiplier on the card's artist commission (a bigger
// treatment costs more to produce) and an appeal multiplier on the fame bonus the
// card gets from the character (see famePopBonus). 'icon' is gated on the
// character actually having graduated — it's the reward for a character that
// blew up, not something you can buy on day one.
export const TREATMENTS = [
  { id: 'debut', name: 'Debut appearance', costMul: 1, appealMul: 1, requiresIcon: false,
    blurb: "The character's first-ever printing — no fame to draw on yet, but it starts their story." },
  { id: 'standard', name: 'Standard reprint', costMul: 1, appealMul: 1.15, requiresIcon: false,
    blurb: 'A straightforward new appearance, riding the fame the character already has.' },
  { id: 'premium', name: 'Premium treatment', costMul: 1.5, appealMul: 1.45, requiresIcon: false,
    blurb: 'A bigger, pricier printing that leans harder into the character’s pull.' },
  { id: 'icon', name: 'Icon treatment', costMul: 2.2, appealMul: 1.9, requiresIcon: true,
    blurb: 'A reserved alt-art/foil slot for characters who’ve graduated to icon status.' },
]

export function getTreatment(id) {
  return TREATMENTS.find((t) => t.id === id) ?? TREATMENTS[0]
}

// Fresh character roster. Empty by default — see content/characters.js.
export function seedCharacters() {
  return []
}

export function getCharacter(state, id) {
  return (state.characters ?? []).find((c) => c.id === id) ?? null
}

// Same reload-collision hazard as rarities.js's rid(), and worse here: cards
// reference a character by id (card.characterId), so a fresh `char_1` colliding
// with a saved one after a reload would silently re-point old cards at the new
// character. Timestamp + counter keeps ids unique across sessions.
let _uid = 0
function characterId() {
  _uid += 1
  return `char_${Date.now().toString(36)}${_uid.toString(36)}`
}

// Mint a brand-new character.
//
// The second argument used to be a free-text `species` string. It is now an
// OPTIONS OBJECT carrying the character's identity — archetype, traits, hook,
// pronouns and the (still free-text, now optional) species epithet. The old
// positional string is still accepted, because a call site that has not been
// updated must mint a working character rather than a character whose identity
// object is the word "dragon".
//
// `archetypeId` is the one identity field with mechanical weight: it biases fame
// drift here and earns a theme-cohesion bonus in sets.js. Everything else is
// flavor the community chatter and the detail view read.
//
// Starts with a small seed of fame (a debut is still a debut) and a 'rising'
// trajectory; whether it actually rises is earned by how its cards perform.
export function createCharacter(name, opts = {}) {
  const o = typeof opts === 'string' ? { species: opts } : (opts ?? {})
  return {
    id: characterId(),
    name: name.trim() || 'Unnamed Character',
    archetypeId: getArchetype(o.archetypeId).id, // unknown/absent → 'unaligned'
    traits: (o.traits ?? []).slice(0, MAX_TRAITS),
    hook: (o.hook ?? '').trim(),
    pronouns: (o.pronouns ?? '').trim(),
    species: (o.species ?? '').trim(), // optional epithet — "the Ashen"
    // ---- The form's half of the person/form split (see people.js) ----------
    // A character record is a FORM of a person. `personId` is DERIVED — it is
    // recomputed by derivePeople on every load and stripped from the save — so
    // nothing here should ever treat it as authoritative before hydrate runs.
    personId: o.personId ?? null,
    // The roster label, separate from the card face. "Royal Commander" beside a
    // card whose name is "Royal Commander Aryla", or beside one called "The
    // Divine Channel" that never says Aryla at all.
    formName: (o.formName ?? '').trim(),
    // The measurable half of this form's personality (content/demeanors.js).
    // Traits stay flavour; these carry the axes continuityDrift reads.
    demeanorIds: (o.demeanorIds ?? []).slice(0, MAX_DEMEANORS),
    // Does the card face carry the person's name? The Divine Channel does not,
    // and the room takes a while to work out who she is — see recognisedWeek.
    carriesName: o.carriesName ?? true,
    recognisedWeek: null,
    // The week this form was last printed. Read by people.js's favour drift, so
    // a form that is still in rotation holds the fandom better than one that is
    // not. Set by recordAppearance.
    lastPrintedWeek: null,
    // PROMOTION. The character this one grew out of — "Kell, Broken Boy" into
    // "Kell, Royal Soldier". They are two separate roster entries on purpose:
    // the promoted form has its own archetype, its own fame curve and its own
    // cards, exactly as a second-stage evolution is its own card rather than a
    // sticker on the first. The link is what lets illustrationsets.js's
    // relatedCast scorer see a line built from the pair as one line; without it
    // that group scores zero on same-character and the mechanic refuses to
    // recognise the case it exists for.
    //
    // LOCKED ON DEBUT, exactly as archetypeId is (see the reducer's editable
    // field list). A re-pointable lineage is a free exploit: you would wait to
    // see which of your characters got hot and then declare everyone descended
    // from them.
    promotedFromId: o.promotedFromId ?? null,
    // The KIND of link (content/lineages.js) and every parent. promotedFromId
    // stays the primary parent so every older reader keeps working; a fusion
    // lists its second parent here only.
    lineageKindId: o.lineageKindId ?? (o.promotedFromId ? 'promotion' : null),
    lineageParentIds: o.lineageParentIds ?? (o.promotedFromId ? [o.promotedFromId] : []),
    // Set when a lineage kind retires this character (growth, fall, successor):
    // no new printings, but its live cards keep selling and its fame drifts on.
    retiredWeek: null,
    debutSetId: null,
    debutWeek: null,
    appearances: [], // { cardId, setId, treatment }
    // A linked character arrives KNOWN. Kell, Royal Soldier is famous on day
    // one because Kell, Broken Boy was, and a debut that starts from 12 would
    // throw that away — the whole point of a lineage is that the audience
    // already cares. `_inheritFame` is the fame already scaled by the kind's
    // inherit share, passed by createLineageCharacter below, which is the only
    // thing that knows the parents' current fame.
    fame: clamp(12 + (o._inheritFame ?? 0), 0, 100),
    fameHistory: [], // rounded weekly samples, newest last, capped
    beats: [], // { week, kind, label } — the character's story so far
    trajectory: 'rising', // 'rising' | 'established' | 'fading' | 'icon'
    weeksInTrajectory: 0,
  }
}

// Bring a character record up to the current shape.
//
// Characters entered the save at v8 with seven fields and no identity beyond a
// free-text species. Archetypes, traits, beats and fame history are ADDITIVE, so
// this change deliberately does NOT bump the save VERSION — a run in progress is
// worth more than a tidy schema. persistence.js's hydrate() maps every loaded
// character through here instead, which is the character-shaped equivalent of the
// CARD_DEFAULTS restore already happening beside it.
//
// An older character normalises onto 'unaligned', whose multipliers are all 1 and
// whose tag list is empty — so its fame behaves exactly as it did before.
export function normalizeCharacter(c) {
  if (!c) return null
  return {
    ...c,
    archetypeId: getArchetype(c.archetypeId).id,
    traits: (c.traits ?? []).slice(0, MAX_TRAITS),
    hook: c.hook ?? '',
    pronouns: c.pronouns ?? '',
    species: c.species ?? '',
    debutWeek: c.debutWeek ?? null,
    promotedFromId: c.promotedFromId ?? null,
    // Lineage fields are ADDITIVE too: a pre-catalogue promotion normalises onto
    // the 'promotion' kind with its one parent, and behaves exactly as before.
    lineageKindId: getLineageKind(c.lineageKindId)?.id ?? (c.promotedFromId ? 'promotion' : null),
    lineageParentIds: Array.isArray(c.lineageParentIds) && c.lineageParentIds.length
      ? c.lineageParentIds
      : (c.promotedFromId ? [c.promotedFromId] : []),
    retiredWeek: c.retiredWeek ?? null,
    // Form fields, additive exactly as the lineage fields above are: a save that
    // predates the person layer normalises onto a nameless, demeanourless form
    // that carries its own name, which is what every character was.
    personId: c.personId ?? null,
    formName: c.formName ?? '',
    demeanorIds: (c.demeanorIds ?? []).slice(0, MAX_DEMEANORS),
    carriesName: c.carriesName ?? true,
    recognisedWeek: c.recognisedWeek ?? null,
    lastPrintedWeek: c.lastPrintedWeek ?? null,
    appearances: c.appearances ?? [],
    fameHistory: c.fameHistory ?? [],
    beats: c.beats ?? [],
  }
}

// Append a story beat, keeping the array bounded.
//
// The DEBUT is pinned and never evicted. Trimming purely from the front looked
// right until a long career proved otherwise: a character who rises, falls and
// recovers a few times files enough beats to push past MAX_BEATS, and the first
// row to go was the one the timeline exists to open with. A story that starts in
// the middle is worse than a story missing a middle chapter, so the oldest
// NON-debut beat is dropped instead.
function withBeat(c, week, kind, label) {
  const beats = [...(c.beats ?? []), { week, kind, label }]
  if (beats.length <= MAX_BEATS) return beats
  const debut = beats.find((b) => b.kind === 'debut')
  const rest = beats.filter((b) => b.kind !== 'debut')
  return debut ? [debut, ...rest.slice(-(MAX_BEATS - 1))] : beats.slice(-MAX_BEATS)
}

// True when this character has already been given a beat of this kind.
//
// Guards the beats that are FIRST-TIME MILESTONES — breaking out, and becoming
// an icon. Those read as "it finally happened" and are nonsense filed twice.
// `fall` and `comeback` are deliberately NOT guarded: a second fall from grace
// is a real second act, and suppressing it would flatten exactly the arc this
// timeline is for.
function hasBeat(c, kind) {
  return (c.beats ?? []).some((b) => b.kind === kind)
}

// The baseline pop-factor bump a card gets from featuring a character, before
// the treatment's appealMul is applied. A brand-new character (fame ~12) adds
// almost nothing; an icon-tier character (fame 100) adds a hefty built-in draw —
// "a new Pikachu card gets demand no matter how it's designed".
export function famePopBonus(fame, treatmentId = 'debut') {
  const mul = getTreatment(treatmentId).appealMul
  return clamp(fame * 0.28 * mul, 0, 45)
}

// ---- Lineage ----------------------------------------------------------------
// The ways one character grows out of another — promotion, evolution,
// transformation, fusion, growth, fall, successor. The catalogue and what each
// kind means live in content/lineages.js; this section is the mechanics.

// Every parent of a character. A fusion has two; every older record has the
// one in promotedFromId.
export function lineageParents(c) {
  if (!c) return []
  if (Array.isArray(c.lineageParentIds) && c.lineageParentIds.length) return c.lineageParentIds
  return c.promotedFromId ? [c.promotedFromId] : []
}

// Would making `childId` a child of `parentId` close a loop? Walks every
// ancestor of the proposed parent looking for the child. A cycle here would
// hang every consumer that follows the chain — the cohesion scorer's ancestry
// index, the Lineages panel's tree — so it is refused at the point of creation
// rather than defended against everywhere afterwards.
export function wouldCycle(characters, childId, parentId) {
  if (!parentId) return false
  if (childId && childId === parentId) return true
  const byId = new Map((characters ?? []).map((c) => [c.id, c]))
  const seen = new Set()
  // Depth-first over every parent, depth-capped like the single chain was.
  const stack = [[parentId, 0]]
  while (stack.length) {
    const [id, depth] = stack.pop()
    if (id === childId) return true
    if (seen.has(id)) continue
    seen.add(id)
    if (depth >= MAX_PROMOTION_DEPTH) return true // too deep to allow another link
    const cur = byId.get(id)
    if (!cur) continue
    for (const p of lineageParents(cur)) {
      if (p === id) return true // an existing self-loop; refuse to extend it
      stack.push([p, depth + 1])
    }
  }
  return false
}

// Every ancestor of a character, nearest first (breadth-first over parents),
// capped at MAX_PROMOTION_DEPTH generations.
export function promotionChain(characters, id) {
  const byId = new Map((characters ?? []).map((c) => [c.id, c]))
  const out = []
  const seen = new Set([id])
  let frontier = lineageParents(byId.get(id))
  let depth = 0
  while (frontier.length && depth < MAX_PROMOTION_DEPTH) {
    const next = []
    for (const pid of frontier) {
      const p = byId.get(pid)
      if (!p || seen.has(pid)) continue
      seen.add(pid)
      out.push(p)
      next.push(...lineageParents(p))
    }
    frontier = next
    depth++
  }
  return out
}

// Why a proposed link is not allowed, or null when it is. Read by the editors
// (so the player is told before release) and by createLineageCharacter (so a
// stale draft cannot smuggle one through).
export function validateLineage(characters, { kindId, parentIds, archetypeId }) {
  const kind = getLineageKind(kindId)
  if (!kind) return 'Pick a kind of lineage.'
  const ids = (parentIds ?? []).filter(Boolean)
  if (ids.length !== kind.parents) {
    return kind.parents === 2 ? 'A fusion needs two different parents.' : 'Pick the character this one grows out of.'
  }
  if (new Set(ids).size !== ids.length) return 'A fusion needs two different parents.'
  const byId = new Map((characters ?? []).map((c) => [c.id, c]))
  for (const pid of ids) {
    const p = byId.get(pid)
    if (!p) return 'That parent is no longer on the roster.'
    // A RETIRED FORM MAY STILL BE BUILT ON. This used to refuse the link, and
    // that refusal made an ordinary story impossible: Aryla, Royal Soldier falls
    // into Lost One Aryla, and Royal Commander Aryla can then never exist,
    // because the fall retired the form they both grow out of. A character whose
    // story went two ways is the normal case in this genre.
    //
    // Retirement now closes a PATH, not a person: the form takes no new
    // printings (the pickers still filter on retiredWeek) and still takes new
    // branches. The pressure retirement used to apply moved up to the person as
    // saturation — see people.js.
    if (wouldCycle(characters, null, pid)) return `${p.name}'s line is already as long as a line can be.`
  }
  const primary = byId.get(ids[0])
  if (!archetypeAllowed(kind, primary.archetypeId, archetypeId)) {
    return `A ${kind.name.toLowerCase()} must take ${archetypeRuleText(kind)}.`
  }
  return null
}

// Mint a character that grows out of one or two others. Returns
// { characters, child } with the child appended and the parents patched, or
// null when validateLineage refuses — the caller decides what to do then.
//
// Fame: 12 plus each parent's fame scaled by the kind's inherit share. Beats:
// the child records the link; each parent records that it was succeeded or
// stepped aside. Neither is guarded by hasBeat — a character can be built on
// more than once across a long run (Broken Boy into Royal Soldier into
// Kingsguard) and each step is a real turning point. A retiring kind stamps
// retiredWeek on the parent, which the pickers read.
export function createLineageCharacter(characters, { name, identity, kindId, parentIds, week, people }) {
  const kind = getLineageKind(kindId)
  const ids = (parentIds ?? []).filter(Boolean)
  const o = identity ?? {}
  if (validateLineage(characters, { kindId, parentIds: ids, archetypeId: o.archetypeId })) return null
  const byId = new Map(characters.map((c) => [c.id, c]))
  const parents = ids.map((id) => byId.get(id))
  // A new form debuts off whichever is kinder: the parent forms' own fame, or
  // the CHARACTER's standing with the audience.
  //
  // The second term is the point of the person layer. The Divine Channel grows
  // out of Lost One Aryla, and if the Lost One's own cards happened to go cold
  // the ascension would debut unknown — even though everyone knows Aryla. A
  // character's audience does not reset because one form of her underperformed.
  // Reading the person's recognition fixes that, and reading the MAX of the two
  // means this can only ever help, so no existing balance line moves down.
  const parentFame = parents.reduce((sum, p) => sum + (p.fame ?? 0) * kind.fameInherit, 0)
  const person = kind.sameBeing && people
    ? (people ?? []).find((x) => x.id === parents[0]?.personId)
    : null
  const inherit = Math.max(parentFame, (person?.recognition ?? 0) * kind.fameInherit)
  const child = createCharacter(name, {
    ...o,
    promotedFromId: ids[0],
    lineageKindId: kind.id,
    lineageParentIds: ids,
    _inheritFame: inherit,
  })
  const parentNames = parents.map((p) => p.name).join(' and ')
  const childLabel = kind.parents === 2 ? `Fused from ${parentNames}` : `Grew out of ${parentNames} (${kind.name.toLowerCase()})`
  const linkedChild = { ...child, beats: withBeat(child, week ?? 0, kind.childBeat, childLabel) }
  const patched = characters.map((c) => {
    if (!ids.includes(c.id)) return c
    if (kind.retiresParent) {
      return { ...c, retiredWeek: week ?? 0, beats: withBeat(c, week ?? 0, 'retired', `Stepped aside for ${child.name}`) }
    }
    return { ...c, beats: withBeat(c, week ?? 0, 'succeeded', `${child.name} carries the story on`) }
  })
  return { characters: [...patched, linkedChild], child: linkedChild }
}

// Fame used to be linked here for the `transformation` kind alone: the child and
// parent were pulled toward their shared mean every week, because they are one
// being with two faces.
//
// That is now the general case rather than a special one. EVERY same-being link
// pulls its form toward the person's recognition, at a strength the lineage kind
// names (`kinPull`) — transformation simply keeps the strongest pull, at the
// same 0.1 it always had, so its behaviour is unchanged. The mechanic lives in
// people.js's driftPeople, which runs immediately after driftCharacters below.

// Record a new appearance (called on set release for every signature card that
// features an existing character). Bumps fame by how good a showing it was —
// bigger for a richer treatment and for a genuinely appealing card — and files
// the debut set if this is the character's first printing. Returns the patched
// characters array.
export function recordAppearance(characters, id, { cardId, setId, treatment, popFactors, week, setName }) {
  return characters.map((c) => {
    if (c.id !== id) return c
    const t = getTreatment(treatment)
    const appeal = ((popFactors?.hype ?? 40) + (popFactors?.artAppeal ?? 40)) / 2
    const bump = clamp(3 + (appeal / 100) * 10 * t.appealMul, 0, 18)
    const debuting = !c.debutSetId
    return {
      ...c,
      debutSetId: c.debutSetId ?? setId,
      debutWeek: c.debutWeek ?? week ?? null,
      // Read by people.js's favour drift: a form still being printed holds the
      // fandom better than one that is not.
      lastPrintedWeek: week ?? c.lastPrintedWeek ?? null,
      appearances: [...(c.appearances ?? []), { cardId, setId, treatment }],
      fame: clamp(c.fame + bump, 0, 100),
      // The first printing opens the character's story. It goes FIRST even
      // when a lineage beat was filed at creation, so a timeline always opens
      // on the debut.
      beats: debuting
        ? [{ week: week ?? 0, kind: 'debut', label: setName ? `Debuted in ${setName}` : 'First printing' }, ...(c.beats ?? [])]
        : (c.beats ?? []),
    }
  })
}

// A character's live, unbanned/unrotated cards — the signal fame drift reads.
// Membership goes through cardFeaturesForm, so a SUPPORTING credit counts: a
// card you share with somebody else is still your card, and if this only read
// the lead then naming a second character would cost them nothing and earn them
// nothing, which would make the whole relationship decorative.
function liveCardsFor(state, id) {
  return (state.cards ?? []).filter(
    (c) => cardFeaturesForm(c, id) && !c.banned && !c.rotated,
  )
}

// -1..+1 read on how a character's cards are doing this week: rich in momentum,
// hype, and punch (with ban pressure biting) reads strongly positive; flat,
// unloved cards read negative. 0 (idle) if the character has no live cards.
//
// The archetype scales the controversy term only. At the default 1 heat is the
// mixed blessing it has always been; a mascot's 1.5 makes a scandal bite harder,
// and a villain's NEGATIVE fuel flips it, so the heat that would sink a mascot
// feeds them instead. See content/archetypes.js.
function performanceSignal(cards, archetype) {
  if (!cards.length) return 0
  const fuel = archetype?.controversyFuel ?? 1
  let sum = 0
  for (const c of cards) {
    const f = c.popFactors ?? {}
    const momentum = clamp((c.momentum ?? 0) / 3, -1, 1)
    const hype = clamp(((c.hype ?? 0) - 0.4) / 1.2, -1, 1)
    const punch = clamp((f.punch - 50) / 50, -1, 1)
    const banBite = clamp((c.controversy ?? 0) / 100, 0, 1) * -0.4 * fuel
    sum += momentum * 0.35 + hype * 0.3 + punch * 0.35 + banBite
  }
  return clamp(sum / cards.length, -1, 1)
}

// Advance one character's fame + trajectory a week, given its performance signal.
// Also files any STORY BEAT the week's transitions earn, so the detail view can
// read a career as a narrative rather than a number.
function driftOne(c, signal, rng, week, archetype) {
  let { fame, trajectory, weeksInTrajectory } = c
  let beats = c.beats ?? []
  weeksInTrajectory += 1

  // Signal-driven drift, small per week (a career arc, not a coin flip) with a
  // touch of noise so two characters with identical cards don't move in lockstep.
  const raw = signal * range(rng, 1.2, 2.4) + range(rng, -0.4, 0.4)
  // The archetype bends the curve: how fast fame climbs on a good week, and how
  // hard it falls on a bad one. A mascot burns bright and bruises easily; a
  // legendary takes an era to build and an era to forget.
  const base = raw >= 0 ? raw * (archetype?.riseMul ?? 1) : raw * (archetype?.fadeMul ?? 1)

  switch (trajectory) {
    case 'icon': {
      // Icons barely move — fame is a legacy at this point — but sustained neglect
      // (idle or genuinely disliked cards for a long stretch) can end the era.
      fame = clamp(fame + base * 0.25, 0, 100)
      if (fame <= ICON_DEMOTE_FAME && weeksInTrajectory > ICON_DEMOTE_WEEKS) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
      break
    }
    case 'established': {
      fame = clamp(fame + base * 0.6, 0, 100)
      if (fame >= ICON_FAME_FLOOR && weeksInTrajectory > ICON_WEEKS_REQUIRED && rng() < 0.03) {
        trajectory = 'icon'
        weeksInTrajectory = 0
      } else if (fame < 35 && weeksInTrajectory > 30 && rng() < 0.02) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
      break
    }
    case 'fading': {
      fame = clamp(fame + Math.min(base, 0.3), 0, 100) // fading resists a positive jolt, doesn't erase it
      if (fame < 6) fame = clamp(fame + range(rng, 0, 0.3), 0, 100) // floors out rather than vanishing
      if (fame >= ESTABLISHED_FAME_FLOOR && weeksInTrajectory > RECOVERY_WEEKS_REQUIRED) {
        trajectory = 'rising' // a real comeback re-earns established the normal way
        weeksInTrajectory = 0
      }
      break
    }
    default: {
      // rising
      fame = clamp(fame + base, 0, 100)
      if (fame >= ESTABLISHED_FAME_FLOOR && weeksInTrajectory > ESTABLISHED_WEEKS_REQUIRED) {
        trajectory = 'established'
        weeksInTrajectory = 0
      } else if (fame < 8 && weeksInTrajectory > 30 && rng() < 0.03) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
    }
  }

  // ---- Story beats --------------------------------------------------------
  // Read off the trajectory transition rather than off a raw fame threshold, so
  // one beat means one real turning point. A fame value wobbling either side of
  // the established floor would otherwise file "breakout" week after week.
  if (trajectory !== c.trajectory) {
    const from = c.trajectory
    if (trajectory === 'icon' && !hasBeat(c, 'icon')) {
      beats = withBeat({ ...c, beats }, week, 'icon', 'Became a household face')
    } else if (trajectory === 'established' && !hasBeat(c, 'breakout')) {
      beats = withBeat({ ...c, beats }, week, 'breakout', 'Broke out — a name people know')
    } else if (trajectory === 'fading') {
      const label = from === 'icon' ? 'Fell from grace' : from === 'established' ? 'Slipped out of the conversation' : 'Never caught on'
      beats = withBeat({ ...c, beats }, week, 'fall', label)
    } else if (trajectory === 'rising' && from === 'fading') {
      beats = withBeat({ ...c, beats }, week, 'comeback', 'Started a comeback')
    }
  }

  const rounded = Math.round(fame * 10) / 10
  // A rolling year of samples for the detail view's sparkline. Bounded, so a
  // 312-week run costs one character 52 numbers rather than 312.
  const fameHistory = [...(c.fameHistory ?? []), Math.round(rounded)].slice(-FAME_HISTORY_WEEKS)

  return { ...c, fame: rounded, fameHistory, beats, trajectory, weeksInTrajectory }
}

// Advance every character's fame one week, reading their live cards' performance.
// Mutates next.characters in place, mirroring driftArtists.
export function driftCharacters(next) {
  if (!next.characters?.length) return
  const rng = makeRng(hashSeed(`characters:${next.week}`))
  next.characters = next.characters.map((c) => {
    // Resolved once per character per week and passed down, so performanceSignal
    // and driftOne can never disagree about which archetype they are reading.
    const archetype = getArchetype(c.archetypeId)
    const signal = performanceSignal(liveCardsFor(next, c.id), archetype)
    return driftOne(c, signal, rng, next.week, archetype)
  })
}
