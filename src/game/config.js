// Onboarding config — the identity the player sets before a run. Every TCG in
// this sim is a collectible-first, Pokémon-like game (art, chase rarities, and
// nostalgia drive the base) — there's no genre choice, just a name and a
// release-cadence pledge.

// Starting segment lean: the casual/collector split new players discover into
// as the base grows from zero (see initialState.js/segments.js).
export const STARTING_SEGMENT_LEAN = { casual: 5_000, collectors: 4_000 }

// A fresh studio's starting cash.
export const STARTING_CASH = 250_000

// Genre norm for a collectible-first TCG's release rhythm.
export const DEFAULT_CADENCE_WEEKS = 14

// Persistent market identity tilt (see market.js's fairValue): a small,
// permanent lean on how richly the game prices collectibility every week.
// Small (≤12%) so it flavors the curve without swamping the shared fair-value
// math.
export const COLLECTOR_MARKET_TILT = 1.12

// Cadence pledge bounds (weeks between releases).
export const MIN_CADENCE = 6
export const MAX_CADENCE = 26

// Cadence pressure tuning. Grace weeks past the pledge before unrest starts,
// then escalating sentiment souring + player-base bleed per overdue week.
export const CADENCE_GRACE = 3
export const CADENCE_SENTIMENT_PER_WK = 1.5 // sentiment lost per persona per overdue week (past grace)
export const CADENCE_BLEED_PER_WK = 0.004 // fraction of player base lost per overdue week, escalating

// A fresh config (used as the onboarding draft default).
export function defaultConfig() {
  return {
    companyName: '',
    gameName: '',
    cadenceWeeks: DEFAULT_CADENCE_WEEKS,
    started: false,
  }
}
