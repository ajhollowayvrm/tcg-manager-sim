// Onboarding config — the identity and starting flavor the player sets before a
// run. Mostly cosmetic, with a SMALL starting nudge per "resembles" archetype so
// runs feel a little different without diverging the whole sim.

// The game your TCG resembles. Each gives a vibe blurb, a default cadence the
// genre is known for, and a light starting tilt (segment mix + metashare lean).
export const ARCHETYPES = [
  {
    id: 'collectible', name: 'Collectible-first', resembles: 'Pokémon-like',
    blurb: 'A beloved collectible. Art and chase rarities drive the base; the competitive scene is real but secondary.',
    defaultCadence: 14,
    // Tilt: bigger collector segment, smaller hardcore competitive.
    segments: { competitive: 2_500, casual: 5_000, collectors: 4_000 },
    archetypes: { aggro: 28, control: 22, combo: 22, midrange: 28 },
  },
  {
    id: 'competitive', name: 'Competitive-first', resembles: 'Magic-like',
    blurb: 'A deep, tournament-driven game. The meta and your staples are what the audience lives for.',
    defaultCadence: 12,
    segments: { competitive: 5_000, casual: 3_500, collectors: 2_000 },
    archetypes: { aggro: 30, control: 25, combo: 25, midrange: 20 },
  },
  {
    id: 'combo', name: 'Combo-driven', resembles: 'Yu-Gi-Oh-like',
    blurb: 'Fast, explosive, combo-forward. A hungry player base that churns through power quickly.',
    defaultCadence: 9,
    segments: { competitive: 4_500, casual: 4_500, collectors: 1_500 },
    archetypes: { aggro: 30, control: 15, combo: 35, midrange: 20 },
  },
  {
    id: 'indie', name: 'Scrappy indie', resembles: 'Indie / Kickstarter',
    blurb: 'A small passionate community. Less cash, more goodwill — every set matters.',
    defaultCadence: 16,
    segments: { competitive: 2_000, casual: 2_500, collectors: 1_500 },
    archetypes: { aggro: 25, control: 25, combo: 25, midrange: 25 },
  },
]

export function getArchetype(id) {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[0]
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
