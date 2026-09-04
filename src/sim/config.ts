/**
 * Every tunable constant in one place, with dotted-path overrides for
 * balance runs. These starting values are a reasonable first guess, not a
 * tuned economy — see HANDOFF.md "Known problems" for what's still wrong.
 */
import type { SimConfig, Cents } from './types.ts';

const C = (n: number) => Math.round(n) as Cents;

export const defaultConfig: SimConfig = {
  startYear: 2026,

  // The value block was tuned as one unit against the targets in HANDOFF.md,
  // by sweeping over 30 seeds and 25 years. The knobs are not independent:
  // `scarcityExponent` and `referencePopulation` set the day-one ladder, the
  // nostalgia triple decides who climbs it afterwards, and `chaseSigma` sets
  // how far the luckiest card gets. Move one and re-measure all five targets.
  value: {
    baseCardPrice: C(150),
    cameoWeight: 0.15,
    // Deliberately shallow. A steep day-one ladder puts a $100 card in year 2
    // and leaves nothing for the next twenty years to discover.
    scarcityExponent: 0.45,
    artMultiplierWeight: 0.6,
    nostalgiaRatePerYear: 0.16,
    heatDecayPerTick: 0.08,
    noiseSigma: 0.12,
    // Bulk commons are worth cents. A floor at a dollar piles half the
    // population onto one price and calls it a distribution.
    priceFloorCents: C(20),
    priceCeilingMultiple: 5000,
    heatCeiling: 6,
    nostalgiaCeiling: 20,
    chaseSigma: 0.65,
    referencePopulation: 60_000,
    // The gate is tight on purpose. Nostalgia is the engine that separates the
    // top 1% from the rest over twenty years; open it wider and it stops
    // separating anything, because it lifts the whole population together.
    nostalgiaDesireReference: 90,
    nostalgiaStandingReference: 80,
    nostalgiaDecayPerYear: 0.05,
    shockChancePerTick: 0.0015,
    shockGain: 1.1,
  },

  affection: {
    exposureToConvergence: 40,
    convergenceRate: 0.08,
    decayPerTickUnexposed: 0.01,
    resurgenceFromVintage: 0.4,
    resurgenceToModernDemand: 0.3,
    resurgenceDecayPerTick: 0.02,
  },

  attention: {
    perReleaseCost: 0.22,
    regenPerTick: 0.02,
    fatigueGain: 0.18,
    // Proportional decay. Chosen with `fatigueBite`/`fatigueExponent` by sweeping
    // release cadence from 6 to 78 weeks: this triple puts the profit optimum at
    // ~18 weeks, kills a 6-10 week cadence outright, and taxes a once-a-year
    // publisher under 5% of demand.
    fatigueDecay: 0.015,
    fatigueBite: 0.97,
    fatigueExponent: 2,
    fatigueWarnThreshold: 0.45,
    goodwillSensitivity: 0.6,
    goodwillRegenPerTick: 0.001,
    // Must match the player's starting share in world.ts, or the demand curve
    // shifts away from what the value pass was tuned against.
    referenceShare: 0.08,
  },

  printing: {
    qualityGradeShift: { budget: -0.15, standard: 0, premium: 0.12, archival: 0.2 },
    errorRate: { budget: 0.02, standard: 0.008, premium: 0.002, archival: 0.0005 },
    unitCost: { budget: C(80), standard: C(140), premium: C(240), archival: C(400) },
    errorDiscoveryChance: 0.01,
  },

  // First-guess numbers, wired for behaviour and NOT swept — the balance pass
  // owns them. The shape that matters: art costs money and takes weeks, so it
  // has to be started before the print run is committed; a card whose art does
  // not arrive in time still ships, at `houseQuality`; and who will take a
  // brief at all depends on relationship, brand standing and exclusivity.
  art: {
    /** Quality of in-house filler. The floor a card falls back to. */
    houseQuality: 0.15,
    /** Weight on the artist's linework/colour/composition mean. */
    statsWeight: 0.75,
    /** Width of the roll on top of stats. Two briefs to one artist differ. */
    qualityNoise: 0.35,
    /**
     * Paying over the artist's rate buys a better result, with diminishing
     * returns — logarithmic in the multiple of rate, so a caller cannot buy a
     * masterpiece by paying a hundred times.
     */
    budgetQualityGain: 0.18,
    /** Turnaround multiplier at speed 0 and at speed 1. */
    slowestTurnaround: 1.4,
    fastestTurnaround: 0.7,
    /**
     * An unreliable artist runs late. Weeks added, scaled by (1 - reliability).
     * The roll is exponential and capped at 3x this scale, so it has to be able
     * to cross the 18 weeks between commit and release — otherwise the
     * house-art path never fires and the schedule is decorative. How often it
     * should cross is unswept.
     */
    maxLateWeeks: 8,
    /** Relationship: earned by commissioning, decays when you stop. */
    relationshipPerCommission: 0.05,
    relationshipDecayPerTick: 0.0015,
    /**
     * Below this an artist turns the brief down, unless they are on a retainer.
     * Brand standing offsets it: a known studio gets its calls returned.
     */
    minRelationshipToAccept: 0.25,
    brandStandingOffsetsRelationship: 0.3,
    /** Weekly bills, as a multiple of the artist's per-card rate. */
    retainerWeeklyMultiple: 0.35,
    exclusiveWeeklyMultiple: 1.1,
    /** A retainer discounts each brief; an exclusive discounts it further. */
    retainerFeeDiscount: 0.2,
    exclusiveFeeDiscount: 0.35,
    /** Roster drift: newcomers arrive, the established retire or price up. */
    newcomerChancePerTick: 0.012,
    retireChancePerTick: 0.0009,
    maxRosterSize: 24,
    /** A rising reputation drags the rate up behind it. */
    rateGrowthPerReputation: 2.5,
    rateAdjustRate: 0.02,
  },

  finance: {
    interestBase: 0.14,
    creditToRate: 0.08,
    borrowCeilingMultiple: 2.5,
    brandConvergenceRate: 0.01,
  },

  sealed: {
    contentsWeight: 0.6,
    baseRipRatePerTick: 0.01,
    ripPriceElasticity: 0.8,
    sealedNostalgiaRatePerYear: 0.04,
    heatDecayPerTick: 0.05,
    heatCeiling: 4,
  },

  // Swept on `unitsPerScalperReference`, which was the knob holding the whole
  // population on its floor. The loop this block has to produce is scalpers
  // arriving when resale pays, buying the drop out, and leaving again once they
  // have closed the premium; it now does that about every six years.
  drops: {
    cadenceWeeks: 6,
    collectorReach: 0.06,
    scalperReach: 0.5,
    scalperSpeed: 3,
    breakEvenPremium: 0.15,
    baseResaleRate: 0.04,
    holdLimitWeeks: 26,
    // Units a scalper has to be flipping per stride to count as fully
    // employed. At 1 no realistic drop cadence could ever supply that, so
    // crowding was near zero for everybody, the trade never cleared its
    // hurdle, and the population sat on its floor taking 11% of a drop. At
    // 0.3 it settles near 900, cycles about every six years, and scalpers
    // take about a quarter of the units — a real force at the queue with
    // collectors still taking the majority. Below ~0.1 it runs away toward
    // `maxScalpers` and stops cycling at all.
    unitsPerScalperReference: 0.3,
    resaleUrgency: 0.5,
    populationGrowth: 0.06,
    minScalpers: 50,
    maxScalpers: 40_000,
    profitabilitySmoothing: 0.1,
    goodwillPerCollectorDrop: 0.01,
    goodwillPerScalperDrop: 0.014,
    goodwillPerShortage: 0.006,
    heatPerOversubscription: 0.35,
    dumpHeatDrag: 1.5,
  },

  channels: {
    relationshipGainPerSellThrough: 0.02,
    relationshipLossPerUnsold: 0.03,
    unsoldGraceWeeks: 26,
    evaluationWindowWeeks: 104,
    reopenRelationship: 0.45,
    sellThroughTarget: 0.6,
    strainThreshold: 0.3,
    lossThreshold: 0.12,
    idleDriftPerTick: 0.004,
    idleGraceWeeks: 78,
    streetPriceLerp: 0.15,
    stalenessPerWeek: 0.012,
    // Distributors and chains cost relationship-building money, not a licence fee.
    // The direct store is the one you actually build.
    unlockCost: {
      lgs: C(0),
      distributor: C(150_000_00),
      bigbox: C(400_000_00),
      online: C(80_000_00),
      direct: C(750_000_00),
    },
  },

  // First-guess numbers, wired for behaviour rather than swept. The shape that
  // matters: every lever diminishes, and none of them can rescue a set the
  // audience does not want — hype multiplies demand, it does not create it.
  hype: {
    defaultCadenceWeeks: 2,
    revealHypePerCard: 0.05,
    revealHalfLife: 0.8,
    revealAttentionCost: 0.004,
    marketingReference: C(100_000_00),
    marketingHypeGain: 0.35,
    prereleaseCostPerScale: C(25_000_00),
    prereleaseHypeGain: 0.12,
    prereleaseGoodwillGain: 0.02,
    prereleaseRelationshipGain: 0.04,
    ceiling: 3,
    decayPerTickAfterRelease: 0.06,
    // Wide on purpose. The read has to be genuinely poor without a campaign,
    // or the reveal window is a solved problem and its levers buy nothing: at
    // 0.55 a publisher who spent nothing already scored r = 0.93. Error shrinks
    // as 1/sqrt(previews), so 2.0 puts a default three-preview window at
    // r = 0.55 and a sixteen-preview campaign at r = 0.86.
    signalNoiseSigma: 2.0,
    heatFromHype: 0.8,
  },

  // First-guess numbers. The shape that matters: grading has to be worth doing
  // only on cards that are already worth something (the fee is a real hurdle),
  // and a gem has to stay rare enough to be worth chasing — which is what print
  // quality and grader strictness between them decide.
  grading: {
    submitRatePerTick: 0.004,
    feeWorthMultiple: 5,
    appetiteCeiling: 4,
    maxGradedShare: 0.35,
    // On the familiar 1-10 scale. A standard-quality copy averages a 9, so a
    // 10 is a tail event rather than the expected outcome of submitting.
    conditionMean: 9,
    conditionSigma: 0.7,
    gradeShiftWeight: 3,
    strictnessWeight: 0.6,
    agePenaltyPerYear: 0.02,
    agePenaltyCap: 0.8,
    tierMultiplier: { '10': 4.5, '9.5': 2.4, '9': 1.6, '8': 1.1, '7': 0.85, below7: 0.55 },
    reputationWeight: 0.35,
    // A pop report of one tier of one printing is counted in tens, not
    // thousands, so the reference has to sit down where the counts actually
    // are. At 250 every tier was pinned to `popScarcityCeiling` and the
    // pop-report term stopped saying anything at all.
    popScarcityReference: 8,
    popScarcityExponent: 0.35,
    popScarcityCeiling: 2.5,
    popScarcityFloor: 0.5,
    priceLerp: 0.35,
    // Swept over 4 seeds x 50 years on `conservative`: 0.4 lets the third
    // grader in around year 3, before the publisher is anybody, and 0.65 keeps
    // it out until year 26 in the slower seeds. At 0.55 it arrives between
    // years 4 and 13 depending on how the run has gone, which is what a
    // brand-standing reward should look like.
    sideGraderBrandGate: 0.55,
  },

  // First-guess numbers. The shape that matters: a region has to be able to be
  // the wrong region, or opening one is a pure size multiplier and the decision
  // is "yes, all of them, as soon as you can afford it".
  region: {
    knowledgeGainPerRelease: 0.02,
    knowledgeGainPerResearch: 0.05,
    mismatchPenalty: 0.25,
    /**
     * Spread on a region reading at `knowledge` 0. Wide on purpose, for the
     * same reason `hype.signalNoiseSigma` is: a reading that is nearly right
     * from the first week makes knowledge worthless and the entry bet solved.
     */
    readingNoiseSigma: 0.8,
    /** Weeks between a region unlock and the first release the player can ship there. */
    entryLeadWeeks: 26,
  },

  history: {
    weeklyRetentionTicks: 520,
    writeThreshold: 0.03,
  },
};

/** Applies dotted-path numeric overrides (e.g. "value.noiseSigma") to a clone. */
export function withOverrides(base: SimConfig, overrides: Record<string, number>): SimConfig {
  const clone: SimConfig = JSON.parse(JSON.stringify(base));
  for (const [path, value] of Object.entries(overrides)) {
    const parts = path.split('.');
    let node: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = node[parts[i]!];
      if (next === undefined) throw new Error(`unknown config path: ${path}`);
      node = next as Record<string, unknown>;
    }
    const last = parts[parts.length - 1]!;
    if (node[last] === undefined) throw new Error(`unknown config path: ${path}`);
    node[last] = value;
  }
  return clone;
}
