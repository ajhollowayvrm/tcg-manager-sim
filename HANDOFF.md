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
harness/bots.ts        seven strategy bots
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
- Invariant checks pass clean across all seven bots
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
- Direct-store drops and the scalper population that camps them. A drop is a
  discrete event, not a shelf: a fixed quantity goes up at MSRP on a scheduled
  tick, a queue forms, and it is served in one pass. `queueCapacity` bounds what
  the store can push through, and `Product.scalperAppeal` weights how badly the
  scalpers want that SKU — both fields were dead before this pass.

  The queue holds two populations with opposite effects. Collectors are who the
  drop is for, and reaching them pays goodwill. Scalpers camp it, take a share
  of the queue larger than their numbers alone would win, and cost goodwill for
  everyone they shut out. Shortage costs goodwill too, so a drop that is far too
  small is not a free win. That trade is the system: the direct store is full
  margin, and goodwill is what you pay for it.

  The scalper loop closes on itself. Scalpers only turn up when the sealed price
  stands far enough above MSRP to be worth flipping; they resell into that
  premium, which closes it; and their return decides how many show up next time.
  Two things keep it from becoming a one-way ratchet, and both are load-bearing:

  - A position carries its **basis and its age**. Return is measured against
    what they paid, and a position is force-cleared after `holdLimitWeeks`. A
    scalper flips; without the clock a position rides twenty years of vintage
    appreciation and reports it as scalping profit.
  - Return is **per-capita, not per-unit**. A drop is a fixed number of units
    however many scalpers turn up, so twice the population is half the flip
    each. Reading the per-unit premium instead pins the population at its cap in
    every seed, which is exactly what the first version did.

  Measured over 25 years, the population oscillates around break-even rather
  than saturating, and inventory cycles with it. The numbers it settles on are a
  first guess — this block was wired for behaviour and has not been swept.
- The reveal window. CONCEPT.md §2 asks for "Signal arrives; the print run does
  not change", and that sentence is the whole design. `commitPrintRun` opens a
  window between commit and release; inside it three levers spend money and
  attention to shape demand, and one noisy read comes back the other way. None
  of them can touch the print run.

  - `scheduleReveal` moves the preview start inside the window and sets the drip
    cadence. Each preview costs audience attention, adds hype with diminishing
    returns, and sharpens the signal.
  - `marketingSpend` is logarithmic in the *cumulative* spend on that set, so a
    publisher cannot buy a hit — the second million buys much less than the first.
  - `hostPrerelease` runs through the LGS network and is the deliberate
    counterweight to a direct-store drop: a drop is full margin paid for in
    goodwill, a prerelease is goodwill paid for in cash.

  Hype multiplies the demand a set would have had, in both the shelf pool and
  the drop queue, and seeds the singles market's opening heat. It cannot conjure
  demand a set does not have: a zero-chase set times any campaign is still
  nearly zero. After release it burns off.

  The signal is a measurement of the set's true chase with error that shrinks as
  previews land. It has to be able to lie — a signal that cannot be wrong turns
  the blind bet into a solved problem. `SetPerformance.chaseIndex` now records
  that truth at release, which is what lets the harness score the signal at all.
  8 seeds x 25 years: r = 0.90 on the default three-preview window, r = 0.99 on
  `hypeBuilder`'s sixteen-preview campaign. The mechanism works — the signal
  does get better the harder you work the window.
- `SealedMarket.heat` is wired. An oversubscribed drop adds it, scalpers dumping
  their stock takes it back out, and it multiplies the sealed price target. It
  was declared and unread before.
- CSV output + console summary table, plus a separate drops table that prints
  only for runs that opened a direct store
- Config overrides from CLI without touching code
- Sparse price history with quarterly compaction of anything older than 10 years

## Known problems — these are the next tasks

**1. Performance.**
A 50-run, 25-year batch takes about 5s, so a 50-year × 40-seed batch is still
impractical. Prices already update on a 4-tick stride and entity lists are cached. Next candidates: typed arrays for the hot price loop, skipping printings whose price hasn't moved in N ticks, and worker threads for batch runs.

**2. Large parts of the model are declared but not simulated.**
Grading and pop reports, regions beyond `reg_us`, collabs, creators, rival
publisher behavior, chains and preorders all exist in `types.ts` and are
untouched by `engine.ts`. `applyDecision` now handles thirteen decision types;
`commissionArt`, `hireArtist`, `signCollab`, `unlockRegion` and `advance` still
fall through to `default`.

Drops, scalpers and the reveal window came off this list — see "Verified
working". Of the secondary market actors in CONCEPT.md §6.8, scalpers now
behave; `resellers`, `collectors` and `speculators` are still plain numbers.
`collectors` is read as a demand pool by `resolveDrop` and nothing else.
`SetPerformance.aftermarketIndex` is still written as 0 and read by nothing.

**3. Two knobs the systems passes left visibly wrong, for the balance pass.**
Neither is a broken mechanism; both are a constant sitting in the wrong place.

- `hype.signalNoiseSigma` is too small. The signal scores r = 0.90 on the
  *default* window, with no campaign at all, because the true chase varies far
  more across sets than the noise does. The reveal lever therefore barely
  differentiates: a player who spends nothing already knows almost everything.
  Widen the sigma until the no-campaign read is genuinely poor.
- The `drops` config block has never been swept. The scalper population settles
  near its `minScalpers` floor, which is a working equilibrium but a low one.


## Things not to break

- The sim core stays pure: no React, no DOM, no `Date`, no I/O, no unseeded randomness
- Ground truth stays hidden: `IpEntity.truth`, `Printing.truth`, `Region.truth`, `Artist.growth`, `SealedMarket.hidden`, and `AudienceState.hidden` (the scalper
  population's books) must never be read by anything that renders
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
- Drops sell the direct store's allocation; `tickSales` must not. The direct
  channel's weight still counts toward `totalWeight` there, so the demand it
  holds is reserved for its drops rather than handed to the other channels.
  Skipping it without leaving the weight in place is a silent buff to everyone else
- A scalper position keeps its basis and its age, and profitability is
  per-capita. Drop either and the population saturates at `maxScalpers` in every
  seed, and stays there. Both are explained under "Verified working"
- The engine keeps at most one pending drop per (product, channel). A caller
  that submits `scheduleDrop` every tick relies on that guard to not stack a
  dozen drops onto one tick
- Completed drops are pruned as feed history in `tickCompaction`. Harness
  metrics therefore read drops off the event log, never off `s.drops`
- Hype multiplies demand; it must never add to it. A campaign on a set nobody
  wants has to stay worthless, or marketing spend becomes the whole game
- Every hype lever diminishes, and marketing diminishes on the *cumulative*
  spend rather than per call. Adding a per-call increment instead lets a caller
  split one budget into a hundred payments and buy a hundred times the hype
- The reveal signal must be able to lie, and its error must shrink with the
  number of previews and nothing else. It is a measurement of
  `SetPerformance.chaseIndex`, it arrives after the print run is locked, and no
  part of the value engine reads it. It exists to be looked at
- Every set reveals. The reveal window is a phase of the core loop in
  CONCEPT.md §2, not an unlock: a set with no campaign still runs the default
  drip, still pays the attention, and still gets its (small) hype
- Events store data, not prose
- The LGS network and the direct store can sour but can never be lost. CONCEPT.md
  §7 makes LGS-only volume the floor that relationship death collapses you *to*
- `Product.unitsRemaining` is all unsold stock. The allocations hold the sellable
  subset, so their remainders sum to at most `unitsRemaining` — never exactly it.
  Unallocated stock, and stock stranded by a lost channel, is the difference

## Suggested next session

Problem 1 above: performance. `npm run sim -- --seeds=10 --years=25 --bot=all`
takes about 5s, so a 50-year x 40-seed batch is still impractical. The drops
pass did not move that: 36 runs x 25 years takes 3.7s, the same ~0.1s per run it
took before.

The other open slices of problem 2, roughly in order of how self-contained they
are: grading and pop reports, then rivals and regions, then the remaining
secondary-market actors.

Re-run these before you touch the value engine again:

```
npm run sim -- --seeds=30 --years=25 --bot=conservative   # the five value targets
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist   # the decile ladder
```

The value targets after both systems passes, 30 seeds x 25 years,
`conservative`. All four are still inside their bands, but read the last row:

| Metric | Band | Before | After drops | After reveal window |
|---|---|---|---|---|
| `surpriseGrail` | 15–40% | 33% | 33% | 23% |
| `top1PctShare` | 0.4–0.7 | 0.59 | 0.594 | 0.575 |
| `medianCardPrice` | a few dollars | $3.82 | $4 | $4 |
| `yearsToFirst100Dollar` | 3–8 | 7.6 | 7.6 | 4.9 |

Drops moved nothing, as they should not: `SealedMarket.heat` prices sealed
product only and singles never see it. The reveal window moved
`yearsToFirst100Dollar` from 7.6 to 4.9, and the cause is not subtle — every set
now opens at `1.6 + hype * heatFromHype` instead of a flat 1.6, so even the
small default campaign starts the whole population slightly hotter. If that is
too fast, `hype.heatFromHype` is the knob, and the five targets get re-measured
as one unit afterwards.

Neither pass cost anything worth having: 30 runs x 25 years went from 3.86s to
4.02s across both, about 4%.

The release-cadence sweep is the other regression. It still puts the profit
optimum at 18 weeks after the value rework:

| cadence | 6wk | 10wk | 14wk | **18wk** | 26wk | 34wk | 52wk | 78wk |
|---|---|---|---|---|---|---|---|---|
| survived | 0/10 | 0/10 | 10/10 | **10/10** | 10/10 | 10/10 | 10/10 | 10/10 |
| net worth | — | — | $2.9M | **$24.4M** | $17.8M | $13.5M | $8.7M | $6.0M |
