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
import type { SimState, Printing, Product, CardSet, SimEvent } from './types.ts';
import { gauss } from './rng.ts';
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
  const audience = Object.values(s.audience.segments).reduce((n, g) => n + g.size, 0);
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

  const segments = Object.values(s.audience.segments);
  const audience = segments.reduce((n, g) => n + g.size, 0);
  const goodwill = segments.length
    ? segments.reduce((n, g) => n + g.goodwill, 0) / segments.length : 0;
  const fatigue = segments.length
    ? segments.reduce((n, g) => n + g.fatigue, 0) / segments.length : 0;

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
    // `pullRate` is already copies per pack (RARITY_PULL / 10), so the packs
    // per unit is the only other factor. Dividing by ten a second time here
    // put every box's contents an order of magnitude under its own price, and
    // ripping could never pay for anybody.
    if (pr) sum += pr.market.rawPrice * pr.pullRate * p.packsPerUnit;
  }
  return sum;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Populations move on a quarterly clock. Nothing here changes weekly. */
export const ACTOR_STRIDE = 13;
