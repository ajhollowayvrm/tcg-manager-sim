/**
 * The finish chip row.
 *
 * Shared by the set wizard's rarity step and the format editor, which is why it
 * is not a private helper of either. Finishes STACK — `Card.treatments` is a
 * list, not an enum — so this is a multi-select, not a radio group.
 */
import { C, micro } from '../ui.tsx';
import { FINISH_GROUPS, FINISH_LABEL, type Finish } from '../setdesign.ts';

/** A chip row: tap to add or drop a finish. Finishes stack. */
export function FinishPicker({ value, onChange }: { value: Finish[]; onChange: (f: Finish[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {FINISH_GROUPS.map(([group, list]) => (
        <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ ...micro, width: 46, flexShrink: 0 }}>{group.toUpperCase()}</span>
          {list.map(f => {
            const on = value.includes(f);
            return (
              <button key={f} type="button" onClick={() =>
                onChange(on ? value.filter(x => x !== f) : [...value, f])} style={{
                  height: 30, padding: '0 9px', borderRadius: 2, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11, touchAction: 'manipulation',
                  background: on ? C.go : 'transparent',
                  color: on ? C.onAccent : C.muted,
                  border: `1px solid ${on ? C.go : C.rule}`,
                  fontWeight: on ? 600 : 400,
                }}>{FINISH_LABEL[f]}</button>
            );
          })}
        </div>
      ))}
    </div>
  );
}