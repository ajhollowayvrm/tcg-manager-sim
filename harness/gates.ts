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
 *
 * ## Retired gates
 *
 * A deleted gate leaves no `why` behind, so the reasons live here. Both were
 * retired by AJ's decision on 2026-09-06, at the start of Round 11.
 *
 * - `diff.lateIdleSurvives` — asked whether a studio that runs well for twenty
 *   years and then stops still dies. It does not: it survived 85% of 50-year
 *   runs, and killing it needs a standing bill about 20x the current one, which
 *   costs `conservative` 60 points of survival. **The gate was wrong, not the
 *   model** — a mature studio with a back catalogue and twenty years of banked
 *   cash should be hard to kill, and the mechanism that would kill it is not
 *   overhead. The `lateIdle` bot STAYS: it feeds `diff.botsAlwaysSurvive`,
 *   `diff.botsNeverSurvive` and the four death-route rates.
 * - `shape.surpriseGrail` — could not pass at any knob value. It is a
 *   scale-invariant ratio over the whole catalogue, so at 280 cards a set it
 *   asks whether any one of about 8,400 printings ever broke out in 30 years,
 *   and the answer is certain. Fixing it needs the metric redefined per set,
 *   against a band `05-real-world.md` says the research cannot supply. The
 *   `surpriseGrail` METRIC stays — CONCEPT.md §10 still wants the behaviour
 *   visible, it just cannot be a band.
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
  /** null when the sweep was read from a bank rather than run. */
  saveRoundTrips: boolean | null;
  bandsInSync: boolean;
  /**
   * Decisions with no control, decision kinds with no wrapper, and config
   * leaves the coverage manifest does not classify — summed.
   */
  uiCoverageGaps: number;
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

/**
 * Share of the sweep's runs that died of one cause.
 *
 * A RATE, not a count. These four gates counted deaths over a fixed roster of
 * 20 bots x 20 seeds, so every band was really a statement about 400 runs with
 * the denominator left implicit — and the moment the roster grows, the gate
 * fails on arithmetic rather than on mechanism. `struct.debtSpiralDeaths` read
 * 83 against a ceiling of 90 with four new bots waiting to be added. It is the
 * same defect Round 10 repaired one level down in `diff.flopRate`: a rate over
 * runs is pooled, never averaged, and never left as a bare count.
 */
function deathRate(rows: Row[], cause: string): number | null {
  if (rows.length === 0) return null;
  return (deathCauses(rows).get(cause) ?? 0) / rows.length;
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

const DATE = '2026-09-06';

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
    id: 'static.saveRoundTrip', category: 'static', band: [1, 1], expect: 'pass',
    banked: null, bankedOn: DATE,
    why: 'A save must survive being reloaded AND RUN. The two states are compared after '
       + 'both sides advance a further 200 ticks, not at rest: a stream or a counter that '
       + 'failed to survive the trip reads identical the moment it lands and diverges '
       + 'under load, and at-rest equality would pass it. The revived side is given a '
       + 'FRESH bot, because bot closure state is the player\'s head and not the world\'s '
       + '— anything a bot was carrying across the save shows up here. This is what makes '
       + 'the sim drivable by a UI, and it is the reason `SimState.schemaVersion` exists.',
    measure: c => c.saveRoundTrips === null ? null : (c.saveRoundTrips ? 1 : 0),
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
    id: 'static.uiCoverage', category: 'static', band: [0, 0], expect: 'pass',
    banked: 0, bankedOn: DATE,
    why: 'Every `api.*` decision must have a control somewhere in src/app, every '
       + '`Decision` kind must have an api wrapper, and every config leaf must be '
       + 'classified once — as something a decision selects, something the player is '
       + 'shown, or a balance constant with a reason. A leaf that is none of those is '
       + 'a finding: it gets a consumer or it gets cut. This is what stops the next '
       + 'knob landing unreachable, the way `borrow` sat wrapper-less for months and '
       + 'thirteen decisions sat without a screen.',
    measure: c => c.uiCoverageGaps,
  },

  {
    id: 'struct.deathRoutes', category: 'structural', band: [4, 4], expect: 'pass',
    banked: 4, bankedOn: DATE,
    why: 'CONCEPT.md §7 lists four routes after irrelevance was cut with rivals. All four '
       + 'must fire with at least five runs each, or a whole failure mode has gone quiet.',
    measure: c => countWhere(
      [...deathCauses(c.roster).entries()].map(([cause, n]) => ({ cause, n })) as unknown as Row[],
      // The evidence bar scales with the roster for the same reason the four
      // death gates below are rates: a fixed count of 5 gets easier to clear
      // every time a bot is added, so the gate quietly weakens as the suite grows.
      r => Number(r.n) >= c.roster.length * 0.0125,
    ),
  },
  {
    id: 'struct.overprintDeaths', category: 'structural', band: [0.0375, 0.2375], expect: 'pass',
    banked: 0.13, bankedOn: DATE,
    why: 'Overprint needs storagePerUnitPerTick to bite. The growth arc makes cash '
       + 'plentiful, so this is the gate that catches the storage line going slack.'
       + ' [2026-09-06, round 11a] CONVERTED FROM A COUNT TO A RATE. The band was a statement about 400 runs with the denominator left implicit; Round 11 adds bots, which would have failed this on arithmetic rather than on mechanism. The band is the old one divided by 400 and the observed value did not move.',
    measure: c => deathRate(c.roster, 'overprint'),
  },
  {
    id: 'struct.debtSpiralDeaths', category: 'structural', band: [0.0375, 0.225], expect: 'pass',
    banked: 0.120, bankedOn: DATE,
    why: 'Debt spiral needs the weeklyOverhead lines to bite. The idle bot contributes 20 '
       + 'of these by construction: it releases nothing and dies of the standing bill.'
       + ' [2026-09-06, round 10] 64 -> 83, and it is a RECLASSIFICATION, not a harder '
       + 'game. Gating the borrow ceiling on recent revenue means a failing studio runs '
       + 'out of credit sooner, so it dies before it has lost the channels that would '
       + 'have made the same death a `channel_collapse` — that gate fell 32 -> 16 in the '
       + 'same change, and the two moves are the same 16 deaths. Watch the ceiling: 83 '
       + 'against 90 leaves one bad round of headroom, and the next change that shortens '
       + 'a failing studio\'s life will breach it.'
       + ' [2026-09-06, round 11a] CONVERTED FROM A COUNT TO A RATE. The band was a statement about 400 runs with the denominator left implicit; Round 11 adds bots, which would have failed this on arithmetic rather than on mechanism. The band is the old one divided by 400 and the observed value did not move.'
       + ' [2026-09-06, round 11 C11] REBANKED, 0.165 -> 0.120. Round 11 C11 added eight bots to the roster and this gate reads across it, so the move is the DENOMINATOR and not a change in the world: every one of the 400 existing (bot, seed) rows is byte-identical across all 128 columns. Six of the eight new bots survive, so the death rate falls.',
    measure: c => deathRate(c.roster, 'debt_spiral'),
  },
  {
    id: 'struct.channelCollapseDeaths', category: 'structural', band: [0.02, 0.175], expect: 'pass',
    banked: 0.050, bankedOn: DATE,
    why: 'Reached by channelHog and globalist. Guards the souring mechanism.'
       + ' [2026-09-06, round 10] 32 -> 16 on the revenue-gated borrow ceiling. Read it beside struct.debtSpiralDeaths, which rose by the same 16: a studio that loses its credit line sooner dies before it can lose its channels. The route is not quieter, the deaths are earlier.'
       + ' [2026-09-06, round 11a] CONVERTED FROM A COUNT TO A RATE. The band was a statement about 400 runs with the denominator left implicit; Round 11 adds bots, which would have failed this on arithmetic rather than on mechanism. The band is the old one divided by 400 and the observed value did not move.'
       + ' [2026-09-06, round 11 C11] REBANKED, 0.0675 -> 0.050. Round 11 C11 added eight bots to the roster and this gate reads across it, so the move is the DENOMINATOR and not a change in the world: every one of the 400 existing (bot, seed) rows is byte-identical across all 128 columns. Same cause: more surviving bots under the same count of deaths.',
    measure: c => deathRate(c.roster, 'channel_collapse'),
  },
  {
    id: 'struct.attentionCollapseDeaths', category: 'structural', band: [0.02, 0.15], expect: 'pass',
    banked: 0.036, bankedOn: DATE,
    why: 'Reached by attentionBurner. The route nothing else touches until the finance round.'
       + ' [2026-09-06, round 11a] CONVERTED FROM A COUNT TO A RATE. The band was a statement about 400 runs with the denominator left implicit; Round 11 adds bots, which would have failed this on arithmetic rather than on mechanism. The band is the old one divided by 400 and the observed value did not move.'
       + ' [2026-09-06, round 11 C11] REBANKED, 0.05 -> 0.036. Round 11 C11 added eight bots to the roster and this gate reads across it, so the move is the DENOMINATOR and not a change in the world: every one of the 400 existing (bot, seed) rows is byte-identical across all 128 columns. Same cause. `mixer` releases every 26 weeks and does NOT die of attention, which is worth watching: it is the only new bot on a fast cadence.',
    measure: c => deathRate(c.roster, 'attention_collapse'),
  },
  {
    id: 'struct.speculatorMoves', category: 'structural', band: [1.2, 500], expect: 'pass',
    banked: 2.946, bankedOn: DATE,
    why: 'Rule 9 of 04-workflow.md: a population that reports the same number every seed '
       + 'is a constant wearing a population\'s clothes. A swing at or below 1.2 means '
       + 'the speculator pool never moved.',
    measure: c => medOf(c.roster, 'conservative', 'speculatorSwing'),
  },
  {
    id: 'struct.heatNotPinned', category: 'structural', band: [0, 0.10], expect: 'pass',
    banked: 0, bankedOn: DATE,
    why: 'Share of printings sitting at value.heatCeiling after 50 years. The speculator '
       + 'push is a positive feedback loop, and this is what a detonation looks like from '
       + 'outside. Round 5 measured 82% here at year 50 on a loop that read healthy at year '
       + '40, and no gate saw it because nothing measured the catalogue past the gated '
       + 'horizon. Round 5b split market.speculatorHeat out of the population\'s return so '
       + 'the loop cannot feed itself; this gate is what stops the next round rebuilding it.',
    measure: c => medOf(c.shape, 'conservative', 'printingsAtHeatCeiling'),
  },
  {
    id: 'struct.ripRationBinds', category: 'structural', band: [0.20, 0.95], expect: 'pass',
    banked: 0.7093, bankedOn: DATE,
    why: 'Rule 9 again, from the other side. The reseller population is read by exactly one '
       + 'thing, ripMultiplier, and only as a ratio to its own reference, so scaling the '
       + 'pool and the reference together leaves every rate identical and the level says '
       + 'nothing. Round 5b gave it a second consumer: a finite throughput on opening '
       + 'sealed product, actors.ripUnitsPerReseller. This gate reads the bot whose pool '
       + 'collapses. At 1 the throughput never binds and the level is decoration again; '
       + 'below 0.2 it is the whole story and nothing else moves supply. Across the roster '
       + 'the ration runs 0.52 for hypeGambler to 1.00 for safeHands, and it tracks the '
       + 'volume the pool must serve as well as its headcount - chaseMaxxer has fewer '
       + 'resellers than hypeGambler and is never rationed.',
    measure: c => medOf(c.roster, 'hypeGambler', 'sealedRipRation'),
  },
  {
    id: 'struct.collectorNotPinned', category: 'structural', band: [5, 1e9], expect: 'pass',
    banked: 20, bankedOn: DATE,
    why: 'Same rule. collectorDensityReference at 0.03 once pinned every seed to the '
       + 'holding ceiling; distinct values across seeds is how that gets caught early.',
    measure: c => distinctCount(forBot(c.roster, 'conservative'), M('collectorHeldShare')),
  },
  {
    id: 'struct.printRunVaries', category: 'structural', band: [4, 100], expect: 'pass',
    banked: 28, bankedOn: DATE,
    why: 'How much to print is the bet the whole game is about. If every bot converges on '
       + 'one run size, the roster cannot measure the decision.'
       + ' [2026-09-06, round 11 C11] REBANKED, 18 -> 28. Round 11 C11 added eight bots to the roster and this gate reads across it, so the move is the DENOMINATOR and not a change in the world: every one of the 400 existing (bot, seed) rows is byte-identical across all 128 columns. `archivist` prints an expensive box and `mixer` prints nine product kinds at 120 cards a set, so the spread of print runs across the roster genuinely widened.',
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
    banked: 10, bankedOn: DATE,
    why: 'Not every strategy may survive, and not every strategy may die. Both ends of '
       + 'this band are failure states for the difficulty curve.'
       + ' [2026-09-05, round 3] Was 7, now 1: only scout always survives. A 280-card set '
       + 'costs four times the art of a 70-card set, and a year-1 studio printing 17,000 '
       + 'boxes cannot carry it — art is 43% of the print bill on a seed that dies. The '
       + 'set size is correct and the artist rates are not. Round 7 owns art, Round 10 owns '
       + 'difficulty; whichever lands first should report FIXED.'
       + ' [2026-09-05, round 7] FIXED at 6, by art, exactly as that note predicted. '
       + 'The artist rates were the cause and Round 10 never had to touch it. The whole '
       + 'repair came from the newcomer rate defect: roster drift minted artists at a '
       + 'hundredth of the opening rate, so the fix was not a cheaper board but a '
       + 'CONSISTENT one.'
       + ' [2026-09-06, round 11 C11] REBANKED, 5 -> 10. Round 11 C11 added eight bots to the roster and this gate reads across it, so the move is the DENOMINATOR and not a change in the world: every one of the 400 existing (bot, seed) rows is byte-identical across all 128 columns. Five of the eight new bots survive every seed. Read this beside `diff.botsNeverSurvive`: the roster gained survivors, not safety.',
    measure: c => countWhere(
      bots(c.roster).map(b => ({ s: shareTrue(forBot(c.roster, b), 'survived') })) as unknown as Row[],
      r => Number(r.s) === 1,
    ),
  },
  {
    id: 'diff.botsNeverSurvive', category: 'difficulty', band: [2, 8], expect: 'pass',
    banked: 5, bankedOn: DATE,
    why: 'The regression bots (flooder, attentionBurner, idle) must die, and a couple of '
       + 'probe strategies alongside them. Zero would mean nothing is unviable.',
    measure: c => countWhere(
      bots(c.roster).map(b => ({ s: shareTrue(forBot(c.roster, b), 'survived') })) as unknown as Row[],
      r => Number(r.s) === 0,
    ),
  },
  {
    id: 'diff.conservativeSurvives', category: 'difficulty', band: [0.95, 1.0], expect: 'pass',
    banked: 0.95, bankedOn: DATE,
    why: 'conservative is the control the whole roster is read against. If the baseline '
       + 'strategy stops being viable, every bot-to-bot comparison loses its reference.'
       + ' [2026-09-04, round 2] The growth arc moved this from 1.00 to 0.90. Round 10 owns difficulty.'
       + ' [2026-09-05, round 7] 0.700 -> 0.900 on the art fix. It is one seed short of '
       + 'the band and Round 10 still owns it, but it is no longer the art bill: at the '
       + 'shipped rates conservative reads 0.950 with the storage cliff at 1.3x and 0.900 '
       + 'at 1.7x. That last 0.05 is bought by giving the blind bet its downside back — '
       + 'see the round 7 note on diff.flopRate — so it is a trade, not a defect.'
       + ' [2026-09-05, round 9] 0.900 -> 0.950 and promoted to pass. READ THIS AS A '
       + 'RE-ROLL, NOT A REPAIR. Round 9 renumbered the main RNG stream, so every seed is '
       + 'a different world and the one seed that was short is simply not short in this '
       + 'one. Nothing in the round touched finance, overhead or the storage cliff. It '
       + 'sits ON the band floor, Round 10 still owns the trade described above, and if a '
       + 'later round reads 0.900 again that is the same coin landing the other way.',
    measure: c => shareTrue(forBot(c.roster, 'conservative'), 'survived'),
  },
  {
    id: 'diff.licensorEarns', category: 'difficulty', band: [1.3, 2.5], expect: 'pass',
    banked: 1.487, bankedOn: DATE,
    why: 'A licence has to pay. `licensor` is `conservative` in every respect except that '
       + 'it signs collabs, so this ratio is the collab loop and nothing else. It read '
       + '0.98 before Round 8 — the studio was paying for reach and getting poorer, which '
       + 'made the whole mechanism a trap rather than a decision. The ceiling matters too: '
       + 'past about 2.5 a licence stops being a trade and becomes the only strategy.',
    measure: c => {
      const lic = medOf(c.roster, 'licensor', 'netWorth');
      const base = medOf(c.roster, 'conservative', 'netWorth');
      return lic !== null && base !== null && base > 0 ? lic / base : null;
    },
  },
  {
    id: 'diff.licensorSurvival', category: 'difficulty', band: [0.75, 0.95], expect: 'pass',
    banked: 0.9, bankedOn: DATE,
    why: 'A licence must be able to be the wrong licence. The print run is sized to the '
       + 'demand the licence bought, so a collab that under-delivers is an overprint, and '
       + 'the minimum guarantee falls due on it years later whatever the set did. If this '
       + 'reaches 1 the upside above has been bought with no downside at all.',
    measure: c => shareTrue(forBot(c.roster, 'licensor'), 'survived'),
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
    id: 'diff.allInSurvival', category: 'difficulty', band: [0.10, 0.60], expect: 'pass',
    banked: 0.3, bankedOn: DATE,
    why: 'Betting the whole bankroll must usually lose and occasionally win.'
       + ' [2026-09-04, round 2] Was 0.35. The bet-size ladder now competes against market-sized runs, so betting the bankroll is no longer the biggest bet in the roster. Round 10 owns it.'
       + ' [2026-09-05, round 7] FIXED at 0.40 without Round 10. Art was taking the '
       + 'bankroll before the bet could be placed, so `allIn` was not losing its bet — it '
       + 'never got to make one.',
    measure: c => shareTrue(forBot(c.roster, 'allIn'), 'survived'),
  },
  {
    id: 'diff.flooderDiesEarly', category: 'difficulty', band: [0.4, 2.5], expect: 'pass',
    banked: 0.75, bankedOn: DATE,
    why: 'The flood-death regression. CONCEPT.md §6.2 requires over-releasing to be a cliff.',
    measure: c => medOf(c.roster, 'flooder', 'deathYear'),
  },
  {
    id: 'diff.attentionBurnerDies', category: 'difficulty', band: [0.85, 1.0], expect: 'pass',
    banked: 1, bankedOn: DATE,
    why: 'The attention-death regression, and the only bot that reaches that route.',
    measure: c => {
      const r = forBot(c.roster, 'attentionBurner');
      return r.length ? countWhere(r, x => x.deathCause === 'attention_collapse') / r.length : null;
    },
  },
  {
    id: 'diff.idleDies', category: 'difficulty', band: [2.5, 9.0], expect: 'pass',
    banked: 8.827, bankedOn: DATE,
    why: 'Doing nothing must lose. finance.weeklyOverheadBase\'s comment claims a studio '
       + 'that releases nothing "runs out of its $500,000 in about five years". Measured: '
       + 'it dies at year 12. Cash alone lasts 7.7 years at $65k of overhead, and the '
       + 'borrow ceiling carries it the rest. Nothing measured this until the idle bot '
       + 'existed, because every other bot releases something. Round 10 decides whether '
       + 'the number or the comment is wrong; the band states the documented claim.'
       + ' [2026-09-06, round 10] FIXED, 12.02 -> 8.83, and promoted. The comment was '
       + 'right and the mechanism was wrong: a studio with no sales at all could borrow '
       + 'exactly what a working one could, so the bank carried `idle` for 4.3 years '
       + 'after its cash ran out. The borrow ceiling is now scaled by the studio\'s own '
       + 'recent revenue, so an idle one gets `borrowCeilingIdleFloor` of it and dies on '
       + 'its cash. NOT bought with a bigger bill: `weeklyOverheadBase` did not move. '
       + 'NOTE this gate is what pins `startingCash`. Doubling the opening cash and the '
       + 'borrow ceiling together takes this straight back to 17.8 years, so a later '
       + 'round that lifts capital toward real scale must raise the overhead base in the '
       + 'same ratio, in the same change.',
    measure: c => medOf(c.roster, 'idle', 'deathYear'),
  },
  {
    id: 'diff.deathsLandMidRun', category: 'difficulty', band: [3.0, 25.0], expect: 'pass',
    banked: 8.135, bankedOn: DATE,
    why: 'Excluding the three regression bots, a death should be the end of a story rather '
       + 'than an opening move. Year-one deaths mean the opening is unsurvivable.',
    measure: c => median(numbers(
      c.roster.filter(r => !['flooder', 'attentionBurner', 'idle'].includes(String(r.bot))),
      M('deathYear'),
    )),
  },
  {
    id: 'diff.sellThrough', category: 'difficulty', band: [0.75, 0.95], expect: 'pass',
    banked: 0.9494, bankedOn: DATE,
    why: 'referenceRunUnits was swept so a reference run clears about 87%. Full sell-through '
       + 'means the blind bet has no downside; a collapse means it has no upside.',
    measure: c => guarded(c.roster, 'conservative', 'avgSellThrough', 'meanPrintRun', 'mean'),
  },
  {
    id: 'diff.flopRate', category: 'difficulty', band: [0.01, 0.25], expect: 'known-fail',
    banked: 0.005357, bankedOn: DATE,
    why: 'A set that does not make its print run back. Guarded on flopSetsJudged, because '
       + 'a studio that dies before any set is a year old has no flop rate at all — that '
       + 'guard is why flooder no longer reports the best flop rate in the roster.'
       + ' [2026-09-06, round 10] REGRESSED to 0.005 and demoted to known-fail. It needs a '
       + 'demand round, not a finance knob. TWO separate things are wrong here. (1) The '
       + 'AGGREGATION was a mean of per-run rates, so an 11-set run that died early '
       + 'counted the same as a 29-set one, and the gate swung 3x on one seed: before '
       + 'this round 4 of 20 runs carried a flop and one of them was short, and after it '
       + '3 did. It now pools flops over sets across the sweep, which is what a rate '
       + 'means. (2) The POOLED number is still about 0.005 — 3 flopped sets in roughly '
       + '560 — so the blind bet almost never loses money outright. Read this beside '
       + '`diff.sellThrough`, which has been sitting ON its 0.95 ceiling for two rounds: '
       + 'both say the market absorbs everything the reference bot prints. Round 10 did '
       + 'not cause it and could not fix it — `attention.referenceRunUnits` is the lever, '
       + 'and pulling it 5000 -> 3500 restores the flop rate while costing `conservative` '
       + '15 points of survival. That trade belongs to a round that owns demand.',
    measure: c => {
      // Pooled, not a mean of means: a run that died after 11 sets must not
      // carry the same weight as one that judged 29.
      let flops = 0, judged = 0;
      for (const row of forBot(c.roster, 'conservative')) {
        const j = Number(row[M('flopSetsJudged')]);
        const f = Number(row[M('flopRate')]);
        if (!Number.isFinite(j) || !Number.isFinite(f) || j <= 0) continue;
        flops += f * j;
        judged += j;
      }
      return judged > 0 ? flops / judged : null;
    },
  },

  // ---- shape: per set, at age 2. The Round 4 targets. ----
  {
    id: 'shape.median', category: 'shape', band: [0.20, 0.50], expect: 'pass',
    banked: 0.22, bankedOn: DATE,
    why: 'Measured median of a modern set is $0.24-$0.34, stable across 15 Magic sets '
       + '2020-2025 (05-real-world.md §2).'
       + ' [2026-09-05, round 4] FIXED, 8.47 -> 0.26. `value.baseCardPrice` 150 -> 6. The knob is a pure level control: it scales the median exactly linearly and moves no shape statistic to three decimals.',
    measure: c => guarded(c.shape, 'conservative', 'setMedianAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.under1', category: 'shape', band: [0.64, 0.92], expect: 'pass',
    banked: 0.8107, bankedOn: DATE,
    why: 'Measured bulk share of a modern set. Ours is an order of magnitude short: our '
       + 'cards never decay to bulk at all.'
       + ' [2026-09-05, round 4] FIXED, 0.004 -> 0.79. The body fell to the measured level and `value.nostalgiaDecayPerYear` 0.05 -> 0.20 lets a forgotten card keep falling.',
    measure: c => guarded(c.shape, 'conservative', 'setShareUnder1Age2', 'setsAtAge2'),
  },
  {
    id: 'shape.under25c', category: 'shape', band: [0.25, 0.80], expect: 'pass',
    banked: 0.5393, bankedOn: DATE,
    why: 'Measured 30-50% for Magic, 67-77% for Pokemon. Ours is zero.'
       + ' [2026-09-05, round 4] FIXED, 0 -> 0.50. Read this one beside the decile ladder, not alone: it counts cards below $0.25 and cannot tell a spread from a stack. It read 0.486 while 40% of a set sat pinned within a cent of `value.priceFloorCents`.',
    measure: c => guarded(c.shape, 'conservative', 'setShareUnder25cAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.top1', category: 'shape', band: [0.21, 0.62], expect: 'pass',
    banked: 0.344, bankedOn: DATE,
    why: 'Measured top-1% value share, median about 0.35.'
       + ' [2026-09-05, round 4] FIXED, 0.156 -> 0.337, against a measured 0.35. `value.chaseSigma` 0.65 -> 1.5, inside the researched body log-SD of 1.2-1.9.',
    measure: c => guarded(c.shape, 'conservative', 'setTop1ShareAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.top10', category: 'shape', band: [0.66, 0.95], expect: 'pass',
    banked: 0.7699, bankedOn: DATE,
    why: 'Measured top-10% value share, median about 0.78. We reach 0.78 by age 25 — the '
       + 'engine works, it is just twenty-three years late.'
       + ' [2026-09-05, round 4] FIXED, 0.493 -> 0.765, against a measured 0.78. A set is now born unequal instead of separating over twenty-three years.',
    measure: c => guarded(c.shape, 'conservative', 'setTop10ShareAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.gini', category: 'shape', band: [0.72, 0.98], expect: 'pass',
    banked: 0.8288, bankedOn: DATE,
    why: 'Measured Gini of a modern set price vector, central value 0.85. Real sets are '
       + 'born unequal; ours are born flat and separate slowly.'
       + ' [2026-09-05, round 4] FIXED, 0.579 -> 0.827, against a measured 0.85. `chaseSigma` did the work; dropping `priceFloorCents` 20 -> 5 added the last 0.03.',
    measure: c => guarded(c.shape, 'conservative', 'setGiniAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.chaseOverMedian', category: 'shape', band: [130, 3100], expect: 'pass',
    banked: 344.6, bankedOn: DATE,
    why: 'Measured 130x-3100x, central ~1000x. The whole-catalogue metric read 1125x and '
       + 'looked correct; that was pooling fifty years, not spread within a set.'
       + ' [2026-09-05, round 4] FIXED, 38.5 -> 331.',
    measure: c => guarded(c.shape, 'conservative', 'setChaseOverMedianAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.tailAlpha', category: 'shape', band: [1.6, 2.7], expect: 'pass',
    banked: 1.985, bankedOn: DATE,
    why: 'Hill tail index over the top decile. Measured 1.6-2.7. The one shape target we '
       + 'already meet, so it is a pass gate and protects the tail while the body moves.',
    measure: c => guarded(c.shape, 'conservative', 'setTailAlphaAge2', 'setsAtAge2'),
  },
  {
    id: 'shape.ageCurveDirection', category: 'shape', band: [0.02, 0.45], expect: 'pass',
    banked: 0.06429, bankedOn: DATE,
    why: 'Bulk share must RISE from age 1 to age 8: real sets go 64% to about 90%. Ours '
       + 'falls, because scarcity climbs as copies are collected and nothing pushes an '
       + 'unwanted old card down. This gate states the Round 0 finding as a test.'
       + ' [2026-09-05, round 4] FIXED, -0.004 -> 0.082. The curve runs the right way for the first time. `nostalgiaDecayPerYear` at 0.05 only took an ungated printing to 0.72x over seven years, which the climb in scarcity outran; 0.20 is the first value that turns it.',
    measure: c => {
      const a1 = atAge(c.shapeSets, 1, 'shareUnder1');
      const a8 = atAge(c.shapeSets, 8, 'shareUnder1');
      return a1 === null || a8 === null ? null : a8 - a1;
    },
  },
  {
    id: 'shape.ageCurveLate', category: 'shape', band: [0.55, 0.92], expect: 'pass',
    banked: 0.85, bankedOn: DATE,
    why: 'By age 25 a real set is 69-82% bulk, after the vintage turn lifts some cards back. '
       + 'Ours is 1%.'
       + ' [2026-09-05, round 4] FIXED, 0 -> 0.804, against a measured 69-82%.',
    measure: c => atAge(c.shapeSets, 25, 'shareUnder1'),
  },

  // ---- shape: whole-catalogue legacy targets, kept because the value block is tuned on them ----
  {
    id: 'shape.yearsTo100', category: 'shape', band: [2.0, 9.0], expect: 'pass',
    banked: 2.692, bankedOn: DATE,
    why: 'How long before the catalogue produces its first $100 card. Too fast and the next '
       + 'twenty years have nothing to discover.'
       + ' [2026-09-05, round 3] Was 5.2, now 1.4. A 280-card set rolls four times the '
       + 'chase draws of a 70-card set, so the luckiest card arrives four times sooner, on '
       + 'top of a price body that is already twenty times too high. Round 4 owns the price '
       + 'body and this gate moves with it.'
       + ' [2026-09-05, round 4] FIXED, 1.44 -> 2.44, and it came free with the price body. WATCH IT: the margin is thin and sample-dependent. It reads 2.44 over 30 seeds and 1.98 over 20, against a band floor of 2.0, so it is the gate most likely to flip on an unrelated change.',
    measure: c => medOf(c.shape, 'conservative', 'yearsToFirst100Dollar'),
  },

  // ---- subsystem ----
  {
    id: 'sub.signalLow', category: 'subsystem', band: [0.30, 0.72], expect: 'pass',
    banked: 0.5028, bankedOn: DATE,
    why: 'A publisher who spends nothing must read the market poorly. At 0.93 the reveal '
       + 'window was a solved problem and its levers bought nothing.',
    measure: c => guarded(c.roster, 'conservative', 'signalCorrelation', 'signalPairs'),
  },
  {
    id: 'sub.signalHigh', category: 'subsystem', band: [0.55, 0.90], expect: 'pass',
    banked: 0.6744, bankedOn: DATE,
    why: 'A full campaign must read well and still be able to be wrong.'
       + ' [2026-09-05, round 9] WIDENED DOWN, [0.65, 0.97] -> [0.55, 0.90]. The band was '
       + 'fitted to a sixteen-preview campaign and that mechanism no longer exists: the '
       + 'campaign window is three previews, so 0.83 is unreachable at any sigma that '
       + 'also leaves the free read poor. The new band is the round\'s own exit criterion, '
       + '0.5-0.9, and 0.674 sits mid-band rather than against an edge.',
    measure: c => guarded(c.roster, 'hypeBuilder', 'signalCorrelation', 'signalPairs'),
  },
  {
    id: 'sub.signalRises', category: 'subsystem', band: [0.08, 0.55], expect: 'pass',
    banked: 0.1716, bankedOn: DATE,
    why: 'Error shrinks as 1/sqrt(previews), so more previews must buy a better reading. '
       + 'If this goes flat, the campaign is buying nothing measurable.',
    measure: c => {
      const lo = guarded(c.roster, 'conservative', 'signalCorrelation', 'signalPairs');
      const hi = guarded(c.roster, 'hypeBuilder', 'signalCorrelation', 'signalPairs');
      return lo === null || hi === null ? null : hi - lo;
    },
  },
  {
    id: 'sub.gem10Premium', category: 'subsystem', band: [2.0, 5.5], expect: 'pass',
    banked: 4.087, bankedOn: DATE,
    why: 'Measured 2-5x for modern cards, 5-10x vintage. Too low and nobody submits; too '
       + 'high and raw prices stop meaning anything.'
       + ' [2026-09-04, round 2] Was 4.66. Scale-coupling popScarcityReference moved the pop-report term, and the price level moved under it. Round 6 owns grading.'
       + ' [2026-09-05, round 6] FIXED, 6.082 -> 3.929, and promoted. It came free with the gem rate: `target = raw * tierMultiplier * reputation * popScarcity`, so more tens on a pop report push the scarcity term down and the premium with it. No tierMultiplier moved. NOTE the premium is scale-invariant by construction - it is a multiple of the raw price, so the measured rule that an expensive card gains more than a cheap one cannot live here. It lives in the submission hurdle instead: `feeWorthMultiple` keeps a card under about $60 raw out of a slab entirely.',
    measure: c => guarded(c.roster, 'conservative', 'gem10Premium', 'gradedCopies'),
  },
  {
    id: 'sub.gradedPrintingShare', category: 'subsystem', band: [0.02, 0.09], expect: 'pass',
    banked: 0.05452, bankedOn: DATE,
    why: 'The fee must be a real hurdle. Matches the measured "about one card in twenty".'
       + ' [2026-09-04, round 2] Was 0.047, same cause as gem10Premium. Round 6 owns grading.'
       + ' [2026-09-05, round 4] FIXED, 0.232 -> 0.048. Round 4a stopped a pack minting the cards it opened, so the raw pool is the size it was always meant to be and the graded share is a share of the right denominator.',
    measure: c => medOf(c.roster, 'conservative', 'gradedPrintingShare'),
  },
  {
    id: 'sub.gemRate', category: 'subsystem', band: [0.30, 0.60], expect: 'pass',
    banked: 0.5131, bankedOn: DATE,
    why: 'GemRate measured 50-53% for modern TCG in 2024-25. Ours is 9.6%: conditionMean 9 '
       + 'against a 9.75 cut puts a 10 near the 14th percentile where reality puts it at '
       + 'the median. The fix is a widened qualityGradeShift, not a global raise.'
       + ' [2026-09-05, round 6] FIXED, 0.102 -> 0.521, and promoted. The fix was BOTH: '
       + 'conditionMean 9 -> 10.0 sets the level and the widened qualityGradeShift sets the '
       + 'spread. The latent scale is not the grade scale, so a mean above the 9.75 cut is '
       + 'not a contradiction - it says a factory-fresh modern copy clears the top bar about '
       + 'half the time. This is `conservative`, which prints standard, so it IS the '
       + 'standard-quality gem rate.',
    measure: c => guarded(c.roster, 'conservative', 'gemRate', 'gradedCopies'),
  },
  {
    id: 'sub.gemRateByQuality', category: 'subsystem', band: [1.3, 2.0], expect: 'pass',
    banked: 1.719, bankedOn: DATE,
    why: 'Premium gem rate over standard, formed ACROSS bots because no bot prints two '
       + 'print qualities: `chaseMaxxer` prints premium and `conservative` prints standard. '
       + 'Print quality has to be worth choosing and one pooled gem rate cannot say whether '
       + 'it is - before Round 6 the ratio was 1.36. The ceiling is arithmetic rather than a '
       + 'target: with standard near 0.50 the ratio cannot pass 2.0, and past '
       + 'printing.qualityGradeShift.premium 0.5 the premium rate pins at 1.000 and stops '
       + 'saying anything. The budget end of the same table is unreachable - `flooder` is '
       + 'the only bot that prints budget and it dies before its first year is out. Both '
       + 'rates are counted at grading rather than off the pop reports, so this ratio is '
       + 'not confounded by the two bots\' different release cadences.',
    measure: c => {
      // Guarded on both sides, like every other ratio gate here: `numbers()`
      // drops null rows silently, so without this a single seed that happened
      // to grade a premium printing would report as a twenty-seed median.
      const premium = guarded(c.roster, 'chaseMaxxer', 'gemRatePremium', 'gemRatePremiumCopies');
      const standard = guarded(c.roster, 'conservative', 'gemRateStandard', 'gemRateStandardCopies');
      return premium !== null && standard !== null && standard > 0 ? premium / standard : null;
    },
  },
  {
    id: 'sub.gemRateVintage', category: 'subsystem', band: [0.15, 0.45], expect: 'pass',
    banked: 0.3959, bankedOn: DATE,
    why: 'Gem rate for copies graded when the printing was already over 20 years old, '
       + 'counted AT grading rather than off the pop report. It must sit materially under '
       + 'the modern rate, because `grading.agePenaltyPerYear` is what makes an old copy in '
       + 'a slab worth something - and materially above zero, or vintage grading stops '
       + 'happening at all. Read it beside `gemRateModern`, which is 0.51. The same two '
       + 'figures taken off the cumulative pop reports differ by 5% rather than by a third, '
       + 'because a pop report averages a printing\'s whole submission history. Banked from '
       + 'the suite\'s own roster sweep at 20 seeds x 30 years, which is not the sweep the '
       + 'round fitted on - a scratch probe over 50 years reads 0.376.',
    measure: c => guarded(c.roster, 'conservative', 'gemRateVintage', 'gemRateVintageCopies'),
  },
  {
    id: 'sub.scalperCycles', category: 'subsystem', band: [3, 35], expect: 'pass',
    banked: 5, bankedOn: DATE,
    why: 'The population must cycle rather than settle. Zero means it never moved.'
       + ' [2026-09-05, round 3] Was 16, now 0. Measured on one dropRunner seed, '
       + 'scalperProfitability crosses breakEvenPremium at year 8 and never comes back '
       + 'under it, so the boom latch never releases and no crash fires. Nothing in the '
       + 'model pushes an old sealed product down: shape.ageCurveDirection is still '
       + 'negative and shape.ageCurveLate is still 0. Round 4 owns the decay to bulk and '
       + 'this gate is downstream of it.'
       + ' [2026-09-05, round 4] Still 0. Round 4 briefly un-pinned this to 1 cycle, then the sealed contents fix took it back to 0. Round 5 owns it together with sub.scalperShare.'
       + ' [2026-09-05, round 5] FIXED, and promoted to pass. Now 4 over 30 years and 14 over 50, on a population that runs from its floor to 70,000 and back to 20,000. `drops.populationGrowth` 0.06 -> 0.25 is the cycle clock: at 0.06 one boom took longer than the run. Read the count against the horizon - it is about one cycle every seven years, so a 30-year sweep sits near the band floor by arithmetic and not by health.',
    measure: c => guarded(c.roster, 'dropRunner', 'scalperCycles', 'dropsRun'),
  },
  {
    id: 'sub.scalperShare', category: 'subsystem', band: [0.10, 0.50], expect: 'known-fail',
    banked: 0.06993, bankedOn: DATE,
    why: 'Measured 10-50% of entries on a high-demand drop (Nike SNKRS, substituted from '
       + 'sneakers).'
       + ' [2026-09-05, round 3] FIXED. Was 0.038, now 0.242 and inside the band. The '
       + 'scalper population stopped cycling in the same round, so read this one beside '
       + 'sub.scalperCycles: the share is right because the population is pinned high, not '
       + 'because the trade found its level. Round 4 will move both.'
       + ' [2026-09-05, round 4] REGRESSED ON PAPER, IMPROVED IN SUBSTANCE. Now 0.000 and demoted to known-fail; Round 5 owns it. The 0.242 above was never a real pass: `peakScalpers` was 0 and `scalperCycles` 0, so the population never moved once in thirty years. Round 4 cut the price body 25x and fixed the sealed contents term, which un-pinned the reseller population from its floor of 20 to 266 and left the scalper trade with nothing to flip. DO NOT fix this by re-pinning the population - read it beside sub.scalperCycles, and fit the `drops` constants, which are calibrated to a price body that no longer exists.'
       + ' [2026-09-05, round 5] FIXED, and promoted to pass. 0.131 over 30 years and 0.389 over 50, with the population 30x off its floor and cycling. The blocker was not a money constant: `resolveDrop` read appetite off the CURRENT sealed premium, and a fresh product opens at MSRP by construction, so a release-day drop could never be worth camping and a release-day drop is the only kind anybody camps. `drops.shortagePremiumWeight` lets a scalper read the queue in front of them. The share RISES with the horizon, because the drop flow grows with the print runs while the collector base saturates - read this gate beside the run length that produced it.'
       + ' [2026-09-05, round 9] REGRESSED, 0.131 -> 0.070, and demoted to known-fail. '
       + 'Round 11 item 1 owns it. The free reveal window went from three previews to '
       + 'one, which halves the hype a non-campaigning set carries into its launch '
       + '(dropRunner reads 0.069 -> 0.021), and a launch with less hype is a drop with '
       + 'less shortage for a scalper to read. Measured, all on dropRunner: 0.080 over 40 '
       + 'seeds x 30 years, so 0.070 is not a small-sample artefact; 0.103 over 20 seeds '
       + 'x 30 years with the old three-preview default restored, so even the old window '
       + 'only just cleared the floor; 0.306 over 20 seeds x 50 years, which is the '
       + 'horizon dependence this note already warned about. NOT worth chasing through '
       + 'the drops block: raising `shortagePremiumWeight` 0.2 -> 0.32, a 60% move on a '
       + 'Round 5 constant, buys 0.080 -> 0.087. The band is right and the horizon is the '
       + 'confound; re-read it at 50 years before touching a constant.',
    measure: c => guarded(c.roster, 'dropRunner', 'scalperShareOfDrops', 'dropsRun'),
  },
  {
    id: 'sub.printingLiquidity', category: 'subsystem', band: [0.02, 0.60], expect: 'pass',
    banked: null, bankedOn: DATE,
    why: 'NEW [2026-09-06, round 11 C9]. `Printing.market.liquidity` was written once at '
       + 'mint and read by nothing for eleven rounds. It is live now, so it needs a gate '
       + 'that fails when it goes degenerate. The mean runs over every printing ever made, '
       + 'most of which are bulk commons that never trade again, so a LOW number is the '
       + 'correct answer and the floor is only there to catch it pinning at 0. The ceiling '
       + 'catches the opposite failure: if the average dead common is liquid, the term '
       + 'says nothing and the buylist spread it feeds cannot separate a chase card from '
       + 'bulk.',
    measure: c => medOf(c.roster, 'conservative', 'meanLiquidity'),
  },
  {
    id: 'sub.buylistSpread', category: 'subsystem', band: [0.15, 0.70], expect: 'known-fail',
    banked: null, bankedOn: DATE,
    why: 'NEW [2026-09-06, round 11 C9]. Ships KNOWN-FAIL reading exactly 0, which is the '
       + 'acceptance test for C9 rather than a defect: `actors.buylistWeight` is 0, so '
       + '`realisableCardValue` returns the raw price and both consumers of "what a box '
       + 'holds" keep the number they had. Round 12 raises the weight and this gate is how '
       + 'it reads the result. The band is what a card shop pays: about 15% of retail for '
       + 'bulk, about 70% for a card it can sell the same week, so the mean discount across '
       + 'a whole set belongs between those. Raise the weight and `sub.scalperShare` moves '
       + 'with it - both read the ripper\'s return - so fit them together and run --dist '
       + 'DURING the sweep, not after.',
    measure: c => medOf(c.roster, 'conservative', 'buylistSpread'),
  },
  {
    id: 'sub.marketingShare', category: 'subsystem', band: [0.003, 0.02], expect: 'pass',
    banked: 0.006911, bankedOn: DATE,
    why: 'Round 9\'s exit criterion, made a gate so it cannot drift away from the claim '
       + 'it supports: marketing is a minor line on a publisher\'s accounts, not the '
       + 'campaign. Under about 1% of revenue is the target and 2% is the ceiling; the '
       + 'floor is there because a marketing lever nobody buys is not a lever. Read on '
       + 'hypeBuilder, the campaign bot that survives — hypeGambler spends the same '
       + '$50,000 a set against a smaller revenue, so its share reads its survival, not '
       + 'this knob. NOTE the bot\'s budget, not `marketingHypeGain`, is what sets this '
       + 'number: the gain decides what the money BUYS, and moving it 0.35 -> 1.2 moves '
       + 'the share by less than a fifth of a point.',
    measure: c => guarded(c.roster, 'hypeBuilder', 'marketingShare', 'marketingTotal'),
  },
  {
    id: 'sub.houseArtShare', category: 'subsystem', band: [0.02, 0.20], expect: 'pass',
    banked: 0.08583, bankedOn: DATE,
    why: 'A deadline that cannot be missed is not a deadline, and one missed every time is '
       + 'not a schedule. About one card in eleven shipping as filler is the target.',
    measure: c => medOf(c.roster, 'conservative', 'houseArtShare'),
  },
  {
    id: 'sub.channelHogLosesReach', category: 'subsystem', band: [0.5, 6], expect: 'pass',
    banked: 6, bankedOn: DATE,
    why: 'CONCEPT.md §6.5: over-allocating to one channel sours it. If channelHog stops '
       + 'losing channels, the souring mechanism has gone quiet.'
       + ' [2026-09-04, round 2] Was 4. Scale-coupled channel capacity changed what over-allocating means. Round 10 owns difficulty; watch that it does not keep climbing.'
       + ' [2026-09-05, round 3] FIXED at 6, which is the top of the band. It sits on the '
       + 'ceiling, so the next round that adds one more lost channel turns this into a FAIL '
       + 'rather than a silent drift. That is the intent.'
       + ' [2026-09-05, round 7] The tripwire fired: 7. It is demoted to known-fail rather '
       + 'than tuned away, because Round 7 owns art and storage and this is the channels '
       + 'block, which has never been swept at all — 17 paths plus 30 trait constants. '
       + 'Round 11 item 2 owns that sweep. The cause is not mysterious: art no longer '
       + 'bankrupts the roster, so channelHog lives long enough to sour one more channel. '
       + 'Do NOT widen the band to make this green; the number rising means the souring '
       + 'mechanism is working harder, and the band is what says how hard is too hard.'
       + ' [2026-09-05, round 9] 7 -> 6 and promoted back to pass, on a re-rolled RNG '
       + 'stream rather than on any channels work. It sits ON the ceiling, and the sweep '
       + 'Round 11 item 2 owns has still not happened. Promoting it is deliberate: as a '
       + 'pass gate a return to 7 reads FAIL rather than KNOWN, which is the tripwire '
       + 'firing out loud. Treat that as the mechanism, never as sample noise.',
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
