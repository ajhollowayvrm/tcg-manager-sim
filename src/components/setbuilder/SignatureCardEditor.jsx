// Editor for a single signature card: rarity, printing finish, artist
// commission, standout appeal, and the card's flavor + art-direction copy.

import { ARTISTS, getArtist } from '../../game/content/artists.js'
import {
  getRarity, visualTier, defaultRaritySheet,
  makeUniqueRarity, syncFormatWithUniqueRarity, pruneRarityFromFormat,
} from '../../game/rarities.js'
import { TREATMENTS, getTreatment } from '../../game/characters.js'
import { getArchetype, archetypeMatchesTheme, archetypesByCategory } from '../../game/content/archetypes.js'
import { FINISHES, getFinish, cardAppeal } from '../../game/sets.js'
import SetSymbol from '../SetSymbol.jsx'
import NumberField from './NumberField.jsx'

const PICKABLE_FINISHES = FINISHES.filter((f) => f.id !== 'standard')

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

export default function SignatureCardEditor({
  card, theme, artists, characters = [], rarities, packFormat,
  open = true, onToggleOpen,
  onChange, onRaritiesChange, onPackFormatChange, onRemove,
}) {
  const sheet = rarities ?? defaultRaritySheet()
  const set = (patch) => onChange({ ...card, ...patch })
  // By default a signature card just references a shared rarity off the
  // sheet and takes on its pull rate/value/finishes for free. Only once the
  // player customizes those does it get a `unique` rarity of its own — see
  // rarities.js's makeUniqueRarity — scoped to this one card.
  const rarityEntry = getRarity(sheet, card.rarity)
  const isUniqueRarity = !!rarityEntry.unique
  const sharedRarities = sheet.filter((r) => !r.unique)

  const makeThisCardUnique = () => {
    const uniq = makeUniqueRarity(rarityEntry, card.name)
    onRaritiesChange([...sheet, uniq])
    onPackFormatChange(syncFormatWithUniqueRarity(packFormat, rarityEntry.id, uniq.id))
    set({ rarity: uniq.id })
  }
  const updateUniqueRarity = (patch) =>
    onRaritiesChange(sheet.map((r) => (r.id === rarityEntry.id ? { ...r, ...patch } : r)))
  const revertToSharedRarity = () => {
    onRaritiesChange(sheet.filter((r) => r.id !== rarityEntry.id))
    onPackFormatChange(pruneRarityFromFormat(packFormat, rarityEntry.id))
    set({ rarity: rarityEntry.derivedFrom ?? sharedRarities[0]?.id ?? 'rare' })
  }
  const toggleUniqueFinish = (finishId) => {
    const has = (rarityEntry.finishes ?? []).includes(finishId)
    updateUniqueRarity({
      finishes: has
        ? rarityEntry.finishes.filter((f) => f !== finishId)
        : [...(rarityEntry.finishes ?? []), finishId],
    })
  }
  // Merge static identity (name/specialty) with the live drifted career so the
  // displayed cost/reach and trend reflect the current week.
  const artistOf = (id) => {
    const base = getArtist(id)
    if (!base) return null
    const live = artists?.find((a) => a.id === id)
    return live ? { ...base, cost: live.cost, reach: live.reach, trajectory: live.trajectory } : base
  }
  const artist = card.artistId ? artistOf(card.artistId) : null

  // COLLAPSED, a card is one row: enough to recognise it and pick the one to
  // edit, and nothing else. Expanded it is ~600px of editor on a desktop and
  // ~900px on a phone, so a set with six marquee cards was 5.4 screens of
  // scrolling on a laptop and 10.1 on a phone — and the cap is thirty.
  if (!open) {
    return (
      <div className="sigcard sigcard--collapsed">
        <button
          type="button"
          className="sigcard__summary"
          aria-expanded="false"
          onClick={onToggleOpen}
        >
          <span className="sigcard__chevron" aria-hidden="true">▸</span>
          <span className={`cardframe__gem gem--${visualTier(sheet, card.rarity)}`} aria-hidden="true" />
          <span className="sigcard__sumname">{card.name || 'Unnamed card'}</span>
          <span className="sigcard__summeta">{summarise(card, sheet, artist, characters)}</span>
        </button>
        <button className="btn btn--ghost sigcard__remove" onClick={onRemove} title="Remove card">✕</button>
      </div>
    )
  }

  return (
    <div className="sigcard">
      <div className="sigcard__row">
        <button
          type="button"
          className="sigcard__chevronbtn"
          aria-expanded="true"
          onClick={onToggleOpen}
          title="Collapse this card"
        >
          <span className="sigcard__chevron" aria-hidden="true">▾</span>
        </button>
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

      {!isUniqueRarity ? (
        <div className="sigcard__row sigcard__rarityrow">
          <label className="field">
            <span>Rarity</span>
            <select value={card.rarity} onChange={(e) => set({ rarity: e.target.value })}>
              {sharedRarities.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <span className="field__note">
              Takes on this rarity's pull rate, value and finishes automatically.
            </span>
          </label>
          <button type="button" className="btn btn--ghost sigcard__uniquebtn" onClick={makeThisCardUnique}>
            ✦ Give this card its own Unique rarity
          </button>
        </div>
      ) : (
        <div className="field field--full sigcard__unique">
          <span>
            Rarity — <strong>Unique</strong>
            <span className="muted"> (started from {getRarity(sharedRarities, rarityEntry.derivedFrom).name})</span>
          </span>
          <div className="sigcard__row sigcard__uniquerow">
            <label className="field">
              <span>Pull rate</span>
              <NumberField
                value={rarityEntry.pullWeight}
                aria-label="Pull weight"
                placeholder="Pull"
                onCommit={(n) => updateUniqueRarity({ pullWeight: n })}
              />
            </label>
            <label className="field">
              <span>Value tier</span>
              <NumberField
                max={100}
                value={rarityEntry.valueTier}
                aria-label="Value tier"
                placeholder="Value"
                onCommit={(n) => updateUniqueRarity({ valueTier: n })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!rarityEntry.secret}
                onChange={(e) => updateUniqueRarity({ secret: e.target.checked })}
              />
              Secret rare
            </label>
          </div>
          <div className="rared__finishgrid">
            {PICKABLE_FINISHES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={'btn btn--chip' + ((rarityEntry.finishes ?? []).includes(f.id) ? ' is-active' : '')}
                title={`${f.blurb} (×${f.costMul} print cost)`}
                onClick={() => toggleUniqueFinish(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost sigcard__uniquebtn" onClick={revertToSharedRarity}>
            ↩ Revert to shared rarity
          </button>
        </div>
      )}

      <div className="sigcard__row sigcard__controls">
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

      <CharacterPicker card={card} characters={characters} set={set} theme={theme} />
        </div>
      </div>
    </div>
  )
}

// The one line a collapsed card shows. Ordered by what actually distinguishes
// two marquee cards from each other in a list: what it is (rarity), who drew it,
// and who is on it. Appeal is included because it is the dial the player is
// usually comparing across cards, and a serial cap because it is the loudest
// thing a card can carry.
function summarise(card, sheet, artist, characters) {
  const entry = getRarity(sheet, card.rarity)
  const parts = [entry.unique ? 'Unique rarity' : entry.name]
  if (card.serialCap) parts.push(card.serialCap === 1 ? '1-of-1' : `/${card.serialCap}`)
  const finish = getFinish(card.finish)
  if (finish.id !== 'standard') parts.push(finish.name)
  if (artist) parts.push(artist.name)
  const who = card.characterId
    ? characters.find((c) => c.id === card.characterId)?.name
    : (card.newCharacterName?.trim() || null)
  if (who) parts.push(`🎭 ${who}`)
  parts.push(`appeal ${cardAppeal(card, sheet)}`)
  return parts.join(' · ')
}

// Feature a character on this card instead of a one-off: mint a brand-new one
// (a debut appearance, no fame to draw on yet) or pull in an existing roster
// entry (its fame bumps the card's appeal, scaled by the chosen treatment).
function CharacterPicker({ card, characters, set, theme }) {
  const mode = card.characterId ? 'existing' : card.newCharacterName ? 'new' : 'none'
  const selected = card.characterId ? characters.find((c) => c.id === card.characterId) : null
  const newArchetype = getArchetype(card.newCharacterArchetype)
  const newMatch = theme && archetypeMatchesTheme(newArchetype.id, theme.tags)
  // Whether the character already on this card suits the set's theme. Same ★ cue
  // the artist picker uses for a specialty match, and the same underlying idea.
  const selectedMatch = selected && theme && archetypeMatchesTheme(selected.archetypeId, theme.tags)
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
          onClick={() => set({ characterId: null, newCharacterName: '', newCharacterArchetype: 'unaligned', newCharacterSpecies: '', newCharacterHook: '', newCharacterPromotedFrom: null, treatment: 'debut' })}>
          One-off
        </button>
        <button className={'toggle__opt' + (mode === 'new' ? ' is-active' : '')}
          onClick={() => set({ characterId: null, newCharacterName: card.name || '', newCharacterArchetype: card.newCharacterArchetype ?? 'unaligned', treatment: 'debut' })}>
          New character
        </button>
        <button className={'toggle__opt' + (mode === 'existing' ? ' is-active' : '')}
          disabled={characters.length === 0}
          title={characters.length === 0 ? 'No characters yet — create one first.' : undefined}
          onClick={() => set({
            // The archetype is KEPT, matching the "New character" branch above:
            // glancing at the existing roster and coming back must not silently
            // reset the player's pick to Unaligned, which would quietly drop both
            // the theme-cohesion bonus and the fame-drift bias.
            newCharacterName: '', newCharacterSpecies: '', newCharacterHook: '', newCharacterPromotedFrom: null,
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
          {/* The archetype replaced the old free-text species field as the
              character's identity, because unlike that field it is READ: it
              earns the theme-cohesion bonus below and biases how this
              character's fame drifts for the rest of the run. */}
          <select
            className="counter__target"
            value={newArchetype.id}
            onChange={(e) => set({ newCharacterArchetype: e.target.value })}
          >
            {archetypesByCategory().map(({ category, archetypes }) => (
              <optgroup key={category.id} label={category.name}>
                {archetypes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{theme && archetypeMatchesTheme(a.id, theme.tags) ? ' ★' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="field__note">{newArchetype.blurb}</span>
          <input
            className="counter__target"
            value={card.newCharacterSpecies}
            onChange={(e) => set({ newCharacterSpecies: e.target.value })}
            placeholder="Epithet (optional, e.g. 'the Ashen')"
          />
          <input
            className="counter__target"
            value={card.newCharacterHook ?? ''}
            onChange={(e) => set({ newCharacterHook: e.target.value })}
            placeholder="Hook (optional, e.g. 'Never raises their voice.')"
          />
          {/* PROMOTION. This new character can be a later role or form of one
              already on the roster — Kell, Broken Boy becoming Kell, Royal
              Soldier. They stay two separate entries with their own archetypes
              and their own fame, linked by a lineage the illustration-set
              scorer reads, so a line built from the pair reads as one line.
              Locks on debut, like the archetype. */}
          {characters.length > 0 && (
            <>
              <select
                className="counter__target"
                value={card.newCharacterPromotedFrom ?? ''}
                onChange={(e) => set({ newCharacterPromotedFrom: e.target.value || null })}
              >
                <option value="">— A brand-new character —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    A promotion of {c.name} (fame {Math.round(c.fame)})
                  </option>
                ))}
              </select>
              {card.newCharacterPromotedFrom && (
                <span className="field__note">
                  Debuts already known — carries over part of{' '}
                  {characters.find((c) => c.id === card.newCharacterPromotedFrom)?.name}'s
                  fame, and both careers record the moment.
                </span>
              )}
            </>
          )}
          <span className="field__note">
            {newMatch
              ? `A ${newArchetype.name.toLowerCase()} suits this set's theme — an on-theme face reads as a coherent printing and lifts the card's appeal. `
              : ''}
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
                {c.name} · {getArchetype(c.archetypeId).name} · fame {Math.round(c.fame)} {CHAR_TREND[c.trajectory]?.icon ?? ''} {CHAR_TREND[c.trajectory]?.label ?? c.trajectory}
                {theme && archetypeMatchesTheme(c.archetypeId, theme.tags) ? ' ★' : ''}
              </option>
            ))}
          </select>
          {selected && (
            <span className={'trend ' + (CHAR_TREND[selected.trajectory]?.cls ?? '')}>
              {CHAR_TREND[selected.trajectory]?.icon} {selected.name} is {CHAR_TREND[selected.trajectory]?.label ?? selected.trajectory}
              {selected.trajectory === 'icon' && ' — icon treatment unlocked'}
              {selectedMatch && ` ★ on-theme for a ${theme.name} set`}
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
