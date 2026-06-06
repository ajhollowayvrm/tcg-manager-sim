// Live secondary-market ticker. Surfaces movers with color when cards pop/flop.
// Stub until the market model lands — renders cards once they exist.

export default function MarketTicker({ state }) {
  const hasCards = state.cards.length > 0

  return (
    <div className="panel">
      <h2 className="panel__title">Market Ticker</h2>
      {hasCards ? (
        <ul className="ticker">
          {state.cards.map((card) => (
            <li key={card.id} className="ticker__row">
              <span className="ticker__name">{card.name}</span>
              <span className="ticker__price">${card.singlePrice ?? '—'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__empty">No cards on the market yet. Release a set to get things moving.</p>
      )}
    </div>
  )
}
