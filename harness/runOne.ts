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
import { computeMetrics, type RunMetrics } from './metrics.ts';

export interface RunTask {
  botName: string;
  seedIndex: number;
  years: number;
  checkEvery: number;
  overrides: Record<string, number>;
}

export interface RunResult {
  /** Index into the batch's task list, so results reassemble in a fixed order. */
  order: number;
  metrics: RunMetrics;
  violations: string[];
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

  const ticks = task.years * 52;
  for (let t = 0; t < ticks; t++) {
    bot.step(state);
    tick(state);
    if (task.checkEvery > 0 && t % task.checkEvery === 0) {
      const bad = checkInvariants(state);
      if (bad.length) violations.push(`${seed}@${t}: ${bad.slice(0, 3).join('; ')}`);
    }
    if (state.publishers[state.playerId]!.deadTick !== null) break;
  }

  keep?.(state);
  return { metrics: computeMetrics(state, task.botName, task.years), violations };
}
