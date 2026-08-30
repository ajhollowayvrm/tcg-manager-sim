// Per-set rarity sheet editor. Add/remove/rename rarities and tune each one's
// pull weight (how common in a pack) and value tier (collector desirability),
// flag secret rares, and assign FINISHES — every card printed at that
// rarity, signature or bulk, gets whatever finishes are toggled on (see
// combinedFinishEffect in rarities.js). Combinable: a rarity can carry
// several at once (e.g. Full Art + Rainbow Foil), stacking with diminishing
// appeal returns and compounding print cost. One set can have a "Mega Hyper
// Rare" another doesn't.

import { useState } from 'react'
import { makeRarity, FINISHES } from '../../game/rarities.js'

export default function RarityEditor({ sheet, onChange }) {
  const [expanded, setExpanded] = useState(null) // rarity id whose finish grid is open

  const update = (id, patch) =>
    onChange(sheet.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id) => onChange(sheet.filter((r) => r.id !== id))
  const add = () => onChange([...sheet, makeRarity()])
  const toggleFinish = (r, finishId) => {
    const has = (r.finishes ?? []).includes(finishId)
    update(r.id, { finishes: has ? r.finishes.filter((f) => f !== finishId) : [...(r.finishes ?? []), finishId] })
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
        const finishes = r.finishes ?? []
        const isOpen = expanded === r.id
        return (
          <div key={r.id} className="rared__group">
            <div className="rared__row">
              <input
                className="rared__name"
                value={r.name}
                onChange={(e) => update(r.id, { name: e.target.value })}
                placeholder="Rarity name"
              />
              <input
                className="rared__num rared__num--pull"
                type="number" min="0" step="0.1"
                value={r.pullWeight}
                aria-label="Pull weight"
                placeholder="Pull"
                onChange={(e) => update(r.id, { pullWeight: numOr(e.target.value, r.pullWeight, 0, Infinity) })}
              />
              <input
                className="rared__num rared__num--value"
                type="number" min="0" max="100"
                value={r.valueTier}
                aria-label="Value tier"
                placeholder="Value"
                onChange={(e) => update(r.id, { valueTier: numOr(e.target.value, r.valueTier, 0, 100) })}
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

            <button
              type="button"
              className="rared__finishtoggle"
              onClick={() => setExpanded(isOpen ? null : r.id)}
            >
              🎨 {finishes.length ? `${finishes.length} finish${finishes.length > 1 ? 'es' : ''}` : 'No finish'}
              {finishes.length > 0 && (
                <span className="muted"> — {finishes.map((id) => FINISHES.find((f) => f.id === id)?.name ?? id).join(', ')}</span>
              )}
              <span className="rared__finishcaret">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div className="rared__finishgrid">
                {FINISHES.filter((f) => f.id !== 'standard').map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={'btn btn--chip' + (finishes.includes(f.id) ? ' is-active' : '')}
                    title={`${f.blurb} (×${f.costMul} print cost)`}
                    onClick={() => toggleFinish(r, f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <button className="btn rared__add" onClick={add}>+ Add rarity</button>
    </div>
  )
}

// Number('') is 0, so clearing one of these fields used to silently write a
// pull weight of zero — making the rarity permanently unpullable with no
// warning and no way to tell it had happened. An empty field now keeps the
// previous value until the player types a real one.
function numOr(raw, fallback, lo, hi) {
  if (raw === '' || raw == null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}
