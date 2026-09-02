// The tree of FORMS under one character, and the demeanour picker both editors
// use. Lifted out of LineagesPanel so Studio › Lineages and the character sheet
// draw the same tree from one definition rather than two that drift.
//
// See people.js for what a form is: a character is one person printed many
// times, and each printing identity is a form. A same-being link continues the
// character; a fusion or a successor starts a new one.

import { getArchetype } from '../../game/content/archetypes.js'
import { getLineageKind } from '../../game/content/lineages.js'
import { lineageParents } from '../../game/characters.js'
import { DEMEANORS, MAX_DEMEANORS } from '../../game/content/demeanors.js'
import { formLabel, continuityVerdict, CONTINUITY_TEXT } from '../../game/people.js'

// Build the parent -> children index and the list of roots, over any set of
// forms. Shared so a panel showing one character's tree and a panel showing
// every line agree on what a root is.
export function treeIndex(forms) {
  const childrenOf = new Map()
  for (const c of forms) {
    const [primary] = lineageParents(c)
    if (!primary) continue
    if (!childrenOf.has(primary)) childrenOf.set(primary, [])
    childrenOf.get(primary).push(c)
  }
  const ids = new Set(forms.map((c) => c.id))
  // A root is a form with no parent INSIDE this set — so one character's tree
  // still roots correctly when it is drawn on its own.
  const roots = forms.filter((c) => !lineageParents(c).some((p) => ids.has(p)))
  return { roots, childrenOf }
}

export function FormNode({ form, all, childrenOf, person, depth = 0, onOpen, activeId }) {
  const kind = getLineageKind(form.lineageKindId)
  const parents = lineageParents(form)
  const other = parents.length > 1 ? all.find((x) => x.id === parents[1]) : null
  const kids = childrenOf.get(form.id) ?? []
  const share = person?.favor?.[form.id]
  const Row = onOpen ? 'button' : 'div'
  return (
    <li className="lineage__node" style={{ '--depth': depth }}>
      <Row
        type={onOpen ? 'button' : undefined}
        className={'lineage__row'
          + (form.retiredWeek ? ' is-retired' : '')
          + (activeId === form.id ? ' is-active' : '')}
        onClick={onOpen ? () => onOpen(form.id) : undefined}
        title={onOpen ? `Open ${form.name}` : undefined}
      >
        <span className="lineage__name">{person ? formLabel(person, form) : form.name}</span>
        <span className="lineage__meta">
          {getArchetype(form.archetypeId).name} · fame {Math.round(form.fame)}
          {share != null && ` · ${Math.round(share * 100)}% of the fandom`}
          {form.retiredWeek ? ' · no new printings' : ''}
        </span>
        {kind && (
          <span className="lineage__kind" title={kind.short}>
            {kind.name}{other ? ` with ${other.name}` : ''}
          </span>
        )}
      </Row>
      {kids.length > 0 && (
        <ul className="lineage">
          {kids.map((k) => (
            <FormNode key={k.id} form={k} all={all} childrenOf={childrenOf}
              person={person} depth={depth + 1} onOpen={onOpen} activeId={activeId} />
          ))}
        </ul>
      )}
    </li>
  )
}

// Up to MAX_DEMEANORS from content/demeanors.js. Mirrors TraitPicker's shape so
// the two sit together in a form without looking like different controls.
export function DemeanorPicker({ demeanors, onToggle, label = 'Demeanour' }) {
  const chosen = demeanors ?? []
  return (
    <div className="field field--full">
      <span>
        {label} <span className="muted">(up to {MAX_DEMEANORS} — how this form carries itself)</span>
      </span>
      <div className="roster__filters charsheet__traitpicker">
        {DEMEANORS.map((d) => {
          const on = chosen.includes(d.id)
          const full = !on && chosen.length >= MAX_DEMEANORS
          return (
            <button
              key={d.id}
              type="button"
              className={'roster__chip' + (on ? ' is-active' : '')}
              onClick={() => !full && onToggle(d.id)}
              title={d.blurb}
              disabled={full}
            >
              {d.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// The one-line read on whether a form still scans as the character, in the same
// words before release that the room uses after it.
//
// Silent when there is nothing to judge — a root form has no link, and a form
// with no demeanour picked has no reading. That silence is deliberate: an unset
// field is not a mistake, and inventing a verdict from no information would be
// worse than saying nothing (see demeanorCentroid).
export function ContinuityNote({ person, form, kindId }) {
  const { verdict, drift } = continuityVerdict(person, form, kindId)
  if (!verdict) return null
  const warn = verdict !== 'true-to-her'
  return (
    <p className={'field__note' + (warn ? ' is-warn' : '')}>
      {CONTINUITY_TEXT[verdict]}
      {drift != null && <span className="muted"> (drift {drift.toFixed(2)})</span>}
    </p>
  )
}
