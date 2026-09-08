/**
 * The set wizard.
 *
 * Five steps, and the sim receives ONE commitment at the end: how much, where
 * and through whom lock together, eighteen weeks before a box exists. See
 * `docs/design/sets-and-distribution.md` §4 — the player experiences a
 * sequence, the sim receives a single irreversible bet.
 */
import React, { useEffect, useState } from 'react';
import type {
  SimState, IpId, IpEntity, Rarity, SetType, ArtistId, ProductKind, PrintQualityTier, RegionId,
} from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import { unlockedRegions } from '../../sim/regions.ts';
import {
  C, MONO, num, label, micro, Screen, Scroll, Header, Button, Field, Stepper, Row, Note, Empty,
  pillBtn, selectStyle,
} from '../ui.tsx';
import { money, moneyExact, oddsText, pct } from '../format.ts';
import { commit, getMeta, saveFormat, setSetEra } from '../store.ts';
import {
  DEFAULT_ROWS, DEFAULT_SLOTS, COMMON_ROW_ID, newRowId, newSlotId,
  slotDraws, derivePulls, tiersForLadder, finishText,
  type Finish, type RarityRow, type PackSlot,
} from '../setdesign.ts';
import { FinishPicker } from './FinishPicker.tsx';

/** The artist every card falls back to while there is no art screen. */
function firstArtist(s: SimState): ArtistId | null {
  for (const a of Object.values(s.artists)) if (a.available) return a.id;
  const any = Object.values(s.artists)[0];
  return any ? any.id : null;
}

/**
 * A card the player made by hand.
 *
 * Keyed by RUNG, not by rarity tier. Two rungs may sit on the same tier now —
 * a studio can print "Warden" and "Sigil Rare" both at rare odds — so a tier no
 * longer identifies a row, and keying on one would merge two rungs into a
 * single bucket and orphan the cards in it.
 */
interface Crafted { ipId: IpId; rowId: string; finishes: Finish[] }

/**
 * Cards of the same character, grouped as a run collectors chase.
 *
 * AJ's own example: three cards, all Aryla, at three rarities. That is pull
 * demand, which is the shape `chainTerm` already models — so a variant group is
 * a third chain kind rather than a new mechanism.
 */
function variantGroups(crafted: Crafted[]): Map<string, number[]> {
  const by = new Map<string, number[]>();
  crafted.forEach((c, i) => {
    const k = String(c.ipId);
    by.set(k, [...(by.get(k) ?? []), i]);
  });
  for (const [k, idx] of by) if (idx.length < 2) by.delete(k);
  return by;
}

/** One SKU of the run: a form, a market, a price and a quantity. */
interface Sku {
  kind: ProductKind; regionId: RegionId; packsPerUnit: number; msrp: number; units: number;
}

const PRODUCT_KINDS: ProductKind[] = [
  'boosterBox', 'pack', 'etb', 'collectionBox', 'tin', 'premiumCollection',
  'bundle', 'blister', 'surpriseBox',
];


export function NewSet({ s, onDone, onBack }: { s: SimState; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  // Which way the next pane should slide in from. Set before the step changes
  // so the incoming pane starts on the correct side.
  const [dir, setDir] = useState(1);
  const go = (next: number) => { setDir(next >= step ? 1 : -1); setStep(next); };
  const [name, setName] = useState('');
  const [type, setType] = useState<SetType>('main');
  const [size, setSize] = useState(180);
  const [eraChoice, setEraChoice] = useState<string>('none'); // 'none' | 'new' | era id
  const [newEra, setNewEra] = useState('');
  const [rows, setRows] = useState<RarityRow[]>(DEFAULT_ROWS);
  const [slots, setSlots] = useState<PackSlot[]>(DEFAULT_SLOTS);
  const [crafted, setCrafted] = useState<Crafted[]>([]);
  const [quality, setQuality] = useState<PrintQualityTier>('standard');
  /**
   * The SKUs this run prints.
   *
   * A `Product` is region-scoped, so "how much, where, and in what form" is one
   * decision, not three. Several SKUs in ONE region split that region's demand;
   * SKUs in different regions do not — which is the whole reason to open a
   * region, and it is invisible unless the player can define more than one.
   */
  const [skus, setSkus] = useState<Sku[]>([
    { kind: 'boosterBox', regionId: s.homeRegionId, packsPerUnit: 24, msrp: 14000, units: 8000 },
  ]);

  const meta = getMeta();
  const pub = s.publishers[s.playerId];
  const cash = pub ? pub.cash : 0;
  // The real cost formula, not a frozen constant: `unitCost[quality]` times the
  // packs in the unit times `cogsCoefficient`. The old screen hardcoded the
  // standard-quality booster box and could not have shown a quality choice.
  const unitCogs = (k: Sku): number =>
    s.config.printing.unitCost[quality] * k.packsPerUnit * s.config.printing.cogsCoefficient;
  const cost = Math.round(skus.reduce((n, k) => n + unitCogs(k) * k.units, 0));
  const short = Math.max(0, cost - cash);
  const ips = Object.values(s.ips).filter(ip => ip.publisherId === s.playerId);
  const artist = firstArtist(s);
  const steps = ['SHAPE', 'RARITY', 'PACK', 'CARDS', 'PRINT'];
  const openRegions = unlockedRegions(s, s.playerId);
  const tiers: PrintQualityTier[] = ['budget', 'standard', 'premium', 'archival'];

  const namedTotal = rows.reduce((n, r) => n + r.count, 0);
  const commons = Math.max(0, size - namedTotal);
  const allRows: RarityRow[] = [
    { id: COMMON_ROW_ID, label: 'Common', count: commons, advertised: true, finishes: [] },
    ...rows,
  ];
  // Odds are no longer a property of a rung. They are what the pack's slots
  // imply, so both of these are derived and neither is editable here.
  const draws = slotDraws(slots);
  const pulls = derivePulls(slots, rows, commons);
  const finished = allRows.filter(r => r.finishes.length > 0).reduce((n, r) => n + r.count, 0);
  const finishShare = size > 0 ? finished / size : 0;

  const craftedAt = (rowId: string) => crafted.filter(c => c.rowId === rowId).length;
  const setRow = (i: number, patch: Partial<RarityRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const doCommit = () => {
    let madeSetId = '';
    commit(st => {
      const setId = api.createSet(st, name.trim() || 'Untitled', type, size);
      madeSetId = setId as string;
      const a = firstArtist(st);
      if (!a) return;
      let subjectAt = 0;
      const nextSubject = (): IpId | null => {
        const list = Object.values(st.ips).filter(ip => ip.publisherId === st.playerId);
        const pick = list[subjectAt % Math.max(1, list.length)];
        subjectAt++;
        return pick ? pick.id : null;
      };
      // The cards the player actually made, at exactly the rarity and finish
      // they chose.
      // A character crafted more than once in one set is a variant run, and the
      // position is its place in the ladder — which is what makes the chain
      // ORDERED rather than a bag of cards.
      const groups = variantGroups(crafted);
      // The pack decides the odds, so a rung's scarcity is derived, and the
      // sim tier is derived from THAT. The tier survives only because
      // `config.rarity.weight` is keyed by it; nothing else reads it once the
      // card carries its own `pullRate`.
      const pullFor = (rowId: string): number => pulls[rowId] ?? 0;
      const ladderTier = tiersForLadder(allRows, pulls);
      const tierFor = (rowId: string): Rarity => ladderTier[rowId] ?? 'common';
      // A variant run is ORDERED, and the order is scarcity: the rarer rung is
      // further up the ladder. Rank by derived pull, not by a table position
      // that no longer exists.
      const ladder = [...allRows].sort((x, y) => pullFor(y.id) - pullFor(x.id));
      const rank = (rowId: string): number =>
        ladder.findIndex(r => r.id === rowId) + 1;
      crafted.forEach((c, i) => {
        const group = groups.get(String(c.ipId));
        const link = group && group.includes(i)
          ? {
              chainId: `chain_var_${madeSetId}_${String(c.ipId)}` as never,
              position: rank(c.rowId),
              kind: 'variant' as const,
            }
          : undefined;
        api.designCard(st, setId, c.ipId, [], tierFor(c.rowId), a, link, undefined,
          c.finishes, pullFor(c.rowId));
      });
      // The rest of the list, filling each rung to the count the player set.
      for (const row of allRows) {
        const remaining = row.count - craftedAt(row.id);
        for (let i = 0; i < remaining; i++) {
          const subj = nextSubject();
          if (!subj) break;
          api.designCard(st, setId, subj, [], tierFor(row.id), a, undefined, undefined,
            row.finishes, pullFor(row.id));
        }
      }
      // One commitment. The player experienced a sequence; the sim receives a
      // single irreversible bet — how much, where and in what form, together.
      const quantities: Record<string, number> = {};
      for (const k of skus) {
        if (k.units <= 0) continue;
        const pid = api.defineProduct(st, setId, k.kind, k.regionId, k.packsPerUnit, k.msrp);
        quantities[pid as string] = k.units;
      }
      api.commitPrintRun(st, setId, quantities as never, quality);
    });
    if (madeSetId) {
      if (eraChoice === 'new' && newEra.trim()) setSetEra(madeSetId, null, newEra.trim());
      else if (eraChoice !== 'none' && eraChoice !== 'new') setSetEra(madeSetId, eraChoice);
    }
    onDone();
  };

  const canNext = step === 0 ? !!name.trim() && size > 0 && !(eraChoice === 'new' && !newEra.trim()) : true;

  return (
    <Screen>
      <Header title={name.trim().toUpperCase() || 'NEW SET'} onBack={step === 0 ? onBack : () => go(step - 1)}
        right={<span style={{ ...micro }}>{step + 1} / {steps.length}</span>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        {steps.map((t, i) => (
          <button key={t} onClick={() => go(i)} style={{
            padding: '9px 6px', textAlign: 'center', ...micro, border: 'none', cursor: 'pointer',
            fontFamily: MONO, background: i === step ? C.raised : C.ground,
            color: i === step ? C.ink : C.dim, fontWeight: i === step ? 600 : 400,
            borderBottom: i === step ? `2px solid ${C.go}` : '2px solid transparent',
            transition: 'color 180ms ease, background 180ms ease',
          }}>{t}</button>
        ))}
      </div>

      <Scroll>
        <Pane step={step} dir={dir}>
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '15px 18px 0' }}>
            <Field label="Set name" value={name} onChange={setName} placeholder="Ashfall" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>TYPE</span>
              <div style={{ display: 'flex', background: C.raised, border: `1px solid ${C.rule}`, borderRadius: 2, overflow: 'hidden' }}>
                {(['main', 'specialty', 'subset', 'promo', 'collab'] as SetType[]).map(t => (
                  <button key={t} onClick={() => {
                    setType(t);
                    if (t !== 'main' && eraChoice === 'new') setEraChoice('none');
                  }} style={{
                    flexGrow: 1, height: 44, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: type === t ? C.ink : 'transparent',
                    color: type === t ? C.onAccent : C.muted,
                    fontSize: 11, fontWeight: type === t ? 600 : 400, textTransform: 'capitalize',
                  }}>{t}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>ERA</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {type === 'main' && (
                  <button onClick={() => setEraChoice('new')} style={{
                    display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', textAlign: 'left',
                    background: C.panel, border: eraChoice === 'new' ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                    borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Open a new era</span>
                    <span style={{ fontSize: 11, lineHeight: 1.35, color: C.muted }}>
                      <span style={{ color: C.note }}>Reaches people who never played.</span>{' '}
                      <span style={{ color: C.bad }}>Costs you the ones who did.</span>
                    </span>
                  </button>
                )}
                {eraChoice === 'new' && (
                  <Field label="Era name" value={newEra} onChange={setNewEra} placeholder="First Light" />
                )}
                {meta.eras.map(e => (
                  <button key={e.id} onClick={() => setEraChoice(e.id)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    padding: '10px 12px', textAlign: 'left', background: C.panel,
                    border: eraChoice === e.id ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                    borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Part of {e.name}</span>
                    <span style={{ ...micro }}>
                      {Object.values(meta.setEra).filter(x => x === e.id).length} SETS
                    </span>
                  </button>
                ))}
                <button onClick={() => setEraChoice('none')} style={{
                  padding: '10px 12px', textAlign: 'left', background: C.panel,
                  border: eraChoice === 'none' ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                  borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                }}>Stands alone</button>
              </div>
              {type !== 'main' && (
                <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim }}>
                  Only a main set can open an era. A {type} set can join one, or stand alone.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>HOW MANY CARDS</span>
              <input inputMode="numeric" value={String(size)}
                onChange={e => setSize(Math.max(0, Math.min(999, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)))}
                style={{
                  height: 50, padding: '0 13px', background: C.panel, color: C.ink,
                  border: `1px solid ${C.ink}`, borderRadius: 2, ...num,
                  fontSize: 20, fontWeight: 600, outline: 'none', width: '100%',
                }} />
              <div style={{ fontSize: 11.5, lineHeight: 1.4, color: C.muted }}>
How many cards exist in the set. It does not change what a pack holds — you build the pack
                yourself, so a bigger set spreads the same slots over more cards and makes each one rarer.
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            {meta.formats.length > 0 && (
              <div style={{ padding: '12px 16px 4px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={label}>IMPORT A FORMAT</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {meta.formats.map(f => (
                    <button key={f.id} onClick={() => {
                      setRows(f.rows.map(r => ({
                        // The stored id is reused, not regenerated: the
                        // format's slots key their odds on it.
                        id: r.rowId ?? newRowId(), label: r.name, count: r.count,
                        advertised: r.advertised, finishes: (r.finishes ?? []) as Finish[],
                      })));
                      if (f.slots) setSlots(f.slots.map(sl => ({ ...sl, odds: { ...sl.odds } })));
                      // Cards were crafted against the rungs being replaced.
                      setCrafted([]);
                    }} style={{
                      padding: '8px 12px', background: C.raised, border: `1px solid ${C.rule}`,
                      borderRadius: 2, color: C.ink, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}>{f.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, marginTop: 10 }}>
              <div style={{ padding: '10px 14px', background: C.panel }}>
                <div style={micro}>RUNGS</div>
                <div style={{ ...num, fontSize: 15, fontWeight: 600 }}>{rows.length + 1}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>Odds live in the pack.</div>
              </div>
              <div style={{ padding: '10px 14px', background: C.panel }}>
                <div style={micro}>FINISHED</div>
                <div style={{ ...num, fontSize: 15, fontWeight: 600, color: finishShare > 0.34 ? C.bad : C.note }}>
                  {Math.round(finishShare * 100)}%
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{finished} of {size}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 7, padding: '9px 16px 5px', ...micro }}>
              <div>RUNG · FINISH</div>
              <div style={{ textAlign: 'right' }}>CARDS</div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 52px', gap: 7, alignItems: 'center',
              padding: '9px 16px', borderTop: `1px solid ${C.rule}`, background: C.raised,
            }}>
              <div>
                <div style={{ fontSize: 12.5 }}>Common</div>
                <div style={{ ...micro, color: C.dim }}>FILLS THE REST</div>
              </div>
              <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{commons}</div>
            </div>

            {rows.map((r, i) => (
              <div key={r.id} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '9px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 7, alignItems: 'center' }}>
                  <input value={r.label} onChange={e => setRow(i, { label: e.target.value })}
                    aria-label={`Name for rung ${i + 1}`} style={{
                      fontSize: 12.5, background: 'none', border: 'none', borderBottom: `1px dashed ${C.rule}`,
                      color: C.ink, fontFamily: 'inherit', padding: '2px 0', width: '100%', outline: 'none',
                    }} />
                  <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{r.count}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => setRow(i, { count: Math.max(0, r.count - 1) })} style={pillBtn}>−</button>
                  <button onClick={() => setRow(i, { count: r.count + 1 })} style={pillBtn}>+</button>
                  <button type="button" onClick={() => setRow(i, { advertised: !r.advertised })} style={{
                    ...pillBtn, width: 'auto', padding: '0 10px',
                    color: r.advertised ? C.muted : C.bad,
                    borderColor: r.advertised ? C.rule : C.bad,
                  }}>{r.advertised ? 'Advertised' : 'Secret'}</button>
                  <span style={{ ...micro, color: r.finishes.length ? C.note : C.dimmer }}>
                    {finishText(r.finishes).toUpperCase()}
                  </span>
                  <button type="button" aria-label={`Remove ${r.label}`} onClick={() => {
                    // Cards crafted at this rung go with it — they have nowhere
                    // left to sit, and a silent orphan is worse than a visible
                    // deletion. The pack's slots lose it too, for the same
                    // reason: a slot that can draw a rung that no longer exists
                    // would quietly eat that share of the odds.
                    setCrafted(crafted.filter(c => c.rowId !== r.id));
                    setSlots(slots.map(sl => {
                      const { [r.id]: _gone, ...rest } = sl.odds;
                      return { ...sl, odds: rest };
                    }));
                    setRows(rows.filter((_, j) => j !== i));
                  }} style={{ ...pillBtn, color: C.bad, marginLeft: 'auto' }}>×</button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <FinishPicker value={r.finishes} onChange={f => setRow(i, { finishes: f })} />
                </div>
              </div>
            ))}

            <div style={{ padding: '12px 16px 0' }}>
              <button type="button" onClick={() => setRows([...rows, {
                id: newRowId(), label: `Rung ${rows.length + 1}`, count: 1,
                advertised: true, finishes: [],
              }])} style={{
                width: '100%', height: 40, background: 'transparent', color: C.ink,
                border: `1px dashed ${C.border}`, borderRadius: 2, fontSize: 12.5,
                fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation',
              }}>+ Add a rung</button>
              <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim, marginTop: 7 }}>
                Name a rung whatever you like. How often it turns up is decided in the pack, not here.
              </div>
            </div>

            <div style={{ padding: '12px 16px 0' }}>
              <Button tone="quiet" onClick={() => {
                const n = prompt('Save this ladder and pack as a format called:');
                if (!n || !n.trim()) return;
                saveFormat({
                  id: `fmt_${Date.now().toString(36)}`, name: n.trim(), packsPerUnit: 24, msrp: 14000,
                  rows: rows.map(r => ({ rowId: r.id, name: r.label, count: r.count, advertised: r.advertised, finishes: r.finishes })),
                  slots: slots.map(sl => ({ id: sl.id, label: sl.label, odds: { ...sl.odds } })),
                });
              }}>Save as a format</Button>
            </div>

            <div style={{ padding: '12px 16px 0', fontSize: 11, lineHeight: 1.42, color: C.muted }}>
              A finish only works while it is rare. Past a third of the set it stops reading as one,
              and the print bill climbs faster than the chase does. A secret rarity is on no rarity
              sheet — the market finds it after release or not at all.
            </div>
          </>
        )}

        {step === 2 && (
          <PackStep s={s} rows={allRows} slots={slots} setSlots={setSlots}
            draws={draws} pulls={pulls} />
        )}

        {step === 3 && (
          <CardsStep s={s} rows={allRows} crafted={crafted} setCrafted={setCrafted} ips={ips} size={size} />
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '15px 18px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>PRINT QUALITY</span>
              <div style={{ display: 'flex', background: C.raised, border: `1px solid ${C.rule}`, borderRadius: 2, overflow: 'hidden' }}>
                {tiers.map(t => {
                  const owned = t === 'budget' || t === 'standard' || pub?.unlocks.printQualityTiers.includes(t);
                  return (
                    <button key={t} disabled={!owned} onClick={() => setQuality(t)} style={{
                      flexGrow: 1, height: 46, border: 'none', cursor: owned ? 'pointer' : 'default',
                      fontFamily: 'inherit', textTransform: 'capitalize', fontSize: 11,
                      background: quality === t ? C.ink : 'transparent',
                      color: quality === t ? C.onAccent : owned ? C.muted : C.dimmer,
                      fontWeight: quality === t ? 600 : 400,
                    }}>{t}</button>
                  );
                })}
              </div>
              <div style={{ ...micro, color: C.dim }}>
                {moneyExact(s.config.printing.unitCost[quality])} A PACK ·{' '}
                {pct(s.config.printing.errorRate[quality], 2)} ERROR RATE ·{' '}
                GRADES {s.config.printing.qualityGradeShift[quality] >= 0 ? '+' : ''}
                {s.config.printing.qualityGradeShift[quality].toFixed(2)}
              </div>
            </div>

            <div style={{ ...label }}>WHAT YOU PRINT, AND WHERE</div>
            {skus.map((k, i) => (
              <div key={i} style={{ border: `1px solid ${C.rule}`, background: C.panel, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...micro }}>SKU {i + 1}</span>
                  {skus.length > 1 && (
                    <button onClick={() => setSkus(skus.filter((_, j) => j !== i))}
                      style={{ ...pillBtn, color: C.bad }}>×</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <select value={k.kind} style={selectStyle}
                    onChange={e => setSkus(skus.map((x, j) => j === i ? { ...x, kind: e.target.value as ProductKind } : x))}>
                    {PRODUCT_KINDS.map(pk => <option key={pk} value={pk}>{pk}</option>)}
                  </select>
                  <select value={k.regionId} style={selectStyle}
                    onChange={e => setSkus(skus.map((x, j) => j === i ? { ...x, regionId: e.target.value as never } : x))}>
                    {openRegions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div style={{ ...micro }}>PACKS IN THE UNIT</div>
                  <Stepper value={k.packsPerUnit} min={1} max={60}
                    onChange={v => setSkus(skus.map((x, j) => j === i ? { ...x, packsPerUnit: v } : x))} />
                  <div style={{ ...micro }}>STICKER PRICE, IN CENTS</div>
                  <Stepper value={k.msrp} step={500} min={500} max={100000}
                    onChange={v => setSkus(skus.map((x, j) => j === i ? { ...x, msrp: v } : x))} />
                  <div style={{ ...micro }}>HOW MANY</div>
                  <Stepper value={k.units} step={500} min={0} max={200000}
                    onChange={v => setSkus(skus.map((x, j) => j === i ? { ...x, units: v } : x))} />
                </div>
                <div style={{ ...micro, color: C.dim, marginTop: 8 }}>
                  {moneyExact(unitCogs(k))} A UNIT · {money(Math.round(unitCogs(k) * k.units))} TOTAL
                </div>
              </div>
            ))}
            {openRegions.length > 0 && (
              <Button tone="quiet" onClick={() => setSkus([...skus, {
                kind: 'boosterBox', regionId: openRegions[0]!.id, packsPerUnit: 24, msrp: 14000, units: 2000,
              }])}>Add another SKU</Button>
            )}

            <div style={{ border: `1px solid ${C.rule}`, background: C.panel }}>
              <Row left={`${skus.reduce((n, k) => n + k.units, 0).toLocaleString()} units`} right={money(cost)} strong />
              <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
              <Row left="Cash on hand" right={money(cash)} />
              {short > 0 && <>
                <div style={{ height: 1, background: C.ink, margin: '0 12px' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bad }}>You must borrow</span>
                  <span style={{ ...num, fontSize: 17, fontWeight: 600, color: C.bad }}>{money(short)}</span>
                </div>
              </>}
            </div>
            <Note tone="bad">
              The run cannot move once committed, and where it ships locks with it — eighteen weeks
              before a single box exists, and long before anyone tells you whether this is any good.
              You choose the channels under World · Channels; stock you never place cannot sell.
            </Note>
          </div>
        )}

        </Pane>
        <div style={{ padding: '18px 18px 34px' }}>
          {step < 4
            ? <Button onClick={() => go(step + 1)} disabled={!canNext}>
                {['Rarities', 'The pack', 'Cards', 'Print run'][step]}
              </Button>
            : <Button onClick={doCommit} disabled={ips.length === 0 || !artist}>
                {short > 0 ? `Borrow ${money(short)} and print` : 'Commit the print run'}
              </Button>}
        </div>
      </Scroll>
    </Screen>
  );
}

/** Slides a step in from the side it came from. CSS only, no library. */
function Pane({ step, dir, children }: { step: number; dir: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(false); const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, [step]);
  return (
    <div style={{
      transform: shown ? 'translateX(0)' : `translateX(${dir * 26}px)`,
      opacity: shown ? 1 : 0,
      transition: 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 180ms ease',
      willChange: 'transform, opacity',
    }}>{children}</div>
  );
}


/**
 * Build the pack, slot by slot.
 *
 * The studio declares what each slot can draw and how often. Everything the
 * old screen asked the player to accept — pull odds, pack size, the way set
 * size changes rarity — is a CONSEQUENCE here, shown live and never typed.
 *
 * Weights are relative and normalised per slot, so 65/25/10 and 13/5/2 are the
 * same slot. That is deliberate: it lets a studio think in percentages without
 * the screen refusing to render until they sum to a hundred.
 */
function PackStep({ s, rows, slots, setSlots, draws, pulls }: {
  s: SimState; rows: RarityRow[]; slots: PackSlot[];
  setSlots: (v: PackSlot[]) => void;
  draws: Record<string, number>; pulls: Record<string, number>;
}) {
  const labelOf = (id: string) => rows.find(r => r.id === id)?.label ?? '—';
  const setSlot = (i: number, patch: Partial<PackSlot>) =>
    setSlots(slots.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ padding: '10px 14px', background: C.panel }}>
          <div style={micro}>CARDS PER PACK</div>
          <div style={{ ...num, fontSize: 17, fontWeight: 600 }}>{slots.length}</div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>One slot, one card.</div>
        </div>
        <div style={{ padding: '10px 14px', background: C.panel }}>
          <div style={micro}>RUNGS REACHED</div>
          <div style={{ ...num, fontSize: 17, fontWeight: 600, color: Object.keys(draws).length < rows.length ? C.bad : C.note }}>
            {Object.keys(draws).length} / {rows.length}
          </div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
            {Object.keys(draws).length < rows.length ? 'A rung no slot draws is unpullable.' : 'Every rung is reachable.'}
          </div>
        </div>
      </div>

      {slots.map((sl, i) => {
        const total = Object.values(sl.odds).reduce((n, w) => n + Math.max(0, w), 0);
        return (
          <div key={sl.id} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...micro, color: C.dim, minWidth: 28 }}>{String(i + 1).padStart(2, '0')}</span>
              <input value={sl.label} onChange={e => setSlot(i, { label: e.target.value })}
                aria-label={`Name for slot ${i + 1}`} style={{
                  flex: 1, fontSize: 12.5, background: 'none', border: 'none',
                  borderBottom: `1px dashed ${C.rule}`, color: C.ink,
                  fontFamily: 'inherit', padding: '2px 0', outline: 'none',
                }} />
              <button type="button" aria-label={`Remove slot ${i + 1}`}
                onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                style={{ ...pillBtn, color: C.bad }}>×</button>
            </div>

            {rows.map(r => {
              const w = sl.odds[r.id] ?? 0;
              const share = total > 0 ? w / total : 0;
              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 62px 52px', gap: 8,
                  alignItems: 'center', marginTop: 6,
                }}>
                  <div style={{ fontSize: 12, color: w > 0 ? C.ink : C.dimmer, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </div>
                  <input inputMode="decimal" value={w === 0 ? '' : String(w)} placeholder="0"
                    aria-label={`${r.label} weight in slot ${i + 1}`}
                    onChange={e => {
                      const v = Math.max(0, parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0);
                      const next = { ...sl.odds };
                      if (v <= 0) delete next[r.id]; else next[r.id] = v;
                      setSlot(i, { odds: next });
                    }}
                    style={{
                      height: 30, padding: '0 7px', background: C.ground, color: C.ink,
                      border: `1px solid ${w > 0 ? C.border : C.rule}`, borderRadius: 2,
                      ...num, fontSize: 12.5, outline: 'none', width: '100%', textAlign: 'right',
                    }} />
                  <div style={{ ...num, fontSize: 11, color: C.muted, textAlign: 'right' }}>
                    {share > 0 ? pct(share) : '—'}
                  </div>
                </div>
              );
            })}
            {total <= 0 && (
              <div style={{ ...micro, color: C.bad, marginTop: 7 }}>THIS SLOT DRAWS NOTHING</div>
            )}
          </div>
        );
      })}

      <div style={{ padding: '12px 16px 0' }}>
        <button type="button" onClick={() => setSlots([...slots, {
          id: newSlotId(), label: `Slot ${slots.length + 1}`, odds: { [COMMON_ROW_ID]: 100 },
        }])} style={{
          width: '100%', height: 40, background: 'transparent', color: C.ink,
          border: `1px dashed ${C.border}`, borderRadius: 2, fontSize: 12.5,
          fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation',
        }}>+ Add a slot</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 66px 74px', gap: 7, padding: '18px 16px 5px', ...micro }}>
        <div>WHAT A PACK HOLDS</div>
        <div style={{ textAlign: 'right' }}>PER PACK</div>
        <div style={{ textAlign: 'right' }}>ONE CARD</div>
      </div>
      {rows.map(r => (
        <div key={r.id} style={{
          display: 'grid', gridTemplateColumns: '1fr 66px 74px', gap: 7, alignItems: 'center',
          padding: '8px 16px', borderTop: `1px solid ${C.rule}`, background: C.ground,
        }}>
          <div style={{ fontSize: 12, color: draws[r.id] ? C.ink : C.dimmer }}>{r.label}</div>
          <div style={{ ...num, fontSize: 11.5, textAlign: 'right', color: C.muted }}>
            {draws[r.id] ? draws[r.id]!.toFixed(2) : '—'}
          </div>
          <div style={{ ...num, fontSize: 11.5, textAlign: 'right', color: pulls[r.id] ? C.note : C.dimmer }}>
            {pulls[r.id] ? oddsText(pulls[r.id]!) : '—'}
          </div>
        </div>
      ))}
      <div style={{ padding: '12px 16px 0', fontSize: 11, lineHeight: 1.42, color: C.muted }}>
        PER PACK is how many cards of that rung a pack holds on average. ONE CARD is the odds of
        pulling a NAMED card from it — the rung's draws split across every card in it, which is why
        a bigger rung makes each of its cards rarer. You set the pack; the odds follow.
      </div>
    </>
  );
}

/** Craft individual cards: pick a character, a rarity, and a finish. */
function CardsStep({ s, rows, crafted, setCrafted, ips, size }: {
  s: SimState; rows: RarityRow[]; crafted: Crafted[];
  setCrafted: (c: Crafted[]) => void; ips: IpEntity[]; size: number;
}) {
  const [pickIp, setPickIp] = useState<string>(ips[0] ? String(ips[0]!.id) : '');
  const [pickRow, setPickRow] = useState<string>(rows[1] ? rows[1]!.id : COMMON_ROW_ID);
  const [pickFinish, setPickFinish] = useState<Finish[]>(['holo']);
  const nameOf = (id: string) => Object.values(s.ips).find(i => String(i.id) === id)?.name ?? id;
  const roomAt = (rowId: string) =>
    (rows.find(x => x.id === rowId)?.count ?? 0) - crafted.filter(c => c.rowId === rowId).length;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ padding: '9px 16px', background: C.ground }}>
          <div style={micro}>YOU MADE</div>
          <div style={{ ...num, fontSize: 17, fontWeight: 600 }}>{crafted.length}</div>
        </div>
        <div style={{ padding: '9px 16px', background: C.ground }}>
          <div style={micro}>THE STUDIO FILLS</div>
          <div style={{ ...num, fontSize: 17, fontWeight: 600, color: C.dim }}>{Math.max(0, size - crafted.length)}</div>
        </div>
      </div>

      {crafted.length === 0 && <Empty>No cards of your own yet. The studio will fill every slot with house work.</Empty>}

      {crafted.map((c, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr auto 34px', gap: 8, alignItems: 'center',
          padding: '9px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{nameOf(String(c.ipId))}</div>
            <div style={{ ...micro, letterSpacing: '0.07em' }}>{finishText(c.finishes).toUpperCase()}</div>
          </div>
          <div style={{ fontSize: 11.5, color: C.ink3 }}>
            {rows.find(r => r.id === c.rowId)?.label ?? '\u2014'}
          </div>
          <button onClick={() => setCrafted(crafted.filter((_, j) => j !== i))} style={{
            ...pillBtn, width: 30, height: 30, color: C.bad, borderColor: C.rule,
          }}>×</button>
        </div>
      ))}

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>ADD A CARD</span>
        <select value={pickIp} onChange={e => setPickIp(e.target.value)} style={selectStyle}>
          {ips.map(ip => <option key={String(ip.id)} value={String(ip.id)}>{ip.name}</option>)}
        </select>
        <select value={pickRow} onChange={e => {
          const id = e.target.value;
          setPickRow(id);
          // Start from what that rung already prints; the card can then differ.
          setPickFinish(rows.find(x => x.id === id)?.finishes ?? []);
        }} style={selectStyle}>
          {rows.map(r => (
            <option key={r.id} value={r.id} disabled={roomAt(r.id) <= 0}>
              {r.label} ({roomAt(r.id)} left)
            </option>
          ))}
        </select>
        <FinishPicker value={pickFinish} onChange={setPickFinish} />
        <Button tone="quiet" disabled={!pickIp || roomAt(pickRow) <= 0} onClick={() =>
          setCrafted([...crafted, { ipId: pickIp as IpId, rowId: pickRow, finishes: pickFinish }])}>
          Add card
        </Button>
        <div style={{ fontSize: 11, lineHeight: 1.42, color: C.muted }}>
          Make the same character more than once. Four Arylas at four rarities is a variant run, and
          collectors chase the complete set of them.
        </div>
        {[...variantGroups(crafted).entries()].map(([ipId, idx]) => (
          <div key={ipId} style={{ ...micro, color: C.note }}>
            VARIANT RUN · {nameOf(ipId).toUpperCase()} · {idx.length} CARDS
          </div>
        ))}
      </div>
    </>
  );
}
