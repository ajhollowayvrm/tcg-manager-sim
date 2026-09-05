/**
 * Four scripted strategies to probe for degenerate optima (CONCEPT.md §10).
 *
 * Every `api.*` call here submits a `Decision` onto the queue and hands back
 * the id it minted, so a run is fully reconstructable from its seed plus its
 * decision log — the same path a UI would drive.
 */
import type {
  SimState, IpId, ArtistId, Rarity, PrintQualityTier, ProductKind, SetType, ProductId, IpKind,
  ChannelId, Channel, Tick, SetId, Cents, Artist, ArtistTerms, RegionId,
  CollabId, AudienceSegment,
} from '../src/sim/types.ts';
import { api } from '../src/sim/engine.ts';
import { rand, pick, chance } from '../src/sim/rng.ts';
import { REGION_US, IP_KINDS } from '../src/sim/world.ts';
import { readRegion } from '../src/sim/regions.ts';
import { CHANNEL_IDS, effectiveCapacity, unlockCost } from '../src/sim/channels.ts';

export interface Bot {
  step(s: SimState): void;
}

const RARITY_DISTRIBUTION: Array<{ rarity: Rarity; weight: number }> = [
  { rarity: 'common', weight: 45 },
  { rarity: 'uncommon', weight: 25 },
  { rarity: 'rare', weight: 14 },
  { rarity: 'doubleRare', weight: 7 },
  { rarity: 'ultraRare', weight: 4 },
  { rarity: 'illustrationRare', weight: 2.5 },
  { rarity: 'specialIllustrationRare', weight: 1.5 },
  { rarity: 'hyperRare', weight: 0.7 },
  { rarity: 'promo', weight: 0.3 },
];

function pickRarity(s: SimState): Rarity {
  const total = RARITY_DISTRIBUTION.reduce((n, r) => n + r.weight, 0);
  let x = rand(s.rng) * total;
  for (const r of RARITY_DISTRIBUTION) {
    x -= r.weight;
    if (x <= 0) return r.rarity;
  }
  return 'common';
}

/** Reuses an existing IP most of the time; only occasionally invents a new one. */
function ensureIp(s: SimState, label: string): IpId {
  const existing = Object.keys(s.ips) as IpId[];
  if (existing.length > 0 && chance(s.rng, 0.7)) return pick(s.rng, existing);
  const kind = pick(s.rng, IP_KINDS) as IpKind;
  return api.createIp(s, `${label} ${existing.length + 1}`, kind);
}

/**
 * How a bot splits a print run across its channels.
 *
 * - `auto` submits no allocation and lets the engine's release-time default
 *   split run, so that path stays covered.
 * - `spread` allocates explicitly, weighted by each channel's effective capacity.
 * - `hog` dumps everything into one channel and finds out what souring costs.
 */
type AllocationPolicy = 'auto' | 'spread' | 'hog';

export interface SetBotOptions {
  label: string;
  cadenceWeeks: number;
  cardsPerSet: number;
  setType: SetType;
  quality: PrintQualityTier;
  units: number;
  /**
   * How big a bet the bot places on each set.
   *
   * - `fixed` prints `units` regardless of anything, which is what every bot
   *   in the original roster did.
   * - `bankroll` commits `bankrollFraction` of the cash on hand to the print
   *   run and prints whatever that buys.
   *
   * The size of the print run is the wager the whole game is about, so a
   * roster where nothing varies it cannot measure difficulty. `bankroll` is
   * also the only policy that can lose everything, because it scales the
   * downside with the bankroll rather than holding it at a constant the
   * starting cash always covers.
   */
  unitsPolicy?: 'fixed' | 'bankroll';
  /** Share of cash committed per print run under `bankroll`. Ignored by `fixed`. */
  bankrollFraction?: number;
  packsPerUnit: number;
  msrp: number;
  productKind: ProductKind;
  allocationPolicy: AllocationPolicy;
  /** Channel `hog` dumps into. Ignored by the other policies. */
  hogChannel?: ChannelId;
  /**
   * Order the bot buys channel access in. Defaults to the cheapest-gate-first
   * order of CONCEPT.md §9; a drop strategy overrides it to save for the store.
   */
  unlockOrder?: ChannelId[];
  /**
   * Units to put up per direct-store drop. Unset means the bot schedules no
   * drops of its own and takes the engine's automatic cadence instead, which
   * keeps that fallback path covered.
   */
  dropUnits?: number;
  /** How often the bot offers to schedule the next drop. */
  dropCadenceWeeks?: number;
  /**
   * Weeks before release to start dripping previews, and the weeks between
   * them. Unset leaves the engine's default window, which is what every bot
   * without a campaign gets.
   */
  revealLeadWeeks?: number;
  revealCadenceWeeks?: number;
  /** Cash committed to marketing each set, spread across the reveal window. */
  marketingPerSet?: number;
  /** Prerelease scale hosted per set. */
  prereleaseScale?: number;
  /**
   * How the bot picks an illustrator. `random` is the historical behaviour and
   * the default; `cheapest` scouts unproven newcomers, betting on the hidden
   * `growth` roll; `established` pays for reputation it can already see.
   */
  artistPolicy?: 'random' | 'cheapest' | 'established';
  /**
   * What the bot pays per brief, as a multiple of the artist's asking rate.
   * Over 1 buys quality with diminishing returns. Unset means it pays the rate.
   */
  artBudgetMultiple?: number;
  /**
   * Standing arrangement to sign with its chosen artist. Unset means perCard —
   * no weekly bill and no claim on them.
   */
  artistTerms?: ArtistTerms;
  /**
   * Whether the bot sells abroad.
   *
   * - `home` never leaves the US, which is what every bot in the original
   *   roster did and what keeps that path covered.
   * - `expand` opens one region at a time, picking the one its own reading
   *   rates highest, then buys that region's channels and defines a SKU per
   *   open region on every set.
   *
   * `expand` is the only strategy that reads `readRegion`, which is the point:
   * a reading nothing consults is dead code however carefully it is built.
   */
  regionPolicy?: 'home' | 'expand';
  /**
   * Whether the bot licenses. `sign` takes the open offer with the best
   * weighted reach per dollar that it can afford and that its brand clears.
   *
   * The offer has to be signed between `createSet` and `commitPrintRun`: a
   * collab attaches to a set that has not printed yet, and both decisions land
   * in the same tick, so this is a matter of submitting in the right order.
   */
  collabPolicy?: 'never' | 'sign';
  /**
   * How much larger a print run gets when the bot has signed a collab for it.
   *
   * This is the whole point of a collab and the whole risk of one. Extra demand
   * is worth nothing to a publisher who printed for the demand it already had,
   * so a licence fee only pays back if the run is sized up to meet it — and
   * sizing up is exactly how a collab that under-delivers becomes an overprint.
   */
  collabRunMultiple?: number;
}

/**
 * Channels are bought in the gate order of CONCEPT.md §9. A bot buys the
 * cheapest gate it clears and can afford, keeping a working-capital reserve so
 * it never unlocks its way into a print run it cannot pay for.
 */
const UNLOCK_ORDER: ChannelId[] = [
  CHANNEL_IDS.online, CHANNEL_IDS.distributor, CHANNEL_IDS.bigbox, CHANNEL_IDS.direct,
];

/**
 * The channel gates, in order, across every region the bot has opened. The home
 * market comes first: a second region's LGS is worth less than the US big box,
 * and buying reach abroad before you have it at home is a way to lose money in
 * two markets at once.
 */
function gateOrder(s: SimState, opts: SetBotOptions): ChannelId[] {
  const base = opts.unlockOrder ?? UNLOCK_ORDER;
  if (opts.regionPolicy !== 'expand') return base;
  const pub = s.publishers[s.playerId]!;
  const abroad = Object.values(s.channels)
    .filter(ch => ch.regionId !== REGION_US && pub.unlocks.regions.includes(ch.regionId))
    .sort((a, b) => a.requiredBrandStanding - b.requiredBrandStanding)
    .map(ch => ch.id);
  return [...base, ...abroad];
}

/**
 * Opens the region this bot's own reading rates highest, one at a time.
 *
 * The reading is noisy in inverse proportion to `knowledge`, and an unopened
 * region has `knowledge` 0 — so this is a genuine bet, and it is meant to be
 * wrong sometimes. The reserve is two full print runs rather than one: a
 * region pays back over years, and spending down to the bone to open one is
 * how a publisher dies of a good idea.
 */
function maybeExpand(s: SimState, opts: SetBotOptions, reserve: number): void {
  if (opts.regionPolicy !== 'expand') return;
  const pub = s.publishers[s.playerId]!;
  const candidates = Object.values(s.regions).filter(
    r => r.unlockedTick === null && pub.cash - r.unlockCost > reserve * 2,
  );
  if (candidates.length === 0) return;

  let best: RegionId | null = null;
  let bestScore = -Infinity;
  for (const r of candidates) {
    const reading = readRegion(s, r.id);
    if (!reading) continue;
    // Size and spending power are public; taste is not. The reading is what
    // carries the error, so it is what makes this a bet rather than a sort.
    const taste = Object.values(reading.tasteBias).reduce((a, b) => a + b, 0)
      / Math.max(1, Object.keys(reading.tasteBias).length);
    const appetite = Object.values(reading.rarityAppetite).reduce((a, b) => a + b, 0)
      / Math.max(1, Object.keys(reading.rarityAppetite).length);
    const score = r.marketSize * r.wealth * (0.5 + taste) * appetite * reading.priceTolerance;
    if (score > bestScore) { bestScore = score; best = r.id; }
  }
  if (best) api.unlockRegion(s, best);
}

function maybeUnlock(s: SimState, reserve: number, runUnits: number, order = UNLOCK_ORDER): void {
  const pub = s.publishers[s.playerId]!;
  for (const id of order) {
    const ch = s.channels[id];
    if (!ch || ch.unlocked) continue;
    if (pub.brandStanding < ch.requiredBrandStanding) continue;
    // Buying a chain you are too small to supply is a real and expensive
    // mistake, but it is not a strategy. A bot only opens a channel it can
    // actually meet the minimum order on.
    if (ch.minimumOrder > runUnits) continue;
    if (pub.cash - unlockCost(s, ch) < reserve) continue;
    api.purchaseUnlock(s, 'channels', ch.id);
    return; // One gate per step. Buying the whole tree in one tick is not a strategy.
  }
}

/** What one unit costs to print, using the engine's own COGS formula. */
function unitCost(s: SimState, opts: SetBotOptions): number {
  return s.config.printing.unitCost[opts.quality] * opts.packsPerUnit * 0.55;
}

/**
 * How many units this bot prints next.
 *
 * Under `bankroll` the run is sized off cash rather than off a constant, so
 * the bet grows with the bankroll and a bad set costs a share of everything
 * rather than a fixed sum the starting cash always covered. The floor of 1
 * keeps a broke publisher submitting a run it cannot pay for, which is a death
 * route rather than a bug: `tickFinance` is what decides whether it survives it.
 */
function printRunUnits(s: SimState, opts: SetBotOptions): number {
  if (opts.unitsPolicy !== 'bankroll') return opts.units;
  const pub = s.publishers[s.playerId]!;
  const budget = Math.max(0, pub.cash) * (opts.bankrollFraction ?? 0.25);
  return Math.max(1, Math.floor(budget / unitCost(s, opts)));
}

/** What this bot's next print run will cost, using the engine's own COGS formula. */
function printRunCost(s: SimState, opts: SetBotOptions): number {
  return unitCost(s, opts) * printRunUnits(s, opts);
}

function openChannels(s: SimState): Channel[] {
  const pub = s.publishers[s.playerId]!;
  return pub.unlocks.channels
    .map(id => s.channels[id])
    .filter((ch): ch is Channel => !!ch && ch.unlocked);
}

function submitAllocation(s: SimState, productId: ProductId, units: number, opts: SetBotOptions): void {
  if (opts.allocationPolicy === 'auto') return;
  // A product only ships through channels in its own region — `allocate`
  // refuses the rest anyway, and offering them here would silently drop that
  // share of the run into the warehouse.
  const product = s.products[productId];
  const open = openChannels(s).filter(ch => !product || ch.regionId === product.regionId);
  if (open.length === 0) return;

  const plan: Record<ChannelId, number> = {};
  if (opts.allocationPolicy === 'hog') {
    const target = (opts.hogChannel && s.channels[opts.hogChannel]?.unlocked)
      ? s.channels[opts.hogChannel]!
      : open[open.length - 1]!;
    plan[target.id] = units;
  } else {
    const caps = open.map(effectiveCapacity);
    const total = caps.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    for (let i = 0; i < open.length; i++) {
      plan[open[i]!.id] = Math.floor(units * (caps[i]! / total));
    }
  }
  api.allocate(s, productId, plan);
}

/**
 * Puts the direct store's stock up for a drop. The engine keeps one pending
 * drop per allocation, so submitting every cadence week simply queues the next
 * one as soon as the last has resolved.
 */
function submitDrops(s: SimState, opts: SetBotOptions): void {
  if (!opts.dropUnits) return;
  const ch = s.channels[CHANNEL_IDS.direct];
  if (!ch || !ch.unlocked) return;
  if (s.tick % (opts.dropCadenceWeeks ?? 4) !== 0) return;

  for (const p of Object.values(s.products)) {
    const a = p.allocations[CHANNEL_IDS.direct];
    if (!a || a.unitsRemaining <= 0) continue;
    api.scheduleDrop(s, p.id, ch.id, s.tick as Tick, Math.min(opts.dropUnits, a.unitsRemaining));
  }
}

/**
 * Runs the reveal campaign for a set that has just been committed. Marketing is
 * split across the window rather than dumped in one tick, which is what a
 * player with a logarithmic spend curve would do.
 */
function submitCampaign(s: SimState, setId: SetId, opts: SetBotOptions): void {
  const release = s.sets[setId]?.regionSchedule[0]?.releaseTick;
  if (release === undefined) return;

  if (opts.revealLeadWeeks !== undefined) {
    api.scheduleReveal(
      s,
      setId,
      Math.max(s.tick, (release as number) - opts.revealLeadWeeks) as Tick,
      opts.revealCadenceWeeks ?? 2,
    );
  }
  if (opts.prereleaseScale) {
    api.hostPrerelease(s, setId, opts.prereleaseScale,
      (opts.prereleaseScale * s.config.hype.prereleaseCostPerScale) as Cents);
  }
}

export function makeSetBot(opts: SetBotOptions): Bot {
  let nextRelease = 8; // small startup delay so world init settles first
  const campaigned = new Set<SetId>();
  return {
    step(s: SimState) {
      const pub = s.publishers[s.playerId]!;
      if (pub.deadTick !== null) return;
      // A campaign can only be planned once `commitPrintRun` has been applied:
      // the release date it schedules against is written by the engine on the
      // following tick, not by the bot that submitted the commit.
      for (const set of Object.values(s.sets)) {
        if (set.status !== 'committed' || campaigned.has(set.id)) continue;
        campaigned.add(set.id);
        submitCampaign(s, set.id, opts);
      }
      // Buying channel access is a between-releases decision, so it is checked
      // every step rather than only on a release week. The reserve is one full
      // print run, so a bot never unlocks its way out of being able to print.
      if (s.tick % 13 === 0) {
        maybeUnlock(s, printRunCost(s, opts), printRunUnits(s, opts), gateOrder(s, opts));
        maybeExpand(s, opts, printRunCost(s, opts));
      }
      submitDrops(s, opts);
      submitMarketing(s, opts);
      if (s.tick < nextRelease) return;
      nextRelease = s.tick + opts.cadenceWeeks;

      // Sized once, before the set exists, and used for both the commit and the
      // allocation. Sizing it twice would let cash spent on art between the two
      // calls shrink the allocation below the run that was actually printed.
      const runUnits = printRunUnits(s, opts);

      const ipId = ensureIp(s, opts.label);
      const setId = api.createSet(s, `${opts.label} Set W${s.tick}`, opts.setType, opts.cardsPerSet);
      const signedCollab = maybeSignCollab(s, opts, setId);

      // Art is commissioned in the same batch as the design, which is the only
      // way it can land before the release 18 weeks later. A slow or unreliable
      // artist still misses, and that card ships as house filler.
      for (let i = 0; i < opts.cardsPerSet; i++) {
        const rarity = pickRarity(s);
        const artistId = chooseArtist(s, opts);
        if (!artistId) break;
        const cardId = api.designCard(s, setId, ipId, [], rarity, artistId);
        const artist = s.artists[artistId]!;
        const budget = Math.round(artist.rate * (opts.artBudgetMultiple ?? 1)) as Cents;
        api.commissionArt(s, cardId, artistId, { budget });
        maybeSign(s, opts, artistId);
      }

      // One SKU per open region. A region with no product gets no release date
      // and sells nothing, so this is what turns an unlock into volume — and
      // the print run is split across them, not multiplied by them.
      const shipTo = opts.regionPolicy === 'expand'
        ? pub.unlocks.regions.filter(id => !!s.regions[id])
        : [REGION_US];
      // Split by the reach the bot actually has in each region, not evenly. A
      // second region opens with one small LGS against four US channels, so an
      // even split ships most of the run into a market that cannot move it —
      // which measures a careless allocator rather than measuring regions.
      const committedUnits = signedCollab
        ? Math.round(runUnits * (opts.collabRunMultiple ?? 1.5))
        : runUnits;

      const reachByRegion = shipTo.map(regionId => {
        const caps = openChannels(s)
          .filter(ch => ch.regionId === regionId)
          .map(effectiveCapacity);
        return caps.reduce((a, b) => a + b, 0);
      });
      const totalReach = reachByRegion.reduce((a, b) => a + b, 0);

      const quantities = {} as Record<ProductId, number>;
      const productIds: ProductId[] = [];
      const unitsByProduct = new Map<ProductId, number>();
      for (let i = 0; i < shipTo.length; i++) {
        const regionId = shipTo[i]!;
        const share = totalReach > 0 ? reachByRegion[i]! / totalReach : 1 / shipTo.length;
        const perRegion = Math.max(1, Math.floor(committedUnits * share));
        // A region's price is its own. Selling a US-priced box into a market
        // that tolerates 0.6 of US prices is a mistake the bot should be able
        // to avoid, and `priceTolerance` is public where taste is not.
        const region = s.regions[regionId]!;
        const msrp = Math.round(opts.msrp * region.truth.priceTolerance);
        const pid = api.defineProduct(s, setId, opts.productKind, regionId, opts.packsPerUnit, msrp);
        quantities[pid] = perRegion;
        unitsByProduct.set(pid, perRegion);
        productIds.push(pid);
      }
      api.commitPrintRun(s, setId, quantities, opts.quality);
      // Allocation locks with the print run, in the same batch. This is the
      // blind bet — it lands before reveal and never changes after.
      for (const pid of productIds) {
        submitAllocation(s, pid, unitsByProduct.get(pid)!, opts);
      }
    },
  };
}

/**
 * Who illustrates the next card. `cheapest` and `established` are the two ends
 * of the scouting gamble: reputation is visible and priced, `growth` is hidden
 * and free, so the cheap unknown is either the bargain of the decade or filler.
 */
function chooseArtist(s: SimState, opts: SetBotOptions): ArtistId | undefined {
  const pub = s.publishers[s.playerId]!;
  const open = (Object.values(s.artists) as Artist[]).filter(
    a => a.available && (a.exclusiveTo === null || a.exclusiveTo === pub.id),
  );
  if (open.length === 0) return undefined;
  switch (opts.artistPolicy) {
    case 'cheapest':
      return open.reduce((best, a) => (a.rate < best.rate ? a : best)).id;
    case 'established':
      return open.reduce((best, a) => (a.reputation > best.reputation ? a : best)).id;
    default:
      return pick(s.rng, open.map(a => a.id));
  }
}

/** Signs the bot's standing arrangement once, the first time it uses an artist. */
function maybeSign(s: SimState, opts: SetBotOptions, artistId: ArtistId): void {
  if (!opts.artistTerms || opts.artistTerms === 'perCard') return;
  const pub = s.publishers[s.playerId]!;
  if (pub.retainers[artistId]) return;
  api.hireArtist(s, artistId, opts.artistTerms);
}

/**
 * Signs the best open collab offer for the set just created.
 *
 * "Best" is weighted reach per dollar, not the largest headline bonus: an offer
 * that reaches the smallest segment hard is worth less than one that reaches
 * the largest segment gently, and a bot that sorts on the headline number would
 * never find that out. The reserve is one print run — a licence fee that eats
 * the money the set needs to print is not a collab, it is a mistake.
 */
function maybeSignCollab(s: SimState, opts: SetBotOptions, setId: SetId): boolean {
  if (opts.collabPolicy !== 'sign') return false;
  const pub = s.publishers[s.playerId]!;
  const reserve = printRunCost(s, opts);
  const total = Object.values(s.audience.segments).reduce((n, g) => n + g.size, 0);
  if (total <= 0) return false;

  let best: { id: CollabId; score: number } | null = null;
  for (const c of Object.values(s.collabs)) {
    if (c.signedTick !== null) continue;
    if (pub.brandStanding < c.requiredBrandStanding) continue;
    if (pub.cash - c.licenseFee < reserve) continue;
    let weighted = 0;
    for (const [seg, bonus] of Object.entries(c.reachBonus)) {
      weighted += bonus * (s.audience.segments[seg as AudienceSegment]?.size ?? 0) / total;
    }
    const score = weighted / Math.max(1, c.licenseFee);
    if (!best || score > best.score) best = { id: c.id, score };
  }
  if (!best) return false;
  api.signCollab(s, best.id, setId);
  return true;
}

/** Drips marketing into every set still inside its reveal window. */
function submitMarketing(s: SimState, opts: SetBotOptions): void {
  if (!opts.marketingPerSet) return;
  for (const set of Object.values(s.sets)) {
    if (set.status !== 'committed' && set.status !== 'revealing') continue;
    // Split across the window rather than dumped in one tick: the spend curve
    // is logarithmic in the cumulative total, so the timing is free but the
    // player still has to survive the outlay.
    api.marketingSpend(s, set.id, Math.round(opts.marketingPerSet / 6) as Cents);
  }
}

/**
 * The three bet sizes. All three are `conservative` in every other respect, so
 * the only thing that separates their rows is how much of the bankroll goes
 * onto each set. Under `fixed` sizing the wager is a constant the starting cash
 * always covers, which is why the original roster could not produce a survival
 * gradient at all.
 */
function betSizeBot(label: string, fraction: number): () => Bot {
  return () => makeSetBot({
    label, cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000,
    productKind: 'boosterBox', allocationPolicy: 'spread',
    unitsPolicy: 'bankroll', bankrollFraction: fraction,
  });
}

export const BOTS: Record<string, () => Bot> = {
  // The size-of-the-bet ladder. See `betSizeBot`.
  smallBets: betSizeBot('SmallBets', 0.10),
  bigBets: betSizeBot('BigBets', 0.50),
  allIn: betSizeBot('AllIn', 0.95),

  // `conservative` in every respect except that it sells abroad. Holding the
  // rest identical is the point: any difference in the two rows is regions and
  // nothing else. It is the only bot that consults `readRegion`.
  globalist: () => makeSetBot({
    label: 'Globalist', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000,
    productKind: 'boosterBox', allocationPolicy: 'spread',
    regionPolicy: 'expand',
  }),

  // `conservative` in every respect except that it licenses. Any difference in
  // the two rows is the collab loop and nothing else: reach bought with cash,
  // paid for in the IP equity the sets no longer build.
  licensor: () => makeSetBot({
    label: 'Licensor', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000,
    productKind: 'boosterBox', allocationPolicy: 'spread',
    collabPolicy: 'sign', collabRunMultiple: 1.5,
  }),

  // Few, well-supported sets. The steady baseline.
  conservative: () => makeSetBot({
    label: 'Conservative', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
    allocationPolicy: 'spread',
  }),

  // Fewer, smaller cards-per-set skewed toward chase rarities, premium quality.
  chaseMaxxer: () => makeSetBot({
    label: 'ChaseMaxxer', cadenceWeeks: 34, cardsPerSet: 45, setType: 'main',
    quality: 'premium', units: 5000, packsPerUnit: 24, msrp: 15500, productKind: 'boosterBox',
    allocationPolicy: 'spread',
  }),

  // Releases constantly, cheap quality, large runs. Per CONCEPT.md §6.2 this
  // must lose, and since the fatigue curve landed it does: it dies in year two
  // in every seed. It stays in the roster as the flood-death regression.
  flooder: () => makeSetBot({
    label: 'Flooder', cadenceWeeks: 6, cardsPerSet: 40, setType: 'main',
    quality: 'budget', units: 15000, packsPerUnit: 24, msrp: 11000, productKind: 'boosterBox',
    // Leaves allocation to the engine's default split, keeping that path covered.
    allocationPolicy: 'auto',
  }),

  // Small, expensive, high-margin specialty sets only.
  specialtyOnly: () => makeSetBot({
    label: 'Specialty', cadenceWeeks: 20, cardsPerSet: 20, setType: 'specialty',
    quality: 'premium', units: 1200, packsPerUnit: 10, msrp: 6000, productKind: 'premiumCollection',
    allocationPolicy: 'spread',
  }),

  // `conservative` in every respect except that it runs a full reveal campaign:
  // a long preview window, marketing spend, and prereleases through the LGS.
  // Holding the other parameters identical is the point — any difference in the
  // two rows is the hype loop and nothing else.
  hypeBuilder: () => makeSetBot({
    label: 'HypeBuilder', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
    allocationPolicy: 'spread',
    revealLeadWeeks: 16, revealCadenceWeeks: 1,
    marketingPerSet: 300_000_00, prereleaseScale: 4,
  }),

  // `conservative` in every respect except that it saves for the direct store
  // first and sells through drops. Holding the other parameters identical is the
  // point: any difference in the two rows is the drop channel and nothing else.
  dropRunner: () => makeSetBot({
    label: 'DropRunner', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
    allocationPolicy: 'spread',
    unlockOrder: [CHANNEL_IDS.direct, CHANNEL_IDS.online, CHANNEL_IDS.distributor, CHANNEL_IDS.bigbox],
    dropUnits: 2500, dropCadenceWeeks: 4,
  }),

  // The two ends of the scouting gamble. Both are `conservative` in every other
  // respect, so any difference between their rows is the art pipeline and
  // nothing else.
  //
  // `scout` commissions the cheapest artist on the board and signs them
  // exclusively — locking down an unknown before anybody finds out whether the
  // hidden `growth` roll was kind. Cheap art now, a weekly bill, and a bet that
  // pays only years later through `Artist.reputation`, which the value engine
  // reads live.
  scout: () => makeSetBot({
    label: 'Scout', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
    allocationPolicy: 'spread',
    artistPolicy: 'cheapest', artistTerms: 'exclusive',
  }),

  // `safeHands` buys the reputation it can already see, pays over the rate for
  // it, and keeps the artist on a retainer so the briefs get taken.
  safeHands: () => makeSetBot({
    label: 'SafeHands', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
    allocationPolicy: 'spread',
    artistPolicy: 'established', artBudgetMultiple: 2.5, artistTerms: 'retainer',
  }),

  // `conservative` in every respect except allocation: it dumps each whole run
  // into the distributor instead of spreading it. Holding the other parameters
  // identical is the point — any difference in the two rows is the allocation
  // policy and nothing else. Per CONCEPT.md §6.5 a distributor sours when you
  // over-allocate, so this should lose the channel and fall back to LGS volume.
  channelHog: () => makeSetBot({
    label: 'ChannelHog', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
    allocationPolicy: 'hog', hogChannel: CHANNEL_IDS.distributor,
  }),
};
