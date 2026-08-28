// Onboarding config — the identity and starting flavor the player sets before a
// run. Mostly cosmetic, with a SMALL starting nudge per "resembles" archetype so
// runs feel a little different without diverging the whole sim.

// The game your TCG resembles. Each gives a vibe blurb, a default cadence the
// genre is known for, and a light starting tilt (segment mix).
export const ARCHETYPES = [
  {
    id: 'collectible', name: 'Collectible-first', resembles: 'Pokémon-like',
    blurb: 'A beloved collectible. Art, chase rarities, and nostalgia drive the base above all else.',
    defaultCadence: 14,
    segments: { casual: 5_000, collectors: 4_000 },
  },
  {
    id: 'staples', name: 'Staple-driven', resembles: 'Magic-like',
    blurb: 'A deep, beloved core cardpool people build around for years — prized for its classic staples and long memory.',
    defaultCadence: 12,
    segments: { casual: 3_500, collectors: 4_500 },
  },
  {
    id: 'combo', name: 'Combo-driven', resembles: 'Yu-Gi-Oh-like',
    blurb: 'Fast, flashy, chase-forward. A hungry crowd that churns through new drops quickly.',
    defaultCadence: 9,
    segments: { casual: 5_500, collectors: 3_000 },
  },
  {
    id: 'indie', name: 'Scrappy indie', resembles: 'Indie / Kickstarter',
    blurb: 'A small passionate community. Less cash, more goodwill — every set matters.',
    defaultCadence: 16,
    segments: { casual: 2_500, collectors: 2_000 },
  },
]

export function getArchetype(id) {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[0]
}

// Persistent market identity tilt (see market.js's fairValue): beyond the
// one-time starting nudge to segments above, the chosen archetype keeps a
// small, permanent lean on how richly the game prices collectibility every
// week. Small (≤12%) so it flavors the curve without swamping the shared
// fair-value math.
export const MARKET_TILT = {
  collectible: { collector: 1.12 },
  staples: { collector: 1.05 },
  combo: { collector: 1.03 },
  indie: { collector: 1 },
}

export function getMarketTilt(id) {
  return MARKET_TILT[id] ?? MARKET_TILT.collectible
}

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
    archetype: 'collectible',
    cadenceWeeks: 14,
    started: false,
  }
}
