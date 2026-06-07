// Per-set rarity sheet editor. Add/remove/rename rarities and tune each one's
// pull weight (how common in a pack) and value tier (collector desirability),
// and flag secret rares. One set can have a "Mega Hyper Rare" another doesn't.

import { makeRarity } from '../../game/rarities.js'

export default function RarityEditor({ sheet, onChange }) {
  const update = (id, patch) =>
    onChange(sheet.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id) => onChange(sheet.filter((r) => r.id !== id))
  const add = () => onChange([...sheet, makeRarity()])

  return (
    <div className="rared">
      <div className="rared__head">
        <span className="rared__col rared__col--name">Rarity</span>
        <span className="rared__col" title="How common in a pack (higher = more common)">Pull</span>
        <span className="rared__col" title="Collector desirability (0–100)">Value</span>
        <span className="rared__col rared__col--secret" title="Numbered above the set count">Secret</span>
        <span className="rared__col rared__col--x" />
      </div>
      {sheet.map((r) => (
        <div key={r.id} className="rared__row">
          <input
            className="rared__name"
            value={r.name}
            onChange={(e) => update(r.id, { name: e.target.value })}
            placeholder="Rarity name"
          />
          <input
            className="rared__num"
            type="number" min="0" step="0.1"
            value={r.pullWeight}
            onChange={(e) => update(r.id, { pullWeight: Math.max(0, Number(e.target.value)) })}
          />
          <input
            className="rared__num"
            type="number" min="0" max="100"
            value={r.valueTier}
            onChange={(e) => update(r.id, { valueTier: Math.min(100, Math.max(0, Number(e.target.value))) })}
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
      ))}
      <button className="btn rared__add" onClick={add}>+ Add rarity</button>
    </div>
  )
}
