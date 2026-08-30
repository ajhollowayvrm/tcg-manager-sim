// Character archetypes — the CATEGORY a member of the persistent cast belongs
// to, and the first thing about a character that carries mechanical weight.
//
// NAME COLLISION, READ THIS FIRST. There used to be a `src/game/archetypes.js`.
// It was a COMPETITIVE module — aggro/control/combo/midrange deck archetypes and
// a `shiftAway` metagame dial — and it was deleted outright at save v13 when the
// competitive engine came out (see the version log in persistence.js, and
// docs/BRIEF.md, which still records the removal). docs/ARCHETYPES_PLAN.md plans
// THAT module and is dead; do not build on it. This file is unrelated to all of
// it: different path, different concept, no deck ever involved.
//
// This table replaces the old free-text `species` field as the character's
// identity. That field was documented in characters.js as "purely cosmetic, no
// mechanical weight", and it was: nothing in the sim read it, and the only place
// it surfaced was a subtitle in CastPanel. A cast that the sim never reads is a
// cast the player never gets attached to. (`species` still exists as an optional
// epithet — "the Ashen", "a frost drake" — it just stopped being the identity.)
//
// An archetype does two things:
//
//   1. THEME COHESION. Each archetype carries `tags` drawn from the SAME
//      vocabulary as content/themes.js. A character whose archetype matches the
//      set's theme reads as a coherent printing and earns an art-appeal and hype
//      bonus, exactly the way an artist's `specialty` match already does in
//      sets.js's popFactors. The bonus is deliberately smaller than the artist
//      match (+10 against +20): who is on the card matters less than who drew it.
//
//   2. FAME DRIFT BIAS. characters.js drifts fame weekly off how a character's
//      live cards perform. The archetype bends that curve — how fast fame climbs
//      on a good week (`riseMul`), how hard it falls on a bad one (`fadeMul`),
//      and whether controversy heat is a wound or a meal (`controversyFuel`).
//      A mascot burns bright and bruises easily; a villain grows on the heat that
//      would sink one.
//
// Fields:
//   category        — grouping for the pickers (see ARCHETYPE_CATEGORIES)
//   tags            — theme tags, from content/themes.js's vocabulary
//   riseMul         — multiplies POSITIVE weekly fame drift
//   fadeMul         — multiplies NEGATIVE weekly fame drift
//   controversyFuel — scales the controversy term in performanceSignal. 1 is the
//                     normal penalty; above 1 stings more; NEGATIVE flips it, so
//                     heat feeds the character instead of hurting it.
//   voice           — selects which chatter pool the community uses for them
//                     (see CHARACTER_LINES in personas.js)
//   traitHints      — trait ids the creation form offers first (content/traits.js).
//                     A suggestion, never a restriction — any trait fits any
//                     archetype.
//
// Every multiplier is kept inside 0.7–1.25 and every `controversyFuel` inside
// -0.6–1.5. The audit remediation pass measured the balance bands over 312 weeks
// (see README); a wider dial here would move them for no design gain. Mirrors
// content/gimmicks.js, whose values are bounded for the same reason.
//
// IDS ARE LOAD-BEARING. A character record stores `archetypeId` and that record
// is persisted. Renaming an id orphans every saved character onto the fallback,
// the same hazard content/themes.js refuses to take with its own ids.

export const ARCHETYPE_CATEGORIES = [
  { id: 'faces', name: 'Faces', blurb: 'The ones on the box. Warm, marketable, and the first thing a new player recognises.' },
  { id: 'antagonists', name: 'Antagonists', blurb: 'The ones the story needs to beat. They thrive on exactly the attention that hurts a mascot.' },
  { id: 'mythic', name: 'Mythic', blurb: 'Rare, old, and slow. They take an era to build and an era to forget.' },
  { id: 'supporting', name: 'Supporting cast', blurb: 'The rest of the world. Quieter arcs, steadier value.' },
]

export const ARCHETYPES = [
  // ---- Faces — fast to love, easy to bruise -------------------------------
  {
    id: 'mascot', name: 'Mascot', category: 'faces',
    tags: ['cute', 'beasts', 'nature'],
    riseMul: 1.25, fadeMul: 1.2, controversyFuel: 1.5,
    voice: 'warm',
    traitHints: ['cheerful', 'loyal', 'stubborn'],
    blurb: 'The face on the box. Climbs faster than anything else in the cast — and a scandal lands twice as hard, because nobody forgives a mascot.',
  },
  {
    id: 'starter', name: 'Starter', category: 'faces',
    tags: ['nature', 'cute', 'elemental'],
    riseMul: 1.1, fadeMul: 0.8, controversyFuel: 1.2,
    voice: 'warm',
    traitHints: ['earnest', 'cheerful', 'clumsy'],
    blurb: "The one they picked first and never sold. A gentler climb than a mascot's, but the goodwill is remarkably hard to lose.",
  },
  {
    id: 'rival', name: 'Rival', category: 'faces',
    tags: ['sports', 'racing', 'knights'],
    riseMul: 1.15, fadeMul: 1.05, controversyFuel: 0.8,
    voice: 'brash',
    traitHints: ['arrogant', 'driven', 'loyal'],
    blurb: 'The one who beats you in the tutorial. Thrives on comparison, and a little friction only sharpens the story.',
  },

  // ---- Antagonists — heat is a resource ------------------------------------
  {
    id: 'villain', name: 'Villain', category: 'antagonists',
    tags: ['undead', 'horror', 'noir'],
    riseMul: 0.9, fadeMul: 0.7, controversyFuel: -0.5,
    voice: 'menace',
    traitHints: ['vain', 'patient', 'theatrical'],
    blurb: 'Heat that would sink a mascot only makes the villain bigger. Slow to build, and very slow to fade.',
  },
  {
    id: 'beast', name: 'Beast', category: 'antagonists',
    tags: ['kaiju', 'beasts', 'dragons'],
    riseMul: 1.05, fadeMul: 0.95, controversyFuel: 0.4,
    voice: 'menace',
    traitHints: ['feral', 'ancient', 'territorial'],
    blurb: 'No motive, no dialogue, no negotiation. A destructive reputation is the whole appeal, so bad press barely registers.',
  },
  {
    id: 'machine', name: 'Machine', category: 'antagonists',
    tags: ['mecha', 'cyber', 'colony'],
    riseMul: 0.85, fadeMul: 0.75, controversyFuel: 0.6,
    voice: 'cold',
    traitHints: ['precise', 'relentless', 'hollow'],
    blurb: 'Admired rather than loved. It never quite catches fire, and it never quite goes away either.',
  },

  // ---- Mythic — measured in eras ------------------------------------------
  {
    id: 'legendary', name: 'Legendary', category: 'mythic',
    tags: ['dragons', 'cosmic', 'arcane'],
    riseMul: 0.8, fadeMul: 0.7, controversyFuel: 0.7,
    voice: 'reverent',
    traitHints: ['ancient', 'aloof', 'sealed'],
    blurb: 'Printed rarely and remembered permanently. The slowest climb in the cast, and the one that survives being ignored.',
  },
  {
    id: 'guardian', name: 'Guardian', category: 'mythic',
    tags: ['knights', 'kingdoms', 'frost'],
    riseMul: 0.95, fadeMul: 0.8, controversyFuel: 0.9,
    voice: 'reverent',
    traitHints: ['dutiful', 'patient', 'scarred'],
    blurb: 'Stands in front of something. Unspectacular week to week, but the reputation compounds and rarely cracks.',
  },
  {
    id: 'elemental', name: 'Elemental', category: 'mythic',
    tags: ['elemental', 'frost', 'spirits'],
    riseMul: 1.0, fadeMul: 1.0, controversyFuel: 1.0,
    voice: 'reverent',
    traitHints: ['wild', 'silent', 'ancient'],
    blurb: 'Weather with a face. No bias in either direction — whatever its cards earn, it keeps.',
  },

  // ---- Supporting cast — quieter arcs -------------------------------------
  {
    id: 'mentor', name: 'Mentor', category: 'supporting',
    tags: ['arcane', 'spirits', 'kingdoms'],
    riseMul: 0.9, fadeMul: 0.75, controversyFuel: 1.1,
    voice: 'wry',
    traitHints: ['patient', 'secretive', 'kind'],
    blurb: 'Ages extremely well. Never the chase card, always in the set, and quietly worth more a decade later.',
  },
  {
    id: 'trickster', name: 'Trickster', category: 'supporting',
    tags: ['heist', 'noir', 'spirits'],
    riseMul: 1.2, fadeMul: 1.15, controversyFuel: 0.5,
    voice: 'wry',
    traitHints: ['sly', 'unreliable', 'charming'],
    blurb: 'Volatile in both directions and completely unbothered by a bad week. The most exciting fame curve in the cast.',
  },
  {
    id: 'unaligned', name: 'Unaligned', category: 'supporting',
    tags: [],
    riseMul: 1, fadeMul: 1, controversyFuel: 1,
    voice: 'plain',
    traitHints: [],
    blurb: 'No archetype yet. Nothing about this character bends the sim — they rise and fall purely on what their cards do.',
  },
]

// The default, and the fallback for an id that no longer exists. Characters
// created before archetypes existed normalise onto this, so their behaviour is
// bit-for-bit what it was: every multiplier is 1 and there are no tags to match.
export const DEFAULT_ARCHETYPE_ID = 'unaligned'

// Never returns null — a caller in the middle of popFactors or a fame drift must
// not have to null-check an identity field. Mirrors getTreatment in characters.js,
// which falls back to TREATMENTS[0] for the same reason.
export function getArchetype(id) {
  return (
    ARCHETYPES.find((a) => a.id === id) ??
    ARCHETYPES.find((a) => a.id === DEFAULT_ARCHETYPE_ID)
  )
}

// True when a character of this archetype reads as an on-theme printing for a set
// carrying `themeTags`. The one place the tag vocabulary is compared, so sets.js
// and the two pickers that show the ★ cue can never drift apart on the rule.
export function archetypeMatchesTheme(archetypeId, themeTags) {
  const tags = getArchetype(archetypeId).tags
  if (!tags.length || !themeTags?.length) return false
  return themeTags.some((t) => tags.includes(t))
}

// Archetypes grouped for the pickers, in ARCHETYPE_CATEGORIES order.
// Returns [{ category, archetypes }] — categories with no members are dropped.
// Mirrors gimmicksByCategory().
export function archetypesByCategory() {
  return ARCHETYPE_CATEGORIES
    .map((category) => ({ category, archetypes: ARCHETYPES.filter((a) => a.category === category.id) }))
    .filter((group) => group.archetypes.length > 0)
}
