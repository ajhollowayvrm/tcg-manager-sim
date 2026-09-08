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
        <button onClick={onBack} aria-label="Back" style={{
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
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', height: 52, border: go ? 'none' : `1px solid ${C.border}`,
      background: disabled ? C.raised : go ? C.go : 'transparent',
      color: disabled ? C.dim : go ? C.onAccent : C.ink,
      fontFamily: SANS, fontSize: 15, fontWeight: 600, borderRadius: 2,
      cursor: disabled ? 'default' : 'pointer',
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
      <button style={box} onClick={() => onChange(Math.max(min, value - step))} aria-label="Less">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <div style={{
        flexGrow: 1, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 2,
        ...num, fontSize: 19, fontWeight: 600,
      }}>{value.toLocaleString()}</div>
      <button style={box} onClick={() => onChange(Math.min(max, value + step))} aria-label="More">
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
