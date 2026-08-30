// Collectible-unit concept: what your cards actually depict, chosen once at
// company founding (see Onboarding.jsx) — little monsters you catch and
// raise (Pokémon-style) vs. a cast of named characters with an ongoing story
// (One Piece-style), and so on.
//
// FLAVOR/IDENTITY ONLY, deliberately — this is NOT the archetype picker that
// was removed in "Drop the archetype picker — every TCG here is
// collectible-first" (it used to tilt starting cash/segments/market pricing;
// since the collector/reseller pivot that tilt was cosmetic dressing over one
// shared economy). This concept touches nothing in the economy. It only
// picks which word-pool generated card names draw from (`nameStyle` below).
//
// The actual mechanic VARIETY — Mega Evolution/Ascended/Tera/GX-style era
// gimmicks — already lives in content/gimmicks.js's 28-entry roster, picked
// per block. This file answers a different question ("what IS a card"), not
// that one ("what's this era's chase treatment").

export const CONCEPTS = [
  {
    id: 'monsters', name: 'Little Monsters', resembles: 'Pokémon-style',
    blurb: 'Creatures you catch, raise, and collect — the roster IS the cast.',
    nameStyle: 'creature',
  },
  {
    id: 'anime', name: 'Storied Cast', resembles: 'One Piece-style',
    blurb: 'A crew of named characters with faces, rivalries, and an ongoing story.',
    nameStyle: 'character',
  },
  {
    id: 'duelists', name: 'Duelists & Spellcasters', resembles: 'Yu-Gi-Oh-style',
    blurb: 'Monsters summoned to the field by duelists — the cards are the arsenal.',
    nameStyle: 'creature',
  },
  {
    id: 'heroes', name: 'Hero Roster', resembles: 'superhero-style',
    blurb: 'A team of powered characters, each with their own name and legend.',
    nameStyle: 'character',
  },
]

export const DEFAULT_CONCEPT_ID = 'monsters'

export function getConcept(id) {
  return CONCEPTS.find((c) => c.id === id) ?? CONCEPTS.find((c) => c.id === DEFAULT_CONCEPT_ID)
}

// Naming word-fuel per style — see sets.js's randomCardName, which picks a
// pool off the founding concept's `nameStyle`.
//
// 'creature' mirrors the game's original generic epithet-noun style (a
// Dragons set yields "Scorch Warden", a Cyber set "Uplink Sentinel").
export const CREATURE_NAME_PREFIX = ['Elder', 'Grand', 'Feral', 'Hollow', 'Radiant', 'Dread', 'Iron', 'Wild', 'Lost', 'First', 'Crimson', 'Gilded']
export const CREATURE_NAME_NOUN = ['Warden', 'Herald', 'Sovereign', 'Specter', 'Champion', 'Oracle', 'Reaver', 'Sentinel', 'Avatar', 'Colossus', 'Vanguard', 'Harbinger']

// 'character' is a given name + surname, occasionally with a theme motif as a
// quoted nickname, the way a cast of characters (rather than creatures) gets
// named — "Kai Voss", "Yuna 'Bloom' Sable".
export const CHARACTER_FIRST_NAMES = ['Kai', 'Rin', 'Junpei', 'Sora', 'Mireille', 'Dax', 'Yuna', 'Bram', 'Isolde', 'Kael', 'Nyx', 'Osric']
export const CHARACTER_SURNAMES = ['Voss', 'Thorne', 'Kagerou', 'Ashworth', 'Vane', 'Sable', 'Marchetti', 'Roux', 'Kestrel', 'Draven']
