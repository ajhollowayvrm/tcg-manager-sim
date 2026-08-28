// Block gimmicks — the era-defining special mechanic a MAJOR set introduces when
// it opens a block (the Mega Evolution / Tera / Ascended / Phantasmal of a
// Pokémon-style block). Every set that later attaches to the block "rides" its
// gimmick: it inherits the theme and can print the gimmick's special treatment
// cards, but only a major can mint a NEW gimmick.
//
// A gimmick is purely a collector engine now: it mints a special chase-card
// subtype (Mega/Ascended/Phantasmal cards) on release — scarce, high
// art-appeal + collector value, a secondary-market draw. The player controls
// how loud it runs with an INTENSITY slider (0 = subtle/understated era, 100 =
// maximal chase — see blocks.js's gimmickIntensity). `creep` sets how much
// this gimmick nudges the collectors' nostalgia-erosion dial when a set prints
// into it — a splashy gimmick like Mega reads louder than a quiet one like
// Phantasmal, purely a flavor/design-loudness signal now, not a power dial.
//
// The roster gives each gimmick a fixed CHARACTER (its default intensity, its
// treatment weight); the player names it and tunes its intensity when opening
// the block. Mirrors content/themes.js.

export const GIMMICKS = [
  {
    id: 'mega',
    name: 'Mega Evolution',
    defaultIntensity: 40,
    treatmentWeight: 0.9, // mints big chase cards
    creep: 1.0, // design-loudness nudge when this block prints
    treatmentLabel: 'Mega',
    blurb: 'A power-evolution mechanic. Big, splashy chase cards — the block era everyone talks about.',
  },
  {
    id: 'ascended',
    name: 'Ascended Forms',
    defaultIntensity: 55,
    treatmentWeight: 1.1,
    creep: 0.85,
    treatmentLabel: 'Ascended',
    blurb: 'Late-game ascension forms. A strong collector tier — the chase cards are grails.',
  },
  {
    id: 'phantasmal',
    name: 'Phantasmal',
    defaultIntensity: 80, // treatment-first, subtle everywhere else
    treatmentWeight: 1.4, // the treatment IS the point
    creep: 0.5,
    treatmentLabel: 'Phantasmal',
    blurb: 'Ghostly alt-art treatments. It exists to mint gorgeous, scarce chase cards that drive the secondary market.',
  },
  {
    id: 'tera',
    name: 'Tera Crystal',
    defaultIntensity: 55,
    treatmentWeight: 1.0,
    creep: 0.8,
    treatmentLabel: 'Tera',
    blurb: 'A flexible typing gimmick. A balanced, healthy chase tier, adaptable to whatever intensity you steer it toward.',
  },
]

export function getGimmick(id) {
  return GIMMICKS.find((g) => g.id === id) ?? null
}
