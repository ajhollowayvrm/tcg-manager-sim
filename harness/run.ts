/**
 * Headless balance harness.
 *
 *   node --experimental-strip-types harness/run.ts
 *   node --experimental-strip-types harness/run.ts --seeds=200 --years=50 --bot=all
 *   node --experimental-strip-types harness/run.ts --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
 *
 * Everything is single-threaded and synchronous on purpose: the fastest thing
 * to change is the thing with no build step and no worker plumbing.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createWorld } from '../src/sim/world.ts';
import { defaultConfig, withOverrides } from '../src/sim/config.ts';
import { tick } from '../src/sim/engine.ts';
import { checkInvariants } from '../src/sim/invariants.ts';
import { BOTS } from './bots.ts';
import { computeMetrics, toCsv, type RunMetrics } from './metrics.ts';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k!, rest.join('=') || 'true'];
}));

const seeds = Number(args.seeds ?? 40);
const years = Number(args.years ?? 50);
const outDir = String(args.out ?? './out');
const checkEvery = Number(args.check ?? 52);
const botArg = String(args.bot ?? 'all');
const botNames = botArg === 'all' ? Object.keys(BOTS) : botArg.split(',');

const overrides: Record<string, number> = {};
for (const a of process.argv.slice(2)) {
  if (!a.startsWith('--set=')) continue;
  const [path, v] = a.slice(6).split('=');
  const n = Number(v);
  // A shell that fails to split its arguments turns a whole sweep into one
  // NaN override, and NaN prices then propagate silently through a run.
  if (!Number.isFinite(n)) throw new Error(`--set=${a.slice(6)} is not a number`);
  overrides[path!] = n;
}
const config = withOverrides(defaultConfig, overrides);

const showDist = args.dist === 'true';

const rows: RunMetrics[] = [];
const violations: string[] = [];
const started = Date.now();
let lastState: ReturnType<typeof createWorld> | null = null;

for (const botName of botNames) {
  const makeBot = BOTS[botName];
  if (!makeBot) throw new Error(`unknown bot: ${botName}`);
  for (let i = 0; i < seeds; i++) {
    const bot = makeBot();
    const seed = `${botName}-${i}`;
    const state = createWorld(seed, config);
    const ticks = years * 52;
    for (let t = 0; t < ticks; t++) {
      bot.step(state);
      tick(state);
      if (checkEvery > 0 && t % checkEvery === 0) {
        const bad = checkInvariants(state);
        if (bad.length) violations.push(`${seed}@${t}: ${bad.slice(0, 3).join('; ')}`);
      }
      if (state.publishers[state.playerId]!.deadTick !== null) break;
    }
    rows.push(computeMetrics(state, botName, years));
    lastState = state;
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/runs.csv`, toCsv(rows as unknown as Record<string, unknown>[]));

// --- console summary -------------------------------------------------------
const num = (xs: number[]) => xs.filter(Number.isFinite);
const mean = (xs: number[]) => num(xs).length ? num(xs).reduce((a, b) => a + b, 0) / num(xs).length : NaN;
const median = (xs: number[]) => {
  const v = num(xs).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};
const pct = (xs: boolean[]) => (100 * xs.filter(Boolean).length / xs.length).toFixed(0) + '%';

console.log(`\n${rows.length} runs / ${years}y in ${((Date.now() - started) / 1000).toFixed(2)}s\n`);
const table = botNames.map(b => {
  const r = rows.filter(x => x.bot === b);
  return {
    bot: b,
    survived: pct(r.map(x => x.survived)),
    medDeathYr: median(r.map(x => x.deathYear ?? NaN)).toFixed(1),
    surpriseGrail: pct(r.map(x => x.surpriseGrail)),
    topMult: median(r.map(x => x.topMultiple)).toFixed(0),
    top1pct: median(r.map(x => x.top1PctShare)).toFixed(3),
    yrsTo100: median(r.map(x => x.yearsToFirst100Dollar ?? NaN)).toFixed(1),
    medCard$: median(r.map(x => x.medianCardPrice)).toFixed(0),
    p90Card$: median(r.map(x => x.p90CardPrice)).toFixed(0),
    p99Card$: median(r.map(x => x.p99CardPrice)).toFixed(0),
    maxCard$: median(r.map(x => x.maxCardPrice)).toFixed(0),
    sealed$: median(r.map(x => x.topSealedPrice)).toFixed(0),
    flopRate: mean(r.map(x => x.flopRate)).toFixed(2),
    sellThru: mean(r.map(x => x.avgSellThrough)).toFixed(2),
    chOpen: mean(r.map(x => x.channelsUnlocked)).toFixed(1),
    chLost: mean(r.map(x => x.channelsLost)).toFixed(2),
    worstRel: mean(r.map(x => x.worstRelationship)).toFixed(2),
    fatigue: mean(r.map(x => x.fatigue)).toFixed(2),
    brand: mean(r.map(x => x.brandStanding)).toFixed(3),
  };
});
console.table(table);

// A decile ladder for the last run. Median and max alone cannot tell a power
// law from flat mush; the step between deciles can. Each step should widen.
if (showDist && lastState) {
  const prices = Object.values(lastState.printings)
    .map(pr => pr.market.rawPrice / 100)
    .sort((a, b) => a - b);
  console.log(`\nprice deciles, last run (${prices.length} printings):`);
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * q))] ?? 0;
  const ladder = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1];
  let prev = 0;
  for (const q of ladder) {
    const v = at(q === 1 ? 0.999999 : q);
    const step = prev > 0 ? (v / prev).toFixed(2) + 'x' : '—';
    console.log(`  p${String(Math.round(q * 100)).padStart(3)}  $${v.toFixed(2).padStart(10)}   step ${step}`);
    prev = v;
  }
}

if (violations.length) {
  console.log(`\n!! ${violations.length} invariant violations. First 5:`);
  for (const v of violations.slice(0, 5)) console.log('   ' + v);
} else {
  console.log('invariants: clean');
}
console.log(`\nwrote ${outDir}/runs.csv`);
