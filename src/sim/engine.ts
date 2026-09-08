import type {
  SimState, Decision, Tick, Cents, Unit, IpId, CardId, SetId, ProductId, PrintingId, RngState, ChainKind,
  RegionId, ChannelId, ArtistId, IpEntity, Card, CardSet, Product,
  Printing, SimEvent, EventId, SetType, Rarity, ProductKind, PrintQualityTier,
  Treatment, ArtBrief, UnlockState, ChannelAllocation, Channel, SetPerformance,
  Drop, DropId, Grader, GradeTier, GradingSubmission, Collab, CollabId, AudienceSegment, ChainId,
  Artist, Publisher, PublisherId, Commission, CommissionId, ArtistTerms, Archetype, Chain,
} from './types.ts';
import { rand, randRange, randInt, pick, chance, gauss } from './rng.ts';
import {
  segmentsIn, engagedIn, engagedTotal, audienceScale, segmentAffinity,
  creditUnitsSold, seedRegionEntry, tickAudienceSystem, globalAverages,
} from './audience.ts';
import { emptySeries, writePoint, compact } from './series.ts';
import {
  nextId, SEGMENTS, RARITIES, ARTIST_PERSONALITIES, ARTIST_SPECIALTIES, REGION_US,
} from './world.ts';
import {
  regionDemandFactor, tickRegionKnowledge, creditRelease, readRegion, readingFit,
} from './regions.ts';
import {
  tickActors, tickCreators, tradeablePopulation, speculatorHeatDelta, speculatorCrowd, ripMultiplier,
  realisableCardValue,
  aftermarketIndex,
} from './actors.ts';
import {
  traitsFor, effectiveCapacity, allocatedUnits, autoAllocate, unlockCost, CHANNEL_IDS,
} from './channels.ts';

const T = (n: number) => n as Tick;
const C = (n: number) => Math.round(n) as Cents;
const U = (n: number) => Math.max(0, Math.min(1, n)) as Unit;

/**
 * Copies printed per card of this rarity, per unit of print run.
 *
 * Only use this where the original expression was `pull / divisor` on its own.
 * Where it was `x * pull / divisor`, keep that order: `(x * pull) / d` and
 * `x * (pull / d)` disagree in the last bits about a third of the time, and the
 * price engine amplifies that into a different run.
 */
function rarityPull(s: SimState, r: Rarity, setSize: number): number {
  const cfg = s.config.rarity;
  const size = Math.max(1, setSize);
  return (cfg.pull[r] / cfg.pullDivisor) * (cfg.referenceSetSize / size);
}

/**
 * Latent demand for one printing, rolled once and never shown. Lognormal, so
 * the median printing rolls 1 and a rare few roll many times that — the shape
 * a power law needs (CONCEPT.md §5).
 */
/**
 * A printing's hidden chase multiplier.
 *
 * Takes the stream explicitly rather than reaching for `s.rng`, so a printing
 * minted off the main line — an event promo, say — can roll on its own stream
 * without renumbering every later draw in the run. The two existing callers
 * pass `s.rng` and are unchanged.
 */
function rollChase(s: SimState, r: RngState): number {
  return Math.exp(gauss(r, 0, s.config.value.chaseSigma));
}

/**
 * Everything a new printing needs that the two minting paths disagree about.
 * Anything they agree on is inside `mintPrinting`, which is the point.
 */
interface PrintingSpec {
  cardId: CardId;
  setId: SetId;
  regionId: RegionId;
  printQuantity: number;
  /** Copies in circulation at birth. NOT always `printQuantity` — see the callers. */
  sealed: number;
  /**
   * Copies already out of the wrapper at birth. Zero everywhere except an
   * event promo, which is handed to a player rather than pulled from a pack:
   * a promo that stayed sealed forever could never be graded, because the
   * grading pool is opened copies.
   */
  opened?: number;
  pullRate: number;
  printQuality: PrintQualityTier;
  isReprintOf: PrintingId | null;
  /** Opening market heat. A campaign launches a set hotter than the floor. */
  heat: number;
}

/**
 * Mints one printing and files it. The single place a `Printing` is born.
 *
 * The draws happen in a fixed order — the error roll, then the chase — because
 * that is the order both call sites already used, and changing it would
 * renumber every later draw on whichever stream is passed. `r` is a parameter
 * for the same reason `rollChase` takes one: a printing minted by a system that
 * did not exist when the balance was fitted must be able to roll somewhere
 * other than the main stream.
 */
function mintPrinting(s: SimState, r: RngState, spec: PrintingSpec): PrintingId {
  const cfg = s.config;
  const id = nextId(s, 'pr') as PrintingId;
  const err = chance(r, cfg.printing.errorRate[spec.printQuality])
    ? {
        kind: pick(r, ['miscut', 'inkError', 'missingFoil', 'wrongBack', 'textError', 'crimp'] as const),
        incidence: randRange(r, cfg.printing.errorIncidenceMin, cfg.printing.errorIncidenceMax),
        discoveredTick: null,
      }
    : null;

  bumpRoster(s);
  s.printings[id] = {
    id, cardId: spec.cardId, setId: spec.setId, regionId: spec.regionId, releaseTick: s.tick,
    printQuantity: spec.printQuantity, pullRate: spec.pullRate, printQuality: spec.printQuality,
    isReprintOf: spec.isReprintOf, error: err,
    truth: { chase: rollChase(s, r) },
    population: { sealed: spec.sealed, opened: spec.opened ?? 0, destroyed: 0, graded: {} as never },
    market: {
      rawPrice: C(cfg.value.baseCardPrice), gradedPrices: {} as never,
      heat: spec.heat, speculatorHeat: 0, nostalgia: 1,
      liquidity: U(cfg.value.openingLiquidity), lastTradeTick: s.tick, lastPricedTick: null,
      rawHistory: emptySeries(s.tick), gradedHistory: {} as never,
    },
  };
  return id;
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

function createIp(
  s: SimState, id: IpId, name: string, kind: IpEntity['kind'],
  archetype: Archetype = 'none', baseAge = 0, affiliation: IpId | null = null,
): void {
  const r = s.rng;
  const af = s.config.affection;
  // An archetype only names the prior a CHARACTER is drawn from. Everything
  // else keeps the global range, per `docs/design/characters.md`.
  const arch = kind === 'character' ? archetype : 'none';
  const table = s.config.archetypes[arch] ?? s.config.archetypes.none;
  bumpRoster(s);
  s.ips[id] = {
    id, publisherId: s.playerId, name, kind, createdTick: s.tick,
    archetype: arch, baseAge,
    // Only a faction can be an affiliation, and nothing may affiliate to itself.
    affiliation: affiliation && s.ips[affiliation]?.kind === 'faction' ? affiliation : null,
    truth: {
      // The whole game lives in this roll. High variance is deliberate, and the
      // archetype changes the RANGE, never the number of draws — one extra
      // `rand` here renumbers every later roll in the run.
      relatability: randRange(r, table.relatability[0], table.relatability[1]),
      affinities: Object.fromEntries(
        SEGMENTS.map(g => {
          const band = table.affinity[g];
          return [g, randRange(r, band ? band[0] : af.affinityMin, band ? band[1] : af.affinityMax)];
        })) as any,
      longevity: randRange(r, table.longevity[0], table.longevity[1]),
      readingNoiseSeed: rand(r),
    },
    exposure: 0, affection: 4, affectionHistory: emptySeries(s.tick),
    resurgence: 0, resurgenceHistory: emptySeries(s.tick),
    appearanceCount: 0, cameoCount: 0, firstPrintingId: null,
  };
}

function createSet(s: SimState, id: SetId, name: string, type: SetType, size: number): void {
  // A specialty set needs a slot to put it in. Off by default — see
  // `unlocks.enforceSpecialtySlots`. Counted against sets still in flight as
  // well as released ones, because a slot is a production line, not a receipt.
  if (s.config.unlocks.enforceSpecialtySlots > 0 && type === 'specialty') {
    const inFlight = Object.values(s.sets).filter(
      set => set.type === 'specialty' && set.status !== 'released').length;
    if (inFlight >= s.publishers[s.playerId]!.unlocks.specialtySetSlots) return;
  }
  bumpRoster(s);
  s.sets[id] = {
    id, publisherId: s.playerId, name, type, status: 'design', targetSize: Math.max(1, size),
    cardIds: [], productIds: [], collabId: null,
    regionSchedule: [], regionReadings: null,
    designStartTick: s.tick, commitTick: null, revealStartTick: null,
    budget: C(0), actualCost: C(0), printQuality: 'standard', attentionCost: 0,
    performance: null, hype: null, preorders: null,
  };
}

/** The fields the engine derives when a decision doesn't spell them out. */
interface CardOverrides {
  name?: string;
  treatments?: Treatment[];
  artBrief?: Partial<ArtBrief>;
  flavorText?: string;
  progressionLink?: { chainId: ChainId; position: number; kind?: ChainKind };
  /**
   * The art-subset chain. CONCEPT.md §4 calls it "the hedge against a weak
   * character": a progression chain pays because collectors chase complete
   * lines, an illustration chain pays because the ART is the reason to want the
   * card, which is exactly when the subject is not.
   */
  illustrationLink?: ChainId;
  /** Copies per pack, when the studio authored the pack. See `Card.pullRate`. */
  pullRate?: number | null;
}

function designCard(
  s: SimState, id: CardId, setId: SetId, subjectIp: IpId, cameos: IpId[],
  rarity: Rarity, artistId: ArtistId, overrides: CardOverrides = {},
): void {
  // The set's declared size is a cap. `createSet` has always been handed a
  // `targetSize` and always ignored it, so a set was whatever the caller
  // designed into it; every bot designs exactly the count it asked for, so this
  // refuses nothing today and stops a caller running away with a set tomorrow.
  const target = s.sets[setId];
  if (target && target.cardIds.length >= target.targetSize) return;
  const artist = s.artists[artistId]!;
  s.cards[id] = {
    id, publisherId: s.playerId,
    name: overrides.name ?? `${s.ips[subjectIp]!.name} ${rarity}`,
    createdTick: s.tick,
    subjectIp, cameos, rarity,
    pullRate: overrides.pullRate ?? null,
    treatments: overrides.treatments ?? (rarity === 'common' ? [] : ['holo']),
    artistId,
    artBrief: { mood: 'neutral', composition: 'portrait', budget: artist.rate, notes: '', ...overrides.artBrief },
    // A designed card has no art yet. It carries the house floor until a
    // commission lands, which is what makes `commissionArt` a real decision
    // rather than an upgrade: skipping it ships filler.
    artQuality: U(s.config.art.houseQuality),
    artSource: 'pending',
    progressionLink: overrides.progressionLink ?? null,
    illustrationLink: overrides.illustrationLink ?? null,
    flavorText: overrides.flavorText ?? '',
  };
  s.sets[setId]!.cardIds.push(id);

  // The chain is minted on first reference, so a caller names one rather than
  // creating one first. `spansSets` is recomputed each time a member joins: a
  // chain only becomes the cross-set hedge once it actually crosses.
  //
  // `kind` used to be hardcoded `'progression'`, which is what made
  // `ChainKind`'s other variant unreachable and `Card.illustrationLink` a field
  // that was written `null` and read by nothing.
  // A variant run and an evolution line share the slot and the arithmetic; the
  // caller says which story it is, and the kind is fixed when the chain mints.
  registerChainLink(s, id, setId, overrides.progressionLink?.chainId,
    overrides.progressionLink?.kind ?? 'progression');
  registerChainLink(s, id, setId, overrides.illustrationLink, 'illustration');
}

/** Files a card into a chain, minting the chain the first time it is named. */
function registerChainLink(
  s: SimState, cardId: CardId, setId: SetId, chainId: ChainId | undefined, kind: ChainKind,
): void {
  if (!chainId) return;
  const chain = s.chains[chainId] ?? (s.chains[chainId] = {
    id: chainId, kind,
    name: `Chain ${chainId}`, cardIds: [], setIds: [], spansSets: false,
  });
  if (!chain.cardIds.includes(cardId)) chain.cardIds.push(cardId);
  if (!chain.setIds.includes(setId)) chain.setIds.push(setId);
  chain.spansSets = chain.setIds.length > 1;
}

/**
 * What a card's chain adds to its desire.
 *
 * An incomplete set of anything is worth more than the same cards unrelated,
 * and the pull grows with how much of the chain is already out there. It is
 * capped, because a fiftieth link is not news, and it pays more when the chain
 * spans sets — CONCEPT.md calls a cross-set chain "the hedge that can carry a
 * set with a weak subject", which is only true if it beats a chain that sits
 * inside one set.
 */
function chainDesire(s: SimState, card: Card): number {
  const link = card.progressionLink?.chainId;
  // A variant run and an evolution line are the same shape and different
  // stories, so they share `chainTerm` and differ only in what a link pays.
  const kind = link && s.chains[link]?.kind === 'variant' ? 'variant' : 'progression';
  return chainTerm(s, card, link, kind)
    + chainTerm(s, card, card.illustrationLink ?? undefined, 'illustration');
}

/**
 * One chain's contribution to a card's desire.
 *
 * The two kinds pay for different reasons, and that is the whole point of
 * having two — otherwise it is one system with two names.
 *
 * A PROGRESSION chain pays flat: collectors chase complete lines, and the line
 * is worth completing whoever is on the cards.
 *
 * An ILLUSTRATION chain pays MORE when the subject is weak. CONCEPT.md §4 calls
 * it "the hedge against a weak character", and a hedge that pays best when you
 * least need it is not a hedge. A studio that built a set around a character
 * nobody bonded with still has the art, and the art is what carries it.
 */
/**
 * How much of a progression chain has been printed in its declared order, 0..1.
 *
 * `progressionLink.position` says where a card sits in the chain. A studio that
 * ships the middle of an evolution line first has printed the same cards and
 * told a worse story, and this is the number that says so.
 *
 * Only PRINTED members count, for the same reason `chainTerm` counts only
 * printed ones: an announced chain must not be a free bonus.
 */
function printedInOrder(s: SimState, chain: Chain): number {
  const printed: Array<{ pos: number; tick: number }> = [];
  for (const cid of chain.cardIds) {
    const pid = s.printingByCard[cid];
    const card = s.cards[cid];
    if (!pid || !card?.progressionLink) continue;
    printed.push({ pos: card.progressionLink.position, tick: s.printings[pid]!.releaseTick });
  }
  if (printed.length < 2) return 0;
  printed.sort((a, b) => a.tick - b.tick);
  let inOrder = 0;
  for (let i = 1; i < printed.length; i++) {
    if (printed[i]!.pos > printed[i - 1]!.pos) inOrder++;
  }
  return inOrder / (printed.length - 1);
}

function chainTerm(s: SimState, card: Card, chainId: ChainId | undefined, kind: ChainKind): number {
  if (!chainId) return 0;
  const chain = s.chains[chainId];
  if (!chain) return 0;
  const cfg = s.config.chains;

  // Only cards that have actually been printed count. A chain announced and
  // never finished is exactly the pull demand this models, not a free bonus.
  let printed = 0;
  for (const cid of chain.cardIds) {
    if (cid !== card.id && s.printingByCard[cid]) printed++;
  }
  const links = Math.min(cfg.maxCountedLinks, printed);
  if (links <= 0) return 0;

  if (kind === 'progression' || kind === 'variant') {
    // `progressionLink.position` was declared and read by nothing, so a chain
    // was an unordered set: Charmander, Charmeleon and Charizard paid the same
    // in any print order. "Evolves into" is DIRECTIONAL, and this is the field
    // declared for exactly that.
    //
    // A chain printed in order is worth more than the same cards scattered.
    // `orderBonus` is 0 until fitted, so today this multiplies by 1.
    const ordered = chain.kind === 'progression' ? printedInOrder(s, chain) : 1;
    const order = 1 + cfg.orderBonus * ordered;
    const perLink = kind === 'variant' ? cfg.variantDesirePerLink : cfg.desirePerLink;
    return links * perLink * (chain.spansSets ? cfg.spansSetsBonus : 1) * order;
  }

  const subject = s.ips[card.subjectIp];
  const affection = subject ? subject.affection : 0;
  const weakness = 1 - Math.min(1, affection / Math.max(1, cfg.subjectReference));
  const hedge = cfg.illustrationWeakSubjectFloor
    + (1 - cfg.illustrationWeakSubjectFloor) * weakness;
  return links * cfg.illustrationDesirePerLink
    * (chain.spansSets ? cfg.illustrationSpansSetsBonus : 1) * hedge;
}

function defineProduct(
  s: SimState, id: ProductId, setId: SetId, kind: ProductKind,
  regionId: RegionId, packs: number, msrp: number,
): void {
  bumpRoster(s);
  s.products[id] = {
    id, setId, regionId, kind,
    packsPerUnit: packs,
    msrp: C(msrp), unitCogs: C(0),
    unitsPrinted: 0, unitsRemaining: 0, printedTick: null, allocations: {},
    scalperAppeal: U(kind === 'etb' || kind === 'premiumCollection'
      ? s.config.drops.scalperAppealPremium : s.config.drops.scalperAppealDefault),
    market: {
      price: C(msrp), heat: 1, nostalgia: 1, history: emptySeries(s.tick),
      hidden: {
        sealedRemaining: 0, ripRate: s.config.sealed.baseRipRatePerTick,
        contentsValue: 0,
      },
    },
  };
  s.sets[setId]!.productIds.push(id);
}

function commitPrintRun(s: SimState, setId: SetId, quantities: Record<ProductId, number>, quality: PrintQualityTier): void {
  const set = s.sets[setId]!;
  const pub = s.publishers[set.publisherId]!;
  // A tier the studio has not unlocked. Off by default — see
  // `unlocks.enforcePrintQuality`, which explains why a restriction ships
  // disabled rather than half-written.
  if (s.config.unlocks.enforcePrintQuality > 0
    && !pub.unlocks.printQualityTiers.includes(quality)) return;
  let cost = 0;
  for (const [pid, qty] of Object.entries(quantities)) {
    const p = s.products[pid as ProductId]!;
    p.unitsPrinted = qty;
    p.unitsRemaining = qty;
    p.printedTick = s.tick;
    // Finishes are a real line on the print bill. `costPerFinish` is 0 until
    // fitted, so today this multiplies by exactly 1.
    const finishLoad = 1 + s.config.treatments.costPerFinish * finishesPerCard(s, set);
    p.unitCogs = C(s.config.printing.unitCost[quality] * p.packsPerUnit
      * s.config.printing.cogsCoefficient * finishLoad);
    p.market.hidden.sealedRemaining = qty;
    cost += p.unitCogs * qty;
  }
  set.printQuality = quality;
  set.actualCost = C(cost);
  set.status = 'committed';
  set.commitTick = s.tick;
  pub.cash = C(pub.cash - cost);
  pub.ledger.push({ t: s.tick, amount: C(-cost), category: 'print_run', note: set.name, refId: setId });

  // Every region this set has a product in gets a release date, staggered by
  // `entryLeadWeeks`. The home market ships first and the rest follow, which is
  // CONCEPT.md §6.6's "region order is the preview mechanism": a publisher who
  // has opened a second region sees the first one's numbers before the second
  // one lands, and still cannot change the print run.
  const shipTo = new Set<RegionId>();
  for (const pid of set.productIds) {
    const p = s.products[pid];
    if (p) shipTo.add(p.regionId);
  }
  if (shipTo.size === 0) shipTo.add(REGION_US);
  const ordered = [...shipTo].sort(
    (a, b) => (a === REGION_US ? -1 : b === REGION_US ? 1 : String(a).localeCompare(String(b))),
  );
  set.regionSchedule = ordered.map((regionId, i) => ({
    regionId,
    releaseTick: T(s.tick + 18 + i * s.config.region.entryLeadWeeks),
  }));
  // Blind commitment: reveal and release are scheduled here, before any signal.
  // `scheduleReveal` can move the reveal start inside this window afterwards.
  // The release date and the print run cannot move at all — that is the bet.
  //
  // The lead is counted back from the home release, which is what the name says
  // and what `revealLeadWeeks` means to a bot. It used to count forward from the
  // commit, so the same word meant two different things and the knob moved the
  // window in the opposite direction to the one it read as. See the config note.
  set.revealStartTick = T(Math.max(
    s.tick, (set.regionSchedule[0]!.releaseTick as number) - s.config.hype.defaultLeadWeeks));
  // The reading is taken here and frozen, for the same reason the reveal
  // signal's truth is frozen at release: this is the last moment before the
  // answer is knowable, so it is the only moment at which scoring the reading
  // means anything.
  set.regionReadings = {} as Record<RegionId, number>;
  for (const { regionId } of set.regionSchedule) {
    const region = s.regions[regionId];
    const reading = readRegion(s, regionId);
    const product = set.productIds
      .map(pid => s.products[pid])
      .find(pr => pr && pr.regionId === regionId);
    if (!region || !reading || !product) continue;
    set.regionReadings[regionId] = readingFit(s, reading, set, product, region);
  }
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

  // A reprint rolls its own chase. It is a different collectible, and the
  // market is free to want it more or less than the printing it copies.
  mintPrinting(s, s.rng, {
    cardId, setId: intoSetId, regionId: 'reg_us' as RegionId,
    printQuantity: Math.max(1, quantity),
    sealed: Math.max(1, quantity),
    pullRate: card.pullRate ?? rarityPull(s, card.rarity, set.cardIds.length),
    printQuality: set.printQuality,
    isReprintOf: originalId,
    heat: cfg.value.openingHeat,
  });
  // printingByCard deliberately still points at the original. tickSealed reads
  // it per set to value a sealed product's contents; repointing it here would
  // make the original set's sealed price track the reprint instead.

  // Making the chase accessible again costs the original some of its aura.
  if (originalId) {
    const orig = s.printings[originalId];
    if (orig) orig.market.nostalgia = Math.max(1,
      orig.market.nostalgia * s.config.value.reprintNostalgiaPenalty);
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
    const headroom = effectiveCapacity(s, ch) - (existing ? existing.units : 0);
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

/** Cost of the next level of a levelled tier: base, then a multiple per level. */
function tierCost(base: number, multiple: number, ownedLevels: number): number {
  return base * Math.pow(multiple, ownedLevels);
}

/**
 * The non-channel half of the unlock tree.
 *
 * Split out so `purchaseUnlock` keeps reading as one idea per branch. Every
 * path here is a no-op unless the caller asks for it by name, which is why
 * adding this changed no existing measurement: no bot in the roster had ever
 * submitted a `purchaseUnlock` for anything but a channel.
 */
/** One row of the growth shop: what it costs, and what still blocks it. */
export interface UnlockOffer {
  unlock: keyof UnlockState;
  detail?: string;
  name: string;
  blurb: string;
  cost: Cents;
  /** Bought out: a one-shot already owned, or a tier at `maxLevel`. */
  owned: boolean;
  level: number;
  maxLevel: number;
  /** Weekly bill this adds. Upkeep is what stops a tier being bought on sight. */
  upkeepPerTick: Cents;
  /** Every requirement, met or not, as the pair of numbers it really is. */
  gates: Array<{ label: string; have: number; need: number; met: boolean }>;
  affordable: boolean;
}

/**
 * The growth shop, computed from the same gates `purchaseTier` enforces.
 *
 * A screen must not restate these conditions. There are eleven of them across
 * six unlocks, three read a live relationship or a shipped-set count rather
 * than a stored number, and a UI copy of that logic drifts silently the first
 * time a gate moves. So the engine answers the question and the screen renders
 * the answer.
 *
 * **Pure, and it draws nothing** — screens-audit rule 2.
 */
export function unlockOffers(s: SimState, publisherId: PublisherId): UnlockOffer[] {
  const pub = s.publishers[publisherId];
  if (!pub) return [];
  const cfg = s.config.unlocks;
  const u = pub.unlocks;
  const scale = audienceScale(s);
  const out: UnlockOffer[] = [];

  const push = (
    o: Omit<UnlockOffer, 'affordable' | 'gates'> & { gates?: UnlockOffer['gates'] },
  ): void => {
    const gates = o.gates ?? [];
    out.push({
      ...o,
      gates: [...gates, { label: 'Cash', have: pub.cash, need: o.cost, met: pub.cash >= o.cost }],
      affordable: pub.cash >= o.cost && gates.every(g => g.met) && !o.owned,
    });
  };

  push({
    unlock: 'marketResearch', name: 'Market research', level: u.marketResearch, maxLevel: cfg.maxLevel,
    blurb: 'Narrows what a reading of a character can hide. Bought per project.',
    cost: C(tierCost(cfg.marketResearchCost, cfg.marketResearchCostLevelMultiple, u.marketResearch)),
    owned: u.marketResearch >= cfg.maxLevel, upkeepPerTick: C(0),
  });

  push({
    unlock: 'communityTeam', name: 'Community team', level: u.communityTeam, maxLevel: cfg.maxLevel,
    blurb: 'Reads the audience across the whole roster. Carries a weekly bill.',
    cost: C(tierCost(cfg.communityTeamCost, cfg.communityTeamCostLevelMultiple, u.communityTeam)),
    owned: u.communityTeam >= cfg.maxLevel,
    upkeepPerTick: C(cfg.communityTeamUpkeepPerTick),
    gates: [{
      label: 'Audience scale', have: scale, need: cfg.communityTeamAudienceGate,
      met: scale >= cfg.communityTeamAudienceGate,
    }],
  });

  push({
    unlock: 'analytics', name: 'Analytics', level: u.analytics, maxLevel: cfg.maxLevel,
    blurb: 'Sharpens the market read and the price forecast. Never the surprise.',
    cost: C(tierCost(cfg.analyticsCost, cfg.analyticsCostLevelMultiple, u.analytics)),
    owned: u.analytics >= cfg.maxLevel,
    upkeepPerTick: C(cfg.analyticsUpkeepPerTick),
    gates: [{
      label: 'Brand standing', have: pub.brandStanding, need: cfg.analyticsBrandGate,
      met: pub.brandStanding >= cfg.analyticsBrandGate,
    }],
  });

  // The print tiers gate on a LIVE distributor relationship, not on a number
  // that time alone reaches.
  const dist = Object.values(s.channels).find(
    ch => ch.kind === 'distributor' && ch.unlocked
      && ch.relationship >= cfg.printQualityRelationshipGate);
  const bestDist = Object.values(s.channels)
    .filter(ch => ch.kind === 'distributor' && ch.unlocked)
    .reduce((n, ch) => Math.max(n, ch.relationship), 0);
  for (const tier of ['premium', 'archival'] as const) {
    push({
      unlock: 'printQualityTiers', detail: tier, name: `${tier[0]!.toUpperCase()}${tier.slice(1)} printing`,
      blurb: tier === 'premium'
        ? 'A better card stock. Fewer errors, and it grades higher.'
        : 'The best stock money buys. Almost no errors at all.',
      cost: C(tier === 'premium' ? cfg.premiumTierCost : cfg.archivalTierCost),
      owned: u.printQualityTiers.includes(tier),
      level: u.printQualityTiers.includes(tier) ? 1 : 0, maxLevel: 1, upkeepPerTick: C(0),
      gates: [{
        label: 'Distributor relationship', have: bestDist,
        need: cfg.printQualityRelationshipGate, met: !!dist,
      }],
    });
  }

  const shipped = Object.values(s.sets).filter(
    set => set.publisherId === pub.id && set.status === 'released'
      && set.performance !== null && set.performance.revenue >= set.actualCost).length;
  const needShipped = (u.specialtySetSlots + 1) * cfg.specialtySlotSetsPerSlot;
  push({
    unlock: 'specialtySetSlots', name: 'Specialty slot', level: u.specialtySetSlots, maxLevel: 99,
    blurb: 'One more specialty set in flight. A slot is a production line, not a receipt.',
    cost: C(tierCost(cfg.specialtySlotCost, cfg.specialtySlotCostMultiple, u.specialtySetSlots)),
    owned: false, upkeepPerTick: C(0),
    gates: [{
      label: 'Sets that made their cost back', have: shipped, need: needShipped,
      met: shipped >= needShipped,
    }],
  });

  push({
    unlock: 'canHostEvents', name: 'Self-hosted events', level: u.canHostEvents ? 1 : 0, maxLevel: 1,
    blurb: 'Run organised play on a shipped set. Buys goodwill and a promo printing.',
    cost: C(cfg.eventsCost), owned: u.canHostEvents, upkeepPerTick: C(0),
    gates: [{
      label: 'Audience scale', have: scale, need: cfg.eventsAudienceGate,
      met: scale >= cfg.eventsAudienceGate,
    }],
  });

  return out;
}

function purchaseTier(s: SimState, unlock: keyof UnlockState, detail?: string): void {
  const pub = s.publishers[s.playerId];
  if (!pub) return;
  const cfg = s.config.unlocks;
  const u = pub.unlocks;
  const scale = audienceScale(s);

  const buy = (cost: number, note: string, apply: () => void): void => {
    if (pub.cash < cost) return;
    pub.cash = C(pub.cash - cost);
    pub.ledger.push({ t: s.tick, amount: C(-cost), category: 'unlock', note });
    apply();
    emit(s, 'unlockPurchased', true, { publisherId: pub.id }, { unlock: String(unlock), cost, note });
  };

  switch (unlock) {
    case 'marketResearch':
      if (u.marketResearch >= cfg.maxLevel) return;
      buy(tierCost(cfg.marketResearchCost, cfg.marketResearchCostLevelMultiple, u.marketResearch),
        'market research', () => { u.marketResearch++; });
      return;

    case 'communityTeam':
      if (u.communityTeam >= cfg.maxLevel) return;
      // Audience size, per CONCEPT.md §9. A community team with no community is
      // a payroll line and nothing else.
      if (scale < cfg.communityTeamAudienceGate) return;
      buy(tierCost(cfg.communityTeamCost, cfg.communityTeamCostLevelMultiple, u.communityTeam),
        'community team', () => { u.communityTeam++; });
      return;

    case 'analytics':
      if (u.analytics >= cfg.maxLevel) return;
      if (pub.brandStanding < cfg.analyticsBrandGate) return;
      buy(tierCost(cfg.analyticsCost, cfg.analyticsCostLevelMultiple, u.analytics),
        'analytics', () => { u.analytics++; });
      return;

    case 'printQualityTiers': {
      // "Capital, distributor terms": the gate is a live distributor
      // relationship, which a studio has to have earned and kept.
      const tier = detail as PrintQualityTier | undefined;
      if (tier !== 'premium' && tier !== 'archival') return;
      if (u.printQualityTiers.includes(tier)) return;
      const dist = Object.values(s.channels).find(
        ch => ch.kind === 'distributor' && ch.unlocked
          && ch.relationship >= cfg.printQualityRelationshipGate);
      if (!dist) return;
      buy(tier === 'premium' ? cfg.premiumTierCost : cfg.archivalTierCost,
        `${tier} printing`, () => { u.printQualityTiers.push(tier); });
      return;
    }

    case 'specialtySetSlots': {
      // "Prior set performance": slots are earned by shipping sets that did not
      // flop, so a studio cannot buy its way into a wider release schedule.
      // A set counts once it has made its print run back. `actualCost` is what
      // the run cost and `performance.revenue` is what it earned, which is the
      // same test `harness/metrics.ts` calls a flop.
      const shipped = Object.values(s.sets).filter(
        set => set.publisherId === pub.id && set.status === 'released'
          && set.performance !== null && set.performance.revenue >= set.actualCost).length;
      if (shipped < (u.specialtySetSlots + 1) * cfg.specialtySlotSetsPerSlot) return;
      buy(tierCost(cfg.specialtySlotCost, cfg.specialtySlotCostMultiple, u.specialtySetSlots),
        'specialty slot', () => { u.specialtySetSlots++; });
      return;
    }

    case 'canHostEvents':
      if (u.canHostEvents) return;
      if (scale < cfg.eventsAudienceGate) return;
      buy(cfg.eventsCost, 'self-hosted events', () => { u.canHostEvents = true; });
      return;

    // `regions` has its own decision with its own per-region cost, and
    // `directStore` is set by unlocking the direct channel rather than bought.
    default:
      return;
  }
}

/**
 * Buys anything in the unlock tree.
 *
 * Every branch is the same three steps — check the gate, take the money, set
 * the field — and each pays for a different thing: reach (`channels`,
 * `regions`), a sharper reading (`marketResearch`, `communityTeam`,
 * `analytics`), or permission (`printQualityTiers`, `specialtySetSlots`,
 * `canHostEvents`).
 *
 * [round 11] This used to be `if (unlock !== 'channels') return;`. One line,
 * and it made six declared systems permanently unreachable — including
 * `marketResearch`, whose consumer in `tickRegionKnowledge` had been wired the
 * whole time and was multiplying a value that could never be non-zero.
 */
function purchaseUnlock(s: SimState, unlock: keyof UnlockState, detail?: string): void {
  if (unlock !== 'channels') { purchaseTier(s, unlock, detail); return; }
  if (!detail) return;
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
 * Signs a collab offer for a set (CONCEPT.md §6.7).
 *
 * The trade is reach for equity. A collab reaches segments your own brand does
 * not, and it does it immediately — no exposure to build, no affection to wait
 * for. What you do not get is the affection: the licensor's audience came for
 * the licensor, so a collab set returns only `collabs.exposureShare` of the
 * usual exposure to your own IPs. A studio that lives on collabs sells a great
 * deal of product and owns nothing at the end of it, which is the asymmetry
 * that stops this being a straight upgrade over your own IP.
 */
function signCollab(s: SimState, collabId: CollabId, setId?: SetId): void {
  const pub = s.publishers[s.playerId];
  const collab = s.collabs[collabId];
  if (!pub || !collab || collab.signedTick !== null) return;
  if (collab.expiresTick !== null && s.tick > collab.expiresTick) return;
  if (pub.brandStanding < collab.requiredBrandStanding) return;
  if (pub.cash < collab.advance) return;

  // A collab attaches to a set that has not printed yet. After the commit the
  // print run is locked and the reveal is running, so there is nothing left for
  // the reach to change — signing then would be paying for a finished bet.
  const target = setId
    ? s.sets[setId]
    : Object.values(s.sets)
      .filter(set => set.publisherId === pub.id && set.status === 'design' && !set.collabId)
      .sort((a, b) => (b.designStartTick as number) - (a.designStartTick as number))[0];
  if (!target || target.status !== 'design' || target.collabId) return;

  pub.cash = C(pub.cash - collab.advance);
  pub.ledger.push({
    t: s.tick, amount: C(-collab.advance), category: 'licensing',
    note: `advance ${collab.name}`, refId: collab.id,
  });
  collab.paidTotal = collab.advance;
  collab.signedForSetId = target.id;
  collab.signedTick = s.tick;
  collab.expiresTick = null;
  target.collabId = collab.id;
  target.type = 'collab';
  emit(s, 'collabSigned', true, { publisherId: pub.id, setId: target.id, collabId: collab.id },
    {
      advance: collab.advance, royaltyShare: collab.royaltyShare,
      minimumGuarantee: collab.minimumGuarantee, kind: collab.kind,
    });
}

/**
 * Collab offers arrive, and they lapse.
 *
 * Gated on brand standing per CONCEPT.md §9: nobody licenses their franchise to
 * a studio nobody has heard of. The offer carries an expiry, so a good one that
 * arrives while you are broke is a real loss rather than a queue entry — which
 * is what makes cash on hand worth something between print runs.
 */
function tickCollabOffers(s: SimState): void {
  const cfg = s.config.collabs;
  const pub = s.publishers[s.playerId]!;
  if (pub.deadTick !== null) return;

  for (const c of Object.values(s.collabs)) {
    if (c.signedTick !== null || c.expiresTick === null) continue;
    if (s.tick <= c.expiresTick) continue;
    delete s.collabs[c.id];
    emit(s, 'collabExpired', false, { publisherId: pub.id, collabId: c.id }, { name: c.name });
  }

  if (s.tick % s.config.strides.quarterly !== 0) return;
  const open = Object.values(s.collabs).filter(c => c.signedTick === null).length;
  if (open >= cfg.maxOpenOffers) return;
  if (!chance(s.rng, cfg.offerChancePerQuarter * pub.brandStanding)) return;

  // The reach bonus lands on the segments this licensor brings, not on all of
  // them. A collab that reached everybody equally would be a flat demand
  // multiplier, and choosing between two offers would stop being a decision.
  const reachBonus = Object.fromEntries(SEGMENTS.map(g => [g, 0])) as Record<AudienceSegment, number>;
  const reached = randInt(s.rng, cfg.segmentsReachedMin, cfg.segmentsReachedMax);
  for (let i = 0; i < reached; i++) {
    reachBonus[pick(s.rng, SEGMENTS)] += randRange(s.rng, cfg.reachBonusMin, cfg.reachBonusMax);
  }

  const id = nextId(s, 'collab') as CollabId;
  const kind = pick(s.rng, ['externalIp', 'event', 'retailExclusive'] as const);
  // One roll, two terms, opposite directions. A licensor that wants the money
  // up front takes less of the back end, and one that believes in the set does
  // the reverse — so the offer is a position on the bet, not a price tag.
  const terms = rand(s.rng);
  const advance = C(cfg.advanceMin + terms * (cfg.advanceMax - cfg.advanceMin));
  const royaltyShare = cfg.royaltyShareMax - terms * (cfg.royaltyShareMax - cfg.royaltyShareMin);
  s.collabs[id] = {
    id, kind,
    name: `${kind === 'externalIp' ? 'Licensed IP' : kind === 'event' ? 'Event' : 'Retail'} Collab ${id}`,
    advance,
    royaltyShare,
    minimumGuarantee: C(advance * cfg.minimumGuaranteeMultiple),
    royaltyAccrued: C(0),
    paidTotal: C(0),
    settledTick: null,
    reachBonus,
    requiredBrandStanding: U(randRange(s.rng, cfg.gateMin, cfg.gateMax)),
    expiresTick: T(s.tick + cfg.offerWindowWeeks),
    signedForSetId: null, signedTick: null,
  };
  emit(s, 'collabOffered', true, { publisherId: pub.id, collabId: id },
    {
      advance, royaltyShare, minimumGuarantee: s.collabs[id]!.minimumGuarantee,
      kind, requiredBrandStanding: s.collabs[id]!.requiredBrandStanding,
    });
}

/**
 * Hands the licensor whatever the deal now says it is owed, and no more.
 *
 * One expression covers the advance, the recoupment, the running royalty and
 * the guarantee, because all four are the same question: what does the deal
 * owe in total so far, and how much of that has already gone out?
 *
 *   due = max(royalty earned, the advance, and — once settled — the guarantee)
 *
 * The advance sits inside the max, which is what makes it recoupable: a set
 * has to earn past the advance before a single further dollar leaves. The
 * guarantee joins the max only at settlement, so a set that is still selling
 * is never charged for a shortfall it has not finished making up.
 */
function payCollab(s: SimState, collab: Collab): void {
  const pub = s.publishers[s.playerId];
  if (!pub) return;
  const due = Math.max(
    collab.royaltyAccrued,
    collab.advance,
    collab.settledTick !== null ? collab.minimumGuarantee : 0,
  );
  const owed = due - collab.paidTotal;
  if (owed <= 0) return;
  collab.paidTotal = C(collab.paidTotal + owed);
  pub.cash = C(pub.cash - owed);
  pub.ledger.push({
    t: s.tick, amount: C(-owed), category: 'licensing',
    note: `royalty ${collab.name}`, refId: collab.id,
  });
}

/**
 * Books the licensor's share of a set's sales revenue.
 *
 * Charged where the revenue is booked rather than in a settlement pass, so the
 * royalty is a cost of selling and shows up in the same tick as the sale that
 * caused it. A set with no collab pays nothing and costs one property read.
 */
function accrueCollabRoyalty(s: SimState, set: CardSet, revenue: number): void {
  if (!set.collabId) return;
  const collab = s.collabs[set.collabId];
  if (!collab || collab.signedTick === null) return;
  collab.royaltyAccrued = C(collab.royaltyAccrued + revenue * collab.royaltyShare);
  payCollab(s, collab);
}

/**
 * Settles the minimum guarantee on every signed collab whose selling is done.
 *
 * This is the risk in a licence, and it is the reason a licence is a bet
 * rather than a purchase. A set that sold pays its royalty and owes nothing
 * extra; a set that flopped never earned its way to the guarantee, and the
 * shortfall falls due here in one payment, years after the reach it bought
 * stopped being worth anything.
 */
function tickCollabSettlement(s: SimState): void {
  const cfg = s.config.collabs;
  for (const collab of Object.values(s.collabs)) {
    if (collab.signedTick === null || collab.settledTick !== null) continue;
    const set = collab.signedForSetId ? s.sets[collab.signedForSetId] : undefined;
    if (!set || set.regionSchedule.length === 0) continue;
    const released = Math.min(...set.regionSchedule.map(r => r.releaseTick as number));
    if (s.tick < released + cfg.guaranteeSettleWeeks) continue;
    collab.settledTick = s.tick;
    const shortfall = collab.minimumGuarantee - collab.paidTotal;
    payCollab(s, collab);
    if (shortfall > 0) {
      emit(s, 'collabGuaranteeCalled', false,
        { publisherId: s.playerId, setId: set.id, collabId: collab.id },
        { shortfall: C(shortfall), minimumGuarantee: collab.minimumGuarantee, royaltyAccrued: collab.royaltyAccrued });
    }
  }
}

/**
 * What a set's collab adds to its demand. 1 for a set without one.
 *
 * Weighted by segment size, so reaching the largest segment is worth more than
 * reaching the smallest — the offer with the bigger headline number is not
 * automatically the better offer.
 */
function collabDemandFactor(s: SimState, set: CardSet): number {
  if (!set.collabId) return 1;
  const collab = s.collabs[set.collabId];
  if (!collab) return 1;
  return collabOfferFactor(s, collab);
}

/**
 * The same factor, for an offer nobody has signed yet.
 *
 * Split out and exported for two reasons. A bot has to price an offer with the
 * engine's own arithmetic rather than a copy of it — the moment the two
 * disagree, the roster is choosing offers by one rule and being paid by
 * another, and every licensing measurement after that is fiction. And a print
 * run has to be sized against this number: demand a licence buys that the
 * publisher never printed for is demand nobody can sell, which is what made
 * `reachToDemand` inert before Round 8 changed how the run is sized.
 *
 * It is a pure read of `s`.
 */
export function collabOfferFactor(s: SimState, collab: Collab): number {
  // Weighted by who is out there, not by who is already buying: a licence
  // reaches people the studio has not reached, which is the whole point of one.
  const home = segmentsIn(s, s.homeRegionId);
  const total = SEGMENTS.reduce((n, g) => n + home[g].population, 0);
  if (total <= 0) return 1;
  let weighted = 0;
  for (const g of SEGMENTS) {
    weighted += collab.reachBonus[g] * home[g].population / total;
  }
  return 1 + s.config.collabs.reachToDemand * weighted;
}

/**
 * Opens a second market (CONCEPT.md §6.6, §9).
 *
 * The fee is only the door. The region's channels are all locked behind their
 * own brand gates and their own prices, so an early unlock buys the right to
 * start building reach rather than the reach itself — which is what stops
 * "open everything in year one" from being the obvious play.
 */
function unlockRegion(s: SimState, regionId: RegionId): void {
  const pub = s.publishers[s.playerId];
  const region = s.regions[regionId];
  if (!pub || !region || region.unlockedTick !== null) return;
  if (pub.unlocks.regions.includes(regionId)) return;
  if (pub.cash < region.unlockCost) return;

  pub.cash = C(pub.cash - region.unlockCost);
  pub.ledger.push({
    t: s.tick, amount: C(-region.unlockCost), category: 'unlock',
    note: region.name, refId: region.id,
  });
  region.unlockedTick = s.tick;
  pub.unlocks.regions.push(regionId);
  // A known studio arrives with a foothold rather than from nothing. Without
  // this, entering a market is years of acquisition before a single sale, and
  // every region is a losing bet whatever its taste.
  seedRegionEntry(s, regionId);
  emit(s, 'regionUnlocked', true, { publisherId: pub.id, regionId },
    { cost: region.unlockCost, marketSize: region.marketSize });
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
    case 'createIp':
      createIp(s, d.payload.id, d.payload.name, d.payload.kind,
        d.payload.archetype, d.payload.baseAge, d.payload.affiliation ?? null);
      break;
    case 'createSet': createSet(s, d.payload.id, d.payload.name, d.payload.setType, d.payload.targetSize); break;
    case 'designCard':
      designCard(s, d.payload.id, d.payload.setId, d.payload.subjectIp, d.payload.cameos,
        d.payload.rarity, d.payload.artistId, {
          name: d.payload.name, treatments: d.payload.treatments,
          artBrief: d.payload.artBrief, flavorText: d.payload.flavorText,
          progressionLink: d.payload.progressionLink,
          illustrationLink: d.payload.illustrationLink,
          pullRate: d.payload.pullRate,
        });
      break;
    case 'defineProduct':
      defineProduct(s, d.payload.id, d.payload.setId, d.payload.kind, d.payload.regionId,
        d.payload.packsPerUnit, d.payload.msrp);
      break;
    case 'commitPrintRun':
      commitPrintRun(s, d.payload.setId, d.payload.quantities, d.payload.quality);
      break;
    case 'allocate': allocate(s, d.payload.productId, d.payload.allocations); break;
    case 'purchaseUnlock': purchaseUnlock(s, d.payload.unlock, d.payload.detail); break;
    case 'unlockRegion': unlockRegion(s, d.payload.regionId); break;
    case 'signCollab': signCollab(s, d.payload.collabId, d.payload.setId); break;
    // `advance` is not a reducer decision. It runs ticks, and a tick runs the
    // reducer, so applying it here would re-enter the loop it was submitted
    // into. The engine exports `advance()` for callers that want to skip weeks,
    // and that is where this belongs — it is in the union so a decision log can
    // record a skip, not so the reducer can perform one.
    case 'advance': break;
    case 'reprint': reprint(s, d.payload.cardId, d.payload.intoSetId, d.payload.quantity); break;
    case 'scheduleReveal':
      scheduleReveal(s, d.payload.setId, d.payload.startTick, d.payload.cadence);
      break;
    case 'openPreorders':
      openPreorders(s, d.payload.setId, d.payload.unitsCap);
      break;
    case 'hostPrerelease':
      hostPrerelease(s, d.payload.setId, d.payload.scale, d.payload.budget);
      break;
    case 'hostEvent':
      hostEvent(s, d.payload.setId, d.payload.scale, d.payload.budget);
      break;
    case 'deleteIp': deleteIp(s, d.payload.ipId); break;
    case 'marketingSpend':
      marketingSpend(s, d.payload.setId, d.payload.amount);
      break;
    case 'scheduleDrop':
      scheduleDrop(s, d.payload.id, d.payload.productId, d.payload.channelId,
        d.payload.atTick, d.payload.units);
      break;
    case 'borrow': {
      const pub = s.publishers[s.playerId]!;
      // The lender has a limit, and this handler did not know about it: it took
      // any amount and booked it. Nothing called it, so the hole never opened,
      // but the moment a UI does, an unclamped loan is infinite money.
      const room = Math.max(0, borrowCeiling(s, pub) - pub.debt);
      const amt = Math.round(Math.min(d.payload.amount, room));
      if (amt <= 0) break;
      pub.cash = C(pub.cash + amt);
      pub.debt = C(pub.debt + amt);
      pub.ledger.push({ t: s.tick, amount: C(amt), category: 'principal', note: 'drew on the loan' });
      break;
    }
    case 'repay': {
      const pub = s.publishers[s.playerId]!;
      const amt = Math.round(Math.min(pub.cash, pub.debt, d.payload.amount));
      if (amt <= 0) break;
      pub.cash = C(pub.cash - amt); pub.debt = C(pub.debt - amt);
      pub.ledger.push({ t: s.tick, amount: C(-amt), category: 'principal', note: 'paid down the loan' });
      break;
    }
    case 'commissionArt': {
      placeCommission(s, d.payload.cardId, d.payload.artistId, d.payload.brief);
      break;
    }
    case 'hireArtist': {
      hireArtist(s, d.payload.artistId, d.payload.terms);
      break;
    }
    // `advance` is deliberately a no-op here: it exists so a decision log can
    // record a skip, and the exported `advance()` does the work.
    default: break;
  }
}

/**
 * The only way to drive the sim. Each call mints the entity id, submits a
 * decision, and hands the id back, so callers can chain a whole release in one
 * batch while every action still lands in the decision log.
 */
export const api = {
  /**
   * Make a character.
   *
   * `archetype` names the prior the hidden roll is drawn from, and `baseAge` is
   * how old they are at debut. Both were authored in the UI and held app-side
   * in `store.ts` because `IpEntity` had no field for them; they reach the sim
   * now. Omitting either keeps the global prior exactly.
   */
  createIp(
    s: SimState, name: string, kind: IpEntity['kind'],
    opts: { archetype?: Archetype; baseAge?: number; affiliation?: IpId | null } = {},
  ): IpId {
    const id = nextId(s, 'ip') as IpId;
    submit(s, {
      type: 'createIp', tick: s.tick,
      payload: {
        id, name, kind, archetype: opts.archetype, baseAge: opts.baseAge,
        affiliation: opts.affiliation ?? null,
      },
    });
    return id;
  },
  createSet(s: SimState, name: string, setType: SetType, targetSize: number): SetId {
    const id = nextId(s, 'set') as SetId;
    submit(s, { type: 'createSet', tick: s.tick, payload: { id, name, setType, targetSize } });
    return id;
  },
  /**
   * `treatments` was reachable through the decision payload and the handler
   * since the engine was written, and no caller could set it: the parameter
   * simply was not on this function. Omitting it still derives the finish from
   * the rarity exactly as before. Finishes STACK, so this takes a list — see
   * `docs/design/sets-and-distribution.md`.
   */
  designCard(
    s: SimState, setId: SetId, subjectIp: IpId, cameos: IpId[], rarity: Rarity, artistId: ArtistId,
    progressionLink?: { chainId: ChainId; position: number; kind?: ChainKind },
    illustrationLink?: ChainId,
    treatments?: Treatment[],
    pullRate?: number | null,
  ): CardId {
    const id = nextId(s, 'card') as CardId;
    submit(s, {
      type: 'designCard', tick: s.tick,
      payload: { id, setId, subjectIp, cameos, rarity, artistId, progressionLink, illustrationLink, treatments, pullRate },
    });
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
  unlockRegion(s: SimState, regionId: RegionId): void {
    submit(s, { type: 'unlockRegion', tick: s.tick, payload: { regionId } });
  },
  signCollab(s: SimState, collabId: CollabId, setId?: SetId): void {
    submit(s, { type: 'signCollab', tick: s.tick, payload: { collabId, setId } });
  },
  reprint(s: SimState, cardId: CardId, intoSetId: SetId, quantity: number): void {
    submit(s, { type: 'reprint', tick: s.tick, payload: { cardId, intoSetId, quantity } });
  },
  scheduleReveal(s: SimState, setId: SetId, startTick: Tick, cadence: number): void {
    submit(s, { type: 'scheduleReveal', tick: s.tick, payload: { setId, startTick, cadence } });
  },
  openPreorders(s: SimState, setId: SetId, unitsCap: number): void {
    submit(s, { type: 'openPreorders', tick: s.tick, payload: { setId, unitsCap } });
  },
  hostPrerelease(s: SimState, setId: SetId, scale: number, budget: Cents): void {
    submit(s, { type: 'hostPrerelease', tick: s.tick, payload: { setId, scale, budget } });
  },
  hostEvent(s: SimState, setId: SetId, scale: number, budget: Cents): void {
    submit(s, { type: 'hostEvent', tick: s.tick, payload: { setId, scale, budget } });
  },
  deleteIp(s: SimState, ipId: IpId): void {
    submit(s, { type: 'deleteIp', tick: s.tick, payload: { ipId } });
  },
  marketingSpend(s: SimState, setId: SetId, amount: Cents): void {
    submit(s, { type: 'marketingSpend', tick: s.tick, payload: { setId, amount } });
  },
  commissionArt(s: SimState, cardId: CardId, artistId: ArtistId, brief?: Partial<ArtBrief>): void {
    const artist = s.artists[artistId];
    const full: ArtBrief = {
      mood: 'neutral', composition: 'portrait',
      // Default to the artist's asking rate. Paying over it buys a better
      // result with diminishing returns; paying under it is not a discount,
      // it is a worse brief.
      budget: artist ? artist.rate : (0 as Cents),
      notes: '', ...brief,
    };
    submit(s, { type: 'commissionArt', tick: s.tick, payload: { cardId, artistId, brief: full } });
  },
  hireArtist(s: SimState, artistId: ArtistId, terms: ArtistTerms): void {
    submit(s, { type: 'hireArtist', tick: s.tick, payload: { artistId, terms } });
  },
  /**
   * Draw on the loan, on purpose.
   *
   * The `borrow` decision and its handler have existed since the engine was
   * written and nothing ever called them, so every loan in the game was the
   * automatic overdraft in `tickFinance` firing after cash had already gone
   * negative. That makes borrowing a consequence. This makes it a decision.
   *
   * The amount is clamped to what the lender will still extend — see
   * `borrowCeiling`.
   */
  borrow(s: SimState, amount: Cents): void {
    submit(s, { type: 'borrow', tick: s.tick, payload: { amount } });
  },
  /** Pay debt down early. Clamped to cash and to what is owed. */
  repay(s: SimState, amount: Cents): void {
    submit(s, { type: 'repay', tick: s.tick, payload: { amount } });
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

  // Art that has not come back by now never will, as far as this set is
  // concerned. The card ships with house filler at the quality floor, and the
  // commission — already paid for — is abandoned. A missed schedule costs
  // quality; it must never be able to hold a release hostage.
  let housed = 0;
  for (const cardId of set.cardIds) {
    const card = s.cards[cardId]!;
    if (card.artSource !== 'pending') continue;
    card.artSource = 'house';
    card.artQuality = U(s.config.art.houseQuality);
    housed++;
  }
  if (housed > 0) {
    s.market.commissionQueue = s.market.commissionQueue.filter(c => !set.cardIds.includes(c.cardId));
    emit(s, 'artMissedRelease', true, { setId, publisherId: set.publisherId },
      { cards: housed, ofSet: set.cardIds.length });
  }

  // A product the player never allocated goes out on the default split. Anything
  // the channels will not carry stays unallocated, and unallocated stock cannot
  // sell — that is the honest cost of printing past your channel reach.
  for (const pid of set.productIds) {
    const p = s.products[pid]!;
    if (Object.keys(p.allocations).length === 0) autoAllocate(s, p, set.publisherId);
  }

  for (const cardId of set.cardIds) {
    const card = s.cards[cardId]!;
    const totalPacks = set.productIds.reduce((n, pid) => {
      const p = s.products[pid]!;
      return n + p.unitsPrinted * p.packsPerUnit;
    }, 0);
    // A studio that authored its own pack carries the rate the slots imply.
    // Null is the neutral default, so a bot set still reads the global table.
    const pullRate = card.pullRate ?? rarityPull(s, card.rarity, set.cardIds.length);
    const id = mintPrinting(s, s.rng, {
      cardId, setId, regionId,
      printQuantity: Math.max(1, Math.round(totalPacks * pullRate)),
      // NOT `printQuantity`: the floor of 1 is a guard on the quantity, and
      // applying it to the population would conjure a copy of a card the run
      // printed none of.
      sealed: Math.round(totalPacks * pullRate),
      pullRate, printQuality: set.printQuality,
      isReprintOf: null,
      // A hyped set launches hot. This is where the reveal window reaches the
      // value engine; a set with no campaign opens at exactly `openingHeat`.
      heat: cfg.value.openingHeat + launchHype * cfg.hype.heatFromHype,
    });
    s.printingByCard[cardId] = id;

    const ip = s.ips[card.subjectIp]!;
    ip.appearanceCount++;
    if (!ip.firstPrintingId) ip.firstPrintingId = id;
    for (const cid of card.cameos) s.ips[cid]!.cameoCount++;
  }

  // A collab pays its goodwill in the segments it reaches, and only there. It
  // arrives at release rather than at signing: the audience meets the licensor
  // when the cards ship, not when the contract does.
  const collab = set.collabId ? s.collabs[set.collabId] : undefined;
  if (collab) {
    for (const seg of SEGMENTS) {
      const bonus = collab.reachBonus[seg];
      if (bonus <= 0) continue;
      const st = segmentsIn(s, regionId)[seg];
      st.goodwill = Math.min(1, st.goodwill + s.config.collabs.goodwillPerReach * bonus);
    }
  }

  // Attention is consumed on release. This is the flood penalty. Goodwill
  // burns harder the less attention has recovered since the last release —
  // releasing into an already-exhausted audience is what a flood looks like.
  let goodwillBurn = 0;
  const releaseSegs = segmentsIn(s, regionId);
  for (const seg of SEGMENTS) {
    const st = releaseSegs[seg];
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
  creditRelease(s, regionId);
  emit(s, 'setReleased', true, { setId, publisherId: set.publisherId },
    { cards: set.cardIds.length, regionId: regionId as string, wave: 0 });
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
      ip.exposure *= (1 - cfg.exposureDecayPerTick);
    } else {
      // `truth.longevity` is the mascot mechanic, and until now it was rolled
      // for every IP and read by nothing: an IP's roll stopped mattering after
      // `relatability`. Above 1 the character keeps its hold once the exposure
      // stops, below 1 it fades faster than the pack.
      //
      // `affection.longevityWeight` is 0, so `ageing` is `1 + 0 * x` and
      // evaluates to exactly 1. Plan 2 fits the weight.
      const ageing = 1 + cfg.longevityWeight
        * (1 / Math.max(0.01, ip.truth.longevity) - 1);
      ip.affection *= (1 - cfg.decayPerTickUnexposed * ageing);
    }
    ip.resurgence *= (1 - cfg.resurgenceDecayPerTick);
    writePoint(ip.affectionHistory, s.tick, ip.affection, 0.04);
    // Declared beside `affectionHistory` and never written to since the day it
    // was minted. It is what CONCEPT.md §8's "trend arrows" read: affection says
    // where a character stands, resurgence says whether the back catalogue just
    // pulled them back into the light.
    writePoint(ip.resurgenceHistory, s.tick, ip.resurgence, s.config.history.writeThreshold);
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

/**
 * How much of a set carries a finish, 0..1.
 *
 * A finish only works while it is rare. This is the denominator of that rule,
 * and it is measured over the set the card belongs to rather than globally —
 * a studio that gilds one set has not devalued the finish in every other.
 */
/**
 * Which set a card belongs to.
 *
 * `Card` carries no `setId` — the set owns the list — so this is a search. It
 * runs only when `treatments.desirePerFinish` is non-zero, which is why the
 * neutral default costs nothing at all.
 */
function setOfCard(s: SimState, cardId: CardId): SetId | null {
  for (const set of Object.values(s.sets)) {
    if (set.cardIds.includes(cardId)) return set.id;
  }
  return null;
}

/** Mean finishes per card across a set. Two finishes on half the cards is 1. */
function finishesPerCard(s: SimState, set: CardSet): number {
  if (set.cardIds.length === 0) return 0;
  let n = 0;
  for (const cid of set.cardIds) n += s.cards[cid]?.treatments.length ?? 0;
  return n / set.cardIds.length;
}

function finishShareOfSet(s: SimState, setId: SetId): number {
  const set = s.sets[setId];
  if (!set || set.cardIds.length === 0) return 0;
  let treated = 0;
  for (const cid of set.cardIds) {
    if ((s.cards[cid]?.treatments.length ?? 0) > 0) treated++;
  }
  return treated / set.cardIds.length;
}

/**
 * What a card's finishes add to its desire.
 *
 * Additive, never multiplicative. The same rule the chain hedge follows and for
 * the same reason: a multiplicative bonus scales with affection and would pay
 * most on the card that needed it least.
 *
 * Past `saturationShare` the term decays toward zero while the print bill does
 * not — which is the trade the design asks for, stated as arithmetic rather
 * than as a warning in the UI.
 */
function treatmentDesire(s: SimState, card: Card, setId: SetId | null): number {
  const cfg = s.config.treatments;
  if (cfg.desirePerFinish === 0 || card.treatments.length === 0) return 0;
  const share = setId ? finishShareOfSet(s, setId) : 0;
  const saturation = share <= cfg.saturationShare ? 1
    : Math.max(0, 1 - (share - cfg.saturationShare) / Math.max(1e-9, 1 - cfg.saturationShare));
  return cfg.desirePerFinish * card.treatments.length * saturation;
}

function castDesire(s: SimState, card: Card): number {
  const cfg = s.config;
  const subj = s.ips[card.subjectIp]!;
  // Who is ON the card. This half is never budgeted — a loved character is
  // worth what they are worth, and the budget bounds what the card CONNECTS to.
  const base = subj.affection + subj.resurgence * cfg.affection.resurgenceToModernDemand * 100;

  if (cfg.desire.bonusBudget <= 0) {
    // The legacy additive sum. Every connection term unbounded and independent,
    // which is exactly the shape §2 says stops scaling past four terms. Kept as
    // the default so the restructure lands byte-identical.
    let d = base;
    for (const cid of card.cameos) d += s.ips[cid]!.affection * cfg.value.cameoWeight;
    d += chainDesire(s, card);
    if (cfg.treatments.desirePerFinish !== 0) {
      d += treatmentDesire(s, card, setOfCard(s, card.id));
    }
    return Math.max(1, d);
  }

  // The budgeted bundle. Every signal contributes on every card; only the TOTAL
  // is bounded, so a new mechanic can take share and can never inflate.
  const w = cfg.desire.weights;
  let bundle = 0;
  for (const [k, sig] of Object.entries(desireSignals(s, card))) {
    bundle += (w as Record<string, number>)[k]! * sig;
  }
  return Math.max(1, base + cfg.desire.bonusBudget * bundle);
}

/**
 * Every connection signal a card carries, each normalised to 0..1.
 *
 * Normalisation is what makes the weights comparable, and it is the only place
 * a signal's own scale lives. Four of the eight are 0 because the mechanism
 * behind them is not built — landing a signal at 0 rather than omitting it is
 * the C11 rule, and it means the weight table already shows the whole design.
 */
function desireSignals(s: SimState, card: Card): Record<string, number> {
  const cfg = s.config;
  const unit = (x: number): number => Math.max(0, Math.min(1, x));

  let cameo = 0;
  for (const cid of card.cameos) cameo += s.ips[cid]?.affection ?? 0;

  const links = cfg.chains.maxCountedLinks;
  const progression = card.progressionLink
    ? unit((s.chains[card.progressionLink.chainId]?.cardIds.length ?? 0) / links) : 0;
  const illustration = card.illustrationLink
    ? unit((s.chains[card.illustrationLink]?.cardIds.length ?? 0) / links) : 0;

  return {
    cameo: unit(cameo / Math.max(1, cfg.desire.cameoReference)),
    progression,
    illustration,
    // A finish is a connection to the set's own gimmick. `treatmentDesire`
    // already carries the saturation rule, so this only rescales it.
    treatment: unit(treatmentDesire(s, card, setOfCard(s, card.id))
      / Math.max(1e-9, cfg.treatments.desirePerFinish * 3)),
    relation: 0,
    // A faction lends its members a share of what it has earned. Weight 0 until
    // fitted, and it must stay weaker than a chain or chains stop mattering.
    affiliation: (() => {
      const fac = s.ips[card.subjectIp]?.affiliation;
      if (!fac) return 0;
      return unit((s.ips[fac]?.affection ?? 0) / Math.max(1, cfg.desire.cameoReference));
    })(),
    variantGroup: (() => {
      const link = card.progressionLink?.chainId;
      if (!link || s.chains[link]?.kind !== 'variant') return 0;
      return unit((s.chains[link]?.cardIds.length ?? 0) / links);
    })(),
    community: 0,
  };
}

/**
 * Prices update on a 4-tick rotation rather than every tick. Nothing in the
 * fiction moves weekly anyway, and it is the single biggest cost in a long run.
 */

function tickPrices(s: SimState, printings: Printing[]): void {
  const cfg = s.config;
  const v = cfg.value;
  const scale = audienceScale(s);
  const yearFrac = s.config.strides.price / 52;
  const phase = s.tick % s.config.strides.price;
  // Loop invariants. `heatKeep` in particular is a `Math.pow` with two constant
  // arguments that used to run once per printing per tick.
  const heatKeep = Math.pow(1 - v.heatDecayPerTick, s.config.strides.price);
  const standingRef = v.baseCardPrice * v.nostalgiaStandingReference;
  const shockRate = v.shockChancePerTick * s.config.strides.price;
  const resurgenceChance = v.resurgenceCheckChance * s.config.strides.price;
  const errorDiscoveryChance = cfg.printing.errorDiscoveryChance;
  const writeThreshold = cfg.history.writeThreshold;
  const climate = s.market.climate;
  const crowd = speculatorCrowd(s, printings.length);
  const stride = s.config.strides.price;
  const slowYears = cfg.history.slowLaneAfterYears;
  // Slots spread the slow lane's yearly visits across the year instead of
  // piling every old printing onto one tick, which would trade a flat cost for
  // an annual stall.
  const slowSlots = Math.max(1, Math.round(52 / stride));
  const slowStride = slowSlots * stride;
  for (let i = phase; i < printings.length; i += stride) {
    const pr = printings[i]!;

    // How long since this printing was last priced. On the fast lane it is
    // always exactly `stride`, which is what keeps the lane's arithmetic
    // identical to the arithmetic before it existed.
    let elapsed = stride;
    if (slowYears > 0
      && (s.tick - pr.releaseTick) / 52 > slowYears
      && pr.market.heat <= cfg.history.slowLaneHeatFloor) {
      if (Math.floor(s.tick / stride) % slowSlots !== i % slowSlots) continue;
      const last = pr.market.lastPricedTick;
      elapsed = last === null ? slowStride : Math.max(stride, s.tick - last);
    }
    pr.market.lastPricedTick = s.tick;

    const card = s.cards[pr.cardId]!;
    const artist = s.artists[card.artistId]!;

    const desire = castDesire(s, card);
    // Not every copy is for sale. A slabbed copy has left the raw market for
    // the graded one and a collected copy is not coming back, so scarcity is
    // computed over what is left rather than over everything ever printed.
    // This is the grading feedback loop and the collector floor in one term.
    const surviving = tradeablePopulation(s, pr, gradedTotal(pr));
    // Rarity's price effect flows only through scarcity (print quantity is
    // already rarity-scaled via `rarity.pull` at release) — see CONCEPT.md §5.
    // `rarity.weight` stays out of price; it's a demand-side signal in tickSales.
    // Scale-coupled. `referencePopulation` is calibrated to a year-0 print run,
    // so on a market grown thirty times over it would price every late set as
    // bulk. Dividing the reference by the same scale the runs grew on keeps a
    // set's shape stable while its absolute size moves.
    const scarcity = Math.pow(
      (v.referencePopulation * scale) / surviving, v.scarcityExponent);
    const art = 1 + card.artQuality * artist.reputation * v.artMultiplierWeight;

    // Every rate below is per-visit, so the slow lane has to compound it over
    // the time it actually skipped. When `elapsed === stride` each of these is
    // the same expression it was before the lane existed.
    const keep = elapsed === stride ? heatKeep : Math.pow(1 - v.heatDecayPerTick, elapsed);
    const years = elapsed === stride ? yearFrac : elapsed / 52;
    const lerp = elapsed === stride ? v.priceLerp : 1 - Math.pow(1 - v.priceLerp, elapsed / stride);
    pr.market.heat = Math.min(v.heatCeiling, 1 + (pr.market.heat - 1) * keep);
    // Their own contribution decays on the same clock, so it stays a share of
    // the heat that is still standing rather than a running total.
    pr.market.speculatorHeat *= keep;
    // Speculators amplify what is already moving, in whichever direction it is
    // already moving. They cannot start a run on a printing sitting at 1.
    const before = pr.market.heat;
    pr.market.heat = Math.max(v.heatFloor,
      Math.min(v.heatCeiling, pr.market.heat + speculatorHeatDelta(s, pr, crowd)));
    // Clamped to what the printing actually carries: a push that ran into the
    // ceiling or the floor did not land, and claiming it did would let them pay
    // themselves with a bid the market refused.
    pr.market.speculatorHeat = Math.max(0, Math.min(pr.market.heat - 1,
      pr.market.speculatorHeat + (pr.market.heat - before)));

    // Nostalgia compounds only on a printing the market still wants, and only
    // as fast as it already stands above the pack. A printing nobody wants
    // drifts back toward 1. The old unconditional 5%/year lifted every price
    // together, which set the level far too high and flattened the shape.
    const standing = pr.market.rawPrice / standingRef;
    const gate = Math.min(1, desire / v.nostalgiaDesireReference) * Math.min(1, standing);
    const brand = v.nostalgiaBrandFloor + s.publishers[card.publisherId]!.brandStanding;
    const nostalgiaRate = v.nostalgiaRatePerYear * gate * brand
      - v.nostalgiaDecayPerYear * (1 - gate);
    pr.market.nostalgia = Math.max(v.nostalgiaFloor, Math.min(v.nostalgiaCeiling,
      pr.market.nostalgia * (1 + nostalgiaRate * years)));

    // A visible speculation event. The hidden chase roll weights it, so the
    // cards that spike are the cards the market quietly wanted — CONCEPT.md
    // §5, "random commons should occasionally take off".
    const shockChance = shockRate * (elapsed / stride) * pr.truth.chase
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
      pr.market.heat = Math.min(v.heatCeiling,
        pr.market.heat + v.errorHeatGain / Math.max(v.errorIncidenceFloor, pr.error.incidence));
    }

    const noise = 1 + gauss(s.rng, 0, v.noiseSigma);
    const rawMultiplier = scarcity * (desire / v.desireReference) * art * pr.truth.chase
      * pr.market.heat * pr.market.nostalgia * climate * noise;
    const cappedMultiplier = softCap(rawMultiplier, v.priceCeilingMultiple);
    // What it was printed on. A raw price is the price of a TYPICAL, ungraded
    // copy, and what a typical copy looks like after a few years in circulation
    // depends on the stock it was printed on. This is the quality-to-demand
    // link: before it, print quality reached only the misprint lottery and the
    // grading roll, so it bought a better outcome on the 5.5% of printings that
    // are ever graded and cost up to 2.86x on the entire print bill.
    const quality = cfg.printing.qualityPriceMultiplier[pr.printQuality];
    const target = v.baseCardPrice * cappedMultiplier * quality;

    // Prices are sticky; they drift toward target rather than snapping.
    pr.market.rawPrice = C(pr.market.rawPrice * (1 - lerp)
      + Math.max(v.priceFloorCents, target) * lerp);
    writePoint(pr.market.rawHistory, s.tick, pr.market.rawPrice, writeThreshold);

    // How easily this copy finds a buyer. Live at every weight, because Plan 2
    // needs real staleness data to fit the spread against. Nothing reads it
    // while `actors.buylistWeight` is 0 — see `realisableCardValue`.
    const staleWeeks = pr.market.lastTradeTick === null
      ? Infinity : s.tick - pr.market.lastTradeTick;
    const recency = 1 / (1 + staleWeeks / v.liquidityStaleHalfLifeWeeks);
    // The supply term, and the only one that can push liquidity to nothing: a
    // card sitting in every binder is bulk however much heat the set has.
    // `scarcity` is already the tradeable pool against the reference, so this
    // reuses it rather than measuring the same population twice.
    const liquidityTarget = Math.min(1,
      v.liquidityFromPrice * Math.min(1, pr.market.rawPrice / v.liquidityPriceReference)
      + v.liquidityFromHeat * Math.min(1, (pr.market.heat - 1) / v.liquidityHeatReference)
      + v.liquidityFromRecency * recency)
      * Math.min(1, scarcity);
    pr.market.liquidity = U(Math.max(0, pr.market.liquidity
      + (liquidityTarget - pr.market.liquidity) * v.liquidityLerp));

    // Vintage price growth feeds character resurgence. Every printing seeds
    // at a flat baseCardPrice regardless of rarity (see releaseSet), so the
    // baseline here matches that seed, not a rarity-scaled one.
    const ageYears = (s.tick - pr.releaseTick) / 52;
    if (ageYears > cfg.affection.resurgenceMinAgeYears
      && chance(s.rng, resurgenceChance * (elapsed / stride))) {
      const ip = s.ips[card.subjectIp]!;
      const growth = pr.market.rawPrice / Math.max(1, v.baseCardPrice);
      if (growth > cfg.affection.resurgenceMinGrowth) {
        ip.resurgence = Math.min(1, ip.resurgence
          + cfg.affection.resurgenceFromVintage * cfg.affection.resurgenceGainScale);
        emit(s, 'characterResurgence', false, { ipId: ip.id, printingId: pr.id }, { growth });
      }
    }
  }
}

function tickSealed(s: SimState, products: Product[]): void {
  const cfg = s.config.sealed;
  const yearFrac = s.config.strides.sealed / 52;
  if (s.tick % s.config.strides.sealed !== 0) return;
  // One read for the whole market, as before: it is a market-wide quantity.
  const ripMult = ripMultiplier(s);
  const wanted: Array<{ p: Product; h: Product['market']['hidden']; set: CardSet; units: number }> = [];
  for (const p of products) {
    const h = p.market.hidden;
    if (h.sealedRemaining <= 0) continue;
    const set = s.sets[p.setId]!;
    if (set.status !== 'released') continue;

    // Expected contents value drives sealed price. Recomputed occasionally, and
    // held on the product rather than in a cache beside the engine: between
    // recomputes the price is derived from the stale number, which makes it
    // state. See the field comment in types.ts.
    let contents = h.contentsValue;
    if (s.tick % (s.config.strides.sealed * 6) === 0 || contents === 0) {
      contents = 0;
      for (const cardId of set.cardIds) {
        const pr = s.printings[s.printingByCard[cardId]!];
        // `pr.pullRate`, not the raw rarity table. This is the second half of
        // the Round 4a bug and it survived that fix: the table is copies per
        // pack at `rarity.referenceSetSize`, so at 280 cards it counts four
        // times the cards a pack really holds. `expectedSinglesValue` in
        // actors.ts already reads `pullRate`, so the sealed price and the
        // reseller model disagreed by exactly four times about what a box
        // holds. Ripping was priced off one number and valued off the other.
        if (pr) contents += realisableCardValue(s, pr) * pr.pullRate;
      }
      contents *= p.packsPerUnit;
      h.contentsValue = contents;
    }

    p.market.nostalgia *= 1 + cfg.sealedNostalgiaRatePerYear * yearFrac;
    // Drop chaos is short-lived. `resolveDrop` adds heat when a queue does not
    // clear and `tickScalpers` takes it back out as they dump; this is the
    // decay that stops either from compounding.
    p.market.heat = Math.min(cfg.heatCeiling,
      1 + (p.market.heat - 1) * Math.pow(1 - cfg.heatDecayPerTick, s.config.strides.sealed));
    const scarcity = Math.pow(
      Math.max(1, p.unitsPrinted) / Math.max(1, h.sealedRemaining), cfg.scarcityExponent);
    const target = (contents * cfg.contentsWeight + p.msrp * cfg.msrpWeight)
      * scarcity * p.market.nostalgia * p.market.heat;
    p.market.price = C(p.market.price * (1 - cfg.priceLerp)
      + Math.max(p.msrp * cfg.priceFloorMultiple, target) * cfg.priceLerp);
    writePoint(p.market.history, s.tick, p.market.price, s.config.history.writeThreshold);

    // Ripping destroys sealed supply and adds singles supply. Rising price slows it.
    const priceRatio = p.market.price / Math.max(1, p.msrp);
    // The base rate is the shelf ripping itself open; the multiplier is the
    // rip-and-ship population on top of it. Rising sealed price still slows
    // both — a box worth more unopened stays unopened.
    h.ripRate = Math.min(1, cfg.baseRipRatePerTick * ripMult
      / Math.pow(Math.max(0.3, priceRatio), cfg.ripPriceElasticity));
    // Wanted, not yet opened. The reseller pool has a finite throughput and it
    // is shared across every product on the market, so the split happens after
    // the whole market has asked. See `resellerCapacity`.
    wanted.push({ p, h, set, units: Math.min(h.sealedRemaining, h.sealedRemaining * h.ripRate) });
  }

  // The consumer half of the rate is people opening what they bought, and it is
  // never rationed. The rip-and-ship half above it is a business with a
  // headcount: `actors.ripPerReseller` units per reseller per stride, scaled to
  // the market. This is the only place the reseller population's ABSOLUTE level
  // reaches anything — `ripMultiplier` reads it as a ratio to its own
  // reference, so before this the level could not be fitted against a
  // measurement and the reported population was decoration.
  const consumerShare = ripMult > 0 ? 1 / ripMult : 1;
  let resellerWanted = 0;
  for (const w of wanted) resellerWanted += w.units * (1 - consumerShare);
  const capacity = s.audience.actors.resellers * s.config.actors.ripUnitsPerReseller
    * audienceScale(s) * s.config.strides.sealed;
  // Rationed in proportion, so no product is starved by its position in the
  // array. A market whose print runs have outgrown its reseller pool leaves
  // sealed stock sitting, which is the honest consequence of overprinting.
  const ration = resellerWanted > capacity && resellerWanted > 0
    ? capacity / resellerWanted : 1;
  if (resellerWanted > 0) {
    s.audience.hidden.ripRationSum += ration;
    s.audience.hidden.ripRationSamples++;
  }

  for (const { p, h, set, units } of wanted) {
    const opened = Math.min(h.sealedRemaining,
      units * (consumerShare + (1 - consumerShare) * ration));
    if (opened <= 0) continue;
    h.sealedRemaining -= opened;

    for (const cardId of set.cardIds) {
      const pr = s.printings[s.printingByCard[cardId]!];
      if (!pr) continue;
      // `pr.pullRate`, not the raw rarity table. The table is copies per pack at
      // `rarity.referenceSetSize`, and the printing's own rate is the one that
      // carries the set size. Reading the table here opened four copies for
      // every one a 280-card set printed: `sealed` clamped at zero while
      // `opened` grew without bound, so a printing's population inflated with
      // age and every old card got cheaper supply it never had.
      const pulled = opened * p.packsPerUnit * pr.pullRate;
      pr.population.sealed = Math.max(0, pr.population.sealed - pulled);
      pr.population.opened += pulled;
      // Copies coming out of packs are the trade this printing has. Read by
      // the liquidity term in `tickPrices`; nothing else reads it yet.
      if (pulled > 0) pr.market.lastTradeTick = s.tick;
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

  const homeSegs = segmentsIn(s, s.homeRegionId);
  for (const g of SEGMENTS) {
    const st = homeSegs[g];
    st.goodwill = U(st.goodwill + cfg.prereleaseGoodwillGain * actual);
  }
  lgs.relationship = U(lgs.relationship + cfg.prereleaseRelationshipGain * actual);
  emit(s, 'communitySentiment', true, { setId: set.id, channelId: lgs.id, publisherId: pub.id },
    { kind: 'prerelease', scale: actual, cost, hype: set.hype.level });
}

/**
 * Removes a character nobody has seen.
 *
 * REFUSES if any card names them as its subject or a cameo. A character who
 * has been printed cannot be un-made — the market has met them, the cards are
 * in circulation, and `castDesire` reads the IP live off every one of them.
 * Deleting a referenced IP would leave those cards pointing at nothing.
 *
 * So this is an eraser for a mistake, never a way out of a bad character.
 */
function deleteIp(s: SimState, ipId: IpId): void {
  if (!s.ips[ipId]) return;
  for (const card of Object.values(s.cards)) {
    if (card.subjectIp === ipId) return;
    if (card.cameos.includes(ipId)) return;
  }
  delete s.ips[ipId];
  bumpRoster(s);
}

/**
 * An organised-play event for a set that has already shipped.
 *
 * The counterpart to `hostPrerelease`, and deliberately not the same lever. A
 * prerelease sells a set that has not shipped and its whole payload is hype; an
 * event is run on a set already on the shelf, so it cannot move the launch at
 * all. What it buys is goodwill, a shop relationship, and one promo printing
 * that was never in a pack.
 *
 * CALLED ONLY BY A DECISION. There is no automatic scheduler and there must
 * not be one: an engine-initiated event would fire for every bot in the roster,
 * change every bot's demand pool, and turn every gate in the suite into an
 * event gate.
 *
 * The promo rolls on `s.eventRng`, not the main stream. A system that did not
 * exist when the balance was fitted must not renumber the draws that were.
 */
function hostEvent(s: SimState, setId: SetId, scale: number, budget: Cents): void {
  const set = s.sets[setId];
  if (!set || set.status !== 'released') return;
  const pub = s.publishers[set.publisherId];
  const lgs = s.channels[CHANNEL_IDS.lgs];
  if (!pub || !lgs || !lgs.unlocked) return;
  if (!pub.unlocks.canHostEvents) return;
  if (!pub.unlocks.channels.includes(lgs.id)) return;

  const cfg = s.config.events;
  // Bounded by whichever runs out first: the budget, the cash, or the cap.
  const affordable = Math.min(budget, pub.cash) / Math.max(1, cfg.costPerScale);
  const actual = Math.max(0, Math.min(scale, cfg.maxScale, affordable));
  if (actual <= 0) return;

  const cost = C(actual * cfg.costPerScale);
  pub.cash = C(pub.cash - cost);
  pub.ledger.push({ t: s.tick, amount: C(-cost), category: 'event', note: `event ${set.name}`, refId: set.id });

  const homeSegs = segmentsIn(s, s.homeRegionId);
  for (const g of SEGMENTS) {
    const st = homeSegs[g];
    st.goodwill = U(st.goodwill + cfg.goodwillGain * actual);
  }
  lgs.relationship = U(lgs.relationship + cfg.relationshipGain * actual);

  // One promo, of a card the set already has. The card is picked on the event
  // stream, and `printingByCard` deliberately still points at the pack
  // printing — repointing it would make the set's sealed price track a promo
  // that was never in a box, which is the Round 4a mistake in a new place.
  let promoId: PrintingId | null = null;
  const copies = Math.max(1, Math.round(cfg.promoCopiesPerScale * actual));
  if (set.cardIds.length > 0) {
    const pick = Math.min(set.cardIds.length - 1,
      Math.floor(rand(s.eventRng) * set.cardIds.length));
    const cardId = set.cardIds[pick]!;
    const card = s.cards[cardId];
    if (card) {
      promoId = mintPrinting(s, s.eventRng, {
        cardId, setId: set.id, regionId: s.homeRegionId,
        printQuantity: copies,
        // A promo is handed to a player at the table, not sold in a wrapper.
        sealed: 0, opened: copies,
        // Zero on purpose: a promo is not pulled from a pack, and the two
        // consumers of `pullRate` both ask what a BOX holds.
        pullRate: 0,
        printQuality: set.printQuality,
        isReprintOf: s.printingByCard[cardId] ?? null,
        heat: s.config.events.promoHeat,
      });
    }
  }

  emit(s, 'eventHosted', true, { setId: set.id, channelId: lgs.id, publisherId: pub.id,
    ...(promoId ? { printingId: promoId } : {}) },
    { scale: actual, cost, copies });
}

/**
 * Opens preorders on a set that has not shipped.
 *
 * The cap is the promise. A studio that promises more than it prints has to
 * break the promise at release, and CONCEPT.md's core loop is explicit that
 * the print run cannot move once committed — so over-promising is a real
 * mistake with a real cost rather than a slider.
 */
function openPreorders(s: SimState, setId: SetId, unitsCap: number): void {
  const set = s.sets[setId];
  if (!set || !inRevealWindow(set)) return;
  if (set.preorders) return;
  const cap = Math.max(0, Math.floor(unitsCap));
  if (cap <= 0) return;
  set.preorders = { units: 0, cap, revenue: C(0), openedTick: s.tick, unfilled: 0 };
}

/**
 * Orders arriving during the reveal window.
 *
 * Demand brought forward, never conjured: what converts here is subtracted from
 * the shelf at release, so the studio is selling the same customer earlier
 * rather than finding a new one. That is what keeps preorders from quietly
 * lifting `diff.sellThrough`, which has sat on its ceiling for two rounds.
 *
 * No RNG. `hype.signal` already owns the noisy read of this set, and a second
 * noisy read of the same truth would make `sub.signalRises` unreadable — the
 * whole point of a preorder count is that it is people spending money rather
 * than a measurement.
 */
function tickPreorders(s: SimState, set: CardSet): void {
  const po = set.preorders;
  if (!po || po.units >= po.cap) return;
  const cfg = s.config.preorders;
  if (cfg.conversionRate <= 0) return;

  const release = set.regionSchedule[0]?.releaseTick;
  if (release === undefined) return;
  const window = (release as number) - (po.openedTick as number);
  if (window > 0 && s.tick > (po.openedTick as number) + window * cfg.windowFraction) return;

  // The same audience the shelf will sell to, reached early. Hype pulls orders
  // forward and chase decides how badly they are wanted.
  const { attention, fatigue, goodwill } = audienceAverages(s);
  const reach = engagedTotal(s) * attention * fatigueResponse(s, fatigue) * goodwill;
  const pull = cfg.hypeWeight * (set.hype?.level ?? 0) + cfg.chaseWeight * setChase(s, set);
  const arrivals = Math.floor(reach * cfg.conversionRate * pull);
  if (arrivals <= 0) return;

  const taken = Math.min(arrivals, po.cap - po.units);
  po.units += taken;
  emit(s, 'preordersTaken', false, { setId: set.id, publisherId: set.publisherId },
    { units: taken, total: po.units, cap: po.cap });
}

/**
 * Fills what was promised, out of the stock that was printed.
 *
 * Runs at release, before anything else can sell. Orders come off the channel
 * allocations because that is where stock lives, and what cannot be filled is a
 * broken promise the audience remembers.
 */
function fillPreorders(s: SimState, set: CardSet): void {
  const po = set.preorders;
  if (!po || po.units <= 0) return;
  const pub = s.publishers[set.publisherId];
  if (!pub) return;
  const cfg = s.config.preorders;

  let owed = po.units;
  let revenue = 0;
  for (const pid of set.productIds) {
    if (owed <= 0) break;
    const p = s.products[pid];
    if (!p || p.regionId !== s.homeRegionId) continue;
    for (const a of Object.values(p.allocations)) {
      if (owed <= 0) break;
      const take = Math.min(owed, a.unitsRemaining);
      if (take <= 0) continue;
      a.unitsRemaining -= take;
      p.unitsRemaining = Math.max(0, p.unitsRemaining - take);
      p.market.hidden.sealedRemaining = Math.max(0, p.market.hidden.sealedRemaining - take);
      owed -= take;
      revenue += take * p.msrp * cfg.marginShare * qualityRevenue(s, p);
    }
  }

  const filled = po.units - owed;
  po.unfilled = owed;
  po.revenue = C(revenue);
  if (revenue > 0) {
    pub.cash = C(pub.cash + revenue);
    pub.ledger.push({ t: s.tick, amount: C(revenue), category: 'sales', note: `preorder ${set.name}`, refId: set.id });
    if (set.performance) {
      set.performance.revenue = C(set.performance.revenue + revenue);
      set.performance.unitsSold += filled;
    }
    accrueCollabRoyalty(s, set, revenue);
    // The same credit a shelf sale gives, so anything reading recent units sees
    // a preorder as the sale it is. It was added expecting it to remove the
    // sell-through lift below, and MEASURED NOT TO: 0.9755 before, 0.9758
    // after. `recentUnitsByRegion` feeds acquisition, not the demand pool. It
    // is kept because the consistency is right, not because it fixes anything.
    creditUnitsSold(s, s.homeRegionId, filled);
  }

  // A promise the studio could not keep. This is the downside that makes the
  // cap a decision rather than a free number to maximise.
  if (owed > 0) {
    const segs = segmentsIn(s, s.homeRegionId);
    for (const g of SEGMENTS) {
      const st = segs[g];
      st.goodwill = U(Math.max(0, st.goodwill - cfg.goodwillPerUnfilled * owed));
    }
    if (set.performance) set.performance.goodwillDelta -= cfg.goodwillPerUnfilled * owed;
  }
  emit(s, 'preordersFilled', true, { setId: set.id, publisherId: set.publisherId },
    { filled, unfilled: owed, revenue });
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
  const pull = card ? s.config.rarity.weight[card.rarity] / s.config.rarity.weightDivisor : 1;
  h.revealHype += cfg.revealHypePerCard * pull / (1 + h.revealHype / cfg.revealHalfLife);
  recomputeHype(s, set);

  // Previews are not free. They spend the same finite attention a release does,
  // so a long campaign into a tired audience is waste.
  const revealSegs = segmentsIn(s, s.homeRegionId);
  for (const g of SEGMENTS) {
    const st = revealSegs[g];
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

function audienceAverages(s: SimState, regionId: RegionId = s.homeRegionId): AudienceAverages {
  let attention = 0, fatigue = 0, goodwill = 0;
  const segs = segmentsIn(s, regionId);
  for (const g of SEGMENTS) {
    const st = segs[g];
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
    total += castDesire(s, card) * s.config.rarity.weight[card.rarity] / s.config.rarity.chaseWeightDivisor;
  }
  return total / Math.max(1, set.cardIds.length);
}

/**
 * What a box is worth to open, against what it costs.
 *
 * Reads `SealedMarket.hidden.contentsValue`, which the sealed pass already
 * computes and holds deliberately stale — so this costs nothing and, more
 * importantly, both consumers of "what a box holds" go on reading the SAME
 * number. C9 forced `expectedSinglesValue` and the sealed-contents loop to move
 * together after Round 4a caught them disagreeing by four times; a third
 * consumer with its own copy would undo that.
 *
 * Hidden means hidden from the PLAYER, not from the model. What a box is worth
 * to open is public knowledge in any real hobby — people publish the maths —
 * so the engine is entitled to it, and `docs/screens-audit.md` rule 1 still
 * forbids putting it on a screen.
 *
 * The response is self-correcting, which is why it is safe: demand raises
 * sales, sales open packs, opened packs add singles supply, supply lowers
 * singles prices, and the term comes back down.
 */
/**
 * What the studio actually realises per unit, given what it printed on.
 *
 * The publisher's take was `sold x msrp x marginShare` and nothing else, so a
 * budget box wholesaled for exactly what an archival one did and the cheap tier
 * was free money. This is the per-unit penalty a strategy cannot dodge by
 * printing fewer boxes.
 */
/**
 * Whether the audience can afford this, given what a pack costs here.
 *
 * The price term the model did not have. `setFit` compared a region's
 * `priceTolerance` against nothing at all, and the channel price response asks
 * only whether a SHOP is marking up over MSRP — which street price tracks, so
 * raising MSRP moved neither. Price was free.
 *
 * Measured per pack, so a bigger box is not punished for holding more, and
 * scaled by the region's own tolerance: a market that bears 0.6 of what the
 * home market pays walks away from a home-priced box.
 */
function affordability(s: SimState, p: Product): number {
  const cfg = s.config.region;
  if (cfg.affordabilityElasticity === 0) return 1;
  const region = s.regions[p.regionId];
  const tolerated = cfg.referencePackPrice * (region ? region.truth.priceTolerance : 1);
  const perPack = p.msrp / Math.max(1, p.packsPerUnit);
  if (perPack <= 0) return 1;
  return Math.max(cfg.affordabilityFloor,
    Math.min(1, Math.pow(tolerated / perPack, cfg.affordabilityElasticity)));
}

function qualityRevenue(s: SimState, p: Product): number {
  const set = s.sets[p.setId];
  return s.config.printing.qualityRevenueMultiplier[set ? set.printQuality : 'standard'];
}

function boxValueTerm(s: SimState, p: Product): number {
  const cfg = s.config.attention;
  if (cfg.boxValueWeight === 0) return 1;
  const contents = p.market.hidden.contentsValue;
  // Before the first sealed stride there is no reading yet, and a set nobody
  // has priced must not be punished for it.
  if (contents <= 0) return 1;
  const ratio = contents / Math.max(1, p.msrp);
  return Math.max(cfg.boxValueFloor, Math.min(cfg.boxValueCeiling,
    Math.pow(ratio / Math.max(1e-9, cfg.boxValueReference), cfg.boxValueWeight)));
}

/**
 * One product's share of the demand its region has for its set.
 *
 * Two SKUs of the same set in the same region compete for one audience, so
 * they split it by print run. Two SKUs in different regions do not — each
 * region brings its own buyers, and that is what makes opening one worth the
 * fee. Returns 1 for the only product in its region.
 */
function productShareOfRegion(s: SimState, set: CardSet, p: Product): number {
  let inRegion = 0;
  for (const pid of set.productIds) {
    const other = s.products[pid];
    if (other && other.regionId === p.regionId) inRegion += other.unitsPrinted;
  }
  return inRegion > 0 ? p.unitsPrinted / inRegion : 1;
}

function tickSales(s: SimState, products: Product[]): void {
  const cfg = s.config;
  // Audience state does not move inside this pass, and `setChase` walks every
  // card in a set — so both are computed once per tick rather than once per
  // product. Two products off one set used to pay for the same walk twice.
  // Audience state is per region now, so it is cached per region rather than
  // computed once per tick: a market that is tired is tired on its own.
  const byRegion = new Map<RegionId, {
    attention: number; fatigueTerm: number; goodwillTerm: number;
  }>();
  const regionState = (rid: RegionId) => {
    let v = byRegion.get(rid);
    if (!v) {
      const a = audienceAverages(s, rid);
      v = {
        attention: a.attention,
        fatigueTerm: fatigueResponse(s, a.fatigue),
        goodwillTerm: cfg.attention.goodwillDemandFloor
          + (1 - cfg.attention.goodwillDemandFloor) * a.goodwill,
      };
      byRegion.set(rid, v);
    }
    return v;
  };
  const chaseBySet = new Map<SetId, number>();
  const audienceBySet = new Map<string, number>();
  for (const p of products) {
    if (p.unitsRemaining <= 0) continue;
    const set = s.sets[p.setId]!;
    if (set.status !== 'released') continue;
    // A set ships region by region. A product cannot sell before its own
    // region's date, which is what makes a staggered release a preview rather
    // than a formality.
    const sched = set.regionSchedule.find(r => r.regionId === p.regionId);
    if (!sched || s.tick < sched.releaseTick) continue;
    const pub = s.publishers[set.publisherId]!;

    const allocs = Object.entries(p.allocations) as Array<[ChannelId, ChannelAllocation]>;
    if (allocs.length === 0) continue;

    let chase = chaseBySet.get(set.id);
    if (chase === undefined) {
      chase = setChase(s, set);
      chaseBySet.set(set.id, chase);
    }

    // Decay runs from this region's own release, not from the set's first one:
    // a market that opened two years later has not had two years to go cold.
    const weeksOut = (s.tick - sched.releaseTick) / 52;
    const decay = Math.exp(-weeksOut * cfg.attention.demandDecayPerYear);
    // What this region is worth, and how much of it this set forfeits by not
    // suiting it. A region with no opinion and average wealth lands on 1.
    const region = s.regions[p.regionId];
    const regionFactor = region ? regionDemandFactor(s, region, set, p) : 1;
    // The demand pool is what the audience wants this week, independent of who
    // is selling it. The channels then compete for it.
    // Hype multiplies the demand the set would have had. It cannot conjure
    // demand for a set nobody wants: a zero-chase set times any campaign is
    // still nearly zero.
    // Demand is a property of the audience and the set. It used to be
    // `p.unitsPrinted * 0.06`, which made it a property of the print run —
    // print more and more buyers appeared. That single term is why sell-through
    // sat at 0.97 for every strategy, why the blind bet had no downside, and
    // why every demand-side lever in the game bought nothing measurable: there
    // was never any unmet demand for hype, a collab or a region to reach.
    //
    // The reference run and the reference audience are set so that a
    // reference-sized run into the starting audience behaves exactly as it did
    // before, and anything larger no longer conjures its own buyers.
    // The engaged audience of THIS region, weighted by how much each segment
    // wants this set. Two fields that were seeded and never read now decide it:
    // `Region.truth.segmentMix` split the people, and `IpEntity.truth.affinities`
    // says which of them care. A set can suit one market and miss another.
    const audKey = `${set.id}:${p.regionId}`;
    let weightedAudience = audienceBySet.get(audKey);
    if (weightedAudience === undefined) {
      const segs = segmentsIn(s, p.regionId);
      weightedAudience = 0;
      for (const g of SEGMENTS) {
        weightedAudience += segs[g].engaged * 2 * segmentAffinity(s, set.id, g);
      }
      audienceBySet.set(audKey, weightedAudience);
    }
    const regionScale = weightedAudience / cfg.attention.referenceAudience;
    const { attention, fatigueTerm, goodwillTerm } = regionState(p.regionId);
    // Several products in one region split that region's demand rather than
    // each collecting all of it. Across regions they do not: a second market is
    // its own audience, which is the entire reason to open one.
    const regionShare = productShareOfRegion(s, set, p);
    const pool = cfg.attention.referenceRunUnits * regionShare * regionScale
      * cfg.attention.demandCoefficient * attention * fatigueTerm
      * goodwillTerm * (cfg.attention.brandDemandFloor + pub.brandStanding)
      * (cfg.attention.chaseDemandFloor + chase) * decay
      * (1 + (set.hype?.level ?? 0)) * regionFactor * collabDemandFactor(s, set)
      * boxValueTerm(s, p) * affordability(s, p);
    // Below half a unit every channel's share rounds to zero, so the rest of
    // this pass cannot sell anything. Old sets sit here for decades: `decay` is
    // e^(-1.4 * years), so a five-year-old set is already three zeroes down.
    if (pool < cfg.attention.demandCutoff) continue;

    // Reach, relationship, and what the channel is actually charging. A store
    // marking product up above MSRP moves less of it.
    const weights: number[] = [];
    let totalWeight = 0;
    for (const [cid, a] of allocs) {
      const ch = s.channels[cid];
      if (!ch || a.unitsRemaining <= 0) { weights.push(0); continue; }
      const traits = traitsFor(s, ch);
      const priceResponse = Math.pow(p.msrp / Math.max(1, a.streetPrice), traits.priceElasticity);
      const relFloor = cfg.channels.demandRelationshipFloor;
      const w = a.unitsRemaining * traits.reach
        * (relFloor + (1 - relFloor) * ch.relationship) * priceResponse;
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
      creditUnitsSold(s, p.regionId, sold);

      // The publisher is paid on MSRP, never on street price. A store that marks
      // up hot product keeps that upside — CONCEPT.md §4.
      revenue += sold * p.msrp * ch.marginShare * qualityRevenue(s, p);

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
    accrueCollabRoyalty(s, set, revenue);

    // `aftermarketIndex` is the set-health number CONCEPT.md §8 asks for, and
    // it was written as 0 and read by nothing. It is refreshed here rather than
    // in `tickPrices` because it is a per-set summary of prices, not a price.
    if (set.performance) set.performance.aftermarketIndex = aftermarketIndex(s, set);

    // Selling builds exposure, which is what lets affection converge. A collab
    // set returns only a share of it: the licensor's audience came for the
    // licensor, so the reach is rented rather than bought. This is the whole
    // cost of a collab beyond its fee, and it is the reason a studio cannot
    // simply license its way to a brand.
    const exposureShare = set.collabId ? s.config.collabs.exposureShare : 1;
    for (const cid of set.cardIds) {
      const ip = s.ips[s.cards[cid]!.subjectIp];
      if (ip) ip.exposure += soldTotal * exposureShare
        / (cfg.affection.unitsPerExposurePoint * audienceScale(s));
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

  const p = s.products[drop.productId];
  const ch = s.channels[drop.channelId];
  const set = p ? s.sets[p.setId] : undefined;
  // A drop on a set that has not shipped yet WAITS. It is not void.
  //
  // This is the difference between "not yet" and "never", and the two used to
  // be the same branch. Channel allocation locks with the print run, 18 weeks
  // before release, so a player who queues a drop the moment they have stock
  // was queueing it against an unreleased set — `status = 'complete'` was set
  // on the first line, the set-status check returned, and the drop was
  // silently gone: no sale, no event, no feedback, and the store's own cadence
  // ran instead. Measured on `dropRunner`, whose entire strategy is scheduling
  // drops: 40 scheduled over 20 years, 40 voided, and every drop the harness
  // ever saw was one the store scheduled for it.
  if (set && set.status !== 'released') return;

  drop.status = 'complete';
  if (!p || !ch || !ch.unlocked) return;
  const a = p.allocations[ch.id];
  if (!a || !set) return;
  const pub = s.publishers[set.publisherId];
  if (!pub) return;

  // The store can only put up what it holds, and only as much as it can push
  // through in one drop. `queueCapacity` is what makes a drop a drop.
  const capacity = ch.queueCapacity ?? a.unitsRemaining;
  const offered = Math.min(drop.offered, a.unitsRemaining, capacity);
  if (offered <= 0) return;

  const { attention, fatigue, goodwill } = audienceAverages(s);
  const weeksOut = (s.tick - set.regionSchedule[0]!.releaseTick) / 52;
  const decay = Math.exp(-weeksOut * s.config.attention.demandDecayPerYear);
  const traits = traitsFor(s, ch);

  // Same forces as a shelf sale, concentrated into one moment.
  const collectorDemand = s.audience.actors.collectors * cfg.collectorReach
    * attention * fatigueResponse(s, fatigue)
    * (s.config.attention.goodwillDemandFloor
       + (1 - s.config.attention.goodwillDemandFloor) * goodwill)
    * (s.config.attention.brandDemandFloor + pub.brandStanding)
    * (s.config.attention.chaseDemandFloor + setChase(s, set))
    * decay * traits.reach * (1 + (set.hype?.level ?? 0));

  // Scalpers price off the sealed market, which is one public number, and off
  // the queue in front of them, which is the other. A fresh product's market
  // price opens at MSRP by construction, so the premium alone can never make a
  // release-day drop worth camping - and a release-day drop is the only kind
  // anybody camps. The shortage is what they can see on the day.
  const premium = p.market.price / Math.max(1, p.msrp) - 1;
  const expectedShortage = Math.max(0, collectorDemand / offered - 1);
  const expected = premium
    + cfg.shortagePremiumWeight * Math.min(cfg.shortagePremiumCap, expectedShortage);
  const appetite = Math.max(0, Math.min(1,
    (expected - cfg.breakEvenPremium) / Math.max(0.05, cfg.breakEvenPremium)));
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
    soldToScalpers: toScalpers, soldOut: sold >= offered,
  };

  if (sold > 0) {
    a.unitsRemaining -= sold;
    creditUnitsSold(s, p.regionId, sold);
    p.unitsRemaining = Math.max(0, p.unitsRemaining - sold);

    // Full margin. The direct store is the point of owning one.
    const revenue = sold * p.msrp * ch.marginShare * qualityRevenue(s, p);
    pub.cash = C(pub.cash + revenue);
    pub.ledger.push({ t: s.tick, amount: C(revenue), category: 'sales', note: `drop ${p.kind}`, refId: p.id });
    if (set.performance) set.performance.revenue = C(set.performance.revenue + revenue);
    accrueCollabRoyalty(s, set, revenue);

    // Same rent as the shelf path: a collab set returns only a share of the
    // exposure. A drop is a different counter, not a different deal.
    const exposureShare = set.collabId ? s.config.collabs.exposureShare : 1;
    for (const cid of set.cardIds) {
      const ip = s.ips[s.cards[cid]!.subjectIp];
      if (ip) ip.exposure += sold * exposureShare
        / (s.config.affection.unitsPerExposurePoint * audienceScale(s));
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
  const dropSegs = segmentsIn(s, p.regionId);
  for (const g of SEGMENTS) {
    const st = dropSegs[g];
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
      // `automatic` was written onto the drop and read by nothing. It is the
      // attribution `sub.scalperShare` has wanted since Round 5: a drop the
      // player scheduled and a drop the store ran on its own cadence are
      // different events. Drops are pruned as feed history in `tickCompaction`,
      // so the harness reads this here or not at all.
      automatic: drop.automatic ? 1 : 0,
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

/**
 * The other half of the loop. Scalpers resell what they bought, and what they
 * earn doing it decides how many of them show up to the next drop. Dumping
 * stock closes the premium that drew them, so the population is self-limiting
 * rather than a one-way ratchet.
 */
function tickScalpers(s: SimState, products: Product[]): void {
  if (s.tick % s.config.strides.scalper !== 0) return;
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
    // NOT scale-coupled: this is already a per-scalper quantity, so scaling it
    // made every scalper need a bigger market to be worth the same, and the
    // population stopped cycling entirely. The caps below carry the scale.
    const crowding = Math.min(1, perCapita / cfg.unitsPerScalperReference);
    const avg = (realized / realizedUnits) * crowding;
    hidden.scalperProfitability += (avg - hidden.scalperProfitability) * cfg.profitabilitySmoothing;
  } else {
    // Holding no stock is not a profit. With nothing to flip the trade decays
    // back toward break-even and the population drifts off.
    hidden.scalperProfitability *= (1 - cfg.profitabilitySmoothing);
  }

  const edge = hidden.scalperProfitability - cfg.breakEvenPremium;
  // The caps carry the market's scale: a market thirty times larger supports
  // thirty times the resellers.
  const popScale = audienceScale(s);
  s.audience.actors.scalpers = Math.max(cfg.minScalpers * popScale,
    Math.min(cfg.maxScalpers * popScale,
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
  if (s.tick % s.config.strides.channel !== 0) return;
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
      const traits = traitsFor(s, ch);

      const moved = a.units - a.unitsRemaining;
      const pressure = a.units > 0 ? moved / a.units : 0;

      if (a.unitsRemaining > 0) {
        const target = p.msrp
          * (1 + traits.markupSensitivity * pressure - traits.discountFloor * (1 - pressure) * staleness);
        a.streetPrice = C(Math.max(p.msrp * cfg.streetPriceFloorMultiple,
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
    const traits = traitsFor(s, ch);

    if (acc && acc.held > 0) {
      const rate = acc.moved / acc.held;
      if (rate >= cfg.sellThroughTarget) {
        ch.relationship = U(ch.relationship + cfg.relationshipGainPerSellThrough * (rate - cfg.sellThroughTarget + 0.2));
        // Selling through your channels is what pays the goodwill back.
        const gain = traits.goodwillPerSellThrough * rate;
        const chSegs = segmentsIn(s, ch.regionId);
        for (const g of SEGMENTS) {
          const st = chSegs[g];
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
  for (const segs of Object.values(s.audience.regions)) {
  for (const g of SEGMENTS) {
    const st = segs[g];
    st.attention = Math.min(1, st.attention + cfg.regenPerTick);
    // Proportional, not a flat subtraction. A constant decay makes fatigue
    // bimodal: below the break-even cadence it saturates, above it sits at
    // zero, and nothing lands in between. Decaying a share of what is there
    // gives every cadence its own equilibrium, which is what lets the response
    // curve discriminate at all.
    st.fatigue = Math.max(0, st.fatigue * (1 - cfg.fatigueDecay));
    // Long-memory trust. Deliberately much slower than fatigue recovery —
    // flood damage should stay felt long after attention has refilled.
    // Drifts toward indifference, not toward affection. Sustained goodwill has
    // to be earned every year; it does not accumulate into a permanent asset.
    st.goodwill = Math.max(0, Math.min(1,
      st.goodwill + cfg.goodwillRegenPerTick * (cfg.goodwillBaseline - st.goodwill)));
  }
  }

  // The population, cohort and engagement loop. It reads `market.climate`, so
  // it runs after the climate walk below would be wrong — see `tick`.
  tickAudienceSystem(s);
  // Fatigue is now the sharpest penalty in the model, so the player has to be
  // able to see it coming. `fatigueWarning` was declared and never emitted.
  const fatigueAvg = globalAverages(s).fatigue;
  const warn = fatigueAvg >= cfg.fatigueWarnThreshold;
  if (warn !== s.audience.fatigueWarned) {
    s.audience.fatigueWarned = warn;
    if (warn) {
      emit(s, 'fatigueWarning', true, { publisherId: s.playerId }, { fatigue: fatigueAvg });
    }
  }

  const mk = s.config.market;
  s.market.climate = Math.max(mk.climateFloor, Math.min(mk.climateCeiling,
    s.market.climate + gauss(s.rng, 0, mk.climateNoiseSigma)
    + (1 - s.market.climate) * mk.climateReversion));
  writePoint(s.market.climateHistory, s.tick, s.market.climate, mk.climateWriteThreshold);
}

/**
 * Unsold stock above which a death reads as an overprint rather than a debt
 * spiral.
 *
 * Measured against the studio's own recent print volume, not an absolute count.
 * An absolute threshold has to be scale-coupled to stay meaningful, and once it
 * was, a late-game studio never crossed it and every death classified as
 * `debt_spiral` — `channel_collapse` stopped firing altogether.
 */
function overprintUnitsThreshold(s: SimState): number {
  let printed = 0;
  let runs = 0;
  for (const p of Object.values(s.products)) {
    if (p.unitsPrinted > 0) { printed += p.unitsPrinted; runs++; }
  }
  const meanRun = runs > 0 ? printed / runs : 0;
  return Math.max(s.config.finance.overprintDeathUnits, meanRun * 2.5);
}

/**
 * What the bank will lend this publisher, in total, right now.
 *
 * Extracted from `tickFinance` so two callers can share it: the automatic
 * overdraft that fires when cash goes negative, and `api.borrow`, which had no
 * ceiling of its own and would happily have lent past it.
 *
 * **Pure, and it draws nothing.** The ledger screen renders this every repaint,
 * and screens-audit rule 2 says reading the world must not change it.
 */
export function borrowCeiling(s: SimState, pub: Publisher): number {
  const cfg = s.config.finance;
  // What the studio has sold lately, annualised. The ledger is append-only and
  // ordered, so this walks back from the end and stops at the window edge
  // rather than reading thirty years of entries every tick.
  let recent = 0;
  const from = s.tick - cfg.borrowCeilingRevenueWeeks;
  for (let i = pub.ledger.length - 1; i >= 0; i--) {
    const e = pub.ledger[i]!;
    if (e.t < from) break;
    if (e.category === 'sales') recent += e.amount;
  }
  const annualised = recent * (52 / Math.max(1, cfg.borrowCeilingRevenueWeeks));
  // A lender lends against the business. A studio with no sales gets the floor
  // and nothing more, which is what stops "do nothing" being funded by the bank
  // for four years after the cash runs out.
  const lendable = s.tick < cfg.borrowCeilingGraceTicks ? 1
    : cfg.borrowCeilingIdleFloor + (1 - cfg.borrowCeilingIdleFloor)
      * Math.min(1, annualised / Math.max(1, cfg.borrowCeilingRevenueReference));
  return cfg.borrowCeilingBase * cfg.borrowCeilingMultiple
    * (0.3 + pub.credit) * lendable;
}

function tickFinance(s: SimState): void {
  const cfg = s.config.finance;
  const pub = s.publishers[s.playerId]!;
  if (pub.deadTick !== null) return;

  // The standing bill. Overhead is what the studio costs to exist, and it grows
  // with the reach it has bought: every channel is a relationship somebody
  // manages, and every region past the home market is an office. Storage is
  // what unsold stock costs to keep, which is the line that turns an overprint
  // from capital locked up into capital bleeding.
  const pubChannels = pub.unlocks.channels.length;
  const abroad = Math.max(0, pub.unlocks.regions.length - 1);
  // The bill follows the market, sub-linearly. A studio selling into a market
  // 25 times the size it started in does not run on the same payroll, and a
  // flat bill stops being a bill: it falls from about a third of revenue in
  // year 1 to 1.9% by year 50, and takes the standing pressure behind three
  // death routes with it. The exponent is what decides how much of the growth
  // the bill follows — see the config note.
  const overhead = Math.round((cfg.weeklyOverheadBase
    + cfg.weeklyOverheadPerChannel * pubChannels
    + cfg.weeklyOverheadPerRegion * abroad)
    * Math.max(1, Math.pow(audienceScale(s) / Math.max(0.01, cfg.overheadReferenceScale),
      cfg.overheadAudienceExponent)));
  pub.cash = C(pub.cash - overhead);
  pub.ledger.push({ t: s.tick, amount: C(-overhead), category: 'overhead', note: 'studio' });

  // The two unlock tiers that are hires rather than purchases. A community team
  // and an analytics desk are people, and people are paid every week — without
  // this, a tier is a one-off price for a permanent benefit, there is never a
  // reason not to buy every level the moment it is affordable, and the roster
  // finds that degenerate optimum immediately. Zero for a studio that has
  // bought neither, which is every studio until a bot asks for one.
  const uCfg = s.config.unlocks;
  const staff = Math.round(pub.unlocks.communityTeam * uCfg.communityTeamUpkeepPerTick
    + pub.unlocks.analytics * uCfg.analyticsUpkeepPerTick);
  if (staff > 0) {
    pub.cash = C(pub.cash - staff);
    pub.ledger.push({ t: s.tick, amount: C(-staff), category: 'staff', note: 'community and analytics' });
  }

  // Storage is charged per unit, and stock that has sat past the surcharge age
  // is charged at a multiple of it. The cliff is the point: a normal tail sells
  // through inside the window and never meets it, so the surcharge only ever
  // bills the publisher who printed more than the market wanted. Without it,
  // the growth arc makes cash plentiful enough that a flat per-unit rate stops
  // being able to kill anybody, and `overprint` dies as a death route.
  let unsold = 0;
  let storage = 0;
  for (const p of Object.values(s.products)) {
    if (p.unitsRemaining <= 0) continue;
    unsold += p.unitsRemaining;
    const aged = p.printedTick !== null
      && s.tick - p.printedTick > cfg.storageSurchargeAfterTicks;
    storage += p.unitsRemaining * cfg.storagePerUnitPerTick
      * (aged ? cfg.storageSurchargeMultiple : 1);
  }
  storage = Math.round(storage);
  if (storage > 0) {
    pub.cash = C(pub.cash - storage);
    pub.ledger.push({ t: s.tick, amount: C(-storage), category: 'storage', note: `${Math.round(unsold)} units` });
  }

  if (s.tick % s.config.strides.interest === 0) {
    const periods = 52 / s.config.strides.interest;
    const rate = (cfg.interestBase - pub.credit * cfg.creditToRate) / periods;
    const interest = pub.debt * rate;
    pub.cash = C(pub.cash - interest);
    if (interest > 0) pub.ledger.push({ t: s.tick, amount: C(-interest), category: 'interest', note: 'debt service' });
  }

  const ceiling = borrowCeiling(s, pub);
  if (pub.cash < 0) {
    const need = -pub.cash;
    if (pub.debt + need <= ceiling) {
      pub.cash = C(0); pub.debt = C(pub.debt + need);
      emit(s, 'debtWarning', true, { publisherId: pub.id }, { debt: pub.debt });
    } else {
      pub.deadTick = s.tick;
      // Dying on unsold stock is overprint death by default. It is only
      // `channel_collapse` if the channels actually went away — a publisher that
      // never had the reach in the first place simply printed too much.
      const lostAChannel = s.events.some(
        e => e.kind === 'channelLost' && (e.refs.publisherId ?? pub.id) === pub.id,
      );
      // Attention death is its own thing and was never classified, so it could
      // not be reported however often it happened. It is the publisher whose
      // stock did not sell because the audience had stopped caring rather than
      // because there was too much of it: fatigue saturated and attention
      // spent. Checked before the stock test, because a flooded audience also
      // leaves a warehouse behind and the warehouse is the symptom.
      const avgs = globalAverages(s);
      const fatigueAvg = avgs.fatigue;
      const attentionAvg = avgs.attention;
      const cfgA = s.config.attention;
      pub.deathCause =
        (fatigueAvg >= cfgA.deathFatigueThreshold && attentionAvg <= cfgA.deathAttentionThreshold)
          ? 'attention_collapse'
        : unsold > overprintUnitsThreshold(s)
          ? (lostAChannel ? 'channel_collapse' : 'overprint')
          : 'debt_spiral';
      emit(s, 'studioDead', true, { publisherId: pub.id }, { cause: pub.deathCause, tick: s.tick });
    }
  }
  if (pub.debt > pub.peakDebt) pub.peakDebt = pub.debt;
  pub.credit = U(pub.credit
    + (pub.cash > 0 ? cfg.creditGainPerTick : -cfg.creditLossPerTick));

  // brandStanding mean-reverts toward a target driven by average affection and
  // goodwill, rather than accumulating without limit — that's what was pinning
  // it at 1.0 for any publisher that survived long enough to build affection.
  const ipsArr = Object.values(s.ips);
  const affectionAvg = ipsArr.length ? ipsArr.reduce((n, ip) => n + ip.affection, 0) / ipsArr.length : 0;
  const goodwillAvg = globalAverages(s).goodwill;
  const brandTarget = U(cfg.brandBase
    + cfg.brandFromAffection * (affectionAvg / cfg.brandAffectionReference)
    + cfg.brandFromGoodwill * goodwillAvg);
  pub.brandStanding = U(pub.brandStanding + (brandTarget - pub.brandStanding) * cfg.brandConvergenceRate);
}

function tickArtists(s: SimState): void {
  const ca = s.config.art;
  for (const a of Object.values(s.artists)) {
    a.reputation = U(a.reputation
      + a.growth * (ca.reputationGrowthFloor + rand(s.rng) * ca.reputationGrowthRange));
    // The trajectory CONCEPT.md §8's artist roster asks for. Display only: the
    // value engine goes on reading `reputation` live.
    writePoint(a.reputationHistory, s.tick, a.reputation, s.config.history.writeThreshold);
    if (a.reputation > ca.retireReputationThreshold && chance(s.rng, ca.retireAtPeakChance)) {
      emit(s, 'artistBreakout', true, { artistId: a.id }, { reputation: a.reputation });
    }
  }
}

// ---------------------------------------------------------------------------
// The art pipeline (CONCEPT.md §2, §6.3)
// ---------------------------------------------------------------------------

/**
 * Art is the step of the core loop that was declared and never simulated. The
 * reward half already existed — `artQuality * artist.reputation` multiplies
 * every price, and `Artist.growth` compounds a career in the dark — so the only
 * thing missing was the half where it costs something.
 *
 * A commission is money now for art later: the fee leaves at placement and the
 * illustration comes back `turnaroundWeeks` afterwards, which is what forces
 * art to start before `commitPrintRun` rather than after it. A card whose art
 * has not landed by release ships as house art at the quality floor. That is
 * the cost of missing the calendar, and it is deliberately a cost rather than a
 * block: a late brief must never be able to strand a release.
 *
 * Rolls come from `s.artRng`. Art is NOT an observer of the value engine the
 * way grading is — quality feeds price directly, so this pass moves the value
 * targets no matter what — but keeping the stream separate means the movement
 * is attributable to the art multiplier instead of to renumbered noise.
 */

/** The mean of the three stats that decide how good the picture is. */
function artistCraft(a: Artist): number {
  return (a.stats.linework + a.stats.color + a.stats.composition) / 3;
}

/**
 * Whether an artist will take this brief at all. Relationship is what you build
 * by working with someone; brand standing is what gets a stranger to answer.
 * A retainer or an exclusive skips the question — that is what it bought.
 */
function artistWillAccept(s: SimState, a: Artist, pub: Publisher): boolean {
  if (!a.available) return false;
  if (a.exclusiveTo !== null && a.exclusiveTo !== pub.id) return false;
  if (pub.retainers[a.id]) return true;
  const cfg = s.config.art;
  const standing = a.relationship + pub.brandStanding * cfg.brandStandingOffsetsRelationship;
  return standing >= cfg.minRelationshipToAccept;
}

/** What this brief costs, before the artist has done anything. */
function commissionFee(s: SimState, a: Artist, pub: Publisher, brief: ArtBrief): Cents {
  const cfg = s.config.art;
  const held = pub.retainers[a.id];
  const discount = held?.terms === 'exclusive' ? cfg.exclusiveFeeDiscount
    : held?.terms === 'retainer' ? cfg.retainerFeeDiscount
    : 0;
  return C(Math.max(1, brief.budget * (1 - discount)));
}

function placeCommission(s: SimState, cardId: CardId, artistId: ArtistId, brief: ArtBrief): void {
  const card = s.cards[cardId];
  const artist = s.artists[artistId];
  if (!card || !artist) return;
  const pub = s.publishers[card.publisherId];
  if (!pub) return;
  // One live commission per card. Without this guard a caller that submits
  // every tick pays for the same illustration a hundred times.
  if (card.artSource !== 'pending') return;
  if (s.market.commissionQueue.some(c => c.cardId === cardId)) return;
  if (!artistWillAccept(s, artist, pub)) return;

  const cfg = s.config.art;
  const fee = commissionFee(s, artist, pub, brief);
  if (pub.cash < fee) return;

  // Speed sets the pace; unreliability is the tail that ruins a schedule.
  const pace = cfg.slowestTurnaround
    - (cfg.slowestTurnaround - cfg.fastestTurnaround) * artist.stats.speed;
  // The tail is exponential, not uniform. An unreliable artist does not run a
  // predictable 20% late — they go quiet for a month and the set ships without
  // them. A uniform slip can never cross the 18 weeks between commit and
  // release, which would make the schedule decorative.
  const lateScale = cfg.maxLateWeeks * (1 - artist.stats.reliability);
  const late = Math.min(
    Math.round(lateScale * 3),
    Math.round(lateScale * -Math.log(1 - rand(s.artRng))),
  );
  const weeks = Math.max(1, Math.round(artist.turnaroundWeeks * pace) + late);

  pub.cash = C(pub.cash - fee);
  pub.ledger.push({ t: s.tick, amount: C(-fee), category: 'art_commission', note: artist.name, refId: cardId });

  s.market.commissionQueue.push({
    id: nextId(s, 'com') as CommissionId,
    cardId, artistId, publisherId: pub.id, brief, fee,
    placedTick: s.tick, returnsTick: T(s.tick + weeks),
  });
  card.artistId = artistId;
  card.artBrief = brief;

  artist.relationship = U(artist.relationship + cfg.relationshipPerCommission);
  // `reputationAtCommission` is what makes the scouting bet measurable after
  // the fact: the harness compares it against where the artist ended up.
  emit(s, 'artCommissioned', false, { cardId, artistId, publisherId: pub.id },
    { fee, weeks, rate: artist.rate, reputationAtCommission: artist.reputation });
}

/** Sign, retain or lock down an artist. */
function hireArtist(s: SimState, artistId: ArtistId, terms: ArtistTerms): void {
  const artist = s.artists[artistId];
  const pub = s.publishers[s.playerId];
  if (!artist || !pub || !artist.available) return;
  if (artist.exclusiveTo !== null && artist.exclusiveTo !== pub.id) return;
  const cfg = s.config.art;

  if (terms === 'perCard') {
    // Dropping a standing arrangement. The exclusivity goes with it.
    if (artist.exclusiveTo === pub.id) artist.exclusiveTo = null;
    delete pub.retainers[artistId];
    return;
  }

  const multiple = terms === 'exclusive' ? cfg.exclusiveWeeklyMultiple : cfg.retainerWeeklyMultiple;
  pub.retainers[artistId] = {
    artistId, terms, sinceTick: s.tick, weeklyFee: C(artist.rate * multiple),
  };
  if (terms === 'exclusive') artist.exclusiveTo = pub.id;
  emit(s, 'artistSigned', true, { artistId, publisherId: pub.id },
    { terms, weeklyFee: pub.retainers[artistId]!.weeklyFee, reputation: artist.reputation });
}

/**
 * Delivered art, weekly bills, and the roster drifting underneath both. Runs on
 * a stride because art moves in weeks; the retainer bill is scaled to match so
 * the stride cannot change what a retainer costs per year.
 */
function tickArt(s: SimState): void {
  if (s.tick % s.config.strides.art !== 0) return;
  const cfg = s.config.art;

  // 1. Art that has come back.
  const stillOut: Commission[] = [];
  for (const com of s.market.commissionQueue) {
    if ((com.returnsTick as number) > s.tick) { stillOut.push(com); continue; }
    const card = s.cards[com.cardId];
    const artist = s.artists[com.artistId];
    if (!card || !artist) continue;
    // A set that already shipped got house art; the commission is still paid
    // for, and the money is still gone. Late art does not un-ship a card.
    if (card.artSource !== 'pending') continue;

    // Paying over the rate buys a better result, with diminishing returns, so
    // no budget can buy a masterpiece from a beginner.
    const overRate = Math.max(0, com.brief.budget / Math.max(1, artist.rate) - 1);
    const budgetLift = cfg.budgetQualityGain * Math.log(1 + overRate);
    const quality = U(artistCraft(artist) * cfg.statsWeight
      + rand(s.artRng) * cfg.qualityNoise + budgetLift);

    card.artQuality = quality;
    card.artSource = 'commissioned';
    emit(s, 'artDelivered', false, { cardId: card.id, artistId: artist.id },
      { quality, weeks: (s.tick as number) - (com.placedTick as number), fee: com.fee });
  }
  s.market.commissionQueue = stillOut;

  // 2. Standing arrangements bill whether or not anything was commissioned.
  // That is the whole point of them: locking an artist down is a running cost,
  // not a free claim.
  for (const pub of Object.values(s.publishers)) {
    if (pub.deadTick !== null) continue;
    let bill = 0;
    for (const r of Object.values(pub.retainers)) {
      const artist = s.artists[r.artistId];
      if (!artist || !artist.available) { delete pub.retainers[r.artistId]; continue; }
      bill += r.weeklyFee * s.config.strides.art;
    }
    if (bill > 0) {
      pub.cash = C(pub.cash - bill);
      pub.ledger.push({ t: s.tick, amount: C(-bill), category: 'staff', note: 'artist retainers' });
    }
  }

  // 3. Relationships cool when you stop calling.
  for (const a of Object.values(s.artists)) {
    a.relationship = U(a.relationship - cfg.relationshipDecayPerTick * s.config.strides.art);
  }
}

/**
 * The roster is not a fixed cast. Newcomers turn up unproven and cheap, the
 * established price themselves up as their reputation climbs, and some retire.
 * Without this, scouting is a puzzle you solve once in year one and never
 * think about again for the next forty-nine.
 */
function tickRoster(s: SimState): void {
  if (s.tick % s.config.strides.quarterly !== 0) return;
  const cfg = s.config.art;
  const artists = Object.values(s.artists);

  for (const a of artists) {
    if (!a.available) continue;
    // A reputation that has climbed drags the rate up behind it — off the rate
    // they started at, never off today's. Compounding a career's worth of
    // reputation onto the current rate produces a bill in the billions.
    const target = a.baseRate * (1 + a.reputation * cfg.rateGrowthPerReputation);
    a.rate = C(a.rate + (target - a.rate) * cfg.rateAdjustRate * s.config.strides.quarterly);
    // Retirement takes the artist off the board. Their old cards keep the
    // reputation they earned — the value engine reads it live either way.
    if (a.reputation > 0.5 && chance(s.artRng, cfg.retireChancePerTick * s.config.strides.quarterly)) {
      a.available = false;
      for (const pub of Object.values(s.publishers)) delete pub.retainers[a.id];
      if (a.exclusiveTo !== null) a.exclusiveTo = null;
      emit(s, 'artistRetired', true, { artistId: a.id }, { reputation: a.reputation });
    }
  }

  if (artists.filter(a => a.available).length < cfg.maxRosterSize
      && chance(s.artRng, cfg.newcomerChancePerTick * s.config.strides.quarterly)) {
    const id = nextId(s, 'art') as ArtistId;
    const newcomerRate = Math.round(
      randRange(s.artRng, cfg.newcomerRateMin, cfg.newcomerRateMax)) as Cents;
    // [round 11 C12] `personality` is CUT — it was drawn and read by nothing.
    // The DRAW STAYS. Removing it would renumber every later draw on `artRng`
    // and move eleven rounds of banked numbers for a field that did nothing.
    // `specialty` is inert rather than cut: Plan 2 fits it.
    pick(s.artRng, ARTIST_PERSONALITIES);
    s.artists[id] = {
      id,
      name: `Artist ${Object.keys(s.artists).length + 1}`,
      specialty: pick(s.artRng, ARTIST_SPECIALTIES),
      stats: {
        linework: randRange(s.artRng, cfg.newcomerStatMin, cfg.newcomerStatMax),
        color: randRange(s.artRng, cfg.newcomerStatMin, cfg.newcomerStatMax),
        composition: randRange(s.artRng, cfg.newcomerStatMin, cfg.newcomerStatMax),
        speed: randRange(s.artRng, cfg.speedMin, cfg.speedMax),
        reliability: randRange(s.artRng, cfg.reliabilityMin, cfg.reliabilityMax),
      },
      rate: newcomerRate,
      baseRate: newcomerRate,
      turnaroundWeeks: Math.round(randRange(s.artRng, 2, 8)),
      reputation: randRange(s.artRng, cfg.newcomerReputationMin, cfg.newcomerReputationMax),
      // The gamble. Hidden, and the whole reason scouting is not solved.
      growth: randRange(s.artRng, cfg.growthMin, cfg.growthMax),
      relationship: cfg.openingRelationship,
      exclusiveTo: null,
      available: true,
      reputationHistory: emptySeries(s.tick),
    };
    emit(s, 'artistArrived', false, { artistId: id }, { rate: s.artists[id]!.rate });
  }
}

// ---------------------------------------------------------------------------
// Grading and pop reports (CONCEPT.md §6.4)
// ---------------------------------------------------------------------------

/**
 * The market grades cards; the publisher does not. What the publisher decides
 * is print quality, which moves the grade distribution, and brand standing,
 * which is what pulls extra graders into their market. Everything here is an
 * observer of the raw price: it reads `market.rawPrice` and writes graded
 * prices and pop reports beside it, and nothing in the value engine reads back.
 *
 * All rolls come from `s.gradingRng`. Sharing the main stream would renumber
 * every later draw in the run, which would move the five value targets for a
 * reason that has nothing to do with value.
 */

/** Grade boundaries on the latent 1-10 condition score, best first. */
function gradeCuts(s: SimState): Array<{ tier: GradeTier; min: number }> {
  const g = s.config.grading.gradeCuts;
  return [
    { tier: '10', min: g['10'] },
    { tier: '9.5', min: g['9.5'] },
    { tier: '9', min: g['9'] },
    { tier: '8', min: g['8'] },
    { tier: '7', min: g['7'] },
    { tier: 'below7', min: -Infinity },
  ];
}

/**
 * Age at grading that counts a submission as vintage, in years. A measurement
 * threshold rather than a tunable: it is what `gemRateVintage` means, so moving
 * it silently redefines the gate rather than changing the world.
 */
const GRADING_VINTAGE_YEARS = 20;

/** Abramowitz-Stegun 7.1.26. Good to ~1e-7, which is far past what this needs. */
function normalCdf(x: number, mean: number, sigma: number): number {
  const z = (x - mean) / (sigma * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-z * z);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

/** Copies of this printing sitting in slabs, across every grader and grade. */
function gradedTotal(pr: Printing): number {
  let n = 0;
  for (const byTier of Object.values(pr.population.graded)) {
    for (const c of Object.values(byTier)) n += c ?? 0;
  }
  return n;
}

/** Graders taking submissions this tick. A dormant one has not entered yet. */
function activeGraders(s: SimState): Grader[] {
  const out: Grader[] = [];
  for (const g of Object.values(s.graders)) {
    if ((g.activeFromTick as number) <= s.tick) out.push(g);
  }
  return out;
}

/**
 * Extra graders are something brand standing buys. A dormant grader does not
 * cover a publisher nobody has heard of, and once it enters it stays.
 */
function tickGraderEntry(s: SimState): void {
  const gate = s.config.grading.sideGraderBrandGate;
  if (s.publishers[s.playerId]!.brandStanding < gate) return;
  for (const g of Object.values(s.graders)) {
    if ((g.activeFromTick as number) <= s.tick) continue;
    g.activeFromTick = s.tick;
    emit(s, 'graderEnteredMarket', true, {}, { grader: g.id, reputation: g.reputation });
  }
}

/**
 * The best tier the card can justify. A submitter pays up for a faster
 * turnaround on a card worth paying up for, and a cheap card either goes bulk
 * or does not go at all — the fee is the hurdle that keeps bulk commons out of
 * the pop report.
 */
function chooseTier(g: Grader, rawPrice: Cents, worthMultiple: number): Grader['tiers'][number] | null {
  let best: Grader['tiers'][number] | null = null;
  for (const t of g.tiers) {
    if (rawPrice >= t.price * worthMultiple && (best === null || t.price > best.price)) best = t;
  }
  return best;
}

/** Submissions come back graded. Returns land on the tick they are due. */
function resolveGradingReturns(s: SimState): void {
  const queue = s.market.gradingQueue;
  if (queue.length === 0) return;
  const cfg = s.config.grading;
  const kept: GradingSubmission[] = [];
  for (const sub of queue) {
    if ((sub.returnsTick as number) > s.tick) { kept.push(sub); continue; }
    const pr = s.printings[sub.printingId];
    const grader = s.graders[sub.graderId];
    if (!pr || !grader) continue;

    // Condition is a latent normal: where its mean sits is the print-quality
    // decision showing up years later, and how far the grader shifts it is
    // their strictness. Copies wear while they sit in circulation.
    const ageYears = Math.max(0, (s.tick - pr.releaseTick) / 52);
    const wear = Math.min(cfg.agePenaltyCap, cfg.agePenaltyPerYear * ageYears);
    const mean = cfg.conditionMean
      + cfg.gradeShiftWeight * s.config.printing.qualityGradeShift[pr.printQuality]
      - cfg.strictnessWeight * (grader.strictness - 1)
      - wear
      // One roll for the whole submission: two batches of the same card from
      // the same press do not grade identically.
      + gauss(s.gradingRng, 0, cfg.conditionSigma * 0.35);

    const byTier = (pr.population.graded[grader.id] ??= {});
    let assigned = 0;
    const cuts = gradeCuts(s);
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i]!;
      const upper = i === 0 ? 1 : normalCdf(cuts[i - 1]!.min, mean, cfg.conditionSigma);
      const lower = cut.min === -Infinity ? 0 : normalCdf(cut.min, mean, cfg.conditionSigma);
      const share = Math.max(0, upper - lower);
      // The last tier takes the rounding remainder, so a submission never
      // gains or loses copies to the grade split.
      const n = i === cuts.length - 1
        ? sub.quantity - assigned
        : Math.min(sub.quantity - assigned, Math.round(sub.quantity * share));
      if (n <= 0) continue;
      byTier[cut.tier] = (byTier[cut.tier] ?? 0) + n;
      assigned += n;
      // Counted here rather than off the pop report, because the pop report is
      // cumulative and cannot say what a copy submitted today grades.
      const tally = s.market.gradingTally;
      const isGem = cut.tier === '10';
      if (ageYears >= GRADING_VINTAGE_YEARS) {
        tally.vintageCopies += n;
        if (isGem) tally.vintageGems += n;
      } else {
        tally.modernCopies += n;
        if (isGem) tally.modernGems += n;
      }
      const q = tally.byQuality[pr.printQuality];
      q.copies += n;
      if (isGem) q.gems += n;
    }
  }
  s.market.gradingQueue = kept;
}

/**
 * Copies go out for grading, and graded prices are marked. Strided like the
 * price loop: a pop report moves on the scale of months, not weeks.
 */
function tickGrading(s: SimState, printings: Printing[]): void {
  const cfg = s.config.grading;
  tickGraderEntry(s);
  // Returns land every tick. Only the roster walk below is strided.
  resolveGradingReturns(s);
  const graders = activeGraders(s);
  if (graders.length === 0) return;
  let shareTotal = 0;
  for (const g of graders) shareTotal += g.marketShare;
  if (shareTotal <= 0) return;

  const writeThreshold = s.config.history.writeThreshold;
  const phase = s.tick % s.config.strides.grading;
  for (let i = phase; i < printings.length; i += s.config.strides.grading) {
    const pr = printings[i]!;
    const graded = gradedTotal(pr);

    // --- submissions ---
    const raw = pr.market.rawPrice;
    const pool = Math.max(0, pr.population.opened - pr.population.destroyed - graded);
    const room = Math.max(0, cfg.maxGradedShare * pr.population.opened - graded);
    if (pool > 0 && room >= 1) {
      // Who takes it is market share, not a coin flip: the big grader grades
      // most of everything, which is what makes its pop report the crowded one.
      let roll = rand(s.gradingRng) * shareTotal;
      let grader = graders[graders.length - 1]!;
      for (const g of graders) { roll -= g.marketShare; if (roll <= 0) { grader = g; break; } }

      const tier = chooseTier(grader, raw, cfg.feeWorthMultiple);
      if (tier) {
        const appetite = Math.min(cfg.appetiteCeiling, raw / (tier.price * cfg.feeWorthMultiple));
        const wanted = pool * cfg.submitRatePerTick * appetite * s.config.strides.grading;
        const quantity = Math.floor(Math.min(wanted, room, pool));
        if (quantity >= 1) {
          // A submission is a trade: somebody paid for this copy before they
          // sent it in. Feeds the liquidity recency term in `tickPrices`.
          pr.market.lastTradeTick = s.tick;
          s.market.gradingQueue.push({
            printingId: pr.id, graderId: grader.id, tierName: tier.name, quantity,
            submittedTick: s.tick, returnsTick: T(s.tick + tier.turnaroundWeeks),
          });
        }
      }
    }

    // --- marking the graded prices ---
    if (graded === 0) continue;
    for (const g of graders) {
      const pops = pr.population.graded[g.id];
      if (!pops) continue;
      const prices = (pr.market.gradedPrices[g.id] ??= {});
      const histories = (pr.market.gradedHistory[g.id] ??= {});
      // Reputation is what a slab from this grader is trusted for, either way.
      const rep = 1 + cfg.reputationWeight * (g.reputation - 0.5) * 2;
      for (const [tier, count] of Object.entries(pops) as Array<[GradeTier, number]>) {
        if (!count) continue;
        // Pop report position. A 10 that a thousand other people also have is
        // not the same card as the only one — CONCEPT.md §5's condition term.
        const scarcity = Math.max(cfg.popScarcityFloor, Math.min(cfg.popScarcityCeiling,
          Math.pow((cfg.popScarcityReference * audienceScale(s)) / count, cfg.popScarcityExponent)));
        // Divide the print-quality term back out. A grade is a STATEMENT about
        // condition, so a 10 is a 10 whatever it was printed on — the stock has
        // already been priced, by deciding how many copies reached this tier at
        // all. Leaving it in would sell a budget 10 below a standard 10.
        const neutral = raw / s.config.printing.qualityPriceMultiplier[pr.printQuality];
        const target = neutral * cfg.tierMultiplier[tier] * rep * scarcity;
        const prev = prices[tier];
        const next = C(prev === undefined ? target : prev * (1 - cfg.priceLerp) + target * cfg.priceLerp);
        prices[tier] = next;
        (histories[tier] ??= emptySeries(s.tick));
        writePoint(histories[tier]!, s.tick, next, writeThreshold);
      }
    }
  }
}

function tickCompaction(s: SimState): void {
  if (s.tick % s.config.strides.annual !== 0) return;
  // Completed drops are feed history, and the feed does not reach back decades.
  // Without this a long run keeps every queue it ever ran.
  const dropCutoff = s.tick - s.config.history.weeklyRetentionTicks;
  for (const d of Object.values(s.drops)) {
    if (d.status === 'complete' && (d.scheduledTick as number) < dropCutoff) delete s.drops[d.id];
  }
  const { printings, products, ips } = lists(s);
  for (const pr of printings) {
    compact(pr.market.rawHistory, s.tick, s.config.history);
    for (const byTier of Object.values(pr.market.gradedHistory)) {
      for (const series of Object.values(byTier)) {
        if (series) compact(series, s.tick, s.config.history);
      }
    }
  }
  for (const p of products) compact(p.market.history, s.tick, s.config.history);
  for (const ip of ips) {
    compact(ip.affectionHistory, s.tick, s.config.history);
    compact(ip.resurgenceHistory, s.tick, s.config.history);
  }
  // Artists are not in the tick cache — they are a fixed-ish roster rather than
  // a growing catalogue — so they are compacted from their own map.
  for (const a of Object.values(s.artists)) compact(a.reputationHistory, s.tick, s.config.history);
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
      if (sched && s.tick >= sched.releaseTick) {
        releaseSet(s, set.id, sched.regionId);
        // Before anything else can sell: the orders were promised first.
        fillPreorders(s, set);
      } else {
        tickReveal(s, set);
        tickPreorders(s, set);
      }
    }
    // A released set still has later regions to reach. Those are not another
    // `releaseSet` — printings mint once, and the attention is burned once —
    // they are the week that region's stock becomes sellable. `tickSales`
    // enforces the date; this is what records it and what pays the knowledge.
    if (set.status === 'released') {
      for (let i = 1; i < set.regionSchedule.length; i++) {
        const later = set.regionSchedule[i]!;
        if (s.tick !== later.releaseTick) continue;
        creditRelease(s, later.regionId);
        emit(s, 'setReleased', true, { setId: set.id, publisherId: set.publisherId },
          { regionId: later.regionId as string, wave: i });
      }
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
  tickGrading(s, printings);
  tickAudience(s);
  tickActors(s, products, printings);
  tickCreators(s, printings);
  tickArtists(s);
  tickArt(s);
  tickRoster(s);
  tickFinance(s);
  tickRegionKnowledge(s);
  tickCollabOffers(s);
  tickCollabSettlement(s);
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
