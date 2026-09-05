/**
 * Aggregation helpers for the regression suite.
 *
 * One rule runs through all of them: **`null` is a real answer, not a missing
 * one.** A run with no channels left has no worst relationship; a run whose
 * sets never reached age two has no age-two median. Those drop out of an
 * aggregate rather than being counted as zero, because zero is also a legal
 * measurement for most of these columns and conflating the two is how a
 * silently-broken metric survives a regression suite.
 */
import type { RunMetrics } from './metrics.ts';

/** A parsed `runs.csv` row. Empty cells become `null`, never `0`. */
export type Row = Record<string, string | number | boolean | null>;

/** Minimal RFC-4180 reader. The harness only ever writes simple values. */
export function parseCsv(text: string): Row[] {
  const lines = text.split('\n').filter(l => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((h, i) => {
      const raw = cells[i] ?? '';
      if (raw === '') { row[h] = null; return; }
      if (raw === 'true') { row[h] = true; return; }
      if (raw === 'false') { row[h] = false; return; }
      const n = Number(raw);
      row[h] = raw !== '' && Number.isFinite(n) ? n : raw;
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Rows for one bot, in task order. */
export function forBot(rows: Row[], bot: string): Row[] {
  return rows.filter(r => r.bot === bot);
}

export function bots(rows: Row[]): string[] {
  const seen: string[] = [];
  for (const r of rows) {
    const b = String(r.bot);
    if (!seen.includes(b)) seen.push(b);
  }
  return seen;
}

/** Finite numbers only. Nulls, blanks and NaN all drop out. */
export function numbers(rows: Row[], key: keyof RunMetrics | string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[key as string];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)]!;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Fraction of rows where a boolean column is true. */
export function shareTrue(rows: Row[], key: string): number | null {
  const vals = rows.map(r => r[key]).filter(v => typeof v === 'boolean');
  return vals.length ? vals.filter(Boolean).length / vals.length : null;
}

/** How many rows satisfy a predicate. */
export function countWhere(rows: Row[], pred: (r: Row) => boolean): number {
  return rows.filter(pred).length;
}

/** Distinct finite values of a column, for the "is this a constant?" checks. */
export function distinctCount(rows: Row[], key: string): number {
  return new Set(numbers(rows, key).map(n => n.toFixed(6))).size;
}

/** Death causes and their run counts. */
export function deathCauses(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = r.deathCause;
    if (typeof c === 'string' && c !== '') m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/** Bots ranked by the median of a column, best first. */
export function rankBots(rows: Row[], key: string): string[] {
  return bots(rows)
    .map(b => ({ b, v: median(numbers(forBot(rows, b), key)) ?? -Infinity }))
    .sort((x, y) => y.v - x.v)
    .map(x => x.b);
}
