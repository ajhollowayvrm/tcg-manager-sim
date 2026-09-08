/** What the world did while the clock ran. */
import type { SimState } from '../../sim/types.ts';
import { C, micro, Empty } from '../ui.tsx';
import { yearOf } from '../format.ts';

// --- feed ------------------------------------------------------------------

export function Feed({ s }: { s: SimState }) {
  const events = s.events.slice(-120).reverse();
  return (
    <>
      {events.length === 0 && <Empty>Nothing has happened yet. Press Continue.</Empty>}
      {events.map(e => (
        <div key={e.id} style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '9px 18px',
          borderTop: `1px solid ${C.rule}`, background: e.interrupts ? C.raised : C.panel,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: e.interrupts ? 600 : 400 }}>{e.kind}</div>
            <div style={micro}>W{String((e.t as number) % 52).padStart(2, '0')} · {yearOf(s, e.t)}</div>
          </div>
          {e.interrupts && <div style={{ ...micro, color: C.note, alignSelf: 'center' }}>STOP</div>}
        </div>
      ))}
      <div style={{ height: 20 }} />
    </>
  );
}