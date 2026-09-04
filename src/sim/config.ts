/**
 * Every tunable constant in one place, with dotted-path overrides for
 * balance runs. These starting values are a reasonable first guess, not a
 * tuned economy — see HANDOFF.md "Known problems" for what's still wrong.
 */
import type { SimConfig, Cents } from './types.ts';

const C = (n: number) => Math.round(n) as Cents;

export const defaultConfig: SimConfig = {
  startYear: 2026,

  value: {
    baseCardPrice: C(150),
    cameoWeight: 0.15,
    scarcityExponent: 0.6,
    artMultiplierWeight: 0.6,
    nostalgiaRatePerYear: 0.05,
    heatDecayPerTick: 0.08,
    noiseSigma: 0.12,
    priceFloorCents: C(100),
    priceCeilingMultiple: 5000,
    heatCeiling: 3,
    nostalgiaCeiling: 8,
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
    fatigueDecay: 0.01,
    goodwillSensitivity: 0.6,
    goodwillRegenPerTick: 0.001,
  },

  printing: {
    qualityGradeShift: { budget: -0.15, standard: 0, premium: 0.12, archival: 0.2 },
    errorRate: { budget: 0.02, standard: 0.008, premium: 0.002, archival: 0.0005 },
    unitCost: { budget: C(80), standard: C(140), premium: C(240), archival: C(400) },
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
