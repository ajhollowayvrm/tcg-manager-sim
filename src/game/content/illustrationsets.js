// Illustration-set KINDS — what it means for a handful of cards to "go
// together", and what the game checks before it believes you.
//
// The hobby this game models sells cards in groups. A Froakie/Frogadier/
// Greninja trio printed at Illustration Rare, Illustration Rare and Special
// Illustration Rare, drawn by one illustrator with art that connects across the
// three, is chased as a UNIT: the capstone is worth a multiple of the other two
// precisely because it finishes the run, and the two lesser cards hold a price
// floor precisely because somebody needs them to. The same shape covers an
// illustrator's suite across one set, one character printed again and again
// across eras by different hands, a linked-art triptych, and a one-per-faction
// cycle.
//
// Before this file the game had no way to say any of that. Cards grouped by set,
// by block, by rarity and by variant printing — never by SUBJECT. An illustrator
// was a cost line whose only effect was a one-off art-appeal bonus at print time.
//
// A kind differs from its siblings in two ways, and deliberately only two:
//
//   1. REQUIREMENTS — what "coherent" means here. This is pure data and costs
//      nothing to add, so it carries almost all of the distinctiveness. A line
//      wants an escalating rarity ladder and a related cast; a suite wants one
//      illustrator; a character run wants the OPPOSITE of one illustrator.
//
//   2. capstoneWeight — how hard the group's payoff concentrates on its rarest
//      member. This is the ONLY per-kind market number. An earlier draft gave
//      every kind its own multiplier set, which meant about twenty-five
//      constants that could not be baselined against each other and that
//      tools/playtest.mjs could only ever exercise one or two of. One dial
//      produces genuinely different collecting shapes for a twentieth of the
//      tuning cost: a triptych spreads its value across all three panels
//      (weight 1.0), a family line concentrates it on the last card (1.6).
//
// IDS ARE PERMANENT. `kindId` is stored on every group in the save. Renaming one
// orphans every group that references it onto the fallback.
//
// The requirement ids below are a FIXED VOCABULARY, scored by the table in
// illustrationsets.js's scoreCohesion. Adding a kind is pure data; adding a
// requirement means adding a scorer there too.
//
//   ladder      — rarity value tiers strictly ASCEND across the members, in the
//                 order they were printed. The Froakie→Greninja shape.
//   flatRarity  — the inverse: every member sits at the SAME tier. A cycle of
//                 one-per-faction cards is spoiled, not helped, by a ladder.
//   oneArtist   — share of members drawn by the single most common illustrator.
//   manyArtists — how many DISTINCT illustrators, over the member count.
//   oneCharacter— share of members featuring the single most common character.
//   relatedCast — members feature the same character OR characters linked by a
//                 promotion (see characters.js's promotedFromId). This is what
//                 lets "Kell, Broken Boy" and "Kell, Royal Soldier" — two
//                 separate roster entries — read as one line.
//   brief       — share of members whose art-direction notes actually answer the
//                 group's shared art brief.
//   oneSet      — every member printed in one set.
//   manySets    — how many DISTINCT sets, over the member count. A character run
//                 that all lands in one release is not a run.
//   size        — how close the member count is to the kind's natural size.

export const ILLUSTRATION_KINDS = [
  {
    id: 'line',
    name: 'Line / family',
    noun: 'line',
    blurb:
      'One character through successive forms or roles, printed up a rarity ladder. '
      + 'Everyone wants the last one.',
    defaultPlannedSize: 3,
    minSize: 2,
    maxSize: 4,
    capstoneWeight: 1.6, // the most concentrated payoff of any kind
    commissionMul: 1,
    requirements: [
      { id: 'ladder', weight: 3 },
      { id: 'relatedCast', weight: 2 },
      { id: 'oneArtist', weight: 2 },
      { id: 'brief', weight: 1 },
      { id: 'size', weight: 2 },
    ],
  },
  {
    id: 'suite',
    name: 'Illustrator suite',
    noun: 'suite',
    blurb:
      'One illustrator given a run of cards across a single set, working in one voice. '
      + 'The value spreads across the whole suite.',
    defaultPlannedSize: 4,
    minSize: 3,
    maxSize: 6,
    capstoneWeight: 1, // spreads — a suite is wanted whole, not for one card
    commissionMul: 1,
    requirements: [
      { id: 'oneArtist', weight: 4 },
      { id: 'brief', weight: 2 },
      { id: 'oneSet', weight: 1 },
      { id: 'size', weight: 2 },
    ],
  },
  {
    id: 'run',
    name: 'Character run',
    noun: 'run',
    blurb:
      'One character printed again and again across releases, each time by a different hand. '
      + 'The long game — it pays off years later.',
    defaultPlannedSize: 4,
    minSize: 3,
    maxSize: 6,
    capstoneWeight: 1.4,
    // Cheaper per member than the others: you are commissioning ordinary
    // recurring appearances, not art designed to interlock.
    commissionMul: 0.85,
    requirements: [
      { id: 'oneCharacter', weight: 4 },
      { id: 'manyArtists', weight: 2 },
      { id: 'manySets', weight: 2 },
      { id: 'size', weight: 1 },
    ],
  },
  {
    id: 'scene',
    name: 'Linked art',
    noun: 'triptych',
    blurb:
      'One continuous illustration broken across several cards. '
      + 'Costs the most to commission, and is worth nothing broken up.',
    defaultPlannedSize: 3,
    minSize: 2,
    maxSize: 4,
    capstoneWeight: 1, // all panels wanted together, or none of them
    // One artist drawing one image across three frames genuinely costs more than
    // three separate commissions.
    commissionMul: 1.35,
    requirements: [
      { id: 'oneArtist', weight: 3 },
      { id: 'brief', weight: 3 },
      { id: 'oneSet', weight: 2 },
      { id: 'size', weight: 2 },
    ],
  },
  {
    id: 'cycle',
    name: 'Themed cycle',
    noun: 'cycle',
    blurb:
      'One card per faction or element, all at the same rarity. '
      + 'Wide and even — the binder page nobody wants a hole in.',
    defaultPlannedSize: 5,
    minSize: 4,
    maxSize: 6,
    capstoneWeight: 1, // there is no capstone in a cycle, by construction
    commissionMul: 0.9,
    requirements: [
      { id: 'flatRarity', weight: 3 },
      { id: 'size', weight: 3 },
      { id: 'oneSet', weight: 2 },
      { id: 'brief', weight: 2 },
    ],
  },
]

// The id an unknown/absent kind lands on. `line` is the safest fallback: it is
// the shape the feature exists for, and its requirements are the ones a group
// authored under any other kind is most likely to partly satisfy anyway.
export const DEFAULT_ILLUSTRATION_KIND_ID = 'line'

// The widest capstoneWeight in the roster. illustrationsets.js normalises
// against this to turn the dial into a 0..1 "concentration" term, so adding a
// kind with a bigger weight rescales the others rather than silently blowing
// past the documented premium ceiling.
export const MAX_CAPSTONE_WEIGHT = ILLUSTRATION_KINDS.reduce(
  (m, k) => Math.max(m, k.capstoneWeight),
  1,
)

// Resolve a kind id. Never returns null — a stale or renamed id must not be able
// to crash pricing or the set builder, the same contract getArchetype and
// getGimmick already hold.
export function getIllustrationKind(id) {
  return (
    ILLUSTRATION_KINDS.find((k) => k.id === id)
    ?? ILLUSTRATION_KINDS.find((k) => k.id === DEFAULT_ILLUSTRATION_KIND_ID)
    ?? ILLUSTRATION_KINDS[0]
  )
}

// Human-readable names for the requirement ids, for the set builder's cohesion
// readout. The readout is the whole teaching surface for this mechanic: without
// it, cohesion is a number the player can only learn by shipping a set and
// guessing. Phrased as the thing being CHECKED, so a failing row reads as an
// instruction ("One illustrator" ⚠ tells you what to go fix).
export const REQUIREMENT_LABELS = {
  ladder: 'Escalating rarity',
  flatRarity: 'One shared rarity',
  oneArtist: 'One illustrator',
  manyArtists: 'Different illustrators',
  oneCharacter: 'One character',
  relatedCast: 'Related cast',
  brief: 'Answers the art brief',
  oneSet: 'Printed together',
  manySets: 'Spans releases',
  size: 'Enough cards',
}
