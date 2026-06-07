// Product lineup editor — choose which SKUs the set ships in beyond boosters.
// Boosters are always present (the base product, configured by the Identity
// section's Print run + Pack price sliders). Here the player toggles on a Bundle,
// a Collector box (SPC), and/or Tins, each with its own price + print-run knobs.
// More SKUs = more revenue channels, but each costs its own print run.

import { SKU_TYPES, makeProduct, productPrintCost, productSupply } from '../../game/products.js'
import Slider from './Slider.jsx'

// The opt-in extra SKUs (booster is implicit).
const EXTRA_KINDS = ['bundle', 'spc', 'tin']

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function ProductLineupEditor({ products, onChange }) {
  const byKind = new Map(products.map((p) => [p.kind, p]))

  const toggle = (kind) => {
    if (byKind.has(kind)) onChange(products.filter((p) => p.kind !== kind))
    else onChange([...products, makeProduct(kind)])
  }
  const update = (kind, patch) =>
    onChange(products.map((p) => (p.kind === kind ? { ...p, ...patch } : p)))

  return (
    <div className="skus">
      <div className="skus__base">
        <span className="skus__basename">📦 Booster packs</span>
        <span className="muted">Always included — priced &amp; printed via the Identity section.</span>
      </div>

      {EXTRA_KINDS.map((kind) => {
        const t = SKU_TYPES[kind]
        const p = byKind.get(kind)
        const on = !!p
        return (
          <div key={kind} className={'sku' + (on ? ' sku--on' : '')}>
            <label className="sku__toggle">
              <input type="checkbox" checked={on} onChange={() => toggle(kind)} />
              <span className="sku__name">{t.name}</span>
              {on && (
                <span className="sku__cost">
                  {fmtCash(productPrintCost(p))} print · {productSupply(p).toLocaleString('en-US')} units
                </span>
              )}
            </label>
            <p className="sku__blurb">{t.blurb}</p>
            {on && (
              <div className="sku__knobs">
                <Slider
                  label="Price (MSRP)"
                  value={p.price}
                  min={t.priceRange[0]} max={t.priceRange[1]} step={1}
                  onChange={(v) => update(kind, { price: v })}
                  format={(v) => '$' + v.toFixed(0)}
                />
                <Slider
                  label="Print run"
                  value={p.printRun}
                  min={0} max={100} step={1}
                  onChange={(v) => update(kind, { printRun: v })}
                  left="Under" right="Over"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
