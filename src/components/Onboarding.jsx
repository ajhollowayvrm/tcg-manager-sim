// First-run screen. Name your company & game, pick what your cards actually
// depict, pledge a release cadence the community will hold you to, then
// start. Every TCG here is collectible-first (Pokémon-like) economically —
// there's no economy genre picker (see the removed archetype picker in git
// history) — but the concept pick below IS real: it's flavor/identity only
// (see content/concepts.js), shaping generated card names for the whole run.

import { useState } from 'react'
import { MIN_CADENCE, MAX_CADENCE, DEFAULT_CADENCE_WEEKS, defaultConfig } from '../game/config.js'
import { CONCEPTS } from '../game/content/concepts.js'

export default function Onboarding({ onStart }) {
  const [cfg, setCfg] = useState(() => defaultConfig())
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }))

  const canStart = cfg.companyName.trim() && cfg.gameName.trim()

  return (
    <div className="onboard">
      <div className="onboard__sheet">
        <div className="onboard__brand">TCG&nbsp;Manager</div>
        <h1 className="onboard__title">Found your card-game company</h1>
        <p className="onboard__sub">You don’t play the game — you publish it. Set your studio up, then design your first set.</p>

        <div className="onboard__row">
          <label className="field field--full">
            <span>Company name</span>
            <input value={cfg.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="e.g. Apex Cardworks" />
          </label>
          <label className="field field--full">
            <span>Flagship game</span>
            <input value={cfg.gameName} onChange={(e) => set({ gameName: e.target.value })} placeholder="e.g. Mythwardens" />
          </label>
        </div>

        <div className="field field--full">
          <span>What are your cards? <span className="muted">(flavor only — shapes generated card names)</span></span>
          <div className="onboard__concepts">
            {CONCEPTS.map((c) => (
              <button
                key={c.id}
                className={'onboard__concept' + (cfg.conceptId === c.id ? ' is-active' : '')}
                onClick={() => set({ conceptId: c.id })}
              >
                <span className="onboard__conceptname">{c.name}</span>
                <span className="onboard__conceptlike">{c.resembles}</span>
                <span className="onboard__conceptblurb">{c.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field field--full">
          <span>
            Release cadence pledge — a set every <strong>{cfg.cadenceWeeks}</strong> weeks
          </span>
          <input
            type="range" min={MIN_CADENCE} max={MAX_CADENCE} step={1}
            value={cfg.cadenceWeeks}
            onChange={(e) => set({ cadenceWeeks: Number(e.target.value) })}
          />
          <span className="field__note">
            Miss your pledged rhythm and — after a short grace period — the community
            gets restless: sentiment sours and players drift away the longer you go dark.
            Genre norm: ~{DEFAULT_CADENCE_WEEKS} weeks.
          </span>
        </div>

        <button
          className="btn btn--design onboard__start"
          disabled={!canStart}
          onClick={() => onStart(cfg)}
        >
          {canStart ? `Launch ${cfg.gameName}` : 'Name your company & game to start'}
        </button>
      </div>
    </div>
  )
}
