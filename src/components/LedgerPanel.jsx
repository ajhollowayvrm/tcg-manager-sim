// Profit and loss.
//
// The old banner showed gross revenue and nothing else — `lastUpkeep`,
// `lastMerchRevenue` and the per-set breakdown never reached the screen at all,
// so a player could not tell whether a set made money, or where a week's cash
// actually went. With studio overhead, warehousing and era upkeep running every
// week (overhead.js), a management sim without a P&L is unplayable.
//
// Reads state.ledger, written by simulation.js's recordLedger. Uses the
// `.costs` ledger idiom already built for the set builder's footer.

import { useState } from 'react'
import Chart from './Chart.jsx'
import Section from './nav/Section.jsx'

const INCOME_ROWS = [
  ['sealed', 'Sealed product'],
  ['merch', 'Merchandise'],
]

const COST_ROWS = [
  ['studio', 'Studio overhead'],
  ['warehouse', 'Warehousing'],
  ['blocks', 'Era upkeep'],
  ['goodwill', 'Community programme'],
  ['grassroots', 'Grassroots programme'],
  ['contracts', 'Illustrator contracts'],
  ['sponsorships', 'Creator sponsorships'],
  ['interest', 'Debt interest'],
]

function money(n) {
  const v = Math.round(n ?? 0)
  return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US')
}

export default function LedgerPanel({ state }) {
  const [span, setSpan] = useState(13)
  const ledger = state.ledger ?? []
  const latest = ledger[0]

  if (!latest) {
    return (
      <Section id="stats.pnl" title="Profit & Loss" level={2}>
        <p className="panel__empty">Advance a week to see the books.</p>
      </Section>
    )
  }

  // Averaged over the chosen window, so a single spiky launch week doesn't read
  // as the studio's normal operating position.
  const window = ledger.slice(0, span)
  const mean = (get) => window.reduce((s, e) => s + get(e), 0) / window.length
  const netRun = mean((e) => e.net)

  const history = (state.history ?? []).slice(-52)

  return (
    <Section id="stats.pnl" title="Profit & Loss" level={2} summary={`${money(netRun)}/wk net`}>
      <div className="roster__filters ledger__spans">
        {[1, 13, 52].map((n) => (
          <button
            key={n}
            className={'roster__chip' + (span === n ? ' is-active' : '')}
            onClick={() => setSpan(n)}
          >
            {n === 1 ? 'This week' : n === 13 ? 'Quarter avg' : 'Year avg'}
          </button>
        ))}
      </div>

      <div className="costs">
        {INCOME_ROWS.map(([k, label]) => {
          const v = mean((e) => e.income[k] ?? 0)
          if (v === 0 && k !== 'sealed') return null
          return (
            <div key={k} className="costs__line"><span>{label}</span><span>{money(v)}</span></div>
          )
        })}
        <div className="costs__line costs__line--total">
          <span>Income</span><span>{money(mean((e) => e.income.total))}</span>
        </div>
      </div>

      <div className="costs ledger__costs">
        {COST_ROWS.map(([k, label]) => {
          const v = mean((e) => e.costs[k] ?? 0)
          if (v === 0) return null
          return (
            <div key={k} className="costs__line"><span>{label}</span><span>−{money(v)}</span></div>
          )
        })}
        <div className="costs__line costs__line--total">
          <span>Costs</span><span>−{money(mean((e) => e.costs.total))}</span>
        </div>
      </div>

      <div className={'ledger__net' + (netRun < 0 ? ' is-bad' : '')}>
        <span>Net per week</span>
        <strong>{money(netRun)}</strong>
      </div>
      {netRun < 0 && (
        <p className="field__note is-warn">
          You are running at a loss. Recurring costs scale with the size of your
          catalogue — pulling an old set from print is the fastest way to cut them.
        </p>
      )}

      {history.length > 3 && (
        <Section id="stats.pnl.cash" title="Cash & weekly net" level={3}>
          <Chart
            labels={history.map((h) => h.w)}
            zeroLine
            format={(v) => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v)))}
            series={[
              { key: 'cash', label: 'Cash', color: 'var(--accent-2)', points: history.map((h) => h.cash) },
              { key: 'net', label: 'Net/wk', color: 'var(--pop)', points: history.map((h) => h.net) },
            ]}
          />
        </Section>
      )}

      {latest.perSet?.length > 0 && (
        <Section id="stats.pnl.bySet" title="This week, by set" level={3}>
          <ul className="ledger__sets">
            {[...latest.perSet].sort((a, b) => b.revenue - a.revenue).map((s) => (
              <li key={s.id} className="ledger__set">
                <span className="ledger__setname">{s.name}</span>
                <span className="ledger__setunits">{s.units.toLocaleString()} units</span>
                <span className="ledger__setrev">{money(s.revenue)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Section>
  )
}
