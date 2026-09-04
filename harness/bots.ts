/**
 * Four scripted strategies to probe for degenerate optima (CONCEPT.md §10).
 *
 * Every `api.*` call here submits a `Decision` onto the queue and hands back
 * the id it minted, so a run is fully reconstructable from its seed plus its
 * decision log — the same path a UI would drive.
 */
import type {
  SimState, IpId, ArtistId, Rarity, PrintQualityTier, ProductKind, SetType, ProductId, IpKind,
  ChannelId, Channel, Tick, SetId, Cents, Artist, ArtistTerms,
} from '../src/sim/types.ts';
import { api } from '../src/sim/engine.ts';
import { rand, pick, chance } from '../src/sim/rng.ts';
import { REGION_US, IP_KINDS } from '../src/sim/world.ts';
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
}

/**
 * Channels are bought in the gate order of CONCEPT.md §9. A bot buys the
 * cheapest gate it clears and can afford, keeping a working-capital reserve so
 * it never unlocks its way into a print run it cannot pay for.
 */
const UNLOCK_ORDER: ChannelId[] = [
  CHANNEL_IDS.online, CHANNEL_IDS.distributor, CHANNEL_IDS.bigbox, CHANNEL_IDS.direct,
];

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

/** What this bot's next print run will cost, using the engine's own COGS formula. */
function printRunCost(s: SimState, opts: SetBotOptions): number {
  return s.config.printing.unitCost[opts.quality] * opts.packsPerUnit * 0.55 * opts.units;
}

function openChannels(s: SimState): Channel[] {
  const pub = s.publishers[s.playerId]!;
  return pub.unlocks.channels
    .map(id => s.channels[id])
    .filter((ch): ch is Channel => !!ch && ch.unlocked);
}

function submitAllocation(s: SimState, productId: ProductId, units: number, opts: SetBotOptions): void {
  if (opts.allocationPolicy === 'auto') return;
  const open = openChannels(s);
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
      if (s.tick % 13 === 0) maybeUnlock(s, printRunCost(s, opts), opts.units, opts.unlockOrder);
      submitDrops(s, opts);
      submitMarketing(s, opts);
      if (s.tick < nextRelease) return;
      nextRelease = s.tick + opts.cadenceWeeks;

      const ipId = ensureIp(s, opts.label);
      const setId = api.createSet(s, `${opts.label} Set W${s.tick}`, opts.setType, opts.cardsPerSet);

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

      const productId = api.defineProduct(s, setId, opts.productKind, REGION_US, opts.packsPerUnit, opts.msrp);
      api.commitPrintRun(
        s,
        setId,
        { [productId]: opts.units } as Record<ProductId, number>,
        opts.quality,
      );
      // Allocation locks with the print run, in the same batch. This is the
      // blind bet — it lands before reveal and never changes after.
      submitAllocation(s, productId, opts.units, opts);
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

export const BOTS: Record<string, () => Bot> = {
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
