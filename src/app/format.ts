/**
 * Number and date formatting, shared by every screen.
 *
 * `App.tsx` carried private copies of `money` and `yearOf` while it was one
 * file. Screens are separate files now, so the copies became a drift risk: two
 * screens rounding cents differently is the kind of defect nobody reports and
 * everybody notices.
 *
 * Nothing here reads `truth.*` and nothing here draws RNG. These are pure
 * functions of their arguments.
 */
import type { SimState, Cents, Tick } from '../sim/types.ts';

/** Cents to whole dollars, grouped. The model is cents everywhere. */
export function money(cents: number): string {
  return Math.round(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Cents to dollars with two places. Use for a unit cost, never for a balance. */
export function moneyExact(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/**
 * A large figure shortened for a stat tile.
 *
 * A studio's cash reaches nine figures by year 50, and a tile that wraps is
 * worse than a tile that rounds.
 */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/** Cash in the header, where the full figure does not fit. */
export function moneyCompact(cents: number): string {
  return compact(Math.round(cents / 100));
}

export function yearOf(s: SimState, t: number): number {
  return s.config.startYear + Math.floor(t / 52);
}

/** The week inside its year, 0-51. The tick is absolute; this is not. */
export function weekOf(t: number): number {
  return ((t % 52) + 52) % 52;
}

/** "W07 · 2031". The one date format the whole app uses. */
export function stamp(s: SimState, t: number): string {
  return `W${String(weekOf(t)).padStart(2, '0')} · ${yearOf(s, t)}`;
}

/** How long until a tick, in the coarsest honest unit. */
export function untilText(now: Tick, then: Tick): string {
  const w = (then as number) - (now as number);
  if (w <= 0) return 'now';
  if (w < 8) return `${w}w`;
  if (w < 104) return `${Math.round(w / 4.34)}mo`;
  return `${(w / 52).toFixed(1)}y`;
}

export function pct(x: number, places = 0): string {
  return `${(x * 100).toFixed(places)}%`;
}

/**
 * A pull rate as a player reads it.
 *
 * Above one copy a pack it is a per-pack figure; below, it is odds. Printing
 * "0.0003/pk" tells a player nothing, and "1 in 3,333" tells them everything.
 */
export function oddsText(perPack: number): string {
  if (perPack <= 0) return '—';
  if (perPack >= 1) return `${perPack.toFixed(1)}/pk`;
  return `1 in ${Math.round(1 / perPack).toLocaleString()}`;
}

/** Cents, guarded so a `Cents` value survives arithmetic that widened it. */
export const asCents = (n: number): Cents => Math.round(n) as Cents;
