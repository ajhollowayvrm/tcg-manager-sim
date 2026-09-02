// Stats › Scalp Watch — what the resale market is doing to your product. The
// scalper-heat meter, every live set's sealed price against its MSRP, the
// singles trading furthest above their set's shelf price, and the stances in
// force. Read-only: the levers live under Business › Distribution.

import { SCALPER_THRESHOLD } from '../game/distributors.js'
import { DISTRIBUTORS } from '../game/content/distributors.js'
import Section from './nav/Section.jsx'
import { HeatMeter } from './nav/Meter.jsx'

function money(n) {
  return '$' + (n ?? 0).toFixed(2)
}

export default function ScalpWatchPanel({ state }) {
  const heat = Math.round(state.scalperHeat ?? 0)
  const liveSets = (state.sets ?? []).filter((s) => !s.rotated && !s.outOfPrint)
  const dealsBySet = new Map()
  for (const d of state.distributors ?? []) {
    if (!d.active) continue
    dealsBySet.set(d.setId, (dealsBySet.get(d.setId) ?? 0) + (d.units ?? 0))
  }

  // Sealed price per set: the mean of its live cards' sealedPrice, the same
  // field the ticker shows per card.
  const rows = liveSets.map((s) => {
    const cards = (state.cards ?? []).filter((c) => c.setId === s.id && !c.banned && !c.rotated && c.sealedPrice > 0)
    const sealed = cards.length ? cards.reduce((sum, c) => sum + c.sealedPrice, 0) / cards.length : 0
    const msrp = s.price ?? 0
    return { id: s.id, name: s.name, msrp, sealed, ratio: msrp > 0 && sealed > 0 ? sealed / msrp : null, flooded: dealsBySet.get(s.id) ?? 0 }
  }).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))

  const setById = new Map(liveSets.map((s) => [s.id, s]))
  const topSingles = (state.cards ?? [])
    .filter((c) => !c.banned && !c.rotated && !c.promo && setById.has(c.setId))
    .sort((a, b) => b.singlePrice - a.singlePrice)
    .slice(0, 10)

  const activeDeals = (state.distributors ?? []).filter((d) => d.active)

  return (
    <>
      <Section id="stats.scalp" title="Scalp watch" level={2} summary={`heat ${heat}`}>
        <div className="meters">
          <HeatMeter state={state} />
        </div>
        <p className="field__note">
          {heat >= SCALPER_THRESHOLD
            ? 'Scalper culture is active: singles spike, casual players get priced out, and the bubble can pop.'
            : `Below ${SCALPER_THRESHOLD} the resale market is a nuisance, not a culture. Bulk deals and big-box channel mix push it up; time and purchase limits bring it down.`}
        </p>
        <ul className="feed">
          <li className="feed__item">Purchase limits per channel: <strong>{state.purchaseLimitPolicy ? 'on' : 'off'}</strong></li>
          <li className="feed__item">Phantom stock: <strong>{state.phantomStockPolicy ? 'on' : 'off'}</strong></li>
          <li className="feed__item">
            Bulk deals live: <strong>{activeDeals.length}</strong>
            {activeDeals.length > 0 && (
              <> — {activeDeals.map((d) => DISTRIBUTORS.find((x) => x.id === d.id)?.name ?? d.id).join(', ')}</>
            )}
          </li>
        </ul>
      </Section>

      <Section id="stats.scalp.sealed" title="Sealed against MSRP" level={2}>
        {rows.length === 0 ? (
          <p className="panel__empty">Nothing in print to watch yet.</p>
        ) : (
          <ul className="ledger__sets">
            {rows.map((r) => (
              <li key={r.id} className="ledger__set">
                <span className="ledger__setname">{r.name}</span>
                <span className="ledger__setunits">
                  MSRP {money(r.msrp)}{r.flooded > 0 ? ` · ${r.flooded.toLocaleString('en-US')} bulk units` : ''}
                </span>
                <span className={'ledger__setrev' + (r.ratio != null && r.ratio >= 1.5 ? ' is-hot' : '')}>
                  {r.sealed > 0 ? `${money(r.sealed)} · ${r.ratio.toFixed(2)}×` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="field__note">
          Sealed price is the resale price of a pack from that set. Above 1.5× MSRP
          the shelf is being cleared for resale, not for play.
        </p>
      </Section>

      <Section id="stats.scalp.singles" title="Singles above the shelf" level={2} defaultOpen={false}>
        {topSingles.length === 0 ? (
          <p className="panel__empty">No live singles yet.</p>
        ) : (
          <ul className="ledger__sets">
            {topSingles.map((c) => {
              const set = setById.get(c.setId)
              const msrp = set?.price ?? 0
              return (
                <li key={c.id} className="ledger__set">
                  <span className="ledger__setname">{c.name}</span>
                  <span className="ledger__setunits">{set?.name}</span>
                  <span className="ledger__setrev">
                    {money(c.singlePrice)}{msrp > 0 ? ` · ${(c.singlePrice / msrp).toFixed(1)}× a pack` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </>
  )
}
