// Pack Ripper — crack open your own product. Pick a released set, rip a pack, and
// watch the pulls reveal (mostly commons, the occasional chase). The "best pull"
// is flagged, and prices are live — so you feel it when a sleeper has spiked.

import { useState } from 'react'
import { visualTier, getRarity } from '../game/rarities.js'
import SetSymbol from './SetSymbol.jsx'

function fmt(n) {
  return '$' + (n ?? 0).toFixed(2)
}

export default function PackRipper({ state, onRip }) {
  const liveSets = state.sets.filter((s) => !s.rotated)
  const [picked, setPicked] = useState(null)
  const setId = picked && liveSets.some((s) => s.id === picked) ? picked : liveSets[0]?.id

  const set = state.sets.find((s) => s.id === setId)
  const rip = state.lastRip && state.lastRip.setId === setId ? state.lastRip : null
  const cardById = new Map(state.cards.map((c) => [c.id, c]))
  const pulls = rip ? rip.pullIds.map((id) => cardById.get(id)).filter(Boolean) : []

  return (
    <div className="panel">
      <h2 className="panel__title">Rip a Pack</h2>
      {liveSets.length === 0 ? (
        <p className="panel__empty">Release a set, then crack your own packs here.</p>
      ) : (
        <>
          <div className="rip__controls">
            <select value={setId} onChange={(e) => setPicked(e.target.value)}>
              {liveSets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className="btn btn--design" onClick={() => onRip(setId)}>✨ Rip a pack</button>
          </div>

          {pulls.length > 0 ? (
            <div className="rip__pulls">
              {pulls.map((c, i) => {
                const tier = visualTier(set?.rarities, c.rarity)
                const isBest = c.id === rip.bestId
                return (
                  <div key={`${c.id}-${i}`} className={`pull pull--${tier}${isBest ? ' pull--best' : ''}`}>
                    <div className="pull__sym"><SetSymbol themeId={set?.themeId} tier={tier} size={20} /></div>
                    <div className="pull__name">{c.name}</div>
                    <div className="pull__rarity">{getRarity(set?.rarities, c.rarity).name}{c.secret ? ' ✦' : ''}</div>
                    <div className="pull__price">{fmt(c.singlePrice)}</div>
                    {isBest && <div className="pull__badge">BEST</div>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="panel__empty">Crack a pack to see what you pull.</p>
          )}
        </>
      )}
    </div>
  )
}
