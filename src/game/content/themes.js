// Set themes. Each carries a flavor identity and 1–2 candidate set mechanics
// that interact with the metagame's archetype balance. The `archetypes` field
// is the rock-paper-scissors lean the theme's mechanics tend to push.

export const THEMES = [
  { id: 'dragons', name: 'Dragons', tags: ['dragons', 'elemental'], mechanics: ['Hoard', 'Scorch'], archetypes: ['midrange', 'aggro'] },
  { id: 'undead', name: 'Undead Legion', tags: ['undead', 'horror'], mechanics: ['Reanimate', 'Decay'], archetypes: ['control', 'combo'] },
  { id: 'cyber', name: 'Neon Circuit', tags: ['cyber', 'mecha'], mechanics: ['Overclock', 'Uplink'], archetypes: ['combo', 'aggro'] },
  { id: 'nature', name: 'Wildgrowth', tags: ['nature', 'beasts'], mechanics: ['Bloom', 'Pack Tactics'], archetypes: ['midrange', 'aggro'] },
  { id: 'arcane', name: 'Arcane Orders', tags: ['arcane', 'spirits'], mechanics: ['Channel', 'Ward'], archetypes: ['control', 'combo'] },
  { id: 'kingdoms', name: 'Iron Kingdoms', tags: ['knights', 'kingdoms'], mechanics: ['Rally', 'Fortify'], archetypes: ['midrange', 'control'] },
  { id: 'cosmic', name: 'Cosmic Drift', tags: ['cosmic', 'elemental'], mechanics: ['Eclipse', 'Stardust'], archetypes: ['control', 'combo'] },
  { id: 'frost', name: 'Frostbound', tags: ['frost', 'spirits'], mechanics: ['Freeze', 'Shatter'], archetypes: ['control', 'aggro'] },
  { id: 'spirits', name: 'Spirit Realm', tags: ['spirits', 'nature'], mechanics: ['Haunt', 'Commune'], archetypes: ['combo', 'midrange'] },
  { id: 'cute', name: 'Plushlands', tags: ['cute', 'beasts'], mechanics: ['Cuddle', 'Swarm'], archetypes: ['aggro', 'midrange'] },

  // Grounded / non-fantasy themes — sci-fi, modern, and real-world flavors that
  // step away from the swords-and-spells house style. Tags reuse the grounded
  // artist specialties (cyber, mecha, knights, beasts, horror) where they fit so
  // those themes still get the art-appeal match bonus; the rest use new tags.
  { id: 'mecha', name: 'Titan Protocol', tags: ['mecha', 'cyber'], mechanics: ['Pilot', 'Salvage'], archetypes: ['midrange', 'control'] },
  { id: 'heist', name: 'Grand Larceny', tags: ['heist', 'noir'], mechanics: ['Case', 'Double-Cross'], archetypes: ['combo', 'control'] },
  { id: 'racing', name: 'Redline Circuit', tags: ['racing', 'cyber'], mechanics: ['Boost', 'Slipstream'], archetypes: ['aggro', 'combo'] },
  { id: 'sports', name: 'League Season', tags: ['sports', 'beasts'], mechanics: ['Draft', 'Clutch'], archetypes: ['midrange', 'aggro'] },
  { id: 'pirates', name: 'Salt & Powder', tags: ['pirates', 'beasts'], mechanics: ['Plunder', 'Broadside'], archetypes: ['aggro', 'midrange'] },
  { id: 'noir', name: 'Cold Case', tags: ['noir', 'horror'], mechanics: ['Investigate', 'Alibi'], archetypes: ['control', 'combo'] },
  { id: 'colony', name: 'Red Frontier', tags: ['colony', 'mecha'], mechanics: ['Terraform', 'Ration'], archetypes: ['control', 'midrange'] },
  { id: 'kaiju', name: 'City Stomp', tags: ['kaiju', 'mecha'], mechanics: ['Rampage', 'Evacuate'], archetypes: ['aggro', 'control'] },
]

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? null
}
