// Set themes. Each carries a flavor identity and 1–2 candidate set mechanics —
// pure flavor now (the mechanics are cosmetic naming fuel for generated cards,
// see sets.js's randomCardName).

export const THEMES = [
  { id: 'dragons', name: 'Dragons', tags: ['dragons', 'elemental'], mechanics: ['Hoard', 'Scorch'] },
  { id: 'undead', name: 'Undead Legion', tags: ['undead', 'horror'], mechanics: ['Reanimate', 'Decay'] },
  { id: 'cyber', name: 'Neon Circuit', tags: ['cyber', 'mecha'], mechanics: ['Overclock', 'Uplink'] },
  { id: 'nature', name: 'Wildgrowth', tags: ['nature', 'beasts'], mechanics: ['Bloom', 'Pack Tactics'] },
  { id: 'arcane', name: 'Arcane Orders', tags: ['arcane', 'spirits'], mechanics: ['Channel', 'Ward'] },
  { id: 'kingdoms', name: 'Iron Kingdoms', tags: ['knights', 'kingdoms'], mechanics: ['Rally', 'Fortify'] },
  { id: 'cosmic', name: 'Cosmic Drift', tags: ['cosmic', 'elemental'], mechanics: ['Eclipse', 'Stardust'] },
  { id: 'frost', name: 'Frostbound', tags: ['frost', 'spirits'], mechanics: ['Freeze', 'Shatter'] },
  { id: 'spirits', name: 'Spirit Realm', tags: ['spirits', 'nature'], mechanics: ['Haunt', 'Commune'] },
  { id: 'cute', name: 'Plushlands', tags: ['cute', 'beasts'], mechanics: ['Cuddle', 'Swarm'] },

  // Grounded / non-fantasy themes — sci-fi, modern, and real-world flavors that
  // step away from the swords-and-spells house style. Tags reuse the grounded
  // artist specialties (cyber, mecha, knights, beasts, horror) where they fit so
  // those themes still get the art-appeal match bonus; the rest use new tags.
  { id: 'mecha', name: 'Titan Protocol', tags: ['mecha', 'cyber'], mechanics: ['Pilot', 'Salvage'] },
  { id: 'heist', name: 'Grand Larceny', tags: ['heist', 'noir'], mechanics: ['Case', 'Double-Cross'] },
  { id: 'racing', name: 'Redline Circuit', tags: ['racing', 'cyber'], mechanics: ['Boost', 'Slipstream'] },
  { id: 'sports', name: 'League Season', tags: ['sports', 'beasts'], mechanics: ['Draft', 'Clutch'] },
  { id: 'pirates', name: 'Salt & Powder', tags: ['pirates', 'beasts'], mechanics: ['Plunder', 'Broadside'] },
  { id: 'noir', name: 'Cold Case', tags: ['noir', 'horror'], mechanics: ['Investigate', 'Alibi'] },
  { id: 'colony', name: 'Red Frontier', tags: ['colony', 'mecha'], mechanics: ['Terraform', 'Ration'] },
  { id: 'kaiju', name: 'City Stomp', tags: ['kaiju', 'mecha'], mechanics: ['Rampage', 'Evacuate'] },
]

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? null
}
