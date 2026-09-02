// Community › Programmes — the standing goodwill programme (the voluntary
// money sink and the main way to buy a soured community back, see overhead.js
// sink D) and sponsored live box breaks (a creator cracks your product on
// stream — a collector-hype marketing channel, distinct from a normal sale).

import { useState } from 'react'
import { BREAK_PROGRAMS } from '../game/content/breaks.js'
import Section from './nav/Section.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function ProgrammesPanel({ state, onSetGoodwill, onRunBreak }) {
  const level = Math.round((state.goodwillSpend ?? 0) * 100)
  const weekly = state.lastOverhead?.goodwill ?? 0

  const liveSets = state.sets.filter((s) => !s.rotated)
  const [picked, setPicked] = useState(null)
  const setId = picked && liveSets.some((s) => s.id === picked) ? picked : liveSets[0]?.id
  const set = liveSets.find((s) => s.id === setId)

  return (
    <>
      <Section id="community.goodwill" title="Community programme" level={2} summary={`${level}% · ${fmtCash(weekly)}/wk`}>
        <label className="field field--full">
          <span>
            Weekly commitment — <strong>{level}%</strong>
            {weekly > 0 && <span className="muted"> ({fmtCash(weekly)}/wk)</span>}
          </span>
          <input
            type="range" min={0} max={100} step={5}
            value={level}
            onChange={(e) => onSetGoodwill(Number(e.target.value) / 100)}
          />
          <span className="field__note">
            Organised play support, replacement product, showing up. Costs up to
            $0.55 per player per week and warms the room over time — but a studio
            the community is angry at cannot simply buy its way out.
          </span>
        </label>
      </Section>

      <Section id="community.breaks" title="Sponsor a live break" level={2}>
        {liveSets.length === 0 ? (
          <p className="panel__empty">Release a set, then sponsor a creator to crack it live.</p>
        ) : (
          <>
            <p className="field__note">
              Sell spots and crack {set?.name ?? 'this set'} live on stream. Breaks
              saturate: too many in a short window and the audience stops believing
              it is a moment.
            </p>
            <div className="rip__controls">
              <select value={setId} onChange={(e) => setPicked(e.target.value)}>
                {liveSets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
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
      </Section>
    </>
  )
}
