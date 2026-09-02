// Business › Illustrators — the artist roster's live career drift. Cost, reach
// and collector heat move every week (artists.js), and feed straight into what
// a signature card costs and how much collectors want it.

import { useMemo, useState } from 'react'
import { getArtist } from '../game/content/artists.js'
import Section from './nav/Section.jsx'

const TRAJ_LABEL = { rising: 'Rising', steady: 'Steady', established: 'Established', fading: 'Fading' }

const SORTS = {
  reach: (a, b) => b.reach - a.reach,
  heat: (a, b) => (b.heat ?? 0) - (a.heat ?? 0),
  cost: (a, b) => a.cost - b.cost,
  name: (a, b) => a.name.localeCompare(b.name),
}

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function trajClass(t) {
  if (t === 'established') return 'mood--good'
  if (t === 'fading') return 'mood--bad'
  return 'mood--neutral'
}

export default function IllustratorsPanel({ state }) {
  const [sort, setSort] = useState('reach')
  const [query, setQuery] = useState('')

  const artists = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (state.artists ?? [])
      .map((a) => {
        const base = getArtist(a.id)
        return { ...a, name: base?.name ?? a.id, specialty: base?.specialty ?? '' }
      })
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.specialty.toLowerCase().includes(q))
      .sort(SORTS[sort])
  }, [state.artists, sort, query])

  return (
    <Section id="biz.artists" title={`Illustrators (${artists.length})`} level={2}>
      <div className="roster__controls">
        <div className="roster__tools">
          <input
            className="roster__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists…"
          />
          <select className="roster__sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="reach">Reach</option>
            <option value="heat">Collector heat</option>
            <option value="cost">Cost</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <ul className="roster">
        {artists.map((a) => (
          <li key={a.id} className="roster__row">
            <div className="roster__head" style={{ cursor: 'default' }}>
              <div className="roster__main">
                <span className="roster__name">{a.name}</span>
                <span className="roster__type">{a.specialty} · {fmtCash(a.cost)}/card · heat {Math.round(a.heat ?? 0)}</span>
              </div>
              <div className="roster__meta">
                <span className="roster__reach" title={`Reach ${Math.round(a.reach)}`}>
                  <span className="bar"><span className="bar__fill" style={{ width: `${Math.max(0, Math.min(100, a.reach))}%` }} /></span>
                </span>
                <span className={`roster__mood ${trajClass(a.trajectory)}`}>{TRAJ_LABEL[a.trajectory] ?? a.trajectory}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
