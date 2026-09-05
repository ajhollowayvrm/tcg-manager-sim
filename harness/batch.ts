/**
 * The worker pool, shared by the runner and the regression suite.
 *
 * A run is a pure function of (bot, seed index, years, config), so a batch
 * shards across threads without any per-run result moving. Results reassemble
 * by `order`, which is what keeps the threaded and synchronous paths
 * byte-identical — the acceptance test every harness change is held to.
 */
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { SimState } from '../src/sim/types.ts';
import { runOne, type RunTask, type RunResult } from './runOne.ts';

/** One per core, bounded by the work available. */
export function defaultJobs(taskCount: number): number {
  return Math.max(1, Math.min(cpus().length, taskCount));
}

/**
 * Runs every task and returns the results in task order.
 *
 * `keep` receives each finished world and only fires on the synchronous path:
 * a `SimState` would have to cross a thread boundary by structured clone, which
 * this design avoids. Pass `jobs = 1` when you need it.
 */
export async function runBatch(
  tasks: RunTask[],
  jobs: number,
  keep?: (state: SimState) => void,
): Promise<RunResult[]> {
  const results: (RunResult | undefined)[] = new Array(tasks.length);

  if (jobs === 1) {
    for (let i = 0; i < tasks.length; i++) {
      const { metrics, violations, snapshots } = runOne(
        tasks[i]!, keep ? st => keep(st as SimState) : undefined,
      );
      results[i] = { order: i, metrics, violations, snapshots };
    }
  } else {
    await new Promise<void>((resolve, reject) => {
      let next = 0;
      let live = jobs;
      const workerUrl = new URL('./worker.mjs', import.meta.url);
      for (let w = 0; w < jobs; w++) {
        const worker = new Worker(workerUrl);
        const feed = () => {
          if (next >= tasks.length) { worker.postMessage({ done: true }); return; }
          const order = next++;
          worker.postMessage({ task: tasks[order]!, order });
        };
        worker.on('message', (r: RunResult) => { results[r.order] = r; feed(); });
        worker.on('error', reject);
        worker.on('exit', () => { if (--live === 0) resolve(); });
        feed();
      }
    });
  }

  return results.filter((r): r is RunResult => r !== undefined);
}
