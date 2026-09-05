/**
 * Regions (CONCEPT.md §6.6, §9).
 *
 * A region is a separate market with its own taste, its own spending power and
 * its own channels. It was declared in `types.ts` from the start and never
 * simulated: `world.ts` seeded exactly one, `unlockRegion` fell through to
 * `default`, and the whole `region` config block — `knowledgeGainPerRelease`,
 * `knowledgeGainPerResearch`, `mismatchPenalty` — was dead.
 *
 * Three things make a region a decision rather than a bigger number:
 *
 * - **It costs money up front and pays back over years.** `unlockCost` leaves
 *   the ledger the week you open, and the channels inside still have to be
 *   bought one at a time.
 * - **Its taste is hidden.** `Region.truth` is ground truth in the same sense
 *   as `Printing.truth`: nothing that renders may read it. A set that suits the
 *   region sells; one that does not is discounted by `mismatchPenalty`.
 * - **What you can see about it improves with `knowledge`.** `readRegion` is a
 *   measurement of the truth whose error shrinks as you release into the region
 *   and as market research accumulates. It is the same shape as the reveal
 *   window's signal, and for the same reason: a reading that cannot be wrong
 *   turns a market-entry bet into arithmetic.
 */
import type {
  SimState, Region, RegionId, CardSet, Product, IpKind, Rarity, AudienceSegment,
} from './types.ts';
import { gauss } from './rng.ts';

/** A reading of a region's taste. Every field carries error; none is the truth. */
export interface RegionReading {
  regionId: RegionId;
  /** 0..1. How much of the truth this reading is built on. */
  confidence: number;
  tasteBias: Record<IpKind, number>;
  rarityAppetite: Record<Rarity, number>;
  priceTolerance: number;
}

/**
 * How well a set suits a region, 0..1, where 1 is a perfect fit.
 *
 * Taste and rarity appetite are averaged over the cards actually in the set, so
 * a publisher tailoring a set to a region is doing it card by card rather than
 * flipping a flag. The product's own fit and the region's price tolerance ride
 * on top, because a region that likes your characters can still balk at what a
 * booster box costs there.
 */
export function setFit(s: SimState, region: Region, set: CardSet, p: Product): number {
  const t = region.truth;

  let taste = 0;
  let appetite = 0;
  let counted = 0;
  for (const cardId of set.cardIds) {
    const card = s.cards[cardId];
    if (!card) continue;
    const ip = s.ips[card.subjectIp];
    if (!ip) continue;
    taste += t.tasteBias[ip.kind as IpKind] ?? 0;
    appetite += t.rarityAppetite[card.rarity] ?? 1;
    counted++;
  }
  if (counted === 0) return 1;
  taste /= counted;
  appetite /= counted;

  // `tasteBias` runs about -0.3..+0.3 and `rarityAppetite` about 0.5..1.5, so
  // both are folded onto a 0..1 scale here rather than multiplied raw. A region
  // with no opinion at all lands on exactly 1.
  const cfg = s.config.region;
  const tasteFit = clamp01(cfg.tasteFitCentre + taste);
  const appetiteFit = clamp01(appetite / cfg.appetiteFitDivisor);
  const productFit = clamp01((t.productPreference[p.kind] ?? 1) / cfg.productFitDivisor);

  // Price tolerance is a ratio, not a preference: a region that tolerates 0.6
  // of what the US will pay walks away from a US-priced booster box.
  const priceFit = clamp01(t.priceTolerance * cfg.priceFitGain);

  return clamp01(cfg.fitTasteWeight * tasteFit + cfg.fitAppetiteWeight * appetiteFit
    + cfg.fitProductWeight * productFit + cfg.fitPriceWeight * priceFit);
}

/**
 * The multiplier a region puts on a set's demand pool.
 *
 * `marketSize` and `wealth` say how big the market is; `mismatchPenalty` says
 * how much of it a badly-matched set forfeits. At `mismatchPenalty` 0 a region
 * is a pure size multiplier and taste stops mattering, which is the failure
 * this term exists to avoid.
 */
export function regionDemandFactor(s: SimState, region: Region, set: CardSet, p: Product): number {
  const fit = setFit(s, region, set, p);
  const penalty = s.config.region.mismatchPenalty;
  const floor = s.config.region.wealthFloor;
  return region.marketSize * (floor + (1 - floor) * region.wealth) * (1 - penalty * (1 - fit));
}

/**
 * A noisy read of what a region wants.
 *
 * The error is lognormal on the multiplicative fields and additive on the
 * signed ones, and it shrinks as `1 - knowledge` in both. At `knowledge` 0 the
 * reading is close to useless and at 1 it is close to the truth, which is the
 * whole reason to release into a region you have not learned yet.
 *
 * This draws from `s.regionRng`, never from `s.rng`: a reading is an
 * observation, and an observation must not renumber the value engine's draws.
 */
export function readRegion(s: SimState, regionId: RegionId): RegionReading | null {
  const region = s.regions[regionId];
  if (!region) return null;
  const err = (1 - region.knowledge) * s.config.region.readingNoiseSigma;
  const t = region.truth;

  const tasteBias = {} as Record<IpKind, number>;
  for (const [k, v] of Object.entries(t.tasteBias)) {
    tasteBias[k as IpKind] = v + gauss(s.regionRng, 0, err * s.config.region.tasteReadingNoiseScale);
  }
  const rarityAppetite = {} as Record<Rarity, number>;
  for (const [k, v] of Object.entries(t.rarityAppetite)) {
    rarityAppetite[k as Rarity] = v * Math.exp(gauss(s.regionRng, 0, err));
  }
  return {
    regionId,
    confidence: region.knowledge,
    tasteBias,
    rarityAppetite,
    priceTolerance: t.priceTolerance * Math.exp(gauss(s.regionRng, 0, err)),
  };
}

/**
 * What a reading says a set is worth, on the same 0..1 scale as `setFit`.
 *
 * The harness scores this against `setFit` to ask whether knowledge is buying
 * anything. It has to be able to be wrong.
 */
export function readingFit(
  s: SimState, reading: RegionReading, set: CardSet, p: Product, region: Region,
): number {
  const shadow: Region = {
    ...region,
    truth: {
      ...region.truth,
      tasteBias: reading.tasteBias,
      rarityAppetite: reading.rarityAppetite,
      priceTolerance: reading.priceTolerance,
    },
  };
  return setFit(s, shadow, set, p);
}

/** Regions this publisher has opened. */
export function unlockedRegions(s: SimState, publisherId: string): Region[] {
  const pub = s.publishers[publisherId as never];
  if (!pub) return [];
  return pub.unlocks.regions
    .map(id => s.regions[id])
    .filter((r): r is Region => !!r);
}

/**
 * Knowledge grows two ways: releasing into a region teaches you the market, and
 * market research buys the same thing with cash. Neither ever reaches 1, so a
 * reading is never quite the truth.
 */
export function tickRegionKnowledge(s: SimState): void {
  if (s.tick % s.config.strides.quarterly !== 0) return;
  const pub = s.publishers[s.playerId]!;
  const cfg = s.config.region;
  for (const id of pub.unlocks.regions) {
    const region = s.regions[id];
    if (!region) continue;
    const research = pub.unlocks.marketResearch * cfg.knowledgeGainPerResearch;
    region.knowledge = Math.min(cfg.knowledgeCeiling,
      region.knowledge + research * cfg.researchCreditShare);
  }
}

/** Called once per release into a region. */
export function creditRelease(s: SimState, regionId: RegionId): void {
  const region = s.regions[regionId];
  if (!region) return;
  region.knowledge = Math.min(s.config.region.knowledgeCeiling,
    region.knowledge + s.config.region.knowledgeGainPerRelease);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Segment mix decides which audience segments a region's demand draws on. */
export function regionSegmentWeight(region: Region, seg: AudienceSegment): number {
  return region.truth.segmentMix[seg] ?? 0;
}
