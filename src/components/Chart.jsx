// Inline SVG line chart. No chart library — nothing is imported anywhere in
// this project today, and the static GitHub Pages deploy is simpler without
// one. This is MarketTicker's Sparkline grown up: axes, a zero line, a hover
// readout and real accessibility.
//
// SetSymbol.jsx is the accessible-SVG reference in this codebase: role="img",
// an aria-label, and a child <title>. Same pattern here, plus a text summary
// for the series so a screen reader gets the shape rather than nothing.

import { useId, useState } from 'react'

const PAD = { top: 8, right: 8, bottom: 16, left: 40 }

function niceTicks(min, max, count = 3) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const step = (max - min) / count
  return Array.from({ length: count + 1 }, (_, i) => min + step * i)
}

// `series`: [{ key, label, color, points: number[] }] — all the same length.
// `labels`: an x value per point (week numbers).
export default function Chart({ series, labels, height = 130, format = (v) => String(Math.round(v)), zeroLine = false }) {
  const titleId = useId()
  const [hover, setHover] = useState(null)
  const n = labels?.length ?? 0
  if (!n || !series?.length) {
    return <p className="panel__empty">Not enough history yet — advance a few weeks.</p>
  }

  const w = 320
  const h = height
  const innerW = w - PAD.left - PAD.right
  const innerH = h - PAD.top - PAD.bottom

  const all = series.flatMap((s) => s.points).filter(Number.isFinite)
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  if (lo === hi) { lo -= 1; hi += 1 }
  const x = (i) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH

  const ticks = niceTicks(lo, hi)
  const summary = series
    .map((s) => `${s.label}: ${format(s.points[0])} to ${format(s.points[s.points.length - 1])}`)
    .join('; ')

  return (
    <div className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const rel = ((e.clientX - box.left) / box.width) * w
          const i = Math.round(((rel - PAD.left) / innerW) * (n - 1))
          setHover(i >= 0 && i < n ? i : null)
        }}
      >
        <title id={titleId}>
          Weeks {labels[0]} to {labels[n - 1]}. {summary}.
        </title>

        {ticks.map((t, i) => (
          <g key={i}>
            <line className="chart__grid" x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="chart__axis" x={PAD.left - 4} y={y(t) + 3} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {zeroLine && lo < 0 && hi > 0 && (
          <line className="chart__zero" x1={PAD.left} x2={w - PAD.right} y1={y(0)} y2={y(0)} />
        )}

        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            points={s.points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
          />
        ))}

        {hover != null && (
          <line className="chart__cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
        )}

        <text className="chart__axis" x={PAD.left} y={h - 4}>wk {labels[0]}</text>
        <text className="chart__axis" x={w - PAD.right} y={h - 4} textAnchor="end">wk {labels[n - 1]}</text>
      </svg>

      <div className="chart__legend">
        {series.map((s) => (
          <span key={s.key} className="chart__key">
            <span className="chart__dot" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
            <strong>{format(hover != null ? s.points[hover] : s.points[n - 1])}</strong>
          </span>
        ))}
        {hover != null && <span className="chart__at">wk {labels[hover]}</span>}
      </div>
    </div>
  )
}
