// Business › Ventures — merchandise (a revenue stream decoupled from the
// shelf) and cross-media deals (big, expensive, risky bets that can massively
// expand the player base). Both are the studio working with a licensee or a
// production partner outside its own walls, which is why they live under
// Business.

import { MERCH_TYPES } from '../game/content/merch.js'
import { MEDIA_DEALS } from '../game/content/mediaDeals.js'
import Section from './nav/Section.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

const KIND_LABEL = { game: 'Games', anime: 'Anime', film: 'Film' }
const STAGE_LABEL = { pitched: 'Pitched — awaiting greenlight', greenlit: 'In production' }
const OUTCOME_LABEL = { hit: '🎉 Hit', flop: '💥 Flop', fell_through: 'Fell through' }

export default function VenturesPanel({ state, onLaunchMerch, onRefreshMerch, onRetireMerch, onPitchMedia }) {
  const reputation = state.franchise?.reputation ?? 0
  const merchLines = state.merchLines ?? []
  const mediaDeals = state.mediaDeals ?? []
  const resolvedHistory = mediaDeals.filter((d) => d.outcome).slice(-4).reverse()
  const activeMerch = merchLines.filter((m) => m.active).length
  const activeMedia = mediaDeals.filter((d) => !d.outcome).length

  return (
    <>
      <Section id="biz.merch" title="Merchandise" level={2} summary={`${activeMerch} lines live`}>
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
      </Section>

      <Section id="biz.media" title="Cross-media ventures" level={2} summary={`${activeMedia} in play`}>
        {['game', 'anime', 'film'].map((kind) => (
          <Section key={kind} id={`biz.media.${kind}`} title={KIND_LABEL[kind]} level={3}>
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
          </Section>
        ))}

        {resolvedHistory.length > 0 && (
          <Section id="biz.media.outcomes" title="Recent outcomes" level={3}>
            <ul className="feed">
              {resolvedHistory.map((d) => (
                <li key={d.id} className="feed__item">
                  {OUTCOME_LABEL[d.outcome] ?? d.outcome} — {MEDIA_DEALS.find((m) => m.id === d.dealId)?.name ?? d.dealId}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </Section>
    </>
  )
}
