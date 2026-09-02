// Studio upgrades — permanent-for-the-run investments bought with cash. Each
// is a small, honest multiplier on one cost or one risk, so the store is a
// place to put surplus money without buying a win. Ids are permanent — they
// reach the save as keys of state.upgrades.
//
//   base     — the level-1 price; each level costs more, and prestige inflates it
//   max      — levels available
//   effect   — the line the store shows per level
// `supply_chain` is the existing capacity investment (distributors.js) listed
// here so every upgrade has one home; it keeps its own state and action.

export const UPGRADES = [
  {
    id: 'supply_chain', name: 'Supply-chain capacity', special: 'supply',
    blurb: 'Logistics headroom. Print and shipping snags get rarer and lighter with every step.',
  },
  {
    id: 'warehouse_automation', name: 'Warehouse automation', base: 40_000, max: 3,
    blurb: 'Racking, scanners, a smaller crew. Every unsold unit costs less to sit on.',
    effect: (level) => `Warehousing −${15 * level}%`,
  },
  {
    id: 'print_partner', name: 'Print partner', base: 60_000, max: 3,
    blurb: 'A volume deal with a printer. Every set’s print bill comes down.',
    effect: (level) => `Print bill −${6 * level}%`,
  },
  {
    id: 'community_team', name: 'Community team', base: 35_000, max: 2,
    blurb: 'Support and moderation that scale. The per-player staff cost falls.',
    effect: (level) => `Staff cost per player −${10 * level}%`,
  },
  {
    id: 'authentication_lab', name: 'Authentication lab', base: 50_000, max: 2,
    blurb: 'Your own reference lab for the graders you sign. Mis-grade scandals get rarer.',
    effect: (level) => `Grading scandal risk −${30 * level}%`,
  },
  {
    id: 'art_department', name: 'Art department', base: 45_000, max: 2,
    blurb: 'In-house art direction. An art director costs less over a whole set.',
    effect: (level) => `Art director rate ×${[2, 1.7, 1.5][level]}`,
  },
]

export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id) ?? null
}
