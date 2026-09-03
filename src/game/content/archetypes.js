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
//   fameCeiling     — the highest fame this archetype can CLIMB to. See the note
//                     below; this is what stops every archetype converging.
//   merchPull       — how well this archetype sells MERCHANDISE (merch.js). A
//                     mascot moves plush; a machine is admired and not cuddled.
//                     1 is neutral.
//   segmentLean     — who this archetype attracts, -1 pure casual to +1 pure
//                     collector (segments.js, partners.js). 0 is neutral.
//   voice           — selects which chatter pool the community uses for them
//                     (see CHARACTER_LINES in personas.js)
//   traitHints      — trait ids the creation form offers first (content/traits.js).
//                     A suggestion, never a restriction — any trait fits any
//                     archetype.
//
// WHY THERE IS A CEILING AT ALL. `riseMul` alone does not survive contact with a
// long run. Simulated over 312 weeks with identical good cards, every archetype
// reached fame 100 and `icon`: the 0.8-to-1.25 spread was worth about ten points
// at week 52 and exactly nothing by week 156, because they all hit the flat cap.
// Past that point a mascot and a machine priced identically, which makes the
// choice of archetype a head start rather than an identity.
//
// `fameCeiling` is the fix. Who can become a HOUSEHOLD NAME is now a casting
// decision that lasts the whole run — a mentor is beloved and never the face of
// the franchise, a leviathan climbs forever and slowly.
//
// It caps the CLIMB, not the character: driftOne raises the cap to a character's
// current fame if they are already above it, so nobody in a save in progress is
// yanked downward by this arriving. And every archetype that already existed is
// kept at or above 88, because ICON_FAME_FLOOR is 85 and a lower ceiling would
// retroactively bar an established character from icon — and from the icon
// treatment and its reserved pack slot — in a run somebody already invested in.
// New archetypes are free to sit below that line: nobody has one yet.
//
// WHY merchPull AND segmentLean EXIST. Before them, NOTHING outside sets.js,
// characters.js, personas.js (voice) and lineages.js read an archetype at all —
// merch, partners, segments, events, legacy and franchise were all blind to it.
// merch.js's own header even said "a hot mascot moves plush" while reading only
// aggregate cast fame, so the comment promised an effect the code did not have.
// These two fields are what the rest of the sim reads, and they are deliberately
// data rather than per-system special cases.
//
// `unaligned` MUST stay neutral on both (1 and 0), for the same reason all its
// multipliers are 1: it is what every pre-archetype character normalises onto,
// and those characters must behave exactly as they always did.
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
  { id: 'rogues', name: 'Rogues', blurb: 'Outside the law, and untroubled by it. Notoriety is the job, so the press that ruins a face barely registers.' },
  { id: 'wilds', name: 'Wilds', blurb: 'The untamed that means nobody any harm. Weather, growth and things too large to have a motive.' },
  { id: 'folk', name: 'Folk', blurb: 'The ordinary world. Never the chase card, quietly wanted for decades.' },
  { id: 'courts', name: 'Courts', blurb: 'Power and the people who hold it. Reputation is the whole asset, and it only ever breaks.' },
]

// EACH NEW CATEGORY HOLDS AT LEAST THREE. The `growth` lineage kind
// (content/lineages.js) uses archetypeRule { type: 'sameCategory' }, so a
// category with one or two members is a dead end for it — the player picks the
// kind and then finds there is nothing legal to grow into.

export const ARCHETYPES = [
  // ---- Faces — fast to love, easy to bruise -------------------------------
  {
    id: 'mascot', name: 'Mascot', category: 'faces',
    tags: ['cute', 'beasts', 'nature'],
    riseMul: 1.25, fadeMul: 1.2, controversyFuel: 1.5,
    fameCeiling: 100,
    merchPull: 1.4, segmentLean: -0.7,
    voice: 'warm',
    traitHints: ['cheerful', 'loyal', 'stubborn'],
    blurb: 'The face on the box. Climbs faster than anything else in the cast — and a scandal lands twice as hard, because nobody forgives a mascot.',
  },
  {
    id: 'starter', name: 'Starter', category: 'faces',
    tags: ['nature', 'cute', 'elemental'],
    riseMul: 1.1, fadeMul: 0.8, controversyFuel: 1.2,
    fameCeiling: 96,
    merchPull: 1.25, segmentLean: -0.5,
    voice: 'warm',
    traitHints: ['earnest', 'cheerful', 'clumsy'],
    blurb: "The one they picked first and never sold. A gentler climb than a mascot's, but the goodwill is remarkably hard to lose.",
  },
  {
    id: 'rival', name: 'Rival', category: 'faces',
    tags: ['sports', 'racing', 'knights'],
    riseMul: 1.15, fadeMul: 1.05, controversyFuel: 0.8,
    fameCeiling: 94,
    merchPull: 1.0, segmentLean: -0.2,
    voice: 'brash',
    traitHints: ['arrogant', 'driven', 'loyal'],
    blurb: 'The one who beats you in the tutorial. Thrives on comparison, and a little friction only sharpens the story.',
  },

  // ---- Antagonists — heat is a resource ------------------------------------
  {
    id: 'villain', name: 'Villain', category: 'antagonists',
    tags: ['undead', 'horror', 'noir'],
    riseMul: 0.9, fadeMul: 0.7, controversyFuel: -0.5,
    fameCeiling: 100,
    merchPull: 0.95, segmentLean: 0.3,
    voice: 'menace',
    traitHints: ['vain', 'patient', 'theatrical'],
    blurb: 'Heat that would sink a mascot only makes the villain bigger. Slow to build, and very slow to fade.',
  },
  {
    id: 'beast', name: 'Beast', category: 'antagonists',
    tags: ['kaiju', 'beasts', 'dragons'],
    riseMul: 1.05, fadeMul: 0.95, controversyFuel: 0.4,
    fameCeiling: 92,
    merchPull: 1.1, segmentLean: -0.1,
    voice: 'menace',
    traitHints: ['feral', 'ancient', 'territorial'],
    blurb: 'No motive, no dialogue, no negotiation. A destructive reputation is the whole appeal, so bad press barely registers.',
  },
  {
    id: 'machine', name: 'Machine', category: 'antagonists',
    tags: ['mecha', 'cyber', 'colony'],
    riseMul: 0.85, fadeMul: 0.75, controversyFuel: 0.6,
    fameCeiling: 90,
    merchPull: 0.7, segmentLean: 0.4,
    voice: 'cold',
    traitHints: ['precise', 'relentless', 'hollow'],
    blurb: 'Admired rather than loved. It never quite catches fire, and it never quite goes away either.',
  },

  // ---- Mythic — measured in eras ------------------------------------------
  {
    id: 'legendary', name: 'Legendary', category: 'mythic',
    tags: ['dragons', 'cosmic', 'arcane'],
    riseMul: 0.8, fadeMul: 0.7, controversyFuel: 0.7,
    fameCeiling: 100,
    merchPull: 0.9, segmentLean: 0.8,
    voice: 'reverent',
    traitHints: ['ancient', 'aloof', 'sealed'],
    blurb: 'Printed rarely and remembered permanently. The slowest climb in the cast, and the one that survives being ignored.',
  },
  {
    id: 'guardian', name: 'Guardian', category: 'mythic',
    tags: ['knights', 'kingdoms', 'frost'],
    riseMul: 0.95, fadeMul: 0.8, controversyFuel: 0.9,
    fameCeiling: 95,
    merchPull: 0.85, segmentLean: 0.3,
    voice: 'reverent',
    traitHints: ['dutiful', 'patient', 'scarred'],
    blurb: 'Stands in front of something. Unspectacular week to week, but the reputation compounds and rarely cracks.',
  },
  {
    id: 'elemental', name: 'Elemental', category: 'mythic',
    tags: ['elemental', 'frost', 'spirits'],
    riseMul: 1.0, fadeMul: 1.0, controversyFuel: 1.0,
    fameCeiling: 90,
    merchPull: 0.9, segmentLean: 0.4,
    voice: 'reverent',
    traitHints: ['wild', 'silent', 'ancient'],
    blurb: 'Weather with a face. No bias in either direction — whatever its cards earn, it keeps.',
  },

  // ---- Supporting cast — quieter arcs -------------------------------------
  {
    id: 'mentor', name: 'Mentor', category: 'supporting',
    tags: ['arcane', 'spirits', 'kingdoms'],
    riseMul: 0.9, fadeMul: 0.75, controversyFuel: 1.1,
    fameCeiling: 88,
    merchPull: 0.75, segmentLean: 0.5,
    voice: 'wry',
    traitHints: ['patient', 'secretive', 'kind'],
    blurb: 'Ages extremely well. Never the chase card, always in the set, and quietly worth more a decade later.',
  },
  {
    id: 'trickster', name: 'Trickster', category: 'supporting',
    tags: ['heist', 'noir', 'spirits'],
    riseMul: 1.2, fadeMul: 1.15, controversyFuel: 0.5,
    fameCeiling: 92,
    merchPull: 1.05, segmentLean: 0.0,
    voice: 'wry',
    traitHints: ['sly', 'unreliable', 'charming'],
    blurb: 'Volatile in both directions and completely unbothered by a bad week. The most exciting fame curve in the cast.',
  },

  // ---- Rogues — notoriety is the job --------------------------------------
  {
    id: 'corsair', name: 'Corsair', category: 'rogues',
    tags: ['pirates', 'beasts', 'heist'],
    riseMul: 1.15, fadeMul: 1.0, controversyFuel: 0.2,
    fameCeiling: 92,
    merchPull: 1.15, segmentLean: -0.2,
    voice: 'sly',
    traitHints: ['charming', 'arrogant', 'driven'],
    blurb: 'Swaggering, quotable and hard to embarrass. Climbs like a rival and holds it, because the audience never expected better behaviour.',
  },
  {
    id: 'smuggler', name: 'Smuggler', category: 'rogues',
    tags: ['heist', 'colony', 'cyber'],
    riseMul: 1.05, fadeMul: 0.85, controversyFuel: -0.2,
    fameCeiling: 86,
    merchPull: 0.9, segmentLean: 0.2,
    voice: 'sly',
    traitHints: ['sly', 'secretive', 'unreliable'],
    blurb: 'Grows quietly and takes a scandal as advertising — the only character besides a villain who is better off being talked about badly.',
  },
  {
    id: 'hunter', name: 'Bounty Hunter', category: 'rogues',
    tags: ['noir', 'pirates', 'sports'],
    riseMul: 1.1, fadeMul: 0.9, controversyFuel: 0.4,
    fameCeiling: 90,
    merchPull: 1.0, segmentLean: 0.0,
    voice: 'sly',
    traitHints: ['relentless', 'precise', 'patient'],
    blurb: 'Rises on results rather than affection. Nobody adores them, and nobody stops printing them either.',
  },

  // ---- Wilds — no motive, no malice ---------------------------------------
  {
    id: 'swarm', name: 'Swarm', category: 'wilds',
    tags: ['beasts', 'nature', 'kaiju'],
    riseMul: 1.2, fadeMul: 1.2, controversyFuel: 0.6,
    fameCeiling: 84,
    merchPull: 1.1, segmentLean: -0.3,
    voice: 'menace',
    traitHints: ['feral', 'wild', 'territorial'],
    blurb: 'Many as one. Arrives everywhere at once and leaves the same way — the fastest fad in the cast, and it never becomes an icon.',
  },
  {
    id: 'leviathan', name: 'Leviathan', category: 'wilds',
    tags: ['kaiju', 'frost', 'cosmic'],
    riseMul: 0.75, fadeMul: 0.7, controversyFuel: 0.2,
    fameCeiling: 100,
    merchPull: 0.85, segmentLean: 0.6,
    voice: 'reverent',
    traitHints: ['ancient', 'silent', 'sealed'],
    blurb: 'The slowest climb in the game and the least troubled by anything said about it. Give it twenty years and it is the biggest thing you have.',
  },
  {
    id: 'blight', name: 'Blight', category: 'wilds',
    tags: ['undead', 'spirits', 'nature'],
    riseMul: 0.95, fadeMul: 0.85, controversyFuel: 0.3,
    fameCeiling: 90,
    merchPull: 0.8, segmentLean: 0.35,
    voice: 'menace',
    traitHints: ['relentless', 'silent', 'ancient'],
    blurb: 'Rot as a season rather than a villain. Spreads slowly, recedes slowly, and is never quite dealt with.',
  },

  // ---- Folk — the ordinary world ------------------------------------------
  {
    id: 'artisan', name: 'Artisan', category: 'folk',
    tags: ['kingdoms', 'colony', 'mecha'],
    riseMul: 0.85, fadeMul: 0.7, controversyFuel: 0.9,
    fameCeiling: 80,
    merchPull: 0.95, segmentLean: 0.45,
    voice: 'folk',
    traitHints: ['precise', 'patient', 'dutiful'],
    blurb: 'The one who made the thing. Never famous and never forgotten — the steadiest fame curve there is, with a low ceiling on top of it.',
  },
  {
    id: 'merchant', name: 'Merchant', category: 'folk',
    tags: ['heist', 'pirates', 'kingdoms'],
    riseMul: 0.95, fadeMul: 0.85, controversyFuel: 1.3,
    fameCeiling: 84,
    merchPull: 1.0, segmentLean: 0.3,
    voice: 'folk',
    traitHints: ['charming', 'vain', 'driven'],
    blurb: 'Fame tracks the money, and a scandal about the money is the one thing that really lands.',
  },
  {
    id: 'chronicler', name: 'Chronicler', category: 'folk',
    tags: ['arcane', 'noir', 'cosmic'],
    riseMul: 0.8, fadeMul: 0.7, controversyFuel: 0.5,
    fameCeiling: 78,
    merchPull: 0.7, segmentLean: 0.7,
    voice: 'folk',
    traitHints: ['secretive', 'patient', 'aloof'],
    blurb: 'Writes it down rather than doing it. Worth more every time somebody cites them, and famous approximately never.',
  },

  // ---- Courts — reputation is the whole asset ------------------------------
  {
    id: 'heir', name: 'Heir', category: 'courts',
    tags: ['kingdoms', 'knights', 'dragons'],
    riseMul: 1.2, fadeMul: 1.1, controversyFuel: 1.4,
    fameCeiling: 96,
    merchPull: 1.15, segmentLean: -0.15,
    voice: 'brash',
    traitHints: ['arrogant', 'earnest', 'driven'],
    blurb: 'Carries an expectation they did not ask for. Climbs nearly as fast as a mascot and is punished nearly as hard for a bad week.',
  },
  {
    id: 'regent', name: 'Regent', category: 'courts',
    tags: ['kingdoms', 'arcane', 'frost'],
    riseMul: 0.9, fadeMul: 0.75, controversyFuel: 1.2,
    fameCeiling: 92,
    merchPull: 0.8, segmentLean: 0.45,
    voice: 'cold',
    traitHints: ['dutiful', 'aloof', 'precise'],
    blurb: 'Authority does not need to be liked, only respected — so being ignored costs nothing and being disgraced costs everything.',
  },
  {
    id: 'envoy', name: 'Envoy', category: 'courts',
    tags: ['colony', 'cyber', 'cosmic'],
    riseMul: 1.0, fadeMul: 0.9, controversyFuel: 0.7,
    fameCeiling: 88,
    merchPull: 0.9, segmentLean: 0.25,
    voice: 'wry',
    traitHints: ['charming', 'patient', 'secretive'],
    blurb: 'At home in two places and native to neither. No bias worth naming, which is its own kind of useful.',
  },

  {
    id: 'unaligned', name: 'Unaligned', category: 'supporting',
    tags: [],
    riseMul: 1, fadeMul: 1, controversyFuel: 1,
    fameCeiling: 100,
    merchPull: 1.0, segmentLean: 0.0,
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

// ---- The guard --------------------------------------------------------------

// Every way this table can be wrong SILENTLY, checked in one place.
//
// None of these mistakes throws or even logs: a tag outside content/themes.js's
// vocabulary simply never matches a set, a `traitHints` id that is not in
// content/traits.js quietly fails to sort anything to the front of the picker,
// and a `voice` with no pool in personas.js means the community never says a
// word about that character. The repo has no test runner, and neither
// tools/playtest.mjs nor tools/uisweep.mjs can see any of it.
//
// NOT called at module scope: reducer.js's whole import graph has to stay cheap
// and importable in plain Node. The verification script calls it.
//
// `themeTags` and `traitIds` are passed in rather than imported so this stays a
// leaf module — content/themes.js and content/traits.js do not need to be in
// archetypes.js's import graph just to be checked against.
export function validateArchetypes({ themeTags = [], traitIds = [], voices = [] } = {}) {
  const errors = []
  const seen = new Set()
  const tagSets = new Map()
  const categoryIds = new Set(ARCHETYPE_CATEGORIES.map((c) => c.id))

  for (const a of ARCHETYPES) {
    const at = (msg) => errors.push(`${a.id}: ${msg}`)
    if (seen.has(a.id)) at('duplicate id')
    seen.add(a.id)
    if (!categoryIds.has(a.category)) at(`unknown category "${a.category}"`)

    for (const t of a.tags) {
      if (themeTags.length && !themeTags.includes(t)) at(`tag "${t}" is in no theme — it can never match`)
    }
    for (const h of a.traitHints ?? []) {
      if (traitIds.length && !traitIds.includes(h)) at(`traitHint "${h}" is not a real trait`)
    }
    if (voices.length && !voices.includes(a.voice)) at(`voice "${a.voice}" has no chatter pool — the room will never mention them`)

    for (const [k, lo, hi] of [['riseMul', 0.7, 1.25], ['fadeMul', 0.7, 1.25], ['controversyFuel', -0.6, 1.5], ['merchPull', 0.5, 1.5], ['segmentLean', -1, 1], ['fameCeiling', 0, 100]]) {
      const v = a[k]
      if (typeof v !== 'number' || v < lo || v > hi) at(`${k} ${v} is outside ${lo}..${hi}`)
    }

    // A duplicate tag SET means two archetypes are interchangeable for theme
    // cohesion, which is most of what distinguishes them at the point of use.
    if (a.tags.length) {
      const key = [...a.tags].sort().join('+')
      if (tagSets.has(key)) at(`has the same tags as ${tagSets.get(key)}`)
      else tagSets.set(key, a.id)
    }
  }

  // `unaligned` is what every pre-archetype character normalises onto. If it
  // stops being numerically inert, every one of those characters silently
  // changes behaviour in a save already in progress.
  const u = getArchetype(DEFAULT_ARCHETYPE_ID)
  if (u.riseMul !== 1 || u.fadeMul !== 1 || u.controversyFuel !== 1
    || u.merchPull !== 1 || u.segmentLean !== 0 || u.fameCeiling !== 100 || u.tags.length) {
    errors.push('unaligned: must stay numerically inert (all multipliers 1, lean 0, ceiling 100, no tags)')
  }

  for (const c of ARCHETYPE_CATEGORIES) {
    const members = ARCHETYPES.filter((a) => a.category === c.id)
    if (!members.length) errors.push(`category ${c.id}: has no archetypes`)
    // Fewer than two and the `growth` lineage kind (sameCategory) is a dead end.
    else if (members.length < 2) errors.push(`category ${c.id}: only ${members.length} member — growth lineages need two`)
  }

  return errors
}
