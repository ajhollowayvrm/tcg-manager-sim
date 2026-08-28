// Sets in print — sealed sell-through per set, grouped by BLOCK. Each block (a
// major's era + the minors/micros riding it) gets a header showing its gimmick
// and chase intensity; its sets nest beneath with tier badges. Sets that belong
// to no block (legacy saves, reprints) render ungrouped below. Makes the print-run
// decision legible: a set near 100% sold out was under-printed (lost sales), one
// stuck low has unsold stock (over-printed → bargain bins).

import SetSymbol from './SetSymbol.jsx'
import { reprintCost } from '../game/sets.js'
import { getTier } from '../game/blocks.js'

const REPRINT_RUN = 55 // matches the reducer's default reprint print run

// Below the clock's hard-stop pause threshold (see clock.js's CONTROVERSY_PAUSE
// = 70) — a forewarning so a set carrying a heating-up card is legible on this
// panel (where "pull from print" actually lives) before the clock pauses over
// it, not only after.
const HEAT_TAG_THRESHOLD = 50

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

// A short word for where a block's chase-intensity slider sits (mirrors the builder).
function intensityWord(intensity) {
  if (intensity <= 35) return 'subtle'
  if (intensity < 65) return 'balanced'
  return 'maximal chase'
}

export default function SetsPanel({ state, onReprint, onPull, onAdjustWave, onToggleOdds }) {
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

  // Pulling from print needs at least one OTHER set to stay live — mirrors the
  // gate the old Bans panel enforced (never leave the format with zero sets).
  const inPrintSets = sets.filter((s) => !s.rotated && !s.outOfPrint)
  const canPull = inPrintSets.length >= 2

  const wavesBySet = new Map((state.pendingWaves ?? []).map((w) => [w.setId, w]))
  const rowProps = { state, lastPerSet, onReprint, onPull, canPull, onAdjustWave, onToggleOdds, wavesBySet }

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
            return (
              <div key={b.id} className="blockgroup">
                <div className="blockgroup__head">
                  <span className="blockgroup__sym">◆</span>
                  <span className="blockgroup__name">{b.name}</span>
                  <span className="blockgroup__gimmick">{b.gimmickName}</span>
                  <span className="blockgroup__nature">
                    {intensityWord(b.intensity)}
                  </span>
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
function SetRow({ set, state, lastPerSet, onReprint, onPull, canPull, onAdjustWave, onToggleOdds, wavesBySet }) {
  const supply = set.supply ?? 0
  const sold = set.sold ?? 0
  const pct = supply > 0 ? clampPct((sold / supply) * 100) : 0
  const soldOut = supply > 0 && sold >= supply
  const wk = lastPerSet.get(set.id)
  const tier = set.tier ? getTier(set.tier) : null
  const wave = wavesBySet?.get(set.id)
  // Master-set completion cost — the real-hobby "what it costs to own one of
  // everything" headline stat, summed off current live singles.
  const masterSetCost = state.cards.reduce(
    (sum, c) => (c.setId === set.id && !c.banned && !c.rotated ? sum + (c.singlePrice ?? 0) : sum), 0,
  )
  // Qualitative-only signal (see clock.js) — the exact ban-pressure number stays
  // hidden (collector/reseller pivot), but the fact that SOME card in this set
  // is heating up needs to be legible right where the fix (pull from print) is.
  const hotCard = state.cards.find(
    (c) => c.setId === set.id && !c.banned && !c.rotated && (c.controversy ?? 0) >= HEAT_TAG_THRESHOLD,
  )
  const buzzPct = Math.round(((set.reprintBuzz ?? 0) + (set.treatmentBuzz ?? 0)) * 100)

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
          {buzzPct > 0 && (
            <span
              className="tag tag--buzz"
              title={`Extra pack demand from reprinted fan favorites and chase treatment cards (+${buzzPct}%)`}
            >
              ✨ buzz
            </span>
          )}
          {hotCard && (
            <span
              className="tag tag--heat"
              title={`${hotCard.name} is drawing serious community heat — pull this set from print before it boils over`}
            >
              🔥 drawing heat
            </span>
          )}
          {set.oddsPublished ? (
            <span className="tag tag--oddspublished" title="Real pull rates are public — builds trust, dampens a gambling-mechanics backlash risk">
              📖 odds published
            </span>
          ) : onToggleOdds && !set.rotated ? (
            <button
              type="button"
              className="tag tag--oddsobscured"
              onClick={() => onToggleOdds(set.id)}
              title="Pull rates aren't public yet — publish them to build trust (one-way; can't go back to obscured)"
            >
              🔒 odds obscured
            </button>
          ) : (
            <span className="tag tag--oddsobscured" title="Pull rates aren't public">🔒 odds obscured</span>
          )}
        </span>
        <span className="sets__wk">
          {wk ? `+$${wk.revenue.toLocaleString('en-US')}` : set.rotated ? 'out of print' : '—'}
        </span>
      </div>
      <div className="sets__track" title={`${sold.toLocaleString()} / ${supply.toLocaleString()} packs sold`}>
        <span className="sets__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sets__meta">
        <span>
          {compact(sold)} / {compact(supply)} packs · ${set.price.toFixed(2)} MSRP
          {masterSetCost > 0 && (
            <span className="muted" title="Sum of every live single's current price — what it costs to own one of everything">
              {' '}· master set ${masterSetCost >= 1000 ? (masterSetCost / 1000).toFixed(1) + 'k' : Math.round(masterSetCost)}
            </span>
          )}
        </span>
        {/* Pull from print: a collector-economy lever — stop printing a live set
            to spike its scarcity (singles pop, sets up a first-edition premium
            later). Only offered while the set is still actually in print, and
            only if pulling it won't empty the format entirely. */}
        {onPull && !set.rotated && !set.outOfPrint && (
          <button
            className="btn btn--ghost sets__pull"
            disabled={!canPull}
            onClick={() => onPull(set.id)}
            title={canPull
              ? 'Pull this set from publication — scarcity pop + collector goodwill; you forfeit its future pack sales'
              : 'Need at least two sets in print to pull one'}
          >
            ⏻ Pull from print
          </button>
        )}
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
      {/* Regional stagger: a wide-release wave is pending. React to how the
          lead region performed by investing more or pulling back — a single
          read-the-room call, disabled once used. */}
      {wave && (
        <div className="sets__wave">
          <span className="sets__wavelabel" title={`Wide release lands week ${wave.applyWeek} — ${wave.amount.toLocaleString('en-US')} players queued`}>
            📡 Wide release wk {wave.applyWeek}: {wave.amount.toLocaleString('en-US')} players
          </span>
          {onAdjustWave && !wave.adjusted && (
            <span className="sets__waveactions">
              <button className="btn btn--ghost" onClick={() => onAdjustWave(set.id, 'up')} title="Invest more marketing — a bigger wave, real cash cost">
                + Invest more
              </button>
              <button className="btn btn--ghost" onClick={() => onAdjustWave(set.id, 'down')} title="Pull back marketing — a smaller wave, a partial refund">
                − Pull back
              </button>
            </span>
          )}
        </div>
      )}
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
