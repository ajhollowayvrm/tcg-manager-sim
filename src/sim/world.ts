/**
 * Initial state bootstrap. Matches CONCEPT.md §9 "Opening state (year 0)":
 * US only, LGS-only channel access, a small pool of cheap unproven artists,
 * no research/community/analytics unlocks yet.
 */
import type {
  SimState, SimConfig, Tick, Cents, PublisherId, RegionId, ArtistId,
  AudienceSegment, Rarity, ArtistPersonality, ArtistSpecialty, IpKind, ProductKind,
  Channel,
} from './types.ts';
import { seedRng, rand, randRange, pick } from './rng.ts';
import { CHANNEL_IDS } from './channels.ts';
import { emptySeries } from './series.ts';

export const SEGMENTS: AudienceSegment[] = [
  'kids', 'teens', 'adults', 'lapsed', 'investors', 'artFans',
];

export const RARITIES: Rarity[] = [
  'common', 'uncommon', 'rare', 'doubleRare', 'ultraRare',
  'illustrationRare', 'specialIllustrationRare', 'hyperRare', 'promo',
];

export const IP_KINDS: IpKind[] = ['character', 'location', 'faction', 'concept', 'event'];

export const REGION_US = 'reg_us' as RegionId;

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
        cash: 500_000 as Cents,
        debt: 0 as Cents,
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
    graders: {},
    creators: {},
    chains: {},
    collabs: {},

    audience: {
      segments: Object.fromEntries(
        SEGMENTS.map(g => [g, { size: 100_000, attention: 1, fatigue: 0, goodwill: 0.5 }]),
      ) as SimState['audience']['segments'],
      // The player starts with almost no audience; the rivals below hold the rest.
      shareByPublisher: { [playerId]: PLAYER_START_SHARE },
      actors: { scalpers: 500, resellers: 300, collectors: 5000, speculators: 800 },
    },

    market: {
      climate: 1,
      climateHistory: emptySeries(t0),
      indexes: { allCards: 100, byPublisher: { [playerId]: 100 }, bySet: {} },
      gradingQueue: [],
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
  };

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
      cash: 2_000_000 as Cents,
      debt: 0 as Cents,
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
      ledger: [],
      deadTick: null,
      deathCause: null,
    };
    s.audience.shareByPublisher[id] = r.share;
  }

  const personalities: ArtistPersonality[] = ['collaborative', 'precious', 'prolific', 'mercurial', 'reclusive'];
  const specialties: ArtistSpecialty[] = ['creature', 'landscape', 'character', 'graphic', 'ensemble'];
  for (let i = 0; i < 6; i++) {
    const id = nextId(s, 'art') as ArtistId;
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
      rate: Math.round(randRange(rng, 50, 300)) as Cents,
      turnaroundWeeks: Math.round(randRange(rng, 2, 8)),
      reputation: randRange(rng, 0.05, 0.25),
      growth: randRange(rng, 0.0005, 0.004),
      relationship: 0.5,
      exclusiveTo: null,
      available: true,
    };
  }

  return s;
}
