// Bans & Rotation — the player's format-management levers.
// Ban pressure is the SIGNAL the player reads (it accrues from credible
// pros/theorycrafters calling a card broken), but it's noisy and the blowback
// is unpredictable — banning a fine card the loud crowd hated backfires.

function fmt(n) {
  return '$' + n.toFixed(2)
}

function pressureClass(p) {
  if (p >= 60) return 'pressure--hot'
  if (p >= 30) return 'pressure--warm'
  return 'pressure--cool'
}

export default function BansPanel({ state, onBan, onRotate }) {
  const live = state.cards.filter((c) => !c.banned && !c.rotated)
  const liveSets = state.sets.filter((s) => !s.rotated)
  const oldest = liveSets.length
    ? [...liveSets].sort((a, b) => a.releasedWeek - b.releasedWeek)[0]
    : null
  const canRotate = liveSets.length >= 2 // keep at least one set in the format

  // Most ban pressure first — that's where the community is pointing.
  const sorted = [...live].sort((a, b) => (b.banPressure ?? 0) - (a.banPressure ?? 0))

  return (
    <div className="panel">
      <h2 className="panel__title">Bans &amp; Rotation</h2>

      {sorted.length === 0 ? (
        <p className="panel__empty">No cards in the format yet.</p>
      ) : (
        <ul className="bans">
          {sorted.map((card) => {
            const p = Math.round(card.banPressure ?? 0)
            return (
              <li key={card.id} className="bans__row">
                <div className="bans__info">
                  <span className={`bans__name rarity--${card.rarity}`}>{card.name}</span>
                  <span className="bans__price">{fmt(card.singlePrice)}</span>
                </div>
                <div className="bans__pressure" title={`Ban pressure ${p}/100`}>
                  <span className="bans__track">
                    <span className={`bans__fill ${pressureClass(p)}`} style={{ width: `${p}%` }} />
                  </span>
                  <span className="bans__pval">{p}</span>
                </div>
                <button
                  className="btn btn--ban"
                  onClick={() => onBan(card.id)}
                  title="Ban this card — blowback depends on whether the community agrees it's a problem"
                >
                  Ban
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="bans__rotate">
        <div className="bans__rotateinfo">
          {oldest ? (
            <>Oldest live set: <strong>{oldest.name}</strong> (wk {oldest.releasedWeek})</>
          ) : (
            'No sets to rotate.'
          )}
        </div>
        <button
          className="btn btn--rotate"
          disabled={!canRotate}
          onClick={() => onRotate(1)}
          title={canRotate ? 'Rotate out the oldest set — restores diversity, resets power creep, angers collectors' : 'Need at least two sets in the format to rotate'}
        >
          Rotate Format
        </button>
      </div>
    </div>
  )
}
