// Sets in print — sealed sell-through per set, grouped by BLOCK. Each block (a
// major's era + the minors/micros riding it) gets a header showing its gimmick,
// nature, and live warp; its sets nest beneath with tier badges. Sets that belong
// to no block (legacy saves, reprints) render ungrouped below. Makes the print-run
// decision legible: a set near 100% sold out was under-printed (lost sales), one
// stuck low has unsold stock (over-printed → bargain bins).

import SetSymbol from './SetSymbol.jsx'
import { reprintCost } from '../game/sets.js'
import { getTier } from '../game/blocks.js'

const REPRINT_RUN = 55 // matches the reducer's default reprint print run

// Short labels for the per-SKU sell-through chips.
const SKU_LABEL = { booster: '📦', bundle: 'Bundle', spc: 'SPC', tin: 'Tin' }

function pctStr(sold, supply) {
  if (!supply) return '0%'
  return Math.round(Math.min(100, (sold / supply) * 100)) + '%'
}

function compact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

// A short word for where a block's nature slider sits (mirrors the builder).
function natureWord(nature) {
  if (nature <= 35) return 'competitive'
  if (nature < 65) return 'balanced'
  return 'collector'
}

export default function SetsPanel({ state, onReprint }) {
  const sets = state.sets
  const blocks = state.blocks ?? []
  const lastPerSet = new Map((state.lastRevenue?.perSet ?? []).map((p) => [p.id, p]))

  // Partition sets: those belonging to a known block (grouped under it, in block
  // order) vs. the rest (legacy / reprints / blockless) rendered flat afterward.
  const blockById = new Map(blocks.map((b) => [b.id, b]))
  const grouped = new Map(blocks.map((b) => [b.id, []]))
  const ungrouped = []
  for (const set of sets) {
    if (set.blockId && grouped.has(set.blockId)) grouped.get(set.blockId).push(set)
    else ungrouped.push(set)
  }

  const rowProps = { state, lastPerSet, onReprint }

  return (
    <div className="panel">
      <h2 className="panel__title">Sets in Print</h2>
      {sets.length === 0 ? (
        <p className="panel__empty">No sets released yet.</p>
      ) : (
        <div className="sets">
          {blocks.map((b) => {
            const blockSets = grouped.get(b.id) ?? []
            if (!blockSets.length) return null
            const warpPct = Math.round(Math.min(1, (b.warp ?? 0) / Math.max(0.001, b.warpBase ?? 1)) * 100)
            return (
              <div key={b.id} className="blockgroup">
                <div className="blockgroup__head">
                  <span className="blockgroup__sym">◆</span>
                  <span className="blockgroup__name">{b.name}</span>
                  <span className="blockgroup__gimmick">{b.gimmickName}</span>
                  <span className="blockgroup__nature">
                    {natureWord(b.nature)} · {b.lean}
                  </span>
                </div>
                {/* Live warp: how strongly this block still bends the format. */}
                <div
                  className="blockgroup__warp"
                  title={`Gimmick warp ${warpPct}% — the block's pull on the metagame (decays weekly, refreshed by new sets)`}
                >
                  <span className="blockgroup__warpfill" style={{ width: `${warpPct}%` }} />
                </div>
                <ul className="blockgroup__sets">
                  {blockSets.map((set) => <SetRow key={set.id} set={set} {...rowProps} />)}
                </ul>
              </div>
            )
          })}

          {ungrouped.length > 0 && (
            <ul className="sets__flat" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ungrouped.map((set) => <SetRow key={set.id} set={set} {...rowProps} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// One set's sell-through row. Carries a tier badge (major/minor/micro) when the
// set declares a tier; legacy sets show none.
function SetRow({ set, state, lastPerSet, onReprint }) {
  const supply = set.supply ?? 0
  const sold = set.sold ?? 0
  const pct = supply > 0 ? clampPct((sold / supply) * 100) : 0
  const soldOut = supply > 0 && sold >= supply
  const wk = lastPerSet.get(set.id)
  const tier = set.tier ? getTier(set.tier) : null

  return (
    <li className={'sets__row' + (set.rotated && !set.outOfPrint ? ' sets__row--rotated' : '') + (set.outOfPrint ? ' sets__row--oop' : '')}>
      <div className="sets__head">
        <span className="sets__name">
          <SetSymbol themeId={set.themeId} rarity="rare" size={15} />
          {set.name}
          {tier && <span className={`tag tag--${set.tier}`} title={tier.blurb}>{tier.symbol} {set.tier}</span>}
          {set.firstEdition && <span className="tag tag--outofprint" title="Original printing — a permanent premium tier">1st ed</span>}
          {set.outOfPrint
            ? <span className="tag tag--outofprint">out of print</span>
            : set.rotated && <span className="tag tag--rotated">rotated</span>}
          {soldOut && !set.rotated && <span className="tag tag--soldout">sold out</span>}
        </span>
        <span className="sets__wk">
          {wk ? `+$${wk.revenue.toLocaleString('en-US')}` : set.rotated ? 'out of print' : '—'}
        </span>
      </div>
      <div className="sets__track" title={`${sold.toLocaleString()} / ${supply.toLocaleString()} packs sold`}>
        <span className="sets__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sets__meta">
        <span>{compact(sold)} / {compact(supply)} packs · ${set.price.toFixed(2)} MSRP</span>
        {/* Reprint: re-issue as an Unlimited run. Reprintable only once the first
            printing has ended (pulled out of print, or sold out) and not already
            reprinted / not a reprint itself. */}
        {onReprint && !set.reprintOf && !set.reprinted && (set.outOfPrint || soldOut) && (() => {
          const cost = reprintCost(REPRINT_RUN)
          const onCredit = (state.cash ?? 0) < cost
          return (
            <button
              className={'btn btn--ghost sets__reprint' + (set.outOfPrint ? ' sets__reprint--hot' : '')}
              onClick={() => onReprint(set.id)}
              title={`Reprint as an Unlimited run (~$${cost.toLocaleString('en-US')})${onCredit ? ' — on credit (into debt)' : ''} — fresh supply to sell; the original becomes a first-edition premium`}
            >
              ⟳ Reprint
            </button>
          )
        })()}
      </div>
      {/* Per-SKU sell-through for multi-product sets (beyond boosters). */}
      {(set.products?.length ?? 0) > 1 && (
        <div className="sets__skus">
          {set.products.map((p) => (
            <span key={p.kind} className="sets__sku" title={`${(p.sold ?? 0).toLocaleString()} / ${(p.supply ?? 0).toLocaleString()} sold`}>
              {SKU_LABEL[p.kind] ?? p.kind} {pctStr(p.sold, p.supply)}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

function clampPct(p) {
  return Math.round(Math.min(100, Math.max(0, p)) * 10) / 10
}
