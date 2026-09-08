/**
 * Charts.
 *
 * Two components, and which one to use is decided by count, not by taste:
 * `Chart` is a uPlot canvas with a crosshair and a readout, for the one series
 * a player is studying; `Sparkline` is inline SVG with no library, for the
 * hundred rows of a list where a hundred canvases would stall the phone.
 *
 * ## The compaction rule
 *
 * `SparseSeries` is COMPACTED: a point is written only when the value moves by
 * more than `config.history.writeThreshold`, so points are unevenly spaced by
 * design and the value HOLDS between them. Two consequences, and both are
 * load-bearing:
 *
 * 1. Plot against the stored tick, never against the array index. An index plot
 *    of a compacted series stretches quiet years and compresses busy ones,
 *    which is a lie in exactly the place a player is looking for a trend.
 * 2. Align several series by FORWARD FILL, never by linear interpolation. A gap
 *    means "unchanged", so a straight line drawn across it invents a movement
 *    the market did not make.
 */
import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { C, MONO, SERIES_HEX } from './ui.tsx';

export interface Point { t: number; v: number }
export interface Series { label: string; points: Point[]; color?: string }

/**
 * Forward-fills several compacted series onto one union of ticks.
 *
 * uPlot needs every series on a shared x array. Building that array by
 * interpolation would draw movements that never happened — see the file header.
 */
export function align(series: Series[]): { xs: number[]; ys: Array<Array<number | null>> } {
  const ticks = new Set<number>();
  for (const s of series) for (const p of s.points) ticks.add(p.t);
  const xs = [...ticks].sort((a, b) => a - b);
  const ys = series.map(s => {
    const out: Array<number | null> = [];
    let i = 0;
    // `null` before a series' first point: the printing did not exist yet, and
    // uPlot leaves a real gap rather than drawing a line from zero.
    let held: number | null = null;
    for (const x of xs) {
      while (i < s.points.length && s.points[i]!.t <= x) { held = s.points[i]!.v; i++; }
      out.push(held);
    }
    return out;
  });
  return { xs, ys };
}

/**
 * A time chart with a crosshair and a value readout.
 *
 * `xToLabel` turns a tick into whatever the screen calls time — a year for a
 * price history, a week for a reveal window — so this component never has to
 * know about `config.startYear`.
 */
export function Chart({ series, height = 168, logY, xToLabel, format }: {
  series: Series[];
  height?: number;
  /** Prices are a power law. A linear axis buries the whole middle of one. */
  logY?: boolean;
  xToLabel: (t: number) => string;
  format?: (v: number) => string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [hover, setHover] = useState<{ x: string; vals: Array<number | null> } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { xs, ys } = align(series);
    if (xs.length === 0) return;

    const fmt = format ?? ((v: number) => v.toFixed(2));
    const opts: uPlot.Options = {
      width: el.clientWidth || 320,
      height,
      padding: [10, 8, 0, 0],
      legend: { show: false },
      cursor: {
        y: false,
        points: { size: 8 },
        // The readout lives in React state above the canvas, so it can wear the
        // app's own type rather than uPlot's default legend table.
        sync: { key: 'none' },
      },
      scales: { y: { distr: logY ? 3 : 1 } },
      axes: [
        {
          stroke: C.dim, grid: { stroke: C.ruleSoft, width: 1 }, ticks: { stroke: C.ruleSoft },
          font: `9px ${MONO}`, size: 26,
          values: (_u, splits) => splits.map(t => xToLabel(t)),
        },
        {
          stroke: C.dim, grid: { stroke: C.ruleSoft, width: 1 }, ticks: { stroke: C.ruleSoft },
          font: `9px ${MONO}`, size: 42,
          values: (_u, splits) => splits.map(v => fmt(v)),
        },
      ],
      series: [
        { label: 'x' },
        ...series.map((s, i) => ({
          label: s.label,
          stroke: s.color ?? SERIES_HEX[i % SERIES_HEX.length]!,
          width: 2,
          points: { show: false },
        })),
      ],
      hooks: {
        setCursor: [(u) => {
          const idx = u.cursor.idx;
          if (idx == null) { setHover(null); return; }
          setHover({
            x: xToLabel(xs[idx]!),
            vals: series.map((_, i) => (u.data[i + 1]?.[idx] ?? null) as number | null),
          });
        }],
      },
    };

    const u = new uPlot(opts, [xs, ...ys] as uPlot.AlignedData, el);
    plot.current = u;
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth || 320, height }));
    ro.observe(el);
    return () => { ro.disconnect(); u.destroy(); plot.current = null; };
  }, [series, height, logY, xToLabel, format]);

  const fmt = format ?? ((v: number) => v.toFixed(2));
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12, minHeight: 17,
        padding: '0 14px 2px', fontFamily: MONO, fontSize: 10.5, color: C.muted,
      }}>
        {hover
          ? <>
              <span style={{ color: C.ink3 }}>{hover.x}</span>
              {hover.vals.map((v, i) => v != null && (
                <span key={i} style={{ color: C.ink }}>
                  <span style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: 2, marginRight: 4,
                    background: series[i]?.color ?? SERIES_HEX[i % SERIES_HEX.length]!,
                  }} />
                  {fmt(v)}
                </span>
              ))}
            </>
          : <span style={{ color: C.dimmer }}>Touch the chart to read a value.</span>}
      </div>
      <div ref={host} style={{ width: '100%' }} />
    </div>
  );
}

/**
 * A row-sized trend line. No library, no canvas, no interaction.
 *
 * A market list holds thousands of printings, so this has to stay cheap: one
 * `<polyline>` and no state.
 */
export function Sparkline({ points, width = 62, height = 20, color = C.muted, logY = true }: {
  points: Point[]; width?: number; height?: number; color?: string; logY?: boolean;
}) {
  if (points.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const tx = (v: number) => (logY ? Math.log(Math.max(1e-6, v)) : v);
  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  const span = Math.max(1, t1 - t0);
  let lo = Infinity, hi = -Infinity;
  for (const p of points) { const y = tx(p.v); if (y < lo) lo = y; if (y > hi) hi = y; }
  const range = hi - lo || 1;
  const d = points
    .map(p => `${((p.t - t0) / span) * width},${height - ((tx(p.v) - lo) / range) * (height - 2) - 1}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
