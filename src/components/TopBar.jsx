// Persistent header: studio identity, the three death-spiral health meters, and
// the manual "Advance Week" control. Time is manual — each week is a click.

import { communitySentiment } from '../game/simulation.js'

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

// Loss framing (mirror simulation.js). Cash, players, and satisfaction are
// RECOVERABLE pressures, not instant-death lines. Cash can go negative (a loan);
// only a runaway debt spiral (past DEBT_RUIN) or broke-AND-abandoned is fatal.
// Satisfaction runs -100..100 and only a total revolt at -100 ends a run.
const SENTIMENT_COLLAPSE = -100
const DEBT_RUIN = -3_000_000
const CASH_WARN = 50_000      // cash dipping low (still survivable)
const PLAYERS_WARN = 2_000    // a thin base (recoverable)

export default function TopBar({ game, onDesignSet }) {
  const { state, advanceWeek, reset } = game
  const { week, cash, playerBase, clock, lastRevenue, gameOver } = state
  const rev = lastRevenue?.total ?? 0
  const interest = state.lastDebtInterest ?? 0
  const sentiment = communitySentiment(state.personas)

  return (
    <header className="topbar">
      <div className="topbar__brand" title={state.config?.companyName || ''}>
        {state.config?.gameName || 'TCG Manager'}
        <span className="topbar__week">Week {week}</span>
      </div>

      {/* The recoverable pressures, always visible. Each meter reddens as it
          nears trouble; the actual losses (debt spiral, broke+abandoned, total
          revolt) live in the game-over logic. */}
      <div className="health" role="group" aria-label="Studio health">
        <Meter
          label="Cash"
          value={formatCash(cash)}
          // In the black, fills toward a comfortable ~$300k. In the red, it's a
          // loan: the gauge DRAINS from ~empty toward 0 as the debt deepens to the
          // ruin line (just-negative ≈ a sliver, −$3M = empty). No jump at zero.
          pct={cash >= 0
            ? clampPct((cash / 300_000) * 100)
            : clampPct((1 - cash / DEBT_RUIN) * 8)}
          danger={cash < CASH_WARN}
          loss={cash < 0 ? 'debt — a loan, not fatal alone' : 'negative = a loan'}
          // In the black, show weekly revenue; in the red, show the debt interest.
          delta={cash < 0 && interest > 0 ? `−${formatCash(interest)}/wk interest`
            : rev > 0 ? `+${formatCash(rev)}/wk` : null}
        />
        <Meter
          label="Players"
          value={playerBase.toLocaleString('en-US')}
          pct={clampPct((playerBase / 15_000) * 100)}
          danger={playerBase < PLAYERS_WARN}
          loss="recoverable — grow it back"
        />
        <Meter
          label="Satisfaction"
          value={sentiment == null ? '—' : Math.round(sentiment)}
          // Sentiment runs -100..100; only the -100 floor ends a run. Map so the
          // floor sits at empty and a happy community fills the bar.
          pct={sentiment == null ? 50 : clampPct(((sentiment - SENTIMENT_COLLAPSE) / (100 - SENTIMENT_COLLAPSE)) * 100)}
          danger={sentiment != null && sentiment <= -70}
          loss={`${SENTIMENT_COLLAPSE} = revolt`}
        />
      </div>

      {gameOver ? (
        <div className="topbar__over">
          <span className="topbar__overreason">💀 {gameOver.reason}</span>
          <button className="btn btn--newgame" onClick={reset}>New Game</button>
        </div>
      ) : (
        <div className="topbar__time">
          <button className="btn btn--design" onClick={onDesignSet}>+ Design a Set</button>
          <button className="btn btn--advance" onClick={advanceWeek}>Advance Week ▶</button>
        </div>
      )}

      {!gameOver && clock.reason && (
        <div className="topbar__reason">{clock.reason}</div>
      )}
    </header>
  )
}

// One health meter: a label, the current value, a fill bar that reddens in the
// danger zone, and the loss threshold as a hint.
function Meter({ label, value, pct, danger, loss, delta }) {
  return (
    <div className={'meter' + (danger ? ' meter--danger' : '')} title={`Loss: ${loss}`}>
      <div className="meter__top">
        <span className="meter__label">{label}</span>
        <span className="meter__value">{value}</span>
      </div>
      <div className="meter__track">
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="meter__foot">
        {delta && <span className="meter__delta">{delta}</span>}
        <span className="meter__loss">{loss}</span>
      </div>
    </div>
  )
}

function clampPct(p) {
  return Math.min(100, Math.max(0, p))
}
