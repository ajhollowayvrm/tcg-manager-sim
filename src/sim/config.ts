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

  region: {
    knowledgeGainPerRelease: 0.02,
    knowledgeGainPerResearch: 0.05,
    mismatchPenalty: 0.25,
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
