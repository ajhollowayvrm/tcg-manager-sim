// Booster-format editor. Pick a preset pack template, then tweak the slots: how
// many cards each slot holds, which rarities it can pull, and whether it
// "escalates" (biases toward the rare end — the chase-slot feel). Mirrors the
// RarityEditor's row layout. The rarity choices come from the set's own sheet,
// so a slot can only reference rarities the set actually has.

import { PACK_PRESETS, buildPreset, makePackSlot, packSize, expandRaritySheet } from '../../game/rarities.js'
import NumberField from './NumberField.jsx'

export default function PackFormatEditor({ format, sheet, onChange }) {
  const slots = format?.slots ?? []
  const size = packSize(format)
  // Variants are pullable rarities, so a slot can chase one specifically —
  // "this slot is the alt-art slot" has to be expressible.
  const pickable = expandRaritySheet(sheet ?? [])

  // `preset` records where this pack SHAPE came from, so editing a slot has to
  // clear it — a Classic pack with a rewritten hit slot is not Classic any more.
  // Every mutator used to pass `format?.preset` straight back through, so the
  // default below was never once exercised: the chip stayed lit and the
  // builder's summary line kept reporting "Classic" however heavily the slots
  // had been rewritten. Applying a preset (below) is the only thing that sets it.
  const setSlots = (next, preset = null) => onChange({ ...format, preset, slots: next })
  const updateSlot = (i, patch) =>
    setSlots(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const removeSlot = (i) => setSlots(slots.filter((_, idx) => idx !== i))
  const addSlot = () => setSlots([...slots, makePackSlot()])

  // Toggle a rarity id in a slot's allowed list.
  const toggleRarity = (i, rid) => {
    const cur = new Set(slots[i].rarityIds ?? [])
    cur.has(rid) ? cur.delete(rid) : cur.add(rid)
    updateSlot(i, { rarityIds: [...cur] })
  }

  return (
    <div className="packfmt">
      <div className="packfmt__presets">
        <span className="packfmt__presetlabel">Start from:</span>
        {PACK_PRESETS.map((p) => (
          <button
            key={p.id}
            className={'btn btn--chip' + (format?.preset === p.id ? ' is-active' : '')}
            onClick={() => onChange(buildPreset(p.id))}
            title={p.blurb}
          >
            {p.name}
          </button>
        ))}
        <span className="packfmt__size">{size}-card pack</span>
      </div>

      <div className="packfmt__slots">
        {slots.map((slot, i) => (
          <div key={slot.id ?? `slot-${i}`} className="packfmt__slot">
            <NumberField
              className="packfmt__count"
              max={30}
              value={slot.count}
              aria-label="Slot card count"
              onCommit={(n) => updateSlot(i, { count: Math.round(n) })}
            />
            <span className="packfmt__times">×</span>
            <div className="packfmt__rarities">
              {pickable.map((r) => {
                const on = (slot.rarityIds ?? []).includes(r.id)
                return (
                  <button
                    key={r.id}
                    className={'packfmt__rar' + (on ? ' is-on' : '') + (r.variantOf ? ' packfmt__rar--variant' : '')}
                    onClick={() => toggleRarity(i, r.id)}
                    title={on ? `Remove ${r.name}` : `Add ${r.name}`}
                  >
                    {r.name}
                  </button>
                )
              })}
            </div>
            <label className="packfmt__esc" title="Bias this slot toward the rarer end (chase-slot feel)">
              <input
                type="checkbox"
                checked={!!slot.escalate}
                onChange={(e) => updateSlot(i, { escalate: e.target.checked })}
              />
              <span>escalate</span>
            </label>
            <label className="packfmt__esc" title="Reserved for cards featuring an icon-status character — no effect until the set has one">
              <input
                type="checkbox"
                checked={!!slot.iconOnly}
                onChange={(e) => updateSlot(i, { iconOnly: e.target.checked })}
              />
              <span>icon chase</span>
            </label>
            <button
              className="btn btn--ghost packfmt__remove"
              onClick={() => removeSlot(i)}
              disabled={slots.length <= 1}
              title="Remove slot"
            >✕</button>
          </div>
        ))}
      </div>

      <button className="btn packfmt__add" onClick={addSlot}>+ Add slot</button>
    </div>
  )
}
