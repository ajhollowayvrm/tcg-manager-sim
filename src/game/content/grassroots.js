// Grassroots grants — money to the people who run events for your game
// outside the game store: a volunteer tournament series, a fan-art contest, a
// campus club, a convention meetup. The studio-to-store relationship lives under
// Business; this is studio-to-fans. Ids are permanent — they reach the save on
// grassrootsGrants.
//
//   cost          — the grant
//   cooldownWeeks — how long before the same kind can be funded again
//   casual        — [min, max] new casual players a success brings
//   sentiment     — the bump for voices whose taste matches tasteKey
//   buzz          — [min, max] buzz on the hottest live set

export const GRANT_KINDS = [
  {
    id: 'tournament_series', name: 'Community tournament series', cost: 12_000, cooldownWeeks: 8,
    casual: [220, 420], sentiment: 3, tasteKey: 'power', buzz: [6, 10],
    blurb: 'Prize support and a rules kit for a volunteer-run league. The competitive-minded notice a studio that shows up for their scene.',
  },
  {
    id: 'fan_art_contest', name: 'Fan-art and cosplay contest', cost: 8_000, cooldownWeeks: 10,
    casual: [120, 260], sentiment: 3, tasteKey: 'art', buzz: [4, 8],
    blurb: 'A prize pool and a printed showcase for fan work. Cheap, warm, and the art crowd talks about it for weeks.',
  },
  {
    id: 'campus_kits', name: 'Campus club kits', cost: 15_000, cooldownWeeks: 13,
    casual: [300, 520], sentiment: 2, tasteKey: 'fun', buzz: [2, 5],
    blurb: 'Starter product and posters for student clubs. Slow-burning reach into people who have never set foot in a game store.',
  },
  {
    id: 'convention_meetup', name: 'Convention meetup', cost: 20_000, cooldownWeeks: 16,
    casual: [260, 480], sentiment: 4, tasteKey: 'value', buzz: [8, 14],
    blurb: 'A funded fan meetup at a convention, with a promo for everyone who shows. The biggest single moment a grant can buy.',
  },
]

export function getGrantKind(id) {
  return GRANT_KINDS.find((g) => g.id === id) ?? null
}
