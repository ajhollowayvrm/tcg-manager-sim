// Live secondary-market ticker. Highlights this week's movers with color and a
// pop/flop pulse, and lists every tracked single with a sparkline plus its
// sealed price. This is where the color budget pays off (see BRIEF.md).
//
// Two boards, because they answer different questions. The HOT board is the top
// singles by price with their sparklines — "what is this market about right
// now". Behind it, "show all" prices EVERY card in print, which is the only
// place a player can compare a variant against the base printing it reprints:
// they share a name, so a list that shows names alone shows one card twice.
// The full board drops the sparklines — a late run holds thousands of cards,
// and an SVG per row is what makes that list crawl.

import { useState } from 'react'
import SetSymbol from './SetSymbol.jsx'
import { visualTier, printingOf } from '../game/rarities.js'

// How many singles the hot board shows before "show all" takes over.
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
  const [showAll, setShowAll] = useState(false)
  const hasCards = state.cards.length > 0
  const moverPct = new Map((state.movers ?? []).map((m) => [m.id, m.pct]))
  const week = state.week

  // Look up each card's set (theme for the symbol, rarity sheet for the foil).
  const setById = new Map(state.sets.map((s) => [s.id, s]))

  // Sort by price desc so the chase cards sit on top.
  const ranked = [...state.cards].sort((a, b) => b.singlePrice - a.singlePrice)
  const cards = showAll ? ranked : ranked.slice(0, MAX_ROWS)

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
              const set = setById.get(card.setId)
              // Out-of-print (pulled) cards read as "out of print" even though
              // they carry the rotated flag internally; banned and legacy-rotated
              // keep their own labels.
              const status = card.banned ? 'banned'
                : (card.outOfPrint || set?.outOfPrint) ? 'outofprint'
                : card.rotated ? 'rotated' : null
              const statusLabel = status === 'outofprint' ? 'out of print' : status
              const tier = visualTier(set?.rarities, card.rarity)
              const printing = printingOf(set?.rarities, card.rarity)
              return (
                <li key={key} className={`ticker__row${dir}${big}${status ? ' ticker__row--' + status : ''}`}>
                  <span className={`ticker__name rarity--${tier}`}>
                    <SetSymbol themeId={set?.themeId} tier={tier} size={14} />
                    {card.name}
                    {printing.isVariant && (
                      <span className="tag tag--variant" title={`${printing.variantName} — a separate printing of this card`}>
                        {printing.variantName}
                      </span>
                    )}
                    {card.serialCap && (
                      <span className="tag tag--serial" title="A hard-capped serialized chase card">
                        {card.serialIssued}/{card.serialCap}
                      </span>
                    )}
                    {card.graded && (
                      <span className="tag tag--graded" title="Certified by a grading partner — population is how many submitted copies exist">
                        ✅ graded{card.gradedPopulation > 1 ? ` ×${card.gradedPopulation}` : ''}
                      </span>
                    )}
                    {status && <span className={`tag tag--${status}`}>{statusLabel}</span>}
                  </span>
                  {!showAll && <Sparkline history={card.priceHistory} />}
                  <span className="ticker__scarcity">
                    <span className="ticker__sealed" title="Sealed price">📦 {fmt(card.sealedPrice)}</span>
                    {card.legacyValue > 0 && (
                      <span className="ticker__legacy" title="Premium from your franchise's growing reputation — this vintage card is appreciating on its own">
                        🏛 +{fmt(card.legacyValue)}
                      </span>
                    )}
                  </span>
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

          {ranked.length > MAX_ROWS && (
            <button
              type="button"
              className="ticker__more"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? `Show top ${MAX_ROWS}`
                : `Show all ${ranked.length.toLocaleString('en-US')} cards`}
            </button>
          )}
        </>
      ) : (
        <p className="panel__empty">No cards on the market yet. Release a set to get things moving.</p>
      )}
    </div>
  )
}
