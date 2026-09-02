// Studio › Overview — the brand at a glance. The identity that used to sit in
// the banner (studio, game, concept), the cadence pledge the studio is held to,
// and the franchise-reputation meter.

import Section from './nav/Section.jsx'
import { ReputationMeter } from './nav/Meter.jsx'
import { getConcept } from '../game/content/concepts.js'

export default function StudioOverview({ state }) {
  const concept = getConcept(state.config?.conceptId)
  const cadence = state.cadence ?? {}
  const pledge = cadence.weeks ?? state.config?.cadenceWeeks
  const lastRelease = state.sets.length ? state.sets[state.sets.length - 1] : null
  const sinceRelease = lastRelease ? state.week - lastRelease.releasedWeek : null
  const overdue = cadence.overdueWeeks ?? 0
  const years = (state.week / 52).toFixed(1)

  return (
    <Section id="studio.brand" title="The studio" level={2}>
      <dl className="brand">
        <div className="brand__row"><dt>Studio</dt><dd>{state.config?.companyName || '—'}</dd></div>
        <div className="brand__row"><dt>Game</dt><dd>{state.config?.gameName || '—'}</dd></div>
        <div className="brand__row"><dt>Concept</dt><dd>{concept.name} <span className="muted">({concept.resembles})</span></dd></div>
        <div className="brand__row"><dt>Age</dt><dd>Week {state.week} · {years} years</dd></div>
        <div className="brand__row">
          <dt>Cadence pledge</dt>
          <dd>
            every {pledge} weeks
            {sinceRelease != null && <span className="muted"> · last release {sinceRelease} wk ago</span>}
            {overdue > 0 && <span className="brand__overdue"> · {overdue} wk overdue</span>}
          </dd>
        </div>
        <div className="brand__row"><dt>Sets shipped</dt><dd>{state.sets.length}</dd></div>
        <div className="brand__row"><dt>Cast</dt><dd>{(state.characters ?? []).length} characters</dd></div>
      </dl>

      <div className="meters">
        <ReputationMeter state={state} />
      </div>
    </Section>
  )
}
