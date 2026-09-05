/**
 * Initial state bootstrap. Matches CONCEPT.md §9 "Opening state (year 0)":
 * US only, LGS-only channel access, a small pool of cheap unproven artists,
 * no research/community/analytics unlocks yet.
 */
import type {
  SimState, SimConfig, Tick, Cents, PublisherId, RegionId, ArtistId, GraderId,
  AudienceSegment, Rarity, ArtistPersonality, ArtistSpecialty, IpKind, ProductKind,
  Channel, ChannelId, Unit, CreatorId, SegmentState,
} from './types.ts';
import { seedRng, rand, randRange, pick } from './rng.ts';
import { CHANNEL_IDS } from './channels.ts';
import { emptySeries } from './series.ts';

export const SEGMENTS: AudienceSegment[] = [
  'kids', 'teens', 'adults', 'investors', 'artFans',
];

/** Shared with the engine, which mints newcomers into the same roster. */
export const ARTIST_PERSONALITIES: ArtistPersonality[] =
  ['collaborative', 'precious', 'prolific', 'mercurial', 'reclusive'];
export const ARTIST_SPECIALTIES: ArtistSpecialty[] =
  ['creature', 'landscape', 'character', 'graphic', 'ensemble'];

export const RARITIES: Rarity[] = [
  'common', 'uncommon', 'rare', 'doubleRare', 'ultraRare',
  'illustrationRare', 'specialIllustrationRare', 'hyperRare', 'promo',
];

export const IP_KINDS: IpKind[] = ['character', 'location', 'faction', 'concept', 'event'];

export const REGION_US = 'reg_us' as RegionId;
export const REGION_EU = 'reg_eu' as RegionId;
export const REGION_JP = 'reg_jp' as RegionId;
export const REGION_LATAM = 'reg_latam' as RegionId;

/**
 * The regions past the home market, in the order CONCEPT.md §9 opens them.
 *
 * Each one is a different shape of bet rather than a bigger version of the same
 * one. Japan is small, rich and opinionated; Latin America is large, poor and
 * cheap to enter; Europe is the safe middle. The taste itself is rolled per
 * seed, so the shapes are the constants and the specifics are what a run has to
 * learn.
 */
export const REGION_SEEDS = [
  { id: REGION_EU, name: 'Europe' },
  { id: REGION_JP, name: 'Japan' },
  { id: REGION_LATAM, name: 'Latin America' },
] as const;

/** Monotonic, deterministic id generation — same seed, same ids, every time. */
export function nextId(s: SimState, prefix: string): string {
  s.idCounter += 1;
  return `${prefix}_${s.idCounter}`;
}

export function createWorld(seed: string, config: SimConfig): SimState {
  const rng = seedRng(seed);
  const playerId = 'pub_player' as PublisherId;
  const t0 = 0 as Tick;

  const s: SimState = {
    schemaVersion: 1,
    seed,
    rng,
    // Grading draws from its own stream so that adding an observer of the value
    // engine does not renumber the value engine's own draws.
    gradingRng: seedRng(`${seed}:grading`),
    regionRng: seedRng(`${seed}:region`),
    actorRng: seedRng(`${seed}:actors`),
    // Art is not an observer — `artQuality` multiplies price directly — but it
    // still gets its own stream so a commission roll does not renumber the
    // value engine's draws. That is what keeps the price movement this pass
    // causes attributable to the art multiplier rather than to reshuffled noise.
    artRng: seedRng(`${seed}:art`),
    tick: t0,
    idCounter: 0,
    printingByCard: {},
    playerId,
    homeRegionId: REGION_US,

    publishers: {
      [playerId]: {
        id: playerId,
        name: 'Player Studio',
        foundedTick: t0,
        // $500,000. Everything in the model is cents, so the `_00` suffix is
        // load-bearing: without it this reads as $5,000, which does not cover a
        // single print run and disagrees with the borrow ceiling in tickFinance.
        cash: config.finance.startingCash,
        debt: 0 as Cents,
        peakDebt: 0 as Cents,
        credit: config.finance.startingCredit,
        brandStanding: config.finance.startingBrandStanding as Unit,
        unlocks: {
          channels: [],
          regions: [REGION_US],
          marketResearch: 0,
          communityTeam: 0,
          analytics: 0,
          printQualityTiers: ['budget', 'standard'],
          specialtySetSlots: 0,
          canHostEvents: false,
          directStore: false,
        },
        retainers: {},
        ledger: [],
        deadTick: null,
        deathCause: null,
      },
    },

    ips: {},
    cards: {},
    sets: {},
    products: {},
    printings: {},
    artists: {},
    channels: {},
    regions: {},
    graders: {},  // seeded below
    creators: {},
    chains: {},
    collabs: {},
    drops: {},

    audience: {
      // Filled once the region table exists, below.
      regions: {} as SimState['audience']['regions'],
      recentUnitsByRegion: {} as SimState['audience']['recentUnitsByRegion'],
      fatigueWarned: false,
      actors: {
        scalpers: config.world.startingScalpers,
        resellers: config.world.startingResellers,
        collectors: config.world.startingCollectors,
        speculators: config.world.startingSpeculators,
      },
      hidden: { scalperInventory: {}, scalperProfitability: 0, scalperBoom: false },
    },

    market: {
      climate: config.world.startingClimate,
      climateHistory: emptySeries(t0),
      indexes: {
        allCards: config.world.startingIndex,
        byPublisher: { [playerId]: config.world.startingIndex },
        bySet: {},
      },
      gradingQueue: [],
      commissionQueue: [],
    },

    inbox: [],
    events: [],
    config,
  };

  const w = config.world;
  const productPreference = w.productPreference;

  const usSeed = w.regions[REGION_US]!;
  s.regions[REGION_US] = {
    id: REGION_US,
    name: 'United States',
    marketSize: usSeed.marketSize,
    wealth: usSeed.wealth,
    unlockCost: usSeed.unlockCost,
    truth: {
      segmentMix: Object.fromEntries(SEGMENTS.map(
        g => [g, randRange(rng, w.segmentMixMin, w.segmentMixMax)])) as Record<AudienceSegment, number>,
      tasteBias: { ...w.homeTasteBias },
      rarityAppetite: Object.fromEntries(RARITIES.map(
        r => [r, randRange(rng, w.rarityAppetiteMin, w.rarityAppetiteMax)])) as Record<Rarity, number>,
      productPreference,
      priceTolerance: usSeed.priceTolerance,
      readingNoiseSeed: rand(rng),
    },
    knowledge: usSeed.knowledge,
    unlockedTick: t0,
  };

  // The regions past the home market. Their taste is drawn from `regionRng`,
  // not from `rng`: a single extra draw on the main stream renumbers every
  // later roll in the run and moves every balance number in HANDOFF.md. The
  // same rule that keeps the grader roster on literals applies here.
  const rrng = s.regionRng;
  for (const seed of REGION_SEEDS) {
    const rs = w.regions[seed.id]!;
    s.regions[seed.id] = {
      id: seed.id,
      name: seed.name,
      marketSize: rs.marketSize,
      wealth: rs.wealth,
      unlockCost: rs.unlockCost,
      truth: {
        segmentMix: Object.fromEntries(SEGMENTS.map(
          g => [g, randRange(rrng, w.segmentMixMin, w.segmentMixMax)])) as Record<AudienceSegment, number>,
        tasteBias: Object.fromEntries(IP_KINDS.map(
          k => [k, randRange(rrng, w.tasteBiasMin, w.tasteBiasMax)])) as Record<IpKind, number>,
        rarityAppetite: Object.fromEntries(RARITIES.map(
          r => [r, randRange(rrng, w.rarityAppetiteMin, w.rarityAppetiteMax)])) as Record<Rarity, number>,
        productPreference: Object.fromEntries(
          Object.keys(productPreference).map(
            k => [k, productPreference[k as ProductKind]!
              * randRange(rrng, w.productPreferenceJitterMin, w.productPreferenceJitterMax)],
          )) as Record<ProductKind, number>,
        priceTolerance: rs.priceTolerance,
        readingNoiseSeed: rand(rrng),
      },
      // A region you have never sold into is a region you know nothing about.
      knowledge: rs.knowledge,
      unlockedTick: null,
    };
  }

  // Every region gets its own audience, split across the segments by the taste
  // the region was rolled with. `Region.truth.segmentMix` was seeded from the
  // first pass and read by nothing until now.
  //
  // The home market opens with exactly `referenceAudience` engaged people, so
  // year-0 demand is what it was before this system existed. Every other region
  // has people but none of them reached: entering a market is an act of
  // acquisition, not a size multiplier applied to somebody else's audience.
  const w2 = config.world;
  const homeEngaged = w2.segmentSize * SEGMENTS.length;
  for (const region of Object.values(s.regions)) {
    const mix = region.truth.segmentMix;
    let mixTotal = 0;
    for (const g of SEGMENTS) mixTotal += Math.max(0, mix[g] ?? 0);
    if (mixTotal <= 0) mixTotal = 1;

    const isHome = region.id === REGION_US;
    const engagedHere = isHome ? homeEngaged : 0;
    // Population follows the region's own size, so a large poor market has more
    // people to reach than a small rich one, which is what makes the entry bet
    // a shape rather than a ranking.
    const populationHere = homeEngaged * w2.openingPopulationMultiple * region.marketSize;

    const segs = {} as Record<AudienceSegment, SegmentState>;
    for (const g of SEGMENTS) {
      const share = Math.max(0, mix[g] ?? 0) / mixTotal;
      const engaged = engagedHere * share;
      segs[g] = {
        population: populationHere * share,
        reached: isHome ? engaged * w2.openingReachedMultiple : 0,
        engaged,
        attention: w2.segmentAttention,
        fatigue: w2.segmentFatigue,
        goodwill: w2.segmentGoodwill,
      };
    }
    s.audience.regions[region.id] = segs;
    s.audience.recentUnitsByRegion[region.id] = 0;
  }

  // The creator roster. Drawn from `regionRng` rather than `rng`, for the same
  // reason the regions above are: an extra draw on the main stream renumbers
  // every later roll in the run. Their affinity IPs are empty at tick 0 because
  // no IP exists yet — `tickCreators` matches on whatever the publisher has
  // made, and `seedCreatorAffinities` fills these in once there is a roster to
  // have an opinion about.
  const CREATOR_FORMATS = ['ripAndShip', 'review', 'openings', 'investing'] as const;
  for (let i = 0; i < config.creators.rosterSize; i++) {
    const id = `creator_${i}` as CreatorId;
    s.creators[id] = {
      id,
      name: `Creator ${i + 1}`,
      format: CREATOR_FORMATS[i % CREATOR_FORMATS.length]!,
      // A long tail: a couple of large channels and a lot of small ones, which
      // is what a creator ecosystem looks like and what makes cultivating the
      // right one worth doing.
      audienceSize: Math.round(config.creators.audienceBase
        * Math.pow(config.creators.audienceGrowth,
          randRange(rrng, 0, config.creators.audienceExponentMax))),
      influence: randRange(rrng, config.creators.influenceMin, config.creators.influenceMax) as Unit,
      affinityIps: [],
      relationship: randRange(rrng,
        config.creators.openingRelationshipMin, config.creators.openingRelationshipMax) as Unit,
    };
  }

  // The full roster exists from tick 0; only the LGS network is open. The rest
  // are bought with the `purchaseUnlock` decision once brand standing clears
  // their gate, in the order CONCEPT.md §9 lays out.
  const chSeeds = config.channels.seeds;
  /** Builds one channel from its config seed. `queueCapacity` 0 means "no queue". */
  const makeChannel = (
    id: ChannelId, name: string, kind: Channel['kind'], regionId: RegionId,
    key: string, unlocked: boolean, capacityScale = 1,
  ): Omit<Channel, 'lastAllocatedTick'> => {
    const cs = chSeeds[key]!;
    return {
      id, name, kind, regionId,
      relationship: cs.relationship,
      capacityUnits: capacityScale === 1
        ? cs.capacityUnits : Math.round(cs.capacityUnits * capacityScale),
      marginShare: cs.marginShare,
      minimumOrder: cs.minimumOrder,
      reliability: cs.reliability,
      requiredBrandStanding: cs.requiredBrandStanding,
      unlocked,
      queueCapacity: cs.queueCapacity > 0 ? cs.queueCapacity : null,
    };
  };

  const CHANNEL_SEEDS: Array<Omit<Channel, 'lastAllocatedTick'>> = [
    makeChannel(CHANNEL_IDS.lgs, 'LGS Network', 'lgs', REGION_US, 'ch_lgs', true),
    makeChannel(CHANNEL_IDS.online, 'Online Retail', 'online', REGION_US, 'ch_online', false),
    makeChannel(CHANNEL_IDS.distributor, 'National Distributor', 'distributor', REGION_US, 'ch_dist', false),
    makeChannel(CHANNEL_IDS.bigbox, 'Big Box Chains', 'bigbox', REGION_US, 'ch_bigbox', false),
    makeChannel(CHANNEL_IDS.direct, 'Direct Store', 'direct', REGION_US, 'ch_direct', false),
  ];
  for (const seed of CHANNEL_SEEDS) {
    s.channels[seed.id] = { ...seed, lastAllocatedTick: null };
    if (seed.unlocked) s.publishers[playerId]!.unlocks.channels.push(seed.id);
  }

  // Every region has its own channels, and none of them is open. Opening the
  // region is what makes them buyable; each one is then bought separately, at
  // the same brand gates as its US counterpart. A region is therefore never one
  // payment — it is a payment and then a channel tree, which is what keeps an
  // early unlock from being free reach.
  //
  // The home market keeps the big box and the direct store to itself. A
  // publisher's own store is singular by definition, and a chain deal abroad is
  // not something a studio this size buys.
  for (const seed of REGION_SEEDS) {
    const region = s.regions[seed.id]!;
    const scale = w.regions[seed.id]!.marketSize * w.foreignChannelScale;
    const abroad: Array<Omit<Channel, 'lastAllocatedTick'>> = [
      makeChannel(`ch_lgs_${seed.id}` as ChannelId, `${seed.name} LGS Network`,
        'lgs', region.id, 'abroadLgs', false, scale),
      makeChannel(`ch_online_${seed.id}` as ChannelId, `${seed.name} Online Retail`,
        'online', region.id, 'abroadOnline', false, scale),
      makeChannel(`ch_dist_${seed.id}` as ChannelId, `${seed.name} Distributor`,
        'distributor', region.id, 'abroadDist', false, scale),
    ];
    for (const ch of abroad) s.channels[ch.id] = { ...ch, lastAllocatedTick: null };
  }

  const personalities = ARTIST_PERSONALITIES;
  const specialties = ARTIST_SPECIALTIES;
  const ca = config.art;
  for (let i = 0; i < ca.openingRosterSize; i++) {
    const id = nextId(s, 'art') as ArtistId;
    // $75 to $450 for an unproven newcomer, and reputation drags it up from
    // there. It used to be 50 to 300 *cents* — fifty cents to three dollars a
    // card — which made a 25-year art budget about $7,800 against a $22M net
    // worth. Art was a rounding error rather than a budget line, so no art
    // decision could ever cost anything.
    //
    // Swept over 15 seeds x 30 years against three art strategies. At this
    // range `conservative` spends 4.6% of revenue on art, `scout` 1.6% because
    // unknowns are cheap, and `safeHands` 26.9% buying reputation it can see —
    // and that last one now costs it four seeds in fifteen. Three times higher
    // and `safeHands` stops being viable at all.
    const rate0 = Math.round(randRange(rng, ca.openingRateMin, ca.openingRateMax)) as Cents;
    s.artists[id] = {
      id,
      name: `Artist ${i + 1}`,
      personality: pick(rng, personalities),
      specialty: pick(rng, specialties),
      stats: {
        linework: randRange(rng, ca.openingStatMin, ca.openingStatMax),
        color: randRange(rng, ca.openingStatMin, ca.openingStatMax),
        composition: randRange(rng, ca.openingStatMin, ca.openingStatMax),
        speed: randRange(rng, ca.speedMin, ca.speedMax),
        reliability: randRange(rng, ca.reliabilityMin, ca.reliabilityMax),
      },
      // Cheap and unproven, per CONCEPT.md's opening state.
      rate: rate0,
      baseRate: rate0,
      turnaroundWeeks: Math.round(randRange(rng, ca.openingTurnaroundMin, ca.openingTurnaroundMax)),
      reputation: randRange(rng, ca.openingReputationMin, ca.openingReputationMax),
      growth: randRange(rng, ca.growthMin, ca.growthMax),
      relationship: ca.openingRelationship,
      exclusiveTo: null,
      available: true,
    };
  }

  // Graders are a fixed roster, deliberately drawn with no RNG: the world
  // bootstrap's draw sequence is what every seeded run downstream is built on,
  // and adding draws here would move every existing balance number.
  //
  // Two graders cover the market from day one; the third does not look at a
  // publisher nobody has heard of, and enters when brand standing clears
  // `grading.sideGraderBrandGate` (CONCEPT.md §7).
  for (const g of GRADER_SEEDS) {
    const gs = config.graders[g.id]!;
    s.graders[g.id] = {
      id: g.id,
      name: g.name,
      activeFromTick: g.activeFromTick,
      strictness: gs.strictness,
      reputation: gs.reputation as Unit,
      marketShare: gs.marketShare as Unit,
      tiers: g.tierOrder.map(name => ({
        name,
        price: gs.tiers[name]!.price,
        turnaroundWeeks: gs.tiers[name]!.turnaroundWeeks,
      })),
    };
  }

  return s;
}

/** A grader that has not entered the market yet. Past the end of any run. */
export const GRADER_DORMANT = Number.MAX_SAFE_INTEGER as Tick;

const GRADER_SEEDS: Array<{
  id: GraderId; name: string; tierOrder: string[]; activeFromTick: Tick;
}> = [
  // The strict, expensive one. Fewer 10s, and the 10s it does hand out carry
  // the reputation premium.
  {
    id: 'grd_pinnacle' as GraderId, name: 'Pinnacle Grading',
    tierOrder: ['bulk', 'standard', 'express'], activeFromTick: 0 as Tick,
  },
  // Cheaper, softer, faster. Grades more copies and is trusted less for it.
  {
    id: 'grd_cardsafe' as GraderId, name: 'Cardsafe',
    tierOrder: ['bulk', 'standard', 'express'], activeFromTick: 0 as Tick,
  },
  {
    id: 'grd_apex' as GraderId, name: 'Apex Authentication',
    tierOrder: ['standard', 'express'], activeFromTick: GRADER_DORMANT,
  },
];
