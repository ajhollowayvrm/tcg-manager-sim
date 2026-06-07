// Distributors — bulk-buying clients you can sign to move huge volume of a set.
// The Pokébank model: they buy TONS of product at a wholesale discount (cash for
// you now, lower margin) and resell it into the channel. Their resale floods the
// secondary market, and a hot enough flood tips your game into SCALPER CULTURE —
// prices spike on artificial scarcity, but casual players get priced out and the
// bubble eventually pops. See src/game/distributors.js for the mechanics.
//
// Each distributor has a personality expressed in three traits:
//   appetite — fraction of a set's print run they'll buy in one deal (0..1)
//   discount — wholesale price as a fraction of MSRP they pay (lower = worse margin)
//   flood    — how aggressively they dump resold stock (drives scalper heat)
//
// reach is their channel prominence (how much their behavior moves the market).

export const DISTRIBUTORS = [
  {
    id: 'd_pokebank', name: 'CardVault Holdings', kind: 'speculator', reach: 90,
    appetite: 0.32, discount: 0.55, flood: 0.9,
    blurb: 'A "card bank" that vaults sealed cases by the pallet and resells into hype. Massive volume, ruthless flips — the fastest road to a scalper market.',
  },
  {
    id: 'd_megabox', name: 'MegaBox Wholesale', kind: 'big-box', reach: 78,
    appetite: 0.4, discount: 0.5, flood: 0.45,
    blurb: 'Big-box retail pipeline. Buys the most of anyone at the steepest discount, but sells through real stores — a wide channel, not a pump.',
  },
  {
    id: 'd_lgs', name: 'Allied Game Stores', kind: 'lgs-network', reach: 55,
    appetite: 0.16, discount: 0.68, flood: 0.15,
    blurb: 'A co-op of local game stores. Modest volume, the friendliest margin, barely floods — the community-safe option.',
  },
  {
    id: 'd_flip', name: 'QuickFlip Logistics', kind: 'speculator', reach: 70,
    appetite: 0.22, discount: 0.58, flood: 0.75,
    blurb: 'Online resellers and scalper syndicates. Smaller buys than the big box, but they exist to flip — heavy flood, fast heat.',
  },
  {
    id: 'd_intl', name: 'Pan-Pacific Import/Export', kind: 'international', reach: 64,
    appetite: 0.28, discount: 0.6, flood: 0.4,
    blurb: 'Opens overseas markets. Good volume and a fair cut; floods the home market only moderately since much ships abroad.',
  },
]

export function getDistributor(id) {
  return DISTRIBUTORS.find((d) => d.id === id) ?? null
}
