// The slim persistent strip: studio identity, the week, the cash figure, and
// the two actions the player needs from every tab — design a set, advance the
// week. The six health meters that used to sit here now live in the tabs that
// own them (see nav/Meter.jsx). Keeps the `.topbar` class: its sticky and
// safe-area rules (and the iOS shell notes that reference them) are unchanged.

import { CASH_WARN, formatCash } from './Meter.jsx'
import { getConcept } from '../../game/content/concepts.js'

export default function TopStrip({ game, onDesignSet }) {
  const { state, advanceWeek, reset } = game
  const { week, cash, clock, lastRevenue, gameOver } = state
  const rev = lastRevenue?.total ?? 0
  const interest = state.lastDebtInterest ?? 0
  const concept = getConcept(state.config?.conceptId)

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
