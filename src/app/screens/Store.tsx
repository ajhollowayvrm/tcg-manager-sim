/**
 * The direct store, and the drops you run through it.
 *
 * A drop is a discrete event, not a shelf: a fixed quantity goes up at MSRP on
 * a scheduled tick, a queue forms, and it is served in one pass.
 *
 * The queue holds two populations with opposite effects. Collectors are who the
 * drop is FOR, and reaching them pays goodwill. Scalpers camp it, take a share
 * of the queue larger than their numbers alone would win, and cost goodwill for
 * everyone they shut out. Shortage costs goodwill too, so a drop far too small
 * is not a free win. That trade is the whole system: the direct store is full
 * margin, and goodwill is what you pay for it.
 *
 * **`AudienceState.hidden` is the scalpers' books and must never be rendered.**
 * The player sees drop chaos, resale prices and their own goodwill — never the
 * inventory, the basis or the profitability behind it. What this screen shows
 * about scalpers comes from `DropResult`, which is what the studio could
 * actually observe: how many turned up and how fast it went.
 */
import { useState } from 'react';
import type { SimState, ProductId, ChannelId } from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import {
  C, MONO, num, label, micro, Button, Note, Empty, Sheet, Slider, Stat, StatRow, Row,
} from '../ui.tsx';
import { money, stamp, untilText, pct } from '../format.ts';
import { commit, getMeta } from '../store.ts';
import { productLineName } from '../setdesign.ts';

export function Store({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  const [planning, setPlanning] = useState<ProductId | null>(null);
  const [units, setUnits] = useState(1000);
  const [inWeeks, setInWeeks] = useState(4);
  if (!pub) return null;

  const direct = Object.values(s.channels).find(
    ch => ch.kind === 'direct' && ch.unlocked && pub.unlocks.channels.includes(ch.id));

  if (!direct) {
    return (
      <>
        <Empty>
          You do not have a store yet. The direct store is the one shelf you build rather than
          persuade, and it is the only one that keeps the whole margin.
        </Empty>
        <div style={{ padding: '0 18px', fontSize: 11.5, lineHeight: 1.45, color: C.dim }}>
          Open it under Studio · Growth. It asks for the highest brand standing of any channel,
          because nobody queues for a studio they have not heard of.
        </div>
      </>
    );
  }

  // Only stock that has actually been allocated to the store can be dropped.
  const droppable = Object.values(s.products).filter(p => {
    const a = p.allocations[direct.id];
    return a !== undefined && a.unitsRemaining > 0;
  });
  const pending = Object.values(s.drops).filter(d => d.status === 'scheduled');
  const done = Object.values(s.drops)
    .filter(d => d.status === 'complete' && d.result)
    .sort((a, b) => b.scheduledTick - a.scheduledTick).slice(0, 12);

  const product = planning ? s.products[planning] : null;
  const room = product ? product.allocations[direct.id]?.unitsRemaining ?? 0 : 0;

  return (
    <>
      <StatRow cols={3}>
        <Stat label="Queue capacity" value={direct.queueCapacity?.toLocaleString() ?? '—'}
          sub="what the store can serve" />
        <Stat label="Scheduled" value={pending.length} />
        <Stat label="Bond" value={direct.relationship.toFixed(2)} tone="go" />
      </StatRow>

      {pending.length > 0 && <>
        <div style={{ ...label, padding: '13px 16px 4px' }}>COMING UP</div>
        {pending.map(d => {
          const p = s.products[d.productId];
          const set = p ? s.sets[p.setId] : null;
          return (
            <div key={d.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              padding: '10px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
            }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 600 }}>{set?.name ?? d.productId}</div>
                <div style={micro}>
                  {d.offered.toLocaleString()} UNITS · IN {untilText(s.tick, d.scheduledTick)}
                  {d.automatic ? ' · AUTOMATIC' : ''}
                </div>
              </div>
              <span style={{ ...micro, color: C.note }}>{stamp(s, d.scheduledTick)}</span>
            </div>
          );
        })}
      </>}

      <div style={{ ...label, padding: '16px 16px 4px' }}>STOCK YOU COULD DROP</div>
      {droppable.length === 0 && <Empty>Nothing allocated to the store. Send it stock from World · Channels first.</Empty>}
      {droppable.map(p => {
        const set = s.sets[p.setId];
        const a = p.allocations[direct.id]!;
        return (
          <button className="pressable" key={p.id} onClick={() => { setUnits(Math.min(1000, a.unitsRemaining)); setInWeeks(4); setPlanning(p.id); }}
            style={{
              display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
              gap: 10, padding: '11px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
              border: 'none', borderTopStyle: 'solid', color: C.ink, cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'left',
            }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{set?.name}</div>
              <div style={micro}>{productLineName(getMeta().productLines, p.kind).toUpperCase()} · MSRP {money(p.msrp)} · APPEAL {p.scalperAppeal.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...num, fontSize: 13 }}>{a.unitsRemaining.toLocaleString()}</div>
              <div style={micro}>IN STORE</div>
            </div>
          </button>
        );
      })}

      {done.length > 0 && <>
        <div style={{ ...label, padding: '18px 16px 4px' }}>WHAT HAPPENED LAST TIME</div>
        {done.map(d => {
          const r = d.result!;
          const p = s.products[d.productId];
          const set = p ? s.sets[p.setId] : null;
          const scalperShare = r.soldToCollectors + r.soldToScalpers > 0
            ? r.soldToScalpers / (r.soldToCollectors + r.soldToScalpers) : 0;
          return (
            <div key={d.id} style={{ padding: '10px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 600 }}>{set?.name ?? d.productId}</span>
                <span style={{ ...micro, color: r.soldOut ? C.note : C.dim }}>
                  {r.soldOut ? 'SOLD OUT' : 'UNDERSOLD'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 13, marginTop: 4, flexWrap: 'wrap', ...micro }}>
                <span>OFFERED {r.offered.toLocaleString()}</span>
                <span style={{ color: r.demand > r.offered ? C.bad : C.dim }}>
                  WANTED {Math.round(r.demand).toLocaleString()}
                </span>
                <span style={{ color: scalperShare > 0.5 ? C.bad : C.go }}>
                  SCALPERS TOOK {pct(scalperShare)}
                </span>
              </div>
            </div>
          );
        })}
      </>}
      <div style={{ padding: '13px 16px 24px', fontSize: 11, lineHeight: 1.45, color: C.dim }}>
        Scalpers only turn up when the sealed price stands far enough above MSRP to be worth
        flipping. They resell into that premium, which closes it, and how well they did decides
        how many come back next time.
      </div>

      <Sheet open={product !== null} onClose={() => setPlanning(null)} title="Schedule a drop">
        {product && (
          <div style={{ padding: '13px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={label}>HOW MANY</div>
            <Slider value={units} onChange={setUnits} min={100} max={room} step={100}
              format={v => v.toLocaleString()} />
            <div style={label}>IN</div>
            <Slider value={inWeeks} onChange={setInWeeks} min={1} max={52} format={v => `${v} weeks`} />
            <div style={{ border: `1px solid ${C.rule}`, background: C.raised }}>
              <Row left="At MSRP, if it all goes" right={money(units * product.msrp)} strong />
              <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
              <Row left="Your store keeps" right="100%" />
              <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
              <Row left="The queue can serve" right={(direct.queueCapacity ?? 0).toLocaleString()} />
            </div>
            <Note>
              Too small and the shortage costs you goodwill. Too large and it undersells, which
              costs you the story. The scalpers will take a share larger than their numbers —
              they are faster, not richer.
            </Note>
            <Button disabled={units <= 0} onClick={() => {
              commit(st => {
                api.scheduleDrop(st, product.id, direct.id as ChannelId,
                  (st.tick + inWeeks) as never, units);
              });
              setPlanning(null);
            }}>Put {units.toLocaleString()} up in {inWeeks} weeks</Button>
            <div style={{ height: 14 }} />
          </div>
        )}
      </Sheet>
    </>
  );
}
