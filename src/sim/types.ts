/**
 * TCG Manager Simulator — sim core data model
 *
 * Pure domain types. No React, no DOM, no Date, no I/O.
 * Everything here must be JSON-serializable so a run can be snapshotted,
 * replayed, and diffed.
 *
 * Suggested location: src/sim/types.ts
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

type Brand<T, B> = T & { readonly __brand: B };

/** Weeks elapsed since the run start (2026-01-01). One tick = one week. */
export type Tick = Brand<number, 'Tick'>;

/** Money is always integer cents. Never floats. */
export type Cents = Brand<number, 'Cents'>;

/** Normalized 0..1 unless a type says otherwise. */
export type Unit = number;

export type PublisherId = Brand<string, 'PublisherId'>;
export type IpId = Brand<string, 'IpId'>;
export type CardId = Brand<string, 'CardId'>;
export type PrintingId = Brand<string, 'PrintingId'>;
export type SetId = Brand<string, 'SetId'>;
export type ProductId = Brand<string, 'ProductId'>;
export type ProductLineId = Brand<string, 'ProductLineId'>;
export type ArtistId = Brand<string, 'ArtistId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type RegionId = Brand<string, 'RegionId'>;
export type GraderId = Brand<string, 'GraderId'>;
export type CreatorId = Brand<string, 'CreatorId'>;
export type ChainId = Brand<string, 'ChainId'>;
export type CollabId = Brand<string, 'CollabId'>;
export type EventId = Brand<string, 'EventId'>;
export type DropId = Brand<string, 'DropId'>;
export type CommissionId = Brand<string, 'CommissionId'>;

/** Seeded PRNG state. Serializable so runs are exactly reproducible. */
export interface RngState {
  readonly algorithm: 'xoshiro128ss';
  s: [number, number, number, number];
}

/**
 * Sparse time series. A point is written only when the value crosses a
 * threshold; consumers interpolate between points.
 *
 * `compactedBefore` marks where resolution has been downsampled. Points at or
 * after it are weekly-eligible; points before it have already been rolled up.
 */
export interface SparseSeries {
  points: Array<{ t: Tick; v: number }>;
  compactedBefore: Tick;
  lastWrittenValue: number;
}

// ---------------------------------------------------------------------------
// Root state
// ---------------------------------------------------------------------------

export interface SimState {
  schemaVersion: number;
  seed: string;
  rng: RngState;
  /**
   * A second, independent stream, used by grading and nothing else. Grading is
   * an observer of the value engine, so its rolls must not renumber the value
   * engine's: sharing `rng` would shift every later draw in the run and make
   * the five value targets in HANDOFF.md incomparable across the change.
   */
  gradingRng: RngState;
  /**
   * A third stream, for the art pipeline. Unlike grading, art is NOT an
   * observer: `Card.artQuality` is a direct multiplier on price, so this pass
   * moves the value targets whatever we do. The separate stream is not there to
   * keep the CSV identical — it cannot — but so that a commission roll does not
   * renumber the value engine's draws, which is what makes the movement
   * attributable to the art multiplier rather than to reshuffled noise.
   */
  artRng: RngState;
  /**
   * A fourth stream, for region readings. A reading is an observation of
   * `Region.truth`, so like grading it must not renumber the value engine's
   * draws — otherwise scoring a reading changes the prices it was read against.
   */
  regionRng: RngState;
  /**
   * A fifth stream, for the secondary-market actors. These populations move
   * prices, so unlike grading they are not observers and the value targets do
   * move — the stream is separate so the movement is attributable to the
   * mechanism rather than to renumbered noise.
   */
  actorRng: RngState;
  tick: Tick;

  /** Monotonic counter for deterministic id generation. */
  idCounter: number;

  /** Derived lookup, kept in state so it survives serialization. */
  printingByCard: Record<string, PrintingId>;

  playerId: PublisherId;
  /** The market the studio starts in. Every global fallback resolves here. */
  homeRegionId: RegionId;

  publishers: Record<PublisherId, Publisher>;
  ips: Record<IpId, IpEntity>;
  cards: Record<CardId, Card>;
  sets: Record<SetId, CardSet>;
  products: Record<ProductId, Product>;
  printings: Record<PrintingId, Printing>;
  artists: Record<ArtistId, Artist>;
  channels: Record<ChannelId, Channel>;
  regions: Record<RegionId, Region>;
  graders: Record<GraderId, Grader>;
  creators: Record<CreatorId, Creator>;
  chains: Record<ChainId, Chain>;
  collabs: Record<CollabId, Collab>;
  drops: Record<DropId, Drop>;

  audience: AudienceState;
  market: MarketState;

  /** Decisions submitted but not yet consumed by a tick. */
  inbox: Decision[];
  /** Append-only. Drives the feed, and the harness reads it for metrics. */
  events: SimEvent[];

  /** Balance constants, hot-swappable for tuning runs. */
  config: SimConfig;
}

// ---------------------------------------------------------------------------
// Publishers
// ---------------------------------------------------------------------------

export interface Publisher {
  id: PublisherId;
  name: string;
  foundedTick: Tick;

  cash: Cents;
  debt: Cents;
  /**
   * The widest the debt ever got, not where it ended. A publisher that borrows
   * to the ceiling and climbs back out looks identical to one that never
   * borrowed if you only read `debt` at the end of the run.
   */
  peakDebt: Cents;
  /** 0..1. Raises borrowing ceiling and lowers rate. */
  credit: Unit;
  /** 0..1. Gates channels, collabs, artist interest, grader attention. */
  brandStanding: Unit;

  unlocks: UnlockState;

  /**
   * Standing arrangements with artists. A retainer or an exclusive is a weekly
   * bill that runs whether or not the studio is commissioning anything, which
   * is what makes locking an artist down a decision rather than a free win.
   */
  retainers: Record<ArtistId, Retainer>;

  ledger: LedgerEntry[];
  deadTick: Tick | null;
  deathCause: DeathCause | null;
}

export type DeathCause =
  | 'overprint'
  | 'attention_collapse'
  | 'debt_spiral'
  | 'channel_collapse';

export interface UnlockState {
  channels: ChannelId[];
  regions: RegionId[];
  /** 0..3 — drives how sharp affection and market readings are. See readings.ts */
  marketResearch: number;
  communityTeam: number;
  analytics: number;
  printQualityTiers: PrintQualityTier[];
  specialtySetSlots: number;
  canHostEvents: boolean;
  directStore: boolean;
}

export interface LedgerEntry {
  t: Tick;
  amount: Cents;
  category:
    | 'print_run' | 'art_commission' | 'staff' | 'marketing' | 'event'
    | 'licensing' | 'sales' | 'interest' | 'principal' | 'unlock'
    /** The studio exists. Payable whether or not it releases anything. */
    | 'overhead'
    /** Warehousing unsold stock. The bill an overprint keeps paying. */
    | 'storage'
    | 'misc';
  note: string;
  refId?: string;
}

// ---------------------------------------------------------------------------
// IP
// ---------------------------------------------------------------------------

export type IpKind = 'character' | 'location' | 'faction' | 'concept' | 'event';

/**
 * The audience segments.
 *
 * `lapsed` was one of these and is not any more. With the population / reached
 * / engaged split it *is* `reached - engaged`, across every segment at once, so
 * keeping it as a seventh name double-counted the same people.
 *
 * Two kinds. The age cohorts flow into each other on a demographic clock, so a
 * kid who starts at eight is an adult twenty years into a fifty-year run. The
 * motivation segments do not age, because "investor" is not a stage of life.
 */
export type AudienceSegment =
  | 'kids' | 'teens' | 'adults'          // cohorts, which flow
  | 'investors' | 'artFans';             // motivations, which do not

/** The cohort chain, oldest last. Aging walks it in order. */
export const AGE_COHORTS = ['kids', 'teens', 'adults'] as const;

export interface IpEntity {
  id: IpId;
  publisherId: PublisherId;
  name: string;
  kind: IpKind;
  createdTick: Tick;
  relatedIps: IpId[];

  /**
   * GROUND TRUTH — never rendered directly, never exposed to the UI layer.
   * The player only ever sees derived readings (see `readings.ts`).
   */
  truth: {
    /** 0..100. Potential affection ceiling if fully exposed. */
    relatability: number;
    /** -1..1 per segment. Who bonds with this and who bounces off. */
    affinities: Record<AudienceSegment, number>;
    /** <1 decays after exposure fades, >1 compounds (mascot behaviour). */
    longevity: number;
    /** Stable per-IP noise offset so displayed readings don't jitter. */
    readingNoiseSeed: number;
  };

  /**
   * REALIZED state. Affection converges toward `truth.relatability` as
   * exposure accumulates — this is why a set can flop: you can spend heavily
   * on exposure and watch affection refuse to climb.
   */
  exposure: number;
  affection: number;
  affectionHistory: SparseSeries;

  /**
   * Vintage-driven revival. Rises when this IP's old printings appreciate or
   * draw community attention, independent of anything you're printing now.
   * Feeding a resurging character into a modern set is one of the few real
   * information edges the player gets — and it's read from the feed, not a stat.
   */
  resurgence: number;
  resurgenceHistory: SparseSeries;

  appearanceCount: number;
  cameoCount: number;
  firstPrintingId: PrintingId | null;
  isMascot: boolean;
}

// ---------------------------------------------------------------------------
// Cards, chains, art
// ---------------------------------------------------------------------------

export type Rarity =
  | 'common' | 'uncommon' | 'rare' | 'doubleRare'
  | 'ultraRare' | 'illustrationRare' | 'specialIllustrationRare'
  | 'hyperRare' | 'promo';

export type Treatment =
  | 'none' | 'holo' | 'reverseHolo' | 'textured'
  | 'goldFoil' | 'etched' | 'fullArt' | 'jumbo';

export interface Card {
  id: CardId;
  publisherId: PublisherId;
  name: string;
  createdTick: Tick;

  subjectIp: IpId;
  /** IP appearing in the art but not named on the card. Feeds cast_desire. */
  cameos: IpId[];

  rarity: Rarity;
  treatment: Treatment;
  serialized: { runSize: number } | null;

  artistId: ArtistId;
  artBrief: ArtBrief;
  /**
   * 0..1, rolled when the commissioned art lands, from artist stats x brief
   * fit x budget. Immutable from that moment: the roll is the artist's work,
   * and only their `reputation` keeps moving afterwards.
   */
  artQuality: Unit;
  /**
   * Where the illustration came from. A card designed and never commissioned,
   * or commissioned too late for its release, ships as `house` — cheap
   * in-house filler art at the quality floor. That is the cost of missing the
   * calendar, and it is why a late commission cannot block a release.
   */
  artSource: 'pending' | 'commissioned' | 'house';

  progressionLink: { chainId: ChainId; position: number } | null;
  illustrationLink: ChainId | null;

  flavorText: string;
}

export interface ArtBrief {
  mood: string;
  composition: 'portrait' | 'action' | 'landscape' | 'ensemble' | 'abstract';
  /** Higher spend widens the artist pool and improves the quality roll. */
  budget: Cents;
  notes: string;
}

export type ChainKind = 'progression' | 'illustration';

/**
 * A collectible chain. Incomplete chains create pull demand; chains spanning
 * sets are the hedge that can carry a set with a weak subject.
 */
export interface Chain {
  id: ChainId;
  kind: ChainKind;
  name: string;
  cardIds: CardId[];
  /**
   * The sets its members were designed into. `Card` carries no `setId`, so
   * recording it here is what lets `spansSets` be maintained without scanning
   * every set on every link.
   */
  setIds: SetId[];
  spansSets: boolean;
}

// ---------------------------------------------------------------------------
// Sets and products
// ---------------------------------------------------------------------------

export type SetType = 'main' | 'specialty' | 'subset' | 'promo' | 'collab';

export type SetStatus =
  | 'design' | 'committed' | 'revealing' | 'released' | 'archived';

export interface CardSet {
  id: SetId;
  publisherId: PublisherId;
  name: string;
  type: SetType;
  status: SetStatus;

  cardIds: CardId[];
  productIds: ProductId[];
  collabId: CollabId | null;

  /** Staggered release. Region order is the preview mechanism. */
  regionSchedule: Array<{ regionId: RegionId; releaseTick: Tick }>;

  /**
   * What a reading of each region said this set was worth, taken at the moment
   * the print run was committed — the moment the bet is placed and stops being
   * guessable. Null until commit.
   *
   * This is the region twin of `SetPerformance.chaseIndex`: the harness scores
   * the reading against the truth, and a reading nobody can score is a reading
   * nobody can tune. Nothing in the value engine reads it.
   */
  regionReadings: Record<RegionId, number> | null;

  designStartTick: Tick;
  /** Print runs lock here — before reveal, before any real signal. */
  commitTick: Tick | null;
  revealStartTick: Tick | null;

  budget: Cents;
  actualCost: Cents;
  printQuality: PrintQualityTier;
  attentionCost: number;

  performance: SetPerformance | null;
  /** Pre-launch demand, built across the reveal window. Null until commit. */
  hype: SetHype | null;
}

/**
 * The reveal window, in state. CONCEPT.md §2: "Signal arrives; the print run
 * does not change." Everything here shapes demand or reads it; nothing here can
 * reach back and change what was printed.
 */
export interface SetHype {
  /** Weeks between preview drops. */
  cadence: number;
  /** Cards previewed so far. Each drip sharpens `signal` and costs attention. */
  cardsRevealed: number;
  /** Tick the last drip went out. */
  lastRevealTick: Tick | null;

  /** Hype earned by the previews themselves. */
  revealHype: number;
  /** Cumulative cash committed. Hype is derived from the total, so it diminishes. */
  marketingSpend: Cents;
  /** Prerelease events hosted, and the scale they were hosted at. */
  prereleases: number;
  prereleaseScale: number;

  /** The three components summed. Multiplies demand, then decays after release. */
  level: number;
  /** `level` at the moment of release, kept for the post-mortem. */
  levelAtRelease: number | null;

  /**
   * The player-visible read on how the reveal is going. A NOISY measurement of
   * the set's true chase, never the truth. The print run is already committed
   * when this arrives, so the signal has to be able to lie — a signal that
   * cannot be wrong turns the blind bet into a solved problem.
   */
  signal: number;
}

export interface SetPerformance {
  unitsSold: number;
  unitsUnsold: number;
  revenue: Cents;
  sellThroughByChannel: Record<ChannelId, Unit>;
  chaseIndex: number;
  aftermarketIndex: number;
  goodwillDelta: number;
}

export type PrintQualityTier = 'budget' | 'standard' | 'premium' | 'archival';

export type ProductKind =
  | 'pack' | 'boosterBox' | 'etb' | 'collectionBox' | 'tin'
  | 'premiumCollection' | 'bundle' | 'blister' | 'surpriseBox';

/**
 * A SKU as printed for one region. Regional variants of the same concept share
 * a `lineId` — a region can get a different mix, different pack counts, or a
 * SKU the other regions never see.
 */
export interface Product {
  id: ProductId;
  lineId: ProductLineId;
  setId: SetId;
  regionId: RegionId;
  kind: ProductKind;

  packsPerUnit: number;
  cardsPerPack: number;

  /** Sticker price only. What consumers actually pay is per channel. */
  msrp: Cents;
  unitCogs: Cents;

  unitsPrinted: number;
  unitsRemaining: number;
  allocations: Record<ChannelId, ChannelAllocation>;

  /** Multiplier on reseller/scalper interest for this SKU. */
  scalperAppeal: Unit;

  /** Sealed product has its own market, independent of its singles. */
  market: SealedMarket;
}

export interface ChannelAllocation {
  units: number;
  unitsRemaining: number;
  /**
   * What this channel actually charges. Free to sit above or below MSRP —
   * an LGS marks up hot product, a big box holds at MSRP, online floats.
   */
  streetPrice: Cents;
  soldOutTick: Tick | null;
}

/**
 * Sealed value is coupled to singles but not derived from them. Opening a unit
 * destroys sealed supply and adds singles supply, so a heavily ripped product
 * gets scarcer as its singles get cheaper — and a hoarded one does the reverse.
 */
export interface SealedMarket {
  price: Cents;
  heat: number;
  nostalgia: number;
  history: SparseSeries;

  /**
   * HIDDEN. Sealed supply is permanently opaque — no analytics tier reveals it.
   * You know what you printed; you never know what survived. The player infers
   * scarcity from price action and community chatter instead.
   */
  hidden: {
    sealedRemaining: number;
    /** Fraction of remaining sealed stock opened per tick. Falls as price rises. */
    ripRate: number;
    /** Share of sealed stock held by long-hold collectors vs. flippers. */
    heldByCollectors: Unit;
  };
}

// ---------------------------------------------------------------------------
// Printings — the priced unit
// ---------------------------------------------------------------------------

/**
 * A specific card in a specific set/product/region. The same card printed
 * twice produces two printings with independent markets. Reprints add supply
 * to the card; they never add supply to the original printing.
 */
export interface Printing {
  id: PrintingId;
  cardId: CardId;
  setId: SetId;
  regionId: RegionId;
  releaseTick: Tick;

  printQuantity: number;
  /** Copies per pack opened, on average. */
  pullRate: number;
  printQuality: PrintQualityTier;

  isReprintOf: PrintingId | null;
  error: PrintError | null;

  /**
   * HIDDEN GROUND TRUTH. Never read by anything that renders.
   *
   * `chase` is latent demand for this printing specifically — the reason two
   * commons in the same set do not settle at the same price. It is rolled
   * lognormal at creation, so its median is 1 and its tail is long. This is
   * the term that makes value emergent rather than authored by rarity
   * placement (CONCEPT.md §5).
   */
  truth: { chase: number };

  population: Population;
  market: PrintingMarket;
}

export interface PrintError {
  kind: 'miscut' | 'inkError' | 'missingFoil' | 'wrongBack' | 'textError' | 'crimp';
  /** Fraction of the print run affected. Small is valuable. */
  incidence: number;
  discoveredTick: Tick | null;
}

export interface Population {
  sealed: number;
  opened: number;
  destroyed: number;
  /** Pop report. graded[graderId][grade] = count */
  graded: Record<GraderId, Partial<Record<GradeTier, number>>>;
}

export type GradeTier = '10' | '9.5' | '9' | '8' | '7' | 'below7';

export interface PrintingMarket {
  rawPrice: Cents;
  gradedPrices: Record<GraderId, Partial<Record<GradeTier, Cents>>>;
  /** Short-term speculative multiplier. Decays toward 1. */
  heat: number;
  /** Slow compounding vintage multiplier. The Skyridge term. */
  nostalgia: number;
  liquidity: Unit;
  lastTradeTick: Tick | null;
  rawHistory: SparseSeries;
  gradedHistory: Record<GraderId, Partial<Record<GradeTier, SparseSeries>>>;
}

// ---------------------------------------------------------------------------
// World: regions, channels, graders, creators, collabs
// ---------------------------------------------------------------------------

export interface Region {
  id: RegionId;
  name: string;
  /** Population weight and spending power. */
  marketSize: number;
  wealth: Unit;
  unlockCost: Cents;

  /**
   * GROUND TRUTH — what this region actually likes. Hidden until earned.
   * Tailoring SKUs per region only pays off once `knowledge` is high enough
   * to read this accurately.
   */
  truth: {
    segmentMix: Record<AudienceSegment, Unit>;
    tasteBias: Record<IpKind, number>;
    rarityAppetite: Record<Rarity, number>;
    productPreference: Record<ProductKind, number>;
    priceTolerance: number;
    readingNoiseSeed: number;
  };

  /** 0..1. Grows with research spend and with release history in-region. */
  knowledge: Unit;
  /** Null until the player opens it. `reg_us` is open from tick 0. */
  unlockedTick: Tick | null;
}

export type ChannelKind = 'lgs' | 'distributor' | 'bigbox' | 'online' | 'direct';

export interface Channel {
  id: ChannelId;
  name: string;
  kind: ChannelKind;
  regionId: RegionId;

  /** 0..1. Souring costs allocation capacity and terms. */
  relationship: Unit;
  capacityUnits: number;
  /** Fraction of MSRP the publisher keeps. */
  marginShare: Unit;
  minimumOrder: number;
  reliability: Unit;

  requiredBrandStanding: Unit;
  unlocked: boolean;
  /** Direct store only: drop mechanics. */
  queueCapacity: number | null;

  /**
   * Last tick this channel received an allocation. Visible, not hidden — the
   * channel board shows it, and a long gap is what "under-deliver" means.
   */
  lastAllocatedTick: Tick | null;
}

/**
 * A direct-store drop: a fixed quantity put up at MSRP at a scheduled tick,
 * and gone in one tick whatever happens. This is the discrete counterpart to
 * the continuous sell-through every other channel runs on, and CONCEPT.md §6.5
 * calls it the most volatile scalper interaction in the game.
 */
export interface Drop {
  id: DropId;
  productId: ProductId;
  channelId: ChannelId;
  scheduledTick: Tick;
  /** Units the store intends to put up. Capped by queue capacity and stock at resolve time. */
  offered: number;
  /** True if the engine scheduled this, false if a `scheduleDrop` decision did. */
  automatic: boolean;
  status: 'scheduled' | 'complete';
  result: DropResult | null;
}

export interface DropResult {
  /** Units actually put up, after the queue-capacity and stock caps. */
  offered: number;
  /** Everyone who wanted in. Above `offered` means the queue did not clear. */
  demand: number;
  soldToCollectors: number;
  soldToScalpers: number;
  soldOut: boolean;
  /** Resale premium over MSRP the scalpers were betting on when they queued. */
  expectedPremium: number;
}

export interface Grader {
  id: GraderId;
  name: string;
  reputation: Unit;
  /** Higher = fewer 10s. Interacts with print quality. */
  strictness: number;
  marketShare: Unit;
  /** Cheapest first. A submitter buys the best tier the card can justify. */
  tiers: Array<{ name: string; price: Cents; turnaroundWeeks: number }>;
  /**
   * Tick this grader started taking submissions. A grader that has not entered
   * the player's market yet carries a tick past the end of any run, and the
   * engine sets this to the real tick when brand standing pulls them in
   * (CONCEPT.md §7: extra graders are something brand standing buys you).
   */
  activeFromTick: Tick;
}

export type ArtistPersonality =
  | 'collaborative' | 'precious' | 'prolific' | 'mercurial' | 'reclusive';

export type ArtistSpecialty =
  | 'creature' | 'landscape' | 'character' | 'graphic' | 'ensemble';

export interface Artist {
  id: ArtistId;
  name: string;
  personality: ArtistPersonality;
  specialty: ArtistSpecialty;
  stats: {
    linework: Unit; color: Unit; composition: Unit; speed: Unit; reliability: Unit;
  };
  rate: Cents;
  /**
   * What they charged when they arrived. The live `rate` is driven off this,
   * never off itself — a target computed from the current rate compounds, and
   * a career-long reputation climb turns into an exponential fee.
   */
  baseRate: Cents;
  turnaroundWeeks: number;

  /**
   * Current reputation. The value engine reads this LIVE, so an unknown you
   * hired in year 2 lifts the price of their old cards once they break out.
   */
  reputation: Unit;
  /** HIDDEN. Career compounding rate. Never shown; scouting is a gamble. */
  growth: number;

  relationship: Unit;
  exclusiveTo: PublisherId | null;
  available: boolean;
}

export interface Creator {
  id: CreatorId;
  name: string;
  format: 'ripAndShip' | 'review' | 'openings' | 'investing';
  audienceSize: number;
  /** How much a mention moves heat. */
  influence: Unit;
  affinityIps: IpId[];
  relationship: Unit;
}

export interface Collab {
  id: CollabId;
  name: string;
  kind: 'externalIp' | 'event' | 'retailExclusive';
  licenseFee: Cents;
  /** Segments this collab reaches that your brand otherwise doesn't. */
  reachBonus: Record<AudienceSegment, number>;
  requiredBrandStanding: Unit;
  /** An unsigned offer lapses here. Null once signed — a signed deal does not expire. */
  expiresTick: Tick | null;
  /** The set this collab was signed for. Null while it is still an offer. */
  signedForSetId: SetId | null;
  signedTick: Tick | null;
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export interface AudienceState {
  /**
   * Per region, per segment. A region is its own market with its own people,
   * which is what makes opening one an act of acquisition rather than a size
   * multiplier applied to somebody else's audience.
   */
  regions: Record<RegionId, Record<AudienceSegment, SegmentState>>;

  /** Units sold into each region lately, decaying. Drives acquisition. */
  recentUnitsByRegion: Record<RegionId, number>;

  /**
   * Latched, so `fatigueWarning` fires on the crossing rather than every tick
   * the audience stays tired.
   */
  fatigueWarned: boolean;

  actors: {
    scalpers: number;
    resellers: number;
    collectors: number;
    speculators: number;
  };

  /**
   * HIDDEN. The scalper population's books. The player sees drop chaos, resale
   * prices and their own goodwill; they never see how much stock the scalpers
   * are sitting on or what it is earning them.
   */
  hidden: {
    /** Open scalper positions, by product. Absent means they hold none. */
    scalperInventory: Record<ProductId, ScalperPosition>;
    /** Rolling realized resale premium. Drives the population. */
    scalperProfitability: number;
    /** Latched, so `scalperCrash` fires on the crossing and not every tick after. */
    scalperBoom: boolean;
  };
}

/**
 * One scalper position. A scalper flips; they do not hold. Carrying the basis
 * and the age is what keeps that true: their return is measured against what
 * they paid, and the position is force-cleared once it stops being a flip.
 * Without both, a position rides twenty years of vintage appreciation and
 * reports it as scalping profit.
 */
export interface ScalperPosition {
  units: number;
  /** Weighted average of what they paid. */
  basis: Cents;
  /** Weighted average tick they bought at. */
  openedTick: Tick;
}

/**
 * One audience segment, in one region.
 *
 * Three layers, because "how many people are there" and "how many are buying"
 * are different questions and the growth arc is the distance between them:
 *
 *   population  people who could play. Demographics, not marketing.
 *   reached     people who know the game and have bought at least once.
 *   engaged     people currently active. THIS is what demand reads.
 *
 * `engaged <= reached <= population` always; `checkInvariants` enforces it.
 *
 * The gap between `reached` and `engaged` is the lapsed reservoir. It is not a
 * segment of its own — a lapsed teenager is still a teenager — and re-engaging
 * it is cheaper than acquiring somebody new, which is what gives a collab or a
 * vintage price run a second job beyond raw reach.
 */
export interface SegmentState {
  population: number;
  reached: number;
  engaged: number;
  /** Finite. Every release consumes it. */
  attention: number;
  /** Rises with over-releasing. Suppresses chase demand. Slow to recover. */
  fatigue: number;
  /** Long-memory brand trust. Punishes floods and shortages alike. */
  goodwill: number;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export interface MarketState {
  /** Global speculative climate. Bull runs and crashes. */
  climate: number;
  climateHistory: SparseSeries;
  /** Indexes for charts and for harness metrics. */
  indexes: {
    allCards: number;
    byPublisher: Record<PublisherId, number>;
    bySet: Record<SetId, number>;
  };
  gradingQueue: GradingSubmission[];
  /** Art that has been paid for and not yet come back. */
  commissionQueue: Commission[];
}

/**
 * One commissioned illustration. The fee is charged when the commission is
 * placed, not when the art lands: the money is gone whether or not the artist
 * delivers something good, and whether or not it arrives before the set ships.
 */
export interface Commission {
  id: CommissionId;
  cardId: CardId;
  artistId: ArtistId;
  publisherId: PublisherId;
  brief: ArtBrief;
  fee: Cents;
  placedTick: Tick;
  /** When the art comes back. Set at placement from the artist's turnaround. */
  returnsTick: Tick;
}

/**
 * How a publisher is paying an artist. `perCard` is no standing arrangement at
 * all; the other two cost money every week whether or not a brief is placed.
 */
export type ArtistTerms = 'perCard' | 'retainer' | 'exclusive';

export interface Retainer {
  artistId: ArtistId;
  terms: ArtistTerms;
  sinceTick: Tick;
  weeklyFee: Cents;
}

export interface GradingSubmission {
  printingId: PrintingId;
  graderId: GraderId;
  tierName: string;
  quantity: number;
  submittedTick: Tick;
  returnsTick: Tick;
}

// ---------------------------------------------------------------------------
// Decisions — the only way the outside world touches the sim
// ---------------------------------------------------------------------------

/**
 * Ids are minted by the submitter, not the engine, and travel inside the
 * payload. That's what lets a caller chain a multi-step release (create set →
 * design cards → define product → commit run) in one batch, and it puts the
 * ids in the decision log itself so a replay reconstructs identical entities.
 */
export type Decision =
  | { type: 'createIp'; tick: Tick; payload: { id: IpId; name: string; kind: IpKind } }
  | { type: 'createSet'; tick: Tick; payload: { id: SetId; name: string; setType: SetType; targetSize: number } }
  | {
      type: 'designCard'; tick: Tick; payload: {
        id: CardId; setId: SetId; subjectIp: IpId; cameos: IpId[];
        rarity: Rarity; artistId: ArtistId;
        /** Optional. The engine derives each of these when not supplied. */
        name?: string; treatment?: Treatment; serialized?: { runSize: number } | null;
        artBrief?: Partial<ArtBrief>; flavorText?: string;
        /**
         * Puts this card in a collectible chain. The engine mints the chain the
         * first time one is named, so a caller does not have to create it first.
         */
        progressionLink?: { chainId: ChainId; position: number };
      };
    }
  | { type: 'commissionArt'; tick: Tick; payload: { cardId: CardId; artistId: ArtistId; brief: ArtBrief } }
  | {
      type: 'defineProduct'; tick: Tick; payload: {
        id: ProductId; setId: SetId; kind: ProductKind; regionId: RegionId;
        packsPerUnit: number; msrp: Cents; cardsPerPack?: number;
      };
    }
  | { type: 'commitPrintRun'; tick: Tick; payload: { setId: SetId; quantities: Record<ProductId, number>; quality: PrintQualityTier } }
  | { type: 'allocate'; tick: Tick; payload: { productId: ProductId; allocations: Record<ChannelId, number> } }
  | { type: 'scheduleReveal'; tick: Tick; payload: { setId: SetId; startTick: Tick; cadence: number } }
  | { type: 'hostPrerelease'; tick: Tick; payload: { setId: SetId; scale: number; budget: Cents } }
  | { type: 'reprint'; tick: Tick; payload: { cardId: CardId; intoSetId: SetId; quantity: number } }
  | { type: 'hireArtist'; tick: Tick; payload: { artistId: ArtistId; terms: 'perCard' | 'retainer' | 'exclusive' } }
  | { type: 'purchaseUnlock'; tick: Tick; payload: { unlock: keyof UnlockState; detail?: string } }
  | {
      type: 'signCollab'; tick: Tick; payload: {
        collabId: CollabId;
        /** Which set it is for. Defaults to the newest set still in design. */
        setId?: SetId;
      };
    }
  | { type: 'unlockRegion'; tick: Tick; payload: { regionId: RegionId } }
  | { type: 'borrow'; tick: Tick; payload: { amount: Cents } }
  | { type: 'repay'; tick: Tick; payload: { amount: Cents } }
  | { type: 'marketingSpend'; tick: Tick; payload: { setId: SetId; amount: Cents } }
  | {
      type: 'scheduleDrop'; tick: Tick; payload: {
        id: DropId; productId: ProductId; channelId: ChannelId;
        /** Absolute tick, not an offset. A drop in the past resolves on the next tick. */
        atTick: Tick; units: number;
      };
    }
  | { type: 'advance'; tick: Tick; payload: { weeks: number } };

// ---------------------------------------------------------------------------
// Events — the feed, and the harness's metric source
// ---------------------------------------------------------------------------

export type SimEventKind =
  | 'setReleased' | 'setSoldOut' | 'setUnsold'
  | 'priceSpike' | 'priceCrash' | 'newGrail'
  | 'vintageSpike' | 'setRediscovered' | 'characterResurgence'
  | 'sealedSqueeze' | 'communitySentiment'
  | 'errorDiscovered' | 'creatorOpened' | 'collabOffer'
  | 'artistOffer' | 'artistBreakout'
  | 'channelStrained' | 'channelLost' | 'channelUnlocked'
  | 'debtWarning' | 'studioDead'
  | 'fatigueWarning' | 'graderEnteredMarket'
  | 'dropScheduled' | 'dropSoldOut' | 'dropUndersold' | 'scalperCrash'
  | 'artCommissioned' | 'artDelivered' | 'artMissedRelease'
  | 'artistSigned' | 'artistRetired' | 'artistArrived'
  | 'regionUnlocked' | 'collabOffered' | 'collabSigned' | 'collabExpired'
  | 'speculatorSwing';

export interface SimEvent {
  id: EventId;
  t: Tick;
  kind: SimEventKind;
  /** True if this should interrupt a multi-week skip. */
  interrupts: boolean;
  refs: Partial<Record<
    'publisherId' | 'setId' | 'printingId' | 'cardId' | 'ipId' | 'artistId' | 'channelId'
    | 'creatorId' | 'regionId' | 'collabId',
    string
  >>;
  /** Raw data. Prose is generated at presentation time, never stored here. */
  data: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// Config — every tunable constant, hot-swappable for balance runs
// ---------------------------------------------------------------------------

export interface SimConfig {
  startYear: number;

  value: {
    baseCardPrice: Cents;
    cameoWeight: number;
    scarcityExponent: number;
    artMultiplierWeight: number;
    nostalgiaRatePerYear: number;
    heatDecayPerTick: number;
    /** Unexplainable price movement. Non-negotiable: emergence needs noise. */
    noiseSigma: number;
    /** Minimum raw price a printing can settle at. */
    priceFloorCents: Cents;
    /** Combined multiplier above which growth tapers logarithmically instead of compounding freely. */
    priceCeilingMultiple: number;
    /** Upper bound on the short-term speculative heat multiplier. */
    /** Lowest heat a printing can be pushed to. Heat multiplies price. */
    heatFloor: number;
    heatCeiling: number;
    /** Upper bound on the slow-compounding vintage nostalgia multiplier. */
    nostalgiaCeiling: number;
    /** Sigma of the lognormal `Printing.truth.chase` roll. The tail lives here. */
    chaseSigma: number;
    /** Population a printing is measured against in the scarcity term. */
    referencePopulation: number;
    /** Cast desire at which a printing compounds nostalgia at full rate. */
    nostalgiaDesireReference: number;
    /** Price, as a multiple of base, at which a printing compounds nostalgia at full rate. */
    nostalgiaStandingReference: number;
    /** Rate at which an unwanted printing's nostalgia decays back toward 1. */
    nostalgiaDecayPerYear: number;
    /** Chance per price tick that a printing takes a speculative heat spike. */
    shockChancePerTick: number;
    /** Size of that spike. */
    shockGain: number;
    /** Cast desire at which the demand term of the price stack equals 1. */
    desireReference: number;
    /** Share of the way a raw price moves toward its target each price tick. */
    priceLerp: number;
    /** Brand standing's floor in the nostalgia rate. Brand adds on top. */
    nostalgiaBrandFloor: number;
    /** Heat a discovered error adds, divided by its incidence. */
    errorHeatGain: number;
    /** Incidence floor in that division, so a vanishingly rare error is bounded. */
    errorIncidenceFloor: number;
    /** Chance per price tick that an old printing is checked for a resurgence. */
    resurgenceCheckChance: number;
    /** Heat a printing opens at before hype is added. */
    openingHeat: number;
    /** Liquidity a printing opens at. */
    openingLiquidity: number;
    /** What a reprint multiplies the original printing's nostalgia by. */
    reprintNostalgiaPenalty: number;
  };

  affection: {
    exposureToConvergence: number;
    convergenceRate: number;
    decayPerTickUnexposed: number;
    /** How strongly vintage price action on old printings feeds resurgence. */
    resurgenceFromVintage: number;
    /** How strongly resurgence lifts demand for a modern card featuring the IP. */
    resurgenceToModernDemand: number;
    resurgenceDecayPerTick: number;
    /** Units sold per point of IP exposure. */
    unitsPerExposurePoint: number;
    /** Exposure decay applied to every IP each affection tick. */
    exposureDecayPerTick: number;
    /** Minimum printing age, in years, before a vintage run can feed resurgence. */
    resurgenceMinAgeYears: number;
    /** Price growth over base a printing needs before it feeds resurgence. */
    resurgenceMinGrowth: number;
    /** Scale on `resurgenceFromVintage` when it fires. */
    resurgenceGainScale: number;
    /** Range an IP's `relatability` is rolled in. Its ceiling on affection. */
    relatabilityMin: number;
    relatabilityMax: number;
    /** Range a per-segment affinity is rolled in. */
    affinityMin: number;
    affinityMax: number;
    /** Range an IP's `longevity` is rolled in. How well it ages. */
    longevityMin: number;
    longevityMax: number;
  };

  attention: {
    /** The print run one region's demand is measured against. */
    referenceRunUnits: number;
    /** The audience that reference run was calibrated at. */
    referenceAudience: number;
    /** Fatigue at or above this at death makes it attention death. */
    deathFatigueThreshold: number;
    /** Attention at or below this at death makes it attention death. */
    deathAttentionThreshold: number;
    perReleaseCost: number;
    regenPerTick: number;
    fatigueGain: number;
    /** Share of current fatigue that decays each tick, not a flat subtraction. */
    fatigueDecay: number;
    /**
     * Largest share of demand that fatigue can remove, at fatigue 1. The old
     * hard-coded cap was 0.6, which let a publisher release every six weeks,
     * saturate fatigue, and still keep 40% of its demand.
     */
    fatigueBite: number;
    /**
     * Curve shape of the fatigue penalty. Demand is multiplied by
     * `1 - fatigueBite * fatigue ** fatigueExponent`.
     *
     * Above 1 the curve is convex: a normal release cadence sits near zero
     * fatigue and pays almost nothing, while a flooder is crushed. That
     * separation is the whole point — a linear term punishes the careful
     * publisher and the flooder in proportion, which is not what CONCEPT.md
     * §6.2 asks for.
     */
    fatigueExponent: number;
    /** Average fatigue that fires `fatigueWarning`, so the player sees it coming. */
    fatigueWarnThreshold: number;
    goodwillSensitivity: number;
    /** Passive per-tick drift of goodwill, deliberately much slower than fatigueDecay. */
    goodwillRegenPerTick: number;
    /**
     * What goodwill drifts toward when nothing is happening: indifference, not
     * affection. Pulling toward 1 made trust a ratchet — high goodwill raised
     * demand, which raised sell-through, which raised goodwill — and it pinned
     * at exactly 1.000 from year ten in every seed, which is a constant wearing
     * a population's clothes.
     */
    goodwillBaseline: number;
    /**
     * The master demand coefficient. Every unit of demand in the model passes
     * through it, so it is the largest single lever there is.
     */
    demandCoefficient: number;
    /** Exponential demand decay per year since a region's own release date. */
    demandDecayPerYear: number;
    /** Goodwill's floor in the demand stack. Goodwill scales the rest. */
    goodwillDemandFloor: number;
    /** Brand standing's floor in the demand stack. */
    brandDemandFloor: number;
    /** Set chase's floor in the demand stack. */
    chaseDemandFloor: number;
    /** Demand pool below which a product stops selling entirely. */
    demandCutoff: number;
  };

  printing: {
    qualityGradeShift: Record<PrintQualityTier, number>;
    errorRate: Record<PrintQualityTier, number>;
    /** Share of list unit cost that becomes cost of goods sold. */
    cogsCoefficient: number;
    /** Range a print error's incidence is rolled in. */
    errorIncidenceMin: number;
    errorIncidenceMax: number;
    unitCost: Record<PrintQualityTier, Cents>;
    /** Per-price-tick chance that an undiscovered error on a printing gets found. */
    errorDiscoveryChance: number;
  };

  /** The art pipeline. Every number here is a first guess and unswept. */
  art: {
    houseQuality: number;
    statsWeight: number;
    qualityNoise: number;
    budgetQualityGain: number;
    slowestTurnaround: number;
    fastestTurnaround: number;
    maxLateWeeks: number;
    relationshipPerCommission: number;
    relationshipDecayPerTick: number;
    minRelationshipToAccept: number;
    brandStandingOffsetsRelationship: number;
    retainerWeeklyMultiple: number;
    exclusiveWeeklyMultiple: number;
    retainerFeeDiscount: number;
    exclusiveFeeDiscount: number;
    newcomerChancePerTick: number;
    retireChancePerTick: number;
    maxRosterSize: number;
    rateGrowthPerReputation: number;
    rateAdjustRate: number;
    /** Range the opening roster's per-card rate is rolled in. */
    openingRateMin: Cents;
    openingRateMax: Cents;
    /** Range a newcomer's per-card rate is rolled in. */
    newcomerRateMin: Cents;
    newcomerRateMax: Cents;
    /** Range the opening roster's craft stats are rolled in. */
    openingStatMin: number;
    openingStatMax: number;
    /** Range a newcomer's craft stats are rolled in. */
    newcomerStatMin: number;
    newcomerStatMax: number;
    /** Range any artist's speed and reliability are rolled in. */
    speedMin: number;
    speedMax: number;
    reliabilityMin: number;
    reliabilityMax: number;
    /** Range the opening roster's turnaround, in weeks, is rolled in. */
    openingTurnaroundMin: number;
    openingTurnaroundMax: number;
    /** Range an artist's starting reputation is rolled in. */
    openingReputationMin: number;
    openingReputationMax: number;
    newcomerReputationMin: number;
    newcomerReputationMax: number;
    /** Range an artist's hidden weekly reputation growth is rolled in. */
    growthMin: number;
    growthMax: number;
    /** Floor and range of the multiplier on weekly reputation growth. */
    reputationGrowthFloor: number;
    reputationGrowthRange: number;
    /** Reputation above which an artist may retire at the top. */
    retireReputationThreshold: number;
    /** Weekly chance they do. */
    retireAtPeakChance: number;
    /** Artists the world opens with. */
    openingRosterSize: number;
    /** Relationship every artist starts on, opening roster and newcomers alike. */
    openingRelationship: number;
  };

  finance: {
    /** Cash the studio opens with. */
    startingCash: Cents;
    /** Credit and brand standing the studio opens with. */
    startingCredit: number;
    startingBrandStanding: number;
    /** Cash base the borrow ceiling is a multiple of. */
    borrowCeilingBase: Cents;
    /** Unsold units at death above which the cause is overprint, not debt. */
    overprintDeathUnits: number;
    /** Weekly credit drift, in the black and in the red. */
    creditGainPerTick: number;
    creditLossPerTick: number;
    /** The brand-standing target: a base plus affection and goodwill terms. */
    brandBase: number;
    brandFromAffection: number;
    brandFromGoodwill: number;
    /** Mean IP affection at which `brandFromAffection` is paid in full. */
    brandAffectionReference: number;
    interestBase: number;
    creditToRate: number;
    borrowCeilingMultiple: number;
    /** How fast brandStanding converges toward its affection/goodwill-driven target each tick. */
    brandConvergenceRate: number;
    /** Weekly cost of the studio existing at all. */
    weeklyOverheadBase: Cents;
    weeklyOverheadPerChannel: Cents;
    weeklyOverheadPerRegion: Cents;
    /** Warehousing, per unsold unit per week. */
    storagePerUnitPerTick: Cents;
  };

  sealed: {
    /** Exponent on printed-over-remaining in the sealed scarcity term. */
    scarcityExponent: number;
    /** Share of the way a sealed price moves toward its target each tick. */
    priceLerp: number;
    /** Price floor, as a multiple of MSRP. */
    priceFloorMultiple: number;
    /** MSRP's weight in the sealed price target, beside `contentsWeight`. */
    msrpWeight: number;
    /** How strongly expected singles value pulls sealed price. */
    contentsWeight: number;
    baseRipRatePerTick: number;
    /** How much rising sealed price suppresses ripping. */
    ripPriceElasticity: number;
    sealedNostalgiaRatePerYear: number;
    /** Share of a product's speculative sealed heat that decays each tick. */
    heatDecayPerTick: number;
    /** Upper bound on that heat multiplier. */
    heatCeiling: number;
  };

  /**
   * Direct-store drops and the scalper population that camps them
   * (CONCEPT.md §6.5, §6.8). The loop is self-regulating: a wide resale premium
   * pulls scalpers in, they buy the drop out, they resell into the premium
   * until it closes, and the population shrinks again when it stops paying.
   */
  drops: {
    /** `scalperAppeal` given to an ETB or premium collection, and to everything else. */
    scalperAppealPremium: number;
    scalperAppealDefault: number;
    /** Weeks between automatic drops while a direct allocation still holds stock. */
    cadenceWeeks: number;
    /** Share of the collector population that considers any one drop. */
    collectorReach: number;
    /** Share of the scalper population that considers any one drop. */
    scalperReach: number;
    /** How much faster a camping scalper clears the queue than a collector. */
    scalperSpeed: number;
    /** Resale premium a scalper needs before a drop is worth camping. */
    breakEvenPremium: number;
    /** Share of held stock a scalper resells per tick at zero premium. */
    baseResaleRate: number;
    /** Weeks after which a position is dumped whatever it is worth. A flip has a clock. */
    holdLimitWeeks: number;
    /**
     * Units per scalper at which a flip pays its full premium. Profit is
     * per-capita, not per-unit: a fixed drop split between twice as many
     * scalpers pays each of them half. This is what stops the population from
     * being a one-way ratchet.
     */
    unitsPerScalperReference: number;
    /** How much a wide premium accelerates that. */
    resaleUrgency: number;
    /** Population change per tick per unit of premium above break-even. */
    populationGrowth: number;
    minScalpers: number;
    maxScalpers: number;
    /** Weight of the newest realized premium in the rolling profitability average. */
    profitabilitySmoothing: number;
    /** Goodwill gained by a drop that reached collectors. */
    goodwillPerCollectorDrop: number;
    /** Goodwill lost by a drop that went to scalpers. */
    goodwillPerScalperDrop: number;
    /** Goodwill lost when the queue dwarfs the stock. Shortages cost trust too. */
    goodwillPerShortage: number;
    /** Sealed heat added by an oversubscribed drop. */
    heatPerOversubscription: number;
    /** Sealed heat removed as scalpers dump inventory back into the market. */
    dumpHeatDrag: number;
  };

  channels: {
    /** Per-kind traits: reach, pricing behaviour and how hard each one sours. */
    traits: Record<ChannelKind, {
      reach: number;
      markupSensitivity: number;
      discountFloor: number;
      priceElasticity: number;
      goodwillPerSellThrough: number;
      strainSensitivity: number;
    }>;
    /** Capacity a fully soured channel keeps. Relationship scales the rest. */
    capacityFloor: number;
    /** Street price floor, as a multiple of MSRP. */
    streetPriceFloorMultiple: number;
    /** Opening state of every channel in the world, by id. */
    seeds: Record<string, {
      relationship: number;
      capacityUnits: number;
      marginShare: number;
      minimumOrder: number;
      reliability: number;
      requiredBrandStanding: number;
      queueCapacity: number;
    }>;
    /** Relationship's floor in a channel's share of the demand pool. */
    demandRelationshipFloor: number;
    /** Relationship gained per evaluation when sell-through beats `sellThroughTarget`. */
    relationshipGainPerSellThrough: number;
    /** Relationship lost per evaluation for allocation still sitting unsold past the grace period. */
    relationshipLossPerUnsold: number;
    /** Weeks after release before unsold allocation starts souring the relationship. */
    unsoldGraceWeeks: number;
    /**
     * Weeks after release that a set still counts toward its channels'
     * relationship. Past this it is settled history — a distributor does not
     * hold a grudge for a decade, and old stock must stop souring forever.
     */
    evaluationWindowWeeks: number;
    /**
     * Relationship a channel restarts at when it is unlocked again after being
     * lost. Above `strainThreshold`, so re-establishing actually buys something.
     */
    reopenRelationship: number;
    /** Share of an allocation that must move by the evaluation to count as healthy. */
    sellThroughTarget: number;
    /** Relationship at or below which the channel emits `channelStrained`. */
    strainThreshold: number;
    /** Relationship below which the channel is lost outright. */
    lossThreshold: number;
    /** Per-evaluation relationship drift for an unlocked channel getting no allocation. */
    idleDriftPerTick: number;
    /** Weeks a channel may go unallocated before `idleDriftPerTick` starts biting. */
    idleGraceWeeks: number;
    /** How fast street price moves toward its target. 0..1 per evaluation. */
    streetPriceLerp: number;
    /** How fast stale stock earns a discount, per week since release. */
    stalenessPerWeek: number;
    /** Cash cost to unlock a channel, by kind. */
    unlockCost: Record<ChannelKind, Cents>;
  };

  /**
   * The reveal window (CONCEPT.md §2, §6.7). Three levers turn money and
   * attention into pre-launch demand, and one read comes back the other way.
   * Every gain here diminishes: hype is bought in a market that is already
   * paying attention to you, so the second million buys less than the first.
   */
  hype: {
    /** Weeks before release that a set's reveal window opens by default. */
    defaultLeadWeeks: number;
    /** Weeks between preview drops when a set is revealed without a schedule. */
    defaultCadenceWeeks: number;
    /** Hype one preview adds, before the diminishing term. */
    revealHypePerCard: number;
    /** Hype level at which further previews are worth half as much. */
    revealHalfLife: number;
    /** Audience attention one preview consumes. */
    revealAttentionCost: number;
    /** Spend at which marketing has bought one unit of its hype curve. */
    marketingReference: Cents;
    /** Scale of the logarithmic marketing curve. */
    marketingHypeGain: number;
    /** Cash one unit of prerelease scale costs to host. */
    prereleaseCostPerScale: Cents;
    /** Hype one unit of prerelease scale adds, before the diminishing term. */
    prereleaseHypeGain: number;
    /** Goodwill one unit of prerelease scale earns. The LGS is the goodwill engine. */
    prereleaseGoodwillGain: number;
    /** LGS relationship one unit of prerelease scale earns. */
    prereleaseRelationshipGain: number;
    /** Upper bound on `level`. Hype is a multiplier on demand, not a substitute for it. */
    ceiling: number;
    /** Share of the remaining hype that burns off each tick after release. */
    decayPerTickAfterRelease: number;
    /** Sigma of the signal's error at zero previews. Shrinks as previews land. */
    signalNoiseSigma: number;
    /** How hard hype at release seeds the singles market's opening heat. */
    heatFromHype: number;
  };

  /**
   * Grading and pop reports (CONCEPT.md §6.4). The market submits copies, not
   * the publisher: what the publisher controls is print quality, which moves
   * the grade distribution, and brand standing, which decides how many graders
   * bother covering their cards.
   */
  grading: {
    /** Minimum latent condition score for each grade tier, best first. */
    gradeCuts: Record<'10' | '9.5' | '9' | '8' | '7', number>;
    /** Share of the raw pool submitted per tick at full appetite. */
    submitRatePerTick: number;
    /** A copy is only worth grading once its raw price clears the fee this many times over. */
    feeWorthMultiple: number;
    /** Cap on how far an expensive card can accelerate submissions. */
    appetiteCeiling: number;
    /** Graded copies can never exceed this share of the opened population. */
    maxGradedShare: number;
    /** Mean latent condition of a fresh copy printed at `standard`. */
    conditionMean: number;
    conditionSigma: number;
    /** Condition points one unit of `printing.qualityGradeShift` is worth. */
    gradeShiftWeight: number;
    /** Condition points a grader one step above reference strictness takes off. */
    strictnessWeight: number;
    /** Handling wear per year the copy has been in circulation. */
    agePenaltyPerYear: number;
    agePenaltyCap: number;
    /** Price of a grade, as a multiple of the raw price. */
    tierMultiplier: Record<GradeTier, number>;
    /** How far grader reputation moves a graded price, either way. */
    reputationWeight: number;
    /** Pop-report count at which a tier carries no scarcity premium. */
    popScarcityReference: number;
    popScarcityExponent: number;
    popScarcityCeiling: number;
    popScarcityFloor: number;
    /** Graded prices are sticky in the same way raw prices are. */
    priceLerp: number;
    /** Brand standing at which a dormant grader starts covering the player. */
    sideGraderBrandGate: number;
  };

  region: {
    knowledgeGainPerRelease: number;
    knowledgeGainPerResearch: number;
    /** Sales penalty for a SKU mismatched to regional taste. */
    mismatchPenalty: number;
    /** Spread on a region reading at `knowledge` 0. See `readRegion`. */
    readingNoiseSigma: number;
    /** Weeks between one region's release wave and the next. */
    entryLeadWeeks: number;
    /** Weights on the four halves of `setFit`. They should sum to 1. */
    fitTasteWeight: number;
    fitAppetiteWeight: number;
    fitProductWeight: number;
    fitPriceWeight: number;
    /** Centre of the taste-fit fold. A region with no opinion lands here. */
    tasteFitCentre: number;
    /** Divisors folding rarity appetite and product preference onto 0..1. */
    appetiteFitDivisor: number;
    productFitDivisor: number;
    /** Multiplier folding price tolerance onto 0..1. */
    priceFitGain: number;
    /** Wealth's floor in the region demand factor. */
    wealthFloor: number;
    /** Ceiling on region knowledge. A reading is never quite the truth. */
    knowledgeCeiling: number;
    /** Share of the research rate credited each quarterly tick. */
    researchCreditShare: number;
    /** Reading error on the signed taste axis, relative to the rest. */
    tasteReadingNoiseScale: number;
  };

  /**
   * The secondary-market actors of CONCEPT.md §6.8, excluding scalpers, whose
   * numbers live in `drops` with the mechanism that uses them.
   *
   * First-guess values. The shape that matters: collectors are stable and
   * permanent, resellers follow a trade that closes itself, and speculators
   * have a sign that flips.
   */
  actors: {
    /** Share of the audience that collects, at full goodwill and no fatigue. */
    collectorShareOfAudience: number;
    collectorConvergence: number;
    minCollectors: number;
    /** Collectors per head of audience at which holding reaches its ceiling. */
    collectorDensityReference: number;
    /** Share of opened copies held out of the market at the extremes. */
    collectorHoldFloor: number;
    collectorHoldCeiling: number;

    /** Reseller population at which ripping is exactly break-even. */
    resellerReference: number;
    resellerConvergence: number;
    minResellers: number;
    maxResellers: number;
    /** Singles-to-sealed value ratio at which ripping stops paying. */
    ripBreakEven: number;
    /** Extra rip rate per reseller, against `resellerReference`. */
    ripPerReseller: number;

    speculatorReference: number;
    speculatorConvergence: number;
    minSpeculators: number;
    maxSpeculators: number;
    /** Heat above the pack per speculator at which the population holds still. */
    speculatorHeatPerCapita: number;
    /** How hard the population chases its own per-capita return. */
    speculatorMomentumGain: number;
    /** Heat added to a printing already above the pack, and taken off one below. */
    speculatorHeatGain: number;
    speculatorSensitivity: number;
    speculatorNoise: number;
  };

  creators: {
    rosterSize: number;
    /** Audience roll: `base * growth ^ U(0, exponentMax)`. A long tail. */
    audienceBase: number;
    audienceGrowth: number;
    audienceExponentMax: number;
    /** Range a creator's influence and starting relationship are rolled in. */
    influenceMin: number;
    influenceMax: number;
    openingRelationshipMin: number;
    openingRelationshipMax: number;
    coverChancePerStride: number;
    freshnessWeeks: number;
    affinityTries: number;
    audienceReference: number;
    heatPerCoverage: number;
    maxCoverageHeat: number;
    /** Fresh printings on the market at which a creator is fully engaged. */
    freshPrintingsReference: number;
    relationshipConvergence: number;
  };

  chains: {
    /** Extra desire per other card already printed in the same chain. */
    desirePerLink: number;
    /** How many links still count. Past this a chain stops paying more. */
    maxCountedLinks: number;
    /**
     * Multiplier on the chain bonus when the chain spans sets. CONCEPT.md calls
     * a cross-set chain "the hedge that can carry a set with a weak subject",
     * which only means anything if it pays more than a chain inside one set.
     */
    spansSetsBonus: number;
  };

  collabs: {
    /** Range the weighted reach bonus on one offer is rolled in. */
    reachBonusMin: number;
    reachBonusMax: number;
    /** Range the brand standing an offer demands is rolled in. */
    gateMin: number;
    gateMax: number;
    /** How many audience segments one offer reaches. */
    segmentsReachedMin: number;
    segmentsReachedMax: number;
    offerChancePerQuarter: number;
    offerWindowWeeks: number;
    maxOpenOffers: number;
    feeMin: Cents;
    feeMax: Cents;
    /** Demand multiplier per point of weighted reach bonus. */
    reachToDemand: number;
    goodwillPerReach: number;
    /** Share of the usual IP exposure a collab set returns to your own IPs. */
    exposureShare: number;
  };

  history: {
    /** Weeks kept at full resolution before downsampling. ~520 = 10 years. */
    weeklyRetentionTicks: number;
    /** Minimum fractional price move required to write a point. */
    writeThreshold: number;
  };

  /**
   * The rarity model. `weight` is a demand-side signal and never touches price;
   * `pull` is copies printed per card, and is how rarity reaches price through
   * the scarcity term. Changing either table moves everything.
   */
  rarity: {
    weight: Record<Rarity, number>;
    pull: Record<Rarity, number>;
    /** Divisor applied to `pull` to get a per-card pull rate. */
    pullDivisor: number;
    /** Divisor applied to `weight` in the reveal-window term. */
    weightDivisor: number;
    /** Divisor applied to `weight` in the set-chase term. */
    chaseWeightDivisor: number;
  };

  /** The global price climate. A random walk nothing else controls. */
  market: {
    climateNoiseSigma: number;
    climateReversion: number;
    climateFloor: number;
    climateCeiling: number;
    /** Minimum fractional move required to write a climate history point. */
    climateWriteThreshold: number;
  };

  /**
   * Tick rotations. A subsystem on stride N processes one Nth of its population
   * per tick.
   *
   * These are NOT free to change. A stride decides how many RNG draws a run
   * makes, so moving one renumbers every later roll and invalidates every
   * banked measurement. It also rescales any `PerTick` rate that is multiplied
   * by the stride.
   */
  strides: {
    price: number;
    sealed: number;
    scalper: number;
    channel: number;
    grading: number;
    art: number;
    /** Interest is charged on this rotation. */
    interest: number;
    /** Collab offers, region knowledge and artist roster drift. */
    quarterly: number;
    /** History compaction. */
    annual: number;
  };

  /**
   * The audience system: how people arrive, engage, lapse and leave.
   *
   * Every rate here is per tick unless the name says otherwise. All of it is
   * first-guess and unswept — it landed with the growth arc, immediately before
   * the tuning run that owns it.
   */
  audience: {
    /** Weekly population growth of the motivation segments. */
    populationGrowthPerTick: number;
    /** Births into `kids`, as a share of the region's cohort population. */
    birthRatePerTick: number;
    /**
     * How far `market.climate` moves population growth. One shared "how hot is
     * the hobby" signal drives prices and player counts together, which is what
     * the 2020-21 boom actually did.
     */
    climateToPopulation: number;
    /** Share of a cohort that ages into the next one each tick. */
    agingKidsToTeens: number;
    agingTeensToAdults: number;
    agingAdultsOut: number;

    /** Share of the unreached pool converted per tick at full drive. */
    acquisitionRate: number;
    /** Acquisition drive: a floor plus what reach, brand and goodwill add. */
    acquisitionFloor: number;
    acquisitionFromReach: number;
    acquisitionFromBrand: number;
    acquisitionFromGoodwill: number;
    /**
     * Units sold per head of a region's population for the reach term to reach 1.
     *
     * Per capita, not a flat unit count. Against a fixed 8,000 units the term
     * saturated in year one — a startup shipping its first print run looked as
     * reaching as a major — which front-loaded the whole growth arc. Measured
     * against the population it runs about 0.0003 at the opening and 0.007 at
     * full scale, so the curve is slow early and accelerates, which is the
     * shape a real audience grows in.
     */
    reachPerCapitaReference: number;
    /** Weekly decay on the recent-units figure that feeds reach. */
    recentUnitsDecayPerTick: number;

    /** Share of `reached` that is engaged when nothing is going on. */
    engagedFloor: number;
    /** What a fresh, well-matched release adds to that share. */
    engagedFromFreshness: number;
    /** How fast `engaged` moves toward its target. */
    engagementRate: number;
    /** Weeks after a release that count as fresh. */
    freshnessWeeks: number;
    /**
     * Discount on re-engaging somebody already reached, against acquiring
     * somebody new. Winning a lapsed player back is cheaper than finding one.
     */
    winBackAdvantage: number;

    /** Share of `reached` that churns back to unreached per tick, at zero goodwill. */
    churnRate: number;
    /** Goodwill below which churn starts. */
    churnGoodwillFloor: number;

    /** On region entry, the share of population seeded as reached, times brand standing. */
    entrySeedShare: number;
  };

  /** The opening state of the world. */
  world: {
    /**
     * Engaged people per segment in the home market at tick 0.
     *
     * Five segments times this must equal `attention.referenceAudience`, or
     * year-0 demand moves and the value block is fitted against a shifted
     * baseline. The coupling holds at world creation only; after that the
     * audience grows and `referenceAudience` stays put as the denominator.
     */
    segmentSize: number;
    /** Reached per segment, as a multiple of engaged. The lapsed reservoir. */
    openingReachedMultiple: number;
    /** Population per segment, as a multiple of engaged. The room to grow into. */
    openingPopulationMultiple: number;
    /** Starting attention, fatigue and goodwill in every segment. */
    segmentAttention: number;
    segmentFatigue: number;
    segmentGoodwill: number;
    /** Starting populations. */
    startingScalpers: number;
    startingResellers: number;
    startingCollectors: number;
    startingSpeculators: number;
    /** Opening market climate and index level. */
    startingClimate: number;
    startingIndex: number;
    /** Per-region shape. `knowledge` is what the studio starts knowing. */
    regions: Record<string, {
      marketSize: number;
      wealth: number;
      unlockCost: Cents;
      priceTolerance: number;
      knowledge: number;
    }>;
    /** Per-product-kind preference, before each region jitters it. */
    productPreference: Record<ProductKind, number>;
    /** Range a region's per-segment mix is rolled in. */
    segmentMixMin: number;
    segmentMixMax: number;
    /** Range a foreign region's taste bias is rolled in. */
    tasteBiasMin: number;
    tasteBiasMax: number;
    /** Range any region's rarity appetite is rolled in. */
    rarityAppetiteMin: number;
    rarityAppetiteMax: number;
    /** Range a foreign region jitters `productPreference` by. */
    productPreferenceJitterMin: number;
    productPreferenceJitterMax: number;
    /** The home market's taste bias, which is a literal rather than a roll. */
    homeTasteBias: Record<IpKind, number>;
    /** Capacity scale applied to a foreign region's channels. */
    foreignChannelScale: number;
  };

  /** The grader roster. Fees are per submitted copy. */
  graders: Record<string, {
    reputation: number;
    strictness: number;
    marketShare: number;
    /** Fee and turnaround for each service level this grader offers. */
    tiers: Record<string, { price: Cents; turnaroundWeeks: number }>;
  }>;
}
