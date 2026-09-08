/**
 * The rarity ladders and pack configurations a studio reuses.
 *
 * Authored here, imported when a set is designed. A real studio settles this
 * once and reprints it for years, so it does not belong inside a set wizard.
 */
import { useState } from 'react';
import { C, MONO, num, label, micro, Button, Stepper, Empty, pillBtn } from '../ui.tsx';
import { getMeta, saveFormat, deleteFormat } from '../store.ts';
import { ALL_RARITIES, DEFAULT_ROWS, type Finish } from '../setdesign.ts';
import { FinishPicker } from './FinishPicker.tsx';

// --- studio: formats -------------------------------------------------------

/**
 * The rarity ladders and pack configurations a studio reuses.
 *
 * Authored here, imported when a set is designed. A real studio settles this
 * once and reprints it for years, so it does not belong inside a set wizard.
 */
export function Formats() {
  const meta = getMeta();
  const [editing, setEditing] = useState<string | null>(null);
  const f = meta.formats.find(x => x.id === editing);

  if (f) {
    const setRow = (i: number, patch: Partial<typeof f.rows[number]>) =>
      saveFormat({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px' }}>
          <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16 }}>{f.name}</span>
          <button onClick={() => setEditing(null)} style={{
            ...pillBtn, width: 'auto', padding: '0 12px', fontSize: 12,
          }}>Done</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px', gap: 7, padding: '4px 16px 6px', ...micro }}>
          <div>NAME · TIER · FINISH</div>
          <div style={{ textAlign: 'right' }}>CARDS</div>
        </div>
        {f.rows.map((r, i) => (
          <div key={i} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '9px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px', gap: 7, alignItems: 'center' }}>
              <input value={r.name} onChange={e => setRow(i, { name: e.target.value })}
                aria-label={`Name for ${r.rarity}`} style={{
                  fontSize: 13, background: 'none', border: 'none', borderBottom: `1px dashed ${C.rule}`,
                  color: C.ink, fontFamily: 'inherit', padding: '2px 0', width: '100%', outline: 'none',
                }} />
              <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{r.count}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              <button onClick={() => setRow(i, { count: Math.max(0, r.count - 1) })} style={pillBtn}>−</button>
              <button onClick={() => setRow(i, { count: r.count + 1 })} style={pillBtn}>+</button>
              <span style={{ ...micro, color: C.dimmer }}>{r.rarity}</span>
              <button type="button" onClick={() => setRow(i, { advertised: !r.advertised })} style={{
                ...pillBtn, width: 'auto', padding: '0 10px',
                color: r.advertised ? C.muted : C.bad, borderColor: r.advertised ? C.rule : C.bad,
              }}>{r.advertised ? 'Advertised' : 'Secret'}</button>
              <button type="button" aria-label={`Remove ${r.name}`}
                onClick={() => saveFormat({ ...f, rows: f.rows.filter((_, j) => j !== i) })}
                style={{ ...pillBtn, color: C.bad, marginLeft: 'auto' }}>×</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <FinishPicker value={(r.finishes ?? []) as Finish[]}
                onChange={fx => setRow(i, { finishes: fx })} />
            </div>
          </div>
        ))}
        {ALL_RARITIES.filter(([r]) => !f.rows.some(x => x.rarity === r)).length > 0 && (
          <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={label}>ADD A RUNG</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ALL_RARITIES.filter(([r]) => !f.rows.some(x => x.rarity === r)).map(([r, lbl]) => (
                <button key={r} type="button" onClick={() => saveFormat({
                  ...f,
                  rows: [...f.rows, { rarity: r, name: lbl, count: 1, advertised: true, finishes: [] }]
                    .sort((a, b) => ALL_RARITIES.findIndex(x => x[0] === a.rarity)
                                  - ALL_RARITIES.findIndex(x => x[0] === b.rarity)),
                })} style={{
                  height: 34, padding: '0 11px', background: 'transparent', color: C.ink,
                  border: `1px dashed ${C.border}`, borderRadius: 2, fontSize: 12,
                  fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation',
                }}>+ {lbl}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ padding: '14px 16px 6px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={label}>PACKS PER BOX</span>
          <Stepper value={f.packsPerUnit} onChange={v => saveFormat({ ...f, packsPerUnit: v })} min={1} max={60} />
          <span style={{ ...label, marginTop: 8 }}>BOX PRICE, IN CENTS</span>
          <Stepper value={f.msrp} onChange={v => saveFormat({ ...f, msrp: v })} step={500} min={500} max={100000} />
        </div>
        <div style={{ padding: '16px 16px 24px' }}>
          <Button tone="quiet" onClick={() => { deleteFormat(f.id); setEditing(null); }}>Delete this format</Button>
        </div>
      </>
    );
  }

  return (
    <>
      {meta.formats.length === 0 && (
        <Empty>No formats yet. A format is a rarity ladder and a pack configuration you reuse — settle it once, import it into every set.</Empty>
      )}
      {meta.formats.map(x => (
        <button key={x.id} onClick={() => setEditing(x.id)} style={{
          display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
          border: 'none', borderTopStyle: 'solid', color: C.ink, cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}>
          <div>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{x.name}</div>
            <div style={{ ...micro, letterSpacing: '0.07em' }}>
              {x.rows.length} TIERS · {x.rows.reduce((n, r) => n + r.count, 0)} NAMED CARDS · {x.packsPerUnit} PACKS
            </div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      ))}
      <div style={{ padding: '14px 18px 24px' }}>
        <Button tone="quiet" onClick={() => {
          const n = prompt('Name this format:');
          if (!n || !n.trim()) return;
          const id = `fmt_${Date.now().toString(36)}`;
          saveFormat({
            id, name: n.trim(), packsPerUnit: 24, msrp: 14000,
            rows: DEFAULT_ROWS.map(r => ({
              rarity: r.rarity, name: r.label, count: r.count,
              advertised: r.advertised, finishes: r.finishes,
            })),
          });
          setEditing(id);
        }}>New format</Button>
      </div>
    </>
  );
}