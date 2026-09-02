// Editor for one card in the studio's library — Studio > Cards.
//
// It is deliberately the signature-card editor minus the set: the same frame
// preview, the same craft fields, the same cast picker. What it does NOT have
// is a rarity, because a rarity belongs to a set's own sheet and this card
// belongs to no set yet (see carddesigns.js), and it cannot mint a brand-new
// character, because that is a release-time act against the roster a release is
// building.

import { TREATMENTS, getTreatment } from '../../game/characters.js'
import { castMembers, castPopBonus, castStanding } from '../../game/cast.js'
import { CardFramePreview } from './CardFrame.jsx'
import CardCraftFields, { makeArtistOf } from './CardCraftFields.jsx'
import CastPicker from './CastPicker.jsx'

export default function CardDesignEditor({
  design, characters = [], people = [], artists = [],
  open = true, onToggleOpen, onChange, onRemove,
}) {
  const set = (patch) => onChange(patch)
  const artist = design.artistId ? makeArtistOf(artists)(design.artistId) : null
  const cast = castMembers(design, characters, people)
  const lead = cast[0] ?? null
  // Only a character who has actually graduated unlocks the icon treatment —
  // it is a reward for a character blowing up, not a day-one purchase option.
  const treatmentOptions = TREATMENTS.filter((t) => !t.requiresIcon || lead?.form?.trajectory === 'icon')

  if (!open) {
    return (
      <div className="sigcard sigcard--collapsed">
        <button type="button" className="sigcard__summary" aria-expanded="false" onClick={onToggleOpen}>
          <span className="sigcard__chevron" aria-hidden="true">▸</span>
          <span className="sigcard__sumname">{design.name || 'Untitled card'}</span>
          <span className="sigcard__summeta">{summarise(design, cast, artist)}</span>
        </button>
        <button className="btn btn--ghost sigcard__remove" onClick={onRemove} title="Remove this design">✕</button>
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
          value={design.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Card name"
        />
        <button className="btn btn--ghost sigcard__remove" onClick={onRemove} title="Remove this design">✕</button>
      </div>

      <div className="sigcard__layout">
        <CardFramePreview card={design} artist={artist} typeLabel="Studio library · unplaced" />
        <div className="sigcard__form">
          <CardCraftFields card={design} set={set} artists={artists} theme={null} rarities={null} />

          {/* The whole cast, lead included — unlike a signature card there is no
              separate lead toggle here, because a design cannot mint a new
              character and so has nothing else to choose between. */}
          <CastPicker
            card={design}
            characters={characters}
            people={people}
            theme={null}
            set={set}
            includeLead
          />

          {cast.length > 0 && (
            <>
              <label className="field field--full">
                <span>Printing tier</span>
                <select value={design.treatment ?? 'debut'} onChange={(e) => set({ treatment: e.target.value })}>
                  {treatmentOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} (×{t.costMul} cost)</option>
                  ))}
                </select>
                <span className="field__note">{getTreatment(design.treatment).blurb}</span>
              </label>
              <span className="field__note">
                This cast is worth <strong>+{Math.round(castPopBonus(cast, design.treatment))}</strong> appeal
                and hype to the card as things stand
                {cast.length > 1 && ' — summed across everyone on it, then capped'}.
                It is read again wherever the card is printed, so it moves with
                their standing between now and then.
              </span>
            </>
          )}

          <span className="field__note">
            A design has no rarity: that belongs to the set it goes into. Pull it
            into a set from Studio&nbsp;›&nbsp;Design, ship it in a collector box, or
            print it on its own as a promo.
          </span>
        </div>
      </div>
    </div>
  )
}

// The one line a collapsed design shows: who is on it, who drew it, and the
// loudest thing it carries.
function summarise(design, cast, artist) {
  const parts = []
  if (design.serialCap) parts.push(design.serialCap === 1 ? '1-of-1' : `/${design.serialCap}`)
  if (artist) parts.push(artist.name)
  if (cast.length) {
    parts.push(`🎭 ${cast.map(({ form }) => form.name).join(' & ')}`)
    parts.push(`standing ${Math.round(Math.max(...cast.map(({ form, person }) => castStanding(form, person))))}`)
  }
  parts.push(`appeal ${design.appeal}`)
  return parts.join(' · ')
}
