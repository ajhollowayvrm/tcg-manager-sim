// Studio standards — the rarity sheets and booster formats the player names once
// and imports into any set, plus blueprints pinning a known-good pair.
//
// One panel with three sub-tabs rather than three panels, because App's TABS
// roster is MOBILE-ONLY: desktop renders the full two-column dashboard and
// ignores `tab` entirely, so a fourth top-level tab would buy a mobile section
// and nothing on desktop. A panel whose interior is tabbed reads the same in
// both layouts.
//
// The two editors are mounted UNCHANGED. RarityEditor and PackFormatEditor were
// already pure ({ value, onChange }) controlled components with no knowledge of
// a draft or of game state, which is the whole reason this feature is small.
//
// Nothing here costs money, deliberately. A live block is charged upkeep because
// it is a standing commitment; a standard is a design document that confers no
// mechanical advantage, only convenience.

import { useState } from 'react'
import RarityEditor from './setbuilder/RarityEditor.jsx'
import PackFormatEditor from './setbuilder/PackFormatEditor.jsx'
import {
  defaultRaritySheet,
  defaultPackFormat,
  packSize,
  validateRaritySheet,
  validatePackFormat,
} from '../game/rarities.js'
import {
  makeRaritySheetStandard,
  makePackFormatStandard,
  makeBlueprint,
  fitToSheet,
  MAX_STANDARD_NAME,
  MAX_STANDARD_NOTE,
} from '../game/standards.js'
import Section from './nav/Section.jsx'

const SUBTABS = [
  { id: 'sheets', label: 'Rarity sheets', kind: 'raritySheet' },
  { id: 'formats', label: 'Booster formats', kind: 'packFormat' },
  { id: 'blueprints', label: 'Blueprints', kind: 'blueprint' },
]

// RarityEditor's `counts` drives its variant-yield advisory ("only ~2 cards to
// reprint"), which is answered by a set's length and signature cards. A standard
// has no set, so there is no honest number to give and the advisory has to stand
// down. Its guard is `counts && ...` — so this must be undefined, NOT an empty
// Map: a Map is truthy, and counts.get() returning undefined made every variant
// on every saved sheet read "no cards to reprint — prints nothing" in the
// warning styling, which is both false and the likeliest reason someone would
// delete a variant they should keep.
const NO_COUNTS = undefined

export default function StandardsPanel({ state, onSave, onDelete }) {
  const [tab, setTab] = useState('sheets')
  // The record being edited, held locally and written back on Save, so a
  // half-typed name never reaches state (and never triggers an autosave).
  const [draft, setDraft] = useState(null)
  const [confirming, setConfirming] = useState(null)

  const sheets = state.raritySheets ?? []
  const formats = state.packFormats ?? []
  const blueprints = state.blueprints ?? []
  const active = SUBTABS.find((s) => s.id === tab)

  const startEdit = (record) => { setDraft(structuredClone(record)); setConfirming(null) }
  const cancel = () => setDraft(null)
  const commit = () => { onSave(active.kind, draft); setDraft(null) }

  const errors = !draft ? []
    : tab === 'sheets' ? validateRaritySheet(draft.sheet)
      : tab === 'formats' ? validatePackFormat(draft.format)
        : (draft.sheetId || draft.formatId) ? [] : ['A blueprint has to pin a sheet, a format, or both.']

  return (
    <Section id="studio.standards" title="Studio standards" level={2}>
      <p className="panel__lede">
        Design a rarity sheet or a booster once, name it, and pull it into any
        set. Editing one here never touches a set you have already shipped —
        importing takes a copy.
      </p>

      <div className="roster__filters std__kinds" role="tablist" aria-label="Studio standards sections">
        {SUBTABS.map((s) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={tab === s.id}
            className={'roster__chip' + (tab === s.id ? ' is-active' : '')}
            onClick={() => { setTab(s.id); setDraft(null); setConfirming(null) }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {draft ? (
        <div className="std__editor">
          <label className="field field--full">
            <span>Name</span>
            <input
              value={draft.name}
              maxLength={MAX_STANDARD_NAME}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="House standard"
            />
          </label>
          <label className="field field--full">
            <span>Note <span className="muted">(what it's for — reminds you which to reach for)</span></span>
            <input
              value={draft.note ?? ''}
              maxLength={MAX_STANDARD_NOTE}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Chase-heavy, for riders"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
            />
            Start every new set from this one
          </label>

          {tab === 'sheets' && (
            <RarityEditor
              sheet={draft.sheet}
              counts={NO_COUNTS}
              onChange={(sheet) => setDraft({ ...draft, sheet })}
            />
          )}

          {tab === 'formats' && (
            <FormatEditor draft={draft} setDraft={setDraft} sheets={sheets} />
          )}

          {tab === 'blueprints' && (
            <BlueprintEditor draft={draft} setDraft={setDraft} sheets={sheets} formats={formats} />
          )}

          {errors.length > 0 && (
            <ul className="builder__errors">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="std__actions">
            <button className="btn btn--ghost" onClick={cancel}>Cancel</button>
            <button className="btn btn--release" onClick={commit} disabled={errors.length > 0}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {tab === 'sheets' && (
            <StandardList
              records={sheets}
              empty="No saved rarity sheets yet. Design one here, or save a set's sheet from the builder."
              summarise={(s) => `${s.sheet.length} rarities · top tier ${topTier(s.sheet)}`}
              onNew={() => startEdit(makeRaritySheetStandard('House standard', defaultRaritySheet(), state.week))}
              newLabel="+ New rarity sheet"
              {...{ startEdit, confirming, setConfirming, onDelete, kind: 'raritySheet' }}
            />
          )}
          {tab === 'formats' && (
            <StandardList
              records={formats}
              empty="No saved booster formats yet. Design one here, or save a set's booster from the builder."
              summarise={(f) => `${packSize(f.format)}-card pack · ${f.format.slots.length} slots`
                + (f.godPack?.enabled === false ? ' · no god pack' : '')}
              onNew={() => startEdit(makePackFormatStandard('House booster', defaultPackFormat(), null, state.week))}
              newLabel="+ New booster format"
              {...{ startEdit, confirming, setConfirming, onDelete, kind: 'packFormat' }}
            />
          )}
          {tab === 'blueprints' && (
            <StandardList
              records={blueprints}
              empty={sheets.length || formats.length
                ? 'No blueprints yet. A blueprint pins one sheet and one booster together, so a routine set is a single pick.'
                : 'Save a rarity sheet or a booster format first — a blueprint pins a pair of them.'}
              summarise={(b) => [
                sheets.find((s) => s.id === b.sheetId)?.name ?? 'no sheet',
                formats.find((f) => f.id === b.formatId)?.name ?? 'no booster',
              ].join(' + ')}
              onNew={sheets.length || formats.length
                ? () => startEdit(makeBlueprint('House set', sheets[0]?.id ?? null, formats[0]?.id ?? null, state.week))
                : null}
              newLabel="+ New blueprint"
              {...{ startEdit, confirming, setConfirming, onDelete, kind: 'blueprint' }}
            />
          )}
        </>
      )}
    </Section>
  )
}

function topTier(sheet) {
  return Math.max(0, ...(sheet ?? []).map((r) => r.valueTier ?? 0))
}

function StandardList({ records, empty, summarise, onNew, newLabel, startEdit, confirming, setConfirming, onDelete, kind }) {
  return (
    <>
      {records.length === 0 ? (
        <p className="panel__empty">{empty}</p>
      ) : (
        <ul className="roster std__list">
          {records.map((r) => (
            <li key={r.id} className="std__row">
              <button className="std__open" onClick={() => startEdit(r)}>
                <span className="std__name">
                  {r.name}
                  {r.isDefault && <span className="std__badge">default</span>}
                </span>
                <span className="std__meta">{summarise(r)}</span>
                {r.note && <span className="std__note">{r.note}</span>}
              </button>
              {/* In-app confirm, never window.confirm — it does not work in the
                  iOS shell (see SettingsPanel). */}
              {confirming === r.id ? (
                <span className="std__confirm">
                  <button className="btn btn--ghost" onClick={() => setConfirming(null)}>Cancel</button>
                  <button className="btn btn--ban" onClick={() => { onDelete(kind, r.id); setConfirming(null) }}>
                    Delete
                  </button>
                </span>
              ) : (
                <button className="btn btn--ghost std__del" onClick={() => setConfirming(r.id)} title="Delete">✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {onNew && <button className="btn btn--ghost std__new" onClick={onNew}>{newLabel}</button>}
    </>
  )
}

// A booster format names rarities by id, so the editor needs a sheet to show
// chips for. Which sheet is only an EDITING CONTEXT — it is not stored on the
// format and not what the format will be used against. A format whose slots name
// ids the destination set lacks is reconciled on import (see standards.js), so
// picking the wrong context here costs a remap, not correctness.
function FormatEditor({ draft, setDraft, sheets }) {
  const [contextId, setContextId] = useState(sheets.find((s) => s.isDefault)?.id ?? sheets[0]?.id ?? '')
  const context = sheets.find((s) => s.id === contextId)?.sheet ?? defaultRaritySheet()
  const godPack = draft.godPack ?? { enabled: true, rarityIds: [] }

  // Keep the format expressible in the sheet it is being designed against.
  // PACK_PRESETS hardcode the eight built-in rarity ids, so applying "Premium"
  // here would otherwise leave slots naming rarities a custom context sheet has
  // never had — invisible in this editor (the chips just do not light) and only
  // surfacing as a pile of remaps the first time the format is imported.
  // Idempotent, so it never fights a chip the player is toggling.
  const fit = (format) => {
    const next = fitToSheet({ format, godPack }, context)
    return next.changed ? next : { format, godPack }
  }
  // A context switch reconciles too, since the chips on screen are the ones a
  // slot ought to be able to name — and it MUST pass the outgoing sheet as the
  // reference. Without it, a custom rarity's id is unknown to both sheets, so
  // getRarity hands back its neutral stub at value tier 40 and a "Prismatic
  // Chase" at tier 95 is silently demoted to Rare — by a dropdown that reads as
  // though it only changes what is displayed. The god pack moves with it for the
  // same reason: its picks are ids into the same sheet, and left behind they
  // stop lighting up while still being stored.
  const useContext = (id) => {
    const next = sheets.find((s) => s.id === id)?.sheet ?? defaultRaritySheet()
    const fitted = fitToSheet({ format: draft.format, godPack }, next, context)
    setContextId(id)
    setDraft({ ...draft, format: fitted.format, godPack: fitted.godPack })
  }

  return (
    <>
      {sheets.length > 0 && (
        <label className="field field--full">
          <span>Show slots against <span className="muted">(which rarities to pick from while editing)</span></span>
          <select value={contextId} onChange={(e) => useContext(e.target.value)}>
            <option value="">The built-in default sheet</option>
            {sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <PackFormatEditor
        format={draft.format}
        sheet={context}
        onChange={(next) => {
          const fitted = fit(next)
          setDraft({ ...draft, format: fitted.format, godPack: fitted.godPack })
        }}
      />
      <h3 className="builder__h3">God pack</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={godPack.enabled ?? true}
          onChange={(e) => setDraft({ ...draft, godPack: { ...godPack, enabled: e.target.checked } })}
        />
        Sets using this booster can roll a god pack
      </label>
      {(godPack.enabled ?? true) && (
        <>
          <span className="field__note">
            What's in it: pick which rarities a god pack draws from. None picked =
            auto (the set's single highest rarity, the classic behavior).
          </span>
          <div className="rared__finishgrid">
            {context.filter((r) => !r.unique).map((r) => {
              const on = (godPack.rarityIds ?? []).includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  className={'btn btn--chip' + (on ? ' is-active' : '')}
                  onClick={() => setDraft({
                    ...draft,
                    godPack: {
                      ...godPack,
                      rarityIds: on
                        ? godPack.rarityIds.filter((id) => id !== r.id)
                        : [...(godPack.rarityIds ?? []), r.id],
                    },
                  })}
                >
                  {r.name}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function BlueprintEditor({ draft, setDraft, sheets, formats }) {
  const sheet = sheets.find((s) => s.id === draft.sheetId)
  const format = formats.find((f) => f.id === draft.formatId)
  return (
    <>
      <span className="field__note">
        A blueprint pins one rarity sheet and one booster format together, so
        starting a set from your usual pair is a single pick instead of two — and
        the pair is one you have already seen work, so the slots always name
        rarities the sheet actually has.
      </span>
      <label className="field field--full">
        <span>Rarity sheet</span>
        <select
          value={draft.sheetId ?? ''}
          onChange={(e) => setDraft({ ...draft, sheetId: e.target.value || null })}
        >
          <option value="">— None (keep the set's own) —</option>
          {sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="field field--full">
        <span>Booster format</span>
        <select
          value={draft.formatId ?? ''}
          onChange={(e) => setDraft({ ...draft, formatId: e.target.value || null })}
        >
          <option value="">— None (keep the set's own) —</option>
          {formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <div className="blockcard blockcard--read">
        <div className="blockcard__row">
          <span>Sheet</span>
          <strong>{sheet ? `${sheet.name} — ${sheet.sheet.length} rarities` : 'left as the set has it'}</strong>
        </div>
        <div className="blockcard__row">
          <span>Booster</span>
          <strong>{format ? `${format.name} — ${packSize(format.format)}-card pack` : 'left as the set has it'}</strong>
        </div>
      </div>
    </>
  )
}
