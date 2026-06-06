// Editor for a single signature card. Per-card flavor ↔ full-mechanical toggle,
// rarity, artist commission, and either a power rating or rules text.

import { RARITIES } from '../../game/sets.js'
import { ARTISTS, getArtist } from '../../game/content/artists.js'

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

// A short trend cue for an artist's current trajectory, so the player can spot a
// cheap rising star before it blows up (or avoid an overpriced fading name).
const TREND = {
  rising: { icon: '↑', cls: 'trend--up', label: 'rising' },
  established: { icon: '◆', cls: 'trend--est', label: 'established' },
  fading: { icon: '↓', cls: 'trend--down', label: 'fading' },
  steady: { icon: '→', cls: 'trend--flat', label: 'steady' },
}

export default function SignatureCardEditor({ card, theme, artists, onChange, onRemove }) {
  const set = (patch) => onChange({ ...card, ...patch })
  // Merge static identity (name/specialty) with the live drifted career so the
  // displayed cost/reach and trend reflect the current week.
  const artistOf = (id) => {
    const base = getArtist(id)
    if (!base) return null
    const live = artists?.find((a) => a.id === id)
    return live ? { ...base, cost: live.cost, reach: live.reach, trajectory: live.trajectory } : base
  }
  const artist = card.artistId ? artistOf(card.artistId) : null

  return (
    <div className="sigcard">
      <div className="sigcard__row">
        <input
          className="sigcard__name"
          value={card.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Card name"
        />
        <button className="btn btn--ghost sigcard__remove" onClick={onRemove} title="Remove card">✕</button>
      </div>

      <div className="sigcard__row sigcard__controls">
        <label className="field">
          <span>Rarity</span>
          <select value={card.rarity} onChange={(e) => set({ rarity: e.target.value })}>
            {RARITIES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <div className="toggle">
          <button
            className={'toggle__opt' + (card.mode === 'flavor' ? ' is-active' : '')}
            onClick={() => set({ mode: 'flavor' })}
          >
            Flavor
          </button>
          <button
            className={'toggle__opt' + (card.mode === 'mechanical' ? ' is-active' : '')}
            onClick={() => set({ mode: 'mechanical' })}
          >
            Mechanical
          </button>
        </div>
      </div>

      {card.mode === 'flavor' ? (
        <label className="field field--full">
          <span>Overall power: {card.power}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={card.power}
            onChange={(e) => set({ power: Number(e.target.value) })}
          />
        </label>
      ) : (
        <label className="field field--full">
          <span>Rules text</span>
          <textarea
            rows="2"
            value={card.rulesText}
            onChange={(e) => set({ rulesText: e.target.value })}
            placeholder="e.g. Draw two cards. Destroy target creature."
          />
        </label>
      )}

      <label className="field field--full">
        <span>
          Artist{' '}
          {artist ? (
            <>
              — {formatCash(artist.cost)}, reach {Math.round(artist.reach)}{' '}
              <span className={'trend ' + (TREND[artist.trajectory]?.cls ?? '')}>
                {TREND[artist.trajectory]?.icon} {TREND[artist.trajectory]?.label}
              </span>
            </>
          ) : (
            '(uncommissioned)'
          )}
        </span>
        <select
          value={card.artistId ?? ''}
          onChange={(e) => set({ artistId: e.target.value || null })}
        >
          <option value="">— No artist —</option>
          {ARTISTS.map((base) => {
            const a = artistOf(base.id)
            const match = theme && base.specialty.some((s) => theme.tags.includes(s))
            const trend = TREND[a.trajectory]?.icon ?? ''
            return (
              <option key={base.id} value={base.id}>
                {base.name} · {formatCash(a.cost)} {trend}{match ? ' ★' : ''}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}
