/**
 * The gate table. The single source of truth for every balance band.
 *
 * Why TypeScript and not JSON: `npm run typecheck` is the only static check
 * this repo has, and typing a metric key as `keyof RunMetrics` turns a renamed
 * or deleted column into a compile error. A required `why` field means a band
 * cannot be set without a reason, which JSON cannot enforce without a validator
 * nobody will write.
 *
 * Bands are inclusive on both ends. Widen one only in the same change that
 * appends a dated reason to its `why`.
 */
import type { RunMetrics } from './metrics.ts';
import {
  forBot, numbers, median, mean, shareTrue, countWhere, distinctCount,
  deathCauses, rankBots, bots, type Row,
} from './aggregate.ts';

export type Category = 'static' | 'structural' | 'difficulty' | 'shape' | 'subsystem';

export interface GateContext {
  /** 20 seeds x 30 years, every bot. */
  roster: Row[];
  /** 30 seeds x 50 years, `conservative`. */
  shape: Row[];
  /** `sets.csv` from the shape sweep: one row per (bot, seed, set, age). */
  shapeSets: Row[];
  violations: string[];
  typecheckOk: boolean;
  parallelIdentical: boolean;
  bandsInSync: boolean;
}

export interface Gate {
  id: string;
  category: Category;
  band: [number, number];
  expect: 'pass' | 'known-fail';
  /** Value on the day the gate was written. `null` until the first run fills it. */
  banked: number | null;
  bankedOn: string;
  why: string;
  /** The observed value, or `null` for NO-DATA. */
  measure(ctx: GateContext): number | null;
}

// --- typed readers ---------------------------------------------------------

const M = <K extends keyof RunMetrics>(k: K): string => k as string;

/** Median across seeds of one metric, for one bot. */
function medOf(rows: Row[], bot: string, key: keyof RunMetrics): number | null {
  return median(numbers(forBot(rows, bot), M(key)));
}
function meanOf(rows: Row[], bot: string, key: keyof RunMetrics): number | null {
  return mean(numbers(forBot(rows, bot), M(key)));
}
/** Median across seeds over every bot's rows. */
function medAll(rows: Row[], key: keyof RunMetrics): number | null {
  return median(numbers(rows, M(key)));
}

/** A ratio gate that reports NO-DATA unless its denominator column is non-zero somewhere. */
function guarded(
  rows: Row[], bot: string, key: keyof RunMetrics,
  denom: keyof RunMetrics, agg: 'median' | 'mean' = 'median',
): number | null {
  const r = forBot(rows, bot);
  if (numbers(r, M(denom)).every(n => n === 0)) return null;
  return agg === 'median' ? median(numbers(r, M(key))) : mean(numbers(r, M(key)));
}

/** Age-curve reader: median of one `sets.csv` column at one age. */
function atAge(sets: Row[], age: number, key: string): number | null {
  return median(numbers(sets.filter(r => r.ageYears === age && Number(r.n) > 0), key));
}

const DATE = '2026-09-04';

// --- the gates -------------------------------------------------------------

export const GATES: Gate[] = [
  // ---- static ----
  {
    id: 'static.typecheck', category: 'static', band: [1, 1], expect: 'pass',
    banked: 1, bankedOn: DATE,
    why: 'tsc --noEmit is the only static check this repo has.',
    measure: c => (c.typecheckOk ? 1 : 0),
  },
  {
    id: 'static.invariants', category: 'static', band: [0, 0], expect: 'pass',
    banked: 0, bankedOn: DATE,
    why: 'checkInvariants asserts structure. A violation is a bug, never a balance result.',
    measure: c => c.violations.length,
  },
  {
    id: 'static.parallelIdentity', category: 'static', band: [1, 1], expect: 'pass',
    banked: 1, bankedOn: DATE,
    why: 'Rule 4 of 04-workflow.md. A run is a pure function of (bot, seed, years, config), '
       + 'so the threaded and synchronous CSVs must match byte for byte. This is the '
       + 'acceptance test the whole harness rests on.',
    measure: c => (c.parallelIdentical ? 1 : 0),
  },
  {
    id: 'static.bandsInSync', category: 'static', band: [1, 1], expect: 'pass',
    banked: 1, bankedOn: DATE,
    why: 'The band table in 03-targets.md is generated from this file. If they drift, '
       + 'the documented target and the enforced target stop being the same thing.',
    measure: c => (c.bandsInSync ? 1 : 0),
  },

  // ---- structural: the mechanisms must still exist ----
  {
    id: 'struct.deathRoutes', category: 'structural', band: [4, 4], expect: 'pass',
    banked: 4, bankedOn: DATE,
    why: 'CONCEPT.md §7 lists four routes after irrelevance was cut with rivals. All four '
       + 'must fire with at least five runs each, or a whole failure mode has gone quiet.',
    measure: c => countWhere(
      [...deathCauses(c.roster).entries()].map(([cause, n]) => ({ cause, n })) as unknown as Row[],
      r => Number(r.n) >= 5,
    ),
  },
  {
    id: 'struct.overprintDeaths', category: 'structural', band: [15, 95], expect: 'pass',
    banked: 49, bankedOn: DATE,
    why: 'Overprint needs storagePerUnitPerTick to bite. The growth arc makes cash '
       + 'plentiful, so this is the gate that catches the storage line going slack.',
    measure: c => deathCauses(c.roster).get('overprint') ?? 0,
  },
  {
    id: 'struct.debtSpiralDeaths', category: 'structural', band: [15, 90], expect: 'pass',
    banked: 62, bankedOn: DATE,
    why: 'Debt spiral needs the weeklyOverhead lines to bite. The idle bot contributes 20 '
       + 'of these by construction: it releases nothing and dies of the standing bill.',
    measure: c => deathCauses(c.roster).get('debt_spiral') ?? 0,
  },
  {
    id: 'struct.channelCollapseDeaths', category: 'structural', band: [8, 70], expect: 'pass',
    banked: 27, bankedOn: DATE,
    why: 'Reached by channelHog and globalist. Guards the souring mechanism.',
    measure: c => deathCauses(c.roster).get('channel_collapse') ?? 0,
  },
  {
    id: 'struct.attentionCollapseDeaths', category: 'structural', band: [8, 60], expect: 'pass',
    banked: 20, bankedOn: DATE,
    why: 'Reached by attentionBurner. The route nothing else touches until the finance round.',
    measure: c => deathCauses(c.roster).get('attention_collapse') ?? 0,
  },
  {
    id: 'struct.speculatorMoves', category: 'structural', band: [1.2, 500], expect: 'pass',
    banked: 5.944, bankedOn: DATE,
    why: 'Rule 9 of 04-workflow.md: a population that reports the same number every seed '
       + 'is a constant wearing a population\'s clothes. A swing at or below 1.2 means '
       + 'the speculator pool never moved.',
    measure: c => medOf(c.roster, 'conservative', 'speculatorSwing'),
  },
  {
    id: 'struct.collectorNotPinned', category: 'structural', band: [5, 1e9], expect: 'pass',
    banked: 18, bankedOn: DATE,
    why: 'Same rule. collectorDensityReference at 0.03 once pinned every seed to the '
       + 'holding ceiling; distinct values across seeds is how that gets caught early.',
    measure: c => distinctCount(forBot(c.roster, 'conservative'), M('collectorHeldShare')),
  },
  {
    id: 'struct.printRunVaries', category: 'structural', band: [4, 100], expect: 'pass',
    banked: 12, bankedOn: DATE,
    why: 'How much to print is the bet the whole game is about. If every bot converges on '
       + 'one run size, the roster cannot measure the decision.',
    measure: c => {
      const all = medAll(c.roster, 'meanPrintRun');
      if (all === null || all === 0) return null;
      return countWhere(
        bots(c.roster).map(b => ({ v: medOf(c.roster, b, 'meanPrintRun') ?? 0 })) as unknown as Row[],
        r => Math.abs(Number(r.v) - all) / all > 0.10,
      );
    },
  },

  // ---- difficulty: the studio must be able to die ----
  {
    id: 'diff.botsAlwaysSurvive', category: 'difficulty', band: [3, 11], expect: 'pass',
    banked: 7, bankedOn: DATE,
    why: 'Not every strategy may survive, and not every strategy may die. Both ends of '
       + 'this band are failure states for the difficulty curve.',
    measure: c => countWhere(
      bots(c.roster).map(b => ({ s: shareTrue(forBot(c.roster, b), 'survived') })) as unknown as Row[],
      r => Number(r.s) === 1,
    ),
  },
  {
    id: 'diff.botsNeverSurvive', category: 'difficulty', band: [2, 8], expect: 'pass',
    banked: 6, bankedOn: DATE,
    why: 'The regression bots (flooder, attentionBurner, idle) must die, and a couple of '
       + 'probe strategies alongside them. Zero would mean nothing is unviable.',
    measure: c => countWhere(
      bots(c.roster).map(b => ({ s: shareTrue(forBot(c.roster, b), 'survived') })) as unknown as Row[],
      r => Number(r.s) === 0,
    ),
  },
  {
    id: 'diff.conservativeSurvives', category: 'difficulty', band: [0.95, 1.0], expect: 'known-fail',
    banked: 0.9, bankedOn: DATE,
    why: 'conservative is the control the whole roster is read against. If the baseline '
       + 'strategy stops being viable, every bot-to-bot comparison loses its reference.'
       + ' [2026-09-04, round 2] The growth arc moved this from 1.00 to 0.90. Round 10 owns difficulty.',
    measure: c => shareTrue(forBot(c.roster, 'conservative'), 'survived'),
  },
  {
    id: 'diff.hypeGamblerSurvival', category: 'difficulty', band: [0.40, 0.85], expect: 'pass',
    banked: 0.65, bankedOn: DATE,
    why: 'The greedy campaign must be able to lose. If it stops dying, the reveal window '
       + 'has stopped being a bet.',
    measure: c => shareTrue(forBot(c.roster, 'hypeGambler'), 'survived'),
  },
  {
    id: 'diff.hypeGamblerTopEarner', category: 'difficulty', band: [1, 3], expect: 'pass',
    banked: 1, bankedOn: DATE,
    why: 'Gate the ordering, not the dollars. Every dollar figure in HANDOFF.md has moved '
       + 'on every pass, including passes that changed no formula. The claim is that the '
       + 'riskiest strategy earns the most, and that is a rank.',
    measure: c => rankBots(c.roster, M('netWorth')).indexOf('hypeGambler') + 1 || null,
  },
  {
    id: 'diff.allInSurvival', category: 'difficulty', band: [0.10, 0.60], expect: 'known-fail',
    banked: 0.8, bankedOn: DATE,
    why: 'Betting the whole bankroll must usually lose and occasionally win.'
       + ' [2026-09-04, round 2] Was 0.35. The bet-size ladder now competes against market-sized runs, so betting the bankroll is no longer the biggest bet in the roster. Round 10 owns it.',
    measure: c => shareTrue(forBot(c.roster, 'allIn'), 'survived'),
  },
  {
    id: 'diff.flooderDiesEarly', category: 'difficulty', band: [0.4, 2.5], expect: 'pass',
    banked: 0.9, bankedOn: DATE,
    why: 'The flood-death regression. CONCEPT.md §6.2 requires over-releasing to be a cliff.',
    measure: c => medOf(c.roster, 'flooder', 'deathYear'),
  },
  {
    id: 'diff.attentionBurnerDies', category: 'difficulty', band: [0.85, 1.0], expect: 'pass',
    banked: 1.0, bankedOn: DATE,
    why: 'The attention-death regression, and the only bot that reaches that route.',
    measure: c => {
      const r = forBot(c.roster, 'attentionBurner');
      return r.length ? countWhere(r, x => x.deathCause === 'attention_collapse') / r.length : null;
    },
  },
  {
    id: 'diff.idleDies', category: 'difficulty', band: [2.5, 9.0], expect: 'known-fail',
    banked: 12.02, bankedOn: DATE,
    why: 'Doing nothing must lose. finance.weeklyOverheadBase\'s comment claims a studio '
       + 'that releases nothing "runs out of its $500,000 in about five years". Measured: '
       + 'it dies at year 12. Cash alone lasts 7.7 years at $65k of overhead, and the '
       + 'borrow ceiling carries it the rest. Nothing measured this until the idle bot '
       + 'existed, because every other bot releases something. Round 10 decides whether '
       + 'the number or the comment is wrong; the band states the documented claim.',
    measure: c => medOf(c.roster, 'idle', 'deathYear'),
  },
  {
    id: 'diff.deathsLandMidRun', category: 'difficulty', band: [3.0, 25.0], expect: 'pass',
    banked: 15.27, bankedOn: DATE,
    why: 'Excluding the three regression bots, a death should be the end of a story rather '
       + 'than an opening move. Year-one deaths mean the opening is unsurvivable.',
    measure: c => median(numbers(
      c.roster.filter(r => !['flooder', 'attentionBurner', 'idle'].includes(String(r.bot))),
      M('deathYear'),
    )),
  },
  {
    id: 'diff.sellThrough', category: 'difficulty', band: [0.75, 0.95], expect: 'pass',
    banked: 0.88, bankedOn: DATE,
    why: 'referenceRunUnits was swept so a reference run clears about 87%. Full sell-through '
       + 'means the blind bet has no downside; a collapse means it has no upside.',
    measure: c => guarded(c.roster, 'conservative', 'avgSellThrough', 'meanPrintRun', 'mean'),
  },
  {
    id: 'diff.flopRate', category: 'difficulty', band: [0.01, 0.25], expect: 'pass',
    banked: 0.034, bankedOn: DATE,
    why: 'A set that does not make its print run back. Guarded on flopSetsJudged, because '
       + 'a studio that dies before any set is a year old has no flop rate at all — that '
       + 'guard is why flooder no longer reports the best flop rate in the roster.',
    measure: c => guarded(c.roster, 'conservative', 'flopRate', 'flopSetsJudged', 'mean'),
  },

  // ---- shape: per set, at age 2. The Round 4 targets. ----
  {
    id: 'shape.median', category: 'shape', band: [0.20, 0.50], expect: 'known-fail',
    banked: 3.23, bankedOn: DATE,
    why: 'Measured median of a modern set is $0.24-$0.34, stable across 15 Magic sets '
       + '2020-2025 (05-real-world.md §2).',
    measure: c => guarded(c.shape, 'conservative', 'setMedianAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.under1', category: 'shape', band: [0.64, 0.92], expect: 'known-fail',
    banked: 0.071, bankedOn: DATE,
    why: 'Measured bulk share of a modern set. Ours is an order of magnitude short: our '
       + 'cards never decay to bulk at all.',
    measure: c => guarded(c.shape, 'conservative', 'setShareUnder1Age2', 'setsAtAge2'),
  },
  {
    id: 'shape.under25c', category: 'shape', band: [0.25, 0.80], expect: 'known-fail',
    banked: 0.0, bankedOn: DATE,
    why: 'Measured 30-50% for Magic, 67-77% for Pokemon. Ours is zero.',
    measure: c => guarded(c.shape, 'conservative', 'setShareUnder25cAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.top1', category: 'shape', band: [0.21, 0.62], expect: 'known-fail',
    banked: 0.139, bankedOn: DATE,
    why: 'Measured top-1% value share, median about 0.35.',
    measure: c => guarded(c.shape, 'conservative', 'setTop1ShareAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.top10', category: 'shape', band: [0.66, 0.95], expect: 'known-fail',
    banked: 0.447, bankedOn: DATE,
    why: 'Measured top-10% value share, median about 0.78. We reach 0.78 by age 25 — the '
       + 'engine works, it is just twenty-three years late.',
    measure: c => guarded(c.shape, 'conservative', 'setTop10ShareAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.gini', category: 'shape', band: [0.72, 0.98], expect: 'known-fail',
    banked: 0.547, bankedOn: DATE,
    why: 'Measured Gini of a modern set price vector, central value 0.85. Real sets are '
       + 'born unequal; ours are born flat and separate slowly.',
    measure: c => guarded(c.shape, 'conservative', 'setGiniAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.chaseOverMedian', category: 'shape', band: [130, 3100], expect: 'known-fail',
    banked: 17.9, bankedOn: DATE,
    why: 'Measured 130x-3100x, central ~1000x. The whole-catalogue metric read 1125x and '
       + 'looked correct; that was pooling fifty years, not spread within a set.',
    measure: c => guarded(c.shape, 'conservative', 'setChaseOverMedianAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.tailAlpha', category: 'shape', band: [1.6, 2.7], expect: 'pass',
    banked: 2.50, bankedOn: DATE,
    why: 'Hill tail index over the top decile. Measured 1.6-2.7. The one shape target we '
       + 'already meet, so it is a pass gate and protects the tail while the body moves.',
    measure: c => guarded(c.shape, 'conservative', 'setTailAlphaAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.ageCurveDirection', category: 'shape', band: [0.02, 0.45], expect: 'known-fail',
    banked: -0.06, bankedOn: DATE,
    why: 'Bulk share must RISE from age 1 to age 8: real sets go 64% to about 90%. Ours '
       + 'falls, because scarcity climbs as copies are collected and nothing pushes an '
       + 'unwanted old card down. This gate states the Round 0 finding as a test.',
    measure: c => {
      const a1 = atAge(c.shapeSets, 1, 'shareUnder1');
      const a8 = atAge(c.shapeSets, 8, 'shareUnder1');
      return a1 === null || a8 === null ? null : a8 - a1;
    },
  },
  {
    id: 'shape.ageCurveLate', category: 'shape', band: [0.55, 0.92], expect: 'known-fail',
    banked: 0.014, bankedOn: DATE,
    why: 'By age 25 a real set is 69-82% bulk, after the vintage turn lifts some cards back. '
       + 'Ours is 1%.',
    measure: c => atAge(c.shapeSets, 25, 'shareUnder1'),
  },

  // ---- shape: whole-catalogue legacy targets, kept because the value block is tuned on them ----
  {
    id: 'shape.surpriseGrail', category: 'shape', band: [0.10, 0.60], expect: 'known-fail',
    banked: 1.0, bankedOn: DATE,
    why: 'CONCEPT.md §10: a common or uncommon must occasionally break out 100x. Emergent '
       + 'value, not authored by rarity placement. '
       + 'Measured on the 30-year ROSTER sweep, not the 50-year shape sweep: this is a '
       + 'per-run boolean, so it is strongly horizon-dependent — 0.40 over 30 years and '
       + '0.80 over 50. One horizon, one band.'
       + ' [2026-09-04, round 2] Was 0.40. Prices rose with the market, so a 100x breakout is now certain. Round 4 lowers the whole price body about elevenfold and should restore it.',
    measure: c => shareTrue(forBot(c.roster, 'conservative'), 'surpriseGrail'),
  },
  {
    id: 'shape.yearsTo100', category: 'shape', band: [2.0, 9.0], expect: 'pass',
    banked: 5.2, bankedOn: DATE,
    why: 'How long before the catalogue produces its first $100 card. Too fast and the next '
       + 'twenty years have nothing to discover.',
    measure: c => medOf(c.shape, 'conservative', 'yearsToFirst100Dollar'),
  },

  // ---- subsystem ----
  {
    id: 'sub.signalLow', category: 'subsystem', band: [0.30, 0.72], expect: 'pass',
    banked: 0.505, bankedOn: DATE,
    why: 'A publisher who spends nothing must read the market poorly. At 0.93 the reveal '
       + 'window was a solved problem and its levers bought nothing.',
    measure: c => guarded(c.roster, 'conservative', 'signalCorrelation', 'signalPairs'),
  },
  {
    id: 'sub.signalHigh', category: 'subsystem', band: [0.65, 0.97], expect: 'pass',
    banked: 0.827, bankedOn: DATE,
    why: 'A full campaign must read well and still be able to be wrong.',
    measure: c => guarded(c.roster, 'hypeBuilder', 'signalCorrelation', 'signalPairs'),
  },
  {
    id: 'sub.signalRises', category: 'subsystem', band: [0.08, 0.55], expect: 'pass',
    banked: 0.322, bankedOn: DATE,
    why: 'Error shrinks as 1/sqrt(previews), so more previews must buy a better reading. '
       + 'If this goes flat, the campaign is buying nothing measurable.',
    measure: c => {
      const lo = guarded(c.roster, 'conservative', 'signalCorrelation', 'signalPairs');
      const hi = guarded(c.roster, 'hypeBuilder', 'signalCorrelation', 'signalPairs');
      return lo === null || hi === null ? null : hi - lo;
    },
  },
  {
    id: 'sub.gem10Premium', category: 'subsystem', band: [2.0, 5.5], expect: 'known-fail',
    banked: 7.8, bankedOn: DATE,
    why: 'Measured 2-5x for modern cards, 5-10x vintage. Too low and nobody submits; too '
       + 'high and raw prices stop meaning anything.'
       + ' [2026-09-04, round 2] Was 4.66. Scale-coupling popScarcityReference moved the pop-report term, and the price level moved under it. Round 6 owns grading.',
    measure: c => guarded(c.roster, 'conservative', 'gem10Premium', 'gradedCopies'),
  },
  {
    id: 'sub.gradedPrintingShare', category: 'subsystem', band: [0.02, 0.09], expect: 'known-fail',
    banked: 0.121, bankedOn: DATE,
    why: 'The fee must be a real hurdle. Matches the measured "about one card in twenty".'
       + ' [2026-09-04, round 2] Was 0.047, same cause as gem10Premium. Round 6 owns grading.',
    measure: c => medOf(c.roster, 'conservative', 'gradedPrintingShare'),
  },
  {
    id: 'sub.gemRate', category: 'subsystem', band: [0.30, 0.60], expect: 'known-fail',
    banked: 0.096, bankedOn: DATE,
    why: 'GemRate measured 50-53% for modern TCG in 2024-25. Ours is 9.6%: conditionMean 9 '
       + 'against a 9.75 cut puts a 10 near the 14th percentile where reality puts it at '
       + 'the median. The fix is a widened qualityGradeShift, not a global raise.',
    measure: c => guarded(c.roster, 'conservative', 'gemRate', 'gradedCopies'),
  },
  {
    id: 'sub.scalperCycles', category: 'subsystem', band: [3, 35], expect: 'pass',
    banked: 16, bankedOn: DATE,
    why: 'The population must cycle rather than settle. Zero means it never moved.',
    measure: c => guarded(c.roster, 'dropRunner', 'scalperCycles', 'dropsRun'),
  },
  {
    id: 'sub.scalperShare', category: 'subsystem', band: [0.10, 0.50], expect: 'known-fail',
    banked: 0.038, bankedOn: DATE,
    why: 'Measured 10-50% of entries on a high-demand drop (Nike SNKRS, substituted from '
       + 'sneakers). Ours is 2-8%, and the unitsPerScalperReference comment claiming a '
       + 'quarter of units no longer matches its own measurement.',
    measure: c => guarded(c.roster, 'dropRunner', 'scalperShareOfDrops', 'dropsRun'),
  },
  {
    id: 'sub.houseArtShare', category: 'subsystem', band: [0.02, 0.20], expect: 'pass',
    banked: 0.089, bankedOn: DATE,
    why: 'A deadline that cannot be missed is not a deadline, and one missed every time is '
       + 'not a schedule. About one card in eleven shipping as filler is the target.',
    measure: c => medOf(c.roster, 'conservative', 'houseArtShare'),
  },
  {
    id: 'sub.channelHogLosesReach', category: 'subsystem', band: [0.5, 6], expect: 'known-fail',
    banked: 7, bankedOn: DATE,
    why: 'CONCEPT.md §6.5: over-allocating to one channel sours it. If channelHog stops '
       + 'losing channels, the souring mechanism has gone quiet.'
       + ' [2026-09-04, round 2] Was 4. Scale-coupled channel capacity changed what over-allocating means. Round 10 owns difficulty; watch that it does not keep climbing.',
    measure: c => medOf(c.roster, 'channelHog', 'channelsLost'),
  },
];

/** The Markdown table pasted into docs/tuning/03-targets.md between the markers. */
export function bandTable(): string {
  const rows = GATES.map(g => {
    const b = g.banked === null ? '—' : String(Number(g.banked.toFixed(4)));
    return `| \`${g.id}\` | ${g.category} | ${g.band[0]} – ${g.band[1]} | ${b} | ${g.expect} |`;
  });
  return [
    '| Gate | Category | Band | Banked | Expect |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
