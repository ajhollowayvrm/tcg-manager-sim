/**
 * The secondary market: what your cards are worth, and who is holding them.
 *
 * Three rules bind this file.
 *
 * **Never `Printing.truth.chase`.** The hidden lognormal roll is what makes
 * value emergent rather than authored by rarity placement. A player infers it
 * from price; they never read it.
 *
 * **Plot against the stored tick.** `SparseSeries` is compacted, so points are
 * unevenly spaced by design. An index plot stretches the quiet years.
 *
 * **`forecastPrice` cannot see a shock coming**, and that is deliberate:
 * analytics buys a sharper view of the trend, never of the surprise. It is
 * presented as a band around a trend and never called a prediction.
 *
 * There is no price index in the model — `MarketState.indexes` was cut in C12
 * because it was written once at world creation and never updated, so a chart
 * built on it drew a flat line for fifty years. The index here is computed from
 * `rawHistory` when the screen asks for one.
 */
import { useMemo, useState } from 'react';
import type { SimState, PrintingId, GradeTier, SetId } from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import { forecastPrice } from '../../sim/readings.ts';
import { tradeablePopulation, realisableCardValue } from '../../sim/actors.ts';
import {
  C, MONO, num, label, micro, Button, Note, Empty, Sheet, Slider, Stat, StatRow,
  Row, Tabs, Legend, SEQ_HEX, selectStyle,
} from '../ui.tsx';
import { Chart, Sparkline, type Series } from '../chart.tsx';
import { VirtualList } from '../list.tsx';
import { money, moneyExact, stamp, yearOf, pct, compact } from '../format.ts';
import { commit } from '../store.ts';

const TIERS: GradeTier[] = ['10', '9.5', '9', '8', '7', 'below7'];

type Sort = 'Price' | 'Heat' | 'Newest';

export function Market({ s }: { s: SimState }) {
  const [sort, setSort] = useState<Sort>('Price');
  const [open, setOpen] = useState<PrintingId | null>(null);

  const rows = useMemo(() => {
    const all = Object.values(s.printings);
    const by = sort === 'Heat' ? (a: typeof all[0], b: typeof all[0]) => b.market.heat - a.market.heat
      : sort === 'Newest' ? (a: typeof all[0], b: typeof all[0]) => b.releaseTick - a.releaseTick
      : (a: typeof all[0], b: typeof all[0]) => b.market.rawPrice - a.market.rawPrice;
    return [...all].sort(by);
  }, [s, s.tick, sort]);

  // The market-wide index, computed rather than stored. Mean raw price across
  // the catalogue, which is the only honest thing to build from `rawHistory`.
  const index = useMemo(() => {
    const n = rows.length;
    if (n === 0) return 0;
    let sum = 0;
    for (const pr of rows) sum += pr.market.rawPrice;
    return sum / n;
  }, [rows]);

  const top = rows[0];

  return (
    <>
      <StatRow cols={3}>
        <Stat label="Printings" value={compact(rows.length)} />
        <Stat label="Median" value={moneyExact(rows[Math.floor(rows.length / 2)]?.market.rawPrice ?? 0)}
          sub="the body of the market" />
        <Stat label="Top card" value={money(top?.market.rawPrice ?? 0)} tone="note"
          sub={top ? s.cards[top.cardId]?.name ?? '' : ''} />
      </StatRow>
      <div style={{ ...micro, padding: '8px 16px 0', color: C.dim }}>
        MEAN {moneyExact(index)} · COMPUTED FROM HISTORY, NOT STORED
      </div>

      <Tabs tabs={['Price', 'Heat', 'Newest'] as const} value={sort} onChange={setSort} />
      <VirtualList items={rows} rowHeight={52}
        empty="Nothing has been printed yet."
        render={pr => {
          const card = s.cards[pr.cardId];
          const hot = pr.market.heat > 1.4;
          return (
            <button onClick={() => setOpen(pr.id)} style={{
              display: 'grid', width: '100%', height: 52, gridTemplateColumns: '1fr 62px 74px',
              gap: 8, alignItems: 'center', padding: '0 16px', borderTop: `1px solid ${C.rule}`,
              background: C.panel, border: 'none', borderTopStyle: 'solid', color: C.ink,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: MONO, fontSize: 13, fontWeight: 600, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{card?.name || pr.cardId}</div>
                <div style={micro}>
                  {card?.rarity.toUpperCase()} · {yearOf(s, pr.releaseTick)}
                  {pr.isReprintOf ? ' · REPRINT' : ''}
                  {pr.error && pr.error.discoveredTick !== null ? ' · ERROR' : ''}
                </div>
              </div>
              <Sparkline points={pr.market.rawHistory.points} color={hot ? C.note : C.muted} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...num, fontSize: 13, color: hot ? C.note : C.ink }}>
                  {moneyExact(pr.market.rawPrice)}
                </div>
                <div style={micro}>{pr.market.heat > 1.05 ? `HEAT ${pr.market.heat.toFixed(1)}` : ''}</div>
              </div>
            </button>
          );
        }} />

      {open && <PrintingSheet s={s} id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PrintingSheet({ s, id, onClose }: { s: SimState; id: PrintingId; onClose: () => void }) {
  const pr = s.printings[id];
  const [horizon, setHorizon] = useState(52);
  const [reprintInto, setReprintInto] = useState<SetId | ''>('');
  const [qty, setQty] = useState(5000);
  if (!pr) return null;
  const card = s.cards[pr.cardId];
  const set = s.sets[pr.setId];
  const graded = pr.population.graded;
  const gradedTotal = Object.values(graded)
    .reduce((n, byTier) => n + Object.values(byTier).reduce((m, x) => m + (x ?? 0), 0), 0);
  const tradeable = tradeablePopulation(s, pr, gradedTotal);
  const f = forecastPrice(s, id, horizon);
  const inFlight = s.market.gradingQueue.filter(q => q.printingId === id);
  const designSets = Object.values(s.sets)
    .filter(x => x.publisherId === s.playerId && x.status === 'design');

  // Raw, plus one line per grader/tier that actually has a history.
  const series: Series[] = [{ label: 'Raw', points: pr.market.rawHistory.points, color: C.ink }];
  let ci = 0;
  for (const [gid, byTier] of Object.entries(pr.market.gradedHistory)) {
    for (const [tier, hist] of Object.entries(byTier)) {
      if (!hist || hist.points.length < 2) continue;
      series.push({
        label: `${s.graders[gid as never]?.name ?? gid} ${tier}`,
        points: hist.points,
        // Grades are ORDINAL, so they wear the sequential ramp, never the
        // categorical series palette.
        color: SEQ_HEX[Math.min(SEQ_HEX.length - 1, ci++)]!,
      });
    }
  }

  return (
    <Sheet open onClose={onClose} title={card?.name || String(id)}>
      <div style={{ padding: '10px 0 0' }}>
        <div style={{ ...micro, padding: '0 16px 8px' }}>
          {set?.name.toUpperCase()} · {card?.rarity.toUpperCase()} · {yearOf(s, pr.releaseTick)}
          {card && card.treatments.length > 0 ? ` · ${card.treatments.join(' + ').toUpperCase()}` : ''}
        </div>

        <Chart series={series} logY xToLabel={t => String(yearOf(s, t))}
          format={v => moneyExact(v)} />
        {series.length > 1 && (
          <Legend items={series.map(x => ({ label: x.label, color: x.color! }))} />
        )}

        <StatRow cols={3}>
          <Stat label="Raw" value={moneyExact(pr.market.rawPrice)} />
          <Stat label="Heat" value={pr.market.heat.toFixed(2)}
            tone={pr.market.heat > 1.4 ? 'note' : 'ink'} />
          <Stat label="Nostalgia" value={pr.market.nostalgia.toFixed(2)} />
        </StatRow>
        <StatRow cols={3}>
          <Stat label="Liquidity" value={pr.market.liquidity.toFixed(2)}
            sub={pr.market.lastTradeTick ? stamp(s, pr.market.lastTradeTick) : 'never traded'} />
          <Stat label="You'd get" value={moneyExact(realisableCardValue(s, pr))}
            sub={realisableCardValue(s, pr) < pr.market.rawPrice
              ? "after the shop's spread" : 'no spread is modelled yet'} />
          <Stat label="Tradeable" value={compact(tradeable)} sub={`of ${compact(pr.printQuantity)}`} />
        </StatRow>

        {pr.error && (
          <Note tone={pr.error.discoveredTick === null ? 'note' : 'bad'}>
            {pr.error.discoveredTick === null
              ? 'Something is wrong with this print run and nobody has noticed yet.'
              : `A ${pr.error.kind} error, found in ${yearOf(s, pr.error.discoveredTick)}. It affects about ${pct(pr.error.incidence, 3)} of the run — and the rarer the mistake, the better the story.`}
          </Note>
        )}

        <div style={{ ...label, padding: '14px 16px 6px' }}>WHERE THE COPIES ARE</div>
        <div style={{ padding: '0 16px', display: 'flex', gap: 16, flexWrap: 'wrap', ...micro }}>
          <span>SEALED {compact(pr.population.sealed)}</span>
          <span>OPENED {compact(pr.population.opened)}</span>
          <span>SLABBED {compact(gradedTotal)}</span>
          <span>GONE {compact(pr.population.destroyed)}</span>
        </div>
        <div style={{ padding: '6px 16px 0', fontSize: 11, lineHeight: 1.4, color: C.dim }}>
          The tradeable pool is not the print run. Slabbed and collector-held copies have left the
          market, and it is the tradeable number the price engine reads.
        </div>

        {gradedTotal > 0 && (
          <>
            <div style={{ ...label, padding: '14px 16px 6px' }}>THE POP REPORT</div>
            {Object.entries(graded).map(([gid, byTier]) => (
              <div key={gid} style={{ padding: '6px 16px' }}>
                <div style={{ ...micro, color: C.ink3 }}>{(s.graders[gid as never]?.name ?? gid).toUpperCase()}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 3 }}>
                  {TIERS.map(t => byTier[t] ? (
                    <span key={t} style={{ ...num, fontSize: 11.5 }}>
                      <span style={{ color: C.dim }}>{t}</span> {byTier[t]!.toLocaleString()}
                      {pr.market.gradedPrices[gid as never]?.[t]
                        ? <span style={{ color: C.note }}> · {moneyExact(pr.market.gradedPrices[gid as never]![t]!)}</span>
                        : null}
                    </span>
                  ) : null)}
                </div>
              </div>
            ))}
          </>
        )}
        {inFlight.length > 0 && (
          <div style={{ ...micro, padding: '6px 16px', color: C.note }}>
            {inFlight.reduce((n, q) => n + q.quantity, 0).toLocaleString()} COPIES AT THE GRADERS
          </div>
        )}

        <div style={{ ...label, padding: '16px 16px 6px' }}>THE TREND, {horizon} WEEKS OUT</div>
        <div style={{ padding: '0 16px' }}>
          <Slider value={horizon} onChange={setHorizon} min={4} max={260} step={4}
            format={v => `${v}w`} />
          <div style={{ ...num, fontSize: 15, marginTop: 6 }}>
            {f ? `${moneyExact(f.low)} to ${moneyExact(f.high)}` : '—'}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim, marginTop: 5 }}>
            This carries the recent drift forward and blurs it. It cannot see a shock coming, and
            it never will — analytics buys a sharper view of the trend, not of the surprise.
          </div>
        </div>

        {designSets.length > 0 && (
          <>
            <div style={{ ...label, padding: '16px 16px 6px' }}>REPRINT IT</div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <select value={reprintInto} onChange={e => setReprintInto(e.target.value as SetId)} style={selectStyle}>
                <option value="">Into which set…</option>
                {designSets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <Slider value={qty} onChange={setQty} min={500} max={100000} step={500}
                format={v => v.toLocaleString()} />
              <Note tone="bad">
                A reprint adds supply to the CARD, never to this printing — and it cuts what this
                one is worth by about a quarter. The people who bought the first one will notice.
              </Note>
              <Button tone="quiet" disabled={!reprintInto} onClick={() => {
                commit(st => { api.reprint(st, pr.cardId, reprintInto as SetId, qty); });
                onClose();
              }}>Reprint {qty.toLocaleString()} copies</Button>
            </div>
          </>
        )}
        <div style={{ height: 24 }} />
      </div>
    </Sheet>
  );
}
