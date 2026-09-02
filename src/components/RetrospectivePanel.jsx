// The run retrospective — shown once a run ends, by voluntary retirement or by
// ruin. Both endings share this screen; see legacy.js's scoreRun.
//
// This is deliberately NOT a victory screen. docs/BRIEF.md is explicit that the
// game has no win condition, so nothing here congratulates the player for
// "finishing" — it reports what the studio did, what it was remembered for, and
// what it banked toward the next run.

import { MILESTONES } from '../game/content/milestones.js'
import { PRESTIGE_PERKS } from '../game/legacy.js'
import { loadHallOfFame } from '../game/persistence.js'
import Section from './nav/Section.jsx'

const PART_LABEL = {
  endurance: 'Endurance',
  audience: 'Audience',
  prestige: 'Prestige',
  goodwill: 'Goodwill',
  milestones: 'Milestones',
  business: 'Business',
  treasury: 'Treasury',
}

const PART_BLURB = {
  endurance: 'how long the studio lasted',
  audience: 'the biggest the player base ever got',
  prestige: 'peak franchise reputation',
  goodwill: 'the share of the run the community liked you',
  milestones: 'what the studio was remembered for',
  business: 'lifetime revenue',
  treasury: 'what was left in the bank',
}

function num(n) {
  return Math.round(n).toLocaleString('en-US')
}

export default function RetrospectivePanel({ state, onReset }) {
  const r = state.retirement
  if (!r) return null
  const retired = state.gameOver?.kind === 'retired'
  const L = state.legacy
  const earned = new Map((L?.earned ?? []).map((e) => [e.id, e]))
  const hof = loadHallOfFame()
  const banked = state.prestige?.banked ?? 0
  // Perks the player has already unlocked, plus the next one to aim at.
  const bankedAfter = retired ? banked + r.total : banked
  const nextPerk = PRESTIGE_PERKS.find((p) => bankedAfter < p.at)

  return (
    <div className="modal">
      <div className="modal__sheet" role="dialog" aria-modal="true" aria-labelledby="retro-title">
        <header className="modal__head">
          <h2 id="retro-title">{retired ? 'The studio closes its doors' : 'The studio folds'}</h2>
        </header>

        <div className="modal__body">
          <p className="retro__reason">{state.gameOver?.reason}</p>

          <div className="retro__score">
            <span className="retro__total">{num(r.total)}</span>
            <span className="retro__grade">{r.grade}</span>
            {!retired && (
              <span className="field__note">
                A run that ends in ruin keeps its score at a 40% haircut. The studio
                folded — that is part of the story, not an erasure of it.
              </span>
            )}
          </div>

          <Section id="retro.parts" title="Where the score came from" level={3}>
            <div className="costs">
              {Object.entries(r.parts).map(([k, v]) => (
                <div key={k} className="costs__line">
                  <span>{PART_LABEL[k] ?? k} <span className="muted">— {PART_BLURB[k]}</span></span>
                  <span>{num(v)}</span>
                </div>
              ))}
              <div className="costs__line costs__line--total">
                <span>Total</span><span>{num(r.total)}</span>
              </div>
            </div>
          </Section>

          <Section id="retro.peaks" title="Peaks" level={3}>
            <div className="costs">
              <div className="costs__line"><span>Players</span><span>{num(L.peak.players)}</span></div>
              <div className="costs__line"><span>Franchise reputation</span><span>{num(L.peak.reputation)}</span></div>
              <div className="costs__line"><span>Priciest single</span><span>${num(L.peak.cardPrice)}</span></div>
              <div className="costs__line"><span>Best week's revenue</span><span>${num(L.peak.weeklyRevenue)}</span></div>
              <div className="costs__line"><span>Lifetime revenue</span><span>${num(L.totals.grossRevenue)}</span></div>
              <div className="costs__line"><span>Sets shipped</span><span>{num(L.totals.setsShipped)}</span></div>
            </div>
          </Section>

          <Section id="retro.milestones" title={`Milestones (${earned.size}/${MILESTONES.length})`} level={3}>
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

          <Section id="retro.career" title="Career" level={3}>
            <p className="field__note">
              {retired
                ? `Banked ${num(r.total)} legacy toward your career — ${num(bankedAfter)} across ${(state.prestige?.runs ?? 0) + 1} retired studios.`
                : `A studio that folds banks nothing. Your career total stays at ${num(banked)}.`}
            </p>
            <ul className="retro__perks">
              {PRESTIGE_PERKS.map((p) => {
                const has = bankedAfter >= p.at
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
                {num(nextPerk.at - bankedAfter)} more legacy unlocks “{nextPerk.name}”.
              </p>
            )}
          </Section>

          {hof.length > 0 && (
            <Section id="retro.hof" title="Hall of fame" level={3}>
              <ul className="feed">
                {hof.slice(0, 8).map((h, i) => (
                  <li key={i} className="feed__item">
                    <strong>{num(h.total)}</strong> — {h.company} ({h.game}), {h.weeks} weeks · {h.grade}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <footer className="modal__foot">
          <div className="builder__actions">
            <button className="btn btn--design" onClick={onReset}>Found a new studio</button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// The retire control, shown in Misc › Legacy. Deliberately a plain,
// always-available button behind a two-step confirm: nothing in the game ever
// PROPOSES retiring, because the moment it does the run acquires a ceiling and
// stops being open-ended.
export function RetireControl({ state, onRetire, confirming, onConfirming }) {
  const tooEarly = state.week < 52
  return (
    <div className="retire">
      {!confirming ? (
        <button
          className="btn btn--ghost retire__btn"
          disabled={tooEarly}
          onClick={() => onConfirming(true)}
          title={tooEarly
            ? 'You can retire the studio after its first year.'
            : 'End the run on your own terms and bank its legacy toward future runs.'}
        >
          Retire the studio…
        </button>
      ) : (
        <div className="settings__confirm">
          <p>
            Retiring ends this run for good and banks its legacy toward your next
            studio. There is no way back.
          </p>
          <div className="settings__confirmrow">
            <button className="btn btn--ghost" onClick={() => onConfirming(false)}>Keep going</button>
            <button className="btn btn--ban" onClick={onRetire}>Retire</button>
          </div>
        </div>
      )}
    </div>
  )
}
