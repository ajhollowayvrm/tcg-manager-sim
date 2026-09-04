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
  p90CardPrice: number;
  p99CardPrice: number;
  maxCardPrice: number;
  topSealedPrice: number;
  flopRate: number;
  fatigue: number;
  brandStanding: number;
  /** Channels the publisher can still ship to at the end of the run. */
  channelsUnlocked: number;
  /** How many times a channel soured all the way out. */
  channelsLost: number;
  /** Lowest relationship across the channels still open. */
  worstRelationship: number;
  /** Share of every printed unit that actually reached a buyer. */
  avgSellThrough: number;

  /** Drops that ran at all. Zero means the run never opened a direct store. */
  dropsRun: number;
  /** Share of those drops whose queue cleared the stock. */
  dropSellOutRate: number;
  /** Share of every unit sold through a drop that a scalper took. */
  scalperShareOfDrops: number;
  /** Widest resale premium over MSRP any drop was camped for. */
  peakDropPremium: number;
  /** Scalper population at the end of the run. Starts at 500. */
  scalperPopulation: number;
  /** Boom-to-bust crossings. Zero means the population never cycled at all. */
  scalperCycles: number;
  /** Population at the widest point of any cycle, read off the crash events. */
  peakScalpers: number;

  /** Mean hype a set carried into its launch. Zero means the run ran no campaigns. */
  avgHypeAtRelease: number;
  /** Total marketing outlay, in dollars. */
  marketingTotal: number;
  prereleasesHosted: number;
  /**
   * Correlation between the reveal-window signal and the set's true chase at
   * release. This is the number the whole reveal window lives or dies on: near
   * 1 means the signal gives the answer away and the blind bet is solved, near
   * 0 means it is noise the player should ignore. It wants to be in between,
   * and it should rise with the number of previews the campaign ran.
   */
  signalCorrelation: number;
}

/** Pearson r. Returns 0 rather than NaN for a degenerate sample. */
function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const d = Math.sqrt(sxx * syy);
  return d > 0 ? sxy / d : 0;
}

const dollars = (cents: number) => cents / 100;

export function computeMetrics(s: SimState, bot: string, _years: number): RunMetrics {
  const pub = s.publishers[s.playerId]!;
  const printings = Object.values(s.printings);
  const prices = printings.map(p => dollars(p.market.rawPrice)).sort((a, b) => a - b);

  const quantile = (q: number) =>
    prices.length ? prices[Math.min(prices.length - 1, Math.floor(prices.length * q))]! : 0;
  const median = quantile(0.5);
  const max = prices.length ? prices[prices.length - 1]! : 0;

  const base = dollars(s.config.value.baseCardPrice);
  const topMultiple = base > 0 ? max / base : 0;

  const total = prices.reduce((a, b) => a + b, 0);
  const topCount = Math.max(1, Math.ceil(prices.length * 0.01));
  const topSum = prices.slice(-topCount).reduce((a, b) => a + b, 0);
  const top1PctShare = total > 0 ? topSum / total : 0;

  // A common/uncommon that broke out well past its rarity's expected ceiling —
  // value that was emergent, not authored by rarity placement. CONCEPT.md §10
  // sets the bar at 100x; the rarity filter is the "not a planned chase" half.
  const GRAIL_MULTIPLE = 100;
  let surpriseGrail = false;
  for (const pr of printings) {
    const card = s.cards[pr.cardId];
    if (!card) continue;
    if (
      (card.rarity === 'common' || card.rarity === 'uncommon') &&
      base > 0 &&
      dollars(pr.market.rawPrice) / base >= GRAIL_MULTIPLE
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

  const openChannels = pub.unlocks.channels
    .map(id => s.channels[id])
    .filter(ch => !!ch && ch.unlocked);
  const channelsLost = s.events.filter(e => e.kind === 'channelLost').length;
  const worstRelationship = openChannels.length
    ? Math.min(...openChannels.map(ch => ch!.relationship))
    : 0;

  const printedTotal = products.reduce((n, p) => n + p.unitsPrinted, 0);
  const soldTotal = products.reduce((n, p) => n + (p.unitsPrinted - p.unitsRemaining), 0);
  const avgSellThrough = printedTotal > 0 ? soldTotal / printedTotal : 0;

  // Drops are read off the event log, not off `s.drops`: completed drops are
  // pruned as feed history, and a 50-year run would lose most of them.
  const dropEvents = s.events.filter(e => e.kind === 'dropSoldOut' || e.kind === 'dropUndersold');
  const dropsRun = dropEvents.length;
  const dropSoldOut = s.events.filter(e => e.kind === 'dropSoldOut').length;
  const dropUnits = dropEvents.reduce((n, e) => n + Number(e.data.sold ?? 0), 0);
  const dropScalperUnits = dropEvents.reduce(
    (n, e) => n + Number(e.data.sold ?? 0) * Number(e.data.scalperShare ?? 0), 0);
  const peakDropPremium = dropEvents.reduce((n, e) => Math.max(n, Number(e.data.premium ?? 0)), 0);

  // The population's shape, not just where it stopped. A crash fires on the
  // boom-to-bust crossing, which is where the population is widest, so the
  // crash events are the cycle peaks. No crashes at all means a flat line —
  // either pinned at the floor or pinned at the cap, both of them dead.
  const crashes = s.events.filter(e => e.kind === 'scalperCrash');
  const peakScalpers = crashes.reduce((n, e) => Math.max(n, Number(e.data.scalpers ?? 0)), 0);

  // The reveal window. `hype.signal` stops updating at release, so what is on
  // the set at the end of the run is the read the player actually had.
  const releasedSets = Object.values(s.sets).filter(set => set.hype && set.performance);
  const hypeAtRelease = releasedSets
    .map(set => set.hype!.levelAtRelease)
    .filter((v): v is number => v !== null);
  const marketingTotal = dollars(
    pub.ledger.filter(e => e.category === 'marketing').reduce((n, e) => n - e.amount, 0));
  const prereleasesHosted = releasedSets.reduce((n, set) => n + set.hype!.prereleases, 0);

  // Scored against `chaseIndex`, the truth the signal is a measurement of and
  // which `releaseSet` freezes at launch. Scoring it against sell-through
  // instead measures the economy's variance, not the signal's accuracy, and in
  // a run where every set sells through it returns noise whatever the signal did.
  const signalPairs = releasedSets.filter(set => set.hype!.cardsRevealed > 0);
  const signalCorrelation = correlation(
    signalPairs.map(set => set.hype!.signal),
    signalPairs.map(set => set.performance!.chaseIndex),
  );

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
    p90CardPrice: quantile(0.9),
    p99CardPrice: quantile(0.99),
    maxCardPrice: max,
    topSealedPrice,
    flopRate,
    fatigue: fatigueAvg,
    brandStanding: pub.brandStanding,
    channelsUnlocked: openChannels.length,
    channelsLost,
    worstRelationship,
    avgSellThrough,
    dropsRun,
    dropSellOutRate: dropsRun > 0 ? dropSoldOut / dropsRun : 0,
    scalperShareOfDrops: dropUnits > 0 ? dropScalperUnits / dropUnits : 0,
    peakDropPremium,
    scalperPopulation: s.audience.actors.scalpers,
    scalperCycles: crashes.length,
    peakScalpers,
    avgHypeAtRelease: hypeAtRelease.length
      ? hypeAtRelease.reduce((a, b) => a + b, 0) / hypeAtRelease.length : 0,
    marketingTotal,
    prereleasesHosted,
    signalCorrelation,
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
