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

  /** Copies sitting in slabs at the end of the run. */
  gradedCopies: number;
  /**
   * Share of the opened copies that got graded, counted only over printings
   * anybody submitted at all. Against the whole population this is a number
   * about bulk commons — most printings never clear the grading fee, which is
   * the point of the fee.
   */
  gradedShare: number;
  /** Share of all printings carrying a pop report. */
  gradedPrintingShare: number;
  /** Share of graded copies that came back a 10. Print quality is what moves this. */
  gemRate: number;
  /**
   * Median premium a 10 carries over the same printing's raw price. This is
   * the number the grading layer lives on: too low and nobody would submit,
   * too high and raw prices stop meaning anything.
   */
  gem10Premium: number;
  /** Printings with any pop report at all. Grading is meant to be a minority of them. */
  printingsGraded: number;
  /** Graders taking submissions at the end of the run. The third is brand-gated. */
  gradersActive: number;
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

  // Grading. Read off the pop reports rather than the event log: unlike drops,
  // a pop report is cumulative state that nothing prunes.
  let gradedCopies = 0, gems = 0, openedGraded = 0, printingsGraded = 0;
  const gemPremiums: number[] = [];
  for (const pr of printings) {
    let onThis = 0;
    for (const [gid, byTier] of Object.entries(pr.population.graded)) {
      for (const [tier, count] of Object.entries(byTier)) {
        onThis += count ?? 0;
        if (tier === '10') gems += count ?? 0;
      }
      const tenPrice = pr.market.gradedPrices[gid as keyof typeof pr.market.gradedPrices]?.['10'];
      if (tenPrice && pr.market.rawPrice > 0) gemPremiums.push(tenPrice / pr.market.rawPrice);
    }
    gradedCopies += onThis;
    if (onThis > 0) { printingsGraded += 1; openedGraded += pr.population.opened; }
  }
  gemPremiums.sort((a, b) => a - b);
  const gem10Premium = gemPremiums.length ? gemPremiums[Math.floor(gemPremiums.length / 2)]! : 0;
  const gradersActive = Object.values(s.graders)
    .filter(g => (g.activeFromTick as number) <= (s.tick as number)).length;

  const segments = Object.values(s.audience.segments);
  const fatigueAvg = segments.length
    ? segments.reduce((n, seg) => n + seg.fatigue, 0) / segments.length
    : 0;

  // The art pipeline. Spend comes off the ledger rather than the queue: a
  // commission that missed its release was still paid for, and pretending
  // otherwise would flatter every strategy that misses the calendar.
  const artSpend = pub.ledger
    .filter(e => e.category === 'art_commission' || e.category === 'staff')
    .reduce((n, e) => n - e.amount, 0) / 100;
  const playerCards = Object.values(s.cards).filter(c => c.publisherId === pub.id);
  const housed = playerCards.filter(c => c.artSource === 'house').length;
  const commissioned = playerCards.filter(c => c.artSource === 'commissioned');
  const usedArtistIds = new Set<string>(playerCards.map(c => c.artistId as string));
  const usedArtists = Object.values(s.artists).filter(a => usedArtistIds.has(a.id as string));
  // Reputation now against reputation when this studio first commissioned them.
  // The event log is what remembers who was an unknown at the time, which is
  // the whole scouting bet.
  const firstSeen = new Map<string, number>();
  for (const e of s.events) {
    if (e.kind !== 'artCommissioned') continue;
    const aid = e.refs.artistId;
    if (aid && !firstSeen.has(aid)) firstSeen.set(aid, Number(e.data.reputationAtCommission ?? 0));
  }
  let gained = 0;
  for (const a of usedArtists) gained += a.reputation - (firstSeen.get(a.id as string) ?? a.reputation);
  const artistReputationGained = usedArtists.length > 0 ? gained / usedArtists.length : 0;

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
    gradedCopies,
    gradedShare: openedGraded > 0 ? gradedCopies / openedGraded : 0,
    gradedPrintingShare: printings.length > 0 ? printingsGraded / printings.length : 0,
    gemRate: gradedCopies > 0 ? gems / gradedCopies : 0,
    gem10Premium,
    printingsGraded,
    gradersActive,
    artSpend,
    houseArtShare: playerCards.length > 0 ? housed / playerCards.length : 0,
    meanArtQuality: commissioned.length > 0
      ? commissioned.reduce((n, c) => n + c.artQuality, 0) / commissioned.length : 0,
    meanArtistReputation: usedArtists.length > 0
      ? usedArtists.reduce((n, a) => n + a.reputation, 0) / usedArtists.length : 0,
    artistReputationGained,
    artistsRetained: Object.keys(pub.retainers).length,
    rosterSize: Object.values(s.artists).filter(a => a.available).length,
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
