// Misc › Legacy — the live score, milestones, the career's banked prestige and
// its perks, and the voluntary exit. Never a win condition: nothing here
// proposes retiring, it is simply always available.

import { MILESTONES } from '../game/content/milestones.js'
import { PRESTIGE_PERKS, scoreRun } from '../game/legacy.js'
import { RetireControl } from './RetrospectivePanel.jsx'
import Section from './nav/Section.jsx'

function num(n) {
  return Math.round(n).toLocaleString('en-US')
}

export default function LegacyPanel({ state, onRetire, retireConfirm, onRetireConfirm }) {
  const earned = new Map((state.legacy?.earned ?? []).map((e) => [e.id, e]))
  const score = scoreRun(state)
  const banked = state.prestige?.banked ?? 0
  const nextPerk = PRESTIGE_PERKS.find((p) => banked < p.at)

  return (
    <>
      <Section id="misc.legacy" title="Legacy" level={2} summary={`${num(score.total)} · ${score.grade}`}>
        <div className="costs">
          <div className="costs__line">
            <span>Legacy this run</span><span>{num(score.total)} · {score.grade}</span>
          </div>
          <div className="costs__line">
            <span>Milestones earned</span>
            <span>{earned.size}/{MILESTONES.length}</span>
          </div>
          {banked > 0 && (
            <div className="costs__line">
              <span>Banked from past studios</span><span>{num(banked)}</span>
            </div>
          )}
        </div>

        <Section id="misc.legacy.milestones" title={`Milestones (${earned.size}/${MILESTONES.length})`} level={3} defaultOpen={false}>
          <ul className="retro__milestones">
            {MILESTONES.map((m) => {
              const hit = earned.get(m.id)
              return (
                <li key={m.id} className={'retro__ms' + (hit ? ' is-earned' : '')}>
                  <span className="retro__msmark" aria-hidden="true">{hit ? '🏆' : '·'}</span>
                  <span className="retro__msname">{m.name}</span>
                  <span className="retro__msblurb">{m.blurb}</span>
                  <span className="retro__mspts">{hit ? `wk ${hit.week}` : `${m.points}`}</span>
                </li>
              )
            })}
          </ul>
        </Section>

        <Section id="misc.legacy.perks" title="Career perks" level={3} defaultOpen={false}>
          <p className="field__note">
            Banked legacy across every retired studio unlocks perks for future
            runs. They are earned, never bought.
          </p>
          <ul className="retro__perks">
            {PRESTIGE_PERKS.map((p) => {
              const has = banked >= p.at
              return (
                <li key={p.id} className={'retro__perk' + (has ? ' is-earned' : '')}>
                  <span className="retro__msmark" aria-hidden="true">{has ? '✓' : '🔒'}</span>
                  <span className="retro__msname">{p.name}</span>
                  <span className="retro__msblurb">{p.blurb}</span>
                  <span className="retro__mspts">{has ? 'unlocked' : num(p.at)}</span>
                </li>
              )
            })}
          </ul>
          {nextPerk && (
            <p className="field__note">
              {num(nextPerk.at - banked)} more legacy unlocks “{nextPerk.name}”.
            </p>
          )}
        </Section>
      </Section>

      {onRetire && (
        <Section id="misc.retire" title="Retire the studio" level={2} defaultOpen={false}>
          <p className="field__note">
            End the run on your own terms after its first year and bank its
            legacy toward the next studio. Nothing in the game will ever suggest
            it.
          </p>
          <RetireControl
            state={state}
            onRetire={onRetire}
            confirming={retireConfirm}
            onConfirming={onRetireConfirm}
          />
        </Section>
      )}
    </>
  )
}
