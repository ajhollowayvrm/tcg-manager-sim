/**
 * What the player is allowed to know.
 *
 * `types.ts` has pointed at this file since the day `UnlockState.marketResearch`
 * was declared ("0..3 — drives how sharp affection and market readings are. See
 * readings.ts") and the file did not exist. This is it.
 *
 * CONCEPT.md §6.1 is the contract: character affection is a real simulated
 * number, displayed as a fuzzy band, and three investments narrow it — market
 * research per project, a community team across the roster, and an analytics
 * hire for market and price forecasting. "Even fully upgraded, the reading is
 * never exact. You can build a beautiful, expensive set around a character
 * nobody bonds with and eat the entire print run."
 *
 * ## Every function here is pure, and draws from no RNG stream
 *
 * This is the load-bearing decision in the file, and it is not a style choice.
 *
 * 1. **A UI renders a screen many times per state.** An observer that advances
 *    a stream would make looking at a number change the world, so the same
 *    screen would read differently on every repaint. `readRegion` had exactly
 *    this bug — it drew three-plus `gauss` calls from `regionRng` per call, so
 *    opening the region screen twice gave two answers and moved the run.
 * 2. **Replay is `seed` plus the decision log.** If a reading advanced a
 *    stream, how often the player opened a screen would become part of the
 *    save, and no replay would reproduce.
 * 3. It keeps this whole step behaviour-neutral for anything that does not call
 *    a reading, which is what lets it land without renumbering.
 *
 * The error is instead derived from a noise seed stored on the entity —
 * `IpEntity.truth.readingNoiseSeed` and `Region.truth.readingNoiseSeed`, both
 * of which were drawn at world creation and then read by nothing — combined
 * with a coarse time bucket, through a local PRNG that is created, used and
 * thrown away. Same inputs, same reading, every time; a different reading next
 * bucket, because a fresh look at a moving target is worth something.
 */
import type {
  SimState, IpId, IpKind, PrintingId, Rarity, RegionId, SetId, Unit,
} from './types.ts';
import { seedRng, gauss } from './rng.ts';

/** How a reading should be rendered. CONCEPT.md §11's four rungs. */
export type ReadingDisplay = 'prose' | 'adjective' | 'band' | 'number';

export interface Reading {
  /** The noisy point estimate. Never the truth, at any tier. */
  value: number;
  /** The band the truth is probably inside. Widest at tier 0. */
  low: number;
  high: number;
  /** 0..1. What the tiers bought, for a UI that wants to show it. */
  confidence: Unit;
  display: ReadingDisplay;
}

/**
 * A throwaway PRNG for one reading.
 *
 * `seedRng` is self-contained — it hashes the string and warms up on its own
 * state — so this advances nothing that anything else reads. The bucket is what
 * makes a reading stable while the player looks at it and fresh once the world
 * has moved on.
 */
function readingNoise(noiseSeed: number, bucket: number, salt: string, sigma: number): number {
  if (sigma <= 0) return 0;
  return gauss(seedRng(`${salt}:${noiseSeed}:${bucket}`), 0, sigma);
}

/**
 * The error a reading carries, given what the studio has bought.
 *
 * Multiplicative narrowing rather than additive: each tier takes a share of
 * what is left, so the third level of a tier is worth less than the first, and
 * no combination can reach zero. `residualSigma` is the floor, and it is the
 * sentence in CONCEPT.md §6.1 that says the reading is never exact.
 */
export function readingSigma(s: SimState, kind: 'affection' | 'market'): number {
  const cfg = s.config.readings;
  const u = s.publishers[s.playerId]?.unlocks;
  const max = Math.max(1, s.config.unlocks.maxLevel);
  const research = (u?.marketResearch ?? 0) / max;
  const community = (u?.communityTeam ?? 0) / max;
  const analytics = (u?.analytics ?? 0) / max;

  // Research and the community team sharpen how the audience FEELS; analytics
  // sharpens what the market DOES. That is CONCEPT.md §6.1's split, and it is
  // why the two kinds narrow differently.
  const narrowing = kind === 'affection'
    ? (1 - cfg.researchNarrowing * research) * (1 - cfg.communityNarrowing * community)
    : (1 - cfg.analyticsNarrowing * analytics) * (1 - cfg.researchNarrowing * research);
  return Math.max(cfg.residualSigma, cfg.baseSigma * narrowing);
}

/** 0..1, for display. 1 would be certainty, which the floor makes unreachable. */
function confidenceFrom(s: SimState, sigma: number): Unit {
  const base = s.config.readings.baseSigma;
  return Math.max(0, Math.min(1, 1 - sigma / Math.max(1e-9, base))) as Unit;
}

/**
 * How sharp a number the UI is allowed to print.
 *
 * CONCEPT.md §11 asks for the reading to firm up as the studio invests, rather
 * than for a number to appear from nowhere at some threshold. Prose at the
 * bottom, a bare number only at the top — and even then the number is the noisy
 * one, not the truth.
 */
export function displayTier(level: number): ReadingDisplay {
  if (level <= 0) return 'prose';
  if (level === 1) return 'adjective';
  if (level === 2) return 'band';
  return 'number';
}

function bucketOf(s: SimState): number {
  return Math.floor(s.tick / Math.max(1, s.config.readings.rereadWeeks));
}

function band(s: SimState, value: number, sigma: number, level: number): Reading {
  return {
    value,
    low: value * Math.exp(-sigma),
    high: value * Math.exp(sigma),
    confidence: confidenceFrom(s, sigma),
    display: displayTier(level),
  };
}

/**
 * What the studio thinks an IP's affection is.
 *
 * The truth is `IpEntity.affection`, which the value engine reads directly and
 * the player never sees. This is the vibe band: same number, wearing the error
 * the studio has not paid to remove.
 */
export function readAffection(s: SimState, ipId: IpId): Reading | null {
  const ip = s.ips[ipId];
  if (!ip) return null;
  const sigma = readingSigma(s, 'affection');
  const u = s.publishers[s.playerId]?.unlocks;
  const noise = readingNoise(ip.truth.readingNoiseSeed, bucketOf(s), 'affection', sigma);
  return band(s, Math.max(0, ip.affection * Math.exp(noise)), sigma,
    Math.max(u?.marketResearch ?? 0, u?.communityTeam ?? 0));
}

/**
 * What the studio thinks a set will sell, before it ships.
 *
 * Deliberately NOT the same instrument as `hype.signal`. The signal is a
 * measurement of chase that sharpens with previews and arrives after the print
 * run is locked; this is a pre-commit read of demand that sharpens with money.
 * A studio can have both, and they can disagree.
 */
export function forecastSetDemand(s: SimState, setId: SetId): Reading | null {
  const set = s.sets[setId];
  if (!set) return null;
  let truth = 0;
  for (const cardId of set.cardIds) {
    const ip = s.ips[s.cards[cardId]?.subjectIp ?? ('' as IpId)];
    if (ip) truth += ip.affection;
  }
  truth = set.cardIds.length > 0 ? truth / set.cardIds.length : 0;
  const sigma = readingSigma(s, 'market');
  const noise = readingNoise(set.cardIds.length + s.config.startYear, bucketOf(s), setId, sigma);
  return band(s, Math.max(0, truth * Math.exp(noise)), sigma,
    s.publishers[s.playerId]?.unlocks.analytics ?? 0);
}

/**
 * What the studio thinks a printing will be worth in `weeks`.
 *
 * The forecast is the current price carried forward on its own recent drift,
 * then blurred. It cannot see a shock coming, which is the point: analytics
 * buys a sharper view of the trend, never of the surprise.
 */
export function forecastPrice(s: SimState, printingId: PrintingId, weeks: number): Reading | null {
  const pr = s.printings[printingId];
  if (!pr) return null;
  const pts = pr.market.rawHistory.points;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const drift = last && prev && prev.v > 0 && last.t > prev.t
    ? Math.pow(last.v / prev.v, 1 / (last.t - prev.t)) : 1;
  const projected = pr.market.rawPrice * Math.pow(drift, Math.max(0, weeks));
  // The further out, the wider. A forecast that is as sharp at five years as at
  // five weeks is not a forecast.
  const sigma = readingSigma(s, 'market')
    * (1 + weeks / Math.max(1, s.config.readings.forecastHorizonWeeks));
  const noise = readingNoise(pr.truth.chase * 1e6, bucketOf(s), printingId, sigma);
  return band(s, Math.max(0, projected * Math.exp(noise)), sigma,
    s.publishers[s.playerId]?.unlocks.analytics ?? 0);
}

/**
 * A region reading, with the error derived rather than drawn.
 *
 * This is `readRegion`'s error model, extracted so both observers obey the same
 * contract. See the file header for why a reading must not draw.
 */
export function regionReadingNoise(
  s: SimState, regionId: RegionId, salt: string, sigma: number,
): number {
  const region = s.regions[regionId];
  if (!region) return 0;
  return readingNoise(region.truth.readingNoiseSeed, bucketOf(s), `${regionId}:${salt}`, sigma);
}

/** Re-exported for callers that want the raw shape rather than a band. */
export type { IpKind, Rarity };
