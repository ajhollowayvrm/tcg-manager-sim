/**
 * The balance regression suite.
 *
 *   npm run check                 run both sweeps and gate them
 *   npm run check -- --bank=1     also write docs/tuning/bank/round-1/
 *   npm run check -- --from=DIR   gate a banked sweep instead of re-running
 *   npm run check -- --print-bands  emit the Markdown band table
 *
 * `checkInvariants` asserts structure and `tsc` asserts types. Neither says
 * anything about balance, and a balance regression three rounds back is
 * unattributable. This is the check that makes it attributable.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { BOTS } from './bots.ts';
import { DEFAULT_SNAPSHOT_AGES, type RunTask } from './runOne.ts';
import { runBatch, defaultJobs } from './batch.ts';
import { toCsv } from './metrics.ts';
import { parseCsv, type Row } from './aggregate.ts';
import { GATES, bandTable, type Gate, type GateContext, type Category } from './gates.ts';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k!, rest.join('=') || 'true'];
}));

if (args['print-bands'] === 'true') { console.log(bandTable()); process.exit(0); }

const from = args.from ? String(args.from) : null;
const bank = args.bank ? String(args.bank) : null;
const OUT = './out/check';

const BAND_MARKER_START = '<!-- BANDS:START -->';
const BAND_MARKER_END = '<!-- BANDS:END -->';

type Verdict = 'PASS' | 'FAIL' | 'KNOWN' | 'FIXED' | 'NO-DATA';

interface Result {
  gate: Gate;
  observed: number | null;
  verdict: Verdict;
  drift: number | null;
}

// --- sweeps ----------------------------------------------------------------

function tasks(bots: string[], seeds: number, years: number): RunTask[] {
  const out: RunTask[] = [];
  for (const botName of bots) {
    if (!BOTS[botName]) throw new Error(`unknown bot: ${botName}`);
    for (let i = 0; i < seeds; i++) {
      out.push({
        botName, seedIndex: i, years, checkEvery: 52,
        overrides: {}, snapshotAges: DEFAULT_SNAPSHOT_AGES,
      });
    }
  }
  return out;
}

async function sweep(bots: string[], seeds: number, years: number) {
  const t = tasks(bots, seeds, years);
  const results = await runBatch(t, defaultJobs(t.length));
  return {
    runs: results.map(r => r.metrics) as unknown as Row[],
    sets: results.flatMap(r => r.snapshots) as unknown as Row[],
    violations: results.flatMap(r => r.violations),
  };
}

/**
 * Rule 4 of 04-workflow.md, as code. A run is a pure function of its inputs, so
 * the threaded and synchronous paths must agree byte for byte.
 */
async function parallelIdentity(): Promise<boolean> {
  const t = tasks(['conservative'], 8, 15);
  const [par, seq] = [await runBatch(t, defaultJobs(t.length)), await runBatch(t, 1)];
  const csv = (rs: Awaited<ReturnType<typeof runBatch>>) =>
    toCsv(rs.map(r => r.metrics) as unknown as Record<string, unknown>[]);
  return csv(par) === csv(seq);
}

function typecheckOk(): boolean {
  try {
    execFileSync('npx', ['tsc', '--noEmit'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function bandsInSync(): boolean {
  const path = 'docs/tuning/03-targets.md';
  if (!existsSync(path)) return false;
  const doc = readFileSync(path, 'utf8');
  const a = doc.indexOf(BAND_MARKER_START);
  const b = doc.indexOf(BAND_MARKER_END);
  if (a < 0 || b < 0) return false;
  return doc.slice(a + BAND_MARKER_START.length, b).trim() === bandTable().trim();
}

// --- gating ----------------------------------------------------------------

function judge(gate: Gate, ctx: GateContext): Result {
  let observed: number | null;
  try { observed = gate.measure(ctx); } catch { observed = null; }

  let verdict: Verdict;
  if (observed === null || !Number.isFinite(observed)) {
    verdict = 'NO-DATA';
  } else {
    const inBand = observed >= gate.band[0] && observed <= gate.band[1];
    verdict = gate.expect === 'pass'
      ? (inBand ? 'PASS' : 'FAIL')
      : (inBand ? 'FIXED' : 'KNOWN');
  }

  // Drift is what catches a value sliding a long way inside a wide band.
  let drift: number | null = null;
  if (observed !== null && gate.banked !== null && gate.banked !== 0) {
    const d = (observed - gate.banked) / Math.abs(gate.banked);
    if (Math.abs(d) > 0.25) drift = d;
  }
  return { gate, observed, verdict, drift };
}

// --- output ----------------------------------------------------------------

const pad = (s: string, n: number) => s.length >= n ? s : s + ' '.repeat(n - s.length);
// `String(v)` on a large float printed all seventeen digits and ran into the
// band column: `330.7037037037037[130, 3100]`. Integers still print bare.
const fmt = (v: number | null) =>
  v === null ? '—' : Number.isInteger(v) ? String(v)
    : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);

function render(results: Result[]): string {
  const lines: string[] = [];
  const cats: Category[] = ['static', 'structural', 'difficulty', 'shape', 'subsystem'];
  for (const cat of cats) {
    const rs = results.filter(r => r.gate.category === cat);
    if (!rs.length) continue;
    lines.push('');
    for (const r of rs) {
      const band = `[${r.gate.band[0]}, ${r.gate.band[1]}]`;
      const drift = r.drift === null ? ''
        : `  DRIFT ${r.drift > 0 ? '+' : ''}${(100 * r.drift).toFixed(0)}% from ${fmt(r.gate.banked)}`;
      lines.push(
        `  ${pad(r.gate.id, 32)}${pad(fmt(r.observed), 10)}${pad(band, 18)}`
        + `${pad(r.gate.expect, 12)}${pad(r.verdict, 9)}${drift}`,
      );
    }
  }
  return lines.join('\n');
}

// --- main ------------------------------------------------------------------

const started = Date.now();
let roster: Awaited<ReturnType<typeof sweep>>;
let shape: Awaited<ReturnType<typeof sweep>>;
let identical = true;

if (from) {
  const runs = parseCsv(readFileSync(`${from}/runs.csv`, 'utf8'));
  const sets = existsSync(`${from}/sets.csv`)
    ? parseCsv(readFileSync(`${from}/sets.csv`, 'utf8')) : [];
  roster = { runs, sets, violations: [] };
  shape = roster;
  console.log(`gating ${from} (${runs.length} runs, ${sets.length} set snapshots)`);
  console.log('note: --from cannot check invariants or thread identity; those gate as NO-DATA.\n');
} else {
  console.log('running the roster sweep (20 seeds x 30 years, all bots)...');
  roster = await sweep(Object.keys(BOTS), 20, 30);
  console.log('running the shape sweep (30 seeds x 50 years, conservative)...');
  shape = await sweep(['conservative'], 30, 50);
  console.log('checking thread identity...');
  identical = await parallelIdentity();
}

const ctx: GateContext = {
  roster: roster.runs,
  shape: shape.runs,
  shapeSets: shape.sets,
  violations: [...roster.violations, ...shape.violations],
  typecheckOk: from ? true : typecheckOk(),
  parallelIdentical: identical,
  bandsInSync: bandsInSync(),
};

const results = GATES.map(g => judge(g, ctx));
console.log(render(results));

const count = (v: Verdict) => results.filter(r => r.verdict === v).length;
const noDataOnPass = results.filter(r => r.verdict === 'NO-DATA' && r.gate.expect === 'pass');
const fixed = results.filter(r => r.verdict === 'FIXED');
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(
  `\n${results.length} gates: ${count('PASS')} PASS, ${count('FAIL')} FAIL, `
  + `${count('KNOWN')} KNOWN, ${count('FIXED')} FIXED, ${count('NO-DATA')} NO-DATA.  `
  + `${results.filter(r => r.drift !== null).length} DRIFT.`,
);
if (fixed.length) {
  console.log(`\n${fixed.length} gate(s) started passing. Flip expect to 'pass' in harness/gates.ts:`);
  for (const r of fixed) console.log(`    ${r.gate.id}  (observed ${fmt(r.observed)})`);
}
for (const r of results.filter(r => r.verdict === 'FAIL')) {
  console.log(`\nFAIL ${r.gate.id}: ${fmt(r.observed)} outside [${r.gate.band[0]}, ${r.gate.band[1]}]`);
  console.log(`     ${r.gate.why}`);
}
console.log(`\nsweeps done in ${elapsed}s`);

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/runs.csv`, toCsv(roster.runs as unknown as Record<string, unknown>[]));
if (shape.sets.length) {
  writeFileSync(`${OUT}/sets.csv`, toCsv(shape.sets as unknown as Record<string, unknown>[]));
}
const json = results.map(r => ({
  id: r.gate.id, category: r.gate.category, observed: r.observed,
  band: r.gate.band, expect: r.gate.expect, verdict: r.verdict,
  banked: r.gate.banked, drift: r.drift,
}));
writeFileSync(`${OUT}/gates.json`, JSON.stringify(json, null, 2));

if (bank) {
  const dir = `docs/tuning/bank/round-${bank}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/gates.json`, JSON.stringify(json, null, 2));
  writeFileSync(`${dir}/report.md`,
    `# Regression bank — round ${bank}\n\nMeasured ${new Date().toISOString().slice(0, 10)}.\n`
    + `Sweeps: roster 20 seeds x 30 years all bots; shape 30 seeds x 50 years conservative.\n\n`
    + '```\n' + render(results).trim() + '\n```\n');
  console.log(`banked to ${dir}/`);
}

const failed = count('FAIL') > 0 || noDataOnPass.length > 0;
if (noDataOnPass.length) {
  console.log('\nNO-DATA on gates expected to pass (a gate that stops measuring is worse than one that fails):');
  for (const r of noDataOnPass) console.log(`    ${r.gate.id}`);
}
process.exit(failed ? 1 : 0);
