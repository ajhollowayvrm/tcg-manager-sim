/**
 * Four scripted strategies to probe for degenerate optima (CONCEPT.md §10).
 *
 * Every `api.*` call here submits a `Decision` onto the queue and hands back
 * the id it minted, so a run is fully reconstructable from its seed plus its
 * decision log — the same path a UI would drive.
 */
import type {
  SimState, IpId, ArtistId, Rarity, PrintQualityTier, ProductKind, SetType, ProductId, IpKind,
  ChannelId, Channel,
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

interface SetBotOptions {
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
}

/**
 * Channels are bought in the gate order of CONCEPT.md §9. A bot buys the
 * cheapest gate it clears and can afford, keeping a working-capital reserve so
 * it never unlocks its way into a print run it cannot pay for.
 */
const UNLOCK_ORDER: ChannelId[] = [
  CHANNEL_IDS.online, CHANNEL_IDS.distributor, CHANNEL_IDS.bigbox, CHANNEL_IDS.direct,
];

function maybeUnlock(s: SimState, reserve: number, runUnits: number): void {
  const pub = s.publishers[s.playerId]!;
  for (const id of UNLOCK_ORDER) {
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

function makeSetBot(opts: SetBotOptions): Bot {
  let nextRelease = 8; // small startup delay so world init settles first
  return {
    step(s: SimState) {
      const pub = s.publishers[s.playerId]!;
      if (pub.deadTick !== null) return;
      // Buying channel access is a between-releases decision, so it is checked
      // every step rather than only on a release week. The reserve is one full
      // print run, so a bot never unlocks its way out of being able to print.
      if (s.tick % 13 === 0) maybeUnlock(s, printRunCost(s, opts), opts.units);
      if (s.tick < nextRelease) return;
      nextRelease = s.tick + opts.cadenceWeeks;

      const ipId = ensureIp(s, opts.label);
      const setId = api.createSet(s, `${opts.label} Set W${s.tick}`, opts.setType, opts.cardsPerSet);

      const artistIds = Object.keys(s.artists) as ArtistId[];
      for (let i = 0; i < opts.cardsPerSet; i++) {
        const rarity = pickRarity(s);
        const artistId = artistIds.length ? pick(s.rng, artistIds) : undefined;
        if (!artistId) break;
        api.designCard(s, setId, ipId, [], rarity, artistId);
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
  // must lose — HANDOFF.md flags that it currently wins instead (bug, not spec).
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
