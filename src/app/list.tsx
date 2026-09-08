/**
 * Virtualised lists.
 *
 * This is not an optimisation, it is a requirement the measurements set. A
 * 50-year run holds about 14,000 printings and 142,596 events, and
 * `docs/screens-audit.md` says in as many words that the feed "cannot be
 * 'render the array'". Mounting fourteen thousand rows on a phone is a stall
 * long enough to look like a crash.
 *
 * Rows are fixed-height by design: a measured row forces a second layout pass
 * per row, which is most of what virtualisation just bought back.
 */
import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { C } from './ui.tsx';

export function VirtualList<T>({ items, rowHeight, render, empty, overscan = 8 }: {
  items: T[];
  rowHeight: number;
  render: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  overscan?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: items.length,
    getScrollElement: () => host.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  if (items.length === 0 && empty) {
    return (
      <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 12.5, lineHeight: 1.5, color: C.dim }}>
        {empty}
      </div>
    );
  }

  return (
    <div ref={host} style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ height: v.getTotalSize(), width: '100%', position: 'relative' }}>
        {v.getVirtualItems().map(row => (
          <div key={row.key} style={{
            position: 'absolute', top: 0, left: 0, width: '100%',
            height: row.size, transform: `translateY(${row.start}px)`,
          }}>
            {render(items[row.index]!, row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
