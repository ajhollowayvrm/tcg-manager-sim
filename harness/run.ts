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
  overrides[path!] = Number(v);
}
const config = withOverrides(defaultConfig, overrides);

const rows: RunMetrics[] = [];
const violations: string[] = [];
const started = Date.now();

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
    maxCard$: median(r.map(x => x.maxCardPrice)).toFixed(0),
    sealed$: median(r.map(x => x.topSealedPrice)).toFixed(0),
    flopRate: mean(r.map(x => x.flopRate)).toFixed(2),
    fatigue: mean(r.map(x => x.fatigue)).toFixed(2),
    brand: mean(r.map(x => x.brandStanding)).toFixed(3),
  };
});
console.table(table);

if (violations.length) {
  console.log(`\n!! ${violations.length} invariant violations. First 5:`);
  for (const v of violations.slice(0, 5)) console.log('   ' + v);
} else {
  console.log('invariants: clean');
}
console.log(`\nwrote ${outDir}/runs.csv`);
