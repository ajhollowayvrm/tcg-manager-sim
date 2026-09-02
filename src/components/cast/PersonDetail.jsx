// A CHARACTER's sheet — Aryla, not Aryla-comma-Royal-Commander.
//
// CharacterDetail.jsx is the sheet for one FORM: its own fame, its own beats,
// its own printings. That view is still right and is reached from here. But a
// character with five forms had no view at all: the player saw five rows and no
// Aryla, which is precisely the thing this feature exists to fix. Fans recognise
// one character across every form and keep a favourite among them, and neither
// of those is visible on any single form's sheet.
//
// So this view carries what belongs to the PERSON:
//
//   the throughline  — the one line true of every form, and the core demeanour
//                      each form's continuity is scored against
//   recognition      — how well the audience knows her, across all forms
//   the fandom split — which form they actually love, as a bar per form
//   the tree         — how the forms grew out of each other
//   the story        — person-level beats, merged with every form's own
//
// Everything here is AUTHORED and editable. Recognition, favour, saturation and
// the beats are earned and read-only — the UPDATE_PERSON case in reducer.js
// enforces exactly that split, the same way UPDATE_CHARACTER does for a form.

import { useMemo, useState } from 'react'
import { useModal } from '../useModal.js'
import Section from '../nav/Section.jsx'
import Chart from '../Chart.jsx'
import { TRAITS, MAX_TRAITS, getTrait } from '../../game/content/traits.js'
import { getDemeanor } from '../../game/content/demeanors.js'
import { SATURATION_THRESHOLD, WIDELY_KNOWN_RECOGNITION, formLabel } from '../../game/people.js'
import { treeIndex, FormNode, DemeanorPicker } from './FormTree.jsx'

const BEAT_CUE = {
  known: { icon: '★', cls: 'mood--good' },
  favourite: { icon: '♥', cls: 'mood--neutral' },
}

export default function PersonDetail({ person, state, onClose, onUpdatePerson, onOpenForm }) {
  const modalRef = useModal(onClose)
  const [editing, setEditing] = useState(false)
  if (!person) return null

  const forms = useMemo(
    () => (state.characters ?? []).filter((c) => c.personId === person.id),
    [state.characters, person.id],
  )
  const { roots, childrenOf } = useMemo(() => treeIndex(forms), [forms])

  const printings = forms.reduce((n, f) => n + (f.appearances?.length ?? 0), 0)
  const history = person.recognitionHistory ?? []
  const labels = history.map((_, i) => state.week - history.length + 1 + i)
  const known = person.recognition >= WIDELY_KNOWN_RECOGNITION
  const over = person.saturation > SATURATION_THRESHOLD

  // The fandom split, biggest share first — the order the question is actually
  // asked in ("which one do they love?").
  const split = useMemo(
    () => forms
      .map((f) => ({ form: f, share: person.favor?.[f.id] ?? 0 }))
      .sort((a, b) => b.share - a.share),
    [forms, person.favor],
  )

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal__sheet" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="personsheet-title">
        <header className="modal__head">
          <h2 id="personsheet-title">{person.name}</h2>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close character sheet">✕</button>
        </header>

        <div className="modal__body">
          <div className="charsheet__identity">
            <span className="charsheet__archetype">{forms.length} form{forms.length === 1 ? '' : 's'}</span>
            {person.pronouns && <span className="charsheet__pronouns">{person.pronouns}</span>}
            <span className={'roster__mood ' + (known ? 'mood--good' : 'mood--neutral')}>
              {known ? 'Known by name' : 'Still being learned'}
            </span>
            <span className="charsheet__fame">Recognition {Math.round(person.recognition)}</span>
          </div>

          {(person.coreTraits ?? []).length > 0 && (
            <div className="charsheet__traits">
              {person.coreTraits.map((id) => {
                const t = getTrait(id)
                return t ? <span key={id} className="roster__chip is-active" title={t.blurb}>{t.name}</span> : null
              })}
              {(person.coreDemeanor ?? []).map((id) => {
                const d = getDemeanor(id)
                return d ? <span key={id} className="roster__chip" title={d.blurb}>{d.name}</span> : null
              })}
            </div>
          )}

          {person.throughline && <p className="charsheet__hook">“{person.throughline}”</p>}

          <p className="field__note">
            {known
              ? `The room knows ${person.name} by name. A new form of her debuts already famous.`
              : `${person.name} is still being learned. Recognition builds off how her forms' cards actually do.`}
          </p>

          {over && (
            <p className="field__note is-warn">
              She is in too much, too often. The room has started to say so, and a
              new printing of any of her forms is worth less until it settles.
            </p>
          )}

          {onUpdatePerson && !editing && (
            <button className="btn btn--ghost" onClick={() => setEditing(true)}>✎ Edit character</button>
          )}
          {onUpdatePerson && editing && (
            <PersonEditor
              person={person}
              onCancel={() => setEditing(false)}
              onSave={(patch) => { onUpdatePerson(person.id, patch); setEditing(false) }}
            />
          )}

          {/* ---- Recognition ------------------------------------------- */}
          <Section id="personsheet.recognition" title="Recognition" level={3} flat>
            {history.length > 1 ? (
              <Chart
                series={[{ key: 'recognition', label: 'Recognition', color: 'var(--pop)', points: history }]}
                labels={labels}
                height={120}
              />
            ) : (
              <p className="panel__empty">No history yet — advance a few weeks.</p>
            )}
          </Section>

          {/* ---- The fandom split -------------------------------------- */}
          <Section id="personsheet.favour" title="Which form they love" level={3} flat>
            {forms.length < 2 ? (
              <p className="panel__empty">
                One form so far. Promote her, and the fandom starts to divide.
              </p>
            ) : (
              <>
                <p className="field__note">
                  Everyone here likes {person.name}. They do not agree on which one is
                  the real one. Printing a form the room is attached to is worth more
                  than printing the newest one.
                </p>
                <ul className="favour">
                  {split.map(({ form, share }) => (
                    <li key={form.id} className="favour__row">
                      <span className="favour__name">{formLabel(person, form)}</span>
                      <span className="bar">
                        <span className="bar__fill" style={{ width: `${Math.round(share * 100)}%` }} />
                      </span>
                      <span className="favour__pct">{Math.round(share * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          {/* ---- The forms --------------------------------------------- */}
          <Section id="personsheet.forms" title={`Forms (${forms.length})`} level={3} flat>
            <ul className="lineage">
              {roots.map((r) => (
                <FormNode key={r.id} form={r} all={forms} childrenOf={childrenOf}
                  person={person} onOpen={onOpenForm} />
              ))}
            </ul>
            <p className="field__note">
              {printings} printing{printings === 1 ? '' : 's'} across every form.
              Open one for its own fame, story and cards.
            </p>
          </Section>

          {/* ---- The story --------------------------------------------- */}
          <Section id="personsheet.story" title="Story" level={3} flat>
            {(person.beats ?? []).length === 0 ? (
              <p className="panel__empty">
                Nothing has happened to {person.name} as a character yet. Each form
                keeps its own story in the meantime.
              </p>
            ) : (
              <ul className="charsheet__beats">
                {[...person.beats].reverse().map((b, i) => {
                  const cue = BEAT_CUE[b.kind] ?? BEAT_CUE.favourite
                  return (
                    <li key={`${b.week}-${b.kind}-${i}`} className="charsheet__beat">
                      <span className="charsheet__beatweek">wk {b.week}</span>
                      <span className={'charsheet__beaticon ' + cue.cls}>{cue.icon}</span>
                      <span>{b.label}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// The authored half. Core traits are SAID by the community feed; the core
// demeanour is what every form's continuity is measured against, so changing it
// re-reads every form at once — which is the honest behaviour, because deciding
// who the character fundamentally is was always meant to be revisable.
function PersonEditor({ person, onCancel, onSave }) {
  const [name, setName] = useState(person.name)
  const [pronouns, setPronouns] = useState(person.pronouns ?? '')
  const [throughline, setThroughline] = useState(person.throughline ?? '')
  const [coreTraits, setCoreTraits] = useState(person.coreTraits ?? [])
  const [coreDemeanor, setCoreDemeanor] = useState(person.coreDemeanor ?? [])

  const toggle = (list, set, max) => (id) =>
    set((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= max ? cur : [...cur, id]))

  return (
    <form
      className="roster__addform charsheet__addform"
      onSubmit={(e) => { e.preventDefault(); onSave({ name, pronouns, throughline, coreTraits, coreDemeanor }) }}
    >
      <label className="field field--full">
        <span>Name <span className="muted">(the character, not the card)</span></span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aryla" />
      </label>

      <label className="field field--full">
        <span>Throughline <span className="muted">(the one line true of every form)</span></span>
        <input value={throughline} onChange={(e) => setThroughline(e.target.value)} placeholder="Kind, even when it costs her." />
      </label>

      <label className="field">
        <span>Pronouns</span>
        <input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="they/them" />
      </label>

      <div className="field field--full">
        <span>Core traits <span className="muted">(up to {MAX_TRAITS} — what the room says about her)</span></span>
        <div className="roster__filters charsheet__traitpicker">
          {TRAITS.map((t) => {
            const on = coreTraits.includes(t.id)
            const full = !on && coreTraits.length >= MAX_TRAITS
            return (
              <button key={t.id} type="button" title={t.blurb} disabled={full}
                className={'roster__chip' + (on ? ' is-active' : '')}
                onClick={() => toggle(coreTraits, setCoreTraits, MAX_TRAITS)(t.id)}>
                {t.name}
              </button>
            )
          })}
        </div>
      </div>

      <DemeanorPicker
        demeanors={coreDemeanor}
        onToggle={toggle(coreDemeanor, setCoreDemeanor, 2)}
        label="Core demeanour"
      />
      <p className="field__note">
        Every form is read against this. A promotion that drifts far from it reads
        as somebody else; a fall that stays close to it reads as toothless.
      </p>

      <div className="sigcard__row">
        <button className="btn btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn" type="submit" disabled={!name.trim()}>Save</button>
      </div>
    </form>
  )
}
