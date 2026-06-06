// Editor for a single signature card. Per-card flavor ↔ full-mechanical toggle,
// rarity, artist commission, and either a power rating or rules text.

import { RARITIES } from '../../game/sets.js'
import { ARTISTS, getArtist } from '../../game/content/artists.js'

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

export default function SignatureCardEditor({ card, theme, onChange, onRemove }) {
  const set = (patch) => onChange({ ...card, ...patch })
  const artist = card.artistId ? getArtist(card.artistId) : null

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
          Artist {artist ? `— ${formatCash(artist.cost)}, reach ${artist.reach}` : '(uncommissioned)'}
        </span>
        <select
          value={card.artistId ?? ''}
          onChange={(e) => set({ artistId: e.target.value || null })}
        >
          <option value="">— No artist —</option>
          {ARTISTS.map((a) => {
            const match = theme && a.specialty.some((s) => theme.tags.includes(s))
            return (
              <option key={a.id} value={a.id}>
                {a.name} · {formatCash(a.cost)}{match ? ' ★' : ''}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}
