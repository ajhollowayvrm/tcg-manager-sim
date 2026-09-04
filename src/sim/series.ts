/**
 * Sparse time series. A point is written only when the value has moved past
 * `writeThreshold` since the last write; consumers interpolate between points.
 * This is what keeps price history for thousands of mostly-flat commons cheap.
 */
import type { SparseSeries, Tick } from './types.ts';

export function emptySeries(t: Tick): SparseSeries {
  return { points: [], compactedBefore: t, lastWrittenValue: 0 };
}

export function writePoint(series: SparseSeries, t: Tick, value: number, threshold: number): void {
  if (series.points.length === 0) {
    series.points.push({ t, v: value });
    series.lastWrittenValue = value;
    return;
  }
  const last = series.lastWrittenValue;
  const denom = Math.max(1, Math.abs(last));
  if (Math.abs(value - last) / denom >= threshold) {
    series.points.push({ t, v: value });
    series.lastWrittenValue = value;
  }
}

/**
 * Downsamples points older than `weeklyRetentionTicks` into ~quarterly
 * buckets (13-week windows), keeping the last value written in each bucket.
 * Recent points stay at full weekly resolution.
 */
export function compact(series: SparseSeries, tick: Tick, cfg: { weeklyRetentionTicks: number }): void {
  const cutoff = (tick as number) - cfg.weeklyRetentionTicks;
  if (cutoff <= (series.compactedBefore as number)) return;

  const recent: SparseSeries['points'] = [];
  const buckets = new Map<number, { t: Tick; v: number }>();
  for (const p of series.points) {
    if ((p.t as number) < cutoff) {
      buckets.set(Math.floor((p.t as number) / 13), p);
    } else {
      recent.push(p);
    }
  }
  series.points = [...buckets.values(), ...recent];
  series.compactedBefore = cutoff as Tick;
}
