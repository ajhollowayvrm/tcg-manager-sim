// The slim persistent strip: studio identity, the week, the cash figure, a
// couple of quick health readouts, and the one action every tab needs —
// advance the week. Design a Set moved to a Studio sub-tab (see App.jsx), so
// the strip no longer needs to launch it. The six health meters that used to
// sit here now live in the tabs that own them (see nav/Meter.jsx); Players
// and Satisfaction get a compact readout here too since they swing week to
// week and are worth a glance from anywhere. Most Popular Card reuses
// `state.movers[0]` — the single biggest weekly price mover, already computed
// and sorted by resolveMarket() (see game/market.js) for the Market Ticker —
// rather than a price leaderboard, which barely changes week to week and
// already lives on the Stats > Market tab. Keeps the `.topbar` class: its
// sticky and safe-area rules (and the iOS shell notes that reference them)
// are unchanged.

import { CASH_WARN, formatCash } from './Meter.jsx'
import { communitySentiment } from '../../game/simulation.js'
import { getConcept } from '../../game/content/concepts.js'

const PLAYERS_WARN = 2_000
const SATISFACTION_WARN = -70

export default function TopStrip({ game }) {
  const { state, advanceWeek, reset } = game
  const { week, cash, clock, lastRevenue, gameOver } = state
  const rev = lastRevenue?.total ?? 0
  const interest = state.lastDebtInterest ?? 0
  const concept = getConcept(state.config?.conceptId)
  const playerBase = state.playerBase
  const sentiment = communitySentiment(state.personas)
  const topMover = state.movers?.[0]

  return (
    <header className="topbar topbar--strip">
      <div className="topbar__brand" title={`${state.config?.companyName || ''} — ${concept.name} (${concept.resembles})`}>
        {state.config?.gameName || 'TCG Manager'}
        <span className="topbar__week">Week {week}</span>
      </div>

      <div
        className={'topbar__cash' + (cash < CASH_WARN ? ' is-danger' : '')}
        title={cash < 0 ? 'In debt — a loan, not fatal alone' : 'Cash on hand'}
      >
        <span className="topbar__cashval">{formatCash(cash)}</span>
        <span className="topbar__cashdelta">
          {cash < 0 && interest > 0 ? `−${formatCash(interest)}/wk interest` : rev > 0 ? `+${formatCash(rev)}/wk` : ''}
        </span>
      </div>

      {gameOver ? (
        <div className="topbar__over">
          <span className="topbar__overreason">💀 {gameOver.reason}</span>
          <button className="btn btn--newgame" onClick={reset}>New Game</button>
        </div>
      ) : (
        <>
          <div className="topbar__quickstats">
            <div className="topbar__quickstatgroup">
              <div className={'topbar__quickstat' + (playerBase < PLAYERS_WARN ? ' is-danger' : '')}>
                <span className="topbar__quickstatval">{playerBase.toLocaleString('en-US')}</span>
                <span className="topbar__quickstatlabel">Players</span>
              </div>
              <div className={'topbar__quickstat' + (sentiment != null && sentiment <= SATISFACTION_WARN ? ' is-danger' : '')}>
                <span className="topbar__quickstatval">{sentiment == null ? '—' : Math.round(sentiment)}</span>
                <span className="topbar__quickstatlabel">Satisfaction</span>
              </div>
            </div>
            {/* Centered in the space between Satisfaction and the strip's edge,
                rather than just tacked on after it — its own flex cell so
                centering doesn't shift Players/Satisfaction. */}
            <div className="topbar__quickstatcenter">
              <div
                className={'topbar__quickstat topbar__quickstat--card' + (topMover ? (topMover.pct >= 0 ? ' is-up' : ' is-down') : '')}
                title={topMover ? `${topMover.name} — biggest mover this week` : 'No notable price moves this week'}
              >
                <span className="topbar__quickstatval">
                  {topMover ? `${topMover.pct >= 0 ? '▲' : '▼'} ${(Math.abs(topMover.pct) * 100).toFixed(0)}%` : '—'}
                </span>
                <span className="topbar__quickstatlabel">{topMover ? topMover.name : 'Top Card'}</span>
              </div>
            </div>
          </div>
          <div className="topbar__time">
            <button className="btn btn--advance" onClick={advanceWeek}>Advance Week ▶</button>
          </div>
        </>
      )}

      {!gameOver && clock.reason && (
        <div className="topbar__reason">{clock.reason}</div>
      )}
    </header>
  )
}
