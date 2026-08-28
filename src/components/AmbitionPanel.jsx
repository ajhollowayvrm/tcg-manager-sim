// The long-run ambition layer (v2 roadmap layer C): merchandise (a revenue
// stream decoupled from metagame health) and cross-media ventures (big,
// expensive, risky bets that can massively expand the player base and
// insulate the brand from format churn). Its own panel — not folded into
// Distributors (already hosts two systems) or Cast (explicitly read-only) —
// because this layer is meant to read as a distinct, dedicated ambition, not
// a footnote under scalper-heat management.

import { MERCH_TYPES } from '../game/content/merch.js'
import { MEDIA_DEALS } from '../game/content/mediaDeals.js'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

const KIND_LABEL = { game: 'Games', anime: 'Anime', film: 'Film' }
const STAGE_LABEL = { pitched: 'Pitched — awaiting greenlight', greenlit: 'In production' }
const OUTCOME_LABEL = { hit: '🎉 Hit', flop: '💥 Flop', fell_through: 'Fell through' }

export default function AmbitionPanel({ state, onLaunchMerch, onRefreshMerch, onRetireMerch, onPitchMedia }) {
  const reputation = state.franchise?.reputation ?? 0
  const merchLines = state.merchLines ?? []
  const mediaDeals = state.mediaDeals ?? []
  const resolvedHistory = mediaDeals.filter((d) => d.outcome).slice(-4).reverse()

  return (
    <div className="panel">
      <h2 className="panel__title">Ambition</h2>

      <h3 className="panel__subtitle">Merchandise</h3>
      <ul className="distrib__list">
        {Object.values(MERCH_TYPES).map((t) => {
          const line = merchLines.find((m) => m.kind === t.kind && m.active)
          return (
            <li key={t.kind} className={'distrib' + (line ? ' distrib--active' : '')}>
              <div className="distrib__head">
                <span className="distrib__name">{t.name}</span>
              </div>
              <p className="distrib__blurb">{t.blurb}</p>
              {line ? (
                <>
                  <div className="distrib__terms">
                    <span>${t.defaultPrice}/unit</span>
                    <span>·</span>
                    <span>{fmtCash(line.totalRevenue)} lifetime</span>
                  </div>
                  <div className="roster__reach" title={`Buzz ${Math.round(line.merchBuzz)}`}>
                    <span className="bar"><span className="bar__fill" style={{ width: `${line.merchBuzz}%` }} /></span>
                  </div>
                  <div className="distrib__actions">
                    <button className="btn btn--ghost" onClick={() => onRefreshMerch(t.kind)}>
                      Refresh · {fmtCash(t.refreshCost)}
                    </button>
                    <button className="btn btn--ghost distrib__drop" onClick={() => onRetireMerch(t.kind)}>Retire</button>
                  </div>
                </>
              ) : (
                <button className="btn btn--design distrib__sign" onClick={() => onLaunchMerch(t.kind)}>
                  Launch — {fmtCash(t.launchCost)}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <h3 className="panel__subtitle">Cross-media ventures</h3>
      {['game', 'anime', 'film'].map((kind) => (
        <div key={kind}>
          <h4 className="panel__subtitle" style={{ opacity: 0.7 }}>{KIND_LABEL[kind]}</h4>
          <ul className="distrib__list">
            {MEDIA_DEALS.filter((d) => d.kind === kind).map((d) => {
              const active = mediaDeals.find((m) => m.dealId === d.id && !m.outcome)
              const gated = reputation < d.reputationGate
              return (
                <li key={d.id} className={'distrib' + (active ? ' distrib--active' : '')}>
                  <div className="distrib__head">
                    <span className="distrib__name">{d.name}</span>
                  </div>
                  <p className="distrib__blurb">{d.blurb}</p>
                  <div className="distrib__terms">
                    <span>needs {d.reputationGate} reputation</span>
                    <span>·</span>
                    <span>{Math.round(d.baseOdds * 100)}% base odds</span>
                    <span>·</span>
                    <span>flop costs {fmtCash(d.flopCost)}</span>
                  </div>
                  {active ? (
                    <>
                      <span className="distrib__signed">{STAGE_LABEL[active.stage] ?? active.stage}</span>
                      {active.stage === 'greenlit' && (
                        <div className="roster__reach" title={`${active.weeksInStage}/${active.productionWeeksTarget} weeks`}>
                          <span className="bar">
                            <span className="bar__fill" style={{ width: `${Math.min(100, (active.weeksInStage / active.productionWeeksTarget) * 100)}%` }} />
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      className="btn btn--design distrib__sign"
                      disabled={gated}
                      title={gated ? `Needs ${d.reputationGate - Math.round(reputation)} more reputation` : undefined}
                      onClick={() => onPitchMedia(d.id)}
                    >
                      Pitch — {fmtCash(d.pitchCost)}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {resolvedHistory.length > 0 && (
        <>
          <h3 className="panel__subtitle">Recent outcomes</h3>
          <ul className="feed">
            {resolvedHistory.map((d) => (
              <li key={d.id} className="feed__item">
                {OUTCOME_LABEL[d.outcome] ?? d.outcome} — {MEDIA_DEALS.find((m) => m.id === d.dealId)?.name ?? d.dealId}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
