/**
 * The world: the markets you can sell into, and the shelves you sell through.
 *
 * Two rules bind this file hard.
 *
 * **Never `Region.truth`.** A region's taste, its appetite per rarity and its
 * price tolerance are ground truth. The screen shows `readRegion`, which is the
 * same numbers wearing an error inversely proportional to `knowledge`, and the
 * error is derived from a stored seed rather than drawn — so opening this
 * screen twice gives the same answer and does not move the run. `readRegion`
 * used to draw three Gaussians per call, and a UI repainting this screen would
 * have advanced the game by looking at it.
 *
 * **Show `effectiveCapacity`, never `capacityUnits`.** The raw field ignores
 * souring, so a board built on it promises shelf space the channel will not
 * give.
 */
import { useState } from 'react';
import type { SimState, RegionId, ProductId, ChannelId, IpKind, Rarity } from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import { readRegion, unlockedRegions } from '../../sim/regions.ts';
import { effectiveCapacity, allocatedUnits, unlockedChannels } from '../../sim/channels.ts';
import {
  C, MONO, num, label, micro, Button, Note, Gate, Empty, Sheet, Slider, Stat, StatRow,
  AllocationBar, Legend, seriesColor,
} from '../ui.tsx';
import { money, stamp, pct } from '../format.ts';
import { commit, getMeta } from '../store.ts';
import { productLineName } from '../setdesign.ts';

const KINDS: IpKind[] = ['character', 'location', 'faction', 'concept', 'event'];
const APPETITE: Rarity[] = ['common', 'rare', 'ultraRare', 'hyperRare'];

/** A taste reading in words. A number here would overstate what knowledge bought. */
function tasteWord(v: number): string {
  return v > 0.18 ? 'loves' : v > 0.06 ? 'likes' : v < -0.18 ? 'cold on' : v < -0.06 ? 'cool on' : 'neutral on';
}

export function Regions({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  if (!pub) return null;
  const open = new Set(unlockedRegions(s, s.playerId).map(r => r.id));
  const regions = Object.values(s.regions)
    .sort((a, b) => Number(b.id === s.homeRegionId) - Number(a.id === s.homeRegionId) || a.unlockCost - b.unlockCost);

  return (
    <>
      <Note>
        A region opened today sells nothing for {s.config.region.entryLeadWeeks} weeks. Several
        SKUs in one region split that region's demand; SKUs in different regions do not — that
        asymmetry is the whole reason to open one.
      </Note>
      {regions.map(r => {
        const isOpen = open.has(r.id);
        const reading = isOpen ? readRegion(s, r.id) : null;
        const canBuy = !isOpen && pub.cash >= r.unlockCost;
        return (
          <div key={r.id} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600 }}>{r.name}</span>
              <span style={{ ...micro, color: isOpen ? C.go : C.dim }}>
                {r.id === s.homeRegionId ? 'HOME' : isOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, ...micro }}>
              <span>MARKET {r.marketSize.toFixed(2)}x</span>
              <span>WEALTH {r.wealth.toFixed(2)}</span>
              {isOpen && <span>KNOWN {pct(r.knowledge)}</span>}
            </div>

            {isOpen && reading && (
              <div style={{ marginTop: 9, border: `1px solid ${C.rule}`, background: C.raised, padding: '9px 11px' }}>
                <div style={{ ...micro, marginBottom: 5 }}>WHAT YOU THINK YOU KNOW</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: C.ink2 }}>
                  {KINDS.map(k => `${tasteWord(reading.tasteBias[k])} ${k}s`).join(', ')}.
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', ...micro }}>
                  {APPETITE.map(k => (
                    <span key={k}>{k.toUpperCase()} {reading.rarityAppetite[k].toFixed(2)}</span>
                  ))}
                  <span>PRICE {reading.priceTolerance.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: r.knowledge > 0.6 ? C.muted : C.note, marginTop: 6 }}>
                  {r.knowledge > 0.6
                    ? 'You have shipped here enough to trust this.'
                    : 'A thin read. Research and releases sharpen it; nothing else does.'}
                </div>
              </div>
            )}

            {!isOpen && <>
              <div style={{ marginTop: 9, border: `1px solid ${C.rule}`, background: C.raised }}>
                <Gate label="Cash" met={pub.cash >= r.unlockCost}
                  have={money(pub.cash)} need={money(r.unlockCost)} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Button tone="quiet" disabled={!canBuy}
                  onClick={() => commit(st => { api.unlockRegion(st, r.id); })}>
                  {canBuy ? `Open for ${money(r.unlockCost)}` : 'Cannot afford'}
                </Button>
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim, marginTop: 7 }}>
                You will know almost nothing about this market on the day you enter it. Its taste
                is rolled per world — the constants above are the same in every run, the specifics
                never are.
              </div>
            </>}
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </>
  );
}

export function Channels({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  const [distributing, setDistributing] = useState<ProductId | null>(null);
  const [split, setSplit] = useState<Record<string, number>>({});
  if (!pub) return null;

  const channels = unlockedChannels(s, s.playerId);
  // Only a set that has not shipped can still be allocated: after release the
  // bet is placed. `allocate` enforces this; the screen must not offer it.
  const pending = Object.values(s.products).filter(p => {
    const set = s.sets[p.setId];
    return set && set.publisherId === s.playerId
      && set.status !== 'released' && set.status !== 'archived'
      && p.unitsPrinted - allocatedUnits(p) > 0;
  });

  const product = distributing ? s.products[distributing] : null;
  const forProduct = product ? channels.filter(ch => ch.regionId === product.regionId) : [];
  const unplaced = product ? product.unitsPrinted - allocatedUnits(product) : 0;
  const assigned = Object.values(split).reduce((n, x) => n + x, 0);

  const openSheet = (pid: ProductId) => { setSplit({}); setDistributing(pid); };

  return (
    <>
      {pending.length > 0 && (
        <>
          <div style={{ ...label, padding: '13px 16px 4px' }}>STOCK WITH NOWHERE TO GO</div>
          {pending.map(p => {
            const set = s.sets[p.setId]!;
            const left = p.unitsPrinted - allocatedUnits(p);
            return (
              <button key={p.id} onClick={() => openSheet(p.id)} style={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '11px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
                border: 'none', borderTopStyle: 'solid', color: C.ink, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
              }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{set.name}</div>
                  <div style={micro}>{productLineName(getMeta().productLines, p.kind).toUpperCase()} · {s.regions[p.regionId]?.name.toUpperCase()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...num, fontSize: 14, color: C.note }}>{left.toLocaleString()}</div>
                  <div style={micro}>UNPLACED</div>
                </div>
              </button>
            );
          })}
        </>
      )}

      <div style={{ ...label, padding: '16px 16px 4px' }}>THE BOARD</div>
      {channels.length === 0 && <Empty>No channels open. Buy one under Studio · Growth.</Empty>}
      {channels.map(ch => {
        const cap = effectiveCapacity(s, ch);
        const idle = ch.lastAllocatedTick === null ? null : s.tick - ch.lastAllocatedTick;
        const cold = idle !== null && idle > s.config.channels.idleGraceWeeks;
        return (
          <div key={ch.id} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '11px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{ch.name}</span>
              <span style={{ ...num, fontSize: 12, color: ch.relationship > 0.45 ? C.go : C.bad }}>
                {ch.relationship.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 13, marginTop: 4, flexWrap: 'wrap', ...micro }}>
              <span>TAKES {cap.toLocaleString()}</span>
              <span>MARGIN {Math.round(ch.marginShare * 100)}%</span>
              <span>MIN {ch.minimumOrder.toLocaleString()}</span>
              <span style={{ color: cold ? C.bad : C.dim }}>
                {ch.lastAllocatedTick === null ? 'NEVER SHIPPED' : `LAST ${stamp(s, ch.lastAllocatedTick)}`}
              </span>
            </div>
            {cold && (
              <div style={{ fontSize: 11, color: C.bad, marginTop: 5 }}>
                You have not given them anything to sell in {Math.round(idle! / 52)} years. That is
                how a channel is lost — by neglect, not by a decision.
              </div>
            )}
          </div>
        );
      })}
      <div style={{ padding: '12px 16px 0', fontSize: 11, lineHeight: 1.45, color: C.dim }}>
        What a channel takes is not what it lists: a soured relationship costs capacity, which is
        how a studio collapses back to LGS-only volume. The LGS and the direct store can sour but
        can never be lost.
      </div>
      <div style={{ height: 20 }} />

      <Sheet open={product !== null} onClose={() => setDistributing(null)}
        title={product ? `Place ${unplaced.toLocaleString()} units` : ''}>
        {product && (
          <div style={{ padding: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AllocationBar total={Math.max(unplaced, assigned)}
              segments={forProduct.map((ch, i) => ({
                label: ch.name, units: split[ch.id] ?? 0, color: seriesColor(i),
              }))} />
            <Legend items={forProduct.map((ch, i) => ({
              label: ch.name, color: seriesColor(i), value: (split[ch.id] ?? 0).toLocaleString(),
            }))} />
            {forProduct.length === 0 && (
              <Empty>No channel open in {s.regions[product.regionId]?.name}. Stock you cannot place cannot sell.</Empty>
            )}
            {forProduct.map(ch => {
              const existing = product.allocations[ch.id];
              const headroom = Math.max(0, effectiveCapacity(s, ch) - (existing ? existing.units : 0));
              const ceiling = Math.min(headroom, unplaced);
              const v = split[ch.id] ?? 0;
              const tooSmall = v > 0 && v < ch.minimumOrder;
              return (
                <div key={ch.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...micro }}>
                    <span>{ch.name.toUpperCase()}</span>
                    <span style={{ color: tooSmall ? C.bad : C.dim }}>
                      {tooSmall ? `UNDER THEIR MINIMUM OF ${ch.minimumOrder.toLocaleString()}` : `ROOM FOR ${ceiling.toLocaleString()}`}
                    </span>
                  </div>
                  <Slider value={Math.min(v, ceiling)} min={0} max={ceiling}
                    step={Math.max(1, Math.round(ceiling / 40))}
                    onChange={x => setSplit({ ...split, [ch.id]: x })} />
                </div>
              );
            })}
            <Note tone={assigned > unplaced ? 'bad' : 'note'}>
              {assigned > unplaced
                ? 'More than you printed. The engine fills channels in order and drops the rest.'
                : 'Anything you do not place stays in the warehouse, and unallocated stock cannot sell. That is the honest cost of printing past your reach.'}
            </Note>
            <Button disabled={assigned <= 0} onClick={() => {
              commit(st => {
                const alloc: Record<ChannelId, number> = {};
                for (const [cid, units] of Object.entries(split)) {
                  if (units > 0) alloc[cid as ChannelId] = units;
                }
                api.allocate(st, product.id, alloc);
              });
              setDistributing(null);
            }}>Ship {assigned.toLocaleString()} units</Button>
            <div style={{ height: 10 }} />
          </div>
        )}
      </Sheet>
    </>
  );
}
