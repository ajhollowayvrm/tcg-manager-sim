// Live secondary-market ticker. Highlights this week's movers with color and a
// pop/flop pulse, and lists every tracked single with a sparkline plus its
// sealed price. This is where the color budget pays off (see BRIEF.md).

import SetSymbol from './SetSymbol.jsx'
import { visualTier } from '../game/rarities.js'

// Sets can now run to hundreds of cards — show only the most valuable singles so
// the ticker stays a "what's hot" board, not a spreadsheet.
const MAX_ROWS = 12

function fmt(n) {
  return n != null ? `$${n.toFixed(2)}` : '—'
}

function Sparkline({ history }) {
  if (!history || history.length < 2) return <span className="spark spark--flat" />
  const w = 60
  const h = 18
  const min = Math.min(...history)
  const max = Math.max(...history)
  const span = max - min || 1
  const step = w / (history.length - 1)
  const pts = history
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ')
  const up = history[history.length - 1] >= history[0]
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? 'var(--good)' : 'var(--bad)'} strokeWidth="1.5" />
    </svg>
  )
}

export default function MarketTicker({ state }) {
  const hasCards = state.cards.length > 0
  const moverPct = new Map((state.movers ?? []).map((m) => [m.id, m.pct]))
  const week = state.week

  // Look up each card's set (theme for the symbol, rarity sheet for the foil).
  const setById = new Map(state.sets.map((s) => [s.id, s]))

  // Sort by price desc so the chase cards sit on top; cap to the top movers/value.
  const cards = [...state.cards].sort((a, b) => b.singlePrice - a.singlePrice).slice(0, MAX_ROWS)

  return (
    <div className="panel">
      <h2 className="panel__title">Market Ticker</h2>

      {hasCards ? (
        <>
          {state.movers?.length > 0 && (
            <div className="movers">
              {state.movers.map((m) => {
                const dir = m.pct >= 0 ? 'up' : 'down'
                return (
                  <span key={m.id} className={`chip chip--${dir}`}>
                    {m.name} {m.pct >= 0 ? '▲' : '▼'} {(Math.abs(m.pct) * 100).toFixed(0)}%
                  </span>
                )
              })}
            </div>
          )}

          <ul className="ticker">
            {cards.map((card) => {
              const pct = moverPct.get(card.id)
              const dir = pct == null ? '' : pct >= 0 ? ' is-up' : ' is-down'
              // A big move gets extra visual punch (stronger flash + glow).
              const big = pct != null && Math.abs(pct) >= 0.2 ? ' is-big' : ''
              // Movers get a week-stamped key so the flash animation re-fires
              // every week the card moves (React remounts only the ≤8 movers).
              const key = pct == null ? card.id : `${card.id}-${week}`
              const status = card.banned ? 'banned' : card.rotated ? 'rotated' : null
              const set = setById.get(card.setId)
              const tier = visualTier(set?.rarities, card.rarity)
              return (
                <li key={key} className={`ticker__row${dir}${big}${status ? ' ticker__row--' + status : ''}`}>
                  <span className={`ticker__name rarity--${tier}`}>
                    <SetSymbol themeId={set?.themeId} tier={tier} size={14} />
                    {card.name}
                    {status && <span className={`tag tag--${status}`}>{status}</span>}
                  </span>
                  <Sparkline history={card.priceHistory} />
                  <span className="ticker__sealed" title="Sealed price">📦 {fmt(card.sealedPrice)}</span>
                  <span className="ticker__price">
                    {fmt(card.singlePrice)}
                    {pct != null && (
                      <span className="ticker__pct">{pct >= 0 ? '+' : ''}{(pct * 100).toFixed(0)}%</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="panel__empty">No cards on the market yet. Release a set to get things moving.</p>
      )}
    </div>
  )
}
