// Initial game state — mirrors the GameState sketch in docs/BRIEF.md.
// This is the single source of truth the simulation mutates each tick.

import { PERSONAS } from './content/personas.js'
import { seedArtists } from './artists.js'
import { seedCharacters } from './characters.js'
import { defaultConfig, getArchetype } from './config.js'

// Normalize an archetype's seed segment numbers into fractions that sum to 1 —
// the LEAN that new players distribute into as the base grows from zero.
function normalizeLean(seg) {
  const total = (seg.casual ?? 0) + (seg.collectors ?? 0)
  if (total <= 0) return { casual: 1 / 2, collectors: 1 / 2 }
  return {
    casual: seg.casual / total,
    collectors: seg.collectors / total,
  }
}

// `config` is the onboarding result (or undefined for a bare new game). The
// chosen archetype applies a SMALL starting nudge to segments; indie also
// starts with less cash. Everything else is identity/flavor.
export function createInitialState(config) {
  const cfg = { ...defaultConfig(), ...(config ?? {}) }
  const arch = getArchetype(cfg.archetype)
  // You start with NO players — nobody knows your game yet. The archetype's
  // segment numbers are kept only as the LEAN (the ratio new players discover
  // into); the base itself grows from zero via word-of-mouth + releases.
  const segments = { casual: 0, collectors: 0 }
  const playerBase = 0
  const cash = cfg.archetype === 'indie' ? 140_000 : 250_000

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
    // the archetype's preferred mix (normalized from its seed segment numbers).
    segments,
    segmentLean: normalizeLean(arch.segments),

    // Nostalgia-erosion dial (0–100): loud modern card design mildly bleeds the
    // collectors segment past a mid floor. Pushed up by a high-power-budget
    // release, cools slowly on its own each week, relieved faster by pulling a
    // hot set from print. See segments.js / simulation.js / bans.js.
    printIntensity: 35,

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
