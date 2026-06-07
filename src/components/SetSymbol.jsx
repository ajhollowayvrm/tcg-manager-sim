// A small set symbol — the emblem stamped on a card to mark its set, like the
// rarity-tinted expansion symbols on real TCG cards. The glyph is chosen by the
// theme; the colour is driven by rarity (silver → blue → gold), mirroring how
// real sets print one symbol in different foils per rarity.

import { getTheme } from '../game/content/themes.js'

// A simple emblematic glyph per theme, drawn in a 24×24 viewBox. Kept minimal so
// it reads at 14–20px. Themes without an explicit glyph fall back to a gem.
const GLYPHS = {
  dragons: 'M12 3l3 5 5 1-3 4 1 6-6-3-6 3 1-6-3-4 5-1z', // star/scale burst
  undead: 'M12 3a6 6 0 00-6 6c0 3 2 4 2 6h8c0-2 2-3 2-6a6 6 0 00-6-6zM9 18h6v2H9z', // skull
  cyber: 'M5 9h4V5h2v4h2V5h2v4h4v2h-4v2h4v2h-4v4h-2v-4h-2v4H9v-4H5v-2h4v-2H5z', // chip
  nature: 'M12 21c0-6 2-10 7-13-2 8-4 9-7 13zm0 0C8 16 6 12 5 6c5 3 7 7 7 15z', // leaf
  arcane: 'M12 2l2.5 7H22l-6 4.5L18.5 21 12 16.5 5.5 21 8 13.5 2 9h7.5z', // star
  kingdoms: 'M4 9l3 3 5-6 5 6 3-3v9H4z', // crown
  cosmic: 'M12 2a10 10 0 100 20A8 8 0 0112 2z', // crescent
  frost: 'M12 2v20M4 7l16 10M20 7L4 17M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3', // snowflake (stroke)
  spirits: 'M12 3c4 0 6 3 6 7v9l-3-2-3 2-3-2-3 2v-9c0-4 2-7 6-7z', // ghost
  cute: 'M12 21S4 14 4 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 018 2.5C20 14 12 21 12 21z', // heart
  mecha: 'M8 4h8v3h3v6l-3 1v6H8v-6l-3-1V7h3z', // robot head
  heist: 'M5 8h14v10H5zM9 8V6a3 3 0 016 0v2', // safe/lock
  racing: 'M3 6h4v4H3zm8 0h4v4h-4zM7 10h4v4H7zm8 0h4v4h-4zM3 14h4v4H3zm8 0h4v4h-4z', // checkered flag
  sports: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 3l3 2-1 4h-4l-1-4z', // ball
  pirates: 'M12 3a6 6 0 00-6 6c0 3 2 4 2 6h8c0-2 2-3 2-6a6 6 0 00-6-6zM4 19l16-4M20 19L4 15', // skull + bones
  noir: 'M3 14a9 5 0 0118 0zM7 9l5-5 5 5', // fedora
  colony: 'M12 2l9 16H3zM12 8v6M9 18v3h6v-3', // rocket/dome
  kaiju: 'M3 18l3-10 3 4 3-6 3 6 3-4 3 10z', // monster spikes
}

const FALLBACK = 'M12 2l3 7h7l-6 4.5L18.5 21 12 16.5 5.5 21 8 13.5 2 9h7z'

// Rarity → symbol colour (a real set prints the same glyph in escalating foils).
const RARITY_COLOR = {
  common: 'var(--silver)',
  uncommon: '#e8ecf5',
  rare: 'var(--accent-2)',
  mythic: 'var(--pop)',
}

// Snowflake/skull-bones use stroke, not fill — looks right as line art.
const STROKE_GLYPHS = new Set(['frost', 'pirates'])

// `tier` is a visual bucket (common/uncommon/rare/mythic) — preferred. `rarity`
// is accepted for back-compat and only used when it matches a known bucket.
export default function SetSymbol({ themeId, tier, rarity, size = 16, title }) {
  const theme = getTheme(themeId)
  const d = (themeId && GLYPHS[themeId]) || FALLBACK
  const key = tier ?? rarity ?? 'rare'
  const color = RARITY_COLOR[key] ?? 'var(--silver)'
  const stroke = STROKE_GLYPHS.has(themeId)
  const label = title ?? (theme ? `${theme.name} · ${key}` : 'set symbol')

  return (
    <svg
      className="setsymbol"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path
        d={d}
        fill={stroke ? 'none' : color}
        stroke={stroke ? color : 'none'}
        strokeWidth={stroke ? 1.6 : 0}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
