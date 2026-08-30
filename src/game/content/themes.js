// Set themes: per-SET flavor motifs, the same way Pokémon's Base Set era
// shipped Jungle (forest-dwelling Pokémon), Fossil (ancient/prehistoric
// Pokémon), and Team Rocket (the villain org's corrupted "Dark" cards) back
// to back — three different flavors riding one era, all still unmistakably
// Pokémon. A set's THEME is that per-release motif: freely picked per set
// (see sets.js's createDraft/releaseSet — nothing locks it to a block or a
// company), never a pivot to a different game. The block's own `gimmick`
// (see content/gimmicks.js) is the thing that stays constant across an era —
// theme is just the flavor riding on top of it.
//
// Each entry carries a flavor identity and 1–2 naming MOTIFS — purely
// cosmetic word-fuel for generated card names (see sets.js's randomCardName).
// These are flavor, not rules: nothing in the sim reads them as a mechanic.

export const THEMES = [
  { id: 'dragons', name: 'Dragons', tags: ['dragons', 'elemental'], motifs: ['Hoard', 'Scorch'] },
  { id: 'undead', name: 'Undead Legion', tags: ['undead', 'horror'], motifs: ['Reanimate', 'Decay'] },
  { id: 'cyber', name: 'Neon Circuit', tags: ['cyber', 'mecha'], motifs: ['Overclock', 'Uplink'] },
  { id: 'nature', name: 'Wildgrowth', tags: ['nature', 'beasts'], motifs: ['Bloom', 'Pack Tactics'] },
  { id: 'arcane', name: 'Arcane Orders', tags: ['arcane', 'spirits'], motifs: ['Channel', 'Ward'] },
  { id: 'kingdoms', name: 'Iron Kingdoms', tags: ['knights', 'kingdoms'], motifs: ['Rally', 'Fortify'] },
  { id: 'cosmic', name: 'Cosmic Drift', tags: ['cosmic', 'elemental'], motifs: ['Eclipse', 'Stardust'] },
  { id: 'frost', name: 'Frostbound', tags: ['frost', 'spirits'], motifs: ['Freeze', 'Shatter'] },
  { id: 'spirits', name: 'Spirit Realm', tags: ['spirits', 'nature'], motifs: ['Haunt', 'Commune'] },
  { id: 'cute', name: 'Plushlands', tags: ['cute', 'beasts'], motifs: ['Cuddle', 'Swarm'] },

  // These eight used to read as a full genre pivot away from the rest of the
  // list (a heist game, a racing game, a kaiju movie). Renamed to read as
  // in-world creature/faction sub-motifs instead — habitat, faction, or
  // species-family flavor on the SAME collectible-critter house style as the
  // ten above, the way Team Rocket or Dragon Frontiers are still Pokémon.
  // Tags/ids untouched — they're load-bearing (persisted saves, artist
  // specialty matching in content/artists.js).
  { id: 'mecha', name: 'Ironclad Assembly', tags: ['mecha', 'cyber'], motifs: ['Forge', 'Assembly'] },
  { id: 'heist', name: 'Black Market Broods', tags: ['heist', 'noir'], motifs: ['Smuggle', 'Fence'] },
  { id: 'racing', name: 'Velocity Beasts', tags: ['racing', 'cyber'], motifs: ['Sprint', 'Slipstream'] },
  { id: 'sports', name: 'Arena Circuit', tags: ['sports', 'beasts'], motifs: ['Rally', 'Clutch'] },
  { id: 'pirates', name: 'Salt & Powder', tags: ['pirates', 'beasts'], motifs: ['Plunder', 'Broadside'] },
  { id: 'noir', name: 'Cryptid Casefile', tags: ['noir', 'horror'], motifs: ['Stakeout', 'Tail'] },
  { id: 'colony', name: 'New World Brood', tags: ['colony', 'mecha'], motifs: ['Frontier', 'Claim'] },
  { id: 'kaiju', name: 'Titan Wilds', tags: ['kaiju', 'mecha'], motifs: ['Rampage', 'Trample'] },
]

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? null
}
