// First-run onboarding. Name your company & game, pick the game it resembles
// (a light starting flavor tilt), and pledge a release cadence the community
// will hold you to. "Start" begins the run.

import { useState } from 'react'
import { ARCHETYPES, getArchetype, MIN_CADENCE, MAX_CADENCE, defaultConfig } from '../game/config.js'

export default function Onboarding({ onStart }) {
  const [cfg, setCfg] = useState(() => defaultConfig())
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }))
  const arch = getArchetype(cfg.archetype)

  // Picking an archetype snaps the cadence to its genre default (until the
  // player nudges the slider themselves).
  const pickArchetype = (id) => set({ archetype: id, cadenceWeeks: getArchetype(id).defaultCadence })

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
          <span>What does your game resemble?</span>
          <div className="onboard__archs">
            {ARCHETYPES.map((a) => (
              <button
                key={a.id}
                className={'onboard__arch' + (cfg.archetype === a.id ? ' is-active' : '')}
                onClick={() => pickArchetype(a.id)}
              >
                <span className="onboard__archname">{a.name}</span>
                <span className="onboard__archlike">{a.resembles}</span>
                <span className="onboard__archblurb">{a.blurb}</span>
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
            Genre norm for {arch.resembles}: ~{arch.defaultCadence} weeks.
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
