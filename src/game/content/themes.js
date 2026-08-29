// Set themes. Each carries a flavor identity and 1–2 naming MOTIFS — purely
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

  // Grounded / non-fantasy themes — sci-fi, modern, and real-world flavors that
  // step away from the swords-and-spells house style. Tags reuse the grounded
  // artist specialties (cyber, mecha, knights, beasts, horror) where they fit so
  // those themes still get the art-appeal match bonus; the rest use new tags.
  { id: 'mecha', name: 'Titan Protocol', tags: ['mecha', 'cyber'], motifs: ['Pilot', 'Salvage'] },
  { id: 'heist', name: 'Grand Larceny', tags: ['heist', 'noir'], motifs: ['Case', 'Double-Cross'] },
  { id: 'racing', name: 'Redline Circuit', tags: ['racing', 'cyber'], motifs: ['Boost', 'Slipstream'] },
  { id: 'sports', name: 'League Season', tags: ['sports', 'beasts'], motifs: ['Season', 'Clutch'] },
  { id: 'pirates', name: 'Salt & Powder', tags: ['pirates', 'beasts'], motifs: ['Plunder', 'Broadside'] },
  { id: 'noir', name: 'Cold Case', tags: ['noir', 'horror'], motifs: ['Investigate', 'Alibi'] },
  { id: 'colony', name: 'Red Frontier', tags: ['colony', 'mecha'], motifs: ['Terraform', 'Ration'] },
  { id: 'kaiju', name: 'City Stomp', tags: ['kaiju', 'mecha'], motifs: ['Rampage', 'Evacuate'] },
]

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? null
}
