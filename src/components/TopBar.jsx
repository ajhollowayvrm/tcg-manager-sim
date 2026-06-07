// Persistent header: studio identity, the three death-spiral health meters, and
// the manual "Advance Week" control. Time is manual — each week is a click.

import { communitySentiment } from '../game/simulation.js'

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

// Loss thresholds (mirror simulation.js). A run ends when cash or player base
// hits 0, or community sentiment falls to the collapse line.
const SENTIMENT_COLLAPSE = -60
const CASH_WARN = 50_000
const PLAYERS_WARN = 2_000

export default function TopBar({ game, onDesignSet }) {
  const { state, advanceWeek, reset } = game
  const { week, cash, playerBase, clock, lastRevenue, gameOver } = state
  const rev = lastRevenue?.total ?? 0
  const sentiment = communitySentiment(state.personas)

  return (
    <header className="topbar">
      <div className="topbar__brand" title={state.config?.companyName || ''}>
        {state.config?.gameName || 'TCG Manager'}
        <span className="topbar__week">Week {week}</span>
      </div>

      {/* The three ways to lose, always visible. Each meter reddens as it nears
          its loss threshold so the player can see trouble coming. */}
      <div className="health" role="group" aria-label="Studio health">
        <Meter
          label="Cash"
          value={formatCash(cash)}
          // Cash has no fixed ceiling; gauge fills toward a comfortable ~$300k and
          // empties toward the $0 bankruptcy line.
          pct={clampPct((cash / 300_000) * 100)}
          danger={cash < CASH_WARN}
          loss="$0 = bankrupt"
          delta={rev > 0 ? `+${formatCash(rev)}/wk` : null}
        />
        <Meter
          label="Players"
          value={playerBase.toLocaleString('en-US')}
          pct={clampPct((playerBase / 15_000) * 100)}
          danger={playerBase < PLAYERS_WARN}
          loss="0 = community gone"
        />
        <Meter
          label="Satisfaction"
          value={sentiment == null ? '—' : Math.round(sentiment)}
          // Sentiment runs -100..100; collapse at -60. Map so the collapse line
          // sits near empty and a happy community fills the bar.
          pct={sentiment == null ? 50 : clampPct(((sentiment - SENTIMENT_COLLAPSE) / (100 - SENTIMENT_COLLAPSE)) * 100)}
          danger={sentiment != null && sentiment <= -35}
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
