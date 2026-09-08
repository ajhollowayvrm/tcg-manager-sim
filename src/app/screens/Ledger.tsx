/**
 * Money: what there is, what is owed, and what has moved.
 *
 * The loan is a decision here rather than a consequence. Until `api.borrow`
 * existed, every loan in the game was the overdraft in `tickFinance` firing
 * after cash had already gone negative — the player found out they had borrowed
 * by reading the debt line.
 */
import { useState } from 'react';
import type { SimState, LedgerEntry } from '../../sim/types.ts';
import { api, borrowCeiling } from '../../sim/engine.ts';
import {
  C, MONO, num, label, micro, Button, Row, Note, Empty, Sheet, Slider, Stat, StatRow, Tabs,
} from '../ui.tsx';
import { money, stamp, asCents } from '../format.ts';
import { commit } from '../store.ts';

const FILTERS = ['All', 'Sales', 'Print', 'Art', 'Running', 'Loan'] as const;
type Filter = typeof FILTERS[number];

const IN_FILTER: Record<Filter, (c: LedgerEntry['category']) => boolean> = {
  All: () => true,
  Sales: c => c === 'sales',
  Print: c => c === 'print_run' || c === 'storage',
  Art: c => c === 'art_commission',
  Running: c => c === 'overhead' || c === 'staff' || c === 'marketing' || c === 'event' || c === 'unlock',
  Loan: c => c === 'interest' || c === 'principal',
};

export function Ledger({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  const [filter, setFilter] = useState<Filter>('All');
  const [loan, setLoan] = useState<null | 'borrow' | 'repay'>(null);
  const [amount, setAmount] = useState(0);
  if (!pub) return null;

  const ceiling = borrowCeiling(s, pub);
  const headroom = Math.max(0, Math.round(ceiling - pub.debt));
  const retainers = Object.values(pub.retainers).length;
  const rows = pub.ledger.filter(e => IN_FILTER[filter](e.category)).slice(-200).reverse();

  const open = (mode: 'borrow' | 'repay') => {
    setAmount(mode === 'borrow'
      ? Math.min(headroom, 100_000_00)
      : Math.min(pub.cash, pub.debt));
    setLoan(mode);
  };

  return (
    <>
      <StatRow cols={2}>
        <Stat label="Cash" value={money(pub.cash)} tone={pub.cash > 0 ? 'ink' : 'bad'} />
        <Stat label="Debt" value={money(pub.debt)} tone={pub.debt > 0 ? 'bad' : 'ink'}
          sub={`${money(headroom)} still available`} />
      </StatRow>
      <StatRow cols={3}>
        <Stat label="Credit" value={pub.credit.toFixed(2)} sub="Lowers the rate" />
        <Stat label="Brand" value={pub.brandStanding.toFixed(2)} sub="Opens channels" />
        <Stat label="Retainers" value={retainers} sub={retainers === 1 ? 'artist' : 'artists'} />
      </StatRow>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
        <Button tone="quiet" disabled={headroom <= 0} onClick={() => open('borrow')}>
          {headroom > 0 ? 'Borrow' : 'The bank is closed'}
        </Button>
        <Button tone="quiet" disabled={pub.debt <= 0 || pub.cash <= 0} onClick={() => open('repay')}>
          Pay down
        </Button>
      </div>
      {pub.peakDebt > pub.debt && (
        <div style={{ ...micro, padding: '0 16px 8px', color: C.dim }}>
          WIDEST DEBT SO FAR {money(pub.peakDebt)}
        </div>
      )}

      <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
      {rows.length === 0 && <Empty>Nothing under this heading yet.</Empty>}
      {rows.map((e, i) => (
        <div key={`${e.t}-${i}`} style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 16px',
          borderTop: `1px solid ${C.rule}`, background: C.panel, alignItems: 'baseline',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.note || e.category}
            </div>
            <div style={micro}>{e.category.toUpperCase()} · {stamp(s, e.t)}</div>
          </div>
          <div style={{ ...num, fontSize: 13, color: e.amount < 0 ? C.bad : C.go }}>
            {e.amount < 0 ? '' : '+'}{money(e.amount)}
          </div>
        </div>
      ))}
      <div style={{ height: 24 }} />

      <Sheet open={loan !== null} onClose={() => setLoan(null)}
        title={loan === 'repay' ? 'Pay down the loan' : 'Draw on the loan'}>
        <div style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <Slider value={amount} onChange={setAmount} min={0} step={5_000_00}
            max={loan === 'repay' ? Math.min(pub.cash, pub.debt) : headroom}
            format={v => money(v)} />
          <div style={{ border: `1px solid ${C.rule}`, background: C.raised }}>
            <Row left="Cash after" right={money(loan === 'repay' ? pub.cash - amount : pub.cash + amount)} strong />
            <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
            <Row left="Debt after" right={money(loan === 'repay' ? pub.debt - amount : pub.debt + amount)} />
            <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
            <Row left="The bank's ceiling" right={money(ceiling)} />
          </div>
          {loan === 'borrow'
            ? <Note>
                The ceiling is measured against what you have SOLD, not against what you have.
                A studio with no sales gets the floor and nothing more — which is what stops
                doing nothing being funded by the bank for four years.
              </Note>
            : <Note>Paying early costs nothing and lowers the interest from the next quarter.</Note>}
          <Button disabled={amount <= 0} onClick={() => {
            commit(st => {
              if (loan === 'repay') api.repay(st, asCents(amount));
              else api.borrow(st, asCents(amount));
            });
            setLoan(null);
          }}>
            {loan === 'repay' ? `Repay ${money(amount)}` : `Borrow ${money(amount)}`}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
