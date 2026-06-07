// Distributors panel — sign bulk-buyer clients to move volume of a live set for
// cash now, at the cost of a market flood and rising scalper heat. Shows the
// heat gauge (and the scalper-culture warning when it's hot), the roster of
// distributors with their terms, and active-deal controls (cultivate / drop).

import { useState } from 'react'
import { DISTRIBUTORS } from '../game/content/distributors.js'
import { SCALPER_THRESHOLD } from '../game/distributors.js'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function DistributorsPanel({ state, onSign, onCultivate, onDrop }) {
  const liveSets = state.sets.filter((s) => !s.rotated && (s.supply ?? 0) - (s.sold ?? 0) > 0)
  const [pickedSet, setPickedSet] = useState(null)
  const setId = pickedSet && liveSets.some((s) => s.id === pickedSet) ? pickedSet : liveSets[0]?.id

  const heat = Math.round(state.scalperHeat ?? 0)
  const scalping = heat >= SCALPER_THRESHOLD
  const dealsById = new Map((state.distributors ?? []).filter((d) => d.active).map((d) => [d.id, d]))

  return (
    <div className="panel">
      <h2 className="panel__title">Distributors</h2>

      {/* Scalper heat gauge */}
      <div className={'scalp' + (scalping ? ' scalp--hot' : '')}>
        <div className="scalp__row">
          <span className="scalp__label">Scalper heat</span>
          <span className="scalp__val">{heat}</span>
        </div>
        <div className="scalp__track">
          <div className="scalp__fill" style={{ width: `${heat}%` }} />
          <div className="scalp__thresh" style={{ left: `${SCALPER_THRESHOLD}%` }} title="Scalper culture activates here" />
        </div>
        {scalping && (
          <p className="scalp__warn">
            ⚠ Scalper culture is active. Singles are spiking — but casual players are being priced
            out, your reputation is souring, and the bubble could pop.
          </p>
        )}
      </div>

      {liveSets.length === 0 ? (
        <p className="panel__empty">Release a set with stock on the shelf to sign a distributor.</p>
      ) : (
        <div className="distrib__signbar">
          <span className="distrib__signlabel">Wholesale set:</span>
          <select value={setId} onChange={(e) => setPickedSet(e.target.value)}>
            {liveSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({((s.supply ?? 0) - (s.sold ?? 0)).toLocaleString('en-US')} left)
              </option>
            ))}
          </select>
        </div>
      )}

      <ul className="distrib__list">
        {DISTRIBUTORS.map((d) => {
          const deal = dealsById.get(d.id)
          const set = state.sets.find((s) => s.id === setId)
          const remaining = set ? (set.supply ?? 0) - (set.sold ?? 0) : 0
          const units = Math.round(remaining * d.appetite)
          const revenue = set ? units * set.price * d.discount : 0
          return (
            <li key={d.id} className={'distrib' + (deal ? ' distrib--active' : '')}>
              <div className="distrib__head">
                <span className="distrib__name">{d.name}</span>
                <span className="distrib__flood" title="How hard they flood the resale market">
                  {'🔥'.repeat(d.flood > 0.7 ? 3 : d.flood > 0.4 ? 2 : 1)}
                </span>
              </div>
              <p className="distrib__blurb">{d.blurb}</p>
              <div className="distrib__terms">
                <span>{Math.round(d.discount * 100)}% MSRP</span>
                <span>·</span>
                <span>buys {Math.round(d.appetite * 100)}% of stock</span>
              </div>
              {deal ? (
                <div className="distrib__actions">
                  <span className="distrib__signed">
                    Signed · rel {Math.round(deal.relationship ?? 0)}
                  </span>
                  <button className="btn btn--ghost" onClick={() => onCultivate(d.id)}>Cultivate</button>
                  <button className="btn btn--ghost distrib__drop" onClick={() => onDrop(d.id)}>Drop</button>
                </div>
              ) : (
                <button
                  className="btn btn--design distrib__sign"
                  disabled={!set || units <= 0}
                  onClick={() => onSign(d.id, setId)}
                >
                  Sign — {fmtCash(revenue)} for {units.toLocaleString('en-US')} units
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
