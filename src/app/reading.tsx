/**
 * The display-tier contract, in one component.
 *
 * `docs/screens-audit.md` rule 1: a screen never renders `truth.*`. It renders a
 * `Reading` — the same number wearing the error the studio has not paid to
 * remove — and `Reading.display` says how sharp a number the UI is ALLOWED to
 * print. Prose at tier 0, then an adjective, then a band, and only at tier 3 a
 * bare figure, and even then the noisy one.
 *
 * **That is a rendering contract, not a hint.** It is how CONCEPT.md §11's "the
 * reading firms up as the studio invests" reaches the screen, and printing the
 * figure at tier 0 deletes the whole progression tree, because every tier in it
 * buys error reduction and nothing else.
 *
 * Every screen goes through here so the rule is enforced in ONE place. A screen
 * that formats a `Reading` itself is a bug, even when it happens to be right
 * today.
 */
import type { ReactNode } from 'react';
import type { Reading } from '../sim/readings.ts';
import { C, MONO, num, RADIUS_SM } from './ui.tsx';

/** Words for each rung of a 0..100 reading. Supplied per subject. */
export interface Prose {
  /** Five bands, coldest first, for `display: 'prose'`. */
  bands: [string, string, string, string, string];
  /** Three words, coldest first, for `display: 'adjective'`. */
  words: [string, string, string];
}

export const AFFECTION_PROSE: Prose = {
  bands: [
    'Nobody knows them yet.',
    'A few people have noticed.',
    'Quietly liked.',
    "Everyone's second favourite.",
    'The reason they buy the box.',
  ],
  words: ['Cold.', 'Warm.', 'Hot.'],
};

export const DEMAND_PROSE: Prose = {
  bands: [
    'Nobody is waiting for this.',
    'A quiet launch.',
    'It will find its people.',
    'There is real appetite.',
    'They are already asking.',
  ],
  words: ['Thin.', 'Steady.', 'Hungry.'],
};

/** Cutting points on a 0..100 reading. Five bands, four cuts. */
const CUTS = [10, 25, 45, 68] as const;

function bandOf(v: number): number {
  let i = 0;
  for (const cut of CUTS) { if (v >= cut) i++; }
  return i;
}

/**
 * Renders a reading at exactly the sharpness the studio has bought.
 *
 * `format` is used only at `display: 'band'` and `'number'`, where a figure is
 * permitted at all. At the two lower tiers it is ignored on purpose.
 */
export function ReadingValue({ reading, prose, format, fallback = '—' }: {
  reading: Reading | null;
  prose: Prose;
  format?: (v: number) => string;
  fallback?: ReactNode;
}) {
  if (!reading) return <>{fallback}</>;
  const fmt = format ?? ((v: number) => v.toFixed(0));

  switch (reading.display) {
    case 'prose':
      return (
        <span style={{ fontStyle: 'italic', color: C.ink2 }}>
          {prose.bands[bandOf(reading.value)]}
        </span>
      );
    case 'adjective': {
      const w = reading.value < 25 ? 0 : reading.value < 55 ? 1 : 2;
      return <span style={{ color: C.ink2, fontWeight: 600 }}>{prose.words[w]}</span>;
    }
    case 'band':
      return (
        <span style={{ ...num, color: C.ink2 }}>
          {fmt(reading.low)} <span style={{ color: C.dim }}>to</span> {fmt(reading.high)}
        </span>
      );
    default:
      return <span style={{ ...num, color: C.ink, fontWeight: 600 }}>{fmt(reading.value)}</span>;
  }
}

/**
 * How much of the error the studio has bought off, as a bar.
 *
 * `Reading.confidence` can never reach 1 — `readings.residualSigma` is the floor
 * and it is the sentence in CONCEPT.md §6.1 that says the reading is never
 * exact. The bar must therefore never render full, and labelling it "certainty"
 * would be a lie.
 */
export function Confidence({ reading }: { reading: Reading | null }) {
  if (!reading) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 40, height: 3, background: C.rule, borderRadius: RADIUS_SM, overflow: 'hidden' }}>
        <div style={{ width: `${reading.confidence * 100}%`, height: '100%', background: C.note }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', color: C.dim }}>
        {Math.round(reading.confidence * 100)}% BOUGHT
      </span>
    </div>
  );
}
