// Product lineup editor — choose which SKUs the set ships in beyond boosters.
// Boosters are always present (the base product, configured by the Identity
// section's Print run + Pack price sliders). Here the player toggles on a Bundle,
// a Collector box (SPC), and/or Tins, each with its own price + print-run knobs.
// More SKUs = more revenue channels, but each costs its own print run.

import { SKU_TYPES, makeProduct, productPrintCost, productSupply, CHANNELS, DEFAULT_CHANNELS } from '../../game/products.js'
import Slider from './Slider.jsx'

// The opt-in extra SKUs (booster is implicit).
const EXTRA_KINDS = ['bundle', 'spc', 'tin']
const CHANNEL_IDS = ['direct', 'lgs', 'bigBox', 'international']

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// Where this SKU's supply actually goes: 4 sliders that always sum to 100% —
// nudging one proportionally rescales the other three so the split stays
// valid without the player having to balance it by hand.
function ChannelSplitEditor({ channels, onChange }) {
  const c = channels ?? DEFAULT_CHANNELS
  const setShare = (id, pct) => {
    const share = Math.min(1, Math.max(0, pct / 100))
    const others = CHANNEL_IDS.filter((x) => x !== id)
    const othersTotal = others.reduce((s, x) => s + (c[x] ?? 0), 0)
    const remaining = 1 - share
    const next = { ...c, [id]: share }
    for (const x of others) {
      next[x] = othersTotal > 0 ? (c[x] / othersTotal) * remaining : remaining / others.length
    }
    onChange(next)
  }
  return (
    <div className="channels">
      <span className="channels__label">Channel allocation <span className="muted">— margin vs. reach vs. scalper exposure</span></span>
      {CHANNEL_IDS.map((id) => (
        <Slider
          key={id}
          label={CHANNELS[id].label}
          value={Math.round((c[id] ?? 0) * 100)}
          min={0} max={100} step={1}
          onChange={(v) => setShare(id, v)}
          format={(v) => v + '%'}
        />
      ))}
    </div>
  )
}

export default function ProductLineupEditor({ products, onChange, boosterChannels, onChangeBoosterChannels }) {
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
        {onChangeBoosterChannels && (
          <ChannelSplitEditor channels={boosterChannels} onChange={onChangeBoosterChannels} />
        )}
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
                {/* Collector boxes can carry an exclusive, unpullable promo. */}
                {kind === 'spc' && (
                  <label className="check sku__promo">
                    <input
                      type="checkbox"
                      checked={!!p.exclusivePromo}
                      onChange={(e) => update(kind, { exclusivePromo: e.target.checked })}
                    />
                    Include an exclusive promo card
                    <span className="muted"> (unpullable, scarce — a collector grail)</span>
                  </label>
                )}
                <ChannelSplitEditor channels={p.channels} onChange={(channels) => update(kind, { channels })} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
