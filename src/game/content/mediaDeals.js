// Cross-media venture catalogue — the "big, expensive, risky bets" from
// docs/BRIEF.md's v2 layer C. Six archetypes across 3 kinds (game/anime/
// film), two tiers each (a cheap early entry, an ambitious late-game bet).
// `reputationGate` values are staged against franchise.js's soft growth
// ceiling (GROWTH_TAPER_REFERENCE = 260): the cheapest bet unlocks early-ish,
// the theatrical blockbuster only once a studio is genuinely legendary-
// adjacent. See media.js.

export const MEDIA_DEALS = [
  {
    id: 'm_mobile', kind: 'game', name: 'Mobile spinoff', reputationGate: 20,
    pitchCost: 300_000, flopCost: 90_000, baseOdds: 0.42,
    productionWeeksMin: 16, productionWeeksMax: 30,
    hitPlayerInjectionMin: 10_000, hitPlayerInjectionMax: 22_000,
    womMultiplierBoost: 0.04, reputationFloorBoost: 15,
    blurb: 'A cheap, fast mobile game tie-in. Modest odds, modest payoff — the low-risk entry to cross-media.',
  },
  {
    id: 'm_console', kind: 'game', name: 'Core console RPG', reputationGate: 35,
    pitchCost: 700_000, flopCost: 260_000, baseOdds: 0.3,
    productionWeeksMin: 30, productionWeeksMax: 52,
    hitPlayerInjectionMin: 25_000, hitPlayerInjectionMax: 45_000,
    womMultiplierBoost: 0.08, reputationFloorBoost: 30,
    blurb: 'A full console RPG. Bigger budget, bigger swing, a real dev cycle.',
  },
  {
    id: 'm_saturday', kind: 'anime', name: 'Saturday-morning series', reputationGate: 40,
    pitchCost: 900_000, flopCost: 380_000, baseOdds: 0.28,
    productionWeeksMin: 30, productionWeeksMax: 55,
    hitPlayerInjectionMin: 35_000, hitPlayerInjectionMax: 65_000,
    womMultiplierBoost: 0.12, reputationFloorBoost: 45,
    blurb: "A kids' animated series. The classic TCG-to-cartoon pipeline.",
  },
  {
    id: 'm_prestige', kind: 'anime', name: 'Prestige streaming original', reputationGate: 55,
    pitchCost: 1_500_000, flopCost: 650_000, baseOdds: 0.22,
    productionWeeksMin: 45, productionWeeksMax: 75,
    hitPlayerInjectionMin: 55_000, hitPlayerInjectionMax: 95_000,
    womMultiplierBoost: 0.17, reputationFloorBoost: 65,
    blurb: 'A prestige-budget streaming series. Slower, pricier, further-reaching if it lands.',
  },
  {
    id: 'm_streaming', kind: 'film', name: 'Direct-to-streaming movie', reputationGate: 60,
    pitchCost: 1_400_000, flopCost: 550_000, baseOdds: 0.24,
    productionWeeksMin: 40, productionWeeksMax: 65,
    hitPlayerInjectionMin: 45_000, hitPlayerInjectionMax: 80_000,
    womMultiplierBoost: 0.14, reputationFloorBoost: 55,
    blurb: 'A streaming-first film. Cheaper than theatrical, still a real cultural moment if it hits.',
  },
  {
    id: 'm_theatrical', kind: 'film', name: 'Theatrical blockbuster', reputationGate: 78,
    pitchCost: 2_800_000, flopCost: 1_100_000, baseOdds: 0.16,
    productionWeeksMin: 60, productionWeeksMax: 95,
    hitPlayerInjectionMin: 80_000, hitPlayerInjectionMax: 150_000,
    womMultiplierBoost: 0.22, reputationFloorBoost: 90,
    blurb: 'A full theatrical release. The endgame ambition bet — huge cost, huge if it lands.',
  },
]

export function getMediaDeal(id) {
  return MEDIA_DEALS.find((d) => d.id === id) ?? null
}
