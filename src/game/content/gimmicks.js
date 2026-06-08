// Block gimmicks — the era-defining special mechanic a MAJOR set introduces when
// it opens a block (the Mega Evolution / Tera / Ascended / Phantasmal of a
// Pokémon-style block). Every set that later attaches to the block "rides" its
// gimmick: it inherits the theme and can print the gimmick's special treatment
// cards, but only a major can mint a NEW gimmick.
//
// A gimmick has TWO levers it pulls on, and the player blends them per block with
// a competitive↔collector NATURE slider (see blocks.js applyGimmickNature):
//
//   • meta-warp  — a persistent shift of the archetype field toward the block's
//     lean, alive for as long as the block is (it decays slowly each week unless
//     the block keeps printing into it). This is the gimmick's COMPETITIVE teeth
//     and its power-creep risk.
//   • treatment  — a special chase card subtype (Mega/Ascended/Phantasmal cards)
//     minted on release: scarce, high art-appeal + collector value, a secondary-
//     market engine. This is the gimmick's COLLECTOR draw.
//
// The roster gives each gimmick a fixed CHARACTER (its default nature lean, its
// warp/treatment base weights, a default archetype lean); the player names it and
// tunes its nature when opening the block. Mirrors content/themes.js.

export const GIMMICKS = [
  {
    id: 'mega',
    name: 'Mega Evolution',
    // 0 = pure competitive / meta-warp, 100 = pure collector / treatment.
    defaultNature: 30, // leans competitive: a power mechanic
    defaultLean: 'aggro',
    warpWeight: 1.2, // strong field-warp at full competitive nature
    treatmentWeight: 0.9, // also mints big chase cards
    creep: 1.0, // power-level creep multiplier when this block prints
    treatmentLabel: 'Mega',
    blurb: 'A power-evolution mechanic. Big, splashy chase cards that also warp the format hard — the block era everyone power-levels around.',
  },
  {
    id: 'ascended',
    name: 'Ascended Forms',
    defaultNature: 45,
    defaultLean: 'control',
    warpWeight: 1.0,
    treatmentWeight: 1.1,
    creep: 0.85,
    treatmentLabel: 'Ascended',
    blurb: 'Late-game ascension forms. Grindy, control-leaning power with a strong collector tier — the meta bends slower but the chase cards are grails.',
  },
  {
    id: 'phantasmal',
    name: 'Phantasmal',
    defaultNature: 80, // leans collector: a treatment-first gimmick
    defaultLean: 'combo',
    warpWeight: 0.5,
    treatmentWeight: 1.4, // the treatment IS the point
    creep: 0.5,
    treatmentLabel: 'Phantasmal',
    blurb: 'Ghostly alt-art treatments. Barely touches the metagame — it exists to mint gorgeous, scarce chase cards that drive the secondary market.',
  },
  {
    id: 'tera',
    name: 'Tera Crystal',
    defaultNature: 50, // balanced
    defaultLean: 'midrange',
    warpWeight: 0.95,
    treatmentWeight: 1.0,
    creep: 0.8,
    treatmentLabel: 'Tera',
    blurb: 'A flexible typing gimmick. A balanced era — moderate format warp and a healthy chase tier, adaptable to whatever lean you steer it toward.',
  },
]

export function getGimmick(id) {
  return GIMMICKS.find((g) => g.id === id) ?? null
}
