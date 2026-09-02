// Business › Distribution — sign bulk-buyer clients to move volume of a live
// set for cash now, at the cost of a market flood and rising scalper heat.
// Shows the heat gauge (and the scalper-culture warning when it's hot), the
// anti-scalping stances, the rival that competes for the same shelf space, and
// the roster of distributors with active-deal controls (cultivate / drop).

import { useState } from 'react'
import { DISTRIBUTORS } from '../game/content/distributors.js'
import { SCALPER_THRESHOLD } from '../game/distributors.js'
import Section from './nav/Section.jsx'
import { RivalMeter } from './nav/Meter.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function DistributionPanel({
  state, onSign, onCultivate, onDrop, onUpgradeSupplyChain,
  onTogglePurchaseLimits, onTogglePhantomStock,
}) {
  const liveSets = state.sets.filter((s) => !s.rotated && (s.supply ?? 0) - (s.sold ?? 0) > 0)
  const [pickedSet, setPickedSet] = useState(null)
  const setId = pickedSet && liveSets.some((s) => s.id === pickedSet) ? pickedSet : liveSets[0]?.id

  const heat = Math.round(state.scalperHeat ?? 0)
  const scalping = heat >= SCALPER_THRESHOLD
  const dealsById = new Map((state.distributors ?? []).filter((d) => d.active).map((d) => [d.id, d]))
  const capacity = Math.round(state.supplyChainCapacity ?? 40)
  const capacityCost = Math.round(15_000 + capacity * 900)
  const activeCount = dealsById.size

  return (
    <>
      <Section id="biz.distributors" title="Distributors" level={2} summary={`${activeCount} active`}>
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
      </Section>

      <Section id="biz.policy" title="Anti-scalping policy" level={2}>
        {/* TPCi's real playbook: purchase limits per channel, and phantom
            stock. Free toggles, each a real tradeoff. */}
        <div className="scalp">
          <label className="check" title="Caps how much of a set any single distributor deal can buy — smaller deals, but they feed scalper heat less too">
            <input type="checkbox" checked={!!state.purchaseLimitPolicy} onChange={onTogglePurchaseLimits} />
            Purchase limits per channel
          </label>
          <label className="check" title="Shows 'sold out' before stock is truly gone to deter bots — some genuine customers bounce off the fake sign too">
            <input type="checkbox" checked={!!state.phantomStockPolicy} onChange={onTogglePhantomStock} />
            Phantom stock
          </label>
        </div>

        {/* Supply-chain capacity — a logistics investment that makes print/supply
            snags rarer and cheaper. */}
        {onUpgradeSupplyChain && (
          <div className="scalp">
            <div className="scalp__row">
              <span className="scalp__label">Supply-chain capacity</span>
              <span className="scalp__val">{capacity}</span>
            </div>
            <div className="scalp__track">
              <div className="scalp__fill" style={{ width: `${capacity}%` }} />
            </div>
            <button
              className="btn btn--ghost"
              disabled={capacity >= 100}
              onClick={onUpgradeSupplyChain}
              title="Invest in logistics — fewer and lighter print/shipping snags"
            >
              {capacity >= 100 ? 'At full capacity' : `Upgrade (+10) — ${fmtCash(capacityCost)}`}
            </button>
          </div>
        )}
      </Section>

      <Section id="biz.rival" title="Shelf rivalry" level={2}>
        <div className="meters">
          <RivalMeter state={state} />
        </div>
        <p className="field__note">
          An ambient competitor for the same shelf space. It grows while your
          shelf goes quiet and bites your casual base when it drops a set of its
          own. There is no lever here yet — a steady cadence is the counter.
        </p>
      </Section>
    </>
  )
}
