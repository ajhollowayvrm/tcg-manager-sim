// Cast & Artists — the persistent character roster and the artist roster's
// live career drift, both invisible everywhere else in the shipped UI even
// though they drift every week and feed straight into set design: fame gates
// icon-treatment eligibility (see characters.js's famePopBonus/TREATMENTS) and
// an artist's live cost/reach changes what a new signature card actually costs
// (see artists.js's currentArtist). Read-only — no actions live here, this is
// purely the "how's my cast doing" check the set builder can't show mid-run.

import { getArtist } from '../game/content/artists.js'

const CHAR_TRAJ_LABEL = { rising: 'Rising', established: 'Established', icon: 'Icon', fading: 'Fading' }
const ARTIST_TRAJ_LABEL = { rising: 'Rising', steady: 'Steady', established: 'Established', fading: 'Fading' }
const MAX_ROWS = 5

function trajClass(t) {
  if (t === 'icon' || t === 'established') return 'mood--good'
  if (t === 'fading') return 'mood--bad'
  return 'mood--neutral'
}

function CastRow({ name, sub, pct, pctTitle, trajectory, label }) {
  return (
    <li className="roster__row">
      <div className="roster__head" style={{ cursor: 'default' }}>
        <div className="roster__main">
          <span className="roster__name">{name}</span>
          {sub && <span className="roster__type">{sub}</span>}
        </div>
        <div className="roster__meta">
          <span className="roster__reach" title={pctTitle}>
            <span className="bar"><span className="bar__fill" style={{ width: `${pct}%` }} /></span>
          </span>
          <span className={`roster__mood ${trajClass(trajectory)}`}>{label ?? trajectory}</span>
        </div>
      </div>
    </li>
  )
}

export default function CastPanel({ state }) {
  const characters = [...(state.characters ?? [])].sort((a, b) => b.fame - a.fame).slice(0, MAX_ROWS)
  const artists = [...(state.artists ?? [])]
    .map((a) => ({ ...a, name: getArtist(a.id)?.name ?? a.id }))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, MAX_ROWS)

  if (!characters.length && !artists.length) return null

  return (
    <div className="panel">
      <h2 className="panel__title">Cast &amp; Artists</h2>

      {characters.length > 0 && (
        <>
          <h3 className="panel__subtitle">Characters, by fame</h3>
          <ul className="roster">
            {characters.map((c) => (
              <CastRow
                key={c.id}
                name={c.name}
                sub={c.species}
                pct={c.fame}
                pctTitle={`Fame ${Math.round(c.fame)}`}
                trajectory={c.trajectory}
                label={CHAR_TRAJ_LABEL[c.trajectory] ?? c.trajectory}
              />
            ))}
          </ul>
        </>
      )}

      {artists.length > 0 && (
        <>
          <h3 className="panel__subtitle">Artists, by reach</h3>
          <ul className="roster">
            {artists.map((a) => (
              <CastRow
                key={a.id}
                name={a.name}
                pct={a.reach}
                pctTitle={`Reach ${Math.round(a.reach)}`}
                trajectory={a.trajectory}
                label={ARTIST_TRAJ_LABEL[a.trajectory] ?? a.trajectory}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
