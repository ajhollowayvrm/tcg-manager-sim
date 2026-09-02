// Trends over the whole run.
//
// The sim runs for years and, until now, showed only the current week. Every
// stat the player is asked to manage — the player base, community sentiment,
// franchise reputation, scalper heat — was a single number with no context, so
// "is this getting better or worse?" was unanswerable.
//
// Reads state.history, a small row per week written by simulation.js's
// recordLedger and capped at a decade.

import { useState } from 'react'
import Chart from './Chart.jsx'
import Section from './nav/Section.jsx'

const RANGES = [
  { id: 26, label: '6 months' },
  { id: 52, label: '1 year' },
  { id: 156, label: '3 years' },
  { id: 0, label: 'All time' },
]

const compact = (v) => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v)))

export default function HistoryPanel({ state }) {
  const [range, setRange] = useState(52)
  const all = state.history ?? []
  const rows = range === 0 ? all : all.slice(-range)

  if (rows.length < 4) {
    return (
      <Section id="stats.trends" title="Trends" level={2}>
        <p className="panel__empty">Advance a few weeks to build a history.</p>
      </Section>
    )
  }

  const labels = rows.map((h) => h.w)

  return (
    <Section id="stats.trends" title="Trends" level={2}>
      <div className="roster__filters">
        {RANGES.map((r) => (
          <button
            key={r.id}
            className={'roster__chip' + (range === r.id ? ' is-active' : '')}
            onClick={() => setRange(r.id)}
            disabled={r.id !== 0 && all.length < r.id}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Section id="stats.trends.players" title="Player base" level={3}>
        <Chart
          labels={labels}
          format={compact}
          series={[
            { key: 'casual', label: 'Casual', color: 'var(--accent-2)', points: rows.map((h) => h.casual) },
            { key: 'collectors', label: 'Collectors', color: 'var(--illustration)', points: rows.map((h) => h.collectors) },
          ]}
        />
      </Section>

      <Section id="stats.trends.standing" title="Standing" level={3}>
        <Chart
          labels={labels}
          zeroLine
          series={[
            { key: 'sentiment', label: 'Sentiment', color: 'var(--good)', points: rows.map((h) => h.sentiment) },
            { key: 'reputation', label: 'Reputation', color: 'var(--pop)', points: rows.map((h) => h.reputation) },
          ]}
        />
      </Section>

      <Section id="stats.trends.shelf" title="Shelf & heat" level={3}>
        <Chart
          labels={labels}
          height={110}
          series={[
            { key: 'live', label: 'Sets in print', color: 'var(--silver)', points: rows.map((h) => h.live) },
            { key: 'heat', label: 'Scalper heat', color: 'var(--bad)', points: rows.map((h) => h.heat) },
          ]}
        />
        <p className="field__note">
          Recurring costs scale steeply with the number of sets you keep in print
          (overhead rises faster than the count does), so the grey line is the one
          that quietly decides whether the studio is solvent.
        </p>
      </Section>
    </Section>
  )
}
