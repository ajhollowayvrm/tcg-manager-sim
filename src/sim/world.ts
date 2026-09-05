/**
 * Initial state bootstrap. Matches CONCEPT.md §9 "Opening state (year 0)":
 * US only, LGS-only channel access, a small pool of cheap unproven artists,
 * no research/community/analytics unlocks yet.
 */
import type {
  SimState, SimConfig, Tick, Cents, PublisherId, RegionId, ArtistId, GraderId,
  AudienceSegment, Rarity, ArtistPersonality, ArtistSpecialty, IpKind, ProductKind,
  Channel, ChannelId, Unit, CreatorId,
} from './types.ts';
import { seedRng, rand, randRange, pick } from './rng.ts';
import { CHANNEL_IDS } from './channels.ts';
import { emptySeries } from './series.ts';

export const SEGMENTS: AudienceSegment[] = [
  'kids', 'teens', 'adults', 'lapsed', 'investors', 'artFans',
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
  {
    id: REGION_EU, name: 'Europe',
    marketSize: 0.85, wealth: 0.75, unlockCost: 600_000_00 as Cents,
    priceTolerance: 0.95,
  },
  {
    id: REGION_JP, name: 'Japan',
    marketSize: 0.55, wealth: 0.9, unlockCost: 900_000_00 as Cents,
    priceTolerance: 1.15,
  },
  {
    id: REGION_LATAM, name: 'Latin America',
    marketSize: 1.1, wealth: 0.35, unlockCost: 250_000_00 as Cents,
    priceTolerance: 0.6,
  },
] as const;

/**
 * Share of audience attention the player starts with. Rivals hold the rest
 * from the first tick — they are the environment, not an unlock
 * (CONCEPT.md §9). Keep this in step with `config.attention.referenceShare`.
 */
export const PLAYER_START_SHARE = 0.08;

/** Established competitors. Inert this pass: they hold share and nothing else. */
const RIVALS: Array<{ id: string; name: string; brandStanding: number; share: number }> = [
  { id: 'pub_rival_1', name: 'Meridian Cards', brandStanding: 0.55, share: 0.42 },
  { id: 'pub_rival_2', name: 'Halcyon Games', brandStanding: 0.45, share: 0.30 },
  { id: 'pub_rival_3', name: 'Third Coast TCG', brandStanding: 0.35, share: 0.20 },
];

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

    publishers: {
      [playerId]: {
        id: playerId,
        name: 'Player Studio',
        isPlayer: true,
        foundedTick: t0,
        // $500,000. Everything in the model is cents, so the `_00` suffix is
        // load-bearing: without it this reads as $5,000, which does not cover a
        // single print run and disagrees with the borrow ceiling in tickFinance.
        cash: 500_000_00 as Cents,
        debt: 0 as Cents,
        peakDebt: 0 as Cents,
        credit: 0.2,
        brandStanding: 0.02,
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
        policy: null,
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
      segments: Object.fromEntries(
        SEGMENTS.map(g => [g, { size: 100_000, attention: 1, fatigue: 0, goodwill: 0.5 }]),
      ) as SimState['audience']['segments'],
      // The player starts with almost no audience; the rivals below hold the rest.
      shareByPublisher: { [playerId]: PLAYER_START_SHARE },
      fatigueWarned: false,
      actors: { scalpers: 500, resellers: 300, collectors: 5000, speculators: 800 },
      hidden: { scalperInventory: {}, scalperProfitability: 0, scalperBoom: false },
    },

    market: {
      climate: 1,
      climateHistory: emptySeries(t0),
      indexes: { allCards: 100, byPublisher: { [playerId]: 100 }, bySet: {} },
      gradingQueue: [],
      commissionQueue: [],
    },

    inbox: [],
    events: [],
    config,
  };

  const productPreference: Record<ProductKind, number> = {
    pack: 1, boosterBox: 0.8, etb: 0.6, collectionBox: 0.5, tin: 0.4,
    premiumCollection: 0.3, bundle: 0.4, blister: 0.5, surpriseBox: 0.2,
  };

  s.regions[REGION_US] = {
    id: REGION_US,
    name: 'United States',
    marketSize: 1,
    wealth: 0.8,
    unlockCost: 0 as Cents,
    truth: {
      segmentMix: Object.fromEntries(SEGMENTS.map(g => [g, randRange(rng, 0.05, 0.3)])) as Record<AudienceSegment, number>,
      tasteBias: { character: 0.2, location: -0.1, faction: 0.05, concept: -0.2, event: 0 },
      rarityAppetite: Object.fromEntries(RARITIES.map(r => [r, randRange(rng, 0.5, 1.5)])) as Record<Rarity, number>,
      productPreference,
      priceTolerance: 1,
      readingNoiseSeed: rand(rng),
    },
    knowledge: 0.3,
    unlockedTick: t0,
  };

  // The regions past the home market. Their taste is drawn from `regionRng`,
  // not from `rng`: a single extra draw on the main stream renumbers every
  // later roll in the run and moves every balance number in HANDOFF.md. The
  // same rule that keeps the grader roster on literals applies here.
  const rrng = s.regionRng;
  for (const seed of REGION_SEEDS) {
    s.regions[seed.id] = {
      id: seed.id,
      name: seed.name,
      marketSize: seed.marketSize,
      wealth: seed.wealth,
      unlockCost: seed.unlockCost,
      truth: {
        segmentMix: Object.fromEntries(
          SEGMENTS.map(g => [g, randRange(rrng, 0.05, 0.3)])) as Record<AudienceSegment, number>,
        tasteBias: Object.fromEntries(
          IP_KINDS.map(k => [k, randRange(rrng, -0.3, 0.3)])) as Record<IpKind, number>,
        rarityAppetite: Object.fromEntries(
          RARITIES.map(r => [r, randRange(rrng, 0.5, 1.5)])) as Record<Rarity, number>,
        productPreference: Object.fromEntries(
          Object.keys(productPreference).map(
            k => [k, productPreference[k as ProductKind]! * randRange(rrng, 0.6, 1.4)],
          )) as Record<ProductKind, number>,
        priceTolerance: seed.priceTolerance,
        readingNoiseSeed: rand(rrng),
      },
      // A region you have never sold into is a region you know nothing about.
      knowledge: 0,
      unlockedTick: null,
    };
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
      audienceSize: Math.round(20_000 * Math.pow(1.6, randRange(rrng, 0, 6))),
      influence: randRange(rrng, 0.2, 0.9) as Unit,
      affinityIps: [],
      relationship: randRange(rrng, 0.05, 0.3) as Unit,
    };
  }

  // The full roster exists from tick 0; only the LGS network is open. The rest
  // are bought with the `purchaseUnlock` decision once brand standing clears
  // their gate, in the order CONCEPT.md §9 lays out.
  const CHANNEL_SEEDS: Array<Omit<Channel, 'lastAllocatedTick'>> = [
    {
      id: CHANNEL_IDS.lgs, name: 'LGS Network', kind: 'lgs', regionId: REGION_US,
      relationship: 0.6, capacityUnits: 12_000, marginShare: 0.55,
      minimumOrder: 1, reliability: 0.8,
      requiredBrandStanding: 0, unlocked: true, queueCapacity: null,
    },
    {
      id: CHANNEL_IDS.online, name: 'Online Retail', kind: 'online', regionId: REGION_US,
      relationship: 0.5, capacityUnits: 40_000, marginShare: 0.5,
      minimumOrder: 500, reliability: 0.85,
      requiredBrandStanding: 0.12, unlocked: false, queueCapacity: null,
    },
    {
      id: CHANNEL_IDS.distributor, name: 'National Distributor', kind: 'distributor', regionId: REGION_US,
      relationship: 0.5, capacityUnits: 120_000, marginShare: 0.38,
      minimumOrder: 2_000, reliability: 0.9,
      requiredBrandStanding: 0.25, unlocked: false, queueCapacity: null,
    },
    {
      id: CHANNEL_IDS.bigbox, name: 'Big Box Chains', kind: 'bigbox', regionId: REGION_US,
      relationship: 0.4, capacityUnits: 250_000, marginShare: 0.3,
      minimumOrder: 10_000, reliability: 0.75,
      requiredBrandStanding: 0.45, unlocked: false, queueCapacity: null,
    },
    {
      id: CHANNEL_IDS.direct, name: 'Direct Store', kind: 'direct', regionId: REGION_US,
      relationship: 1, capacityUnits: 25_000, marginShare: 1,
      minimumOrder: 1, reliability: 1,
      requiredBrandStanding: 0.6, unlocked: false, queueCapacity: 5_000,
    },
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
  // CONCEPT.md §7's "a rival takes your chains" hook rather than a purchase.
  for (const seed of REGION_SEEDS) {
    const region = s.regions[seed.id]!;
    const scale = seed.marketSize;
    const abroad: Array<Omit<Channel, 'lastAllocatedTick'>> = [
      {
        id: `ch_lgs_${seed.id}` as ChannelId, name: `${seed.name} LGS Network`,
        kind: 'lgs', regionId: region.id,
        relationship: 0.45, capacityUnits: Math.round(12_000 * scale), marginShare: 0.55,
        minimumOrder: 1, reliability: 0.75,
        requiredBrandStanding: 0, unlocked: false, queueCapacity: null,
      },
      {
        id: `ch_online_${seed.id}` as ChannelId, name: `${seed.name} Online Retail`,
        kind: 'online', regionId: region.id,
        relationship: 0.45, capacityUnits: Math.round(40_000 * scale), marginShare: 0.5,
        minimumOrder: 500, reliability: 0.8,
        requiredBrandStanding: 0.12, unlocked: false, queueCapacity: null,
      },
      {
        id: `ch_dist_${seed.id}` as ChannelId, name: `${seed.name} Distributor`,
        kind: 'distributor', regionId: region.id,
        relationship: 0.4, capacityUnits: Math.round(120_000 * scale), marginShare: 0.38,
        minimumOrder: 2_000, reliability: 0.85,
        requiredBrandStanding: 0.25, unlocked: false, queueCapacity: null,
      },
    ];
    for (const ch of abroad) s.channels[ch.id] = { ...ch, lastAllocatedTick: null };
  }

  // Rivals exist from tick 0 and already own most of the audience. They don't
  // release sets, spend attention, or move yet — their policy is recorded for
  // a later pass; what bites today is the share of attention they hold.
  for (const r of RIVALS) {
    const id = r.id as PublisherId;
    s.publishers[id] = {
      id,
      name: r.name,
      isPlayer: false,
      foundedTick: t0,
      // $2,000,000. Inert today — rivals never spend — but kept in the same
      // cents convention as the player so it stays right when they do.
      cash: 2_000_000_00 as Cents,
      debt: 0 as Cents,
      peakDebt: 0 as Cents,
      credit: 0.6,
      brandStanding: r.brandStanding,
      unlocks: {
        channels: [], regions: [REGION_US],
        marketResearch: 0, communityTeam: 0, analytics: 0,
        printQualityTiers: ['budget', 'standard', 'premium'],
        specialtySetSlots: 0, canHostEvents: false, directStore: false,
      },
      policy: {
        aggression: randRange(rng, 0.3, 0.8),
        setsPerYearTarget: Math.round(randRange(rng, 1, 4)),
        chaseHeaviness: randRange(rng, 0.2, 0.8),
        qualityBias: randRange(rng, 0.2, 0.8),
        reprintWillingness: randRange(rng, 0.1, 0.6),
      },
      retainers: {},
      ledger: [],
      deadTick: null,
      deathCause: null,
    };
    s.audience.shareByPublisher[id] = r.share;
  }

  const personalities = ARTIST_PERSONALITIES;
  const specialties = ARTIST_SPECIALTIES;
  for (let i = 0; i < 6; i++) {
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
    const rate0 = Math.round(randRange(rng, 7_500, 45_000)) as Cents;
    s.artists[id] = {
      id,
      name: `Artist ${i + 1}`,
      personality: pick(rng, personalities),
      specialty: pick(rng, specialties),
      stats: {
        linework: randRange(rng, 0.2, 0.6),
        color: randRange(rng, 0.2, 0.6),
        composition: randRange(rng, 0.2, 0.6),
        speed: randRange(rng, 0.3, 0.8),
        reliability: randRange(rng, 0.4, 0.9),
      },
      // Cheap and unproven, per CONCEPT.md's opening state.
      rate: rate0,
      baseRate: rate0,
      turnaroundWeeks: Math.round(randRange(rng, 2, 8)),
      reputation: randRange(rng, 0.05, 0.25),
      growth: randRange(rng, 0.0005, 0.004),
      relationship: 0.5,
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
    s.graders[g.id] = {
      ...g,
      reputation: g.reputation as Unit,
      marketShare: g.marketShare as Unit,
    };
  }

  return s;
}

/** A grader that has not entered the market yet. Past the end of any run. */
export const GRADER_DORMANT = Number.MAX_SAFE_INTEGER as Tick;

const GRADER_SEEDS: Array<{
  id: GraderId; name: string; reputation: number; strictness: number;
  marketShare: number; tiers: Array<{ name: string; price: Cents; turnaroundWeeks: number }>;
  activeFromTick: Tick;
}> = [
  {
    // The strict, expensive one. Fewer 10s, and the 10s it does hand out carry
    // the reputation premium.
    id: 'grd_pinnacle' as GraderId, name: 'Pinnacle Grading',
    reputation: 0.85, strictness: 1.15, marketShare: 0.55,
    tiers: [
      { name: 'bulk', price: 12_00 as Cents, turnaroundWeeks: 16 },
      { name: 'standard', price: 30_00 as Cents, turnaroundWeeks: 8 },
      { name: 'express', price: 90_00 as Cents, turnaroundWeeks: 3 },
    ],
    activeFromTick: 0 as Tick,
  },
  {
    // Cheaper, softer, faster. Grades more copies and is trusted less for it.
    id: 'grd_cardsafe' as GraderId, name: 'Cardsafe',
    reputation: 0.6, strictness: 0.9, marketShare: 0.32,
    tiers: [
      { name: 'bulk', price: 8_00 as Cents, turnaroundWeeks: 12 },
      { name: 'standard', price: 20_00 as Cents, turnaroundWeeks: 6 },
      { name: 'express', price: 60_00 as Cents, turnaroundWeeks: 2 },
    ],
    activeFromTick: 0 as Tick,
  },
  {
    id: 'grd_apex' as GraderId, name: 'Apex Authentication',
    reputation: 0.7, strictness: 1, marketShare: 0.13,
    tiers: [
      { name: 'standard', price: 25_00 as Cents, turnaroundWeeks: 7 },
      { name: 'express', price: 75_00 as Cents, turnaroundWeeks: 2 },
    ],
    activeFromTick: GRADER_DORMANT,
  },
];
