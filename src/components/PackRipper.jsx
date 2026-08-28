// Pack Ripper — crack open your own product. Pick a released set, rip a pack, and
// watch the pulls reveal (mostly commons, the occasional chase). The "best pull"
// is flagged, and prices are live — so you feel it when a sleeper has spiked.

import { useState } from 'react'
import { visualTier, getRarity } from '../game/rarities.js'
import { BREAK_PROGRAMS } from '../game/content/breaks.js'
import SetSymbol from './SetSymbol.jsx'
import PackOddsPanel from './setbuilder/PackOddsPanel.jsx'

function fmt(n) {
  return '$' + (n ?? 0).toFixed(2)
}

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function PackRipper({ state, onRip, onRunBreak }) {
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

          {set?.oddsPublished && (
            <PackOddsPanel sheet={set.rarities} format={set.packFormat} title={`${set.name} — published odds`} />
          )}

          {rip?.isGodPack && (
            <div className="godpack">🌟 GOD PACK! Every card in this pack hit — a real market legend. 🌟</div>
          )}
          {pulls.length > 0 ? (
            <div className={'rip__pulls' + (rip?.isGodPack ? ' rip__pulls--god' : '')}>
              {pulls.map((c, i) => {
                const tier = visualTier(set?.rarities, c.rarity)
                const isBest = c.id === rip.bestId
                const serialNumber = rip.serials?.[i]
                return (
                  <div key={`${c.id}-${i}`} className={`pull pull--${tier}${isBest ? ' pull--best' : ''}`}>
                    <div className="pull__sym"><SetSymbol themeId={set?.themeId} tier={tier} size={20} /></div>
                    <div className="pull__name">{c.name}</div>
                    <div className="pull__rarity">{getRarity(set?.rarities, c.rarity).name}{c.secret ? ' ✦' : ''}</div>
                    <div className="pull__price">{fmt(c.singlePrice)}</div>
                    {serialNumber && <div className="pull__serial" title="A hard-capped serialized copy — a market legend">🔢 #{serialNumber}/{c.serialCap}</div>}
                    {isBest && <div className="pull__badge">BEST</div>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="panel__empty">Crack a pack to see what you pull.</p>
          )}

          {onRunBreak && (
            <>
              <h3 className="panel__subtitle">Sponsor a live break</h3>
              <p className="field__note">
                Sell spots and crack {set?.name ?? 'this set'} live on stream — a collector-hype
                marketing channel, distinct from a normal sale.
              </p>
              <div className="breaks">
                {Object.values(BREAK_PROGRAMS).map((prog) => (
                  <button
                    key={prog.kind}
                    className="btn btn--ghost breaks__opt"
                    onClick={() => onRunBreak(prog.kind, setId)}
                    title={prog.blurb}
                  >
                    {prog.name} — {fmtCash(prog.cost)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
