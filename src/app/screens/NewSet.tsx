/**
 * The set wizard.
 *
 * Four steps, and the sim receives ONE commitment at the end: how much, where
 * and through whom lock together, eighteen weeks before a box exists. See
 * `docs/design/sets-and-distribution.md` §4 — the player experiences a
 * sequence, the sim receives a single irreversible bet.
 */
import React, { useEffect, useState } from 'react';
import type { SimState, IpId, IpEntity, Rarity, SetType, ArtistId } from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import { REGION_US } from '../../sim/world.ts';
import {
  C, MONO, num, label, micro, Screen, Scroll, Header, Button, Field, Stepper, Row, Note, Empty,
  pillBtn, selectStyle,
} from '../ui.tsx';
import { money, oddsText } from '../format.ts';
import { commit, getMeta, saveFormat, setSetEra } from '../store.ts';
import {
  UNIT_COST_PER_BOX, ALL_RARITIES, DEFAULT_ROWS, perCardPull, finishText,
  type Finish, type RarityRow,
} from '../setdesign.ts';
import { FinishPicker } from './FinishPicker.tsx';

/** The artist every card falls back to while there is no art screen. */
function firstArtist(s: SimState): ArtistId | null {
  for (const a of Object.values(s.artists)) if (a.available) return a.id;
  const any = Object.values(s.artists)[0];
  return any ? any.id : null;
}

interface Crafted { ipId: IpId; rarity: Rarity; finishes: Finish[] }


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
  const [crafted, setCrafted] = useState<Crafted[]>([]);
  const [units, setUnits] = useState(8000);
  const msrp = 14000;

  const meta = getMeta();
  const pub = s.publishers[s.playerId];
  const cash = pub ? pub.cash : 0;
  const cost = Math.round(units * UNIT_COST_PER_BOX);
  const short = Math.max(0, cost - cash);
  const ips = Object.values(s.ips).filter(ip => ip.publisherId === s.playerId);
  const artist = firstArtist(s);
  const steps = ['SHAPE', 'RARITY', 'CARDS', 'PRINT'];

  const namedTotal = rows.reduce((n, r) => n + r.count, 0);
  const commons = Math.max(0, size - namedTotal);
  const allRows: RarityRow[] = [
    { rarity: 'common', label: 'Common', count: commons, advertised: true, finishes: [] },
    ...rows,
  ];
  const slots = allRows.reduce((n, r) => n + perCardPull(s, r.rarity, size) * r.count, 0);
  const finished = allRows.filter(r => r.finishes.length > 0).reduce((n, r) => n + r.count, 0);
  const finishShare = size > 0 ? finished / size : 0;

  const craftedAt = (r: Rarity) => crafted.filter(c => c.rarity === r).length;
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
      for (const c of crafted) {
        api.designCard(st, setId, c.ipId, [], c.rarity, a, undefined, undefined, c.finishes);
      }
      // The rest of the list, filling each rarity to the count the player set.
      for (const row of allRows) {
        const remaining = row.count - craftedAt(row.rarity);
        for (let i = 0; i < remaining; i++) {
          const subj = nextSubject();
          if (!subj) break;
          api.designCard(st, setId, subj, [], row.rarity, a, undefined, undefined, row.finishes);
        }
      }
      const pid = api.defineProduct(st, setId, 'boosterBox', REGION_US, 24, msrp);
      api.commitPrintRun(st, setId, { [pid]: units }, 'standard');
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
        right={<span style={{ ...micro }}>{step + 1} / 4</span>} />
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
                A pack still holds the same cardboard. A bigger set makes every card rarer — it does not put more in the box.
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
                    <button key={f.id} onClick={() => setRows(f.rows.map(r => ({
                      rarity: r.rarity as Rarity, label: r.name, count: r.count,
                      advertised: r.advertised, finishes: (r.finishes ?? []) as Finish[],
                    })))} style={{
                      padding: '8px 12px', background: C.raised, border: `1px solid ${C.rule}`,
                      borderRadius: 2, color: C.ink, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}>{f.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, marginTop: 10 }}>
              <div style={{ padding: '10px 14px', background: C.panel }}>
                <div style={micro}>PACK SLOTS</div>
                <div style={{ ...num, fontSize: 15, fontWeight: 600 }}>{slots.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>Fixed. You divide them.</div>
              </div>
              <div style={{ padding: '10px 14px', background: C.panel }}>
                <div style={micro}>FINISHED</div>
                <div style={{ ...num, fontSize: 15, fontWeight: 600, color: finishShare > 0.34 ? C.bad : C.note }}>
                  {Math.round(finishShare * 100)}%
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{finished} of {size}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 58px', gap: 7, padding: '9px 16px 5px', ...micro }}>
              <div>RARITY · FINISH</div>
              <div style={{ textAlign: 'right' }}>CARDS</div>
              <div style={{ textAlign: 'right' }}>PULL</div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 52px 58px', gap: 7, alignItems: 'center',
              padding: '9px 16px', borderTop: `1px solid ${C.rule}`, background: C.raised,
            }}>
              <div>
                <div style={{ fontSize: 12.5 }}>Common</div>
                <div style={{ ...micro, color: C.dim }}>FILLS THE REST</div>
              </div>
              <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{commons}</div>
              <div style={{ textAlign: 'right', ...num, fontSize: 10.5, color: C.muted }}>
                {oddsText(perCardPull(s, 'common', size) * commons)}
              </div>
            </div>

            {rows.map((r, i) => (
              <div key={r.rarity} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '9px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 58px', gap: 7, alignItems: 'center' }}>
                  <input value={r.label} onChange={e => setRow(i, { label: e.target.value })}
                    aria-label={`Name for ${r.rarity}`} style={{
                      fontSize: 12.5, background: 'none', border: 'none', borderBottom: `1px dashed ${C.rule}`,
                      color: C.ink, fontFamily: 'inherit', padding: '2px 0', width: '100%', outline: 'none',
                    }} />
                  <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{r.count}</div>
                  <div style={{ textAlign: 'right', ...num, fontSize: 10.5, color: C.muted }}>
                    {oddsText(perCardPull(s, r.rarity, size) * r.count)}
                  </div>
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
                    // deletion.
                    setCrafted(crafted.filter(c => c.rarity !== r.rarity));
                    setRows(rows.filter((_, j) => j !== i));
                  }} style={{ ...pillBtn, color: C.bad, marginLeft: 'auto' }}>×</button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <FinishPicker value={r.finishes} onChange={f => setRow(i, { finishes: f })} />
                </div>
              </div>
            ))}

            {ALL_RARITIES.filter(([r]) => !rows.some(x => x.rarity === r)).length > 0 && (
              <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={label}>ADD A RUNG</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ALL_RARITIES.filter(([r]) => !rows.some(x => x.rarity === r)).map(([r, lbl]) => (
                    <button key={r} type="button" onClick={() => setRows([...rows, {
                      rarity: r, label: lbl, count: 1, advertised: true, finishes: [],
                    }].sort((a, b) => ALL_RARITIES.findIndex(x => x[0] === a.rarity)
                                    - ALL_RARITIES.findIndex(x => x[0] === b.rarity)))} style={{
                      height: 34, padding: '0 11px', background: 'transparent', color: C.ink,
                      border: `1px dashed ${C.border}`, borderRadius: 2, fontSize: 12,
                      fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation',
                    }}>+ {lbl}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: '12px 16px 0' }}>
              <Button tone="quiet" onClick={() => {
                const n = prompt('Save this rarity ladder as a format called:');
                if (!n || !n.trim()) return;
                saveFormat({
                  id: `fmt_${Date.now().toString(36)}`, name: n.trim(), packsPerUnit: 24, msrp: 14000,
                  rows: rows.map(r => ({ rarity: r.rarity, name: r.label, count: r.count, advertised: r.advertised, finishes: r.finishes })),
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
          <CardsStep s={s} rows={allRows} crafted={crafted} setCrafted={setCrafted} ips={ips} size={size} />
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '15px 18px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>HOW MANY BOXES</span>
              <Stepper value={units} onChange={setUnits} step={500} min={500} max={60000} />
            </div>
            <div style={{ border: `1px solid ${C.rule}`, background: C.panel }}>
              <Row left={`${units.toLocaleString()} boxes at 18.48`} right={money(cost)} strong />
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
            </Note>
          </div>
        )}

        </Pane>
        <div style={{ padding: '18px 18px 34px' }}>
          {step < 3
            ? <Button onClick={() => go(step + 1)} disabled={!canNext}>
                {['Rarities', 'Cards', 'Print run'][step]}
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


/** Craft individual cards: pick a character, a rarity, and a finish. */
function CardsStep({ s, rows, crafted, setCrafted, ips, size }: {
  s: SimState; rows: RarityRow[]; crafted: Crafted[];
  setCrafted: (c: Crafted[]) => void; ips: IpEntity[]; size: number;
}) {
  const [pickIp, setPickIp] = useState<string>(ips[0] ? String(ips[0]!.id) : '');
  const [pickRarity, setPickRarity] = useState<Rarity>('rare');
  const [pickFinish, setPickFinish] = useState<Finish[]>(['holo']);
  const nameOf = (id: string) => Object.values(s.ips).find(i => String(i.id) === id)?.name ?? id;
  const roomAt = (r: Rarity) =>
    (rows.find(x => x.rarity === r)?.count ?? 0) - crafted.filter(c => c.rarity === r).length;

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
            {rows.find(r => r.rarity === c.rarity)?.label ?? c.rarity}
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
        <select value={pickRarity} onChange={e => {
          const r = e.target.value as Rarity;
          setPickRarity(r);
          // Start from what that rung already prints; the card can then differ.
          setPickFinish(rows.find(x => x.rarity === r)?.finishes ?? []);
        }} style={selectStyle}>
          {rows.map(r => (
            <option key={r.rarity} value={r.rarity} disabled={roomAt(r.rarity) <= 0}>
              {r.label} ({roomAt(r.rarity)} left)
            </option>
          ))}
        </select>
        <FinishPicker value={pickFinish} onChange={setPickFinish} />
        <Button tone="quiet" disabled={!pickIp || roomAt(pickRarity) <= 0} onClick={() =>
          setCrafted([...crafted, { ipId: pickIp as IpId, rarity: pickRarity, finishes: pickFinish }])}>
          Add card
        </Button>
        <div style={{ fontSize: 11, lineHeight: 1.42, color: C.muted }}>
          Make the same character more than once. Four Arylas at four rarities is a variant run, and
          collectors chase the complete set of them.
        </div>
      </div>
    </>
  );
}
