// Community › Grassroots — money to the fans who run things outside the game
// store. A standing programme and one-off grants. See grassroots.js.

import { GRANT_KINDS, getGrantKind } from '../game/content/grassroots.js'
import { grantBlock } from '../game/grassroots.js'
import Section from './nav/Section.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function GrassrootsPanel({ state, onSetGrassroots, onFundGrant }) {
  const level = Math.round((state.grassroots?.level ?? 0) * 100)
  const weekly = state.lastOverhead?.grassroots ?? 0
  const history = [...(state.grassrootsGrants ?? [])].reverse()

  return (
    <>
      <Section id="community.grassroots" title="Grassroots programme" level={2} summary={`${level}% · ${fmtCash(weekly)}/wk`}>
        <label className="field field--full">
          <span>
            Weekly commitment — <strong>{level}%</strong>
            {weekly > 0 && <span className="muted"> ({fmtCash(weekly)}/wk)</span>}
          </span>
          <input
            type="range" min={0} max={100} step={5}
            value={level}
            onChange={(e) => onSetGrassroots(Number(e.target.value) / 100)}
          />
          <span className="field__note">
            Small standing grants to the volunteers who run leagues, clubs and
            meetups outside the game store. Costs up to $0.12 per player per
            week, lifts word of mouth by up to 35%, and makes the good local
            news likelier. It does not buy forgiveness — the community programme
            does that.
          </span>
        </label>
      </Section>

      <Section id="community.grants" title="Grants" level={2}>
        <ul className="distrib__list">
          {GRANT_KINDS.map((g) => {
            const block = grantBlock(state, g.id)
            return (
              <li key={g.id} className="distrib">
                <div className="distrib__head">
                  <span className="distrib__name">{g.name}</span>
                </div>
                <p className="distrib__blurb">{g.blurb}</p>
                <div className="distrib__terms">
                  <span>~{g.casual[0]}–{g.casual[1]} players</span>
                  <span>·</span>
                  <span>every {g.cooldownWeeks} weeks</span>
                </div>
                <button
                  className="btn btn--design distrib__sign"
                  disabled={!!block}
                  title={block ?? undefined}
                  onClick={() => onFundGrant(g.id)}
                >
                  {block ? block : `Fund — ${fmtCash(g.cost)}`}
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      {history.length > 0 && (
        <Section id="community.grants.history" title="Funded so far" level={2} defaultOpen={false}>
          <ul className="feed">
            {history.map((h, i) => (
              <li key={`${h.kindId}-${h.week}-${i}`} className={'feed__item' + (h.backfired ? ' item--warn' : '')}>
                {getGrantKind(h.kindId)?.name ?? h.kindId} · wk {h.week}{h.backfired ? ' — fell apart' : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
