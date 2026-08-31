// Per-set rarity sheet editor. Add/remove/rename rarities and tune each one's
// pull weight (how common in a pack) and value tier (collector desirability),
// flag secret rares, and give each one FINISHES and VARIANTS. The two are
// different answers to "this rarity is special how?", and the editor keeps them
// visually apart because mixing them up designs the wrong set:
//
//   FINISHES are additive. Every card at the rarity gets all of them, on the
//   one card — Full Art + Rainbow Foil is a single card that is both, stacking
//   with diminishing appeal returns and compounding print cost (see
//   combinedFinishEffect in rarities.js).
//
//   VARIANTS are separate printings. An Alt Art of an Ultra Rare is its own
//   card, numbered above the set count, with its own finishes, pull weight and
//   value — the base Ultra Rare still exists beside it. Each variant reprints
//   the rarity's marquee cards, so it is a second version of a card the set
//   already has, not a new one.
//
// One set can have a "Mega Hyper Rare" another doesn't.

import { useState } from 'react'
import { makeRarity, makeVariant, MAX_VARIANT_COUNT, FINISHES, combinedFinishEffect } from '../../game/rarities.js'
import NumberField from './NumberField.jsx'

const PICKABLE = FINISHES.filter((f) => f.id !== 'standard')
const finishName = (id) => FINISHES.find((f) => f.id === id)?.name ?? id

// What a variant will really print, given how many cards its parent rarity
// draws. A variant reprints its parent's cards, so one on a rarity that draws
// none prints nothing at all — silently, at release time. Saying so here is the
// difference between a dial that works and a dial that looks like it works.
function variantYield(parentCount, want) {
  const have = Math.round(parentCount ?? 0)
  if (have < 1) return { n: 0, warn: true, text: 'no cards to reprint — prints nothing' }
  if (have < want) return { n: have, warn: true, text: `only ~${have} card${have > 1 ? 's' : ''} to reprint` }
  return { n: want, warn: false, text: `prints ${want} card${want > 1 ? 's' : ''}` }
}

export default function RarityEditor({ sheet, counts, onChange }) {
  // Which finish grid is open, keyed by rarity id or variant id — only one at a
  // time, so a sheet with variants doesn't unroll into a wall of chips.
  const [expanded, setExpanded] = useState(null)

  const update = (id, patch) =>
    onChange(sheet.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id) => onChange(sheet.filter((r) => r.id !== id))
  const add = () => onChange([...sheet, makeRarity()])

  const updateVariant = (r, vid, patch) =>
    update(r.id, { variants: (r.variants ?? []).map((v) => (v.id === vid ? { ...v, ...patch } : v)) })
  const addVariant = (r) => update(r.id, { variants: [...(r.variants ?? []), makeVariant(r)] })
  const removeVariant = (r, vid) => update(r.id, { variants: (r.variants ?? []).filter((v) => v.id !== vid) })

  // Toggle one finish on a rarity or on a variant. `apply` writes the new list
  // back wherever it came from, so the grid below serves both.
  const toggleIn = (list, finishId, apply) => {
    const has = (list ?? []).includes(finishId)
    apply(has ? list.filter((f) => f !== finishId) : [...(list ?? []), finishId])
  }

  const finishGrid = (list, apply) => (
    <div className="rared__finishgrid">
      {PICKABLE.map((f) => (
        <button
          key={f.id}
          type="button"
          className={'btn btn--chip' + ((list ?? []).includes(f.id) ? ' is-active' : '')}
          title={`${f.blurb} (×${f.costMul} print cost)`}
          onClick={() => toggleIn(list, f.id, apply)}
        >
          {f.name}
        </button>
      ))}
    </div>
  )

  // The shared "🎨 2 finishes — Full Art, Rainbow Foil ▼" summary button.
  const finishToggle = (key, list) => {
    const n = (list ?? []).length
    const isOpen = expanded === key
    return (
      <button
        type="button"
        className="rared__finishtoggle"
        onClick={() => setExpanded(isOpen ? null : key)}
      >
        🎨 {n ? `${n} finish${n > 1 ? 'es' : ''}` : 'No finish'}
        {n > 0 && <span className="muted"> — {list.map(finishName).join(', ')}</span>}
        {n > 1 && <span className="muted"> · +{combinedFinishEffect(list).appealBonus} appeal on one card</span>}
        <span className="rared__finishcaret">{isOpen ? '▲' : '▼'}</span>
      </button>
    )
  }

  return (
    <div className="rared">
      <div className="rared__head">
        <span className="rared__col rared__col--name">Rarity</span>
        <span className="rared__col" title="How common in a pack (higher = more common)">Pull</span>
        <span className="rared__col" title="Collector desirability (0–100)">Value</span>
        <span className="rared__col rared__col--secret" title="Numbered above the set count">Secret</span>
        <span className="rared__col rared__col--x" />
      </div>
      {sheet.map((r) => {
        const variants = r.variants ?? []
        return (
          <div key={r.id} className="rared__group">
            <div className="rared__row">
              <input
                className="rared__name"
                value={r.name}
                onChange={(e) => update(r.id, { name: e.target.value })}
                placeholder="Rarity name"
              />
              <NumberField
                className="rared__num rared__num--pull"
                value={r.pullWeight}
                aria-label="Pull weight"
                placeholder="Pull"
                onCommit={(n) => update(r.id, { pullWeight: n })}
              />
              <NumberField
                className="rared__num rared__num--value"
                max={100}
                value={r.valueTier}
                aria-label="Value tier"
                placeholder="Value"
                onCommit={(n) => update(r.id, { valueTier: n })}
              />
              <input
                className="rared__secret"
                type="checkbox"
                checked={r.secret}
                onChange={(e) => update(r.id, { secret: e.target.checked })}
                title="Secret rare (numbered above the set count)"
              />
              <button
                className="btn btn--ghost rared__remove"
                onClick={() => remove(r.id)}
                disabled={sheet.length <= 1}
                title="Remove rarity"
              >✕</button>
            </div>

            {finishToggle(r.id, r.finishes ?? [])}
            {expanded === r.id && finishGrid(r.finishes ?? [], (next) => update(r.id, { finishes: next }))}

            {variants.map((v) => (
              <div key={v.id} className="rared__variant">
                <div className="rared__row rared__row--variant">
                  <input
                    className="rared__name"
                    value={v.name}
                    onChange={(e) => updateVariant(r, v.id, { name: e.target.value })}
                    placeholder="Variant name"
                    aria-label="Variant name"
                  />
                  <NumberField
                    className="rared__num rared__num--pull"
                    value={v.pullWeight}
                    aria-label="Variant pull weight"
                    placeholder="Pull"
                    onCommit={(n) => updateVariant(r, v.id, { pullWeight: n })}
                  />
                  <NumberField
                    className="rared__num rared__num--value"
                    max={100}
                    value={v.valueTier}
                    aria-label="Variant value tier"
                    placeholder="Value"
                    onCommit={(n) => updateVariant(r, v.id, { valueTier: n })}
                  />
                  <NumberField
                    className="rared__num rared__num--count"
                    max={MAX_VARIANT_COUNT}
                    value={v.count}
                    aria-label="Variant card count"
                    placeholder="Cards"
                    title={`How many ${r.name || 'cards'} get this printing (max ${MAX_VARIANT_COUNT})`}
                    onCommit={(n) => updateVariant(r, v.id, { count: Math.round(n) })}
                  />
                  <button
                    className="btn btn--ghost rared__remove"
                    onClick={() => removeVariant(r, v.id)}
                    title="Remove variant"
                  >✕</button>
                </div>
                <div className="rared__variantfoot">
                  {finishToggle(v.id, v.finishes ?? [])}
                  {counts && (() => {
                    const y = variantYield(counts.get(r.id), Math.round(v.count ?? 0))
                    return <span className={'rared__yield' + (y.warn ? ' is-warn' : '')}>{y.warn ? '⚠ ' : '↳ '}{y.text}</span>
                  })()}
                </div>
                {expanded === v.id && finishGrid(v.finishes ?? [], (next) => updateVariant(r, v.id, { finishes: next }))}
              </div>
            ))}

            <button type="button" className="rared__addvariant" onClick={() => addVariant(r)}>
              + Add variant printing
              <span className="muted"> — a separate card, numbered above the count</span>
            </button>
          </div>
        )
      })}
      <button className="btn rared__add" onClick={add}>+ Add rarity</button>
    </div>
  )
}
