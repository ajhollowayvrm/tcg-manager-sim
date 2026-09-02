// Studio › Lineages — the ways a character can grow out of another, the lines
// the cast has already formed, and a form to link a new character to one or two
// existing ones without waiting for a signature card. See content/lineages.js
// for the catalogue and characters.js for the mechanics.

import { useMemo, useState } from 'react'
import { LINEAGE_KINDS, getLineageKind, archetypeRuleText, archetypeAllowed } from '../game/content/lineages.js'
import { getArchetype } from '../game/content/archetypes.js'
import { MAX_TRAITS } from '../game/content/traits.js'
import { lineageParents, validateLineage } from '../game/characters.js'
import { ArchetypeSelect, TraitPicker } from './CharacterDetail.jsx'
import Section from './nav/Section.jsx'

export default function LineagesPanel({ state, onAddCharacter }) {
  const all = state.characters ?? []

  // Roots are characters with no parent; a tree hangs off each root that has
  // at least one child. A fusion child appears under its primary parent and is
  // marked with both names.
  const { roots, childrenOf } = useMemo(() => {
    const childrenOf = new Map()
    for (const c of all) {
      const [primary] = lineageParents(c)
      if (!primary) continue
      if (!childrenOf.has(primary)) childrenOf.set(primary, [])
      childrenOf.get(primary).push(c)
    }
    const roots = all.filter((c) => lineageParents(c).length === 0 && childrenOf.has(c.id))
    return { roots, childrenOf }
  }, [all])

  return (
    <>
      <Section id="studio.lineages.lines" title={`Lines (${roots.length})`} level={2}>
        {roots.length === 0 ? (
          <p className="panel__empty">
            No character has grown out of another yet. Link one below, or pick
            “grows out of” on a new character's signature card in the set builder.
          </p>
        ) : (
          <ul className="lineage">
            {roots.map((r) => <LineageNode key={r.id} c={r} all={all} childrenOf={childrenOf} depth={0} />)}
          </ul>
        )}
      </Section>

      {onAddCharacter && all.length > 0 && (
        <Section id="studio.lineages.link" title="Link a new character" level={2}>
          <LinkForm all={all} onAdd={onAddCharacter} />
        </Section>
      )}

      <Section id="studio.lineages.kinds" title="Kinds of lineage" level={2} defaultOpen={false}>
        <p className="panel__lede">
          Seven shapes, each borrowed from a real card game. A kind that retires
          the predecessor hands over more fame; one that keeps both prints hands
          over less.
        </p>
        {LINEAGE_KINDS.map((k) => (
          <Section key={k.id} id={`studio.lineages.kind.${k.id}`} title={k.name} level={3} defaultOpen={false} summary={k.short}>
            <p className="field__note"><em>{k.precedent}</em></p>
            <p className="field__note">{k.blurb}</p>
            <ul className="lineage__rules">
              <li>Inherits {Math.round(k.fameInherit * 100)}% of {k.parents === 2 ? 'each parent’s' : 'the parent’s'} fame</li>
              <li>Takes {archetypeRuleText(k)}</li>
              <li>{k.retiresParent ? 'The predecessor steps aside — no new printings' : 'Both stay in print'}</li>
              {k.fameLinked && <li>Fame moves with the base form every week</li>}
              {k.parents === 2 && <li>Needs two parents</li>}
            </ul>
          </Section>
        ))}
      </Section>
    </>
  )
}

function LineageNode({ c, all, childrenOf, depth }) {
  const kind = getLineageKind(c.lineageKindId)
  const parents = lineageParents(c)
  const other = parents.length > 1 ? all.find((x) => x.id === parents[1]) : null
  const kids = childrenOf.get(c.id) ?? []
  return (
    <li className="lineage__node" style={{ '--depth': depth }}>
      <div className={'lineage__row' + (c.retiredWeek ? ' is-retired' : '')}>
        <span className="lineage__name">{c.name}</span>
        <span className="lineage__meta">
          {getArchetype(c.archetypeId).name} · fame {Math.round(c.fame)}
          {c.retiredWeek ? ' · stepped aside' : ''}
        </span>
        {kind && (
          <span className="lineage__kind" title={kind.short}>
            {kind.name}{other ? ` with ${other.name}` : ''}
          </span>
        )}
      </div>
      {kids.length > 0 && (
        <ul className="lineage">
          {kids.map((k) => <LineageNode key={k.id} c={k} all={all} childrenOf={childrenOf} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  )
}

// The link form: kind, parent(s), then the same identity fields the Cast
// panel's form takes. The archetype picker is filtered by the kind's rule so
// the player never picks one the reducer would refuse.
function LinkForm({ all, onAdd }) {
  const [kindId, setKindId] = useState('promotion')
  const [parentId, setParentId] = useState('')
  const [secondId, setSecondId] = useState('')
  const [name, setName] = useState('')
  const [archetypeId, setArchetypeId] = useState('unaligned')
  const [traits, setTraits] = useState([])
  const [hook, setHook] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [species, setSpecies] = useState('')

  const kind = getLineageKind(kindId)
  const eligible = all.filter((c) => !c.retiredWeek)
  const parent = all.find((c) => c.id === parentId)
  const parentIds = kind?.parents === 2 ? [parentId, secondId] : [parentId]
  const error = validateLineage(all, { kindId, parentIds, archetypeId })
  const archetypeFilter = parent ? (id) => archetypeAllowed(kind, parent.archetypeId, id) : null

  const pickParent = (id) => {
    setParentId(id)
    // A kind that pins the archetype snaps the picker to the parent's, so the
    // form is never refused for a choice it made itself.
    const p = all.find((c) => c.id === id)
    if (p && kind && !archetypeAllowed(kind, p.archetypeId, archetypeId)) {
      const firstOk = kind.archetypeRule.type === 'same' ? p.archetypeId : null
      if (firstOk) setArchetypeId(firstOk)
    }
  }

  const toggleTrait = (id) => {
    setTraits((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : cur.length >= MAX_TRAITS ? cur : [...cur, id]))
  }

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || error) return
    onAdd(name, { archetypeId, traits, hook, pronouns, species }, { kindId, parentIds })
    setName(''); setTraits([]); setHook(''); setPronouns(''); setSpecies('')
    setParentId(''); setSecondId('')
  }

  return (
    <form className="roster__addform charsheet__addform" onSubmit={submit}>
      <label className="field field--full">
        <span>Kind</span>
        <select value={kindId} onChange={(e) => { setKindId(e.target.value); setSecondId('') }}>
          {LINEAGE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.name} — {k.short}</option>
          ))}
        </select>
        {kind && <span className="field__note">{kind.blurb}</span>}
      </label>

      <label className="field field--full">
        <span>{kind?.parents === 2 ? 'First parent' : 'Grows out of'}</span>
        <select value={parentId} onChange={(e) => pickParent(e.target.value)}>
          <option value="">— pick a character —</option>
          {eligible.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({getArchetype(c.archetypeId).name}, fame {Math.round(c.fame)})</option>
          ))}
        </select>
      </label>

      {kind?.parents === 2 && (
        <label className="field field--full">
          <span>Second parent</span>
          <select value={secondId} onChange={(e) => setSecondId(e.target.value)}>
            <option value="">— pick a character —</option>
            {eligible.filter((c) => c.id !== parentId).map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({getArchetype(c.archetypeId).name}, fame {Math.round(c.fame)})</option>
            ))}
          </select>
        </label>
      )}

      <input
        className="roster__addinput"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New character name"
      />

      <ArchetypeSelect value={archetypeId} onChange={setArchetypeId} filter={archetypeFilter} />
      <TraitPicker traits={traits} onToggle={toggleTrait} archetypeId={archetypeId} />

      <label className="field field--full">
        <span>Hook <span className="muted">(one line that says who they are)</span></span>
        <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="e.g. Never raises their voice." />
      </label>

      <div className="sigcard__row sigcard__controls">
        <label className="field">
          <span>Pronouns</span>
          <input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="they/them" />
        </label>
        <label className="field">
          <span>Epithet <span className="muted">(optional)</span></span>
          <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="the Ashen" />
        </label>
      </div>

      {error && parentId && <p className="field__note is-warn">{error}</p>}
      {!error && parent && kind && (
        <p className="field__note">
          Debuts with about {Math.round(12 + parentIds.reduce((s, id) => s + (all.find((c) => c.id === id)?.fame ?? 0) * kind.fameInherit, 0))} fame.
          {kind.retiresParent ? ` ${parent.name} steps aside.` : ''}
        </p>
      )}

      <button className="btn btn--ghost" type="submit" disabled={!name.trim() || !!error}>+ Link character</button>
    </form>
  )
}
