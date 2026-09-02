// Lineage kinds — the ways one character can grow out of another. Real card
// games have settled on a handful of shapes, and each one reads differently to
// the room: a Pokémon evolution keeps the base stage on the shelf, a Flesh and
// Blood young hero is retired the day the adult version prints, a Yu-Gi-Oh
// fusion needs two parents.
//
// Ids are permanent — they reach the save on every character record
// (characters.js's lineageKindId). `promotion` predates this catalogue and keeps
// its fame-inherit value so an older save behaves exactly as it did.
//
// What the sim reads from a kind:
//   fameInherit   — the share of each parent's fame the child debuts with.
//                   A kind that retires the parent transfers more, because the
//                   audience moves over; one that keeps both transfers less,
//                   because both keep earning.
//   archetypeRule — which archetypes the child may take, relative to the
//                   parent's (content/archetypes.js categories).
//   retiresParent — the parent stops taking new printings; its live cards keep
//                   selling and its fame keeps drifting off them. It does NOT
//                   stop the parent being built on again: see "closes a path"
//                   below.
//   parents       — how many parents the kind takes.
//   sameBeing     — the child IS the parent, later. See people.js: a run of
//                   same-being links collapses into ONE person, and the forms
//                   share that person's recognition. A kind with sameBeing false
//                   mints a new person that DESCENDS from the parents.
//   expectedDrift — how far fans expect the personality to move on this link,
//                   0..1 against content/demeanors.js's axes. A promotion that
//                   reinvents the character reads as "that isn't her"; a fall
//                   that stays cheerful reads as toothless. See continuityVerdict.
//   kinPull       — how hard a form's fame is pulled toward its person's
//                   recognition each week. This is what makes a hot form lift its
//                   siblings — the whole "fans recognise Aryla" effect.
//
// RETIREMENT CLOSES A PATH, NOT A PERSON. `retiresParent` used to also block the
// parent from ever being built on again, which made a branching story
// impossible: Aryla, Royal Soldier falls to Lost One Aryla, and Royal Commander
// Aryla could then never exist, because the fall had retired the character they
// both grow out of. A character whose story went two ways is the ordinary case in
// this genre, not an exotic one. So a retired form takes no new PRINTINGS and
// still takes new BRANCHES, and the pressure that retirement used to apply moved
// up to the person as saturation (people.js) — printing four forms of one
// character in thirty weeks is the thing that now costs you.

import { getArchetype } from './archetypes.js'

export const LINEAGE_KINDS = [
  {
    id: 'promotion', name: 'Promotion', parents: 1,
    precedent: 'Legend of the Five Rings “Experienced” cards, Star Wars CCG titles',
    short: 'the same character in a later role',
    blurb: 'Kell, Broken Boy becomes Kell, Royal Soldier. Same person, new title, new card. Both stay in print.',
    fameInherit: 0.35, archetypeRule: { type: 'free' }, retiresParent: false,
    sameBeing: true, expectedDrift: 0.25, kinPull: 0.04,
    childBeat: 'promotion', parentBeat: 'succeeded',
  },
  {
    id: 'evolution', name: 'Evolution', parents: 1,
    precedent: 'Pokémon stages, Digimon levels',
    short: 'a next stage of the same creature',
    blurb: 'The base stage stays on the shelf and stays wanted — collectors want the whole line. The next stage keeps the archetype.',
    fameInherit: 0.45, archetypeRule: { type: 'same' }, retiresParent: false,
    sameBeing: true, expectedDrift: 0.3, kinPull: 0.05,
    childBeat: 'evolution', parentBeat: 'succeeded',
  },
  {
    id: 'transformation', name: 'Transformation', parents: 1,
    precedent: 'Magic transform cards, Dragon Ball awakenings, Vanguard rides',
    short: 'an alternate form of the same being',
    blurb: 'One being, two faces. Their fame moves together every week: a hot base form lifts the awakened one and a flop drags both.',
    fameInherit: 0.5, archetypeRule: { type: 'free' }, retiresParent: false,
    sameBeing: true, expectedDrift: 0.55, kinPull: 0.1,
    childBeat: 'transformation', parentBeat: 'succeeded',
  },
  {
    id: 'fusion', name: 'Fusion', parents: 2,
    precedent: 'Yu-Gi-Oh fusion monsters, Digimon DNA digivolution',
    short: 'two characters combined into one',
    blurb: 'Two parents, one child. It debuts with a share of both fames, and a run that links all three reads as one story to the cohesion scorer.',
    fameInherit: 0.25, archetypeRule: { type: 'free' }, retiresParent: false,
    sameBeing: false, expectedDrift: 0.5, kinPull: 0.02,
    childBeat: 'fusion', parentBeat: 'succeeded',
  },
  {
    id: 'growth', name: 'Growth', parents: 1,
    precedent: 'Flesh and Blood young heroes growing into adult heroes',
    short: 'the character, grown up',
    blurb: 'The young version steps aside the day the grown one prints. It carries more of the fame over, because the audience follows.',
    fameInherit: 0.55, archetypeRule: { type: 'sameCategory' }, retiresParent: true,
    sameBeing: true, expectedDrift: 0.4, kinPull: 0.06,
    childBeat: 'growth', parentBeat: 'retired',
  },
  {
    id: 'fall', name: 'Fall', parents: 1,
    precedent: 'Anakin to Vader, Digimon dark digivolution',
    short: 'a hero turned antagonist',
    blurb: 'The old self is gone. The new one must take an antagonist archetype, and inherits the fame — villains grow on the heat that would sink a mascot.',
    fameInherit: 0.5, archetypeRule: { type: 'category', category: 'antagonists' }, retiresParent: true,
    sameBeing: true, expectedDrift: 0.85, kinPull: 0.03,
    childBeat: 'corruption', parentBeat: 'retired',
  },
  {
    id: 'successor', name: 'Successor', parents: 1,
    precedent: 'a new hero taking up the mantle',
    short: 'a new character inherits the name',
    blurb: 'Not the same person: an heir, an apprentice, the next to carry the title. The predecessor retires; some of the goodwill carries over, most has to be earned.',
    fameInherit: 0.4, archetypeRule: { type: 'free' }, retiresParent: true,
    sameBeing: false, expectedDrift: 0.6, kinPull: 0.02,
    childBeat: 'succession', parentBeat: 'retired',
  },
  {
    id: 'ascension', name: 'Ascension', parents: 1,
    precedent: 'a mortal becomes a god — Digimon mega forms, Exalted/avatar cards',
    short: 'the same being, made something greater',
    blurb: 'The card face need not even carry the name any more. It is still them, and the room works that out — see "carries the name" on the form.',
    fameInherit: 0.6, archetypeRule: { type: 'category', category: 'mythic' }, retiresParent: false,
    sameBeing: true, expectedDrift: 0.7, kinPull: 0.06,
    childBeat: 'ascension', parentBeat: 'succeeded',
  },
]

export function getLineageKind(id) {
  return LINEAGE_KINDS.find((k) => k.id === id) ?? null
}

// The kind's archetype rule, in words the editor can show.
export function archetypeRuleText(kind) {
  const r = kind?.archetypeRule
  if (!r || r.type === 'free') return 'any archetype'
  if (r.type === 'same') return 'the same archetype as the parent'
  if (r.type === 'sameCategory') return 'an archetype in the parent’s category'
  return `an archetype in the ${r.category} category`
}

// Whether `childArchetypeId` satisfies the kind's rule against
// `parentArchetypeId`. For a two-parent kind the primary parent decides.
export function archetypeAllowed(kind, parentArchetypeId, childArchetypeId) {
  const r = kind?.archetypeRule
  if (!r || r.type === 'free') return true
  const parent = getArchetype(parentArchetypeId)
  const child = getArchetype(childArchetypeId)
  if (r.type === 'same') return parent.id === child.id
  if (r.type === 'sameCategory') return parent.category === child.category
  return child.category === r.category
}
