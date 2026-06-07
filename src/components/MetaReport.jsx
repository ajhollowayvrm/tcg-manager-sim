// Meta Report — a tier list of which cards are defining the current format,
// derived from each card's competitive relevance (see game/meta.js). Helps the
// player see what's actually being played (and what to maybe ban) at a glance.

import { metaReport, TIER_LABEL } from '../game/meta.js'
import SetSymbol from './SetSymbol.jsx'

// Show at most this many cards in the report (the meta that matters).
const MAX_ROWS = 8

export default function MetaReport({ state }) {
  const report = metaReport(state).filter((c) => c.tier !== 'unplayed').slice(0, MAX_ROWS)

  return (
    <div className="panel">
      <h2 className="panel__title">Meta Report</h2>
      {report.length === 0 ? (
        <p className="panel__empty">No format yet — release a set to see what dominates.</p>
      ) : (
        <ul className="meta">
          {report.map((c) => (
            <li key={c.id} className="meta__row">
              <span className="meta__name">
                <SetSymbol themeId={c.themeId} tier={c.rarityTier} size={14} />
                <span className={`rarity--${c.rarityTier}`}>{c.name}</span>
              </span>
              <span className={`meta__tier meta__tier--${c.tier}`}>{TIER_LABEL[c.tier]}</span>
              <span className="meta__bar" title={`Meta score ${c.score}/100`}>
                <span className={`meta__fill meta__fill--${c.tier}`} style={{ width: `${c.score}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
