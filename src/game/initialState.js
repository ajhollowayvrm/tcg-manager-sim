// Initial game state — mirrors the GameState sketch in docs/BRIEF.md.
// This is the single source of truth the simulation mutates each tick.

import { PERSONAS } from './content/personas.js'
import { seedArtists } from './artists.js'

export function createInitialState() {
  return {
    week: 1,
    cash: 250_000,
    playerBase: 10_000,

    // Player segments react differently to the same decision.
    segments: {
      competitive: 3_500, // care about diversity & solve level
      casual: 4_500, // "new toys" crowd — fresh mechanics & power
      collectors: 2_000, // chase value, art, scarcity
    },

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
      // The field's split across the four play styles (sums to ~100). Starts a
      // touch aggro/midrange-leaning so balance reads ~60, not a flat 100.
      archetypes: { aggro: 30, control: 20, combo: 20, midrange: 30 },
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
      speed: 1, // weeks advanced per tick when playing (may be auto-raised on quiet weeks)
      baseSpeed: 1, // the player's chosen speed; auto-fast-forward never goes below it
      autoSpeed: false, // true while the clock is auto-compressing quiet weeks
      autoEvent: null, // transient per-tick directive from clock.js (pause/slow/quiet)
      paused: true,
      pauseReason: 'New game — design your first set.',
    },
  }
}
