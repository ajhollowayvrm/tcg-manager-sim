/**
 * Per-run balance metrics (CONCEPT.md §10 "Balance metrics to track") plus
 * CSV export for cross-seed / cross-bot comparison.
 */
import type { SimState } from '../src/sim/types.ts';

export interface RunMetrics {
  bot: string;
  seed: string;
  survived: boolean;
  deathYear: number | null;
  surpriseGrail: boolean;
  topMultiple: number;
  top1PctShare: number;
  yearsToFirst100Dollar: number | null;
  medianCardPrice: number;
  maxCardPrice: number;
  topSealedPrice: number;
  flopRate: number;
  fatigue: number;
  brandStanding: number;
}

const dollars = (cents: number) => cents / 100;

export function computeMetrics(s: SimState, bot: string, _years: number): RunMetrics {
  const pub = s.publishers[s.playerId]!;
  const printings = Object.values(s.printings);
  const prices = printings.map(p => dollars(p.market.rawPrice)).sort((a, b) => a - b);

  const median = prices.length ? prices[Math.floor(prices.length / 2)]! : 0;
  const max = prices.length ? prices[prices.length - 1]! : 0;

  const base = dollars(s.config.value.baseCardPrice);
  const topMultiple = base > 0 ? max / base : 0;

  const total = prices.reduce((a, b) => a + b, 0);
  const topCount = Math.max(1, Math.ceil(prices.length * 0.01));
  const topSum = prices.slice(-topCount).reduce((a, b) => a + b, 0);
  const top1PctShare = total > 0 ? topSum / total : 0;

  // A common/uncommon that broke out well past its rarity's expected ceiling —
  // value that was emergent, not authored by rarity placement.
  let surpriseGrail = false;
  for (const pr of printings) {
    const card = s.cards[pr.cardId];
    if (!card) continue;
    if (
      (card.rarity === 'common' || card.rarity === 'uncommon') &&
      base > 0 &&
      dollars(pr.market.rawPrice) / base >= 20
    ) {
      surpriseGrail = true;
      break;
    }
  }

  let firstHundredTick: number | null = null;
  for (const pr of printings) {
    for (const pt of pr.market.rawHistory.points) {
      if (dollars(pt.v) >= 100) {
        if (firstHundredTick === null || (pt.t as number) < firstHundredTick) firstHundredTick = pt.t as number;
        break;
      }
    }
  }

  const sealedPrices = Object.values(s.products).map(p => dollars(p.market.price));
  const topSealedPrice = sealedPrices.length ? Math.max(...sealedPrices) : 0;

  // engine.ts never populates CardSet.performance, so flops are inferred from
  // sell-through instead: most of the print run still sitting unsold.
  const products = Object.values(s.products);
  const flopRate = products.length
    ? products.filter(p => p.unitsPrinted > 0 && p.unitsRemaining / p.unitsPrinted > 0.5).length / products.length
    : 0;

  const segments = Object.values(s.audience.segments);
  const fatigueAvg = segments.length
    ? segments.reduce((n, seg) => n + seg.fatigue, 0) / segments.length
    : 0;

  return {
    bot,
    seed: s.seed,
    survived: pub.deadTick === null,
    deathYear: pub.deadTick !== null ? (pub.deadTick as number) / 52 : null,
    surpriseGrail,
    topMultiple,
    top1PctShare,
    yearsToFirst100Dollar: firstHundredTick !== null ? firstHundredTick / 52 : null,
    medianCardPrice: median,
    maxCardPrice: max,
    topSealedPrice,
    flopRate,
    fatigue: fatigueAvg,
    brandStanding: pub.brandStanding,
  };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const str = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
  return lines.join('\n') + '\n';
}
