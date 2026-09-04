/**
 * Batch worker. Pulls one task at a time from the parent rather than taking a
 * fixed slice up front: bots differ by an order of magnitude in cost (a
 * `flooder` that dies in year two against a `chaseMaxxer` that runs the full
 * fifty), so a static split leaves three threads idle waiting for one.
 */
import { parentPort } from 'node:worker_threads';
import { runOne, type RunTask, type RunResult } from './runOne.ts';

const port = parentPort;
if (!port) throw new Error('worker.ts must be run as a worker thread');

port.on('message', (msg: { task: RunTask; order: number } | { done: true }) => {
  if ('done' in msg) { port.close(); return; }
  const { metrics, violations } = runOne(msg.task);
  const result: RunResult = { order: msg.order, metrics, violations };
  port.postMessage(result);
});
