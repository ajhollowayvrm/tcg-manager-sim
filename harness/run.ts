/**
 * Headless balance harness.
 *
 *   npm run sim -- --seeds=200 --years=50 --bot=all
 *   npm run sim -- --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
 *   npm run sim -- --seeds=1 --years=25 --bot=conservative --dist
 *   npm run sim -- --jobs=1          # force the synchronous path
 *
 * Runs are independent and seeded, so a batch shards across worker threads
 * without any per-run result moving: the CSV is byte-identical to the
 * synchronous path, only the wall clock changes. `--jobs=1` keeps the old
 * single-threaded path for debugging, and `--dist` forces it, since the decile
 * ladder reads a finished world that would have to cross a thread boundary.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { SimState } from '../src/sim/types.ts';
import { BOTS } from './bots.ts';
import { runOne, type RunTask, type RunResult } from './runOne.ts';
import { toCsv, type RunMetrics } from './metrics.ts';

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
const showDist = args.dist === 'true';

const requestedJobs = args.jobs === undefined || args.jobs === 'auto'
  ? Math.max(1, cpus().length)
  : Math.max(1, Math.floor(Number(args.jobs)));
if (!Number.isFinite(requestedJobs)) throw new Error(`--jobs=${args.jobs} is not a number`);

const tasks: RunTask[] = [];
for (const botName of botNames) {
  if (!BOTS[botName]) throw new Error(`unknown bot: ${botName}`);
  for (let i = 0; i < seeds; i++) {
    tasks.push({ botName, seedIndex: i, years, checkEvery, overrides });
  }
}

// `--dist` needs a finished world, which does not come back from a worker.
const jobs = showDist ? 1 : Math.min(requestedJobs, tasks.length);

const started = Date.now();
const results: (RunResult | undefined)[] = new Array(tasks.length);
// Held in a box rather than a bare `let`: the only writer is the `keep`
// callback below, and TypeScript cannot see through that, so a bare binding
// narrows to `null` for the rest of the file and `--dist` stops compiling.
const kept: { state: SimState | null } = { state: null };

if (jobs === 1) {
  for (let i = 0; i < tasks.length; i++) {
    const { metrics, violations } = runOne(tasks[i]!, st => { kept.state = st; });
    results[i] = { order: i, metrics, violations };
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

// Reassembled in task order, so the CSV does not depend on which thread
// finished first.
const rows: RunMetrics[] = [];
const violations: string[] = [];
for (const r of results) {
  if (!r) throw new Error('a run produced no result');
  rows.push(r.metrics);
  violations.push(...r.violations);
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

console.log(`\n${rows.length} runs / ${years}y on ${jobs} thread${jobs === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(2)}s\n`);
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

// Finance and survival. The main table says whether a bot lived; this one says
// how, and it is where the difficulty pass reads its numbers. `netWorth` counts
// unsold stock at cost, so read it against `unsold` — a large net worth held
// entirely as a warehouse is an overprint that has not been called yet.
const money = (m: number) =>
  Math.abs(m) >= 1e6 ? (m / 1e6).toFixed(1) + 'M'
  : Math.abs(m) >= 1e3 ? (m / 1e3).toFixed(0) + 'k'
  : m.toFixed(0);
console.log('finance and survival:');
console.table(botNames.map(b => {
  const r = rows.filter(x => x.bot === b);
  const causes = new Map<string, number>();
  for (const x of r) if (x.deathCause) causes.set(x.deathCause, (causes.get(x.deathCause) ?? 0) + 1);
  const deaths = [...causes.entries()].sort((a, c) => c[1] - a[1])
    .map(([c, n]) => `${c} ${n}`).join(' ');
  return {
    bot: b,
    survived: pct(r.map(x => x.survived)),
    deaths: deaths || '-',
    netWorth: '$' + money(median(r.map(x => x.netWorth))),
    liquid: '$' + money(median(r.map(x => x.liquidNetWorth))),
    peakDebt: '$' + money(median(r.map(x => x.peakDebt))),
    unsold: money(mean(r.map(x => x.unsoldUnits))),
    invValue: '$' + money(median(r.map(x => x.inventoryValue))),
    printRun: money(mean(r.map(x => x.meanPrintRun))),
  };
}));

// Regions, printed only for runs that opened one past the home market.
const regionRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.regionsOpen > 1);
    if (ran.length === 0) return null;
    return {
      bot: b,
      runsAbroad: `${ran.length}/${r.length}`,
      regions: mean(ran.map(x => x.regionsOpen)).toFixed(1),
      entrySpend: '$' + money(median(ran.map(x => x.regionUnlockSpend))),
      knowledge: mean(ran.map(x => x.regionKnowledge)).toFixed(2),
      exportShare: (100 * mean(ran.map(x => x.exportShare))).toFixed(0) + '%',
      readingR: mean(ran.map(x => x.regionReadingCorrelation)).toFixed(2),
    };
  })
  .filter(Boolean);
if (regionRows.length) {
  console.log('regions:');
  console.table(regionRows);
}

// The secondary-market actors. Scalpers are in the drops table with the
// mechanism they belong to; these three act on singles.
console.log('secondary market:');
console.table(botNames.map(b => {
  const r = rows.filter(x => x.bot === b);
  return {
    bot: b,
    collectors: money(mean(r.map(x => x.collectors))),
    heldOffMarket: (100 * mean(r.map(x => x.collectorHeldShare))).toFixed(0) + '%',
    resellers: money(mean(r.map(x => x.resellers))),
    speculators: money(mean(r.map(x => x.speculators))),
    specSwing: mean(r.map(x => x.speculatorSwing)).toFixed(1) + 'x',
    aftermarket: mean(r.map(x => x.aftermarketIndex)).toFixed(1) + 'x',
  };
}));

// Collabs, printed only for runs where an offer arrived at all.
const collabRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.collabOffers > 0);
    if (ran.length === 0) return null;
    return {
      bot: b,
      offers: mean(ran.map(x => x.collabOffers)).toFixed(1),
      signed: mean(ran.map(x => x.collabsSigned)).toFixed(1),
      licenceSpend: '$' + money(median(ran.map(x => x.collabSpend))),
      ipAffection: mean(ran.map(x => x.meanIpAffection)).toFixed(1),
    };
  })
  .filter(Boolean);
if (collabRows.length) {
  console.log('collabs:');
  console.table(collabRows);
}

// Creators and chains, printed only where either happened.
const cultureRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.creatorCoverage > 0 || x.chains > 0);
    if (ran.length === 0) return null;
    return {
      bot: b,
      coverage: mean(ran.map(x => x.creatorCoverage)).toFixed(0),
      onOwnCards: (100 * mean(ran.map(x => x.creatorOwnShare))).toFixed(0) + '%',
      bestRelation: mean(ran.map(x => x.bestCreatorRelationship)).toFixed(2),
      chains: mean(ran.map(x => x.chains)).toFixed(0),
      spanning: (100 * mean(ran.map(x => x.chainsSpanningSets))).toFixed(0) + '%',
      chainLen: mean(ran.map(x => x.meanChainLength)).toFixed(1),
    };
  })
  .filter(Boolean);
if (cultureRows.length) {
  console.log('creators and chains:');
  console.table(cultureRows);
}

// Drops get their own table. The main one is already too wide to read, and a
// run that never opened a direct store has nothing to say here.
const dropRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.dropsRun > 0);
    if (ran.length === 0) return null;
    return {
      bot: b,
      runsWithDrops: `${ran.length}/${r.length}`,
      drops: mean(ran.map(x => x.dropsRun)).toFixed(0),
      soldOut: (100 * mean(ran.map(x => x.dropSellOutRate))).toFixed(0) + '%',
      toScalpers: (100 * mean(ran.map(x => x.scalperShareOfDrops))).toFixed(0) + '%',
      peakPremium: mean(ran.map(x => x.peakDropPremium)).toFixed(2) + 'x',
      scalpers: mean(ran.map(x => x.scalperPopulation)).toFixed(0),
      peakScalpers: mean(ran.map(x => x.peakScalpers)).toFixed(0),
      cycles: mean(ran.map(x => x.scalperCycles)).toFixed(1),
    };
  })
  .filter(Boolean);
if (dropRows.length) {
  console.log('direct-store drops:');
  console.table(dropRows);
}

// The reveal window gets its own table for the same reason drops do, and it
// prints only for runs that actually ran a campaign.
const hypeRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.avgHypeAtRelease > 0 || x.marketingTotal > 0);
    if (ran.length === 0) return null;
    return {
      bot: b,
      runsWithHype: `${ran.length}/${r.length}`,
      hypeAtRelease: mean(ran.map(x => x.avgHypeAtRelease)).toFixed(2) + 'x',
      marketing$: (mean(ran.map(x => x.marketingTotal)) / 1e6).toFixed(1) + 'M',
      prereleases: mean(ran.map(x => x.prereleasesHosted)).toFixed(0),
      signalR: mean(ran.map(x => x.signalCorrelation)).toFixed(2),
    };
  })
  .filter(Boolean);
if (hypeRows.length) {
  console.log('reveal window:');
  console.table(hypeRows);
}

// Grading gets its own table too, and prints only for runs where anything was
// actually submitted. `printings` is the denominator that matters: grading is
// supposed to be a minority of the population, not all of it.
const gradingRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.gradedCopies > 0);
    if (ran.length === 0) return null;
    return {
      bot: b,
      runsWithGrading: `${ran.length}/${r.length}`,
      printingsGraded: mean(ran.map(x => x.printingsGraded)).toFixed(0),
      ofPrintings: (100 * mean(ran.map(x => x.gradedPrintingShare))).toFixed(1) + '%',
      gradedCopies: mean(ran.map(x => x.gradedCopies)).toFixed(0),
      gradedShare: (100 * mean(ran.map(x => x.gradedShare))).toFixed(2) + '%',
      gemRate: (100 * mean(ran.map(x => x.gemRate))).toFixed(1) + '%',
      gem10Premium: mean(ran.map(x => x.gem10Premium)).toFixed(1) + 'x',
      graders: mean(ran.map(x => x.gradersActive)).toFixed(1),
    };
  })
  .filter(Boolean);
if (gradingRows.length) {
  console.log('grading and pop reports:');
  console.table(gradingRows);
}

// The art pipeline gets its own table, for the same reason drops and grading
// do: the main table is already too wide, and this one is about a decision the
// bot made rather than about the market.
const artRows = botNames
  .map(b => {
    const r = rows.filter(x => x.bot === b);
    const ran = r.filter(x => x.artSpend > 0);
    if (ran.length === 0) return null;
    return {
      bot: b,
      art$: (mean(ran.map(x => x.artSpend)) / 1000).toFixed(1) + 'k',
      houseArt: (100 * mean(ran.map(x => x.houseArtShare))).toFixed(0) + '%',
      artQuality: mean(ran.map(x => x.meanArtQuality)).toFixed(2),
      artistRep: mean(ran.map(x => x.meanArtistReputation)).toFixed(2),
      repGained: mean(ran.map(x => x.artistReputationGained)).toFixed(3),
      retained: mean(ran.map(x => x.artistsRetained)).toFixed(1),
      roster: mean(ran.map(x => x.rosterSize)).toFixed(0),
    };
  })
  .filter(Boolean);
if (artRows.length) {
  console.log('art pipeline:');
  console.table(artRows);
}

// A decile ladder for the last run. Median and max alone cannot tell a power
// law from flat mush; the step between deciles can. Each step should widen.
if (showDist && kept.state) {
  const prices = Object.values(kept.state.printings)
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
