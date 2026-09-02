// Business › Illustrators — the artist roster's live career drift (cost, reach
// and collector heat move every week, artists.js) and exclusive contracts: a
// signing fee and a weekly retainer buy a locked rate, a discount on every
// commission, and a hotter hand for the term.

import { useMemo, useState } from 'react'
import { getArtist } from '../game/content/artists.js'
import { activeContract, contractTerms, CONTRACT_TERMS, MAX_ARTIST_CONTRACTS } from '../game/artists.js'
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

export default function IllustratorsPanel({ state, onSignArtist, onEndArtist }) {
  const [sort, setSort] = useState('reach')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)

  const contracts = (state.artistContracts ?? []).filter((c) => c.active)
  const weeklyTotal = contracts.reduce((s, c) => s + c.weeklyFee, 0)
  const atCap = contracts.length >= MAX_ARTIST_CONTRACTS

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
    <>
      {contracts.length > 0 && (
        <Section id="biz.contracts" title="Exclusive contracts" level={2} summary={`${contracts.length}/${MAX_ARTIST_CONTRACTS} · ${fmtCash(weeklyTotal)}/wk`}>
          <ul className="roster">
            {contracts.map((c) => {
              const name = getArtist(c.artistId)?.name ?? c.artistId
              return (
                <li key={c.artistId} className="roster__row">
                  <div className="roster__head" style={{ cursor: 'default' }}>
                    <div className="roster__main">
                      <span className="roster__name">{name}</span>
                      <span className="roster__type">
                        {fmtCash(c.weeklyFee)}/wk · {Math.max(0, c.endsWeek - state.week)} weeks left · rate locked at {fmtCash(c.lockedCost)}
                      </span>
                    </div>
                    <button className="btn btn--ghost distrib__drop" onClick={() => onEndArtist(c.artistId)}>End early</button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="field__note">
            A contracted artist's rate is frozen for the term, every commission
            with them costs 40% less, and their collector heat climbs faster.
            Ending early pays a quarter of the remaining fees.
          </p>
        </Section>
      )}

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
          {artists.map((a) => {
            const deal = activeContract(state, a.id)
            const open = openId === a.id
            return (
              <li key={a.id} className={'roster__row' + (deal ? ' is-contracted' : '')}>
                <button className="roster__head" onClick={() => setOpenId(open ? null : a.id)} title={`${open ? 'Hide' : 'Show'} contract terms`}>
                  <div className="roster__main">
                    <span className="roster__name">{a.name}{deal ? ' · signed' : ''}</span>
                    <span className="roster__type">{a.specialty} · {fmtCash(a.cost)}/card · heat {Math.round(a.heat ?? 0)}</span>
                  </div>
                  <div className="roster__meta">
                    <span className="roster__reach" title={`Reach ${Math.round(a.reach)}`}>
                      <span className="bar"><span className="bar__fill" style={{ width: `${Math.max(0, Math.min(100, a.reach))}%` }} /></span>
                    </span>
                    <span className={`roster__mood ${trajClass(a.trajectory)}`}>{TRAJ_LABEL[a.trajectory] ?? a.trajectory}</span>
                  </div>
                </button>
                {open && onSignArtist && (
                  <div className="roster__actions">
                    {deal ? (
                      <button className="btn btn--ghost distrib__drop" onClick={() => onEndArtist(a.id)}>End contract early</button>
                    ) : (
                      CONTRACT_TERMS.map((weeks) => {
                        const t = contractTerms(a, weeks)
                        return (
                          <button
                            key={weeks}
                            className="btn btn--ghost"
                            disabled={atCap}
                            title={atCap ? `You can hold ${MAX_ARTIST_CONTRACTS} exclusives at a time.` : `${fmtCash(t.signingFee)} to sign, then ${fmtCash(t.weeklyFee)}/wk for ${weeks} weeks`}
                            onClick={() => onSignArtist(a.id, weeks)}
                          >
                            Sign {weeks}w — {fmtCash(t.signingFee)} + {fmtCash(t.weeklyFee)}/wk
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}
