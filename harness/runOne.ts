/**
 * One simulation run, shared by the synchronous runner and the workers.
 *
 * A run is a pure function of (bot, seed index, years, config): it touches no
 * shared state and no I/O, which is the whole reason a batch can be sharded
 * across threads without any per-run result changing.
 */
import { createWorld } from '../src/sim/world.ts';
import { defaultConfig, withOverrides } from '../src/sim/config.ts';
import { tick } from '../src/sim/engine.ts';
import { checkInvariants } from '../src/sim/invariants.ts';
import { BOTS } from './bots.ts';
import {
  computeMetrics, priceVectorStats,
  type RunMetrics, type SetSnapshot, type RunExtras,
} from './metrics.ts';
import { REGION_US } from '../src/sim/world.ts';

/** Set ages, in years, at which a price vector is sampled. */
export const DEFAULT_SNAPSHOT_AGES = [1, 2, 3, 8, 15, 25];

export interface RunTask {
  botName: string;
  seedIndex: number;
  years: number;
  checkEvery: number;
  overrides: Record<string, number>;
  /** Set ages, in years, to snapshot. Empty disables the sampler. */
  snapshotAges?: number[];
}

export interface RunResult {
  /** Index into the batch's task list, so results reassemble in a fixed order. */
  order: number;
  metrics: RunMetrics;
  violations: string[];
  /** One row per (set, age) reached during the run. */
  snapshots: SetSnapshot[];
}

/** Runs one seed and returns its metrics. `keep` gets the finished state, for `--dist`. */
export function runOne(
  task: RunTask,
  keep?: (state: ReturnType<typeof createWorld>) => void,
): Omit<RunResult, 'order'> {
  const makeBot = BOTS[task.botName];
  if (!makeBot) throw new Error(`unknown bot: ${task.botName}`);
  const config = withOverrides(defaultConfig, task.overrides);
  const bot = makeBot();
  const seed = `${task.botName}-${task.seedIndex}`;
  const state = createWorld(seed, config);
  const violations: string[] = [];
  const snapshots: SetSnapshot[] = [];
  // Sampled every tick. End-of-run state can only say where the population
  // stopped, never whether it moved.
  let speculatorMin = Infinity;
  let speculatorMax = 0;
  let speculatorSamples = 0;

  // The sampler is a pure read of `state`. It draws no RNG, so it cannot
  // renumber a stream and cannot change any existing column.
  const ages = task.snapshotAges ?? DEFAULT_SNAPSHOT_AGES;
  const ageTicks = ages.map(a => Math.round(a * 52));
  const sample = ageTicks.length > 0;

  const ticks = task.years * 52;
  for (let t = 0; t < ticks; t++) {
    bot.step(state);
    tick(state);
    if (sample) sampleSets(state, task.botName, seed, ages, ageTicks, snapshots);
    const spec = state.audience.actors.speculators;
    if (Number.isFinite(spec)) {
      if (spec < speculatorMin) speculatorMin = spec;
      if (spec > speculatorMax) speculatorMax = spec;
      speculatorSamples++;
    }
    if (task.checkEvery > 0 && t % task.checkEvery === 0) {
      const bad = checkInvariants(state);
      if (bad.length) violations.push(`${seed}@${t}: ${bad.slice(0, 3).join('; ')}`);
    }
    if (state.publishers[state.playerId]!.deadTick !== null) break;
  }

  keep?.(state);
  const extras: RunExtras = {
    snapshots,
    speculatorMin: speculatorSamples > 0 ? speculatorMin : 0,
    speculatorMax,
    speculatorSamples,
  };
  return {
    metrics: computeMetrics(state, task.botName, task.years, extras),
    violations,
    snapshots,
  };
}

/**
 * Prices one set's card list at a fixed age.
 *
 * Two filters make the vector comparable to a real set list pulled from
 * Scryfall: only the home market, and no reprints. A reprint is a second
 * printing of a card that is already in the vector, so counting it would price
 * the same card twice and drag the median toward whatever was reprinted.
 *
 * The age test is exact equality on the tick, so each set is sampled once per
 * age. The cheap test runs every tick; the price walk only runs on a hit.
 */
function sampleSets(
  state: ReturnType<typeof createWorld>,
  bot: string,
  seed: string,
  ages: number[],
  ageTicks: number[],
  out: SetSnapshot[],
): void {
  const now = state.tick as number;
  let due: Array<{ setId: string; ageYears: number; releaseTick: number }> | null = null;

  for (const set of Object.values(state.sets)) {
    if (set.status !== 'released') continue;
    const sched = set.regionSchedule.find(r => r.regionId === REGION_US);
    if (!sched) continue;
    const released = sched.releaseTick as number;
    const age = now - released;
    if (age < 0) continue;
    for (let i = 0; i < ageTicks.length; i++) {
      if (age === ageTicks[i]) {
        (due ??= []).push({ setId: set.id, ageYears: ages[i]!, releaseTick: released });
      }
    }
  }
  if (!due) return;

  // One walk of the printing table serves every set due this tick.
  const bySet = new Map<string, number[]>();
  for (const d of due) bySet.set(d.setId, []);
  for (const pr of Object.values(state.printings)) {
    if (pr.isReprintOf !== null) continue;
    if (pr.regionId !== REGION_US) continue;
    const bucket = bySet.get(pr.setId);
    if (bucket) bucket.push(pr.market.rawPrice / 100);
  }

  for (const d of due) {
    out.push({
      bot, seed, setId: d.setId, ageYears: d.ageYears, releaseTick: d.releaseTick,
      ...priceVectorStats(bySet.get(d.setId) ?? []),
    });
  }
}
