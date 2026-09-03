// Cast — the persistent character roster, invisible everywhere else in the
// shipped UI even though fame drifts every week and feeds straight into set
// design: it gates icon-treatment eligibility (see characters.js's
// famePopBonus/TREATMENTS). Characters can also be created here directly (no
// card required), so a fresh company can staff a roster before its first
// release instead of only minting one mid-signature-card in the builder. The
// artist roster moved to Business › Illustrators (IllustratorsPanel).
//
// The character half used to show the top FIVE by fame and nothing else — no
// search, no filter, and no way to click through to a character. A cast the
// player cannot browse is a cast they cannot get attached to, so it now uses the
// filter/search/sort pattern PersonasPanel established (and CardBrowser already
// copied), and every row opens the full sheet in CharacterDetail.
//
// IT LISTS CHARACTERS, NOT PRINTINGS. A character is one person printed in many
// forms (people.js): Aryla, Destined Trainee and Royal Commander Aryla are one
// woman. Listing the character RECORDS put five Arylas in the roster and no
// Aryla, which reads as five unrelated people and is the exact confusion this
// layer exists to remove. So a row is a character, its bar is recognition, and it
// expands to the forms — each of which still opens its own sheet.

import { useMemo, useState } from 'react'
import { getArchetype, ARCHETYPE_CATEGORIES } from '../game/content/archetypes.js'
import { MAX_TRAITS } from '../game/content/traits.js'
import CharacterDetail, { ArchetypeSelect, TraitPicker } from './CharacterDetail.jsx'
import PersonDetail from './cast/PersonDetail.jsx'
import { DemeanorPicker } from './cast/FormTree.jsx'
import { formLabel, WIDELY_KNOWN_RECOGNITION } from '../game/people.js'
import Section from './nav/Section.jsx'

const CHAR_TRAJ_LABEL = { rising: 'Rising', established: 'Established', icon: 'Icon', fading: 'Fading' }

// Filter chips: All, then each archetype category, so twelve archetypes stay
// scannable without twelve chips. 'unaligned' is reachable through its own
// category like any other.
// DERIVED from the archetype table, not restated here. This was a hand-kept copy
// of the four categories, which meant adding one to content/archetypes.js left it
// filterable nowhere — the characters were still in "All" and could not be found
// any other way, silently, with nothing to notice it by.
const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  ...ARCHETYPE_CATEGORIES.map((c) => ({ id: c.id, label: c.name })),
]

function trajClass(t) {
  if (t === 'icon' || t === 'established') return 'mood--good'
  if (t === 'fading') return 'mood--bad'
  return 'mood--neutral'
}

function CastRow({ name, sub, pct, pctTitle, trajectory, label, onOpen }) {
  const Head = onOpen ? 'button' : 'div'
  return (
    <li className="roster__row">
      <Head
        className="roster__head"
        style={onOpen ? undefined : { cursor: 'default' }}
        onClick={onOpen}
        title={onOpen ? `Open ${name}'s sheet` : undefined}
      >
        <div className="roster__main">
          <span className="roster__name">{name}</span>
          {sub && <span className="roster__type">{sub}</span>}
        </div>
        <div className="roster__meta">
          <span className="roster__reach" title={pctTitle}>
            <span className="bar"><span className="bar__fill" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} /></span>
          </span>
          <span className={`roster__mood ${trajClass(trajectory)}`}>{label ?? trajectory}</span>
        </div>
      </Head>
    </li>
  )
}

export default function CastPanel({ state, onAddCharacter, onUpdateCharacter, onUpdatePerson }) {
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('fame')
  const [query, setQuery] = useState('')
  const [openPersonId, setOpenPersonId] = useState(null)
  const [openFormId, setOpenFormId] = useState(null)

  const forms = state.characters ?? []
  const people = state.people ?? []

  // One row per CHARACTER, carrying its forms and the form doing best — which is
  // the one whose archetype and trajectory the row should describe, because it is
  // the one the audience is currently looking at.
  const rows = useMemo(() => {
    const byPerson = new Map()
    for (const f of forms) {
      const key = f.personId ?? f.id
      if (!byPerson.has(key)) byPerson.set(key, [])
      byPerson.get(key).push(f)
    }
    const q = query.trim().toLowerCase()
    return people
      .map((p) => {
        const mine = byPerson.get(p.id) ?? []
        const live = mine.filter((f) => !f.retiredWeek)
        const best = (live.length ? live : mine).reduce(
          (top, f) => ((f.fame ?? 0) > (top?.fame ?? -1) ? f : top), null,
        )
        return { person: p, forms: mine, best }
      })
      .filter((r) => r.best)
      // The archetype filter reads the character's leading form: a filter that
      // matched ANY form would put Aryla under every category she has ever taken,
      // which is most of them by the end of a long line.
      .filter((r) => category === 'all' || getArchetype(r.best.archetypeId).category === category)
      // Search reaches every form's name, so typing "Divine" still finds Aryla
      // even though the character is not called that.
      .filter((r) => !q
        || r.person.name.toLowerCase().includes(q)
        || r.forms.some((f) => f.name.toLowerCase().includes(q))
        || getArchetype(r.best.archetypeId).name.toLowerCase().includes(q))
      .sort(
        sort === 'name' ? (a, b) => a.person.name.localeCompare(b.person.name)
          : sort === 'recent' ? (a, b) => b.forms.reduce((n, f) => n + (f.appearances?.length ?? 0), 0)
              - a.forms.reduce((n, f) => n + (f.appearances?.length ?? 0), 0)
          : (a, b) => (b.person.recognition ?? 0) - (a.person.recognition ?? 0),
      )
  }, [forms, people, category, sort, query])

  const openPerson = openPersonId ? people.find((p) => p.id === openPersonId) : null
  const openForm = openFormId ? forms.find((c) => c.id === openFormId) : null

  return (
    <Section id="studio.cast" title={`Cast (${people.length})`} level={2}>

      {people.length > 1 && (
        <div className="roster__controls">
          <div className="roster__filters">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.id}
                className={'roster__chip' + (category === f.id ? ' is-active' : '')}
                onClick={() => setCategory(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="roster__tools">
            <input
              className="roster__search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cast…"
            />
            <select className="roster__sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="fame">Recognition</option>
              <option value="name">Name</option>
              <option value="recent">Printings</option>
            </select>
          </div>
        </div>
      )}

      {people.length > 0 && rows.length === 0 && (
        <p className="panel__empty">No characters match.</p>
      )}

      {rows.length > 0 && (
        <ul className="roster">
          {rows.map(({ person, forms: mine, best }) => {
            const archetype = getArchetype(best.archetypeId)
            const known = (person.recognition ?? 0) >= WIDELY_KNOWN_RECOGNITION
            // "best known as", not "currently": `best` is the form with the
            // highest fame, which is the one the audience has in mind — not
            // necessarily the one printed most recently.
            const sub = mine.length > 1
              ? `${mine.length} forms · best known as ${best.formName || formLabel(person, best)}`
              : (best.species ? `${archetype.name} · ${best.species}` : archetype.name)
            return (
              <CastRow
                key={person.id}
                name={person.name}
                sub={sub}
                pct={person.recognition}
                pctTitle={`Recognition ${Math.round(person.recognition ?? 0)}`}
                trajectory={known ? 'established' : best.trajectory}
                label={mine.length > 1
                  ? (known ? 'Known' : 'Building')
                  : (CHAR_TRAJ_LABEL[best.trajectory] ?? best.trajectory)}
                onOpen={() => setOpenPersonId(person.id)}
              />
            )
          })}
        </ul>
      )}

      {onAddCharacter && <NewCharacterForm onAdd={onAddCharacter} />}

      {openPerson && (
        <PersonDetail
          person={openPerson}
          state={state}
          onClose={() => setOpenPersonId(null)}
          onUpdatePerson={onUpdatePerson}
          onOpenForm={(id) => setOpenFormId(id)}
        />
      )}

      {/* A form's own sheet sits ON TOP of the character's, rather than
          replacing it: the character sheet is where you came from and where
          closing this should put you back. */}
      {openForm && (
        <CharacterDetail
          character={openForm}
          state={state}
          onClose={() => setOpenFormId(null)}
          onUpdate={onUpdateCharacter}
        />
      )}
    </Section>
  )
}

// Mint a character with no card attached yet — the same record a signature
// card's "new character" request creates at release (see characters.js's
// createCharacter), just available before you've released anything at all.
//
// Collapsed to a single name field until the player commits to a name, so the
// panel is not dominated by a form on a run with no cast yet.
function NewCharacterForm({ onAdd }) {
  const [name, setName] = useState('')
  const [archetypeId, setArchetypeId] = useState('unaligned')
  const [traits, setTraits] = useState([])
  const [hook, setHook] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [species, setSpecies] = useState('')
  const [demeanorIds, setDemeanorIds] = useState([])

  const toggleTrait = (id) => {
    setTraits((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : cur.length >= MAX_TRAITS ? cur : [...cur, id]))
  }
  const toggleDemeanor = (id) => {
    setDemeanorIds((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : cur.length >= 2 ? cur : [...cur, id]))
  }

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name, { archetypeId, traits, hook, pronouns, species, demeanorIds })
    setName('')
    setArchetypeId('unaligned')
    setTraits([])
    setHook('')
    setPronouns('')
    setSpecies('')
    setDemeanorIds([])
  }

  return (
    <form className="roster__addform charsheet__addform" onSubmit={submit}>
      <input
        className="roster__addinput"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New character name, e.g. Aryla, Destined Trainee"
      />

      {name.trim() && (
        <>
          {/* The name above is the CARD's. The character's name is taken from the
              half before the comma, the way this genre has always written a card
              face: "Aryla, Destined Trainee" is Aryla. Rename the character on
              her own sheet afterwards if the guess is wrong. */}
          {name.includes(',') && (
            <p className="field__note">
              The character will be called <strong>{name.split(',')[0].trim()}</strong>,
              and this card is her <strong>{name.split(',').slice(1).join(',').trim()}</strong> form.
            </p>
          )}
          <ArchetypeSelect value={archetypeId} onChange={setArchetypeId} />
          <TraitPicker traits={traits} onToggle={toggleTrait} archetypeId={archetypeId} />
          <DemeanorPicker demeanors={demeanorIds} onToggle={toggleDemeanor} />

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
        </>
      )}

      <button className="btn btn--ghost" type="submit" disabled={!name.trim()}>+ Add character</button>
    </form>
  )
}
