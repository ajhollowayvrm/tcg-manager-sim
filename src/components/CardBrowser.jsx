// The card browser — every single you have ever printed, searchable.
//
// The Market Ticker shows the top 12 cards by price. A late run holds several
// thousand, so the player could see about 0.2% of the thing docs/BRIEF.md calls
// "the reward system", and had no way to look up a specific card, compare a
// set's chase pulls, or find what a decision actually did to a printing.
//
// The filter/search/sort pattern is lifted wholesale from PersonasPanel, which
// already solves exactly this problem for a 52-strong roster; the row grid and
// rarity foiling come from MarketTicker. Paged rather than virtualised — a
// fixed page size keeps the DOM small without pulling in a windowing library.

import { useMemo, useState } from 'react'
import SetSymbol from './SetSymbol.jsx'
import { visualTier, getRarity, printingOf } from '../game/rarities.js'
import { illustrationContext } from '../game/illustrationsets.js'
import { getIllustrationKind } from '../game/content/illustrationsets.js'
import Section from './nav/Section.jsx'

const PAGE = 40

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'inprint', label: 'In print' },
  { id: 'outofprint', label: 'Out of print' },
  { id: 'chase', label: 'Chase' },
  { id: 'variant', label: 'Variants' },
  { id: 'illustration', label: 'Illustration sets' },
  { id: 'graded', label: 'Graded' },
  { id: 'serial', label: 'Serialised' },
  { id: 'promo', label: 'Promo' },
]

const SORTS = {
  price: { label: 'Price', fn: (a, b) => (b.singlePrice ?? 0) - (a.singlePrice ?? 0) },
  move: { label: 'Weekly move', fn: (a, b) => Math.abs(b._pct ?? 0) - Math.abs(a._pct ?? 0) },
  rarity: { label: 'Rarity', fn: (a, b) => (b.popFactors?.rarity ?? 0) - (a.popFactors?.rarity ?? 0) },
  name: { label: 'Name', fn: (a, b) => a.name.localeCompare(b.name) },
  newest: { label: 'Newest', fn: (a, b) => (b._released ?? 0) - (a._released ?? 0) },
}

function money(n) {
  return '$' + (n ?? 0).toFixed(2)
}

export default function CardBrowser({ state }) {
  const [status, setStatus] = useState('all')
  const [setId, setSetId] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('price')
  const [page, setPage] = useState(0)

  const setById = useMemo(() => new Map(state.sets.map((s) => [s.id, s])), [state.sets])
  const moverPct = useMemo(
    () => new Map((state.movers ?? []).map((m) => [m.id, m.pct])),
    [state.movers],
  )
  // Which cards belong to an illustration set, built the same way the market
  // builds it — one pass, shared by the badge and the filter.
  const groups = useMemo(() => illustrationContext(state), [state])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = state.cards
      .map((c) => {
        const set = setById.get(c.setId)
        return { ...c, _set: set, _pct: moverPct.get(c.id) ?? 0, _released: set?.releasedWeek ?? 0, _group: groups.get(c.id) ?? null }
      })
      .filter((c) => {
        if (setId !== 'all' && c.setId !== setId) return false
        if (q && !c.name.toLowerCase().includes(q)) return false
        switch (status) {
          case 'inprint': return !c.rotated && !c.outOfPrint && !c.promo
          case 'outofprint': return !!(c.outOfPrint || c._set?.outOfPrint)
          case 'chase': return !!(c.treatment || c.secret || c.signature)
          // Alternate printings only — the fastest way to see what every
          // variant in the catalog is actually worth, side by side.
          case 'variant': return !!c.variantOf
          case 'illustration': return !!c._group
          case 'graded': return !!c.graded
          case 'serial': return !!c.serialCap
          case 'promo': return !!c.promo
          default: return true
        }
      })
    rows.sort(SORTS[sort].fn)
    return rows
  }, [state.cards, setById, moverPct, groups, status, setId, query, sort])

  // Clamp the page whenever the filters shrink the list under the cursor.
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const current = Math.min(page, pages - 1)
  const slice = shown.slice(current * PAGE, current * PAGE + PAGE)
  const totalValue = shown.reduce((sum, c) => sum + (c.singlePrice ?? 0), 0)

  const reset = (fn) => (v) => { fn(v); setPage(0) }

  return (
    <Section id="stats.cards" title="Card Browser" level={2}>

      {state.cards.length === 0 ? (
        <p className="panel__empty">No cards printed yet. Release a set.</p>
      ) : (
        <>
          <div className="roster__controls">
            <div className="roster__filters">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={'roster__chip' + (status === f.id ? ' is-active' : '')}
                  onClick={() => reset(setStatus)(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="roster__tools">
              <input
                className="roster__search"
                value={query}
                onChange={(e) => reset(setQuery)(e.target.value)}
                placeholder="Search cards…"
                aria-label="Search cards by name"
              />
              <select value={setId} onChange={(e) => reset(setSetId)(e.target.value)} aria-label="Filter by set">
                <option value="all">All sets</option>
                {state.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="roster__sort" value={sort} onChange={(e) => reset(setSort)(e.target.value)} aria-label="Sort cards">
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {status === 'illustration' && (
            <IllustrationSummary state={state} onPick={(name) => reset(setQuery)(name)} />
          )}

          <p className="browser__count">
            {shown.length.toLocaleString()} card{shown.length === 1 ? '' : 's'}
            {shown.length !== state.cards.length && <> of {state.cards.length.toLocaleString()}</>}
            {' · '}
            <span title="Sum of every listed card's current single price">
              {'$' + Math.round(totalValue).toLocaleString()} combined
            </span>
          </p>

          {slice.length === 0 ? (
            <p className="panel__empty">Nothing matches those filters.</p>
          ) : (
            <ul className="ticker browser__list">
              {slice.map((c) => {
                const tier = visualTier(c._set?.rarities, c.rarity)
                const printing = printingOf(c._set?.rarities, c.rarity)
                const oop = c.outOfPrint || c._set?.outOfPrint
                return (
                  <li key={c.id} className="ticker__row browser__row">
                    <span className={`ticker__name rarity--${tier}`}>
                      <SetSymbol themeId={c._set?.themeId} tier={tier} size={13} />
                      {c.name}
                      {printing.isVariant && (
                        <span className="tag tag--variant" title={`${printing.variantName} — a separate printing of this card`}>
                          {printing.variantName}
                        </span>
                      )}
                      {c._group && (
                        <span
                          className={'tag tag--ilset' + (c._group.isCapstone ? ' is-capstone' : '')}
                          title={`${c._group.group.name} — ${c._group.group.members.length} of ${c._group.group.plannedSize}${c._group.isCapstone ? ', and the card that finishes it' : ''}`}
                        >
                          {c._group.isCapstone ? '★ ' : ''}{c._group.group.name}
                        </span>
                      )}
                      {c.serialCap && (
                        <span className="tag tag--serial">{c.serialIssued}/{c.serialCap}</span>
                      )}
                      {c.graded && <span className="tag tag--graded">✅</span>}
                      {c.promo && <span className="tag tag--outofprint">promo</span>}
                      {oop && !c.promo && <span className="tag tag--outofprint">out of print</span>}
                    </span>
                    <span className="browser__meta">
                      {c._set?.name ?? '—'} · {getRarity(c._set?.rarities, c.rarity).name}
                      {c.number && <> · {c.number}</>}
                    </span>
                    <span className="ticker__price">
                      {money(c.singlePrice)}
                      {!!c._pct && (
                        <span className={'ticker__pct ' + (c._pct >= 0 ? 'is-up' : 'is-down')}>
                          {c._pct >= 0 ? '+' : ''}{(c._pct * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {pages > 1 && (
            <div className="browser__pager">
              <button className="btn btn--ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
                ← Previous
              </button>
              <span className="browser__pageno">Page {current + 1} of {pages}</span>
              <button className="btn btn--ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

// The binder view: every illustration set the studio has, as a row. This is the
// payoff surface for the whole mechanic — without it a group is a hidden price
// multiplier, and the thing a collector actually enjoys (seeing the run sitting
// together, and the hole in it) never appears anywhere.
function IllustrationSummary({ state, onPick }) {
  const groups = state.illustrationSets ?? []
  if (!groups.length) {
    return (
      <p className="panel__empty">
        No illustration sets yet. Open one in the set builder — a group of cards
        meant to be collected together.
      </p>
    )
  }
  const byId = new Map(state.cards.map((c) => [c.id, c]))
  const ordered = [...groups].sort((a, b) => (b.openedWeek ?? 0) - (a.openedWeek ?? 0))

  return (
    <ul className="ilsetlist">
      {ordered.map((g) => {
        const kind = getIllustrationKind(g.kindId)
        const members = (g.members ?? []).map((m) => byId.get(m.cardId)).filter(Boolean)
        const value = members.reduce((sum, c) => sum + (c.singlePrice ?? 0), 0)
        const owed = Math.max(0, (g.plannedSize ?? 0) - (g.members?.length ?? 0))
        return (
          <li key={g.id} className={`ilsetlist__row is-${g.status}`}>
            <div className="ilsetlist__head">
              <button className="ilsetlist__name" onClick={() => onPick(members[0]?.name ?? '')}>
                {g.name}
              </button>
              <span className="ilsetlist__meta">
                {kind.name}
                {g.discovered && <span className="tag tag--found" title="Collectors named this one; the studio never planned it">fan-named</span>}
                {' · '}{g.members.length}/{g.plannedSize}
                {' · '}cohesion {Math.round((g.cohesion ?? 0) * 100)}%
                {' · '}${Math.round(value).toLocaleString()}
              </span>
            </div>
            <div className="ilsetlist__cards">
              {members.map((c) => (
                <span key={c.id} className="ilsetlist__card" title={`$${(c.singlePrice ?? 0).toFixed(2)}`}>
                  {c.name}
                </span>
              ))}
              {Array.from({ length: owed }, (_, i) => (
                <span key={`gap${i}`} className="ilsetlist__card is-gap">not yet printed</span>
              ))}
            </div>
            {g.status !== 'complete' && (
              <span className="ilsetlist__status">
                {g.status === 'open' && `${owed} still promised.`}
                {g.status === 'stale' && `⚠ ${owed} promised and nothing new in a long time.`}
                {g.status === 'abandoned' && `Written off. The premium is gone.`}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
