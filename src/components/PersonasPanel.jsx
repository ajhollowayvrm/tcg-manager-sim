// The community roster. With a 50+ scene, this panel filters and sorts so it
// stays scannable: filter by type, sort by reach/sentiment/name, and a search
// box. Credibility stays hidden — the player learns who to trust by watching.

import { useMemo, useState } from 'react'

const TYPE_LABEL = {
  streamer: 'Streamer',
  competitor: 'Pro',
  collector: 'Investor',
  reviewer: 'Reviewer',
  theorycrafter: 'Theorycrafter',
}

// Filter chips: All + each type.
const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'streamer', label: 'Streamers' },
  { id: 'competitor', label: 'Pros' },
  { id: 'collector', label: 'Investors' },
  { id: 'reviewer', label: 'Reviewers' },
  { id: 'theorycrafter', label: 'Theorycrafters' },
]

const SORTS = {
  reach: (a, b) => b.reach - a.reach,
  sentiment: (a, b) => b.sentiment - a.sentiment,
  name: (a, b) => a.name.localeCompare(b.name),
}

function sentimentClass(s) {
  if (s >= 30) return 'mood--good'
  if (s <= -30) return 'mood--bad'
  return 'mood--neutral'
}

function sentimentLabel(s) {
  if (s >= 50) return 'Loves it'
  if (s >= 20) return 'Warm'
  if (s > -20) return 'Neutral'
  if (s > -50) return 'Cooling'
  return 'Hostile'
}

// A small ↑/↓ if a voice's reach has drifted meaningfully from its seed — the
// community learning who to trust (and feuds) play out as rising/fading voices.
function reachTrend(p) {
  if (p.reachSeed == null) return null
  const d = p.reach - p.reachSeed
  if (d >= 3) return <span className="roster__trend roster__trend--up" title="Rising voice">↑</span>
  if (d <= -3) return <span className="roster__trend roster__trend--down" title="Fading voice">↓</span>
  return null
}

export default function PersonasPanel({ state }) {
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('reach')
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.personas
      .filter((p) => type === 'all' || p.type === type)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(SORTS[sort])
  }, [state.personas, type, sort, query])

  return (
    <div className="panel">
      <h2 className="panel__title">The Community ({state.personas.length})</h2>

      <div className="roster__controls">
        <div className="roster__filters">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              className={'roster__chip' + (type === f.id ? ' is-active' : '')}
              onClick={() => setType(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="roster__tools">
          <input
            className="roster__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names…"
          />
          <select className="roster__sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="reach">Reach</option>
            <option value="sentiment">Sentiment</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="panel__empty">No voices match.</p>
      ) : (
        <ul className="roster">
          {shown.map((p) => (
            <li key={p.id} className="roster__row" title={p.blurb}>
              <div className="roster__main">
                <span className="roster__name">{p.name}</span>
                <span className="roster__type">{TYPE_LABEL[p.type] ?? p.type}</span>
              </div>
              <div className="roster__meta">
                <span className="roster__reach" title={`Reach ${Math.round(p.reach)}`}>
                  <span className="bar"><span className="bar__fill" style={{ width: `${p.reach}%` }} /></span>
                  {reachTrend(p)}
                </span>
                <span className={`roster__mood ${sentimentClass(p.sentiment)}`}>{sentimentLabel(p.sentiment)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
