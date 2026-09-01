// Authoring an illustration set: a named group of cards in this release meant
// to be collected together. See game/illustrationsets.js for what the sim does
// with one.
//
// The pick list is deliberately the same control as SpotlightPicker's — the two
// answer the same question ("which cards in this release?") and there is no
// reason for a player to learn it twice.
//
// The COHESION READOUT is the important part of this component. Cohesion is what
// decides whether a group pays at all, and without a live per-requirement
// breakdown it is a hidden number a player can only probe by shipping a set and
// guessing. The readout scores the draft exactly the way release will, and shows
// the failing rows as instructions: "One illustrator ⚠" tells you what to fix.

import { useMemo } from 'react'
import {
  ILLUSTRATION_KINDS, getIllustrationKind, REQUIREMENT_LABELS,
} from '../../game/content/illustrationsets.js'
import { scoreCohesion, briefMatches } from '../../game/illustrationsets.js'
import { getRarity } from '../../game/rarities.js'
import NumberField from './NumberField.jsx'

export default function IllustrationSetEditor({
  spec, signatureCards, rarities, characters, openGroups, setId, week, onChange,
}) {
  const kind = getIllustrationKind(spec?.kindId)
  const mode = spec?.mode ?? 'none'
  const picks = spec?.picks ?? []
  const set = (patch) => onChange({ ...spec, ...patch })

  const continuing = mode === 'continue'
    ? openGroups.find((g) => g.id === spec.groupId) ?? null
    : null
  const activeKind = continuing ? getIllustrationKind(continuing.kindId) : kind

  // Score the draft the same way releaseSet's phase A does, so the number the
  // player is looking at is the number they will get.
  const preview = useMemo(() => {
    if (mode === 'none') return null
    const base = continuing ?? {
      kindId: kind.id,
      plannedSize: spec.plannedSize,
      members: [],
    }
    const brief = continuing ? continuing.artBrief : spec.artBrief
    const provisional = {
      ...base,
      members: [
        ...(base.members ?? []),
        ...picks
          .filter((p) => p.kind === 'signature' && signatureCards[p.ref])
          .map((p) => {
            const sig = signatureCards[p.ref]
            return {
              cardId: `draft_${p.ref}`,
              setId,
              week,
              artistId: sig.artistId ?? null,
              characterId: sig.characterId ?? null,
              valueTier: getRarity(rarities, sig.rarity).valueTier ?? 0,
              briefMatch: briefMatches(sig.artNotes, brief),
            }
          }),
      ],
    }
    return { ...scoreCohesion(provisional, { characters }), members: provisional.members.length }
  }, [mode, continuing, kind.id, spec?.plannedSize, spec?.artBrief, picks, signatureCards, rarities, characters, setId, week])

  const toggle = (ref) => {
    const has = picks.some((p) => p.kind === 'signature' && p.ref === ref)
    if (has) set({ picks: picks.filter((p) => !(p.kind === 'signature' && p.ref === ref)) })
    else set({ picks: [...picks, { kind: 'signature', ref }] })
  }

  if (mode === 'none') {
    return (
      <div className="ilset">
        <span className="field__note">
          A group of cards meant to be collected together — one character through
          successive forms, one illustrator's run, a scene broken across several
          cards. A coherent one lifts every card in it and the set's sealed
          demand; a run you announce and never finish costs you the room's trust.
        </span>
        <div className="ilset__actions">
          <button type="button" className="btn btn--ghost" onClick={() => set({ mode: 'open' })}>
            ✦ Open an illustration set
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!openGroups.length}
            title={openGroups.length ? undefined : 'No unfinished illustration sets to continue.'}
            onClick={() => set({ mode: 'continue', groupId: openGroups[0].id, picks: [] })}
          >
            ↳ Continue an open one
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ilset">
      <div className="ilset__actions">
        <button type="button" className="btn btn--ghost" onClick={() => set({ mode: 'none', picks: [], groupId: null })}>
          ✕ No illustration set this release
        </button>
        {mode === 'open' && !!openGroups.length && (
          <button type="button" className="btn btn--ghost" onClick={() => set({ mode: 'continue', groupId: openGroups[0].id, picks: [] })}>
            ↳ Continue an open one instead
          </button>
        )}
        {mode === 'continue' && (
          <button type="button" className="btn btn--ghost" onClick={() => set({ mode: 'open', groupId: null, picks: [] })}>
            ✦ Open a new one instead
          </button>
        )}
      </div>

      {mode === 'continue' ? (
        <label className="field field--full">
          <span>Continuing</span>
          <select value={spec.groupId ?? ''} onChange={(e) => set({ groupId: e.target.value })}>
            {openGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} — {g.members.length} of {g.plannedSize}, opened week {g.openedWeek}
              </option>
            ))}
          </select>
          {continuing && (
            <span className="field__note">
              {getIllustrationKind(continuing.kindId).name}
              {continuing.artBrief ? ` · brief: “${continuing.artBrief}”` : ''}
              {' · '}
              {Math.max(0, continuing.plannedSize - continuing.members.length)} still owed.
            </span>
          )}
        </label>
      ) : (
        <>
          <div className="ilset__kinds">
            {ILLUSTRATION_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={'ilset__kind' + (k.id === kind.id ? ' is-active' : '')}
                onClick={() => set({ kindId: k.id, plannedSize: k.defaultPlannedSize })}
              >
                <strong>{k.name}</strong>
                <span>{k.blurb}</span>
              </button>
            ))}
          </div>

          <div className="sigcard__row">
            <label className="field">
              <span>Name</span>
              <input
                value={spec.name ?? ''}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. The Kell Ascension"
              />
            </label>
            <label className="field" title={`A ${kind.noun} runs ${kind.minSize}–${kind.maxSize} cards.`}>
              <span>Cards promised</span>
              <NumberField
                value={spec.plannedSize ?? kind.defaultPlannedSize}
                min={kind.minSize}
                max={kind.maxSize}
                aria-label="Cards promised"
                onCommit={(n) => set({ plannedSize: n })}
              />
            </label>
          </div>

          <label className="field field--full">
            <span>Shared art brief</span>
            <input
              value={spec.artBrief ?? ''}
              onChange={(e) => set({ artBrief: e.target.value })}
              placeholder="e.g. frost river dusk"
            />
            <span className="field__note">
              The direction every card in the group answers to. A member whose own
              art direction shares a word with this reads as part of the same
              commission.
            </span>
          </label>
        </>
      )}

      <div className="spotlight__group">
        <h4 className="spotlight__title">
          Cards in this release
          {activeKind && (
            <span className="muted">
              {' '}— up to {activeKind.maxSize - (continuing?.members.length ?? 0)}
            </span>
          )}
        </h4>
        {signatureCards.length === 0 ? (
          <p className="panel__empty">No signature highlights designed yet.</p>
        ) : (
          signatureCards.map((c, i) => {
            const checked = picks.some((p) => p.kind === 'signature' && p.ref === i)
            return (
              <label key={i} className="check">
                <input type="checkbox" checked={checked} onChange={() => toggle(i)} />
                {c.name || `Signature card ${i + 1}`}
                <span className="muted"> · {getRarity(rarities, c.rarity).name}</span>
              </label>
            )
          })
        )}
      </div>

      {preview && <CohesionReadout preview={preview} kind={activeKind} />}
    </div>
  )
}

// Why a group scores what it scores. Each requirement the kind asks for, whether
// this draft satisfies it, and one line naming the weakest one so the player has
// something to act on rather than a number to stare at.
function CohesionReadout({ preview, kind }) {
  const pct = Math.round(preview.score * 100)
  const band = preview.score >= 0.75 ? 'is-good' : preview.score >= 0.45 ? 'is-mid' : 'is-poor'
  const rows = kind.requirements.map((r) => ({
    id: r.id,
    label: REQUIREMENT_LABELS[r.id] ?? r.id,
    value: preview.parts[r.id] ?? 0,
    weight: r.weight,
  }))
  // The most valuable thing to fix: the heaviest requirement that is furthest
  // from satisfied.
  const worst = [...rows].sort((a, b) => (1 - b.value) * b.weight - (1 - a.value) * a.weight)[0]

  return (
    <div className={'ilset__cohesion ' + band}>
      <div className="ilset__score">
        <strong>Cohesion {pct}%</strong>
        <span className="muted">
          {preview.members < 2
            ? ' — pick at least two cards'
            : preview.score >= 0.75
              ? ' — reads as a deliberate set'
              : preview.score >= 0.45
                ? ' — loosely connected'
                : ' — this is a group in name only'}
        </span>
      </div>
      <ul className="ilset__reqs">
        {rows.map((r) => (
          <li key={r.id} className={r.value >= 0.99 ? 'is-met' : r.value > 0 ? 'is-part' : 'is-unmet'}>
            <span className="ilset__reqmark">{r.value >= 0.99 ? '✓' : r.value > 0 ? '◐' : '⚠'}</span>
            {r.label}
          </li>
        ))}
      </ul>
      {preview.members >= 2 && worst && worst.value < 0.99 && (
        <span className="field__note">
          Weakest link: <strong>{worst.label}</strong>. {HINTS[worst.id] ?? ''}
        </span>
      )}
    </div>
  )
}

// What to actually do about a failing requirement. Phrased as the fix, not the
// diagnosis — the row above already said what is wrong.
const HINTS = {
  ladder: 'Give the members ascending rarities, in the order you picked them.',
  flatRarity: 'Put every member at the same rarity.',
  oneArtist: 'Commission one illustrator across all of them.',
  manyArtists: 'A character run wants a different hand each time.',
  oneCharacter: 'Feature the same character on each card.',
  relatedCast: 'Feature the same character, or one promoted from another.',
  brief: 'Give each card art direction that echoes the shared brief.',
  oneSet: 'This kind wants every card printed in one release.',
  manySets: 'This kind wants the run spread across releases — continue it later.',
  size: 'Add another card.',
}
