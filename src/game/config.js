// Onboarding config — the identity the player sets before a run. Every TCG in
// this sim is a collectible-first game (art, chase rarities, and nostalgia
// drive the base) — there's no ECONOMY genre choice (see the removed
// archetype picker), just a name, a release-cadence pledge, and — flavor
// only — what your cards actually depict (see content/concepts.js).

import { DEFAULT_CONCEPT_ID } from './content/concepts.js'

// Starting segment lean: the casual/collector split new players discover into
// as the base grows from zero (see initialState.js/segments.js).
export const STARTING_SEGMENT_LEAN = { casual: 5_000, collectors: 4_000 }

// A fresh studio's starting cash.
//
// Raised from 250,000 when recurring costs (overhead.js) arrived. A first set
// costs about $143k and its revenue decays from ~$12k/wk to ~$4k/wk over its
// first 30 weeks while overhead climbs past $6k/wk — so at the old figure cash
// peaked around $134k just as the second set became due at $143k, and a studio
// that did everything right could still never ship set two. The run needs
// enough runway to get a second product on the shelf; everything after that it
// has to earn.
export const STARTING_CASH = 400_000

// Genre norm for a collectible-first TCG's release rhythm.
export const DEFAULT_CADENCE_WEEKS = 14

// Nostalgia-erosion dial: the level a NEUTRAL shelf rests at.
//
// The dial used to have no equilibrium except zero. A release pushed it by
// `(loudness - 50) / 5`, which is exactly 0 at the default loudness, while the
// weekly decay subtracted a flat 0.25 unconditionally — so it slid to 0 by
// about week 140 and stayed there for the rest of every run, and both of its
// consumers (segments.js's collector bleed, rival.js's collector nibble) read
// permanent zero. It now RELAXES toward the level the current shelf sustains,
// and its consumers read the two-sided deviation from this neutral point, so a
// restrained catalogue is a real reward rather than merely the absence of a
// penalty. Shared here so every reader agrees on where neutral is.
export const PRINT_INTENSITY_NEUTRAL = 40
// How far either side of neutral the dial's full effect spans.
export const PRINT_INTENSITY_SPAN = 45

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

// Going dark must CRIPPLE a studio, not guarantee its death.
//
// The unrest used to subtract `1.5 * lateBy` from every persona every week with
// nothing bounding it, so the cumulative loss was 1.5·n(n+1)/2 — it crossed the
// -100 revolt floor at about 11 weeks late, every time, on a fixed schedule.
// That quadratic cliff was not *a* difficulty in this game, it was the ONLY one:
// every recorded harness failure was the same event at the same moment.
//
// Unrest now drives sentiment DOWN TO a floor and holds it there. A silent
// studio still craters its sales, its growth and its reputation, and sits one
// scandal away from ruin — but ending a run takes cadence failure PLUS something
// else, which is the right bar for a loss condition.
export const CADENCE_SENTIMENT_FLOOR_BASE = -20 // being late alone lands here…
export const CADENCE_SENTIMENT_FLOOR_PER_WK = -4 // …dropping this much per further week late
export const CADENCE_SENTIMENT_FLOOR_MIN = -60 // …bottoming out here, short of the -100 revolt
export const CADENCE_FLOOR_RAMP_WEEKS = 10 // weeks late at which the floor reaches its minimum
export const CADENCE_RATE_CAP_WEEKS = 6 // cap on how FAST unrest drives toward the floor

// The OTHER half of a cadence pledge, which never existed: shipping far faster
// than you promised is its own broken promise.
//
// `applyCadencePressure` only ever punished being late, and `resetCadence`
// rewarded any release at all — so the optimal play was to ship the cheapest
// possible set as often as physically possible. A rider every four weeks against
// a 24-week pledge was the single highest-earning strategy in the game, and the
// community said nothing. A treadmill devalues what people just bought, and the
// people who care about fairness notice first.
// Faster than one set per 12 weeks reads as a treadmill regardless of what was
// pledged. Set at 12, not at MIN_CADENCE (6), on purpose: the brief asks for a
// release rhythm of "every few months", and at a low floor a studio could pledge
// an 8-week treadmill up front and pay nothing for running one. 12 leaves the
// brief's 12-20 week band exactly clean and prices everything below it — a set
// released precisely 12 weeks ago falls outside the window, so hitting the band
// costs nothing at all.
export const TREADMILL_FLOOR_WEEKS = 12
export const TREADMILL_SENTIMENT_PER_SET = 2.4 // per excess set in the trailing window, per week

// A young studio gets more rope. Missing a deadline in your first year is a
// startup finding its feet; an established publisher going dark is a scandal.
export const YOUNG_STUDIO_SETS = 3 // sets shipped below which you're brand new
export const YOUNG_STUDIO_GRACE_BONUS = 5 // extra grace weeks while brand new
export const EARLY_STUDIO_SETS = 6 // …and while still finding an audience
export const EARLY_STUDIO_GRACE_BONUS = 2
export const YOUNG_STUDIO_BLEED_MUL = 0.4 // a thin base bleeds more slowly too

// A fresh config (used as the onboarding draft default).
export function defaultConfig() {
  return {
    companyName: '',
    gameName: '',
    conceptId: DEFAULT_CONCEPT_ID,
    cadenceWeeks: DEFAULT_CADENCE_WEEKS,
    started: false,
  }
}
