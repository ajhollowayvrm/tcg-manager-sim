/** Every set the studio has, grouped by where it is in its life. */
import type { SimState, SetId } from '../../sim/types.ts';
import { C, MONO, num, micro, Button, Empty } from '../ui.tsx';
import { money, yearOf } from '../format.ts';

// --- studio: sets ----------------------------------------------------------

export function Sets({ s, onNew, onOpen }: {
  s: SimState; onNew: () => void; onOpen: (id: SetId) => void;
}) {
  const sets = Object.values(s.sets).filter(x => x.publisherId === s.playerId)
    .sort((a, b) => b.designStartTick - a.designStartTick);
  const stages: Array<[string, string]> = [
    ['design', 'IN DESIGN'], ['committed', 'PRINTING'], ['revealing', 'REVEALING'],
    ['released', 'RELEASED'], ['archived', 'ARCHIVED'],
  ];
  return (
    <>
      {sets.length === 0 && <Empty>No sets yet. This is the bet the whole game is about.</Empty>}
      {stages.map(([status, title]) => {
        const group = sets.filter(x => x.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <div style={{ ...micro, padding: '11px 18px 5px' }}>{title}</div>
            {group.map(set => (
              <button key={set.id} onClick={() => onOpen(set.id)} style={{
                display: 'grid', width: '100%', gridTemplateColumns: '1fr auto', gap: 10,
                alignItems: 'center', padding: '10px 18px', borderTop: `1px solid ${C.rule}`,
                background: C.panel, border: 'none', borderTopStyle: 'solid', color: C.ink,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{set.name}</div>
                  <div style={{ ...micro, letterSpacing: '0.07em' }}>
                    {set.type.toUpperCase()} · {set.cardIds.length} CARDS · {yearOf(s, set.designStartTick)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {set.performance
                    ? <>
                        <div style={{ ...num, fontSize: 13, color: C.go }}>{money(set.performance.revenue)}</div>
                        <div style={{ ...micro }}>{Math.round(100 * set.performance.unitsSold /
                          Math.max(1, set.performance.unitsSold + set.performance.unitsUnsold))}% SOLD</div>
                      </>
                    : <div style={{ ...micro, color: C.dim }}>—</div>}
                </div>
              </button>
            ))}
          </div>
        );
      })}
      <div style={{ padding: '14px 18px 20px' }}>
        <Button onClick={onNew} tone="quiet">Design a set</Button>
      </div>
    </>
  );
}