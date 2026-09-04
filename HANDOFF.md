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
```

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
- CSV output + console summary table
- Config overrides from CLI without touching code
- Sparse price history with quarterly compaction of anything older than 10 years

## Known problems — these are the next tasks

**1. The price distribution is too flat and grails are too common.**
The value formula and the goodwill wiring were fixed in `1a89067`; the numbers below are from a 25-year, 10-seed run of the current code, measured against the targets at the bottom of this file.

| Metric | Target | Measured |
|---|---|---|
| `surpriseGrail` | 15–40% of runs | 60–100% |
| `top1PctShare` | 0.4–0.7 | 0.21–0.24 |
| `medianCardPrice` | a few dollars | $12–20 |
| `yearsToFirst100Dollar` | 3–8 | 2.2–3.4 |

So value is emergent but not concentrated: too many cards break out, and the ones that do are not far enough clear of the median. The distribution is mush where it should be a power law. The scarcity term in `tickPrices` (`100000 / surviving`) is still the arbitrary part.

**2. Performance.**
~3s per 15-year run, so a 50-year × 40-seed batch is impractical. Prices already update on a 4-tick stride and entity lists are cached. Next candidates: typed arrays for the hot price loop, skipping printings whose price hasn't moved in N ticks, and worker threads for batch runs.

**3. Large parts of the model are declared but not simulated.**
Grading and pop reports, regions beyond `reg_us`, collabs, creators, rival publisher behavior, chains, preorders, and the scalper population all exist in `types.ts` and are untouched by `engine.ts`. `applyDecision` now handles nine decision types; `commissionArt`, `scheduleReveal`, `hostPrerelease`, `hireArtist`, `signCollab`, `unlockRegion`, `marketingSpend` and `advance` still fall through to `default`.

The direct store unlocks and sells, but it does not run drops. `Product.scalperAppeal` and `Channel.queueCapacity` are still read by nothing — they are the hooks for that pass.


## Things not to break

- The sim core stays pure: no React, no DOM, no `Date`, no I/O, no unseeded randomness
- Ground truth stays hidden: `IpEntity.truth`, `Region.truth`, `Artist.growth`, and `SealedMarket.hidden` must never be read by anything that renders
- `Printing` is the priced unit, not `Card`
- The art multiplier reads `Artist.reputation` live, never a value frozen at commission
- Price noise is load-bearing. Don't tune `value.noiseSigma` to zero to make runs look tidier
- Events store data, not prose
- The LGS network and the direct store can sour but can never be lost. CONCEPT.md
  §7 makes LGS-only volume the floor that relationship death collapses you *to*
- `Product.unitsRemaining` is all unsold stock. The allocations hold the sellable
  subset, so their remainders sum to at most `unitsRemaining` — never exactly it.
  Unallocated stock, and stock stranded by a lost channel, is the difference

## Suggested first session

Fix the value formula and the attention/fatigue balance together, using `npm run sim:quick` as the feedback loop, and drive toward these targets:

| Metric | Target |
|---|---|
| `surpriseGrail` | 15–40% of runs |
| `flooder` survival | well below `conservative` |
| `medianCardPrice` | a few dollars, not zero |
| `top1PctShare` | 0.4–0.7 |
| `yearsToFirst100Dollar` | 3–8 years |
