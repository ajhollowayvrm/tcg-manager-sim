import type {
  SimState, Decision, Tick, Cents, Unit, IpId, CardId, SetId, ProductId, PrintingId,
  ProductLineId, RegionId, ChannelId, ArtistId, IpEntity, Card, CardSet, Product,
  Printing, SimEvent, EventId, SetType, Rarity, ProductKind, PrintQualityTier,
  Treatment, ArtBrief, UnlockState, ChannelAllocation, Channel, SetPerformance,
  Drop, DropId,
} from './types.ts';
import { rand, randRange, randInt, pick, chance, gauss } from './rng.ts';
import { emptySeries, writePoint, compact } from './series.ts';
import { nextId, SEGMENTS, RARITIES } from './world.ts';
import {
  traitsFor, effectiveCapacity, allocatedUnits, autoAllocate, unlockCost, CHANNEL_IDS,
} from './channels.ts';

const T = (n: number) => n as Tick;
const C = (n: number) => Math.round(n) as Cents;
const U = (n: number) => Math.max(0, Math.min(1, n)) as Unit;

const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1, uncommon: 1.4, rare: 2.6, doubleRare: 5, ultraRare: 12,
  illustrationRare: 22, specialIllustrationRare: 60, hyperRare: 90, promo: 8,
};
const RARITY_PULL: Record<Rarity, number> = {
  common: 4, uncommon: 2.2, rare: 0.9, doubleRare: 0.28, ultraRare: 0.09,
  illustrationRare: 0.035, specialIllustrationRare: 0.008, hyperRare: 0.004, promo: 0.05,
};

/**
 * Latent demand for one printing, rolled once and never shown. Lognormal, so
 * the median printing rolls 1 and a rare few roll many times that — the shape
 * a power law needs (CONCEPT.md §5).
 */
function rollChase(s: SimState): number {
  return Math.exp(gauss(s.rng, 0, s.config.value.chaseSigma));
}

/** Below `ceiling`, identity. Above it, tapers to logarithmic growth instead of compounding freely. */
function softCap(x: number, ceiling: number): number {
  return x <= ceiling ? x : ceiling * (1 + Math.log(x / ceiling));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function emit(s: SimState, kind: SimEvent['kind'], interrupts: boolean, refs: SimEvent['refs'], data: SimEvent['data'] = {}): void {
  s.events.push({ id: nextId(s, 'ev') as EventId, t: s.tick, kind, interrupts, refs, data });
}

// ---------------------------------------------------------------------------
// Decision handlers
// ---------------------------------------------------------------------------

export function submit(s: SimState, d: Decision): void { s.inbox.push(d); }

// The builders below take the id rather than minting one: the submitter mints
// it (see `api`) so it can reference the entity in later decisions in the same
// batch, before any of them have been applied.

function createIp(s: SimState, id: IpId, name: string, kind: IpEntity['kind']): void {
  const r = s.rng;
  bumpRoster(s);
  s.ips[id] = {
    id, publisherId: s.playerId, name, kind, createdTick: s.tick, relatedIps: [],
    truth: {
      // The whole game lives in this roll. High variance is deliberate.
      relatability: randRange(r, 8, 96),
      affinities: Object.fromEntries(SEGMENTS.map(g => [g, randRange(r, -0.8, 0.9)])) as any,
      longevity: randRange(r, 0.85, 1.18),
      readingNoiseSeed: rand(r),
    },
    exposure: 0, affection: 4, affectionHistory: emptySeries(s.tick),
    resurgence: 0, resurgenceHistory: emptySeries(s.tick),
    appearanceCount: 0, cameoCount: 0, firstPrintingId: null, isMascot: false,
  };
}

function createSet(s: SimState, id: SetId, name: string, type: SetType, size: number): void {
  bumpRoster(s);
  s.sets[id] = {
    id, publisherId: s.playerId, name, type, status: 'design',
    cardIds: [], productIds: [], collabId: null,
    regionSchedule: [], designStartTick: s.tick, commitTick: null, revealStartTick: null,
    budget: C(0), actualCost: C(0), printQuality: 'standard', attentionCost: 0,
    performance: null, hype: null,
  };
}

/** The fields the engine derives when a decision doesn't spell them out. */
interface CardOverrides {
  name?: string;
  treatment?: Treatment;
  serialized?: { runSize: number } | null;
  artBrief?: Partial<ArtBrief>;
  flavorText?: string;
}

function designCard(
  s: SimState, id: CardId, setId: SetId, subjectIp: IpId, cameos: IpId[],
  rarity: Rarity, artistId: ArtistId, overrides: CardOverrides = {},
): void {
  const artist = s.artists[artistId]!;
  const fit = (artist.stats.composition + artist.stats.linework + artist.stats.color) / 3;
  s.cards[id] = {
    id, publisherId: s.playerId,
    name: overrides.name ?? `${s.ips[subjectIp]!.name} ${rarity}`,
    createdTick: s.tick,
    subjectIp, cameos, rarity,
    treatment: overrides.treatment ?? (rarity === 'common' ? 'none' : 'holo'),
    serialized: overrides.serialized ?? null, artistId,
    artBrief: { mood: 'neutral', composition: 'portrait', budget: artist.rate, notes: '', ...overrides.artBrief },
    artQuality: U(fit * 0.75 + randRange(s.rng, 0, 0.35)),
    progressionLink: null, illustrationLink: null, flavorText: overrides.flavorText ?? '',
  };
  s.sets[setId]!.cardIds.push(id);
}

function defineProduct(
  s: SimState, id: ProductId, setId: SetId, kind: ProductKind,
  regionId: RegionId, packs: number, msrp: number, cardsPerPack = 10,
): void {
  bumpRoster(s);
  s.products[id] = {
    id, lineId: `line_${kind}` as ProductLineId, setId, regionId, kind,
    packsPerUnit: packs, cardsPerPack,
    msrp: C(msrp), unitCogs: C(0),
    unitsPrinted: 0, unitsRemaining: 0, allocations: {},
    scalperAppeal: U(kind === 'etb' || kind === 'premiumCollection' ? 0.8 : 0.4),
    market: {
      price: C(msrp), heat: 1, nostalgia: 1, history: emptySeries(s.tick),
      hidden: { sealedRemaining: 0, ripRate: s.config.sealed.baseRipRatePerTick, heldByCollectors: U(0.35) },
    },
  };
  s.sets[setId]!.productIds.push(id);
}

function commitPrintRun(s: SimState, setId: SetId, quantities: Record<ProductId, number>, quality: PrintQualityTier): void {
  const set = s.sets[setId]!;
  const pub = s.publishers[set.publisherId]!;
  let cost = 0;
  for (const [pid, qty] of Object.entries(quantities)) {
    const p = s.products[pid as ProductId]!;
    p.unitsPrinted = qty;
    p.unitsRemaining = qty;
    p.unitCogs = C(s.config.printing.unitCost[quality] * p.packsPerUnit * 0.55);
    p.market.hidden.sealedRemaining = qty;
    cost += p.unitCogs * qty;
  }
  set.printQuality = quality;
  set.actualCost = C(cost);
  set.status = 'committed';
  set.commitTick = s.tick;
  pub.cash = C(pub.cash - cost);
  pub.ledger.push({ t: s.tick, amount: C(-cost), category: 'print_run', note: set.name, refId: setId });

  // Blind commitment: reveal and release are scheduled here, before any signal.
  // `scheduleReveal` can move the reveal start inside this window afterwards.
  // The release date and the print run cannot move at all — that is the bet.
  set.revealStartTick = T(s.tick + 12);
  set.regionSchedule = [{ regionId: 'reg_us' as RegionId, releaseTick: T(s.tick + 18) }];
  set.hype = {
    cadence: s.config.hype.defaultCadenceWeeks,
    cardsRevealed: 0, lastRevealTick: null,
    revealHype: 0, marketingSpend: C(0), prereleases: 0, prereleaseScale: 0,
    level: 0, levelAtRelease: null, signal: 0,
  };
}

/**
 * Reprints add supply to the CARD, never to the original printing — so this
 * mints a second printing with its own population and market, and leaves the
 * original's supply untouched (CONCEPT.md §5). It skips the
 * commit → reveal → release pipeline on purpose: the whole point of a reprint
 * is that the blind bet is already settled.
 */
function reprint(s: SimState, cardId: CardId, intoSetId: SetId, quantity: number): void {
  const card = s.cards[cardId];
  const set = s.sets[intoSetId];
  if (!card || !set) return;
  const cfg = s.config;
  const originalId = s.printingByCard[cardId] ?? null;

  const id = nextId(s, 'pr') as PrintingId;
  const err = chance(s.rng, cfg.printing.errorRate[set.printQuality])
    ? {
        kind: pick(s.rng, ['miscut', 'inkError', 'missingFoil', 'wrongBack', 'textError', 'crimp'] as const),
        incidence: randRange(s.rng, 0.0001, 0.004), discoveredTick: null,
      }
    : null;

  bumpRoster(s);
  s.printings[id] = {
    id, cardId, setId: intoSetId, regionId: 'reg_us' as RegionId, releaseTick: s.tick,
    printQuantity: Math.max(1, quantity), pullRate: RARITY_PULL[card.rarity] / 10,
    printQuality: set.printQuality,
    isReprintOf: originalId, error: err,
    // A reprint rolls its own chase. It is a different collectible, and the
    // market is free to want it more or less than the printing it copies.
    truth: { chase: rollChase(s) },
    population: { sealed: Math.max(1, quantity), opened: 0, destroyed: 0, graded: {} as any },
    market: {
      rawPrice: C(cfg.value.baseCardPrice), gradedPrices: {} as any,
      heat: 1.6, nostalgia: 1, liquidity: U(0.5), lastTradeTick: s.tick,
      rawHistory: emptySeries(s.tick), gradedHistory: {} as any,
    },
  };
  // printingByCard deliberately still points at the original. tickSealed reads
  // it per set to value a sealed product's contents; repointing it here would
  // make the original set's sealed price track the reprint instead.

  // Making the chase accessible again costs the original some of its aura.
  if (originalId) {
    const orig = s.printings[originalId];
    if (orig) orig.market.nostalgia = Math.max(1, orig.market.nostalgia * 0.85);
  }
}

/**
 * Channel allocation is the second half of the blind bet (CONCEPT.md §2). It
 * locks with the print run, before reveal, so it only lands on a set that has
 * not shipped yet. Each channel takes what its relationship lets it take and no
 * more; anything the channels will not carry stays in the warehouse unsold.
 */
function allocate(s: SimState, productId: ProductId, allocations: Record<ChannelId, number>): void {
  const p = s.products[productId];
  if (!p) return;
  const set = s.sets[p.setId];
  if (!set || set.status === 'released' || set.status === 'archived') return;
  const pub = s.publishers[set.publisherId];
  if (!pub) return;

  let left = p.unitsPrinted - allocatedUnits(p);
  for (const [cid, requested] of Object.entries(allocations)) {
    if (left <= 0) break;
    const ch = s.channels[cid as ChannelId];
    if (!ch || !ch.unlocked) continue;
    if (!pub.unlocks.channels.includes(ch.id)) continue;
    if (ch.regionId !== p.regionId) continue;

    const existing = p.allocations[ch.id];
    const headroom = effectiveCapacity(ch) - (existing ? existing.units : 0);
    const units = Math.min(Math.max(0, Math.floor(requested)), headroom, left);
    if (units < ch.minimumOrder) continue;

    if (existing) {
      existing.units += units;
      existing.unitsRemaining += units;
    } else {
      p.allocations[ch.id] = {
        units, unitsRemaining: units, streetPrice: p.msrp, soldOutTick: null,
      };
    }
    ch.lastAllocatedTick = s.tick;
    left -= units;
  }
}

/**
 * Buys a gated channel. Only the channel branch of the unlock tree is wired;
 * the rest of `UnlockState` is still a later pass.
 */
function purchaseUnlock(s: SimState, unlock: keyof UnlockState, detail?: string): void {
  if (unlock !== 'channels' || !detail) return;
  const pub = s.publishers[s.playerId];
  const ch = s.channels[detail as ChannelId];
  if (!pub || !ch || ch.unlocked) return;
  if (pub.brandStanding < ch.requiredBrandStanding) return;

  const cost = unlockCost(s, ch);
  if (pub.cash < cost) return;
  pub.cash = C(pub.cash - cost);
  pub.ledger.push({ t: s.tick, amount: C(-cost), category: 'unlock', note: ch.name, refId: ch.id });

  ch.unlocked = true;
  // Re-establishing a channel you soured out of starts the relationship over.
  // It must clear `lossThreshold` outright, not merely sit at the configured
  // reopen value: otherwise it reopens still below the loss line and is dropped
  // again on the next evaluation, which is a thrash loop, not a comeback.
  const chCfg = s.config.channels;
  ch.relationship = U(Math.max(
    ch.relationship, chCfg.reopenRelationship, chCfg.lossThreshold + 0.1,
  ));
  // Start the idle clock now, so a channel bought between releases does not
  // immediately sour for having had nothing to sell.
  ch.lastAllocatedTick = s.tick;
  if (!pub.unlocks.channels.includes(ch.id)) pub.unlocks.channels.push(ch.id);
  if (ch.kind === 'direct') pub.unlocks.directStore = true;
  emit(s, 'channelUnlocked', true, { channelId: ch.id, publisherId: pub.id }, { kind: ch.kind, cost });
}

/**
 * Puts a fixed quantity of one product up for a drop at a chosen tick. Only the
 * direct store runs drops: every other channel sells continuously off a shelf,
 * and that is the whole difference between them (CONCEPT.md §6.5).
 *
 * The player schedules a drop; the engine schedules one for them when they
 * don't, exactly as `allocate` and `autoAllocate` already split that job.
 */
function scheduleDrop(
  s: SimState, id: DropId, productId: ProductId, channelId: ChannelId,
  atTick: Tick, units: number,
): void {
  const p = s.products[productId];
  const ch = s.channels[channelId];
  if (!p || !ch || ch.kind !== 'direct' || !ch.unlocked) return;
  if (!p.allocations[ch.id]) return;
  const offered = Math.floor(units);
  if (offered <= 0) return;
  // One pending drop per allocation. A store cannot queue the same stock twice,
  // and without this a caller that submits every tick stacks drops on one tick.
  for (const existing of Object.values(s.drops)) {
    if (existing.status === 'scheduled'
      && existing.productId === productId && existing.channelId === channelId) return;
  }

  // A drop scheduled into the past runs on the next tick rather than never.
  s.drops[id] = {
    id, productId, channelId, scheduledTick: T(Math.max(s.tick, atTick)),
    offered, automatic: false, status: 'scheduled', result: null,
  };
  emit(s, 'dropScheduled', false, { channelId: ch.id, setId: p.setId },
    { productId: p.id, offered, atTick: s.drops[id]!.scheduledTick as number });
}

function applyDecision(s: SimState, d: Decision): void {
  switch (d.type) {
    case 'createIp': createIp(s, d.payload.id, d.payload.name, d.payload.kind); break;
    case 'createSet': createSet(s, d.payload.id, d.payload.name, d.payload.setType, d.payload.targetSize); break;
    case 'designCard':
      designCard(s, d.payload.id, d.payload.setId, d.payload.subjectIp, d.payload.cameos,
        d.payload.rarity, d.payload.artistId, {
          name: d.payload.name, treatment: d.payload.treatment, serialized: d.payload.serialized,
          artBrief: d.payload.artBrief, flavorText: d.payload.flavorText,
        });
      break;
    case 'defineProduct':
      defineProduct(s, d.payload.id, d.payload.setId, d.payload.kind, d.payload.regionId,
        d.payload.packsPerUnit, d.payload.msrp, d.payload.cardsPerPack);
      break;
    case 'commitPrintRun':
      commitPrintRun(s, d.payload.setId, d.payload.quantities, d.payload.quality);
      break;
    case 'allocate': allocate(s, d.payload.productId, d.payload.allocations); break;
    case 'purchaseUnlock': purchaseUnlock(s, d.payload.unlock, d.payload.detail); break;
    case 'reprint': reprint(s, d.payload.cardId, d.payload.intoSetId, d.payload.quantity); break;
    case 'scheduleReveal':
      scheduleReveal(s, d.payload.setId, d.payload.startTick, d.payload.cadence);
      break;
    case 'hostPrerelease':
      hostPrerelease(s, d.payload.setId, d.payload.scale, d.payload.budget);
      break;
    case 'marketingSpend':
      marketingSpend(s, d.payload.setId, d.payload.amount);
      break;
    case 'scheduleDrop':
      scheduleDrop(s, d.payload.id, d.payload.productId, d.payload.channelId,
        d.payload.atTick, d.payload.units);
      break;
    case 'borrow': {
      const pub = s.publishers[s.playerId]!;
      pub.cash = C(pub.cash + d.payload.amount);
      pub.debt = C(pub.debt + d.payload.amount);
      break;
    }
    case 'repay': {
      const pub = s.publishers[s.playerId]!;
      const amt = Math.min(pub.cash, pub.debt, d.payload.amount);
      pub.cash = C(pub.cash - amt); pub.debt = C(pub.debt - amt);
      break;
    }
    // Not simulated yet: commissionArt, hireArtist, signCollab, unlockRegion,
    // advance. `purchaseUnlock` handles its channel branch only.
    default: break;
  }
}

/**
 * The only way to drive the sim. Each call mints the entity id, submits a
 * decision, and hands the id back, so callers can chain a whole release in one
 * batch while every action still lands in the decision log.
 */
export const api = {
  createIp(s: SimState, name: string, kind: IpEntity['kind']): IpId {
    const id = nextId(s, 'ip') as IpId;
    submit(s, { type: 'createIp', tick: s.tick, payload: { id, name, kind } });
    return id;
  },
  createSet(s: SimState, name: string, setType: SetType, targetSize: number): SetId {
    const id = nextId(s, 'set') as SetId;
    submit(s, { type: 'createSet', tick: s.tick, payload: { id, name, setType, targetSize } });
    return id;
  },
  designCard(s: SimState, setId: SetId, subjectIp: IpId, cameos: IpId[], rarity: Rarity, artistId: ArtistId): CardId {
    const id = nextId(s, 'card') as CardId;
    submit(s, { type: 'designCard', tick: s.tick, payload: { id, setId, subjectIp, cameos, rarity, artistId } });
    return id;
  },
  defineProduct(s: SimState, setId: SetId, kind: ProductKind, regionId: RegionId, packs: number, msrp: number): ProductId {
    const id = nextId(s, 'prod') as ProductId;
    submit(s, {
      type: 'defineProduct', tick: s.tick,
      payload: { id, setId, kind, regionId, packsPerUnit: packs, msrp: C(msrp) },
    });
    return id;
  },
  commitPrintRun(s: SimState, setId: SetId, quantities: Record<ProductId, number>, quality: PrintQualityTier): void {
    submit(s, { type: 'commitPrintRun', tick: s.tick, payload: { setId, quantities, quality } });
  },
  allocate(s: SimState, productId: ProductId, allocations: Record<ChannelId, number>): void {
    submit(s, { type: 'allocate', tick: s.tick, payload: { productId, allocations } });
  },
  purchaseUnlock(s: SimState, unlock: keyof UnlockState, detail?: string): void {
    submit(s, { type: 'purchaseUnlock', tick: s.tick, payload: { unlock, detail } });
  },
  reprint(s: SimState, cardId: CardId, intoSetId: SetId, quantity: number): void {
    submit(s, { type: 'reprint', tick: s.tick, payload: { cardId, intoSetId, quantity } });
  },
  scheduleReveal(s: SimState, setId: SetId, startTick: Tick, cadence: number): void {
    submit(s, { type: 'scheduleReveal', tick: s.tick, payload: { setId, startTick, cadence } });
  },
  hostPrerelease(s: SimState, setId: SetId, scale: number, budget: Cents): void {
    submit(s, { type: 'hostPrerelease', tick: s.tick, payload: { setId, scale, budget } });
  },
  marketingSpend(s: SimState, setId: SetId, amount: Cents): void {
    submit(s, { type: 'marketingSpend', tick: s.tick, payload: { setId, amount } });
  },
  scheduleDrop(s: SimState, productId: ProductId, channelId: ChannelId, atTick: Tick, units: number): DropId {
    const id = nextId(s, 'drop') as DropId;
    submit(s, { type: 'scheduleDrop', tick: s.tick, payload: { id, productId, channelId, atTick, units } });
    return id;
  },
};

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

function releaseSet(s: SimState, setId: SetId, regionId: RegionId): void {
  const set = s.sets[setId]!;
  const cfg = s.config;
  set.status = 'released';

  // Hype stops being built the moment the set ships. What it reached is what
  // the launch gets, and it burns off from there.
  const hype = set.hype;
  if (hype) hype.levelAtRelease = hype.level;
  const launchHype = hype?.levelAtRelease ?? 0;

  // A product the player never allocated goes out on the default split. Anything
  // the channels will not carry stays unallocated, and unallocated stock cannot
  // sell — that is the honest cost of printing past your channel reach.
  for (const pid of set.productIds) {
    const p = s.products[pid]!;
    if (Object.keys(p.allocations).length === 0) autoAllocate(s, p, set.publisherId);
  }

  for (const cardId of set.cardIds) {
    const card = s.cards[cardId]!;
    const id = nextId(s, 'pr') as PrintingId;
    const totalPacks = set.productIds.reduce((n, pid) => {
      const p = s.products[pid]!;
      return n + p.unitsPrinted * p.packsPerUnit;
    }, 0);
    const pullRate = RARITY_PULL[card.rarity] / 10;
    const err = chance(s.rng, cfg.printing.errorRate[set.printQuality])
      ? { kind: pick(s.rng, ['miscut', 'inkError', 'missingFoil', 'wrongBack', 'textError', 'crimp'] as const), incidence: randRange(s.rng, 0.0001, 0.004), discoveredTick: null }
      : null;

    const printing: Printing = {
      id, cardId, setId, regionId, releaseTick: s.tick,
      printQuantity: Math.max(1, Math.round(totalPacks * pullRate)),
      pullRate, printQuality: set.printQuality,
      isReprintOf: null, error: err,
      truth: { chase: rollChase(s) },
      population: { sealed: Math.round(totalPacks * pullRate), opened: 0, destroyed: 0, graded: {} as any },
      market: {
        rawPrice: C(cfg.value.baseCardPrice), gradedPrices: {} as any,
        // A hyped set launches hot. This is where the reveal window reaches the
        // value engine; a set with no campaign opens at exactly 1.6 as before.
        heat: 1.6 + launchHype * cfg.hype.heatFromHype,
        nostalgia: 1, liquidity: U(0.5), lastTradeTick: s.tick,
        rawHistory: emptySeries(s.tick), gradedHistory: {} as any,
      },
    };
    bumpRoster(s);
    s.printings[id] = printing;
    s.printingByCard[cardId] = id;

    const ip = s.ips[card.subjectIp]!;
    ip.appearanceCount++;
    if (!ip.firstPrintingId) ip.firstPrintingId = id;
    for (const cid of card.cameos) s.ips[cid]!.cameoCount++;
  }

  // Attention is consumed on release. This is the flood penalty. Goodwill
  // burns harder the less attention has recovered since the last release —
  // releasing into an already-exhausted audience is what a flood looks like.
  let goodwillBurn = 0;
  for (const seg of SEGMENTS) {
    const st = s.audience.segments[seg];
    const floodPenalty = Math.max(0, 1 - st.attention / cfg.attention.perReleaseCost);
    const before = st.goodwill;
    st.goodwill = Math.max(0, st.goodwill - cfg.attention.goodwillSensitivity * 0.06 * (0.3 + floodPenalty));
    goodwillBurn += st.goodwill - before;
    st.attention = Math.max(0, st.attention - cfg.attention.perReleaseCost);
    st.fatigue = Math.min(1, st.fatigue + cfg.attention.fatigueGain);
  }
  set.attentionCost = cfg.attention.perReleaseCost;

  // `goodwillDelta` starts at what the release cost and is paid back by
  // sell-through in `tickChannels`. A set that sells is a set that is forgiven.
  set.performance = {
    unitsSold: 0, unitsUnsold: 0, revenue: C(0),
    sellThroughByChannel: {} as SetPerformance['sellThroughByChannel'],
    // The truth the reveal window's signal was a measurement of, recorded at
    // the moment it stops being guessable. Keeping it is what lets the harness
    // ask whether the signal was informative — a signal nobody can score is a
    // signal nobody can tune.
    chaseIndex: setChase(s, set), aftermarketIndex: 0,
    goodwillDelta: goodwillBurn / SEGMENTS.length,
  };
  emit(s, 'setReleased', true, { setId, publisherId: set.publisherId }, { cards: set.cardIds.length });
}

// ---------------------------------------------------------------------------
// Per-tick systems
// ---------------------------------------------------------------------------

function tickAffection(s: SimState, ips: IpEntity[]): void {
  const cfg = s.config.affection;
  for (const ip of ips) {
    if (ip.exposure > 0) {
      const target = ip.truth.relatability;
      const conv = Math.min(1, ip.exposure / cfg.exposureToConvergence);
      ip.affection += (target - ip.affection) * cfg.convergenceRate * conv;
      ip.exposure *= 0.985;
    } else {
      ip.affection *= (1 - cfg.decayPerTickUnexposed);
    }
    ip.resurgence *= (1 - cfg.resurgenceDecayPerTick);
    writePoint(ip.affectionHistory, s.tick, ip.affection, 0.04);
  }
}

/**
 * What fatigue leaves of demand — the counterweight to infinite printing in
 * CONCEPT.md §6.2. Replaces a hard-coded `1 - fatigue * 0.6`.
 *
 * The two knobs do different jobs, and it is worth not confusing them:
 *
 * - `fatigueBite` is what makes flooding fatal. The old 0.6 let a publisher
 *   saturate fatigue and still keep 40% of its demand, whatever it did.
 * - `fatigueExponent` protects the careful publisher, and only that. Above 1 it
 *   makes low fatigue nearly free. It does NOT sharpen the penalty in the middle
 *   of the range — there a higher exponent is more forgiving, not less.
 *
 * Neither knob matters unless fatigue actually takes intermediate values, which
 * is the job of the proportional decay in `tickAudience`.
 */
function fatigueResponse(s: SimState, fatigue: number): number {
  const cfg = s.config.attention;
  const f = Math.max(0, Math.min(1, fatigue));
  return Math.max(0, 1 - cfg.fatigueBite * Math.pow(f, cfg.fatigueExponent));
}

function castDesire(s: SimState, card: Card): number {
  const cfg = s.config;
  const subj = s.ips[card.subjectIp]!;
  let d = subj.affection + subj.resurgence * cfg.affection.resurgenceToModernDemand * 100;
  for (const cid of card.cameos) d += s.ips[cid]!.affection * cfg.value.cameoWeight;
  return Math.max(1, d);
}

/**
 * Prices update on a 4-tick rotation rather than every tick. Nothing in the
 * fiction moves weekly anyway, and it is the single biggest cost in a long run.
 */
const PRICE_STRIDE = 4;

function tickPrices(s: SimState, printings: Printing[]): void {
  const cfg = s.config;
  const v = cfg.value;
  const yearFrac = PRICE_STRIDE / 52;
  const phase = s.tick % PRICE_STRIDE;
  // Loop invariants. `heatKeep` in particular is a `Math.pow` with two constant
  // arguments that used to run once per printing per tick.
  const heatKeep = Math.pow(1 - v.heatDecayPerTick, PRICE_STRIDE);
  const standingRef = v.baseCardPrice * v.nostalgiaStandingReference;
  const shockRate = v.shockChancePerTick * PRICE_STRIDE;
  const resurgenceChance = 0.02 * PRICE_STRIDE;
  const errorDiscoveryChance = cfg.printing.errorDiscoveryChance;
  const writeThreshold = cfg.history.writeThreshold;
  const climate = s.market.climate;
  for (let i = phase; i < printings.length; i += PRICE_STRIDE) {
    const pr = printings[i]!;
    const card = s.cards[pr.cardId]!;
    const artist = s.artists[card.artistId]!;

    const desire = castDesire(s, card);
    const surviving = Math.max(1, pr.population.sealed + pr.population.opened - pr.population.destroyed);
    // Rarity's price effect flows only through scarcity (print quantity is
    // already rarity-scaled via RARITY_PULL at release) — see CONCEPT.md §5.
    // RARITY_WEIGHT stays out of price; it's a demand-side signal in tickSales.
    const scarcity = Math.pow(v.referencePopulation / surviving, v.scarcityExponent);
    const art = 1 + card.artQuality * artist.reputation * v.artMultiplierWeight;

    pr.market.heat = Math.min(v.heatCeiling, 1 + (pr.market.heat - 1) * heatKeep);

    // Nostalgia compounds only on a printing the market still wants, and only
    // as fast as it already stands above the pack. A printing nobody wants
    // drifts back toward 1. The old unconditional 5%/year lifted every price
    // together, which set the level far too high and flattened the shape.
    const standing = pr.market.rawPrice / standingRef;
    const gate = Math.min(1, desire / v.nostalgiaDesireReference) * Math.min(1, standing);
    const brand = 0.4 + s.publishers[card.publisherId]!.brandStanding;
    const nostalgiaRate = v.nostalgiaRatePerYear * gate * brand
      - v.nostalgiaDecayPerYear * (1 - gate);
    pr.market.nostalgia = Math.max(1, Math.min(v.nostalgiaCeiling,
      pr.market.nostalgia * (1 + nostalgiaRate * yearFrac)));

    // A visible speculation event. The hidden chase roll weights it, so the
    // cards that spike are the cards the market quietly wanted — CONCEPT.md
    // §5, "random commons should occasionally take off".
    const shockChance = shockRate * pr.truth.chase
      * Math.min(2, desire / v.nostalgiaDesireReference);
    if (chance(s.rng, shockChance)) {
      pr.market.heat = Math.min(v.heatCeiling, pr.market.heat + v.shockGain);
      emit(s, 'priceSpike', false, { printingId: pr.id, cardId: pr.cardId }, { heat: pr.market.heat });
    }
    // Errors sit in circulation unnoticed until somebody spots one.
    if (pr.error && pr.error.discoveredTick === null && chance(s.rng, errorDiscoveryChance)) {
      pr.error.discoveredTick = s.tick;
      emit(s, 'errorDiscovered', true, { printingId: pr.id, cardId: pr.cardId },
        { kind: pr.error.kind, incidence: pr.error.incidence });
    }
    if (pr.error && pr.error.discoveredTick !== null) {
      pr.market.heat = Math.min(v.heatCeiling, pr.market.heat + 0.002 / Math.max(0.0002, pr.error.incidence) * 0.00002);
    }

    const noise = 1 + gauss(s.rng, 0, v.noiseSigma);
    const rawMultiplier = scarcity * (desire / 40) * art * pr.truth.chase
      * pr.market.heat * pr.market.nostalgia * climate * noise;
    const cappedMultiplier = softCap(rawMultiplier, v.priceCeilingMultiple);
    const target = v.baseCardPrice * cappedMultiplier;

    // Prices are sticky; they drift toward target rather than snapping.
    pr.market.rawPrice = C(pr.market.rawPrice * 0.62 + Math.max(v.priceFloorCents, target) * 0.38);
    writePoint(pr.market.rawHistory, s.tick, pr.market.rawPrice, writeThreshold);

    // Vintage price growth feeds character resurgence. Every printing seeds
    // at a flat baseCardPrice regardless of rarity (see releaseSet), so the
    // baseline here matches that seed, not a rarity-scaled one.
    const ageYears = (s.tick - pr.releaseTick) / 52;
    if (ageYears > 5 && chance(s.rng, resurgenceChance)) {
      const ip = s.ips[card.subjectIp]!;
      const growth = pr.market.rawPrice / Math.max(1, v.baseCardPrice);
      if (growth > 3) {
        ip.resurgence = Math.min(1, ip.resurgence + cfg.affection.resurgenceFromVintage * 0.02);
        emit(s, 'characterResurgence', false, { ipId: ip.id, printingId: pr.id }, { growth });
      }
    }
  }
}

const SEALED_STRIDE = 4;
/** Expected-contents value is expensive and slow-moving; cache it per product. */
const contentsCache = new WeakMap<object, number>();

function tickSealed(s: SimState, products: Product[]): void {
  const cfg = s.config.sealed;
  const yearFrac = SEALED_STRIDE / 52;
  if (s.tick % SEALED_STRIDE !== 0) return;
  for (const p of products) {
    const h = p.market.hidden;
    if (h.sealedRemaining <= 0) continue;
    const set = s.sets[p.setId]!;
    if (set.status !== 'released') continue;

    // Expected contents value drives sealed price. Recomputed occasionally.
    let contents = contentsCache.get(p) ?? 0;
    if (s.tick % (SEALED_STRIDE * 6) === 0 || contents === 0) {
      contents = 0;
      for (const cardId of set.cardIds) {
        const card = s.cards[cardId]!;
        const pr = s.printings[s.printingByCard[cardId]!];
        if (pr) contents += pr.market.rawPrice * RARITY_PULL[card.rarity] / 10;
      }
      contents *= p.packsPerUnit;
      contentsCache.set(p, contents);
    }

    p.market.nostalgia *= 1 + cfg.sealedNostalgiaRatePerYear * yearFrac;
    // Drop chaos is short-lived. `resolveDrop` adds heat when a queue does not
    // clear and `tickScalpers` takes it back out as they dump; this is the
    // decay that stops either from compounding.
    p.market.heat = Math.min(cfg.heatCeiling,
      1 + (p.market.heat - 1) * Math.pow(1 - cfg.heatDecayPerTick, SEALED_STRIDE));
    const scarcity = Math.pow(Math.max(1, p.unitsPrinted) / Math.max(1, h.sealedRemaining), 0.5);
    const target = (contents * cfg.contentsWeight + p.msrp * 0.6) * scarcity * p.market.nostalgia * p.market.heat;
    p.market.price = C(p.market.price * 0.9 + Math.max(p.msrp * 0.4, target) * 0.1);
    writePoint(p.market.history, s.tick, p.market.price, s.config.history.writeThreshold);

    // Ripping destroys sealed supply and adds singles supply. Rising price slows it.
    const priceRatio = p.market.price / Math.max(1, p.msrp);
    h.ripRate = cfg.baseRipRatePerTick / Math.pow(Math.max(0.3, priceRatio), cfg.ripPriceElasticity);
    const opened = Math.min(h.sealedRemaining, h.sealedRemaining * h.ripRate);
    h.sealedRemaining -= opened;

    for (const cardId of set.cardIds) {
      const card = s.cards[cardId]!;
      const pr = s.printings[s.printingByCard[cardId]!];
      if (!pr) continue;
      const pulled = opened * p.packsPerUnit * RARITY_PULL[card.rarity] / 10;
      pr.population.sealed = Math.max(0, pr.population.sealed - pulled);
      pr.population.opened += pulled;
    }
  }
}

/**
 * The reveal window (CONCEPT.md §2). Three levers spend money and audience
 * attention to shape demand for a set that is already printed, and one noisy
 * read comes back the other way.
 *
 * None of them can change the print run. That restriction is the entire point:
 * the player finds out during the reveal whether the blind bet was good, and
 * the only things still open to them are allocation, drops, and how hard to
 * push. A lever that could unprint would delete the bet.
 */

/** Hype from marketing. Read off the cumulative spend, so it diminishes by construction. */
function marketingHype(s: SimState, spend: Cents): number {
  const cfg = s.config.hype;
  return cfg.marketingHypeGain * Math.log(1 + spend / Math.max(1, cfg.marketingReference));
}

/** Hype from prereleases. Diminishes in the number hosted, not just the scale. */
function prereleaseHype(s: SimState, scale: number, count: number): number {
  const cfg = s.config.hype;
  return cfg.prereleaseHypeGain * scale / (1 + 0.5 * Math.max(0, count - 1));
}

/** Recomputes `level` from its three parts. Only meaningful before release. */
function recomputeHype(s: SimState, set: CardSet): void {
  const h = set.hype;
  if (!h) return;
  const total = h.revealHype
    + marketingHype(s, h.marketingSpend)
    + prereleaseHype(s, h.prereleaseScale, h.prereleases);
  h.level = Math.max(0, Math.min(s.config.hype.ceiling, total));
}

/** The set is still in the window where hype can be built. */
function inRevealWindow(set: CardSet): boolean {
  return set.status === 'committed' || set.status === 'revealing';
}

/**
 * Moves the reveal start and sets the drip cadence. A longer window and a
 * slower drip build more hype and burn more attention; a short one is cheap and
 * quiet. The reveal cannot outlast the release it is advertising.
 */
function scheduleReveal(s: SimState, setId: SetId, startTick: Tick, cadence: number): void {
  const set = s.sets[setId];
  if (!set || !set.hype || !inRevealWindow(set)) return;
  const release = set.regionSchedule[0]?.releaseTick;
  if (release === undefined) return;

  set.revealStartTick = T(Math.max(s.tick, Math.min(startTick, release)));
  set.hype.cadence = Math.max(1, Math.round(cadence));
  // Bringing the reveal forward past a start that has already fired would
  // otherwise re-open a window the set has left.
  if (set.status === 'revealing' && set.revealStartTick > s.tick) set.status = 'committed';
}

/**
 * Cash for pre-launch demand. The curve is logarithmic in the cumulative spend,
 * so a publisher cannot simply buy a hit: the second million buys much less
 * than the first, and a set nobody wants still sells to nobody.
 */
function marketingSpend(s: SimState, setId: SetId, amount: Cents): void {
  const set = s.sets[setId];
  if (!set || !set.hype || !inRevealWindow(set)) return;
  const pub = s.publishers[set.publisherId];
  if (!pub) return;
  const spend = Math.min(Math.max(0, amount), Math.max(0, pub.cash));
  if (spend <= 0) return;

  pub.cash = C(pub.cash - spend);
  pub.ledger.push({ t: s.tick, amount: C(-spend), category: 'marketing', note: set.name, refId: set.id });
  set.hype.marketingSpend = C(set.hype.marketingSpend + spend);
  recomputeHype(s, set);
}

/**
 * A prerelease event, run through the LGS network — CONCEPT.md §6.5 gives the
 * LGS the prerelease infrastructure and the goodwill. This is the deliberate
 * counterweight to a direct-store drop: a drop is full margin paid for in
 * goodwill, a prerelease is goodwill paid for in cash.
 */
function hostPrerelease(s: SimState, setId: SetId, scale: number, budget: Cents): void {
  const set = s.sets[setId];
  if (!set || !set.hype || !inRevealWindow(set)) return;
  const pub = s.publishers[set.publisherId];
  const lgs = s.channels[CHANNEL_IDS.lgs];
  if (!pub || !lgs || !lgs.unlocked) return;
  if (!pub.unlocks.channels.includes(lgs.id)) return;

  const cfg = s.config.hype;
  // Scale is bounded by whichever runs out first: the budget the player set, or
  // the cash they actually have.
  const affordable = Math.min(budget, pub.cash) / Math.max(1, cfg.prereleaseCostPerScale);
  const actual = Math.max(0, Math.min(scale, affordable));
  if (actual <= 0) return;

  const cost = C(actual * cfg.prereleaseCostPerScale);
  pub.cash = C(pub.cash - cost);
  pub.ledger.push({ t: s.tick, amount: C(-cost), category: 'event', note: `prerelease ${set.name}`, refId: set.id });

  set.hype.prereleases += 1;
  set.hype.prereleaseScale += actual;
  recomputeHype(s, set);

  for (const g of SEGMENTS) {
    const st = s.audience.segments[g];
    st.goodwill = U(st.goodwill + cfg.prereleaseGoodwillGain * actual);
  }
  lgs.relationship = U(lgs.relationship + cfg.prereleaseRelationshipGain * actual);
  emit(s, 'communitySentiment', true, { setId: set.id, channelId: lgs.id, publisherId: pub.id },
    { kind: 'prerelease', scale: actual, cost, hype: set.hype.level });
}

/**
 * One preview drop. Costs attention, adds hype, and sharpens the signal.
 *
 * The signal is a measurement of the set's true chase with error that shrinks
 * as previews land — an early read is nearly useless and a late one is decent,
 * but it is never exact and it arrives too late to reprint against. It is not
 * stored anywhere the value engine reads: it exists to be looked at.
 */
function tickReveal(s: SimState, set: CardSet): void {
  const cfg = s.config.hype;
  const h = set.hype;
  if (!h) return;
  if (h.lastRevealTick !== null && s.tick - (h.lastRevealTick as number) < h.cadence) return;
  if (h.cardsRevealed >= set.cardIds.length) return;

  h.lastRevealTick = s.tick;
  h.cardsRevealed += 1;

  // Diminishing: hype already earned makes the next preview worth less.
  const card = s.cards[set.cardIds[h.cardsRevealed - 1]!];
  const pull = card ? RARITY_WEIGHT[card.rarity] / 10 : 1;
  h.revealHype += cfg.revealHypePerCard * pull / (1 + h.revealHype / cfg.revealHalfLife);
  recomputeHype(s, set);

  // Previews are not free. They spend the same finite attention a release does,
  // so a long campaign into a tired audience is waste.
  for (const g of SEGMENTS) {
    const st = s.audience.segments[g];
    st.attention = Math.max(0, st.attention - cfg.revealAttentionCost);
  }

  const truth = setChase(s, set);
  // The error is multiplicative and lognormal, not additive-then-clamped. A
  // `1 + noise` read has to be clipped at zero once the sigma is wide enough to
  // matter, and clipping is what made a sixteen-preview campaign score *worse*
  // than no campaign at high sigma: the long campaign's extra draws piled up on
  // the floor and threw away the ordering the previews had bought. Here the
  // error only ever shrinks with the number of previews, which is what
  // CONCEPT.md §2 asks of the window.
  const noise = gauss(s.rng, 0, cfg.signalNoiseSigma / Math.sqrt(h.cardsRevealed));
  h.signal = truth * Math.exp(noise);
  emit(s, 'communitySentiment', false, { setId: set.id, publisherId: set.publisherId },
    { kind: 'reveal', revealed: h.cardsRevealed, signal: h.signal, hype: h.level });
}

/**
 * The audience aggregates that drive demand. Shared by the shelf sales in
 * `tickSales` and the drop queue in `resolveDrop`, so both read the same
 * audience rather than two drifting copies of it.
 */
interface AudienceAverages { attention: number; fatigue: number; goodwill: number }

function audienceAverages(s: SimState): AudienceAverages {
  let attention = 0, fatigue = 0, goodwill = 0;
  for (const g of SEGMENTS) {
    const st = s.audience.segments[g];
    attention += st.attention;
    fatigue += st.fatigue;
    goodwill += st.goodwill;
  }
  const n = SEGMENTS.length;
  return { attention: attention / n, fatigue: fatigue / n, goodwill: goodwill / n };
}

/** How much this set's cards are wanted, weighted by how hard they are to pull. */
function setChase(s: SimState, set: CardSet): number {
  let total = 0;
  for (const cid of set.cardIds) {
    const card = s.cards[cid]!;
    total += castDesire(s, card) * RARITY_WEIGHT[card.rarity] / 100;
  }
  return total / Math.max(1, set.cardIds.length);
}

function tickSales(s: SimState, products: Product[]): void {
  const cfg = s.config;
  // Audience state does not move inside this pass, and `setChase` walks every
  // card in a set — so both are computed once per tick rather than once per
  // product. Two products off one set used to pay for the same walk twice.
  const { attention, fatigue, goodwill } = audienceAverages(s);
  const fatigueTerm = fatigueResponse(s, fatigue);
  const goodwillTerm = 0.2 + 0.8 * goodwill;
  const chaseBySet = new Map<SetId, number>();
  for (const p of products) {
    if (p.unitsRemaining <= 0) continue;
    const set = s.sets[p.setId]!;
    if (set.status !== 'released') continue;
    const pub = s.publishers[set.publisherId]!;

    const allocs = Object.entries(p.allocations) as Array<[ChannelId, ChannelAllocation]>;
    if (allocs.length === 0) continue;

    let chase = chaseBySet.get(set.id);
    if (chase === undefined) {
      chase = setChase(s, set);
      chaseBySet.set(set.id, chase);
    }

    // Attention is shared with the rivals. Demand is measured relative to the
    // share the rest of this formula was tuned at, so a publisher sitting at
    // referenceShare behaves exactly as it did before rivals existed.
    const share = s.audience.shareByPublisher[pub.id] ?? 0;
    const shareFactor = share / cfg.attention.referenceShare;

    const weeksOut = (s.tick - set.regionSchedule[0]!.releaseTick) / 52;
    const decay = Math.exp(-weeksOut * 1.4);
    // The demand pool is what the audience wants this week, independent of who
    // is selling it. The channels then compete for it.
    // Hype multiplies the demand the set would have had. It cannot conjure
    // demand for a set nobody wants: a zero-chase set times any campaign is
    // still nearly zero.
    const pool = p.unitsPrinted * 0.06 * attention * shareFactor * fatigueTerm
      * goodwillTerm * (0.3 + pub.brandStanding) * (0.5 + chase) * decay
      * (1 + (set.hype?.level ?? 0));
    // Below half a unit every channel's share rounds to zero, so the rest of
    // this pass cannot sell anything. Old sets sit here for decades: `decay` is
    // e^(-1.4 * years), so a five-year-old set is already three zeroes down.
    if (pool < 0.5) continue;

    // Reach, relationship, and what the channel is actually charging. A store
    // marking product up above MSRP moves less of it.
    const weights: number[] = [];
    let totalWeight = 0;
    for (const [cid, a] of allocs) {
      const ch = s.channels[cid];
      if (!ch || a.unitsRemaining <= 0) { weights.push(0); continue; }
      const traits = traitsFor(ch);
      const priceResponse = Math.pow(p.msrp / Math.max(1, a.streetPrice), traits.priceElasticity);
      const w = a.unitsRemaining * traits.reach * (0.5 + 0.5 * ch.relationship) * priceResponse;
      weights.push(w);
      totalWeight += w;
    }
    if (totalWeight <= 0) continue;

    let revenue = 0;
    let soldTotal = 0;
    for (let i = 0; i < allocs.length; i++) {
      const w = weights[i]!;
      if (w <= 0) continue;
      const [cid, a] = allocs[i]!;
      const ch = s.channels[cid]!;
      // The direct store does not sell off a shelf; `resolveDrop` sells its
      // allocation. Its weight still counts toward `totalWeight` above, so the
      // demand it holds is reserved for its drops rather than handed to the
      // other channels.
      if (ch.kind === 'direct') continue;

      const sold = Math.max(0, Math.min(a.unitsRemaining, Math.round(pool * w / totalWeight)));
      if (sold <= 0) continue;
      a.unitsRemaining -= sold;
      soldTotal += sold;

      // The publisher is paid on MSRP, never on street price. A store that marks
      // up hot product keeps that upside — CONCEPT.md §4.
      revenue += sold * p.msrp * ch.marginShare;

      if (a.unitsRemaining === 0 && a.soldOutTick === null) {
        a.soldOutTick = s.tick;
        emit(s, 'setSoldOut', true, { setId: set.id, channelId: ch.id }, { productId: p.id, kind: ch.kind });
      }
    }
    if (soldTotal <= 0) continue;

    p.unitsRemaining = Math.max(0, p.unitsRemaining - soldTotal);
    pub.cash = C(pub.cash + revenue);
    pub.ledger.push({ t: s.tick, amount: C(revenue), category: 'sales', note: p.kind, refId: p.id });
    if (set.performance) set.performance.revenue = C(set.performance.revenue + revenue);

    // Selling builds exposure, which is what lets affection converge.
    for (const cid of set.cardIds) {
      const ip = s.ips[s.cards[cid]!.subjectIp];
      if (ip) ip.exposure += soldTotal / 20000;
    }
  }
}

// ---------------------------------------------------------------------------
// Drops and the scalper population
// ---------------------------------------------------------------------------

/**
 * One drop, resolved in a single tick. A queue forms, it is served in one pass,
 * and whatever is left goes back in the warehouse until the next drop.
 *
 * The queue holds two populations with opposite effects on the publisher.
 * Collectors are who the drop is for: reaching them builds goodwill. Scalpers
 * camp it, buy at MSRP, and resell above it — they clear stock at full margin
 * and cost goodwill for the collectors they shut out. That trade is the whole
 * system (CONCEPT.md §6.5, §6.8).
 */
function resolveDrop(s: SimState, drop: Drop): void {
  const cfg = s.config.drops;
  drop.status = 'complete';

  const p = s.products[drop.productId];
  const ch = s.channels[drop.channelId];
  if (!p || !ch || !ch.unlocked) return;
  const a = p.allocations[ch.id];
  const set = s.sets[p.setId];
  if (!a || !set || set.status !== 'released') return;
  const pub = s.publishers[set.publisherId];
  if (!pub) return;

  // The store can only put up what it holds, and only as much as it can push
  // through in one drop. `queueCapacity` is what makes a drop a drop.
  const capacity = ch.queueCapacity ?? a.unitsRemaining;
  const offered = Math.min(drop.offered, a.unitsRemaining, capacity);
  if (offered <= 0) return;

  const { attention, fatigue, goodwill } = audienceAverages(s);
  const share = s.audience.shareByPublisher[pub.id] ?? 0;
  const shareFactor = share / s.config.attention.referenceShare;
  const weeksOut = (s.tick - set.regionSchedule[0]!.releaseTick) / 52;
  const decay = Math.exp(-weeksOut * 1.4);
  const traits = traitsFor(ch);

  // Same forces as a shelf sale, concentrated into one moment.
  const collectorDemand = s.audience.actors.collectors * cfg.collectorReach
    * attention * shareFactor * fatigueResponse(s, fatigue)
    * (0.2 + 0.8 * goodwill) * (0.3 + pub.brandStanding) * (0.5 + setChase(s, set))
    * decay * traits.reach * (1 + (set.hype?.level ?? 0));

  // Scalpers price off the sealed market, which is the only public number they
  // have. No premium, no queue: the population regulates itself on this line.
  const premium = p.market.price / Math.max(1, p.msrp) - 1;
  const appetite = Math.max(0, Math.min(1,
    (premium - cfg.breakEvenPremium) / Math.max(0.05, cfg.breakEvenPremium)));
  const scalperDemand = s.audience.actors.scalpers * cfg.scalperReach * p.scalperAppeal * appetite;

  const demand = collectorDemand + scalperDemand;
  const sold = Math.min(offered, Math.floor(demand));
  const oversubscription = demand / offered;

  // Camping is a speed advantage, not a bigger wallet. Scalpers take a larger
  // share of the queue than their numbers alone would win, and no more than
  // they actually wanted.
  const scalperWeight = scalperDemand * cfg.scalperSpeed;
  const totalWeight = scalperWeight + collectorDemand;
  const scalperCut = totalWeight > 0 ? scalperWeight / totalWeight : 0;
  const toScalpers = Math.min(Math.round(sold * scalperCut), Math.floor(scalperDemand), sold);
  const toCollectors = sold - toScalpers;

  drop.result = {
    offered, demand: Math.round(demand), soldToCollectors: toCollectors,
    soldToScalpers: toScalpers, soldOut: sold >= offered, expectedPremium: premium,
  };

  if (sold > 0) {
    a.unitsRemaining -= sold;
    p.unitsRemaining = Math.max(0, p.unitsRemaining - sold);

    // Full margin. The direct store is the point of owning one.
    const revenue = sold * p.msrp * ch.marginShare;
    pub.cash = C(pub.cash + revenue);
    pub.ledger.push({ t: s.tick, amount: C(revenue), category: 'sales', note: `drop ${p.kind}`, refId: p.id });
    if (set.performance) set.performance.revenue = C(set.performance.revenue + revenue);

    for (const cid of set.cardIds) {
      const ip = s.ips[s.cards[cid]!.subjectIp];
      if (ip) ip.exposure += sold / 20000;
    }

    if (toScalpers > 0) {
      // Basis and age are weighted averages, so topping up an open position
      // neither hides what the earlier units cost nor resets their clock.
      const inv = s.audience.hidden.scalperInventory;
      const pos = inv[p.id];
      if (pos) {
        const units = pos.units + toScalpers;
        pos.basis = C((pos.basis * pos.units + p.msrp * toScalpers) / units);
        pos.openedTick = T(Math.round(((pos.openedTick as number) * pos.units + s.tick * toScalpers) / units));
        pos.units = units;
      } else {
        inv[p.id] = { units: toScalpers, basis: p.msrp, openedTick: s.tick };
      }
    }

    if (a.unitsRemaining === 0 && a.soldOutTick === null) {
      a.soldOutTick = s.tick;
      emit(s, 'setSoldOut', true, { setId: set.id, channelId: ch.id }, { productId: p.id, kind: ch.kind });
    }
  }

  // Goodwill is the price of the margin. A drop that reaches collectors pays;
  // one the scalpers take costs; and a queue that dwarfs the stock costs too,
  // because a shortage is its own kind of broken promise.
  const scalperShare = sold > 0 ? toScalpers / sold : 0;
  const shortage = Math.min(2, Math.max(0, oversubscription - 1));
  const goodwillDelta = cfg.goodwillPerCollectorDrop * (1 - scalperShare) * (sold / offered)
    - cfg.goodwillPerScalperDrop * scalperShare
    - cfg.goodwillPerShortage * shortage;
  for (const g of SEGMENTS) {
    const st = s.audience.segments[g];
    st.goodwill = U(st.goodwill + goodwillDelta);
  }
  if (set.performance) set.performance.goodwillDelta += goodwillDelta;

  // A queue nobody could clear is the most visible price signal in the game.
  p.market.heat = Math.min(s.config.sealed.heatCeiling,
    p.market.heat + cfg.heatPerOversubscription * shortage);

  emit(s, drop.result.soldOut ? 'dropSoldOut' : 'dropUndersold', true,
    { setId: set.id, channelId: ch.id, publisherId: pub.id },
    {
      productId: p.id, offered, sold, demand: drop.result.demand,
      scalperShare, oversubscription, premium,
    });
}

/**
 * Keeps one pending drop per direct allocation that still holds stock. A player
 * who schedules their own drops always has one pending and never sees this run;
 * a player who schedules none gets the store's own cadence, so the channel is
 * never silently dead.
 */
function scheduleAutomaticDrops(s: SimState, products: Product[]): void {
  const cfg = s.config.drops;
  const pending = new Set<string>();
  for (const d of Object.values(s.drops)) {
    if (d.status === 'scheduled') pending.add(`${d.productId}|${d.channelId}`);
  }

  for (const p of products) {
    const set = s.sets[p.setId];
    if (!set || set.status !== 'released') continue;
    for (const [cid, a] of Object.entries(p.allocations) as Array<[ChannelId, ChannelAllocation]>) {
      const ch = s.channels[cid];
      if (!ch || ch.kind !== 'direct' || !ch.unlocked) continue;
      if (a.unitsRemaining <= 0) continue;
      const key = `${p.id}|${cid}`;
      if (pending.has(key)) continue;

      const id = nextId(s, 'drop') as DropId;
      s.drops[id] = {
        id, productId: p.id, channelId: cid,
        scheduledTick: T(s.tick + cfg.cadenceWeeks),
        offered: ch.queueCapacity ?? a.unitsRemaining,
        automatic: true, status: 'scheduled', result: null,
      };
      pending.add(key);
    }
  }
}

/** Scalper stock trades on the sealed market, so it moves on the sealed cadence. */
const SCALPER_STRIDE = 4;

/**
 * The other half of the loop. Scalpers resell what they bought, and what they
 * earn doing it decides how many of them show up to the next drop. Dumping
 * stock closes the premium that drew them, so the population is self-limiting
 * rather than a one-way ratchet.
 */
function tickScalpers(s: SimState, products: Product[]): void {
  if (s.tick % SCALPER_STRIDE !== 0) return;
  const cfg = s.config.drops;
  const hidden = s.audience.hidden;

  let realized = 0;
  let realizedUnits = 0;

  for (const p of products) {
    const pos = hidden.scalperInventory[p.id];
    if (!pos || pos.units <= 0) continue;

    // Measured against what they paid, never against MSRP. A position bought at
    // a drop years ago has ridden the same vintage curve every collector has,
    // and that appreciation is not what scalping earns.
    const premium = p.market.price / Math.max(1, pos.basis) - 1;
    // They sell hardest into a wide premium, but the base rate clears stock
    // even at a loss, and the hold limit clears it whatever happens. A flip has
    // a clock; without one a scalper is just a collector with worse manners.
    const expired = s.tick - (pos.openedTick as number) >= cfg.holdLimitWeeks;
    const rate = expired
      ? 1
      : Math.min(1, cfg.baseResaleRate * (1 + Math.max(0, premium) * cfg.resaleUrgency));
    const moved = Math.min(pos.units, Math.max(1, Math.ceil(pos.units * rate)));

    pos.units -= moved;
    if (pos.units <= 0) delete hidden.scalperInventory[p.id];

    realized += premium * moved;
    realizedUnits += moved;

    // Their stock hitting the market is visible supply. It presses the frenzy
    // back out of the sealed price, which is what closes the premium.
    const drag = Math.min(0.5, cfg.dumpHeatDrag * (moved / Math.max(1, p.unitsPrinted)));
    p.market.heat = Math.max(1, p.market.heat * (1 - drag));
  }

  if (realizedUnits > 0) {
    // Per-capita, not per-unit. A drop is a fixed number of units however many
    // scalpers turn up for it, so twice the population is half the flip each.
    // Reading the per-unit premium instead makes the population a one-way
    // ratchet that pins at its cap and never leaves.
    const perCapita = realizedUnits / Math.max(1, s.audience.actors.scalpers);
    const crowding = Math.min(1, perCapita / cfg.unitsPerScalperReference);
    const avg = (realized / realizedUnits) * crowding;
    hidden.scalperProfitability += (avg - hidden.scalperProfitability) * cfg.profitabilitySmoothing;
  } else {
    // Holding no stock is not a profit. With nothing to flip the trade decays
    // back toward break-even and the population drifts off.
    hidden.scalperProfitability *= (1 - cfg.profitabilitySmoothing);
  }

  const edge = hidden.scalperProfitability - cfg.breakEvenPremium;
  s.audience.actors.scalpers = Math.max(cfg.minScalpers, Math.min(cfg.maxScalpers,
    s.audience.actors.scalpers * (1 + cfg.populationGrowth * edge)));

  // Latched, so the crash fires on the crossing and not every tick after it.
  const boom = hidden.scalperProfitability > cfg.breakEvenPremium;
  if (hidden.scalperBoom && !boom) {
    emit(s, 'scalperCrash', true, { publisherId: s.playerId },
      { scalpers: Math.round(s.audience.actors.scalpers), profitability: hidden.scalperProfitability });
  }
  hidden.scalperBoom = boom;
}

function tickDrops(s: SimState, products: Product[]): void {
  for (const d of Object.values(s.drops)) {
    if (d.status === 'scheduled' && s.tick >= d.scheduledTick) resolveDrop(s, d);
  }
  scheduleAutomaticDrops(s, products);
  tickScalpers(s, products);
}

const CHANNEL_STRIDE = 4;

/**
 * Street price, relationship drift, and souring. Runs on the same stride as the
 * sealed market — relationships move over months, not weeks.
 *
 * Street price is what a consumer pays and it floats freely around MSRP
 * (CONCEPT.md §4). An LGS marks up product that is moving; a big box holds the
 * line whatever happens; stale stock gets discounted everywhere that is allowed
 * to discount it.
 */
function tickChannels(s: SimState, products: Product[]): void {
  if (s.tick % CHANNEL_STRIDE !== 0) return;
  const cfg = s.config.channels;

  // Per-channel accumulators for this evaluation.
  const sellThrough = new Map<ChannelId, { moved: number; held: number; stale: number }>();
  const setTotals = new Map<SetId, { sold: number; unsold: number }>();

  for (const p of products) {
    const set = s.sets[p.setId];
    if (!set || set.status !== 'released') continue;
    const weeksOut = s.tick - set.regionSchedule[0]!.releaseTick;
    const staleness = Math.min(1, Math.max(0, weeksOut) * cfg.stalenessPerWeek);
    // Past the window the set is settled history. Its leftovers still sit in the
    // warehouse and still price the sealed market, but they stop souring the
    // relationship — otherwise every old flop compounds forever and the channel
    // is guaranteed to be lost eventually, whatever the player does now.
    const counts = weeksOut <= cfg.evaluationWindowWeeks;

    for (const [cid, a] of Object.entries(p.allocations) as Array<[ChannelId, ChannelAllocation]>) {
      const ch = s.channels[cid];
      if (!ch) continue;
      const traits = traitsFor(ch);

      const moved = a.units - a.unitsRemaining;
      const pressure = a.units > 0 ? moved / a.units : 0;

      if (a.unitsRemaining > 0) {
        const target = p.msrp
          * (1 + traits.markupSensitivity * pressure - traits.discountFloor * (1 - pressure) * staleness);
        a.streetPrice = C(Math.max(p.msrp * 0.25,
          a.streetPrice + (target - a.streetPrice) * cfg.streetPriceLerp));
      }

      if (counts) {
        const acc = sellThrough.get(cid) ?? { moved: 0, held: 0, stale: 0 };
        acc.moved += moved;
        acc.held += a.units;
        if (weeksOut > cfg.unsoldGraceWeeks) acc.stale += a.unitsRemaining * traits.strainSensitivity;
        sellThrough.set(cid, acc);
      }

      if (set.performance) set.performance.sellThroughByChannel[cid] = U(pressure);
    }

    // Read the totals off the product, not off the allocations: losing a
    // channel deletes its allocation, and `unitsSold` must not fall when that
    // happens. The units were still sold.
    const prior = setTotals.get(set.id);
    setTotals.set(set.id, {
      sold: (prior?.sold ?? 0) + (p.unitsPrinted - p.unitsRemaining),
      unsold: (prior?.unsold ?? 0) + p.unitsRemaining,
    });
  }

  for (const [setId, totals] of setTotals) {
    const perf = s.sets[setId]?.performance;
    if (!perf) continue;
    perf.unitsSold = totals.sold;
    perf.unitsUnsold = totals.unsold;
  }

  // Relationship drift. Selling through builds it; leaving stock on the shelf
  // past the grace period burns it; getting nothing to sell burns it slowly.
  for (const ch of Object.values(s.channels)) {
    if (!ch.unlocked) continue;
    const before = ch.relationship;
    const acc = sellThrough.get(ch.id);
    const traits = traitsFor(ch);

    if (acc && acc.held > 0) {
      const rate = acc.moved / acc.held;
      if (rate >= cfg.sellThroughTarget) {
        ch.relationship = U(ch.relationship + cfg.relationshipGainPerSellThrough * (rate - cfg.sellThroughTarget + 0.2));
        // Selling through your channels is what pays the goodwill back.
        const gain = traits.goodwillPerSellThrough * rate;
        for (const g of SEGMENTS) {
          const st = s.audience.segments[g];
          st.goodwill = U(st.goodwill + gain);
        }
      }
      if (acc.stale > 0) {
        const strain = Math.min(1, acc.stale / Math.max(1, acc.held));
        ch.relationship = U(ch.relationship - cfg.relationshipLossPerUnsold * strain);
      }
    } else if (ch.lastAllocatedTick !== null && s.tick - ch.lastAllocatedTick > cfg.idleGraceWeeks) {
      ch.relationship = U(ch.relationship - cfg.idleDriftPerTick);
    }

    if (before > cfg.strainThreshold && ch.relationship <= cfg.strainThreshold) {
      emit(s, 'channelStrained', true, { channelId: ch.id }, { relationship: ch.relationship, kind: ch.kind });
    }
    // Your LGS network and your own store never drop you. CONCEPT.md §7 makes
    // LGS-only the floor that relationship death collapses you *to*, so losing
    // it would leave a publisher with no way to sell anything at all. Their
    // relationship still sinks, and a sunk relationship still costs capacity.
    const canBeLost = ch.kind !== 'lgs' && ch.kind !== 'direct';
    if (canBeLost && ch.relationship < cfg.lossThreshold) loseChannel(s, ch);
  }
}

/**
 * A soured channel drops you. This is the "relationship death" path in
 * CONCEPT.md §7 — lose enough of them and you collapse back to LGS volume.
 * Stock already allocated to the channel is stranded there.
 */
function loseChannel(s: SimState, ch: Channel): void {
  ch.unlocked = false;
  for (const pub of Object.values(s.publishers)) {
    const i = pub.unlocks.channels.indexOf(ch.id);
    if (i >= 0) pub.unlocks.channels.splice(i, 1);
    if (ch.kind === 'direct') pub.unlocks.directStore = false;
  }
  for (const p of Object.values(s.products)) delete p.allocations[ch.id];
  emit(s, 'channelLost', true, { channelId: ch.id }, { relationship: ch.relationship, kind: ch.kind });
}

function tickAudience(s: SimState): void {
  const cfg = s.config.attention;
  for (const g of SEGMENTS) {
    const st = s.audience.segments[g];
    st.attention = Math.min(1, st.attention + cfg.regenPerTick);
    // Proportional, not a flat subtraction. A constant decay makes fatigue
    // bimodal: below the break-even cadence it saturates, above it sits at
    // zero, and nothing lands in between. Decaying a share of what is there
    // gives every cadence its own equilibrium, which is what lets the response
    // curve discriminate at all.
    st.fatigue = Math.max(0, st.fatigue * (1 - cfg.fatigueDecay));
    // Long-memory trust. Deliberately much slower than fatigue recovery —
    // flood damage should stay felt long after attention has refilled.
    st.goodwill = Math.min(1, st.goodwill + cfg.goodwillRegenPerTick * (1 - st.goodwill));
  }
  // Fatigue is now the sharpest penalty in the model, so the player has to be
  // able to see it coming. `fatigueWarning` was declared and never emitted.
  const fatigueAvg = SEGMENTS.reduce((n, g) => n + s.audience.segments[g].fatigue, 0) / SEGMENTS.length;
  const warn = fatigueAvg >= cfg.fatigueWarnThreshold;
  if (warn !== s.audience.fatigueWarned) {
    s.audience.fatigueWarned = warn;
    if (warn) {
      emit(s, 'fatigueWarning', true, { publisherId: s.playerId }, { fatigue: fatigueAvg });
    }
  }

  s.market.climate = Math.max(0.5, Math.min(1.8,
    s.market.climate + gauss(s.rng, 0, 0.012) + (1 - s.market.climate) * 0.008));
  writePoint(s.market.climateHistory, s.tick, s.market.climate, 0.02);
}

function tickFinance(s: SimState): void {
  const cfg = s.config.finance;
  const pub = s.publishers[s.playerId]!;
  if (pub.deadTick !== null) return;

  if (s.tick % 4 === 0) {
    const rate = (cfg.interestBase - pub.credit * cfg.creditToRate) / 13;
    const interest = pub.debt * rate;
    pub.cash = C(pub.cash - interest);
    if (interest > 0) pub.ledger.push({ t: s.tick, amount: C(-interest), category: 'interest', note: 'debt service' });
  }

  const ceiling = 500_000_00 * cfg.borrowCeilingMultiple * (0.3 + pub.credit);
  if (pub.cash < 0) {
    const need = -pub.cash;
    if (pub.debt + need <= ceiling) {
      pub.cash = C(0); pub.debt = C(pub.debt + need);
      emit(s, 'debtWarning', true, { publisherId: pub.id }, { debt: pub.debt });
    } else {
      pub.deadTick = s.tick;
      const unsold = Object.values(s.products).reduce((n, p) => n + p.unitsRemaining, 0);
      // Dying on unsold stock is overprint death by default. It is only
      // `channel_collapse` if the channels actually went away — a publisher that
      // never had the reach in the first place simply printed too much.
      const lostAChannel = s.events.some(
        e => e.kind === 'channelLost' && (e.refs.publisherId ?? pub.id) === pub.id,
      );
      pub.deathCause = unsold > 20000
        ? (lostAChannel ? 'channel_collapse' : 'overprint')
        : 'debt_spiral';
      emit(s, 'studioDead', true, { publisherId: pub.id }, { cause: pub.deathCause, tick: s.tick });
    }
  }
  pub.credit = U(pub.credit + (pub.cash > 0 ? 0.0006 : -0.002));

  // brandStanding mean-reverts toward a target driven by average affection and
  // goodwill, rather than accumulating without limit — that's what was pinning
  // it at 1.0 for any publisher that survived long enough to build affection.
  const ipsArr = Object.values(s.ips);
  const affectionAvg = ipsArr.length ? ipsArr.reduce((n, ip) => n + ip.affection, 0) / ipsArr.length : 0;
  const goodwillAvg = SEGMENTS.reduce((n, g) => n + s.audience.segments[g].goodwill, 0) / SEGMENTS.length;
  const brandTarget = U(0.15 + 0.55 * (affectionAvg / 100) + 0.30 * goodwillAvg);
  pub.brandStanding = U(pub.brandStanding + (brandTarget - pub.brandStanding) * cfg.brandConvergenceRate);
}

function tickArtists(s: SimState): void {
  for (const a of Object.values(s.artists)) {
    a.reputation = U(a.reputation + a.growth * (0.6 + rand(s.rng) * 0.8));
    if (a.reputation > 0.85 && chance(s.rng, 0.002)) {
      emit(s, 'artistBreakout', true, { artistId: a.id }, { reputation: a.reputation });
    }
  }
}

function tickCompaction(s: SimState): void {
  if (s.tick % 52 !== 0) return;
  // Completed drops are feed history, and the feed does not reach back decades.
  // Without this a long run keeps every queue it ever ran.
  const dropCutoff = s.tick - s.config.history.weeklyRetentionTicks;
  for (const d of Object.values(s.drops)) {
    if (d.status === 'complete' && (d.scheduledTick as number) < dropCutoff) delete s.drops[d.id];
  }
  const { printings, products, ips } = lists(s);
  for (const pr of printings) compact(pr.market.rawHistory, s.tick, s.config.history);
  for (const p of products) compact(p.market.history, s.tick, s.config.history);
  for (const ip of ips) compact(ip.affectionHistory, s.tick, s.config.history);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

interface TickCache { version: number; printings: Printing[]; products: Product[]; ips: IpEntity[]; sets: CardSet[] }
const tickCache = new WeakMap<object, TickCache>();

/**
 * Validating the cache by counting keys costs an O(n) key array per map per
 * tick, which on a long run is the second-largest cost in the whole engine.
 * Every site that mints a printing, product or IP bumps this instead, so the
 * check is a single integer compare. `checkRosterCache` is the safety net:
 * a mint that forgets to bump would silently leave the new entity untickable,
 * so the invariant pass catches it rather than a balance table three sessions
 * later.
 */
const rosterVersion = new WeakMap<object, number>();

function bumpRoster(s: SimState): void {
  rosterVersion.set(s, (rosterVersion.get(s) ?? 0) + 1);
}

function lists(s: SimState): TickCache {
  const version = rosterVersion.get(s) ?? 0;
  const c = tickCache.get(s);
  if (c && c.version === version) return c;
  const fresh: TickCache = {
    version,
    printings: Object.values(s.printings),
    products: Object.values(s.products),
    ips: Object.values(s.ips),
    sets: Object.values(s.sets),
  };
  tickCache.set(s, fresh);
  return fresh;
}

/** Dev check: the cached rosters must still match the state they came from. */
export function checkRosterCache(s: SimState): string[] {
  const c = tickCache.get(s);
  if (!c) return [];
  const bad: string[] = [];
  const nP = Object.keys(s.printings).length;
  const nProd = Object.keys(s.products).length;
  const nIp = Object.keys(s.ips).length;
  if (c.printings.length !== nP) bad.push(`printing roster stale: ${c.printings.length} cached, ${nP} live`);
  if (c.products.length !== nProd) bad.push(`product roster stale: ${c.products.length} cached, ${nProd} live`);
  if (c.ips.length !== nIp) bad.push(`ip roster stale: ${c.ips.length} cached, ${nIp} live`);
  const nSet = Object.keys(s.sets).length;
  if (c.sets.length !== nSet) bad.push(`set roster stale: ${c.sets.length} cached, ${nSet} live`);
  return bad;
}

export function tick(s: SimState): void {
  s.tick = T(s.tick + 1);

  for (const d of s.inbox) applyDecision(s, d);
  s.inbox = [];

  for (const set of lists(s).sets) {
    if (set.status === 'committed' && set.revealStartTick !== null && s.tick >= set.revealStartTick) {
      set.status = 'revealing';
    }
    if (set.status === 'revealing') {
      const sched = set.regionSchedule[0];
      if (sched && s.tick >= sched.releaseTick) releaseSet(s, set.id, sched.regionId);
      else tickReveal(s, set);
    }
    // Hype burns off after launch. What is left of it is what still lifts demand.
    if (set.status === 'released' && set.hype && set.hype.level > 0) {
      set.hype.level = Math.max(0, set.hype.level * (1 - s.config.hype.decayPerTickAfterRelease));
    }
  }

  // Re-read after the set loop: `releaseSet` mints printings mid-loop, and the
  // rest of the tick has to see them on the tick they appear.
  const { printings, products, ips } = lists(s);
  tickAffection(s, ips);
  tickSales(s, products);
  tickDrops(s, products);
  tickChannels(s, products);
  tickSealed(s, products);
  tickPrices(s, printings);
  tickAudience(s);
  tickArtists(s);
  tickFinance(s);
  tickCompaction(s);
}

/** Runs `weeks` ticks, stopping early on an interrupting event. */
export function advance(s: SimState, weeks: number, stopOnInterrupt = false): SimEvent[] {
  const before = s.events.length;
  for (let i = 0; i < weeks; i++) {
    tick(s);
    if (s.publishers[s.playerId]!.deadTick !== null) break;
    if (stopOnInterrupt && s.events.slice(before).some(e => e.interrupts)) break;
  }
  return s.events.slice(before);
}
