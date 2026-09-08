/**
 * The trade-desk look, as tokens plus a few atoms.
 *
 * Every value here came off the published design canvas. Screens compose these
 * rather than restating hex codes, so a palette change is one edit.
 */
import type { CSSProperties, ReactNode } from 'react';

export const C = {
  ground: 'oklch(0.20 0.012 250)',
  panel: 'oklch(0.235 0.014 250)',
  raised: 'oklch(0.265 0.014 250)',
  rule: 'oklch(0.32 0.014 250)',
  ruleSoft: 'oklch(0.29 0.014 250)',
  border: 'oklch(0.36 0.014 250)',
  ink: 'oklch(0.92 0.008 250)',
  ink2: 'oklch(0.86 0.008 250)',
  ink3: 'oklch(0.80 0.009 250)',
  muted: 'oklch(0.66 0.010 250)',
  dim: 'oklch(0.58 0.010 250)',
  dimmer: 'oklch(0.50 0.010 250)',
  go: 'oklch(0.72 0.16 150)',
  note: 'oklch(0.72 0.16 70)',
  bad: 'oklch(0.72 0.16 25)',
  onAccent: 'oklch(0.17 0.012 250)',
} as const;

export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
export const SANS = "Archivo, 'Helvetica Neue', Arial, sans-serif";

export const label: CSSProperties = {
  fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.11em', color: C.muted,
};
export const micro: CSSProperties = {
  fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', color: C.dim,
};
export const num: CSSProperties = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0,
      background: C.ground, color: C.ink, fontFamily: SANS,
    }}>{children}</div>
  );
}

export function Scroll({ children }: { children: ReactNode }) {
  return (
    <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {children}
    </div>
  );
}

export function Header({ title, sub, right, onBack }: {
  title: string; sub?: string; right?: ReactNode; onBack?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
      background: C.panel, borderBottom: `1px solid ${C.rule}`, flexShrink: 0,
    }}>
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back" style={{
          width: 40, height: 44, marginLeft: -8, background: 'none', border: 'none',
          color: C.ink, display: 'flex', alignItems: 'center', padding: 0, cursor: 'pointer',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M11 6l-6 6 6 6" />
          </svg>
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: MONO, fontWeight: 600, fontSize: 20, letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {sub && <div style={{ ...micro, color: C.dim }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Button({ children, onClick, tone = 'go', disabled }: {
  children: ReactNode; onClick?: () => void; tone?: 'go' | 'quiet'; disabled?: boolean;
}) {
  const go = tone === 'go';
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: '100%', height: 52, border: go ? 'none' : `1px solid ${C.border}`,
      background: disabled ? C.raised : go ? C.go : 'transparent',
      color: disabled ? C.dim : go ? C.onAccent : C.ink,
      fontFamily: SANS, fontSize: 15, fontWeight: 600, borderRadius: 2,
      cursor: disabled ? 'default' : 'pointer',
      touchAction: 'manipulation', WebkitUserSelect: 'none',
    }}>{children}</button>
  );
}

export function Field({ label: l, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={label}>{l.toUpperCase()}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          height: 50, padding: '0 13px', background: C.panel, color: C.ink,
          border: `1px solid ${value ? C.ink : C.rule}`, borderRadius: 2,
          fontFamily: MONO, fontWeight: 600, fontSize: 18, letterSpacing: '0.01em',
          outline: 'none', width: '100%',
        }} />
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = Infinity }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  const box: CSSProperties = {
    width: 44, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${C.border}`, background: C.panel, color: C.ink,
    borderRadius: 2, cursor: 'pointer', padding: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <button type="button" style={box} onClick={() => onChange(Math.max(min, value - step))} aria-label="Less">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <div style={{
        flexGrow: 1, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 2,
        ...num, fontSize: 19, fontWeight: 600,
      }}>{value.toLocaleString()}</div>
      <button type="button" style={box} onClick={() => onChange(Math.min(max, value + step))} aria-label="More">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}

export function Row({ left, right, strong }: { left: ReactNode; right: ReactNode; strong?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 10, padding: '8px 12px',
    }}>
      <span style={{ fontSize: 12.5, color: strong ? C.ink : C.ink3, fontWeight: strong ? 600 : 400 }}>{left}</span>
      <span style={{ ...num, fontSize: strong ? 17 : 12.5, fontWeight: strong ? 600 : 400 }}>{right}</span>
    </div>
  );
}

export function Note({ children, tone = 'note' }: { children: ReactNode; tone?: 'note' | 'bad' }) {
  return (
    <div style={{
      display: 'flex', gap: 9, padding: '10px 12px', background: C.raised,
      borderLeft: `3px solid ${tone === 'bad' ? C.bad : C.note}`,
      fontSize: 12, lineHeight: 1.42, color: C.ink2,
    }}>{children}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: '28px 20px', textAlign: 'center', fontSize: 12.5,
      lineHeight: 1.5, color: C.dim,
    }}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Chart colour
// ---------------------------------------------------------------------------

/**
 * The categorical series palette.
 *
 * `C.go`, `C.note` and `C.bad` are STATUS colours — they mean healthy, notice
 * and money-leaving — so a chart series must never borrow one. These five are
 * the series ramp, and they are validated rather than chosen by eye: run
 * `scripts/validate_palette.js` from the dataviz skill against the app ground
 * (#12171b) and all five checks pass — lightness band, chroma floor, CVD
 * separation (worst adjacent pair ΔE 9.9 protan), normal-vision floor (17.3)
 * and contrast.
 *
 * **The order is fixed and must not be cycled or sorted.** Lightness alternates
 * deliberately: hue alone collapses under red-blind vision, and the light/dark
 * stagger is what carries the separation. Re-ordering these five re-introduces
 * the magenta-against-cyan pair that failed at ΔE 4.5.
 *
 * A sixth series does not get a generated hue. It folds into "Other".
 */
export const SERIES = [
  'oklch(0.66 0.15 255)', // blue
  'oklch(0.55 0.13 110)', // olive
  'oklch(0.66 0.17 345)', // pink
  'oklch(0.54 0.15 300)', // violet
  'oklch(0.66 0.12 195)', // teal
] as const;

/** Hex twins of `SERIES`, for canvas, which does not take oklch in every engine. */
export const SERIES_HEX = ['#4c94ec', '#777700', '#d861aa', '#7d56b8', '#00a8a9'] as const;

/**
 * The sequential ramp, for ORDINAL data — grade tiers, rarity rungs, deciles.
 *
 * One hue, monotonic lightness, brightest first. A grade ladder is a magnitude,
 * not five identities, so it must never wear `SERIES`.
 */
export const SEQ_HEX = ['#9dc7fe', '#75aef5', '#4c94ec', '#337bd0', '#2863ab', '#234e82'] as const;

/** Money moved: loss, flat, gain. Two hues around a neutral grey, never a rainbow. */
export const DIVERGING_HEX = ['#e3645e', '#6d7277', '#3eab5e'] as const;

export const seriesColor = (i: number): string => SERIES[i % SERIES.length]!;

// ---------------------------------------------------------------------------
// Layout atoms
// ---------------------------------------------------------------------------

/** A row of tabs. The same shape the studio sub-navigation already uses. */
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: readonly T[]; value: T; onChange: (t: T) => void;
}) {
  return (
    <div style={{
      display: 'flex', background: C.panel, borderBottom: `1px solid ${C.rule}`,
      flexShrink: 0, paddingLeft: 6, paddingRight: 6, overflowX: 'auto',
    }}>
      {tabs.map(t => (
        <button key={t} type="button" onClick={() => onChange(t)} style={{
          flex: '1 1 0', minWidth: 62, height: 46, border: 'none', background: 'none',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, padding: '0 4px',
          whiteSpace: 'nowrap', touchAction: 'manipulation', WebkitUserSelect: 'none',
          transition: 'color 160ms ease',
          color: value === t ? C.ink : C.dim, fontWeight: value === t ? 600 : 400,
          borderBottom: value === t ? `2px solid ${C.go}` : '2px solid transparent',
        }}>{t}</button>
      ))}
    </div>
  );
}

/**
 * A bottom sheet.
 *
 * Every decision that needs more than one field opens one of these rather than
 * a route, so the player never loses the list they were reading.
 */
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title} style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end',
    }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'oklch(0.12 0.01 250 / 0.72)',
        border: 'none', padding: 0, cursor: 'pointer',
      }} />
      <div style={{
        position: 'relative', width: '100%', maxHeight: '86vh', overflowY: 'auto',
        background: C.panel, borderTop: `1px solid ${C.border}`,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '13px 18px 10px', borderBottom: `1px solid ${C.rule}`,
          position: 'sticky', top: 0, background: C.panel, zIndex: 1,
        }}>
          <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16 }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            width: 34, height: 34, background: 'none', border: `1px solid ${C.rule}`,
            color: C.ink, borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15,
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A figure with its label. The tile the status strip and set header are made of. */
export function Stat({ label: l, value, tone, sub }: {
  label: string; value: ReactNode; tone?: 'ink' | 'go' | 'note' | 'bad'; sub?: ReactNode;
}) {
  const col = tone === 'go' ? C.go : tone === 'note' ? C.note : tone === 'bad' ? C.bad : C.ink;
  return (
    <div style={{ padding: '9px 14px', background: C.panel, minWidth: 0 }}>
      <div style={micro}>{l.toUpperCase()}</div>
      <div style={{ ...num, fontSize: 16, fontWeight: 600, color: col, marginTop: 2 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/** A hairline grid of `Stat`s. */
export function StatRow({ children, cols }: { children: ReactNode; cols?: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols ?? 2}, minmax(0,1fr))`,
      gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, flexShrink: 0,
    }}>{children}</div>
  );
}

/**
 * A requirement, and why it is not met.
 *
 * Every gate in the game is a number against a number — `brandStanding` against
 * `requiredBrandStanding`, cash against a cost, an audience scale against a
 * threshold. Showing the pair is the whole explanation, so no screen writes its
 * own sentence for it.
 */
export function Gate({ met, need, have, label: l }: {
  met: boolean; need: ReactNode; have: ReactNode; label: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
      padding: '6px 12px', fontSize: 11.5,
      color: met ? C.muted : C.bad,
    }}>
      <span>{met ? '✓' : '✕'} {l}</span>
      <span style={{ ...num, fontSize: 11.5 }}>{have} / {need}</span>
    </div>
  );
}

/** A labelled slider, for a decision with a continuous range and a live cost. */
export function Slider({ value, onChange, min, max, step = 1, format }: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; format?: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flexGrow: 1, accentColor: C.go, height: 30 }} />
      <span style={{ ...num, fontSize: 14, fontWeight: 600, minWidth: 74, textAlign: 'right' }}>
        {format ? format(value) : value.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * A stacked share bar.
 *
 * Segments carry a 2px surface gap so two adjacent fills never read as one, and
 * identity comes from the legend beside it rather than from colour alone.
 */
export function AllocationBar({ segments, total, height = 12 }: {
  segments: Array<{ label: string; units: number; color?: string }>;
  total: number; height?: number;
}) {
  const denom = Math.max(1, total);
  return (
    <div style={{ display: 'flex', gap: 2, height, width: '100%', background: C.raised, borderRadius: 2, overflow: 'hidden' }}>
      {segments.map((seg, i) => seg.units > 0 && (
        <div key={seg.label} title={`${seg.label}: ${seg.units.toLocaleString()}`}
          style={{ width: `${(seg.units / denom) * 100}%`, background: seg.color ?? seriesColor(i) }} />
      ))}
    </div>
  );
}

/** The legend that makes an `AllocationBar` or a `Chart` readable without colour. */
export function Legend({ items }: { items: Array<{ label: string; color: string; value?: ReactNode }> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 13px', padding: '8px 14px' }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.ink3 }}>{it.label}</span>
          {it.value != null && <span style={{ ...num, fontSize: 11, color: C.muted }}>{it.value}</span>}
        </div>
      ))}
    </div>
  );
}
