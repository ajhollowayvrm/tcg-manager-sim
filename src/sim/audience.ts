/**
 * The audience system (CONCEPT.md §6.2, §9).
 *
 * Three layers per (region, segment), because the growth arc is the distance
 * between them:
 *
 *   population  people who could play. Demographics and the hobby's climate.
 *   reached     people who know the game and have bought at least once.
 *   engaged     people currently active. This is what demand reads.
 *
 * The gap between `reached` and `engaged` is the lapsed reservoir. It is not a
 * segment — a lapsed teenager is still a teenager — and winning somebody back
 * is cheaper than finding somebody new, which is what gives a collab and a
 * vintage price run a second job beyond raw reach.
 *
 * The loop, once per tick per region:
 *
 *   1. population grows: births into `kids`, drift on the motivation segments,
 *      both scaled by `market.climate`
 *   2. cohorts age: kids -> teens -> adults -> out, carrying all three layers
 *   3. acquisition converts `population - reached`, driven by what the studio
 *      actually did — units shipped there, brand standing, goodwill
 *   4. engagement moves `engaged` toward a target set by freshness and fatigue
 *   5. churn returns `reached` to unreached when goodwill stays low
 *
 * Before this existed, six segments each carried a `size` that nothing ever
 * wrote, `audienceAverages` meaned them into one number, and demand read a
 * single global scalar. `Region.truth.segmentMix` was seeded per region and
 * never read at all.
 */
import type {
  SimState, SimConfig, AudienceSegment, SegmentState, RegionId, IpEntity,
} from './types.ts';
import { AGE_COHORTS } from './types.ts';
import { SEGMENTS } from './world.ts';

/** The segments of one region. Falls back to the home market if unknown. */
export function segmentsIn(s: SimState, regionId: RegionId): Record<AudienceSegment, SegmentState> {
  return s.audience.regions[regionId] ?? s.audience.regions[s.homeRegionId]!;
}

/** People currently active in one region. The number demand is measured in. */
export function engagedIn(s: SimState, regionId: RegionId): number {
  const segs = segmentsIn(s, regionId);
  let n = 0;
  for (const g of SEGMENTS) n += segs[g].engaged;
  return n;
}

export function populationIn(s: SimState, regionId: RegionId): number {
  const segs = segmentsIn(s, regionId);
  let n = 0;
  for (const g of SEGMENTS) n += segs[g].population;
  return n;
}

/** The lapsed reservoir: reached but not currently active. */
export function lapsedIn(s: SimState, regionId: RegionId): number {
  const segs = segmentsIn(s, regionId);
  let n = 0;
  for (const g of SEGMENTS) n += Math.max(0, segs[g].reached - segs[g].engaged);
  return n;
}

export interface AudienceAverages {
  attention: number;
  fatigue: number;
  goodwill: number;
}

/** Mean attention, fatigue and goodwill across one region's segments. */
export function averagesIn(s: SimState, regionId: RegionId): AudienceAverages {
  const segs = segmentsIn(s, regionId);
  let attention = 0, fatigue = 0, goodwill = 0;
  for (const g of SEGMENTS) {
    attention += segs[g].attention;
    fatigue += segs[g].fatigue;
    goodwill += segs[g].goodwill;
  }
  const n = SEGMENTS.length;
  return { attention: attention / n, fatigue: fatigue / n, goodwill: goodwill / n };
}

/**
 * The same three, across every region the player has opened, weighted by
 * engaged audience. A region nobody sells into does not get a vote on whether
 * the brand is tired.
 */
export function globalAverages(s: SimState): AudienceAverages {
  const pub = s.publishers[s.playerId]!;
  let attention = 0, fatigue = 0, goodwill = 0, weight = 0;
  for (const rid of pub.unlocks.regions) {
    const w = Math.max(1, engagedIn(s, rid));
    const a = averagesIn(s, rid);
    attention += a.attention * w;
    fatigue += a.fatigue * w;
    goodwill += a.goodwill * w;
    weight += w;
  }
  if (weight <= 0) return averagesIn(s, s.homeRegionId);
  return { attention: attention / weight, fatigue: fatigue / weight, goodwill: goodwill / weight };
}

/** Engaged audience across every opened region. The scale everything else is relative to. */
export function engagedTotal(s: SimState): number {
  const pub = s.publishers[s.playerId]!;
  let n = 0;
  for (const rid of pub.unlocks.regions) n += engagedIn(s, rid);
  return n;
}

/**
 * How large the market is against the year-0 denominator.
 *
 * Every absolute unit count in the model is divided by this, or the growth arc
 * breaks it: print thirty times as much and `value.referencePopulation` would
 * price every late set as bulk, `grading.popScarcityReference` would pin every
 * tier to its ceiling, and `finance.overprintDeathUnits` would kill a normal
 * late-game run on sight.
 */
export function audienceScale(s: SimState): number {
  return Math.max(0.01, engagedTotal(s) / s.config.attention.referenceAudience);
}

/**
 * How much one segment wants this set, 0..1-ish.
 *
 * Averages the IP affinities of the set's cards for that segment, which is what
 * finally makes `IpEntity.truth.affinities` load-bearing: before this it was
 * rolled per IP and then averaged away.
 */
export function segmentAffinity(s: SimState, setId: string, seg: AudienceSegment): number {
  const set = s.sets[setId as never];
  if (!set) return 0.5;
  let sum = 0, n = 0;
  for (const cardId of set.cardIds) {
    const card = s.cards[cardId];
    if (!card) continue;
    const ip = s.ips[card.subjectIp] as IpEntity | undefined;
    if (!ip) continue;
    sum += ip.truth.affinities[seg] ?? 0;
    n++;
  }
  if (n === 0) return 0.5;
  // Affinities run about -0.8..0.9, so fold onto 0..1 with 0.5 as indifference.
  const mean = sum / n;
  return Math.max(0, Math.min(1, 0.5 + mean * 0.5));
}

/** Records a shipment into a region, for the acquisition drive. */
export function creditUnitsSold(s: SimState, regionId: RegionId, units: number): void {
  if (units <= 0) return;
  s.audience.recentUnitsByRegion[regionId] =
    (s.audience.recentUnitsByRegion[regionId] ?? 0) + units;
}

/**
 * Seeds a region's reached population when the player opens it.
 *
 * A known studio arrives with a foothold rather than from nothing: reputation
 * precedes it. Without this, entering a market is years of acquisition before a
 * single sale, which makes every region a losing bet regardless of its taste.
 */
export function seedRegionEntry(s: SimState, regionId: RegionId): void {
  const cfg = s.config.audience;
  const pub = s.publishers[s.playerId]!;
  const segs = s.audience.regions[regionId];
  if (!segs) return;
  const share = cfg.entrySeedShare * pub.brandStanding;
  for (const g of SEGMENTS) {
    const st = segs[g];
    st.reached = Math.max(st.reached, st.population * share);
    st.engaged = Math.min(st.reached, st.engaged);
  }
}

/** The whole audience loop, once per tick. */
export function tickAudienceSystem(s: SimState): void {
  const cfg = s.config.audience;
  const att = s.config.attention;
  const pub = s.publishers[s.playerId]!;
  const climateDrive = 1 + cfg.climateToPopulation * (s.market.climate - 1);

  for (const rid of Object.keys(s.audience.regions) as RegionId[]) {
    const segs = s.audience.regions[rid]!;
    const opened = pub.unlocks.regions.includes(rid);

    // --- 1. population -----------------------------------------------------
    let cohortPopulation = 0;
    for (const g of AGE_COHORTS) cohortPopulation += segs[g].population;
    const births = cohortPopulation * cfg.birthRatePerTick * climateDrive;
    segs.kids.population += births;
    for (const g of SEGMENTS) {
      if ((AGE_COHORTS as readonly string[]).includes(g)) continue;
      segs[g].population *= 1 + cfg.populationGrowthPerTick * climateDrive;
    }

    // --- 2. aging ----------------------------------------------------------
    // All three layers move together: an engaged kid becomes an engaged teen.
    // Walk oldest first so nobody skips a cohort in one tick.
    flow(segs.adults, null, cfg.agingAdultsOut);
    flow(segs.teens, segs.adults, cfg.agingTeensToAdults);
    flow(segs.kids, segs.teens, cfg.agingKidsToTeens);

    // --- 3. acquisition ----------------------------------------------------
    const recent = s.audience.recentUnitsByRegion[rid] ?? 0;
    s.audience.recentUnitsByRegion[rid] = recent * (1 - cfg.recentUnitsDecayPerTick);

    if (opened) {
      let regionPopulation = 0;
      for (const g of SEGMENTS) regionPopulation += segs[g].population;
      const perCapita = recent / Math.max(1, regionPopulation);
      const reach = Math.min(2, perCapita / Math.max(1e-9, cfg.reachPerCapitaReference));
      for (const g of SEGMENTS) {
        const st = segs[g];
        const unreached = Math.max(0, st.population - st.reached);
        if (unreached <= 0) continue;
        const drive = cfg.acquisitionFloor
          + cfg.acquisitionFromReach * reach
          + cfg.acquisitionFromBrand * pub.brandStanding
          + cfg.acquisitionFromGoodwill * st.goodwill;
        st.reached = Math.min(st.population, st.reached + unreached * cfg.acquisitionRate * drive);
      }
    }

    // --- 4. engagement -----------------------------------------------------
    // Freshness is how recently this region got a release it wanted. A market
    // with nothing new drifts back toward the floor and the lapsed pool grows.
    const freshness = regionFreshness(s, rid);
    for (const g of SEGMENTS) {
      const st = segs[g];
      const tired = fatigueLeaves(att, st.fatigue);
      const target = st.reached
        * Math.min(1, cfg.engagedFloor + cfg.engagedFromFreshness * freshness * st.goodwill)
        * tired;
      // Winning back somebody already reached is faster than reaching them was.
      const rate = target > st.engaged
        ? cfg.engagementRate * cfg.winBackAdvantage
        : cfg.engagementRate;
      st.engaged += (target - st.engaged) * Math.min(1, rate);
      st.engaged = Math.max(0, Math.min(st.reached, st.engaged));
    }

    // --- 5. churn ----------------------------------------------------------
    for (const g of SEGMENTS) {
      const st = segs[g];
      const deficit = Math.max(0, cfg.churnGoodwillFloor - st.goodwill);
      if (deficit <= 0) continue;
      st.reached = Math.max(st.engaged, st.reached * (1 - cfg.churnRate * deficit));
    }
  }
}

/** Moves a share of every layer from one cohort to the next, or out of the world. */
function flow(from: SegmentState, to: SegmentState | null, rate: number): void {
  const pop = from.population * rate;
  const rea = from.reached * rate;
  const eng = from.engaged * rate;
  from.population -= pop;
  from.reached -= rea;
  from.engaged -= eng;
  if (!to) return;
  to.population += pop;
  to.reached += rea;
  to.engaged += eng;
}

/** What fatigue leaves of engagement. Same curve the demand pool uses. */
function fatigueLeaves(cfg: SimConfig['attention'], fatigue: number): number {
  const f = Math.max(0, Math.min(1, fatigue));
  return Math.max(0, 1 - cfg.fatigueBite * Math.pow(f, cfg.fatigueExponent));
}

/** 1 just after a release into this region, decaying to 0 over `freshnessWeeks`. */
function regionFreshness(s: SimState, regionId: RegionId): number {
  const window = s.config.audience.freshnessWeeks;
  let best = 0;
  for (const set of Object.values(s.sets)) {
    if (set.status !== 'released') continue;
    const sched = set.regionSchedule.find(r => r.regionId === regionId);
    if (!sched) continue;
    const age = (s.tick as number) - (sched.releaseTick as number);
    if (age < 0 || age > window) continue;
    const fresh = 1 - age / window;
    if (fresh > best) best = fresh;
  }
  return best;
}
