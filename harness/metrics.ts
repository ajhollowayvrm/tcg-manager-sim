/**
 * Per-run balance metrics (CONCEPT.md §10 "Balance metrics to track") plus
 * CSV export for cross-seed / cross-bot comparison.
 */
import type { SimState, RegionId } from '../src/sim/types.ts';
import { setFit } from '../src/sim/regions.ts';
import { collectorHeldShare } from '../src/sim/actors.ts';
import { globalAverages, engagedTotal, lapsedIn } from '../src/sim/audience.ts';

export interface RunMetrics {
  bot: string;
  seed: string;
  survived: boolean;
  deathYear: number | null;
  /**
   * Which of CONCEPT.md §7's death routes actually fired. Empty for a survivor.
   * The publisher has carried this since the engine was written; nothing
   * reported it, so "four of the five routes are unreachable" was invisible.
   */
  deathCause: string;

  /**
   * Cash, less debt, plus unsold stock at what it cost to print. Inventory is
   * an asset at cost, so a publisher that printed a warehouse it cannot sell
   * still books it here — which is why `unsoldUnits` sits beside it. Read the
   * two together: net worth alone cannot tell a full warehouse from a full bank.
   */
  netWorth: number;
  /** Cash less debt. Net worth with the warehouse taken out of it. */
  liquidNetWorth: number;
  /** The widest the debt ever got, not where it ended. */
  peakDebt: number;
  /** Unsold units at the end of the run, across every product. */
  unsoldUnits: number;
  /** What that stock cost to print. The overprint half of `netWorth`. */
  inventoryValue: number;
  /**
   * Units printed across the run divided by the number of print runs. The bet
   * the game is about is how big to print, and a bot roster where every bot
   * prints the same fixed number never makes it.
   */
  meanPrintRun: number;
  surpriseGrail: boolean;
  topMultiple: number;
  top1PctShare: number;
  yearsToFirst100Dollar: number | null;
  medianCardPrice: number;
  p90CardPrice: number;
  p99CardPrice: number;
  maxCardPrice: number;
  topSealedPrice: number;
  /** Null when no set has had a year on the market to be judged. */
  flopRate: number | null;
  /** Sets old enough to judge. `flopRate`'s denominator. */
  flopSetsJudged: number;
  /** The old sell-through proxy, kept one round so the change is visible. */
  flopRateSellThrough: number | null;
  fatigue: number;
  brandStanding: number;
  /** Channels the publisher can still ship to at the end of the run. */
  channelsUnlocked: number;
  /** How many times a channel soured all the way out. */
  channelsLost: number;
  /** Lowest relationship across the channels still open. */
  worstRelationship: number | null;
  /** Channels still open at the end. Reads `worstRelationship`'s null. */
  channelsOpenAtEnd: number;
  /** Share of every printed unit that actually reached a buyer. */
  avgSellThrough: number | null;

  /** Drops that ran at all. Zero means the run never opened a direct store. */
  dropsRun: number;
  /** Share of those drops whose queue cleared the stock. */
  dropSellOutRate: number | null;
  /** Share of every unit sold through a drop that a scalper took. */
  scalperShareOfDrops: number | null;
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
  signalCorrelation: number | null;
  /** Sets carrying both a signal and a truth. `signalCorrelation`'s sample. */
  signalPairs: number;

  /** Copies sitting in slabs at the end of the run. */
  gradedCopies: number;
  /**
   * Share of the opened copies that got graded, counted only over printings
   * anybody submitted at all. Against the whole population this is a number
   * about bulk commons — most printings never clear the grading fee, which is
   * the point of the fee.
   */
  gradedShare: number | null;
  /** Share of all printings carrying a pop report. */
  gradedPrintingShare: number;
  /** Share of graded copies that came back a 10. Print quality is what moves this. */
  gemRate: number | null;
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

  /** Art commissions and standing arrangements, in dollars. */
  artSpend: number;
  /** Share of the studio's cards that shipped with house filler art. */
  houseArtShare: number;
  /** Mean `artQuality` across the cards that got a real commission. */
  meanArtQuality: number;
  /** Mean reputation of the artists this studio actually used. */
  meanArtistReputation: number;
  /**
   * Reputation those artists gained since this studio first commissioned them.
   * The scouting bet is measured here: buying low should gain more of this and
   * still lose about half the seeds on top card.
   */
  artistReputationGained: number;
  artistsRetained: number;
  /** Artists on the board at the end of the run. The roster drifts. */
  rosterSize: number;

  /** Regions the publisher has opened, including the home market. */
  regionsOpen: number;
  /** Cash paid at the doors of those regions, in dollars. */
  regionUnlockSpend: number;
  /** Mean `knowledge` across the opened regions. Zero on a home-market-only run. */
  regionKnowledge: number;
  /** Share of units sold that went to a market other than the home one. */
  exportShare: number;
  /**
   * Correlation between what a region reading said a set was worth and what it
   * was actually worth. This is the region half of the same question the reveal
   * window asks: a reading nobody can score is a reading nobody can tune, and
   * one that is always right makes market entry arithmetic.
   */
  regionReadingCorrelation: number | null;
  /** Region readings scored against truth. The correlation's sample. */
  regionReadingPairs: number;

  /** Collector population at the end of the run. The stable floor. */
  collectors: number;
  /** Share of opened copies sitting in collections rather than on the market. */
  collectorHeldShare: number;
  /** Reseller population. Rip-and-ship follows whether ripping pays. */
  resellers: number;
  /** Speculator population. This one is meant to swing. */
  speculators: number;
  /** Widest over narrowest the speculator population got. Null if never sampled. */
  speculatorSwing: number | null;
  speculatorMin: number;
  speculatorMax: number;
  /**
   * Mean `SetPerformance.aftermarketIndex` across released sets — how the sets
   * did as cards rather than as product. It was written as 0 and read by
   * nothing before this pass.
   */
  aftermarketIndex: number;

  /** Collab offers that arrived across the run. */
  collabOffers: number;
  /** Offers signed. */
  collabsSigned: number;
  /** Licence fees paid, in dollars. */
  collabSpend: number;
  /**
   * Mean IP affection at the end of the run. The collab trade is reach now
   * against equity later, and this is the equity half — a studio that lives on
   * collabs should sell well and own little.
   */
  meanIpAffection: number;

  /** Times a named creator covered any printing. */
  creatorCoverage: number;
  /**
   * Share of printings that got any coverage at all. Replaces `creatorOwnShare`,
   * which was 1.0 by construction once rivals were cut: every card in the world
   * is the player's, so the filter could never exclude anything.
   */
  creatorCoverageShareOfPrintings: number;
  /** Best relationship with any creator at the end of the run. */
  bestCreatorRelationship: number;

  /** Collectible chains built. */
  chains: number;
  /** Share of them that span more than one set — the cross-set hedge. */
  chainsSpanningSets: number;
  /** Mean printed members per chain. */
  meanChainLength: number;

  // ---- Per-set price shape, measured at age 2 -----------------------------
  // These are the columns the real-world targets are stated against. Every
  // one is a median across the sets this run snapshotted, so a single freak
  // set cannot carry the number. See docs/tuning/03-targets.md.
  /**
   * Mean print run by decade of the run. The growth arc is only visible as a
   * curve: a single mean over fifty years says nothing about whether the studio
   * grew or merely printed a lot once.
   */
  meanPrintRunByDecade1: number | null;
  meanPrintRunByDecade2: number | null;
  meanPrintRunByDecade3: number | null;
  meanPrintRunByDecade4: number | null;
  meanPrintRunByDecade5: number | null;
  /** Engaged audience at the end of the run, across every open region. */
  engagedAudience: number;
  /** Reached but not currently active, in the home market. The lapsed reservoir. */
  lapsedHome: number;
  /** Sets that reached at least one snapshot age. */
  setsSnapshotted: number;
  /**
   * Sets that reached age 2 with a non-empty price vector. **Zero makes every
   * `...Age2` column below meaningless** — a studio that died in year two has
   * no two-year-old sets, and 0.00 must not be read as a measurement.
   */
  setsAtAge2: number;
  setMedianAge2: number | null;
  setShareUnder1Age2: number | null;
  setShareUnder25cAge2: number | null;
  setTop1ShareAge2: number | null;
  setTop10ShareAge2: number | null;
  setGiniAge2: number | null;
  setChaseOverMedianAge2: number | null;
  setTailAlphaAge2: number | null;
}

/**
 * Pearson r, or `null` for a sample too small to have one.
 *
 * Null rather than 0. Zero is a real answer here — it is "the signal is pure
 * noise", the exact failure state the reveal window exists to avoid — so
 * returning it for "there was nothing to correlate" hides the difference
 * between a broken signal and an unmeasured one.
 */
function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const d = Math.sqrt(sxx * syy);
  return d > 0 ? sxy / d : null;
}


// ---------------------------------------------------------------------------
// Price vector statistics
//
// These describe ONE set's price list at ONE age, which is the shape the
// real-world measurement in docs/tuning/05-real-world.md reports. The
// whole-catalogue statistics further down answer a different question: they
// pool every printing the studio ever made, across fifty years, so a year-1
// common sits in the same vector as a year-50 common. Both are useful. Only
// this one is comparable to a Scryfall set list.
// ---------------------------------------------------------------------------

export interface PriceVectorStats {
  /** Cards in the vector. */
  n: number;
  median: number;
  /** Bulk share. The measured band for a modern set is 0.64-0.92. */
  shareUnder1: number;
  shareUnder25c: number;
  /** Value concentration. Measured: top 1% holds ~0.35, top 10% holds ~0.78. */
  top1Share: number;
  top10Share: number;
  /** Gini of the price vector. Measured central value 0.85. */
  gini: number;
  /** Chase card over median card. Measured central value ~1000x. */
  chaseOverMedian: number;
  /**
   * Hill tail index over the top decile. Measured 1.6-2.7, central 2.0.
   * An index near 2 means the mean is finite and the variance is not, which is
   * why a set's total value is hostage to two to five cards.
   */
  tailAlpha: number;
}

const EMPTY_STATS: PriceVectorStats = {
  n: 0, median: 0, shareUnder1: 0, shareUnder25c: 0, top1Share: 0,
  top10Share: 0, gini: 0, chaseOverMedian: 0, tailAlpha: 0,
};

/** Statistics of one price vector, in dollars. The input is not mutated. */
export function priceVectorStats(pricesDollars: number[]): PriceVectorStats {
  const xs = pricesDollars.filter(Number.isFinite).slice().sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return { ...EMPTY_STATS };

  const at = (q: number) => xs[Math.min(n - 1, Math.floor(n * q))]!;
  const median = at(0.5);
  const max = xs[n - 1]!;
  const total = xs.reduce((a, b) => a + b, 0);

  const shareOfTop = (frac: number) => {
    if (total <= 0) return 0;
    const k = Math.max(1, Math.ceil(n * frac));
    let sum = 0;
    for (let i = n - k; i < n; i++) sum += xs[i]!;
    return sum / total;
  };

  // Gini over a sorted ascending vector. Zero-priced entries are legal here
  // and contribute nothing, which is the correct behaviour for a free card.
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * xs[i]!;
  const gini = total > 0 ? (2 * weighted) / (n * total) - (n + 1) / n : 0;

  // Hill estimator over the top decile. It needs at least two points above a
  // strictly positive threshold, or the logarithm is undefined.
  let tailAlpha = 0;
  const k = Math.floor(n * 0.1);
  if (k >= 2) {
    const threshold = xs[n - k - 1] ?? 0;
    if (threshold > 0) {
      let sumLogs = 0;
      for (let i = n - k; i < n; i++) sumLogs += Math.log(xs[i]! / threshold);
      if (sumLogs > 0) tailAlpha = 1 + k / sumLogs;
    }
  }

  return {
    n,
    median,
    shareUnder1: xs.filter(x => x < 1).length / n,
    shareUnder25c: xs.filter(x => x < 0.25).length / n,
    top1Share: shareOfTop(0.01),
    top10Share: shareOfTop(0.10),
    gini,
    chaseOverMedian: median > 0 ? max / median : 0,
    tailAlpha,
  };
}

/** One set, priced at one age. A row of `out/sets.csv`. */
export interface SetSnapshot extends PriceVectorStats {
  bot: string;
  seed: string;
  setId: string;
  /** Set age in years at the moment of the snapshot. */
  ageYears: number;
  releaseTick: number;
}

/** What the tick loop observed that end-of-run state cannot reconstruct. */
export interface RunExtras {
  snapshots: SetSnapshot[];
  /** Speculator population range, sampled every tick. */
  speculatorMin: number;
  speculatorMax: number;
  speculatorSamples: number;
}

const dollars = (cents: number) => cents / 100;

export function computeMetrics(
  s: SimState, bot: string, _years: number, extras: RunExtras,
): RunMetrics {
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

  const products = Object.values(s.products);
  // The old proxy: most of the print run still sitting unsold. Kept for one
  // round beside the economic definition, so the change in the number is
  // visible rather than silent.
  const flopRateSellThrough = products.length
    ? products.filter(p => p.unitsPrinted > 0 && p.unitsRemaining / p.unitsPrinted > 0.5).length / products.length
    : null;

  // A flop is a set that did not make its print run back. `CardSet.performance`
  // is populated at release and `actualCost` at commit, so this is a real
  // profit-and-loss test rather than an inventory one. Only sets with a year on
  // the market are judged: a set released last month has not had its chance.
  let judgedSets = 0;
  let floppedSets = 0;
  for (const set of Object.values(s.sets)) {
    const perf = set.performance;
    if (!perf) continue;
    const sched = set.regionSchedule[0];
    if (!sched || (s.tick as number) - (sched.releaseTick as number) < 52) continue;
    judgedSets++;
    if (perf.revenue < set.actualCost) floppedSets++;
  }
  const flopRate = judgedSets > 0 ? floppedSets / judgedSets : null;

  const openChannels = pub.unlocks.channels
    .map(id => s.channels[id])
    .filter(ch => !!ch && ch.unlocked);
  const channelsLost = s.events.filter(e => e.kind === 'channelLost').length;
  // Null, not zero. A studio with no channels left and a studio whose last
  // channel sits at zero are different outcomes, and 0 conflated them.
  const worstRelationship = openChannels.length
    ? Math.min(...openChannels.map(ch => ch!.relationship))
    : null;

  // Finance. Inventory is valued at cost, which is the conservative reading:
  // unsold stock is worth at most what it cost, and usually less.
  const unsoldUnits = products.reduce((n, p) => n + p.unitsRemaining, 0);
  const inventoryValue = dollars(products.reduce((n, p) => n + p.unitsRemaining * p.unitCogs, 0));
  const liquidNetWorth = dollars(pub.cash - pub.debt);
  const printRuns = products.filter(p => p.unitsPrinted > 0);
  const meanPrintRun = printRuns.length
    ? printRuns.reduce((n, p) => n + p.unitsPrinted, 0) / printRuns.length : 0;

  const printedTotal = products.reduce((n, p) => n + p.unitsPrinted, 0);
  const soldTotal = products.reduce((n, p) => n + (p.unitsPrinted - p.unitsRemaining), 0);
  const avgSellThrough = printedTotal > 0 ? soldTotal / printedTotal : null;

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
  const signalSets = releasedSets.filter(set => set.hype!.cardsRevealed > 0);
  const signalCorrelation = correlation(
    signalSets.map(set => set.hype!.signal),
    signalSets.map(set => set.performance!.chaseIndex),
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

  const fatigueAvg = globalAverages(s).fatigue;

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

  // Regions. `exportShare` is read off the products rather than the ledger:
  // sales are booked to the publisher, not to a market, so the region a unit
  // went to is only recoverable from the product it came off.
  const home = 'reg_us' as RegionId;
  const openRegions = pub.unlocks.regions.map(id => s.regions[id]).filter(Boolean);
  const regionUnlockSpend = pub.ledger
    .filter(e => e.category === 'unlock' && e.refId !== undefined
      && String(e.refId).startsWith('reg_'))
    .reduce((n, e) => n - e.amount, 0) / 100;
  const regionKnowledge = openRegions.length
    ? openRegions.reduce((n, r) => n + r!.knowledge, 0) / openRegions.length : 0;
  const exportUnits = products
    .filter(p => p.regionId !== home)
    .reduce((n, p) => n + (p.unitsPrinted - p.unitsRemaining), 0);
  const exportShare = soldTotal > 0 ? exportUnits / soldTotal : 0;

  // Scored the same way the reveal signal is: what the reading said when the
  // bet was placed, against what the set turned out to be worth there.
  const readingPairs: Array<[number, number]> = [];
  for (const set of Object.values(s.sets)) {
    if (!set.regionReadings) continue;
    for (const [rid, predicted] of Object.entries(set.regionReadings)) {
      const region = s.regions[rid as RegionId];
      const product = set.productIds
        .map(pid => s.products[pid])
        .find(p => p && p.regionId === (rid as RegionId));
      if (!region || !product) continue;
      readingPairs.push([predicted, setFit(s, region, set, product)]);
    }
  }
  const regionReadingCorrelation = correlation(
    readingPairs.map(p => p[0]), readingPairs.map(p => p[1]),
  );

  // The secondary-market actors. The speculator swing is the one that says
  // whether the population is a population or a constant: read at the end of
  // the run it can only ever say where it stopped.
  // Sampled every tick by the runner, not read off the event log. The old
  // derivation defaulted to 1 below two events, so "never cycled" and "cycled
  // by a factor of one" were the same number.
  const speculatorSwing = extras.speculatorSamples >= 2 && extras.speculatorMin > 0
    ? extras.speculatorMax / extras.speculatorMin
    : null;
  const releasedWithPerf = Object.values(s.sets).filter(set => set.performance);
  const aftermarket = releasedWithPerf.length
    ? releasedWithPerf.reduce((n, set) => n + set.performance!.aftermarketIndex, 0)
      / releasedWithPerf.length : 0;

  const collabOffers = s.events.filter(e => e.kind === 'collabOffered').length;
  const collabsSigned = s.events.filter(e => e.kind === 'collabSigned').length;
  const collabSpend = pub.ledger
    .filter(e => e.category === 'licensing').reduce((n, e) => n - e.amount, 0) / 100;
  const allIps = Object.values(s.ips);
  const meanIpAffection = allIps.length
    ? allIps.reduce((n, ip) => n + ip.affection, 0) / allIps.length : 0;

  const coverage = s.events.filter(e => e.kind === 'creatorOpened');
  // How much of the catalogue coverage actually reaches. Whether it landed on
  // "our own" cards is not a question any more: they all are.
  const coveredPrintings = new Set<string>();
  for (const e of coverage) {
    if (e.refs.printingId) coveredPrintings.add(e.refs.printingId as string);
  }
  const creatorRels = Object.values(s.creators).map(c => c.relationship);

  const chains = Object.values(s.chains);
  const printedMembers = chains.map(
    c => c.cardIds.filter(cid => !!s.printingByCard[cid]).length);

  /** Mean units printed by products released in one decade of the run. */
  const printRunInDecade = (decade: number): number | null => {
    const lo = (decade - 1) * 520, hi = decade * 520;
    const runs: number[] = [];
    for (const p of Object.values(s.products)) {
      if (p.unitsPrinted <= 0) continue;
      const set = s.sets[p.setId];
      const sched = set?.regionSchedule.find(r => r.regionId === p.regionId)
        ?? set?.regionSchedule[0];
      if (!sched) continue;
      const t = sched.releaseTick as number;
      if (t >= lo && t < hi) runs.push(p.unitsPrinted);
    }
    return runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : null;
  };

  // Median across the age-2 snapshots. A median, not a mean: these statistics
  // are heavy-tailed across sets, and one runaway set would carry a mean.
  const age2Rows = extras.snapshots.filter(x => x.ageYears === 2 && x.n > 0);
  const age2 = (pick: (x: SetSnapshot) => number): number | null => {
    if (age2Rows.length === 0) return null;
    const v = age2Rows.map(pick).filter(Number.isFinite).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : null;
  };

  return {
    bot,
    seed: s.seed,
    survived: pub.deadTick === null,
    deathYear: pub.deadTick !== null ? (pub.deadTick as number) / 52 : null,
    deathCause: pub.deathCause ?? '',
    netWorth: liquidNetWorth + inventoryValue,
    liquidNetWorth,
    peakDebt: dollars(pub.peakDebt),
    unsoldUnits,
    inventoryValue,
    meanPrintRun,
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
    flopSetsJudged: judgedSets,
    flopRateSellThrough,
    fatigue: fatigueAvg,
    brandStanding: pub.brandStanding,
    channelsUnlocked: openChannels.length,
    channelsLost,
    worstRelationship,
    channelsOpenAtEnd: openChannels.length,
    avgSellThrough,
    dropsRun,
    dropSellOutRate: dropsRun > 0 ? dropSoldOut / dropsRun : null,
    scalperShareOfDrops: dropUnits > 0 ? dropScalperUnits / dropUnits : null,
    peakDropPremium,
    scalperPopulation: s.audience.actors.scalpers,
    scalperCycles: crashes.length,
    peakScalpers,
    avgHypeAtRelease: hypeAtRelease.length
      ? hypeAtRelease.reduce((a, b) => a + b, 0) / hypeAtRelease.length : 0,
    marketingTotal,
    prereleasesHosted,
    signalCorrelation,
    signalPairs: signalSets.length,
    gradedCopies,
    gradedShare: openedGraded > 0 ? gradedCopies / openedGraded : null,
    gradedPrintingShare: printings.length > 0 ? printingsGraded / printings.length : 0,
    gemRate: gradedCopies > 0 ? gems / gradedCopies : null,
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
    regionsOpen: openRegions.length,
    regionUnlockSpend,
    regionKnowledge,
    exportShare,
    regionReadingCorrelation,
    regionReadingPairs: readingPairs.length,
    collectors: s.audience.actors.collectors,
    collectorHeldShare: collectorHeldShare(s),
    resellers: s.audience.actors.resellers,
    speculators: s.audience.actors.speculators,
    speculatorSwing,
    speculatorMin: extras.speculatorMin,
    speculatorMax: extras.speculatorMax,
    aftermarketIndex: aftermarket,
    collabOffers,
    collabsSigned,
    collabSpend,
    meanIpAffection,
    creatorCoverage: coverage.length,
    creatorCoverageShareOfPrintings: printings.length > 0
      ? coveredPrintings.size / printings.length : 0,
    bestCreatorRelationship: creatorRels.length ? Math.max(...creatorRels) : 0,
    chains: chains.length,
    chainsSpanningSets: chains.length
      ? chains.filter(c => c.spansSets).length / chains.length : 0,
    meanChainLength: printedMembers.length
      ? printedMembers.reduce((a, b) => a + b, 0) / printedMembers.length : 0,

    meanPrintRunByDecade1: printRunInDecade(1),
    meanPrintRunByDecade2: printRunInDecade(2),
    meanPrintRunByDecade3: printRunInDecade(3),
    meanPrintRunByDecade4: printRunInDecade(4),
    meanPrintRunByDecade5: printRunInDecade(5),
    engagedAudience: Math.round(engagedTotal(s)),
    lapsedHome: Math.round(lapsedIn(s, s.homeRegionId)),
    setsSnapshotted: extras.snapshots.length,
    setsAtAge2: age2Rows.length,
    setMedianAge2: age2(x => x.median),
    setShareUnder1Age2: age2(x => x.shareUnder1),
    setShareUnder25cAge2: age2(x => x.shareUnder25c),
    setTop1ShareAge2: age2(x => x.top1Share),
    setTop10ShareAge2: age2(x => x.top10Share),
    setGiniAge2: age2(x => x.gini),
    setChaseOverMedianAge2: age2(x => x.chaseOverMedian),
    setTailAlphaAge2: age2(x => x.tailAlpha),
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
