// Editor for a single signature card: rarity, printing finish, artist
// commission, standout appeal, and the card's flavor + art-direction copy.

import { ARTISTS, getArtist } from '../../game/content/artists.js'
import { getRarity, visualTier, defaultRaritySheet } from '../../game/rarities.js'
import { TREATMENTS, getTreatment } from '../../game/characters.js'
import { FINISHES, getFinish, cardAppeal } from '../../game/sets.js'
import SetSymbol from '../SetSymbol.jsx'

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

// A deterministic two-tone art gradient per theme, so the preview's "art box"
// reads as themed placeholder art rather than a flat panel. Hue derived from the
// theme id so each theme has a consistent look.
function artGradient(themeId) {
  let h = 0
  for (let i = 0; i < (themeId?.length ?? 0); i++) h = (h * 31 + themeId.charCodeAt(i)) % 360
  return `linear-gradient(135deg, hsl(${h} 45% 28%), hsl(${(h + 40) % 360} 55% 16%))`
}

// A live trading-card preview of the card being designed: rarity-foiled frame,
// themed art placeholder with the set symbol, name plate, type/finish line,
// flavor box, and an artist/set-symbol footer. This is the brief's "real
// card-frame styling in the card editor".
function CardFramePreview({ card, theme, sheet, artist }) {
  const finish = getFinish(card.finish)
  const tier = visualTier(sheet, card.rarity) // common/uncommon/rare/mythic foil
  const rarityName = getRarity(sheet, card.rarity).name
  return (
    <div className={`cardframe cardframe--${tier} cardframe--finish-${finish.id}`} aria-hidden="true">
      <div className="cardframe__titlebar">
        <span className="cardframe__name">{card.name || 'Unnamed Card'}</span>
        <span className={`cardframe__gem gem--${tier}`} title={rarityName} />
      </div>
      <div className="cardframe__art" style={{ background: artGradient(theme?.id) }}>
        {theme && <SetSymbol themeId={theme.id} tier={tier} size={48} />}
      </div>
      <div className="cardframe__typeline">
        <span>{theme ? theme.name : 'Set'} · {rarityName}</span>
        {finish.id !== 'standard' && <span className="cardframe__finish">{finish.name}</span>}
      </div>
      <div className="cardframe__text cardframe__text--flavor">
        {card.flavorText?.trim() || 'Flavor text…'}
      </div>
      <div className="cardframe__footer">
        <span className="cardframe__artist">
          {artist ? `🖌 ${artist.name}` : 'Uncommissioned art'}
        </span>
        {theme && <SetSymbol themeId={theme.id} tier={tier} size={14} />}
      </div>
    </div>
  )
}

// A short trend cue for an artist's current trajectory, so the player can spot a
// cheap rising star before it blows up (or avoid an overpriced fading name).
const TREND = {
  rising: { icon: '↑', cls: 'trend--up', label: 'rising' },
  established: { icon: '◆', cls: 'trend--est', label: 'established' },
  fading: { icon: '↓', cls: 'trend--down', label: 'fading' },
  steady: { icon: '→', cls: 'trend--flat', label: 'steady' },
}

// Fame trajectory cues, mirroring the artist TREND badges above.
const CHAR_TREND = {
  rising: { icon: '↑', cls: 'trend--up', label: 'rising' },
  established: { icon: '◆', cls: 'trend--est', label: 'established' },
  fading: { icon: '↓', cls: 'trend--down', label: 'fading' },
  icon: { icon: '★', cls: 'trend--est', label: 'icon' },
}

export default function SignatureCardEditor({ card, theme, artists, characters = [], rarities, onChange, onRemove }) {
  const sheet = rarities ?? defaultRaritySheet()
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

      <div className="sigcard__layout">
        <CardFramePreview card={card} theme={theme} sheet={sheet} artist={artist} />
        <div className="sigcard__form">

      <div className="sigcard__row sigcard__controls">
        <label className="field">
          <span>Rarity</span>
          <select value={card.rarity} onChange={(e) => set({ rarity: e.target.value })}>
            {sheet.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>

        <label className="field" title="A hard-capped total copy count, independent of the set's print run — a true numbered chase card. Once this many are pulled, ever, it's gone.">
          <span>Serial numbered</span>
          <select
            value={card.serialCap ?? ''}
            onChange={(e) => set({ serialCap: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">None</option>
            <option value="99">/99</option>
            <option value="50">/50</option>
            <option value="25">/25</option>
            <option value="10">/10</option>
            <option value="1">1-of-1</option>
          </select>
        </label>

        <label className="field">
          <span>Finish</span>
          <select value={card.finish ?? 'standard'} onChange={(e) => set({ finish: e.target.value })}>
            {FINISHES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}{f.costMul !== 1 ? ` — ×${f.costMul} art` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field field--full">
        <span>
          Standout appeal: {card.appeal}
          {cardAppeal(card, rarities) !== card.appeal && (
            <span className="muted"> → {cardAppeal(card, rarities)} with finish &amp; flavor</span>
          )}
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={card.appeal}
          onChange={(e) => set({ appeal: Number(e.target.value) })}
        />
        <span className="field__note">
          How much this card is meant to stand out on a shelf — the marquee pull
          of the set, not a strength rating.
        </span>
      </label>

      <label className="field field--full">
        <span>Flavor text <span className="muted">(the italic line under the art)</span></span>
        <textarea
          rows="2"
          value={card.flavorText ?? ''}
          onChange={(e) => set({ flavorText: e.target.value })}
          placeholder="e.g. It has never once been seen in daylight."
        />
      </label>

      <label className="field field--full">
        <span>Art direction <span className="muted">(brief for the commission)</span></span>
        <input
          value={card.artNotes ?? ''}
          onChange={(e) => set({ artNotes: e.target.value })}
          placeholder="e.g. stormy cliffside, backlit, low angle"
        />
        <span className="field__note">
          A brief that leans into the set's theme reads as a more cohesive
          commission — worth a little extra appeal.
        </span>
      </label>

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

      <CharacterPicker card={card} characters={characters} set={set} />
        </div>
      </div>
    </div>
  )
}

// Feature a character on this card instead of a one-off: mint a brand-new one
// (a debut appearance, no fame to draw on yet) or pull in an existing roster
// entry (its fame bumps the card's appeal, scaled by the chosen treatment).
function CharacterPicker({ card, characters, set }) {
  const mode = card.characterId ? 'existing' : card.newCharacterName ? 'new' : 'none'
  const selected = card.characterId ? characters.find((c) => c.id === card.characterId) : null
  // An icon treatment is reserved for characters that have actually graduated —
  // it's a reward for a character blowing up, not a day-one purchase option.
  const treatmentOptions = TREATMENTS.filter((t) => !t.requiresIcon || selected?.trajectory === 'icon')

  return (
    <div className="field field--full counter">
      <span>
        Character
        {mode !== 'none' && <span className="counter__badge">🎭 featured</span>}
      </span>
      <div className="toggle toggle--counter">
        <button className={'toggle__opt' + (mode === 'none' ? ' is-active' : '')}
          onClick={() => set({ characterId: null, newCharacterName: '', newCharacterSpecies: '', treatment: 'debut' })}>
          One-off
        </button>
        <button className={'toggle__opt' + (mode === 'new' ? ' is-active' : '')}
          onClick={() => set({ characterId: null, newCharacterName: card.name || '', treatment: 'debut' })}>
          New character
        </button>
        <button className={'toggle__opt' + (mode === 'existing' ? ' is-active' : '')}
          disabled={characters.length === 0}
          title={characters.length === 0 ? 'No characters yet — create one first.' : undefined}
          onClick={() => set({
            newCharacterName: '', newCharacterSpecies: '',
            characterId: characters[0]?.id ?? null, treatment: 'debut',
          })}>
          Existing character
        </button>
      </div>

      {mode === 'new' && (
        <>
          <input
            className="counter__target"
            value={card.newCharacterName}
            onChange={(e) => set({ newCharacterName: e.target.value })}
            placeholder="Character name"
          />
          <input
            className="counter__target"
            value={card.newCharacterSpecies}
            onChange={(e) => set({ newCharacterSpecies: e.target.value })}
            placeholder="Species / archetype (flavor only, e.g. 'dragon')"
          />
          <span className="field__note">
            Debuts on release with a small starting fame — future cards can bring
            {' '}{card.newCharacterName || 'this character'} back as an existing character.
          </span>
        </>
      )}

      {mode === 'existing' && (
        <>
          <select
            className="counter__target"
            value={card.characterId ?? ''}
            onChange={(e) => set({ characterId: e.target.value || null })}
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · fame {Math.round(c.fame)} {CHAR_TREND[c.trajectory]?.icon ?? ''} {CHAR_TREND[c.trajectory]?.label ?? c.trajectory}
              </option>
            ))}
          </select>
          {selected && (
            <span className={'trend ' + (CHAR_TREND[selected.trajectory]?.cls ?? '')}>
              {CHAR_TREND[selected.trajectory]?.icon} {selected.name} is {CHAR_TREND[selected.trajectory]?.label ?? selected.trajectory}
              {selected.trajectory === 'icon' && ' — icon treatment unlocked'}
            </span>
          )}
          <select
            className="counter__target"
            value={card.treatment ?? 'debut'}
            onChange={(e) => set({ treatment: e.target.value })}
          >
            {treatmentOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.name} (×{t.costMul} cost)</option>
            ))}
          </select>
          <span className="field__note">{getTreatment(card.treatment).blurb}</span>
        </>
      )}
    </div>
  )
}
