/** Cash, debt, standing, and what has moved lately. */
import type { SimState } from '../../sim/types.ts';
import { C, num, micro, Row, Empty } from '../ui.tsx';
import { money, yearOf } from '../format.ts';

// --- studio: ledger --------------------------------------------------------

export function Ledger({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  if (!pub) return null;
  const spend = pub.ledger.slice(-14).reverse();
  return (
    <>
      <div style={{ border: `1px solid ${C.rule}`, background: C.panel, margin: '14px 18px' }}>
        <Row left="Cash" right={money(pub.cash)} strong />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Debt" right={money(pub.debt)} />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Widest debt so far" right={money(pub.peakDebt)} />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Brand standing" right={pub.brandStanding.toFixed(2)} />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Credit" right={pub.credit.toFixed(2)} />
      </div>
      <div style={{ ...micro, padding: '4px 18px 6px' }}>RECENT MOVEMENTS</div>
      {spend.length === 0 && <Empty>Nothing has moved yet.</Empty>}
      {spend.map((e, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 18px',
          borderTop: `1px solid ${C.rule}`, background: C.panel, alignItems: 'baseline',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note || e.category}</div>
            <div style={micro}>{e.category.toUpperCase()} · {yearOf(s, e.t)}</div>
          </div>
          <div style={{ ...num, fontSize: 13, color: e.amount < 0 ? C.bad : C.go }}>
            {e.amount < 0 ? '' : '+'}{money(e.amount)}
          </div>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </>
  );
}