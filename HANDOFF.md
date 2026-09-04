# Handoff — TCG Manager Simulator sim core + harness

Read `CONCEPT.md` first. It's the design contract; this code is a partial implementation of it.

## What this is

A headless simulation core and a balance harness. No UI, no React, no storage layer yet.

```
src/sim/types.ts       full domain model (the design contract in type form)
src/sim/rng.ts         seeded PRNG, serializable
src/sim/series.ts      sparse time series + compaction
src/sim/channels.ts    channel traits, capacity, default allocation split
src/sim/config.ts      every tunable constant, with dotted overrides
src/sim/world.ts       initial state bootstrap
src/sim/engine.ts      tick loop + STUB value math
src/sim/invariants.ts  dev assertions
harness/bots.ts        five strategy bots
harness/metrics.ts     per-run balance metrics + CSV
harness/run.ts         CLI runner
```

Run it:

```
npm run sim:quick
npm run sim -- --seeds=40 --years=50 --bot=all
npm run sim -- --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist
```

`--dist` prints a price decile ladder for the last run. Use it, not the median
and max columns, when you change anything in the `value` config block: only the
step between deciles tells a power law from flat mush.

Requires Node 22.6+ (uses `--experimental-strip-types`, no build step). Swap to `tsx` if that ever gets annoying.

## Verified working

- Runs 50-year simulations headless, deterministic from seed
- Invariant checks pass clean across all five bots
- Starting cash is $500,000 (`500_000_00` cents). Everything in the model is
  cents; a literal without the `_00` suffix is off by a hundred
- Channel allocation: explicit `allocate` decisions, a release-time default split,
  per-channel sell-through and margin, floating street price, relationship drift,
  souring, and the channel unlock gates
- Release cadence is a real trade-off. Sweeping `conservative`'s cadence from 6 to
  78 weeks over 25 years and 10 seeds puts the profit optimum at 18 weeks, and
  pushing one notch faster costs most of it:

  | cadence | 6wk | 10wk | 14wk | **18wk** | 26wk | 34wk | 52wk |
  |---|---|---|---|---|---|---|---|
  | sets/year | 8.7 | 5.2 | 3.7 | **2.9** | 2.0 | 1.5 | 1.0 |
  | survived | 0/10 | 0/10 | 10/10 | **10/10** | 10/10 | 10/10 | 10/10 |
  | net worth | — | — | $5.9M | **$22.5M** | $16.7M | $13.6M | $8.9M |
  | fatigue | 0.89 | 0.96 | 0.76 | **0.61** | 0.37 | 0.35 | 0.22 |

  Under-releasing is a gentle loss; over-releasing is a cliff. That asymmetry is
  what CONCEPT.md §6.2 asks for.
- The price distribution is a power law, not flat mush. `Printing.truth.chase`
  is a hidden lognormal roll made once per printing, so two commons in the same
  set do not settle at the same price; `market.nostalgia` now compounds only on
  a printing the market still wants and that already stands above the pack, and
  decays back toward 1 on one it does not. 30 seeds x 25 years, `conservative`:

  | Metric | Target | Measured |
  |---|---|---|
  | `surpriseGrail` | 15–40% of runs | 33% |
  | `top1PctShare` | 0.4–0.7 | 0.59 |
  | `medianCardPrice` | a few dollars | $3.82 |
  | `yearsToFirst100Dollar` | 3–8 | 7.6 |

  The decile ladder (`--dist`) steps 1.2-1.3x through the middle deciles and
  1.8x, 2.7x, 9.8x across p90, p99 and the top. Widening steps are the shape;
  equal steps are the mush this replaced. `surpriseGrail` now uses CONCEPT.md
  §10's 100x bar, not the 20x one it used to.
- CSV output + console summary table
- Config overrides from CLI without touching code
- Sparse price history with quarterly compaction of anything older than 10 years

## Known problems — these are the next tasks

**1. Performance.**
A 50-run, 25-year batch takes about 5s, so a 50-year × 40-seed batch is still
impractical. Prices already update on a 4-tick stride and entity lists are cached. Next candidates: typed arrays for the hot price loop, skipping printings whose price hasn't moved in N ticks, and worker threads for batch runs.

**2. Large parts of the model are declared but not simulated.**
Grading and pop reports, regions beyond `reg_us`, collabs, creators, rival publisher behavior, chains, preorders, and the scalper population all exist in `types.ts` and are untouched by `engine.ts`. `applyDecision` now handles nine decision types; `commissionArt`, `scheduleReveal`, `hostPrerelease`, `hireArtist`, `signCollab`, `unlockRegion`, `marketingSpend` and `advance` still fall through to `default`.

The direct store unlocks and sells, but it does not run drops. `Product.scalperAppeal` and `Channel.queueCapacity` are still read by nothing — they are the hooks for that pass.


## Things not to break

- The sim core stays pure: no React, no DOM, no `Date`, no I/O, no unseeded randomness
- Ground truth stays hidden: `IpEntity.truth`, `Printing.truth`, `Region.truth`, `Artist.growth`, and `SealedMarket.hidden` must never be read by anything that renders
- `Printing` is the priced unit, not `Card`
- The art multiplier reads `Artist.reputation` live, never a value frozen at commission
- Price noise is load-bearing. Don't tune `value.noiseSigma` to zero to make runs look tidier
- The `value` config block is tuned as one unit. `scarcityExponent` and
  `referencePopulation` set the day-one rarity ladder, the three nostalgia
  knobs decide who climbs it over the next twenty years, and `chaseSigma` sets
  how far the luckiest card gets. Moving one and re-measuring only one metric
  will look fine and be wrong
- `value.priceFloorCents` is 20c because bulk commons are worth cents. A floor
  near the median piles half the population onto one price
- Events store data, not prose
- The LGS network and the direct store can sour but can never be lost. CONCEPT.md
  §7 makes LGS-only volume the floor that relationship death collapses you *to*
- `Product.unitsRemaining` is all unsold stock. The allocations hold the sellable
  subset, so their remainders sum to at most `unitsRemaining` — never exactly it.
  Unallocated stock, and stock stranded by a lost channel, is the difference

## Suggested next session

Problem 1 above: performance. `npm run sim -- --seeds=10 --years=25 --bot=all`
takes about 5s, so a 50-year x 40-seed batch is still impractical.

Re-run these before you touch the value engine again:

```
npm run sim -- --seeds=30 --years=25 --bot=conservative   # the five value targets
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist   # the decile ladder
```

The release-cadence sweep is the other regression. It still puts the profit
optimum at 18 weeks after the value rework:

| cadence | 6wk | 10wk | 14wk | **18wk** | 26wk | 34wk | 52wk | 78wk |
|---|---|---|---|---|---|---|---|---|
| survived | 0/10 | 0/10 | 10/10 | **10/10** | 10/10 | 10/10 | 10/10 | 10/10 |
| net worth | — | — | $2.9M | **$24.4M** | $17.8M | $13.5M | $8.7M | $6.0M |
