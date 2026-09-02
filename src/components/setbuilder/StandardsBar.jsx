// The set builder's link to the studio standards library: import a saved rarity
// sheet or booster format into this draft, or save what you've just tuned as a
// new one.
//
// "Save as" is not a convenience — it is what makes the library exist at all.
// Nobody opens a separate panel to author a rarity sheet from nothing; they
// tune one for a set and then want it again next time. This is that moment.
//
// An import COPIES. Nothing here links a set to a library entry, so editing the
// standard later cannot reach a set already shipped (see standards.js rule 1).
// The bar says so, because "imported" reads like a link if nothing says
// otherwise.

import { useState } from 'react'

export default function StandardsBar({
  noun, standards, provenance, pending, refused, onPick, onConfirm, onCancel, onSave,
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const save = () => {
    onSave(name)
    setNaming(false)
    setName('')
  }

  return (
    <div className="stdbar">
      <div className="stdbar__row">
        {standards.length > 0 && (
          <select
            className="stdbar__pick"
            value=""
            onChange={(e) => { if (e.target.value) onPick(e.target.value) }}
            aria-label={`Import a saved ${noun}`}
          >
            <option value="">Import a saved {noun}…</option>
            {standards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isDefault ? ' (default)' : ''}{s.note ? ` — ${s.note}` : ''}
              </option>
            ))}
          </select>
        )}
        {!onSave ? null : naming ? (
          <>
            <input
              className="stdbar__name"
              value={name}
              autoFocus
              placeholder={`Name this ${noun}`}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            />
            <button className="btn btn--ghost" onClick={() => setNaming(false)}>Cancel</button>
            <button className="btn btn--chip is-active" onClick={save}>Save</button>
          </>
        ) : (
          <button className="btn btn--ghost stdbar__save" onClick={() => setNaming(true)}>
            ☆ Save as a standard
          </button>
        )}
      </div>

      {refused && (
        <span className="field__note is-warn">
          This {noun} can't be saved as it stands — fix the errors below the
          section first, then try again.
        </span>
      )}

      {provenance && (
        <span className="field__note stdbar__from">
          From <strong>{provenance.standard.name}</strong>
          {provenance.drifted
            ? ' — edited since, so this set and the standard have drifted apart.'
            : ' — unchanged. Editing the standard in the Studio will not touch this set.'}
        </span>
      )}

      {pending && <FitReport pending={pending} onConfirm={onConfirm} onCancel={onCancel} />}
    </div>
  )
}

// What importing would change, before it changes it. The point is the four id
// channels: a pack slot, a god-pack pick, a signature card's rarity and an
// anniversary reprint's upgrade target all name rarities by id, and nothing in
// the game validates that any of them resolve — an unreconciled import shows a
// plausible, wrong odds table rather than an error. Every orphan is remapped to
// the surviving rarity closest in value tier, and every one of them is listed.
function FitReport({ pending, onConfirm, onCancel }) {
  const { standard, report } = pending
  // Keyed by position, not by text: two reprints upgrading from the same rarity,
  // or two unnamed signature cards at the same one, produce identical lines.
  const groups = [
    ['Pack slots', report.slots.map((e) => `slot ${e.slotIndex + 1}: ${e.fromName} → ${e.toName}`)],
    ['God pack', report.godPack.map((e) => `${e.fromName} → ${e.toName}`)],
    ['Signature cards', report.signatureCards.map((e) => `${e.cardName || 'unnamed card'}: ${e.fromName} → ${e.toName}`)],
    ['Reprint upgrades', report.reprintUpgrades.map((e) => `${e.fromName} → ${e.toName}`)],
    // Not a remap: a variant the incoming sheet brings joins the slots its
    // parent is already in, so it is actually chaseable. Still a change to what
    // a pack contains, so it is listed rather than done quietly.
    ['Added to the pack', (report.variantsAdded ?? []).map((e) => `slot ${e.slotIndex + 1}: ${e.name}`)],
  ].filter(([, lines]) => lines.length)

  return (
    <div className="stdbar__confirm">
      <p className="stdbar__confirmhead">
        Import <strong>{standard.name}</strong>?
        {report.count === 0
          ? ' Everything in this set still resolves — nothing else changes.'
          : ` ${report.count} thing${report.count === 1 ? '' : 's'} in this set name${report.count === 1 ? 's' : ''} a rarity it doesn't have, and will be moved to the nearest one:`}
      </p>
      {groups.map(([label, lines]) => (
        <div key={label} className="stdbar__group">
          <span className="stdbar__grouphead">{label}</span>
          <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      ))}
      {report.uniquesKept > 0 && (
        <span className="field__note">
          {report.uniquesKept} card-specific {report.uniquesKept === 1 ? 'rarity stays' : 'rarities stay'} as
          {report.uniquesKept === 1 ? ' it is' : ' they are'} — those belong to your signature cards, not to a shared sheet.
        </span>
      )}
      <div className="stdbar__confirmrow">
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn--release" onClick={onConfirm}>Import</button>
      </div>
    </div>
  )
}
