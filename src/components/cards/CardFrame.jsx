// The live trading-card preview, and the small display helpers around it.
//
// Extracted from SignatureCardEditor when the card library (Studio > Cards)
// arrived: a design authored outside any set is still a card, and it deserves
// the same frame. Nothing here knows about a set — the theme and the rarity
// sheet are optional, and a design that has neither still renders.

import { getRarity, visualTier, defaultRaritySheet } from '../../game/rarities.js'
import { getFinish } from '../../game/sets.js'
import SetSymbol from '../SetSymbol.jsx'

export function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

// A short trend cue for an artist's current trajectory, so the player can spot a
// cheap rising star before it blows up (or avoid an overpriced fading name).
export const TREND = {
  rising: { icon: '↑', cls: 'trend--up', label: 'rising' },
  established: { icon: '◆', cls: 'trend--est', label: 'established' },
  fading: { icon: '↓', cls: 'trend--down', label: 'fading' },
  steady: { icon: '→', cls: 'trend--flat', label: 'steady' },
}

// Fame trajectory cues, mirroring the artist TREND badges above.
export const CHAR_TREND = {
  rising: { icon: '↑', cls: 'trend--up', label: 'rising' },
  established: { icon: '◆', cls: 'trend--est', label: 'established' },
  fading: { icon: '↓', cls: 'trend--down', label: 'fading' },
  icon: { icon: '★', cls: 'trend--est', label: 'icon' },
}

// A deterministic two-tone art gradient per theme, so the preview's "art box"
// reads as themed placeholder art rather than a flat panel. Hue derived from the
// theme id so each theme has a consistent look. A library design has no theme,
// so it falls back to a neutral slate.
export function artGradient(themeId) {
  if (!themeId) return 'linear-gradient(135deg, hsl(220 12% 26%), hsl(220 14% 14%))'
  let h = 0
  for (let i = 0; i < themeId.length; i++) h = (h * 31 + themeId.charCodeAt(i)) % 360
  return `linear-gradient(135deg, hsl(${h} 45% 28%), hsl(${(h + 40) % 360} 55% 16%))`
}

// A live trading-card preview of the card being designed: rarity-foiled frame,
// themed art placeholder with the set symbol, name plate, type/finish line,
// flavor box, and an artist/set-symbol footer. This is the brief's "real
// card-frame styling in the card editor".
//
// `sheet` and `theme` are both optional. A library design belongs to no set, so
// it has neither: the frame reads at the common tier and the type line says so
// rather than inventing a rarity the design does not have.
export function CardFramePreview({ card, theme, sheet, artist, typeLabel }) {
  const finish = getFinish(card.finish)
  const resolved = sheet ?? null
  const tier = resolved ? visualTier(resolved, card.rarity) : 'common'
  const rarityName = resolved ? getRarity(resolved, card.rarity).name : null
  return (
    <div className={`cardframe cardframe--${tier} cardframe--finish-${finish.id}`} aria-hidden="true">
      <div className="cardframe__titlebar">
        <span className="cardframe__name">{card.name || 'Unnamed Card'}</span>
        <span className={`cardframe__gem gem--${tier}`} title={rarityName ?? 'Unplaced'} />
      </div>
      <div className="cardframe__art" style={{ background: artGradient(theme?.id) }}>
        {theme && <SetSymbol themeId={theme.id} tier={tier} size={48} />}
      </div>
      <div className="cardframe__typeline">
        <span>{typeLabel ?? `${theme ? theme.name : 'Set'} · ${rarityName ?? '—'}`}</span>
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

// The rarity sheet a preview should use when one is in scope, so callers do not
// each repeat the fallback.
export function sheetOr(rarities) {
  return rarities ?? defaultRaritySheet()
}
