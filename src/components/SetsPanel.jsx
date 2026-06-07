// Sets in print — sealed sell-through per set. Makes the print-run decision
// legible: a set selling near 100% sold out (under-printed → lost sales), one
// stuck low has unsold stock (over-printed → bargain bins).

import SetSymbol from './SetSymbol.jsx'
import { reprintCost } from '../game/sets.js'

const REPRINT_RUN = 55 // matches the reducer's default reprint print run

// Short labels for the per-SKU sell-through chips.
const SKU_LABEL = { booster: '📦', bundle: 'Bundle', spc: 'SPC', tin: 'Tin' }

function pctStr(sold, supply) {
  if (!supply) return '0%'
  return Math.round(Math.min(100, (sold / supply) * 100)) + '%'
}

function compact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

export default function SetsPanel({ state, onReprint }) {
  const sets = state.sets
  const lastPerSet = new Map((state.lastRevenue?.perSet ?? []).map((p) => [p.id, p]))

  return (
    <div className="panel">
      <h2 className="panel__title">Sets in Print</h2>
      {sets.length === 0 ? (
        <p className="panel__empty">No sets released yet.</p>
      ) : (
        <ul className="sets">
          {sets.map((set) => {
            const supply = set.supply ?? 0
            const sold = set.sold ?? 0
            const pct = supply > 0 ? clampPct((sold / supply) * 100) : 0
            const soldOut = supply > 0 && sold >= supply
            const wk = lastPerSet.get(set.id)
            return (
              <li key={set.id} className={'sets__row' + (set.rotated && !set.outOfPrint ? ' sets__row--rotated' : '') + (set.outOfPrint ? ' sets__row--oop' : '')}>
                <div className="sets__head">
                  <span className="sets__name">
                    <SetSymbol themeId={set.themeId} rarity="rare" size={15} />
                    {set.name}
                    {set.firstEdition && <span className="tag tag--outofprint" title="Original printing — a permanent premium tier">1st ed</span>}
                    {set.outOfPrint
                      ? <span className="tag tag--outofprint">out of print</span>
                      : set.rotated && <span className="tag tag--rotated">rotated</span>}
                    {soldOut && !set.rotated && <span className="tag tag--soldout">sold out</span>}
                  </span>
                  <span className="sets__wk">
                    {wk ? `+$${wk.revenue.toLocaleString('en-US')}` : set.rotated ? 'out of print' : '—'}
                  </span>
                </div>
                <div className="sets__track" title={`${sold.toLocaleString()} / ${supply.toLocaleString()} packs sold`}>
                  <span className="sets__fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="sets__meta">
                  <span>{compact(sold)} / {compact(supply)} packs · ${set.price.toFixed(2)} MSRP</span>
                  {/* Reprint: re-issue as an Unlimited run. Available for any
                      original printing (not a reprint itself). Highlighted for
                      out-of-print sets — that's where the demand you built pays off. */}
                  {/* Reprintable only once the first printing has ended (pulled
                      out of print, or sold out) and not already reprinted / not a
                      reprint itself. */}
                  {onReprint && !set.reprintOf && !set.reprinted && (set.outOfPrint || soldOut) && (() => {
                    const cost = reprintCost(REPRINT_RUN)
                    const affordable = (state.cash ?? 0) >= cost
                    return (
                      <button
                        className={'btn btn--ghost sets__reprint' + (set.outOfPrint ? ' sets__reprint--hot' : '')}
                        onClick={() => onReprint(set.id)}
                        disabled={!affordable}
                        title={affordable
                          ? `Reprint as an Unlimited run (~$${cost.toLocaleString('en-US')}) — fresh supply to sell; the original becomes a first-edition premium`
                          : `Not enough cash to reprint (~$${cost.toLocaleString('en-US')})`}
                      >
                        ⟳ Reprint
                      </button>
                    )
                  })()}
                </div>
                {/* Per-SKU sell-through for multi-product sets (beyond boosters). */}
                {(set.products?.length ?? 0) > 1 && (
                  <div className="sets__skus">
                    {set.products.map((p) => (
                      <span key={p.kind} className="sets__sku" title={`${(p.sold ?? 0).toLocaleString()} / ${(p.supply ?? 0).toLocaleString()} sold`}>
                        {SKU_LABEL[p.kind] ?? p.kind} {pctStr(p.sold, p.supply)}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function clampPct(p) {
  return Math.round(Math.min(100, Math.max(0, p)) * 10) / 10
}
