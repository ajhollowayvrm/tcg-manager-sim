// Initial game state — mirrors the GameState sketch in docs/BRIEF.md.
// This is the single source of truth the simulation mutates each tick.

import { PERSONAS } from './content/personas.js'
import { seedArtists } from './artists.js'
import { seedCharacters } from './characters.js'
import { seedRival } from './rival.js'
import { makeRng, hashSeed } from './rng.js'
import { defaultConfig, STARTING_SEGMENT_LEAN, STARTING_CASH, PRINT_INTENSITY_NEUTRAL } from './config.js'

// Normalize the starting seed segment numbers into fractions that sum to 1 —
// the LEAN that new players distribute into as the base grows from zero.
function normalizeLean(seg) {
  const total = (seg.casual ?? 0) + (seg.collectors ?? 0)
  if (total <= 0) return { casual: 1 / 2, collectors: 1 / 2 }
  return {
    casual: seg.casual / total,
    collectors: seg.collectors / total,
  }
}

// `config` is the onboarding result (or undefined for a bare new game).
export function createInitialState(config) {
  const cfg = { ...defaultConfig(), ...(config ?? {}) }
  // You start with NO players — nobody knows your game yet. The starting
  // segment numbers are kept only as the LEAN (the ratio new players discover
  // into); the base itself grows from zero via word-of-mouth + releases.
  const segments = { casual: 0, collectors: 0 }
  const playerBase = 0
  const cash = STARTING_CASH

  return {
    week: 1,
    cash,
    playerBase,

    // Identity + onboarding choices. `started` gates the onboarding screen.
    config: cfg,
    // Cadence pledge tracking: weeks since last release vs the pledged rhythm.
    cadence: { weeks: cfg.cadenceWeeks, lastReleaseWeek: 1, overdueWeeks: 0 },

    // Player segments react differently to the same decision. Start empty; new
    // players (word-of-mouth + releases) distribute into them by `segmentLean`,
    // the starting mix (normalized from STARTING_SEGMENT_LEAN).
    segments,
    segmentLean: normalizeLean(STARTING_SEGMENT_LEAN),

    // Nostalgia-erosion dial (0–100). Starts at NEUTRAL: with no product on the
    // shelf there is nothing eroding and nothing to be nostalgic about yet.
    // Each release declares the level it sustains (sets.js's `printLevel`) and
    // the dial relaxes toward the buzz-weighted mean of the in-print catalogue
    // (simulation.js). Collectors read the deviation from neutral in BOTH
    // directions — restraint pleases them, loud design bleeds them.
    printIntensity: PRINT_INTENSITY_NEUTRAL,

    sets: [],
    cards: [],
    // Live blocks — the era-defining gimmick "blocks" that majors open and
    // minors/micros ride (see blocks.js). They coexist (a new major never
    // retires an old block). Empty until the first major ships.
    blocks: [],
    // Per-artist career state (cost/reach/trajectory) that drifts each week —
    // see artists.js. Identity (name/specialty) stays in the static roster.
    artists: seedArtists(),
    // Persistent character roster (recurring cast a signature card can feature) —
    // fame drifts each week off how their live cards are doing. See characters.js.
    // Empty until the player creates their first character in the set builder.
    characters: seedCharacters(),
    // Personas carry mutable run state on top of their static identity:
    // sentiment (mood), relationship (how cultivated — decays if neglected),
    // and a sponsored flag (an ongoing creator deal).
    // Sentiment starts at 0 (neutral) — nobody has an opinion yet; you earn it.
    personas: PERSONAS.map((p) => ({ ...p, sentiment: 0, relationship: 10, sponsored: false })),

    // Bulk-buyer deals (signed distributors) and the scalper-culture heat gauge
    // they drive. See distributors.js — heat over the threshold tips the game
    // into a price-spiking, community-souring scalper market.
    distributors: [],
    scalperHeat: 0,
    // Grading-partner deals — third-party authentication services that
    // ambiently certify high-value singles each week. See grading.js.
    gradingPartners: [],
    // Weeks in which a live box break ran. Breaks saturate: too many in a short
    // window and the audience stops believing it's a moment. See breaks.js.
    breakHistory: [],
    // Community-goodwill programme, 0..1 — the voluntary money sink and the
    // main way to buy back a soured community. Costs up to $0.55/player/week
    // and its effect is damped by whatever the community is actually angry
    // about, so it repairs goodwill but never buys permission. See overhead.js.
    goodwillSpend: 0,
    // Last week's recurring-cost breakdown ({ staff, lines, catalogue, studio,
    // warehouse, blocks, goodwill, total }) — see overhead.js.
    lastOverhead: null,
    // Anti-scalping policy toggles (see distributors.js/revenue.js) — free
    // standing stances, off by default, each a real revenue/reach tradeoff.
    purchaseLimitPolicy: false,
    phantomStockPolicy: false,
    // Shipping/production capacity — a logistics stat the player can invest in
    // to reduce supply-chain event frequency/severity. See distributors.js
    // upgradeSupplyChain() and events.js's supply_chain weightMul.
    supplyChainCapacity: 40,
    // Franchise Reputation — a slow-moving brand-prestige stat. See franchise.js.
    franchise: { reputation: 5, cadenceEwma: 50, sentimentEwma: 0 },
    // A rival TCG — a persistent, ambient competitor for attention/shelf space.
    // v1 is read-only pressure: no player actions, just a strength gauge that
    // reacts to your cadence/catalog health and periodically bites the casual
    // segment (and, once your design has run loud, a smaller collectors
    // nibble) when it drops its own set. See rival.js.
    rival: seedRival(makeRng(hashSeed(`rival-seed:${cfg.gameName || 'x'}:${cfg.companyName || 'x'}`))),

    // Merchandise lines — a revenue stream decoupled from metagame health. See
    // merch.js.
    merchLines: [],
    lastMerchRevenue: null, // { week, total } from the latest week — mirrors lastRevenue
    // Cross-media ventures (anime/game/film deals) — the long-run ambition
    // layer. See media.js. mediaWomMultiplier/mediaReputationFloor are
    // permanent buffs a landed hit grants (read by segments.js/franchise.js);
    // both default to a no-op until a deal actually lands.
    mediaDeals: [],
    mediaReputationFloor: 0,
    mediaWomMultiplier: 1,
    // Scheduled "wide release" waves from a staggered regional launch — see
    // sets.js/useGame.js RELEASE_SET and simulation.js's weekly check.
    pendingWaves: [],

    feedbackFeed: [], // qualitative chatter — sometimes lies
    eventsFeed: [], // news/curveballs
    movers: [], // notable market movers from the latest week (for the ticker)
    lastRevenue: null, // { week, total, units, perSet } from the latest week
    gameOver: null, // { reason } once cash or player base hits zero

    clock: {
      // Manual time: the player clicks "Advance Week" to step the sim. No timer,
      // no speed, no pause. `reason` is the attention note for the latest week
      // (what changed / what to watch); autoEvent is the transient per-tick
      // directive from clock.js that produces that reason.
      autoEvent: null,
      reason: 'New game — design your first set.',
    },
  }
}
