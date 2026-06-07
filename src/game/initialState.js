// Initial game state — mirrors the GameState sketch in docs/BRIEF.md.
// This is the single source of truth the simulation mutates each tick.

import { PERSONAS } from './content/personas.js'
import { seedArtists } from './artists.js'
import { defaultConfig, getArchetype } from './config.js'

// `config` is the onboarding result (or undefined for a bare new game). The
// chosen archetype applies a SMALL starting nudge to segments/metashare; indie
// also starts with less cash. Everything else is identity/flavor.
export function createInitialState(config) {
  const cfg = { ...defaultConfig(), ...(config ?? {}) }
  const arch = getArchetype(cfg.archetype)
  const segments = { ...arch.segments }
  const playerBase = segments.competitive + segments.casual + segments.collectors
  const cash = cfg.archetype === 'indie' ? 140_000 : 250_000

  return {
    week: 1,
    cash,
    playerBase,

    // Identity + onboarding choices. `started` gates the onboarding screen.
    config: cfg,
    // Cadence pledge tracking: weeks since last release vs the pledged rhythm.
    cadence: { weeks: cfg.cadenceWeeks, lastReleaseWeek: 1, overdueWeeks: 0 },

    // Player segments react differently to the same decision (sized by archetype).
    segments,

    // Metagame health — four interacting dials (0–100).
    // solveLevel is the core-loop engine: resets low on release, decays up weekly.
    // archetypeBalance is DERIVED from `archetypes` each tick (see simulation.js)
    // — it's how even the metashare is. The distribution below is the real state;
    // releases tilt it, solving concentrates it, bans/rotations flatten it.
    metagame: {
      diversity: 70,
      powerLevel: 40,
      archetypeBalance: 60, // derived; seeded to match the starting distribution
      solveLevel: 30,
      // The field's split across the four play styles (sums to ~100), seeded from
      // the chosen archetype's lean so each game starts a little different.
      archetypes: { ...arch.archetypes },
    },

    sets: [],
    cards: [],
    // Per-artist career state (cost/reach/trajectory) that drifts each week —
    // see artists.js. Identity (name/specialty) stays in the static roster.
    artists: seedArtists(),
    // Personas carry a mutable `sentiment` (mood toward the game) on top of
    // their static reach/credibility/taste from the content roster.
    personas: PERSONAS.map((p) => ({ ...p, sentiment: 10 })),

    feedbackFeed: [], // qualitative chatter — sometimes lies
    eventsFeed: [], // news/curveballs
    movers: [], // notable market movers from the latest week (for the ticker)
    lastRevenue: null, // { week, total, units, perSet } from the latest week
    gameOver: null, // { reason } once cash or player base hits zero

    clock: {
      speed: 1, // weeks advanced per tick when playing
      autoEvent: null, // transient per-tick directive from clock.js (pause/slow)
      paused: true,
      pauseReason: 'New game — design your first set.',
    },
  }
}
