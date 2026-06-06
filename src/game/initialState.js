// Initial game state — mirrors the GameState sketch in docs/BRIEF.md.
// This is the single source of truth the simulation mutates each tick.

import { PERSONAS } from './content/personas.js'

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
    metagame: {
      diversity: 70,
      powerLevel: 40,
      archetypeBalance: 60,
      solveLevel: 30,
    },

    sets: [],
    cards: [],
    artists: [], // seeded by content module (~30+ named artists)
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
      paused: true,
      pauseReason: 'New game — design your first set.',
    },
  }
}
