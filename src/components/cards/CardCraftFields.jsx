// The half of a card editor that is the same whether the card is a set's
// signature highlight or a design sitting in the studio's library: serial cap,
// printing finish, standout appeal, flavour text, art-direction brief, and the
// artist commission.
//
// Extracted rather than duplicated when Studio > Cards arrived. The two callers
// differ only in what surrounds these fields — a signature card also picks a
// rarity off its set's sheet and can author a brand-new character; a library
// design has no set to take a rarity from. Everything here is common, and a
// second copy of it would have drifted within a release.

import { ARTISTS, getArtist } from '../../game/content/artists.js'
import { FINISHES, cardAppeal } from '../../game/sets.js'
import { formatCash, TREND } from './CardFrame.jsx'

// Merge static identity (name/specialty) with the live drifted career so the
// displayed cost/reach and trend reflect the current week.
export function makeArtistOf(artists) {
  return (id) => {
    const base = getArtist(id)
    if (!base) return null
    const live = artists?.find((a) => a.id === id)
    return live ? { ...base, cost: live.cost, reach: live.reach, trajectory: live.trajectory } : base
  }
}

export default function CardCraftFields({ card, set, artists, theme, rarities }) {
  const artistOf = makeArtistOf(artists)
  const artist = card.artistId ? artistOf(card.artistId) : null
  const adjusted = cardAppeal(card, rarities)

  return (
    <>
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
          {adjusted !== card.appeal && (
            <span className="muted"> → {adjusted} with finish &amp; flavor</span>
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
    </>
  )
}
