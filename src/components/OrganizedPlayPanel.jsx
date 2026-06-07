// Organized Play panel — fund tournaments, leagues, and prerelease events to
// support the competitive scene. Each program costs cash, grows the competitive
// player base, warms community sentiment, and mints an UNPULLABLE promo prize
// card that enters the market as a scarce, prestigious chase.

import { OP_PROGRAMS } from '../game/organizedplay.js'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function OrganizedPlayPanel({ state, onRun }) {
  const cash = state.cash ?? 0
  // The promos you've issued so far (unpullable cards), most valuable first.
  const promos = state.cards
    .filter((c) => c.promo)
    .sort((a, b) => (b.singlePrice ?? 0) - (a.singlePrice ?? 0))

  return (
    <div className="panel">
      <h2 className="panel__title">Organized Play</h2>

      <ul className="op__list">
        {Object.values(OP_PROGRAMS).map((prog) => {
          const affordable = cash >= prog.cost
          return (
            <li key={prog.kind} className="op">
              <div className="op__head">
                <span className="op__name">{prog.name}</span>
                <span className="op__cost">{fmtCash(prog.cost)}</span>
              </div>
              <p className="op__blurb">{prog.blurb}</p>
              <button
                className="btn btn--design op__run"
                disabled={!affordable}
                onClick={() => onRun(prog.kind)}
                title={affordable ? 'Run this program — mints a promo + boosts the scene' : 'Not enough cash'}
              >
                Run {prog.name}
              </button>
            </li>
          )
        })}
      </ul>

      {promos.length > 0 && (
        <div className="op__promos">
          <div className="op__promostitle">Promo cards issued ({promos.length})</div>
          <ul className="op__promolist">
            {promos.slice(0, 6).map((c) => (
              <li key={c.id} className="op__promo">
                <span className="op__promoname">{c.name}</span>
                <span className="op__promoprice">${(c.singlePrice ?? 0).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
