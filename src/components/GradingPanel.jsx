// Business › Grading — third-party authentication partners. A business
// relationship like a distributor deal, but it certifies a slice of the
// market's high-value singles each week on its own, rather than moving stock
// for a specific set. See grading.js.

import { GRADING_PARTNERS } from '../game/content/grading.js'
import Section from './nav/Section.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function GradingPanel({ state, onSignGrading, onCultivateGrading, onDropGrading }) {
  const graded = (state.cards ?? []).filter((c) => c.graded).length
  const active = (state.gradingPartners ?? []).filter((p) => p.active).length

  return (
    <Section id="biz.grading" title="Grading partners" level={2} summary={`${active} signed · ${graded} graded cards`}>
      <p className="panel__lede">
        A signed grader certifies a slice of your priciest live singles every
        week for a collector premium — and carries its own scandal risk, which
        cultivating the relationship halves.
      </p>
      <ul className="distrib__list">
        {GRADING_PARTNERS.map((g) => {
          const deal = (state.gradingPartners ?? []).find((p) => p.id === g.id && p.active)
          return (
            <li key={g.id} className={'distrib' + (deal ? ' distrib--active' : '')}>
              <div className="distrib__head">
                <span className="distrib__name">{g.name}</span>
              </div>
              <p className="distrib__blurb">{g.blurb}</p>
              <div className="distrib__terms">
                <span>grades ~{Math.round(g.gradeRate * 100)}% of the market/wk</span>
                <span>·</span>
                <span>{Math.round(g.scandalRisk * 100)}% weekly scandal risk</span>
              </div>
              {deal ? (
                <div className="distrib__actions">
                  <span className="distrib__signed">
                    Signed · rel {Math.round(deal.relationship ?? 0)}
                  </span>
                  <button className="btn btn--ghost" onClick={() => onCultivateGrading(g.id)}>Cultivate</button>
                  <button className="btn btn--ghost distrib__drop" onClick={() => onDropGrading(g.id)}>Drop</button>
                </div>
              ) : (
                <button className="btn btn--design distrib__sign" onClick={() => onSignGrading(g.id)}>
                  Sign — {fmtCash(g.cost)}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
