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

import { useState } from 'react'

export default function BansPanel({ state, onBan, onPull }) {
  const live = state.cards.filter((c) => !c.banned && !c.rotated)
  // Sets still in print & in the format are the ones you can pull.
  const inPrintSets = state.sets.filter((s) => !s.rotated && !s.outOfPrint)
  const [pickedPull, setPickedPull] = useState(null)
  const pullSetId = pickedPull && inPrintSets.some((s) => s.id === pickedPull)
    ? pickedPull
    : inPrintSets[0]?.id
  const canPull = inPrintSets.length >= 2 // keep at least one set in print

  // Sets can be hundreds of cards — only surface ban CANDIDATES: anything drawing
  // real ban pressure, else the strongest cards (what you'd consider banning).
  // Most ban pressure first — that's where the community is pointing.
  const pressured = live.filter((c) => (c.banPressure ?? 0) > 0)
  const pool = pressured.length
    ? pressured
    : [...live].sort((a, b) => b.popFactors.playability - a.popFactors.playability).slice(0, 10)
  const sorted = [...pool].sort((a, b) => (b.banPressure ?? 0) - (a.banPressure ?? 0)).slice(0, 12)

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

      <div className="bans__pull">
        <div className="bans__pulllabel">
          Pull a set from publication
          <span className="muted"> — stops printing it; its singles spike on scarcity, collectors cheer, and the format refreshes. A prime reprint candidate later.</span>
        </div>
        <div className="bans__pullrow">
          {inPrintSets.length > 0 ? (
            <select value={pullSetId} onChange={(e) => setPickedPull(e.target.value)}>
              {inPrintSets.map((s) => (
                <option key={s.id} value={s.id}>{s.name} (wk {s.releasedWeek})</option>
              ))}
            </select>
          ) : (
            <span className="bans__pullnone">No sets in print.</span>
          )}
          <button
            className="btn btn--rotate"
            disabled={!canPull}
            onClick={() => onPull(pullSetId)}
            title={canPull ? 'Pull this set from publication — scarcity pop + collector goodwill + format refresh; you forfeit its future pack sales' : 'Need at least two sets in print to pull one'}
          >
            Pull from print
          </button>
        </div>
      </div>
    </div>
  )
}
