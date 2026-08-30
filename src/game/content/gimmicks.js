// Block gimmicks — the era-defining CHASE TREATMENT a major set can introduce
// when it opens a block (the Mega Evolution / Tera / full-art era of a
// Pokémon-style block). Every set that later attaches to the block "rides" it:
// it inherits the theme and can print the gimmick's special treatment cards,
// but only a major can mint a NEW gimmick.
//
// A gimmick is OPTIONAL. A block opened without one is a plain themed era — no
// chase subtype, cheaper to develop, a smaller launch spike, and nothing
// nudging the nostalgia dial. Plenty of real eras work exactly that way; see
// NO_GIMMICK below, which the builder offers as a first-class choice rather
// than an empty state.
//
// A gimmick is purely a COLLECTOR engine — never a rules mechanic. It mints a
// special chase-card subtype on release: scarce, high art-appeal, a
// secondary-market draw. The player controls how loud it runs with an INTENSITY
// slider (0 = subtle/understated era, 100 = maximal chase — see blocks.js's
// gimmickIntensity).
//
// Fields:
//   category        — grouping for the builder's picker (see GIMMICK_CATEGORIES)
//   defaultIntensity— where the intensity slider starts for this gimmick
//   treatmentWeight — how many/how rich the chase cards it mints are (0.8–1.5)
//   creep           — how much printing into this block nudges the collectors'
//                     nostalgia-erosion dial. A splashy form-change era reads
//                     louder than a quiet nostalgia one. Purely a design-
//                     loudness signal, never a power dial.
//   devCostMul      — multiplier on the tier's development floor. Novelty
//                     gimmicks (die-cuts, jumbo) genuinely cost more to make.
//   treatmentLabel  — what its chase cards are called on the card record
//
// Values are kept inside the range the original four spanned so no single pick
// is strictly dominant. Mirrors content/themes.js.

export const GIMMICK_CATEGORIES = [
  { id: 'form', name: 'Form change', blurb: 'Characters take on new forms — the loud, era-defining kind of gimmick everyone talks about.' },
  { id: 'art', name: 'Art treatment', blurb: 'The card itself is the gimmick. Gorgeous printings that exist to be chased.' },
  { id: 'rarity', name: 'Rarity structure', blurb: 'Changes the shape of the chase — where the hits sit and how hard they are to get.' },
  { id: 'character', name: 'Character & crossover', blurb: 'Leans on who is on the card: guests, the cast, and their stories.' },
  { id: 'nostalgia', name: 'Nostalgia', blurb: 'Looks backward. Quiet, warm, and very kind to long-time collectors.' },
  { id: 'novelty', name: 'Novelty & physical', blurb: 'The card stops being a normal piece of cardboard. Expensive, memorable.' },
]

export const GIMMICKS = [
  // ---- Form change — loud, splashy, the era everyone remembers -------------
  {
    id: 'mega', name: 'Mega Evolution', category: 'form',
    defaultIntensity: 40, treatmentWeight: 0.9, creep: 1.0, devCostMul: 1.0,
    treatmentLabel: 'Mega',
    blurb: 'A power-evolution mechanic. Big, splashy chase cards — the block era everyone talks about.',
  },
  {
    id: 'ascended', name: 'Ascended Forms', category: 'form',
    defaultIntensity: 55, treatmentWeight: 1.1, creep: 0.85, devCostMul: 1.05,
    treatmentLabel: 'Ascended',
    blurb: 'Late-game ascension forms. A strong collector tier — the chase cards are grails.',
  },
  {
    id: 'tera', name: 'Tera Crystal', category: 'form',
    defaultIntensity: 55, treatmentWeight: 1.0, creep: 0.8, devCostMul: 1.0,
    treatmentLabel: 'Tera',
    blurb: 'A crystalline retyping gimmick. A balanced, healthy chase tier, adaptable to whatever intensity you steer it toward.',
  },
  {
    id: 'fusion', name: 'Fusion Pairs', category: 'form',
    defaultIntensity: 50, treatmentWeight: 1.0, creep: 1.1, devCostMul: 1.15,
    treatmentLabel: 'Fusion',
    blurb: 'Two characters printed as one. Doubles the fan-favorite pull per card — and doubles the argument about which pairs you picked.',
  },
  {
    id: 'awakened', name: 'Awakened States', category: 'form',
    defaultIntensity: 60, treatmentWeight: 1.05, creep: 1.15, devCostMul: 1.0,
    treatmentLabel: 'Awakened',
    blurb: 'A dramatic unleashed form. The loudest era you can print — enormous launch energy, hardest on the back catalogue.',
  },
  {
    id: 'regionalform', name: 'Regional Variants', category: 'form',
    defaultIntensity: 45, treatmentWeight: 0.85, creep: 0.6, devCostMul: 0.95,
    treatmentLabel: 'Variant',
    blurb: 'Familiar characters reimagined for a new region. Gentle on the old cards — these sit beside them rather than above them.',
  },

  // ---- Art treatment — the printing IS the point ---------------------------
  {
    id: 'phantasmal', name: 'Phantasmal', category: 'art',
    defaultIntensity: 80, treatmentWeight: 1.4, creep: 0.5, devCostMul: 1.1,
    treatmentLabel: 'Phantasmal',
    blurb: 'Ghostly alt-art treatments. It exists to mint gorgeous, scarce chase cards that drive the secondary market.',
  },
  {
    id: 'fullart', name: 'Full-Art Frames', category: 'art',
    defaultIntensity: 65, treatmentWeight: 1.25, creep: 0.45, devCostMul: 1.15,
    treatmentLabel: 'Full Art',
    blurb: 'The art breaks the frame and fills the card. The most reliably beloved treatment there is.',
  },
  {
    id: 'altart', name: 'Alternate Artworks', category: 'art',
    defaultIntensity: 70, treatmentWeight: 1.3, creep: 0.4, devCostMul: 1.1,
    treatmentLabel: 'Alt Art',
    blurb: 'A second, rarer illustration of cards people already own. Pure collector catnip, and very kind to your artists.',
  },
  {
    id: 'textured', name: 'Textured Foil', category: 'art',
    defaultIntensity: 60, treatmentWeight: 1.2, creep: 0.5, devCostMul: 1.3,
    treatmentLabel: 'Textured',
    blurb: 'You can feel the art with your thumb. Photographs terribly, sells enormously.',
  },
  {
    id: 'goldetch', name: 'Gold Etch', category: 'art',
    defaultIntensity: 55, treatmentWeight: 1.35, creep: 0.55, devCostMul: 1.4,
    treatmentLabel: 'Gold',
    blurb: 'Etched gold on the scarcest cards in the set. Unmistakable in a binder, brutal on a print budget.',
  },
  {
    id: 'illustrationrare', name: 'Illustration Rares', category: 'art',
    defaultIntensity: 75, treatmentWeight: 1.45, creep: 0.35, devCostMul: 1.2,
    treatmentLabel: 'Illustration',
    blurb: 'Story-scene cards where the character is a small part of a bigger picture. The treatment art directors dream about.',
  },

  // ---- Rarity structure — reshapes where the chase sits ---------------------
  {
    id: 'secretladder', name: 'Secret Rare Ladder', category: 'rarity',
    defaultIntensity: 65, treatmentWeight: 1.15, creep: 0.7, devCostMul: 0.95,
    treatmentLabel: 'Secret',
    blurb: 'A tier above the tier above the tier. Endless ladder, endless chase — and endless complaints about the odds.',
  },
  {
    id: 'doubletriple', name: 'Double & Triple Rare', category: 'rarity',
    defaultIntensity: 50, treatmentWeight: 0.95, creep: 0.65, devCostMul: 0.9,
    treatmentLabel: 'Double Rare',
    blurb: 'A clean, legible rarity ladder stamped right on the card. Easy to explain, easy to collect toward.',
  },
  {
    id: 'chaselane', name: 'Chase Lane', category: 'rarity',
    defaultIntensity: 70, treatmentWeight: 1.3, creep: 0.75, devCostMul: 1.0,
    treatmentLabel: 'Grail',
    blurb: 'One narrow lane of ultra-scarce cards running through the whole block. Concentrated value, concentrated frustration.',
  },
  {
    id: 'hitslot', name: 'Guaranteed Hit Slot', category: 'rarity',
    defaultIntensity: 40, treatmentWeight: 0.8, creep: 0.4, devCostMul: 0.9,
    treatmentLabel: 'Hit',
    blurb: 'Every pack has something. Fewer grails at the top, but nobody walks away from a pack feeling robbed.',
  },

  // ---- Character & crossover — leans on who is on the card -----------------
  {
    id: 'crossover', name: 'Crossover Guests', category: 'character',
    defaultIntensity: 65, treatmentWeight: 1.2, creep: 0.7, devCostMul: 1.45,
    treatmentLabel: 'Guest',
    blurb: 'Characters from somewhere else entirely show up in your set. Enormous outside attention, enormous licensing bill.',
  },
  {
    id: 'castspotlight', name: 'Cast Spotlight', category: 'character',
    defaultIntensity: 50, treatmentWeight: 1.0, creep: 0.5, devCostMul: 1.0,
    treatmentLabel: 'Spotlight',
    blurb: 'The people, not the creatures. Builds your roster’s fame hard — the cards fans get attached to.',
  },
  {
    id: 'origins', name: 'Origin Stories', category: 'character',
    defaultIntensity: 55, treatmentWeight: 1.1, creep: 0.4, devCostMul: 1.05,
    treatmentLabel: 'Origin',
    blurb: 'Cards that tell where a character came from. Quiet, sentimental, and unusually sticky with long-time fans.',
  },
  {
    id: 'tagduos', name: 'Tag Duos', category: 'character',
    defaultIntensity: 55, treatmentWeight: 1.0, creep: 0.8, devCostMul: 1.1,
    treatmentLabel: 'Duo',
    blurb: 'Two names on one card. Every duo you print is a small argument about who belongs together.',
  },

  // ---- Nostalgia — looks backward, very kind to the back catalogue ---------
  {
    id: 'throwback', name: 'Throwback Frames', category: 'nostalgia',
    defaultIntensity: 60, treatmentWeight: 1.15, creep: 0.2, devCostMul: 0.9,
    treatmentLabel: 'Throwback',
    blurb: 'New cards in the old frame. Costs almost nothing to design and makes veterans extremely happy.',
  },
  {
    id: 'remaster', name: 'Remastered Classics', category: 'nostalgia',
    defaultIntensity: 65, treatmentWeight: 1.2, creep: 0.15, devCostMul: 1.0,
    treatmentLabel: 'Remaster',
    blurb: 'Beloved old cards, reprinted beautifully. Lifts the originals instead of burying them.',
  },
  {
    id: 'firstprint', name: 'First-Print Callbacks', category: 'nostalgia',
    defaultIntensity: 55, treatmentWeight: 1.1, creep: 0.2, devCostMul: 0.95,
    treatmentLabel: 'Callback',
    blurb: 'Direct nods to your very first set. Only lands if you have a history worth nodding to.',
  },
  {
    id: 'legacyfoil', name: 'Legacy Foil', category: 'nostalgia',
    defaultIntensity: 50, treatmentWeight: 1.05, creep: 0.25, devCostMul: 1.05,
    treatmentLabel: 'Legacy',
    blurb: 'The old foil pattern, back for one era. Purely sentimental, and that is exactly why it works.',
  },

  // ---- Novelty & physical — the card stops being normal cardboard ----------
  {
    id: 'jumbo', name: 'Jumbo Cards', category: 'novelty',
    defaultIntensity: 45, treatmentWeight: 0.9, creep: 0.35, devCostMul: 1.5,
    treatmentLabel: 'Jumbo',
    blurb: 'Oversized showpieces. Impossible to sleeve, impossible to ignore on a shelf.',
  },
  {
    id: 'serialized', name: 'Serial Numbered Hits', category: 'novelty',
    defaultIntensity: 75, treatmentWeight: 1.5, creep: 0.6, devCostMul: 1.35,
    treatmentLabel: 'Serial',
    blurb: 'Stamped 004/100. The scarcest thing you can print, and the fastest route to a genuine grail.',
  },
  {
    id: 'holopattern', name: 'Holo Patterns', category: 'novelty',
    defaultIntensity: 55, treatmentWeight: 1.1, creep: 0.45, devCostMul: 1.2,
    treatmentLabel: 'Pattern',
    blurb: 'A distinct foil pattern per rarity. Subtle, collectible, and instantly recognisable years later.',
  },
  {
    id: 'diecut', name: 'Die-Cut Shapes', category: 'novelty',
    defaultIntensity: 60, treatmentWeight: 1.25, creep: 0.5, devCostMul: 1.6,
    treatmentLabel: 'Die-Cut',
    blurb: 'Cards cut to the shape of the art. The most expensive idea in this list, and the one people photograph most.',
  },
]

// The "no gimmick" choice — a plain themed era. Not a member of GIMMICKS (it has
// no id to store); the builder offers it as the first option and stores
// `gimmickId: null`. Kept here so the UI has one place to read its copy from.
export const NO_GIMMICK = {
  id: null,
  name: 'No gimmick — a plain themed era',
  category: null,
  treatmentWeight: 0,
  creep: 0,
  devCostMul: 0.8,
  treatmentLabel: null,
  blurb: 'A straight themed expansion with no era chase subtype. Cheaper to develop and a smaller launch spike — but nothing to erode what collectors already own.',
}

export function getGimmick(id) {
  return GIMMICKS.find((g) => g.id === id) ?? null
}

// Gimmicks grouped for the builder's picker, in GIMMICK_CATEGORIES order.
// Returns [{ category, gimmicks }] — categories with no members are dropped.
export function gimmicksByCategory() {
  return GIMMICK_CATEGORIES
    .map((category) => ({ category, gimmicks: GIMMICKS.filter((g) => g.category === category.id) }))
    .filter((group) => group.gimmicks.length > 0)
}
