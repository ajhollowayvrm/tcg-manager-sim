// A character's full sheet — the one place in the game where a member of the
// cast is a PERSON rather than a row.
//
// Everywhere else a character is a name, a bar and one of four trajectory words.
// That is enough to make a decision with and nowhere near enough to get attached
// to, which is the whole point of a recurring cast. This view carries the things
// that make one memorable: who they are (archetype, traits, a hook), what has
// happened to them (a beats timeline, a year of fame history) and what they have
// actually been printed on.
//
// The identity half is EDITABLE here. A character is the player's own IP, so the
// hook, traits, pronouns, epithet, name and archetype can all be revised between
// eras. Fame, trajectory, appearances and beats are earned and are read-only —
// see the UPDATE_CHARACTER case in reducer.js, which enforces exactly that split.

import { useState } from 'react'
import { useModal } from './useModal.js'
import Chart from './Chart.jsx'
import { getArchetype, archetypeMatchesTheme, archetypesByCategory } from '../game/content/archetypes.js'
import { promotionChain } from '../game/characters.js'
import { TRAITS, MAX_TRAITS, getTrait } from '../game/content/traits.js'
import { getTreatment } from '../game/characters.js'
import { getTheme } from '../game/content/themes.js'

const TRAJ_LABEL = { rising: 'Rising', established: 'Established', icon: 'Icon', fading: 'Fading' }
const TRAJ_BLURB = {
  rising: 'Still building. Every printing counts double right now.',
  established: 'A name people know. Fame moves slowly in both directions.',
  icon: 'A household face. Unlocks the icon treatment and the reserved chase slots.',
  fading: 'Out of the conversation. A sustained run of good cards can turn it around.',
}

// The beats timeline's cue per kind. Mirrors the mood classes used across the
// roster panels rather than inventing a second vocabulary.
const BEAT_CUE = {
  debut: { icon: '◆', cls: 'mood--neutral' },
  breakout: { icon: '↑', cls: 'mood--good' },
  icon: { icon: '★', cls: 'mood--good' },
  fall: { icon: '↓', cls: 'mood--bad' },
  comeback: { icon: '⟲', cls: 'mood--good' },
  promotion: { icon: '⇧', cls: 'mood--good' },
  succeeded: { icon: '⇥', cls: 'mood--neutral' },
}

function money(n) { return '$' + Math.round(n).toLocaleString('en-US') }

export default function CharacterDetail({ character, state, onClose, onUpdate }) {
  const modalRef = useModal(onClose)
  const [editing, setEditing] = useState(false)
  if (!character) return null

  const archetype = getArchetype(character.archetypeId)
  const cards = (state.cards ?? []).filter((c) => c.characterId === character.id)
  const setName = (id) => (state.sets ?? []).find((s) => s.id === id)?.name ?? 'an unreleased set'
  const debutSet = character.debutSetId ? setName(character.debutSetId) : null

  // The card that actually made them, by what the market says today.
  const best = cards.reduce((top, c) => ((c.singlePrice ?? 0) > (top?.singlePrice ?? 0) ? c : top), null)

  // Which sets still in print suit this archetype — the actionable half of the
  // theme-cohesion bonus, told as "where they belong" rather than as a number.
  const onThemeSets = (state.sets ?? [])
    .filter((s) => !s.outOfPrint && archetypeMatchesTheme(character.archetypeId, getTheme(s.themeId)?.tags))
    .map((s) => s.name)

  const history = character.fameHistory ?? []
  const labels = history.map((_, i) => state.week - history.length + 1 + i)

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal__sheet" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="charsheet-title">
        <header className="modal__head">
          <h2 id="charsheet-title">
            {character.name}
            {character.species && <span className="charsheet__epithet"> — {character.species}</span>}
          </h2>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close character sheet">✕</button>
        </header>

        <div className="modal__body">
          {/* ---- Identity ---------------------------------------------- */}
          <div className="charsheet__identity">
            <span className="charsheet__archetype" title={archetype.blurb}>{archetype.name}</span>
            {character.pronouns && <span className="charsheet__pronouns">{character.pronouns}</span>}
            <span className={'roster__mood ' + (character.trajectory === 'fading' ? 'mood--bad' : character.trajectory === 'rising' ? 'mood--neutral' : 'mood--good')}>
              {TRAJ_LABEL[character.trajectory] ?? character.trajectory}
            </span>
            <span className="charsheet__fame">Fame {Math.round(character.fame)}</span>
          </div>

          {(character.traits ?? []).length > 0 && (
            <div className="charsheet__traits">
              {character.traits.map((id) => {
                const t = getTrait(id)
                return t ? <span key={id} className="roster__chip is-active" title={t.blurb}>{t.name}</span> : null
              })}
            </div>
          )}

          {character.hook && <p className="charsheet__hook">“{character.hook}”</p>}

          {/* The promotion chain — who this character grew out of. Two roster
              entries, one story: Kell, Broken Boy into Kell, Royal Soldier. */}
          {(() => {
            const chain = promotionChain(state.characters ?? [], character.id)
            const successors = (state.characters ?? []).filter((c) => c.promotedFromId === character.id)
            if (!chain.length && !successors.length) return null
            return (
              <p className="charsheet__lineage">
                {chain.length > 0 && (
                  <>Grew out of <strong>{chain.map((c) => c.name).join(' → ')}</strong>.{' '}</>
                )}
                {successors.length > 0 && (
                  <>The story carries on as <strong>{successors.map((c) => c.name).join(', ')}</strong>.</>
                )}
              </p>
            )
          })()}

          <p className="field__note">{archetype.blurb}</p>
          <p className="field__note">{TRAJ_BLURB[character.trajectory]}</p>

          {onUpdate && !editing && (
            <button className="btn btn--ghost" onClick={() => setEditing(true)}>✎ Edit identity</button>
          )}
          {onUpdate && editing && (
            <IdentityEditor
              character={character}
              onCancel={() => setEditing(false)}
              onSave={(patch) => { onUpdate(character.id, patch); setEditing(false) }}
            />
          )}

          {/* ---- Fame history ------------------------------------------ */}
          <div className="builder__section">
            <h3 className="builder__h3">Fame</h3>
            {history.length > 1 ? (
              <Chart
                series={[{ key: 'fame', label: 'Fame', color: 'var(--pop)', points: history }]}
                labels={labels}
                height={120}
              />
            ) : (
              <p className="panel__empty">No history yet — advance a few weeks.</p>
            )}
          </div>

          {/* ---- The story --------------------------------------------- */}
          <div className="builder__section">
            <h3 className="builder__h3">Story</h3>
            {(character.beats ?? []).length === 0 ? (
              <p className="panel__empty">
                Nothing has happened to {character.name} yet. Print them and see.
              </p>
            ) : (
              <ul className="charsheet__beats">
                {[...character.beats].reverse().map((b, i) => {
                  const cue = BEAT_CUE[b.kind] ?? BEAT_CUE.debut
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
          </div>

          {/* ---- Printings --------------------------------------------- */}
          <div className="builder__section">
            <h3 className="builder__h3">Printings ({(character.appearances ?? []).length})</h3>
            {debutSet && (
              <p className="field__note">
                Debuted in {debutSet}
                {character.debutWeek != null && ` in week ${character.debutWeek}`}.
              </p>
            )}
            {best && (
              <p className="field__note">
                Their best card is <strong>{best.name}</strong>, at {money(best.singlePrice ?? 0)}.
              </p>
            )}
            {(character.appearances ?? []).length === 0 ? (
              <p className="panel__empty">Not printed yet. Feature them on a signature card in the set builder.</p>
            ) : (
              <ul className="roster">
                {[...character.appearances].reverse().map((a, i) => {
                  const card = cards.find((c) => c.id === a.cardId)
                  return (
                    <li key={`${a.cardId}-${i}`} className="roster__row">
                      <div className="roster__head" style={{ cursor: 'default' }}>
                        <div className="roster__main">
                          <span className="roster__name">{card?.name ?? 'A card'}</span>
                          <span className="roster__type">{setName(a.setId)} · {getTreatment(a.treatment).name}</span>
                        </div>
                        {card && <span className="roster__meta">{money(card.singlePrice ?? 0)}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ---- Where they belong ------------------------------------- */}
          {archetype.tags.length > 0 && (
            <div className="builder__section">
              <h3 className="builder__h3">Where they fit</h3>
              <p className="field__note">
                A {archetype.name.toLowerCase()} reads as an on-theme printing in a set themed around{' '}
                {archetype.tags.join(', ')} — worth a real bump to a card's appeal.
              </p>
              {onThemeSets.length > 0 && (
                <p className="field__note">Currently in print and on-theme: {onThemeSets.join(', ')}.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// The editable half of the sheet. Kept local: it holds a draft until the player
// saves, so a half-typed hook never reaches the reducer.
function IdentityEditor({ character, onSave, onCancel }) {
  const [name, setName] = useState(character.name)
  const [archetypeId, setArchetypeId] = useState(character.archetypeId)
  // A printed character's archetype is fixed. The reducer enforces this; the
  // editor mirrors it so the player is never shown a control that does nothing.
  const locked = !!character.debutSetId
  const [traits, setTraits] = useState(character.traits ?? [])
  const [hook, setHook] = useState(character.hook ?? '')
  const [pronouns, setPronouns] = useState(character.pronouns ?? '')
  const [species, setSpecies] = useState(character.species ?? '')

  const toggleTrait = (id) => {
    setTraits((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : cur.length >= MAX_TRAITS ? cur : [...cur, id]))
  }

  return (
    <div className="charsheet__editor">
      <label className="field field--full">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {/* The archetype locks on debut — see the UPDATE_CHARACTER case in
          reducer.js for why. Shown as a locked field rather than hidden, so the
          player can still read what this character IS and why it cannot move. */}
      {locked ? (
        <div className="field field--full">
          <span>Archetype <span className="muted">(locked — they are in print)</span></span>
          <p className="charsheet__locked">{getArchetype(archetypeId).name}</p>
          <span className="field__note">
            An archetype is fixed once a character has a debut set. It decides which
            themes they suit and how their fame moves, so it cannot be re-picked to
            match whatever set you are building next.
          </span>
        </div>
      ) : (
        <ArchetypeSelect value={archetypeId} onChange={setArchetypeId} />
      )}

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

      <div className="settings__row">
        <button className="btn" onClick={() => onSave({ name, archetypeId, traits, hook, pronouns, species })}>Save</button>
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// The archetype dropdown, grouped by category. Shared by this editor and the
// Cast panel's creation form, so the two pickers can never drift apart.
export function ArchetypeSelect({ value, onChange, label = 'Archetype' }) {
  const groups = archetypesByCategory()
  const chosen = getArchetype(value)
  return (
    <label className="field field--full">
      <span>{label}</span>
      <select value={chosen.id} onChange={(e) => onChange(e.target.value)}>
        {groups.map(({ category, archetypes }) => (
          <optgroup key={category.id} label={category.name}>
            {archetypes.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="field__note">{chosen.blurb}</span>
    </label>
  )
}

// Up to MAX_TRAITS, as chips. The archetype's own hints sort first, so the
// suggested temperaments are the ones under the cursor — without ever being the
// only ones on offer.
export function TraitPicker({ traits, onToggle, archetypeId }) {
  const hints = getArchetype(archetypeId).traitHints
  const ordered = [...TRAITS].sort((a, b) => (hints.includes(b.id) ? 1 : 0) - (hints.includes(a.id) ? 1 : 0))
  const full = traits.length >= MAX_TRAITS
  return (
    <div className="field field--full">
      <span>Traits <span className="muted">(up to {MAX_TRAITS} — the community will mention them)</span></span>
      <div className="roster__filters charsheet__traitpicker">
        {ordered.map((t) => {
          const on = traits.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              className={'roster__chip' + (on ? ' is-active' : '')}
              disabled={!on && full}
              title={t.blurb}
              onClick={() => onToggle(t.id)}
            >
              {t.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
