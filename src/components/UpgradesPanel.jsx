// Misc › Upgrades — permanent-for-the-run investments bought with cash. See
// upgrades.js and content/upgrades.js. Supply-chain capacity keeps its own
// state (distributors.js) but is listed here so every upgrade has one home.

import { UPGRADES } from '../game/content/upgrades.js'
import { upgradeLevel, upgradeCost } from '../game/upgrades.js'
import Section from './nav/Section.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function UpgradesPanel({ state, onPurchase, onUpgradeSupplyChain }) {
  const capacity = Math.round(state.supplyChainCapacity ?? 40)
  const capacityCost = Math.round(15_000 + capacity * 900)
  const owned = UPGRADES.filter((u) => !u.special && upgradeLevel(state, u.id) > 0).length

  return (
    <Section id="misc.upgrades" title="Studio upgrades" level={2} summary={`${owned} bought`}>
      <p className="panel__lede">
        Each one is a permanent discount on a cost or a risk for the rest of the
        run. Prices climb with every level and with the studio's reputation.
      </p>
      <ul className="distrib__list">
        {UPGRADES.map((u) => {
          if (u.special === 'supply') {
            return (
              <li key={u.id} className={'distrib' + (capacity > 40 ? ' distrib--active' : '')}>
                <div className="distrib__head">
                  <span className="distrib__name">{u.name}</span>
                  <span className="distrib__flood">{capacity}/100</span>
                </div>
                <p className="distrib__blurb">{u.blurb}</p>
                <div className="scalp__track" style={{ marginBottom: 8 }}>
                  <div className="scalp__fill" style={{ width: `${capacity}%` }} />
                </div>
                <button
                  className="btn btn--design distrib__sign"
                  disabled={capacity >= 100}
                  onClick={onUpgradeSupplyChain}
                >
                  {capacity >= 100 ? 'At full capacity' : `+10 capacity — ${fmtCash(capacityCost)}`}
                </button>
              </li>
            )
          }
          const level = upgradeLevel(state, u.id)
          const maxed = level >= u.max
          return (
            <li key={u.id} className={'distrib' + (level > 0 ? ' distrib--active' : '')}>
              <div className="distrib__head">
                <span className="distrib__name">{u.name}</span>
                <span className="distrib__flood" title={`Level ${level} of ${u.max}`}>
                  {'●'.repeat(level)}{'○'.repeat(u.max - level)}
                </span>
              </div>
              <p className="distrib__blurb">{u.blurb}</p>
              <div className="distrib__terms">
                <span>{level > 0 ? u.effect(level) : 'not bought'}</span>
                {!maxed && (
                  <>
                    <span>·</span>
                    <span>next: {u.effect(level + 1)}</span>
                  </>
                )}
              </div>
              <button
                className="btn btn--design distrib__sign"
                disabled={maxed}
                onClick={() => onPurchase(u.id)}
              >
                {maxed ? 'Fully upgraded' : `Buy level ${level + 1} — ${fmtCash(upgradeCost(state, u.id))}`}
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
