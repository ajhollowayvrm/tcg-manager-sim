// Studio › Lineages — the ways one form of a character grows into another, the
// lines the cast has already formed, and a form to link a new one without waiting
// for a signature card. See content/lineages.js for the catalogue, characters.js
// for the link mechanics, and people.js for what a line MEANS: a run of
// same-being links is one character, and the tree drawn here is her story.
//
// A fusion or a successor is the exception — those start a NEW character who
// descends from the old one, which is why the kinds reference below says so on
// every card.

import { useMemo, useState } from 'react'
import { LINEAGE_KINDS, getLineageKind, archetypeRuleText, archetypeAllowed } from '../game/content/lineages.js'
import { getArchetype } from '../game/content/archetypes.js'
import { MAX_TRAITS } from '../game/content/traits.js'
import { lineageParents, validateLineage } from '../game/characters.js'
import { ArchetypeSelect, TraitPicker } from './CharacterDetail.jsx'
import { treeIndex, FormNode, DemeanorPicker, ContinuityNote } from './cast/FormTree.jsx'
import Section from './nav/Section.jsx'

export default function LineagesPanel({ state, onAddCharacter }) {
  const all = state.characters ?? []
  const people = state.people ?? []

  // One tree per CHARACTER who has more than one form. Grouping by person rather
  // than by root form is what makes a branching story read as one story: Aryla's
  // fall and her promotion are two branches of one woman, not two lines that
  // happen to share a parent.
  const lines = useMemo(() => {
    const byPerson = new Map()
    for (const c of all) {
      const key = c.personId ?? c.id
      if (!byPerson.has(key)) byPerson.set(key, [])
      byPerson.get(key).push(c)
    }
    return people
      .map((p) => ({ person: p, forms: byPerson.get(p.id) ?? [] }))
      .filter((l) => l.forms.length > 1)
      .sort((a, b) => (b.person.recognition ?? 0) - (a.person.recognition ?? 0))
  }, [all, people])

  return (
    <>
      <Section id="studio.lineages.lines" title={`Lines (${lines.length})`} level={2}>
        {lines.length === 0 ? (
          <p className="panel__empty">
            No character has grown into another form yet. Link one below, or pick
            “grows out of” on a new character's signature card in the set builder.
          </p>
        ) : (
          lines.map(({ person, forms }) => {
            const { roots, childrenOf } = treeIndex(forms)
            return (
              <Section
                key={person.id}
                id={`studio.lineages.line.${person.id}`}
                title={person.name}
                level={3}
                summary={`${forms.length} forms · recognition ${Math.round(person.recognition ?? 0)}`}
              >
                {person.throughline && <p className="charsheet__hook">“{person.throughline}”</p>}
                <ul className="lineage">
                  {roots.map((r) => (
                    <FormNode key={r.id} form={r} all={forms} childrenOf={childrenOf} person={person} />
                  ))}
                </ul>
              </Section>
            )
          })
        )}
      </Section>

      {onAddCharacter && all.length > 0 && (
        <Section id="studio.lineages.link" title="Link a new form" level={2}>
          <LinkForm all={all} people={people} onAdd={onAddCharacter} />
        </Section>
      )}

      <Section id="studio.lineages.kinds" title="Kinds of lineage" level={2} defaultOpen={false}>
        <p className="panel__lede">
          Eight shapes, each borrowed from a real card game. A kind that retires
          the predecessor hands over more fame; one that keeps both prints hands
          over less. Six of them continue the same character — the other two start
          a new one.
        </p>
        {LINEAGE_KINDS.map((k) => (
          <Section key={k.id} id={`studio.lineages.kind.${k.id}`} title={k.name} level={3} defaultOpen={false} summary={k.short}>
            <p className="field__note"><em>{k.precedent}</em></p>
            <p className="field__note">{k.blurb}</p>
            <ul className="lineage__rules">
              <li>Inherits {Math.round(k.fameInherit * 100)}% of {k.parents === 2 ? 'each parent’s' : 'the parent’s'} fame</li>
              <li>Takes {archetypeRuleText(k)}</li>
              <li>{k.retiresParent
                ? 'The predecessor takes no new printings — but the story can still branch from it'
                : 'Both stay in print'}</li>
              {k.sameBeing
                ? <li>Still the same character — the forms share one recognition</li>
                : <li>A new character, descended from {k.parents === 2 ? 'both' : 'them'}</li>}
              {k.sameBeing && <li>Fans expect the personality to move about {Math.round(k.expectedDrift * 100)}% on this link</li>}
              {k.parents === 2 && <li>Needs two parents</li>}
            </ul>
          </Section>
        ))}
      </Section>
    </>
  )
}

// The link form: kind, parent(s), then the same identity fields the Cast
// panel's form takes. The archetype picker is filtered by the kind's rule so
// the player never picks one the reducer would refuse.
function LinkForm({ all, people, onAdd }) {
  const [kindId, setKindId] = useState('promotion')
  const [parentId, setParentId] = useState('')
  const [secondId, setSecondId] = useState('')
  const [name, setName] = useState('')
  const [archetypeId, setArchetypeId] = useState('unaligned')
  const [traits, setTraits] = useState([])
  const [hook, setHook] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [species, setSpecies] = useState('')
  const [demeanorIds, setDemeanorIds] = useState([])
  const [formName, setFormName] = useState('')
  const [carriesName, setCarriesName] = useState(true)

  const kind = getLineageKind(kindId)
  // EVERY form is eligible as a parent, including a retired one. Retirement
  // closes a path, not a character: a fall retires Royal Soldier, and Royal
  // Commander still has to be able to grow out of him afterwards or a story that
  // went two ways cannot be told at all. A retired form takes no new PRINTINGS —
  // the set builder's picker still enforces that — and takes new branches.
  const eligible = all
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
  const toggleDemeanor = (id) => {
    setDemeanorIds((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : cur.length >= 2 ? cur : [...cur, id]))
  }

  // The character this form will belong to, for the live continuity read below.
  // Only meaningful for a same-being kind: a fusion or a successor starts a new
  // character, who has no core to drift from yet.
  const parentPerson = kind?.sameBeing && parent
    ? (people ?? []).find((p) => p.id === parent.personId)
    : null

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || error) return
    onAdd(name, { archetypeId, traits, hook, pronouns, species, demeanorIds, formName, carriesName }, { kindId, parentIds })
    setName(''); setTraits([]); setHook(''); setPronouns(''); setSpecies('')
    setParentId(''); setSecondId(''); setDemeanorIds([]); setFormName(''); setCarriesName(true)
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
            <option key={c.id} value={c.id}>
              {c.name} ({getArchetype(c.archetypeId).name}, fame {Math.round(c.fame)}{c.retiredWeek ? ', retired' : ''})
            </option>
          ))}
        </select>
      </label>

      {kind?.parents === 2 && (
        <label className="field field--full">
          <span>Second parent</span>
          <select value={secondId} onChange={(e) => setSecondId(e.target.value)}>
            <option value="">— pick a character —</option>
            {eligible.filter((c) => c.id !== parentId).map((c) => (
              <option key={c.id} value={c.id}>
              {c.name} ({getArchetype(c.archetypeId).name}, fame {Math.round(c.fame)}{c.retiredWeek ? ', retired' : ''})
            </option>
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
      <DemeanorPicker demeanors={demeanorIds} onToggle={toggleDemeanor} />

      {parentPerson && (
        <ContinuityNote
          person={parentPerson}
          form={{ demeanorIds }}
          kindId={kindId}
        />
      )}

      <div className="sigcard__row sigcard__controls">
        <label className="field">
          <span>Form name <span className="muted">(optional)</span></span>
          <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Royal Commander" />
        </label>
        <label className="check">
          <input type="checkbox" checked={carriesName} onChange={(e) => setCarriesName(e.target.checked)} />
          <span>The card face carries the character's name</span>
        </label>
      </div>
      {!carriesName && parentPerson && (
        <p className="field__note">
          The room will take a while to work out this is {parentPerson.name}. When
          they do, it lands as a moment.
        </p>
      )}

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
          {kind.retiresParent ? ` ${parent.name} takes no new printings — the story can still branch from him.` : ''}
        </p>
      )}

      <button className="btn btn--ghost" type="submit" disabled={!name.trim() || !!error}>+ Link character</button>
    </form>
  )
}
