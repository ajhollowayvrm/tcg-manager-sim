// Brand partners — outside businesses you co-brand a promo card with. The
// McDonald's-Pokémon shape: a mass-market promo in a meal box pulls in casual
// players who would never walk into a game store, cheapens the brand a little
// in the eyes of the art crowd, and gives the scalpers a new thing to clear
// shelves of. A film studio is the opposite end: few copies, prestige, a
// reputation gate. Ids are permanent — they reach the save on partnerDeals.
//
//   cost          — the one-off fee
//   prestige      — feeds promos.js: scarcer and pricier at the top, mass-issued
//                   at the bottom (~150 copies at 1, ~5,150 at 0)
//   casualReach   — new players the tie-in brings in, almost all casual
//   heatDelta     — scalper heat the promo draws
//   repBump       — franchise reputation, one-off
//   repGate       — the reputation a partner needs to see before it signs
//   cooldownWeeks — how long before the same partner will do it again

export const BRAND_PARTNERS = [
  {
    id: 'burger_barn', name: 'Burger Barn', tag: 'fast food', promoLabel: 'Burger Barn',
    cost: 60_000, prestige: 0.15, casualReach: 2_400, heatDelta: 8, repBump: 1.5, repGate: 0, cooldownWeeks: 52,
    blurb: 'A promo in every kids’ meal for a month. Enormous reach, a run in the thousands, and the resale bots know the drop date before you do.',
  },
  {
    id: 'crunch_os', name: 'Crunch-O’s', tag: 'breakfast cereal', promoLabel: 'Crunch-O’s',
    cost: 45_000, prestige: 0.2, casualReach: 1_600, heatDelta: 4, repBump: 1, repGate: 0, cooldownWeeks: 52,
    blurb: 'A card in the box. Wholesome, cheap, and everywhere — the kind of promo that gets a nine-year-old into the game.',
  },
  {
    id: 'kwikmart', name: 'KwikMart', tag: 'convenience stores', promoLabel: 'KwikMart',
    cost: 35_000, prestige: 0.3, casualReach: 1_100, heatDelta: 5, repBump: 0.8, repGate: 10, cooldownWeeks: 39,
    blurb: 'A counter promo at every till in the chain. Modest reach, modest cost, and the stores flood with it for a week.',
  },
  {
    id: 'streamwave', name: 'Streamwave', tag: 'streaming platform', promoLabel: 'Streamwave',
    cost: 80_000, prestige: 0.45, casualReach: 1_400, heatDelta: 3, repBump: 2.5, repGate: 20, cooldownWeeks: 52,
    blurb: 'A code-redeemed promo for subscribers, timed to a featured season. Digital-first reach with barely a scalper in sight.',
  },
  {
    id: 'continental_league', name: 'The Continental League', tag: 'sports league', promoLabel: 'League',
    cost: 110_000, prestige: 0.55, casualReach: 1_800, heatDelta: 7, repBump: 3, repGate: 25, cooldownWeeks: 52,
    blurb: 'A stadium giveaway on match day. A big, loud audience that has never heard of you, and a promo the collectors will chase.',
  },
  {
    id: 'meridian_pictures', name: 'Meridian Pictures', tag: 'film studio', promoLabel: 'Premiere',
    cost: 140_000, prestige: 0.7, casualReach: 900, heatDelta: 6, repBump: 4, repGate: 40, cooldownWeeks: 78,
    blurb: 'A premiere-night promo tied to a feature release. A few hundred copies, real prestige, and a partner that only calls a studio it has heard of.',
  },
]

export function getBrandPartner(id) {
  return BRAND_PARTNERS.find((p) => p.id === id) ?? null
}
