/**
 * The secondary-market actors (CONCEPT.md §6.8).
 *
 * Four populations the player never controls. Scalpers already behaved — they
 * camp drops and flip sealed product, and `tickScalpers` owns them. The other
 * three were plain numbers in `AudienceState.actors`: `collectors` was read as
 * a demand pool by `resolveDrop` and nowhere else, and `resellers` and
 * `speculators` were read by nothing at all.
 *
 * Each one acts on the singles market in a way the others cannot, or there is
 * no reason for three of them to exist:
 *
 * - **Collectors** take copies off the market and keep them. They are the only
 *   actor whose effect is permanent, and the only one that is stable rather
 *   than cyclical — CONCEPT.md calls them "the stable demand floor".
 * - **Resellers** open sealed product on stream. They move supply from sealed
 *   to singles faster than a shelf does, which cuts sealed scarcity and raises
 *   singles supply at the same time. They are the only actor that changes the
 *   quantity of anything.
 * - **Speculators** buy heat and sell it back. They are the only actor with a
 *   sign that flips: they amplify a rising printing and they amplify the fall.
 *
 * Everything here draws from `s.actorRng`. These populations move prices, so
 * unlike grading this is not an observer and the value targets will move — the
 * separate stream is there so the movement is attributable to the mechanism
 * rather than to reshuffled noise.
 */
import { engagedTotal, globalAverages } from './audience.ts';
import type { SimState, Printing, Product, CardSet, SimEvent, IpId } from './types.ts';
import { gauss, rand } from './rng.ts';
import { nextId } from './world.ts';

/**
 * How many copies of a printing are actually tradeable.
 *
 * Three things take a copy out of the pool and only one of them was counted.
 * A destroyed copy is gone; a slabbed copy has left the raw market for the
 * graded one; and a copy in a collection is not for sale at any price the
 * model represents. Scarcity is computed over what is left.
 *
 * This is the grading feedback loop HANDOFF.md left open, and the collector
 * mechanic, in one term — they are the same term, and splitting them would
 * mean measuring the value engine twice for one idea.
 */
export function tradeablePopulation(s: SimState, pr: Printing, graded: number): number {
  const held = collectorHeldShare(s) * pr.population.opened;
  return Math.max(1, pr.population.opened + pr.population.sealed
    - pr.population.destroyed - graded - held);
}

/**
 * The share of opened copies sitting in collections rather than on the market.
 *
 * It rises with the collector population against the size of the audience, so
 * a healthy, loyal audience makes every card scarcer — which is the mechanism
 * behind "goodwill is worth money" rather than a separate bonus bolted on.
 */
export function collectorHeldShare(s: SimState): number {
  const cfg = s.config.actors;
  // Density against the ENGAGED audience across every open market: a collector
  // is a share of the people actually buying, not of everybody who might.
  const audience = engagedTotal(s);
  if (audience <= 0) return cfg.collectorHoldFloor;
  const density = s.audience.actors.collectors / audience;
  const share = cfg.collectorHoldFloor
    + (cfg.collectorHoldCeiling - cfg.collectorHoldFloor)
      * Math.min(1, density / cfg.collectorDensityReference);
  return Math.min(cfg.collectorHoldCeiling, share);
}

/**
 * What a reseller population does to the rate sealed product is opened at.
 *
 * Rip-and-ship is a business, so it scales with how well ripping pays: singles
 * worth more than the box they came in is the whole trade. Returned as a
 * multiplier on the base rip rate so `tickSealed` keeps owning the price
 * response it already models.
 */
export function ripMultiplier(s: SimState): number {
  const cfg = s.config.actors;
  const ref = Math.max(1, cfg.resellerReference);
  return 1 + cfg.ripPerReseller * (s.audience.actors.resellers / ref);
}

/**
 * The three populations, once a quarter.
 *
 * Each one is fed by the thing it profits from and starved by crowding, in the
 * same shape as the scalper loop: a population that only grows saturates at its
 * cap in every seed and stops being a population at all.
 */
export function tickActors(s: SimState, products: Product[], printings: Printing[]): void {
  if (s.tick % ACTOR_STRIDE !== 0) return;
  const cfg = s.config.actors;
  const a = s.audience.actors;

  const audience = engagedTotal(s);
  const { goodwill, fatigue } = globalAverages(s);

  // --- Collectors ---------------------------------------------------------
  // The floor, so they track the audience rather than a profit. Goodwill is
  // what converts an audience into collectors, and fatigue is what stops it.
  const collectorTarget = audience * cfg.collectorShareOfAudience
    * (0.3 + 1.4 * goodwill) * (1 - 0.5 * fatigue);
  a.collectors = Math.max(cfg.minCollectors,
    a.collectors + (collectorTarget - a.collectors) * cfg.collectorConvergence);

  // --- Resellers ----------------------------------------------------------
  // Ripping pays when the singles inside a box are worth more than the box.
  // That ratio is the entire trade, and it is self-closing: more ripping means
  // more singles supply, which lowers singles prices, which ends the trade.
  // Weighted by the stock that actually exists. A streamer opens boxes that
  // are on sale, not the one sealed case of a twenty-year-old set that has
  // appreciated past any reason to open it — and an unweighted mean over every
  // product ever printed is dominated by exactly those.
  let ripReturn = 0;
  let weight = 0;
  for (const p of products) {
    const stock = p.market.hidden.sealedRemaining;
    if (stock <= 0) continue;
    const contents = expectedSinglesValue(s, p);
    if (contents <= 0) continue;
    ripReturn += stock * contents / Math.max(1, p.market.price);
    weight += stock;
  }
  if (weight > 0) {
    ripReturn /= weight;
    const target = cfg.resellerReference
      * Math.max(0, ripReturn - cfg.ripBreakEven) / Math.max(0.01, cfg.ripBreakEven);
    a.resellers = clamp(
      a.resellers + (target - a.resellers) * cfg.resellerConvergence,
      cfg.minResellers, cfg.maxResellers,
    );
  }

  // --- Speculators --------------------------------------------------------
  // Heat above the pack is what there is to trade. Averaging it over every
  // printing ever made returns ~0 in any mature run — thousands of dead cards
  // sitting at 1 drown the handful that are moving — so only the heat that
  // exists is counted.
  let heatPool = 0;
  for (const pr of printings) heatPool += Math.max(0, pr.market.heat - 1);

  // Return is per-capita, exactly as it is for scalpers, and for the same
  // reason: their own buying adds heat, so a per-unit reading is a positive
  // feedback loop with no brake and the population pins at its cap in every
  // seed. Splitting a fixed pool between them is the brake.
  const perCapita = heatPool / Math.max(1, a.speculators);
  const crowdReturn = perCapita / Math.max(1e-6, cfg.speculatorHeatPerCapita);
  const specTarget = a.speculators
    * (1 + cfg.speculatorMomentumGain * (crowdReturn - 1));
  a.speculators = clamp(
    a.speculators + (specTarget - a.speculators) * cfg.speculatorConvergence,
    cfg.minSpeculators, cfg.maxSpeculators,
  );
  // The population is sampled into the event log rather than read off the end
  // of the run: the end-of-run number cannot tell a healthy swing from a flat
  // line, which is the same reason `scalperCycles` exists.
  emit(s, 'speculatorSwing', { speculators: Math.round(a.speculators),
    resellers: Math.round(a.resellers), collectors: Math.round(a.collectors) });
}

/** Events store data, not prose. Uses the engine's id counter, not its own. */
function emit(s: SimState, kind: 'speculatorSwing', data: Record<string, number>): void {
  s.events.push({
    id: nextId(s, 'ev') as SimEvent['id'],
    t: s.tick, kind, interrupts: false, refs: {}, data,
  });
}

/**
 * What speculators do to one printing's heat.
 *
 * Positive on a printing already above the pack and negative on one below it,
 * scaled by how many of them there are. The sign flip is the point: a
 * population that only ever adds heat is a price multiplier with extra steps,
 * and CONCEPT.md asks them to "amplify **and crash**".
 */
export function speculatorHeatDelta(s: SimState, pr: Printing): number {
  const cfg = s.config.actors;
  const crowd = s.audience.actors.speculators / Math.max(1, cfg.speculatorReference);
  const above = pr.market.heat - 1;
  const push = cfg.speculatorHeatGain * crowd * Math.tanh(above * cfg.speculatorSensitivity);
  return push + gauss(s.actorRng, 0, cfg.speculatorNoise);
}

/**
 * A set's aftermarket performance, relative to the base card price.
 *
 * `SetPerformance.aftermarketIndex` was written as 0 and read by nothing. It is
 * the natural answer to CONCEPT.md §8's "set health" screen, and it is what
 * lets a run say whether a set that sold badly nonetheless became valuable —
 * which is a different outcome from a set that did neither.
 */
export function aftermarketIndex(s: SimState, set: CardSet): number {
  const base = s.config.value.baseCardPrice;
  if (base <= 0) return 0;
  let sum = 0;
  let n = 0;
  for (const cardId of set.cardIds) {
    const pr = s.printings[s.printingByCard[cardId]!];
    if (!pr) continue;
    sum += pr.market.rawPrice / base;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/** Mean singles value inside one sealed unit. Cheap approximation, cached by caller. */
function expectedSinglesValue(s: SimState, p: Product): number {
  const set = s.sets[p.setId];
  if (!set) return 0;
  let sum = 0;
  for (const cardId of set.cardIds) {
    const pr = s.printings[s.printingByCard[cardId]!];
    // `pullRate` is already copies of this card per pack — the rarity table
    // over `pullDivisor`, scaled by the set size — so the packs per unit is the
    // only other factor. Dividing by ten a second time here put every box's
    // contents an order of magnitude under its own price, and ripping could
    // never pay for anybody. Because the pull rate carries the set size, this
    // sum holds steady as the set grows, which is what a fixed pack holds.
    if (pr) sum += pr.market.rawPrice * pr.pullRate * p.packsPerUnit;
  }
  return sum;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Populations move on a quarterly clock. Nothing here changes weekly. */
export const ACTOR_STRIDE = 13;

// ---------------------------------------------------------------------------
// Creators (CONCEPT.md §6.8, §8)
// ---------------------------------------------------------------------------

/**
 * Named creators, as distinct from the reseller population.
 *
 * The population says how much product gets opened. A creator says *which
 * card* the market is talking about this week, and does it repeatedly, to an
 * audience that is their own. CONCEPT.md asks resellers to "create visible
 * price events", and an aggregate cannot: a price event needs a cause you can
 * name and a relationship you can build.
 *
 * `Creator` was declared with `format`, `audienceSize`, `influence`,
 * `affinityIps` and `relationship`, and `world.ts` seeded an empty record. The
 * `creatorOpened` event kind existed and nothing emitted it.
 */
export function tickCreators(s: SimState, printings: Printing[]): void {
  if (s.tick % CREATOR_STRIDE !== 0) return;
  const cfg = s.config.creators;
  const creators = Object.values(s.creators);
  if (creators.length === 0 || printings.length === 0) return;

  // A creator with no affinities has no opinion, and at tick 0 there is nothing
  // to have one about. They pick their IPs the first time there are any.
  const ipIds = Object.keys(s.ips);
  if (ipIds.length > 0) {
    for (const c of creators) {
      if (c.affinityIps.length > 0) continue;
      const want = 1 + Math.floor(rand(s.actorRng) * 2);
      for (let i = 0; i < want; i++) {
        const pickIp = ipIds[Math.floor(rand(s.actorRng) * ipIds.length)] as IpId;
        if (!c.affinityIps.includes(pickIp)) c.affinityIps.push(pickIp);
      }
    }
  }

  for (const c of creators) {
    // A creator covers what suits them. Relationship raises the odds, which is
    // what makes cultivating one a decision rather than weather.
    const odds = cfg.coverChancePerStride * (0.4 + 1.2 * c.relationship);
    if (rand(s.actorRng) >= odds) continue;

    // Recent, and preferably about something they care about. A creator who
    // covered the whole catalogue uniformly would be indistinguishable from a
    // flat heat bonus.
    const fresh = printings.filter(
      pr => (s.tick as number) - (pr.releaseTick as number) < cfg.freshnessWeeks,
    );
    const pool = fresh.length > 0 ? fresh : printings;
    let chosen = pool[Math.floor(rand(s.actorRng) * pool.length)]!;
    for (let tries = 0; tries < cfg.affinityTries; tries++) {
      const card = s.cards[chosen.cardId];
      if (card && c.affinityIps.includes(card.subjectIp)) break;
      chosen = pool[Math.floor(rand(s.actorRng) * pool.length)]!;
    }

    // Reach times influence, against a reference audience. A big channel with
    // no credibility and a small one with a lot of it land in the same place,
    // which is the right shape for a recommendation.
    const reach = (c.audienceSize / cfg.audienceReference) * c.influence;
    const delta = cfg.heatPerCoverage * Math.min(cfg.maxCoverageHeat, reach);
    chosen.market.heat = Math.min(s.config.value.heatCeiling, chosen.market.heat + delta);

    emit2(s, 'creatorOpened', { printingId: chosen.id, cardId: chosen.cardId, creatorId: c.id },
      { heat: delta, audience: c.audienceSize, format: c.format });
  }

  // The relationship converges on how much you are giving them to cover, and
  // it must not be driven by coverage itself. Coverage odds already rise with
  // the relationship, so paying the relationship out of coverage makes the two
  // a feedback loop with no stable middle: measured, it pinned at 0.99 in every
  // seed on one setting and collapsed to 0.04 on the next, with nothing in
  // between. What a creator actually responds to is new product, so that is
  // what this tracks.
  const freshCount = printings.filter(
    pr => (s.tick as number) - (pr.releaseTick as number) < cfg.freshnessWeeks,
  ).length;
  const target = Math.min(1, freshCount / cfg.freshPrintingsReference);
  for (const c of creators) {
    c.relationship = Math.max(0, Math.min(1,
      c.relationship + (target - c.relationship) * cfg.relationshipConvergence));
  }
}

/** Creators are checked monthly. A weekly cadence makes every card news. */
export const CREATOR_STRIDE = 4;

function emit2(
  s: SimState, kind: 'creatorOpened',
  refs: SimEvent['refs'], data: SimEvent['data'],
): void {
  s.events.push({ id: nextId(s, 'ev') as SimEvent['id'], t: s.tick, kind, interrupts: false, refs, data });
}
