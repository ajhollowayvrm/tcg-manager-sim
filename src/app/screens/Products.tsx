/**
 * The SKU forms this studio can print.
 *
 * The nine built-ins arrive as ordinary editable rows; anything else is a form
 * the studio invented. There is one code path and nothing is special-cased —
 * except that a built-in row's KEY is reserved and cannot move, because that
 * key is what `config.world.productPreference` is fitted against.
 *
 * What the line owns is the SHAPE: a name and a pack count. Price, region and
 * quantity belong to the set that prints it, because a studio charges what a
 * release will bear rather than what a form is worth in the abstract.
 */
import { useState } from 'react';
import { C, MONO, num, label, micro, Button, Stepper, Empty, pillBtn } from '../ui.tsx';
import {
  getMeta, saveProductLine, deleteProductLine, isBuiltinLine, productLineKey,
} from '../store.ts';

export function Products() {
  const meta = getMeta();
  const [editing, setEditing] = useState<string | null>(null);
  const line = meta.productLines.find(l => l.key === editing);

  if (line) {
    const builtIn = isBuiltinLine(line.key);
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px' }}>
          <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16 }}>{line.name}</span>
          <button onClick={() => setEditing(null)} style={{
            ...pillBtn, width: 'auto', padding: '0 12px', fontSize: 12,
          }}>Done</button>
        </div>

        <div style={{ padding: '4px 16px 6px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={label}>NAME</span>
          <input value={line.name} aria-label="Product line name"
            onChange={e => saveProductLine({ ...line, name: e.target.value })}
            style={{
              height: 44, padding: '0 12px', background: C.panel, color: C.ink,
              border: `1px solid ${C.rule}`, borderRadius: 2, fontFamily: 'inherit',
              fontSize: 14, outline: 'none', width: '100%',
            }} />

          <span style={{ ...label, marginTop: 8 }}>PACKS PER UNIT</span>
          <Stepper value={line.packsPerUnit} min={1} max={60}
            onChange={v => saveProductLine({ ...line, packsPerUnit: v })} />

          <div style={{ ...micro, color: C.dim, marginTop: 10 }}>
            KEY · {line.key}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: C.muted }}>
            {builtIn
              ? 'A built-in form. Its key is reserved and every region already has a settled appetite for it — rename it freely, the key does not move.'
              : 'A form you invented. Every region has its own hidden appetite for it, and the only way to find out is to ship one.'}
          </div>
        </div>

        {!builtIn && (
          <div style={{ padding: '16px 16px 24px' }}>
            <Button tone="quiet" onClick={() => { deleteProductLine(line.key); setEditing(null); }}>
              Delete this line
            </Button>
            <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim, marginTop: 7 }}>
              Product already printed on it keeps selling. You just cannot start a new run of it.
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {meta.productLines.length === 0 && (
        <Empty>No product lines. A set needs something to print into.</Empty>
      )}
      {meta.productLines.map(l => (
        <button key={l.key} onClick={() => setEditing(l.key)} style={{
          display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
          border: 'none', borderTopStyle: 'solid', color: C.ink, cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{l.name}</div>
            <div style={{ ...micro, letterSpacing: '0.07em' }}>
              {l.packsPerUnit} PACK{l.packsPerUnit === 1 ? '' : 'S'}
              {isBuiltinLine(l.key) ? '' : ' · YOURS'}
            </div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      ))}
      <div style={{ padding: '14px 18px 8px' }}>
        <Button tone="quiet" onClick={() => {
          const n = prompt('What is this product called?');
          if (!n || !n.trim()) return;
          const key = productLineKey(n);
          if (meta.productLines.some(l => l.key === key)) { setEditing(key); return; }
          saveProductLine({ key, name: n.trim(), packsPerUnit: 4 });
          setEditing(key);
        }}>New product line</Button>
      </div>
      <div style={{ padding: '0 18px 24px', fontSize: 11, lineHeight: 1.45, color: C.muted }}>
        A line is a shape, not a price. What a unit costs and how many you print belong to the set
        that prints it. Invent whatever you like — a checklane blister, a hanger — but no region has
        an opinion about a form it has never seen, and you will not know what that opinion is until
        you ship one.
      </div>
    </>
  );
}
