import type {
  SimState, Decision, Tick, Cents, Unit, IpId, CardId, SetId, ProductId, PrintingId,
  ProductLineId, RegionId, ChannelId, ArtistId, IpEntity, Card, CardSet, Product,
  Printing, SimEvent, EventId, SetType, Rarity, ProductKind, PrintQualityTier,
} from './types.ts';
import { rand, randRange, randInt, pick, chance, gauss } from './rng.ts';
import { emptySeries, writePoint, compact } from './series.ts';
import { nextId, SEGMENTS, RARITIES } from './world.ts';

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

function createIp(s: SimState, name: string, kind: IpEntity['kind']): IpId {
  const id = nextId(s, 'ip') as IpId;
  const r = s.rng;
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
  return id;
}

function createSet(s: SimState, name: string, type: SetType, size: number): SetId {
  const id = nextId(s, 'set') as SetId;
  s.sets[id] = {
    id, publisherId: s.playerId, name, type, status: 'design',
    cardIds: [], productIds: [], collabId: null,
    regionSchedule: [], designStartTick: s.tick, commitTick: null, revealStartTick: null,
    budget: C(0), actualCost: C(0), printQuality: 'standard', attentionCost: 0,
    performance: null,
  };
  return id;
}

function designCard(s: SimState, setId: SetId, subjectIp: IpId, cameos: IpId[], rarity: Rarity, artistId: ArtistId): CardId {
  const id = nextId(s, 'card') as CardId;
  const artist = s.artists[artistId]!;
  const fit = (artist.stats.composition + artist.stats.linework + artist.stats.color) / 3;
  s.cards[id] = {
    id, publisherId: s.playerId, name: `${s.ips[subjectIp]!.name} ${rarity}`, createdTick: s.tick,
    subjectIp, cameos, rarity, treatment: rarity === 'common' ? 'none' : 'holo',
    serialized: null, artistId,
    artBrief: { mood: 'neutral', composition: 'portrait', budget: artist.rate, notes: '' },
    artQuality: U(fit * 0.75 + randRange(s.rng, 0, 0.35)),
    progressionLink: null, illustrationLink: null, flavorText: '',
  };
  s.sets[setId]!.cardIds.push(id);
  return id;
}

function defineProduct(s: SimState, setId: SetId, kind: ProductKind, regionId: RegionId, packs: number, msrp: number): ProductId {
  const id = nextId(s, 'prod') as ProductId;
  s.products[id] = {
    id, lineId: `line_${kind}` as ProductLineId, setId, regionId, kind,
    packsPerUnit: packs, cardsPerPack: 10,
    msrp: C(msrp), unitCogs: C(0),
    unitsPrinted: 0, unitsRemaining: 0, allocations: {},
    scalperAppeal: U(kind === 'etb' || kind === 'premiumCollection' ? 0.8 : 0.4),
    market: {
      price: C(msrp), heat: 1, nostalgia: 1, history: emptySeries(s.tick),
      hidden: { sealedRemaining: 0, ripRate: s.config.sealed.baseRipRatePerTick, heldByCollectors: U(0.35) },
    },
  };
  s.sets[setId]!.productIds.push(id);
  return id;
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
  set.revealStartTick = T(s.tick + 12);
  set.regionSchedule = [{ regionId: 'reg_us' as RegionId, releaseTick: T(s.tick + 18) }];
}

function applyDecision(s: SimState, d: Decision): void {
  switch (d.type) {
    case 'createIp': createIp(s, d.payload.name, d.payload.kind); break;
    case 'createSet': createSet(s, d.payload.name, d.payload.setType, d.payload.targetSize); break;
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
    default: break; // bots use the helpers directly; UI decisions land here
  }
}

// Exposed so bots can act without hand-building every payload.
export const api = { createIp, createSet, designCard, defineProduct, commitPrintRun };

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

function releaseSet(s: SimState, setId: SetId, regionId: RegionId): void {
  const set = s.sets[setId]!;
  const cfg = s.config;
  set.status = 'released';

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
      population: { sealed: Math.round(totalPacks * pullRate), opened: 0, destroyed: 0, graded: {} as any },
      market: {
        rawPrice: C(cfg.value.baseCardPrice), gradedPrices: {} as any,
        heat: 1.6, nostalgia: 1, liquidity: U(0.5), lastTradeTick: s.tick,
        rawHistory: emptySeries(s.tick), gradedHistory: {} as any,
      },
    };
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
  for (const seg of SEGMENTS) {
    const st = s.audience.segments[seg];
    const floodPenalty = Math.max(0, 1 - st.attention / cfg.attention.perReleaseCost);
    st.goodwill = Math.max(0, st.goodwill - cfg.attention.goodwillSensitivity * 0.06 * (0.3 + floodPenalty));
    st.attention = Math.max(0, st.attention - cfg.attention.perReleaseCost);
    st.fatigue = Math.min(1, st.fatigue + cfg.attention.fatigueGain);
  }
  set.attentionCost = cfg.attention.perReleaseCost;
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
  const yearFrac = PRICE_STRIDE / 52;
  const phase = s.tick % PRICE_STRIDE;
  for (let i = phase; i < printings.length; i += PRICE_STRIDE) {
    const pr = printings[i]!;
    const card = s.cards[pr.cardId]!;
    const artist = s.artists[card.artistId]!;

    const desire = castDesire(s, card);
    const surviving = Math.max(1, pr.population.sealed + pr.population.opened - pr.population.destroyed);
    // Rarity's price effect flows only through scarcity (print quantity is
    // already rarity-scaled via RARITY_PULL at release) — see CONCEPT.md §5.
    // RARITY_WEIGHT stays out of price; it's a demand-side signal in tickSales.
    const scarcity = Math.pow(100000 / surviving, cfg.value.scarcityExponent);
    const art = 1 + card.artQuality * artist.reputation * cfg.value.artMultiplierWeight;

    pr.market.heat = Math.min(cfg.value.heatCeiling,
      1 + (pr.market.heat - 1) * Math.pow(1 - cfg.value.heatDecayPerTick, PRICE_STRIDE));
    pr.market.nostalgia = Math.min(cfg.value.nostalgiaCeiling, pr.market.nostalgia * (1 + cfg.value.nostalgiaRatePerYear * yearFrac
      * (0.4 + s.publishers[card.publisherId]!.brandStanding)));
    if (pr.error && pr.error.discoveredTick !== null) {
      pr.market.heat = Math.min(cfg.value.heatCeiling, pr.market.heat + 0.002 / Math.max(0.0002, pr.error.incidence) * 0.00002);
    }

    const noise = 1 + gauss(s.rng, 0, cfg.value.noiseSigma);
    const rawMultiplier = scarcity * (desire / 40) * art * pr.market.heat * pr.market.nostalgia * s.market.climate * noise;
    const cappedMultiplier = softCap(rawMultiplier, cfg.value.priceCeilingMultiple);
    const target = cfg.value.baseCardPrice * cappedMultiplier;

    // Prices are sticky; they drift toward target rather than snapping.
    pr.market.rawPrice = C(pr.market.rawPrice * 0.62 + Math.max(cfg.value.priceFloorCents, target) * 0.38);
    writePoint(pr.market.rawHistory, s.tick, pr.market.rawPrice, cfg.history.writeThreshold);

    // Vintage price growth feeds character resurgence. Every printing seeds
    // at a flat baseCardPrice regardless of rarity (see releaseSet), so the
    // baseline here matches that seed, not a rarity-scaled one.
    const ageYears = (s.tick - pr.releaseTick) / 52;
    if (ageYears > 5 && chance(s.rng, 0.02 * PRICE_STRIDE)) {
      const ip = s.ips[card.subjectIp]!;
      const growth = pr.market.rawPrice / Math.max(1, cfg.value.baseCardPrice);
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
    const scarcity = Math.pow(Math.max(1, p.unitsPrinted) / Math.max(1, h.sealedRemaining), 0.5);
    const target = (contents * cfg.contentsWeight + p.msrp * 0.6) * scarcity * p.market.nostalgia;
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

function tickSales(s: SimState, products: Product[]): void {
  const cfg = s.config;
  for (const p of products) {
    if (p.unitsRemaining <= 0) continue;
    const set = s.sets[p.setId]!;
    if (set.status !== 'released') continue;
    const pub = s.publishers[set.publisherId]!;

    const attention = SEGMENTS.reduce((n, g) => n + s.audience.segments[g].attention, 0) / SEGMENTS.length;
    const fatigue = SEGMENTS.reduce((n, g) => n + s.audience.segments[g].fatigue, 0) / SEGMENTS.length;
    const goodwill = SEGMENTS.reduce((n, g) => n + s.audience.segments[g].goodwill, 0) / SEGMENTS.length;
    const chase = set.cardIds.reduce((n, cid) => {
      const card = s.cards[cid]!;
      return n + castDesire(s, card) * RARITY_WEIGHT[card.rarity] / 100;
    }, 0) / Math.max(1, set.cardIds.length);

    const weeksOut = (s.tick - set.regionSchedule[0]!.releaseTick) / 52;
    const decay = Math.exp(-weeksOut * 1.4);
    const demand = p.unitsPrinted * 0.06 * attention * (1 - fatigue * 0.6)
      * (0.2 + 0.8 * goodwill) * (0.3 + pub.brandStanding) * (0.5 + chase) * decay;

    const sold = Math.max(0, Math.min(p.unitsRemaining, Math.round(demand)));
    if (sold <= 0) continue;
    p.unitsRemaining -= sold;

    const revenue = sold * p.msrp * 0.62;
    pub.cash = C(pub.cash + revenue);
    pub.ledger.push({ t: s.tick, amount: C(revenue), category: 'sales', note: p.kind, refId: p.id });

    // Selling builds exposure, which is what lets affection converge.
    for (const cid of set.cardIds) {
      const ip = s.ips[s.cards[cid]!.subjectIp];
      if (ip) ip.exposure += sold / 20000;
    }
    if (p.unitsRemaining === 0) emit(s, 'setSoldOut', true, { setId: set.id }, { productId: p.id });
  }
}

function tickAudience(s: SimState): void {
  const cfg = s.config.attention;
  for (const g of SEGMENTS) {
    const st = s.audience.segments[g];
    st.attention = Math.min(1, st.attention + cfg.regenPerTick);
    st.fatigue = Math.max(0, st.fatigue - cfg.fatigueDecay);
    // Long-memory trust. Deliberately much slower than fatigue recovery —
    // flood damage should stay felt long after attention has refilled.
    st.goodwill = Math.min(1, st.goodwill + cfg.goodwillRegenPerTick * (1 - st.goodwill));
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
      pub.deathCause = unsold > 20000 ? 'overprint' : 'debt_spiral';
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
  for (const pr of Object.values(s.printings)) compact(pr.market.rawHistory, s.tick, s.config.history);
  for (const p of Object.values(s.products)) compact(p.market.history, s.tick, s.config.history);
  for (const ip of Object.values(s.ips)) compact(ip.affectionHistory, s.tick, s.config.history);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

interface TickCache { nP: number; nProd: number; nIp: number; printings: Printing[]; products: Product[]; ips: IpEntity[] }
const tickCache = new WeakMap<object, TickCache>();

function lists(s: SimState): TickCache {
  const nP = Object.keys(s.printings).length;
  const nProd = Object.keys(s.products).length;
  const nIp = Object.keys(s.ips).length;
  const c = tickCache.get(s);
  if (c && c.nP === nP && c.nProd === nProd && c.nIp === nIp) return c;
  const fresh: TickCache = {
    nP, nProd, nIp,
    printings: Object.values(s.printings),
    products: Object.values(s.products),
    ips: Object.values(s.ips),
  };
  tickCache.set(s, fresh);
  return fresh;
}

export function tick(s: SimState): void {
  s.tick = T(s.tick + 1);

  for (const d of s.inbox) applyDecision(s, d);
  s.inbox = [];

  for (const set of Object.values(s.sets)) {
    if (set.status === 'committed' && set.revealStartTick !== null && s.tick >= set.revealStartTick) {
      set.status = 'revealing';
    }
    if (set.status === 'revealing') {
      const sched = set.regionSchedule[0];
      if (sched && s.tick >= sched.releaseTick) releaseSet(s, set.id, sched.regionId);
    }
  }

  const { printings, products, ips } = lists(s);
  tickAffection(s, ips);
  tickSales(s, products);
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
