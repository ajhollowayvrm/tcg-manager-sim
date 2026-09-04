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
src/sim/world.ts       initial state bootstrap (incl. the grader roster)
src/sim/engine.ts      tick loop + STUB value math
src/sim/invariants.ts  dev assertions
harness/bots.ts        seven strategy bots
harness/metrics.ts     per-run balance metrics + CSV
harness/runOne.ts      one run, shared by the runner and the workers
harness/worker.ts      batch worker thread
harness/run.ts         CLI runner + thread pool
```

Run it:

```
npm run sim:quick
npm run sim -- --seeds=40 --years=50 --bot=all
npm run sim -- --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist
npm run sim -- --jobs=1          # force the synchronous path
```

Batches shard across worker threads by default (one per core). Runs are
independent and seeded, so the CSV is byte-identical to the synchronous path —
only the wall clock moves. `--jobs=1` forces the old path for debugging, and
`--dist` forces it too, since the decile ladder reads a finished world.

`--dist` prints a price decile ladder for the last run. Use it, not the median
and max columns, when you change anything in the `value` config block: only the
step between deciles tells a power law from flat mush.

Runs through `tsx`, no build step. Node 22.6+ can also strip the types itself
(`node --experimental-strip-types harness/run.ts`) if you would rather not have
the dependency in the loop.

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
  | net worth | — | — | $6.2M | **$21.9M** | $17.9M | $12.6M | $8.9M |
  | fatigue | 0.86 | 0.96 | 0.76 | **0.61** | 0.37 | 0.35 | 0.22 |

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
- Batch runs shard across worker threads. A run is a pure function of
  (bot, seed, years, config), so the batch was always embarrassingly parallel
  and simply wasn't taking it. `runOne` is the shared unit, `worker.ts` pulls
  one task at a time (a static split leaves three threads waiting on
  `chaseMaxxer` while `flooder` dies in year two), and results reassemble in
  task order so the CSV never depends on which thread finished first.

  The engine got cheaper first, and byte-identically: the tick cache used to
  validate itself with `Object.keys().length` over three maps every tick, which
  in a mature run is a 1750-element key array allocated to prove nothing had
  changed. It is a version counter now, bumped at every mint site, with
  `checkRosterCache` in the invariant pass as the safety net — which paid for
  itself immediately by catching a set roster read before `releaseSet` had
  minted that tick's printings.

  42 runs x 25 years, 4 cores: 15.8s -> 12.2s on the engine work, -> 5.4s with
  threads. The CSV hashes identical at every step, which is the whole acceptance
  test for a change that is supposed to be free. The batch this handoff used to
  call impractical — 40 seeds x 50 years, all seven bots, 280 runs — now takes
  2m09s on four cores, invariants clean.
- The reveal signal is worth paying for. It used to score r = 0.93 on the
  *default* window with no campaign at all, so every lever in the window bought
  nothing. Two things were wrong. The error was additive and then clamped at
  zero (`Math.max(0, truth * (1 + noise))`), and clipping inverted the
  mechanism outright: swept past sigma 3, a sixteen-preview campaign scored
  *worse* than no campaign, because its extra draws piled onto the floor and
  threw away the ordering the previews had bought. It is lognormal now, so the
  error only ever shrinks with previews. Then `signalNoiseSigma` is 2.0:

  | sigma | 0.55 | 1.0 | 1.5 | **2.0** | 3.0 | 5.0 |
  |---|---|---|---|---|---|---|
  | no campaign | 0.93 | 0.81 | 0.67 | **0.55** | 0.39 | 0.22 |
  | 16 previews | 0.99 | 0.96 | 0.91 | **0.86** | 0.75 | 0.55 |

  A blind publisher explains about a third of the variance; a fully worked
  window about three quarters. Nothing reads the signal back, so the value
  targets did not move.
- The `drops` block is swept. `unitsPerScalperReference` was 1 — a scalper had
  to flip a unit per stride to count as fully employed, which no drop cadence
  supplies — so crowding was near zero for everyone, the trade never cleared
  its hurdle, and the population decayed onto `minScalpers` and stayed. At 0.3
  scalpers take about a quarter of a drop's units, the population settles near
  900 with both rails an order of magnitude away, and it still booms and busts
  about every six years.

  | ref | 1 | 0.5 | **0.3** | 0.2 | 0.1 | 0.03 |
  |---|---|---|---|---|---|---|
  | to scalpers | 11% | 18% | **27%** | 36% | 54% | 75% |
  | population | 127 | 355 | **890** | 1903 | 5974 | 28899 |
  | cycles / 25y | 13.0 | 9.7 | **4.5** | 2.2 | 1.9 | 2.5 |

  Below ~0.1 it runs away toward `maxScalpers` and stops cycling — the exact
  failure the per-capita return was built to avoid. It holds over a longer run
  rather than creeping: at 40 seeds x 50 years the population averages ~2000
  against a 40,000 cap, takes 39-41% of drop units, and still cycles about
  twenty times. `scalperCycles` and
  `peakScalpers` are new harness metrics, read off the crash events, because
  the end-of-run population alone cannot tell a healthy cycle from a flat line.
- Grading and pop reports. The market grades cards, not the publisher: what the
  publisher decides is print quality, which moves the grade distribution, and
  brand standing, which decides how many graders bother covering them
  (CONCEPT.md §6.4, §7). `Population.graded`, `PrintingMarket.gradedPrices`,
  `gradedHistory`, `Grader` and `MarketState.gradingQueue` were all declared and
  dead before this pass.

  A copy is only submitted once its raw price clears a grader's fee several
  times over, so the fee is the hurdle that keeps bulk commons out of the pop
  report: about 5% of printings in a 50-year run carry one at all, and on those
  about 18% of the opened copies end up in slabs. The submitter buys the best
  service tier the card can justify, so an expensive card also comes back
  faster. Grades come off a latent condition score — a normal whose mean is
  `printing.qualityGradeShift` plus the grader's strictness minus handling wear,
  split into tiers by CDF rather than a roll per copy.

  Print quality is the dial, and it shows up years later in the pop report:

  | quality | budget | standard | premium |
  |---|---|---|---|
  | share of graded copies that are 10s | 2.7% | 9.6% | 20.5% |

  A graded price is the raw price times the grade's multiple, the grader's
  reputation, and the printing's position in that grader's pop report for that
  grade. The pop-report term is what makes a 10 that a hundred other people also
  have a different card from the only one: median gem premium is 5.2x raw, and
  the ladder runs about 2.5x at the crowded end to 10x at the scarce end. It
  also means premium printing does not simply win — `chaseMaxxer` gets twice
  the 10s and each one carries a smaller premium (4.2x against `conservative`'s
  4.9x), because its own gems crowd its own pop report.

  Two graders cover the market from tick 0. The third is dormant and enters when
  brand standing clears `grading.sideGraderBrandGate`, which is the CONCEPT.md §7
  row that pays brand standing in graders. `specialtyOnly` never earns it.

  Nothing in the value engine reads any of this back. Grading is an observer:
  it reads `market.rawPrice` and writes beside it.
- CSV output + console summary table, plus separate drops, reveal-window and
  grading tables that print only for runs that produced any
- Config overrides from CLI without touching code
- Sparse price history with quarterly compaction of anything older than 10 years

## Known problems — these are the next tasks

**1. Performance — the batch is affordable now, the single run is not much faster.**
Batches shard across cores, and that is where the 3x came from. What is left is
the engine itself, where `tickPrices` is still about 20% of a run and the only
remaining ideas change behaviour: backing a cold printing off to a longer stride
changes RNG draw counts, so it cannot be validated by hashing the CSV — it has
to be re-measured against the five value targets and the decile ladder as one
unit. Typed arrays for the hot price loop are the other candidate and are
behaviour-neutral, but they mean giving up the object model in `tickPrices`.

**2. Large parts of the model are declared but not simulated.**
Regions beyond `reg_us`, collabs, creators, rival publisher behavior, chains and
preorders all exist in `types.ts` and are untouched by `engine.ts`.
`applyDecision` now handles thirteen decision types; `commissionArt`,
`hireArtist`, `signCollab`, `unlockRegion` and `advance` still fall through to
`default`.

Drops, scalpers, the reveal window and now grading came off this list — see
"Verified working". Of the secondary market actors in CONCEPT.md §6.8, scalpers
now behave; `resellers`, `collectors` and `speculators` are still plain numbers.
`collectors` is read as a demand pool by `resolveDrop` and nothing else.
`SetPerformance.aftermarketIndex` is still written as 0 and read by nothing.

Grading is deliberately one-way: it observes the raw price and never feeds back
into it. The obvious next step is the one that does — a slabbed copy has left
the raw pool, so `tickPrices` should arguably compute scarcity over
`opened - graded` rather than `opened`. That is a change to the value engine,
not to grading, and it has to be re-measured against all five value targets and
the decile ladder as one unit.

**3. What is still unswept.**
Both knobs this section used to name are done — see "Verified working". What has
never been swept: the `hype` block beyond the signal sigma (`marketingHypeGain`,
`prereleaseHypeGain` and `heatFromHype` are all first guesses), and
`drops.breakEvenPremium` / `populationGrowth`, which set how sharply the scalper
population reacts rather than where it settles, and the whole `grading` block
past the four numbers that were moved to get the pop report into a believable
range (`tierMultiplier`, `popScarcityReference`, `popScarcityCeiling`,
`sideGraderBrandGate` — the last swept, the others fitted by eye against the
measured pop distribution). `submitRatePerTick` and `feeWorthMultiple` between
them decide how much of the population ends up in slabs, and neither has been
swept against anything. `heatFromHype` is the one with a
measured consequence already: it is what moved `yearsToFirst100Dollar` from 7.6
to 4.9, because every set now opens at `1.6 + hype * heatFromHype` instead of a
flat 1.6.


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
- A batch is only shardable because a run touches nothing shared. Keep `runOne`
  a pure function of (bot, seed, years, config): the moment a run reads or
  writes anything outside its own state, the threads stop agreeing with
  `--jobs=1` and the CSV hash stops being a usable acceptance test
- The tick cache is validated by a version counter, not by counting keys. Any
  new site that mints a printing, product, set or IP must call `bumpRoster`, or
  the entity will not be ticked until something else mints one.
  `checkRosterCache` in the invariant pass is what catches that
- Grading draws from `s.gradingRng`, never from `s.rng`. Grading observes the
  value engine, so its rolls must not renumber the value engine's: sharing the
  main stream shifts every later draw in the run and makes the five value
  targets incomparable across any change to grading. The world bootstrap seeds
  the grader roster with literals for the same reason — a single `rand` call
  there moves every balance number in this file
- Nothing in the value engine reads grading. `Population.graded` and
  `gradedPrices` are written beside `rawPrice`, never into it. Wiring the
  feedback (slabbed copies leaving the raw pool) is a value-engine change and
  is measured as one — see "Known problems"
- The grading fee is the hurdle. A copy is graded only once its raw price clears
  a tier's price several times over, which is what keeps 95% of printings out of
  the pop report. Dropping `feeWorthMultiple` toward 1 slabs the bulk commons
  and the pop report stops meaning anything
- Grades come off a latent condition normal split by CDF, not a roll per copy. A
  submission of 4,000 copies must never cost 4,000 draws
- Events store data, not prose
- The LGS network and the direct store can sour but can never be lost. CONCEPT.md
  §7 makes LGS-only volume the floor that relationship death collapses you *to*
- `Product.unitsRemaining` is all unsold stock. The allocations hold the sellable
  subset, so their remainders sum to at most `unitsRemaining` — never exactly it.
  Unallocated stock, and stock stranded by a lost channel, is the difference

## Suggested next session

Problem 2, continued: the model that is declared and not simulated. Grading came
off the list this pass. What is left, roughly in order of how self-contained
each slice is — rivals and regions, then the remaining secondary-market actors
(`resellers`, `collectors` and `speculators` are still plain numbers;
`collectors` is read as a demand pool by `resolveDrop` and nothing else).

The other candidate is the grading feedback loop described under problem 2:
graded copies leave the raw pool, so `tickPrices` arguably owes them a scarcity
term. That one is a value-engine change and gets measured like one.

Performance is no longer the thing in the way. A batch shards across cores, and
the remaining engine cost is concentrated in `tickPrices`, where every idea left
either changes behaviour (see problem 1) or means giving up the object model.

Re-run these before you touch the value engine again:

```
npm run sim -- --seeds=30 --years=25 --bot=conservative   # the five value targets
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist   # the decile ladder
```

The value targets, 30 seeds x 25 years, `conservative`. Grading moved none of
them, and not approximately: every pre-existing column of `runs.csv` is
byte-identical across all 30 seeds before and after the pass. That is the whole
acceptance test for a subsystem that is supposed to observe the value engine
without touching it, and it is only available because grading draws from its own
RNG stream.

| Metric | Band | Before | After drops | After reveal window | After balance pass | After grading |
|---|---|---|---|---|---|---|
| `surpriseGrail` | 15–40% | 33% | 33% | 23% | 23% | 23% |
| `top1PctShare` | 0.4–0.7 | 0.59 | 0.594 | 0.575 | 0.575 | 0.575 |
| `medianCardPrice` | a few dollars | $3.82 | $4 | $4 | $4 | $4 |
| `yearsToFirst100Dollar` | 3–8 | 7.6 | 7.6 | 4.9 | 4.9 | 4.9 |

Grading costs about 9% of run time (30 seeds x 25 years: 4.70s -> 5.20s on four
cores) and about 20% more history points.

`yearsToFirst100Dollar` at 4.9 is still the row to watch. The cause is not
subtle — every set opens at `1.6 + hype * heatFromHype` instead of a flat 1.6,
so even the small default campaign starts the whole population hotter. If that
is too fast, `hype.heatFromHype` is the knob, and the five targets get
re-measured as one unit afterwards.

The release-cadence sweep is the other regression, and cadence is a bot
constant rather than a config path, so it needs a scratch script that calls
`makeSetBot` with the cadence under test. It still puts the profit optimum at 18
weeks, and over-releasing is still a cliff where under-releasing is a slope:

| cadence | 6wk | 10wk | 14wk | **18wk** | 26wk | 34wk | 52wk | 78wk |
|---|---|---|---|---|---|---|---|---|
| survived | 0/10 | 0/10 | 10/10 | **10/10** | 10/10 | 10/10 | 10/10 | 10/10 |
| net worth | — | — | $6.2M | **$21.9M** | $17.9M | $12.6M | $8.9M | $6.1M |
| fatigue | 0.86 | 0.96 | 0.76 | **0.61** | 0.37 | 0.35 | 0.22 | 0.18 |
