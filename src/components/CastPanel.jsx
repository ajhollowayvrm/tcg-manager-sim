// Cast & Artists — the persistent character roster and the artist roster's
// live career drift, both invisible everywhere else in the shipped UI even
// though they drift every week and feed straight into set design: fame gates
// icon-treatment eligibility (see characters.js's famePopBonus/TREATMENTS) and
// an artist's live cost/reach changes what a new signature card actually costs
// (see artists.js's currentArtist). Characters can also be created here
// directly (no card required), so a fresh company can staff a roster before its
// first release instead of only minting one mid-signature-card in the builder.
//
// The character half used to show the top FIVE by fame and nothing else — no
// search, no filter, and no way to click through to a character. A cast the
// player cannot browse is a cast they cannot get attached to, so it now uses the
// filter/search/sort pattern PersonasPanel established (and CardBrowser already
// copied), and every row opens the full sheet in CharacterDetail.

import { useMemo, useState } from 'react'
import { getArtist } from '../game/content/artists.js'
import { getArchetype } from '../game/content/archetypes.js'
import { MAX_TRAITS } from '../game/content/traits.js'
import CharacterDetail, { ArchetypeSelect, TraitPicker } from './CharacterDetail.jsx'

const CHAR_TRAJ_LABEL = { rising: 'Rising', established: 'Established', icon: 'Icon', fading: 'Fading' }
const ARTIST_TRAJ_LABEL = { rising: 'Rising', steady: 'Steady', established: 'Established', fading: 'Fading' }
const MAX_ROWS = 5

// Filter chips: All, then each archetype category, so twelve archetypes stay
// scannable without twelve chips. 'unaligned' is reachable through its own
// category like any other.
const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'faces', label: 'Faces' },
  { id: 'antagonists', label: 'Antagonists' },
  { id: 'mythic', label: 'Mythic' },
  { id: 'supporting', label: 'Supporting' },
]

const CHAR_SORTS = {
  fame: (a, b) => b.fame - a.fame,
  name: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => (b.appearances?.length ?? 0) - (a.appearances?.length ?? 0),
}

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

export default function CastPanel({ state, onAddCharacter, onUpdateCharacter }) {
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('fame')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)

  const all = state.characters ?? []

  const characters = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((c) => category === 'all' || getArchetype(c.archetypeId).category === category)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || getArchetype(c.archetypeId).name.toLowerCase().includes(q))
      .sort(CHAR_SORTS[sort])
  }, [all, category, sort, query])

  const artists = [...(state.artists ?? [])]
    .map((a) => ({ ...a, name: getArtist(a.id)?.name ?? a.id }))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, MAX_ROWS)

  const open = openId ? all.find((c) => c.id === openId) : null

  return (
    <div className="panel">
      <h2 className="panel__title">Cast &amp; Artists</h2>

      <h3 className="panel__subtitle">Characters ({all.length})</h3>

      {all.length > 1 && (
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
              <option value="fame">Fame</option>
              <option value="name">Name</option>
              <option value="recent">Printings</option>
            </select>
          </div>
        </div>
      )}

      {all.length > 0 && characters.length === 0 && (
        <p className="panel__empty">No characters match.</p>
      )}

      {characters.length > 0 && (
        <ul className="roster">
          {characters.map((c) => {
            const archetype = getArchetype(c.archetypeId)
            // The archetype is the identity now; the old free-text epithet rides
            // behind it when the player kept one.
            const sub = c.species ? `${archetype.name} · ${c.species}` : archetype.name
            return (
              <CastRow
                key={c.id}
                name={c.name}
                sub={sub}
                pct={c.fame}
                pctTitle={`Fame ${Math.round(c.fame)}`}
                trajectory={c.trajectory}
                label={CHAR_TRAJ_LABEL[c.trajectory] ?? c.trajectory}
                onOpen={() => setOpenId(c.id)}
              />
            )
          })}
        </ul>
      )}

      {onAddCharacter && <NewCharacterForm onAdd={onAddCharacter} />}

      {artists.length > 0 && (
        <>
          <h3 className="panel__subtitle">Artists, by reach</h3>
          <ul className="roster">
            {artists.map((a) => (
              <CastRow
                key={a.id}
                name={a.name}
                pct={a.reach}
                pctTitle={`Reach ${Math.round(a.reach)}`}
                trajectory={a.trajectory}
                label={ARTIST_TRAJ_LABEL[a.trajectory] ?? a.trajectory}
              />
            ))}
          </ul>
        </>
      )}

      {open && (
        <CharacterDetail
          character={open}
          state={state}
          onClose={() => setOpenId(null)}
          onUpdate={onUpdateCharacter}
        />
      )}
    </div>
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

  const toggleTrait = (id) => {
    setTraits((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : cur.length >= MAX_TRAITS ? cur : [...cur, id]))
  }

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name, { archetypeId, traits, hook, pronouns, species })
    setName('')
    setArchetypeId('unaligned')
    setTraits([])
    setHook('')
    setPronouns('')
    setSpecies('')
  }

  return (
    <form className="roster__addform charsheet__addform" onSubmit={submit}>
      <input
        className="roster__addinput"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New character name"
      />

      {name.trim() && (
        <>
          <ArchetypeSelect value={archetypeId} onChange={setArchetypeId} />
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
        </>
      )}

      <button className="btn btn--ghost" type="submit" disabled={!name.trim()}>+ Add character</button>
    </form>
  )
}
