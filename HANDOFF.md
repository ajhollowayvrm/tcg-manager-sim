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
src/sim/regions.ts     regional taste, market entry, noisy region readings
src/sim/actors.ts      collectors, resellers, speculators, named creators
src/sim/world.ts       initial state bootstrap (incl. the grader roster)
src/sim/engine.ts      tick loop and the value engine
src/sim/invariants.ts  dev assertions
harness/bots.ts        the strategy bots
harness/metrics.ts     per-run balance metrics + CSV
harness/runOne.ts      one run, shared by the runner and the workers
harness/worker.mjs     worker entry point (installs the TypeScript loader)
harness/worker.ts      batch worker body
harness/run.ts         CLI runner + thread pool
```

`npm run typecheck` runs `tsc --noEmit` over `src` and `harness`, and passes
clean. It is the only static check; `checkInvariants` is the only runtime one.

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

A worker thread does not inherit the parent's module loader, so the pool starts
on `harness/worker.mjs`, which installs the TypeScript loader and then imports
`worker.ts`. Starting a thread on the `.ts` file directly fails with
`ERR_UNKNOWN_FILE_EXTENSION` even though the parent is running under `tsx`.

## Verified working

- Runs 50-year simulations headless, deterministic from seed
- Invariant checks pass clean across all bots
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

  **The net-worth row above predates the difficulty pass** and is not comparable
  to anything the harness prints today: weekly overhead, storage and the lower
  reference demand all landed after it was measured. The shape — an optimum with
  a cliff on the fast side — is what this row is kept for. Re-measuring the
  levels is a scratch-script job, because cadence is a bot constant rather than
  a config path.
- The price distribution is a power law, not flat mush. `Printing.truth.chase`
  is a hidden lognormal roll made once per printing, so two commons in the same
  set do not settle at the same price; `market.nostalgia` now compounds only on
  a printing the market still wants and that already stands above the pack, and
  decays back toward 1 on one it does not. 30 seeds x 25 years, `conservative`:

  | Metric | Target | Measured |
  |---|---|---|
  | `surpriseGrail` | 15–40% of runs | 30% |
  | `top1PctShare` | 0.4–0.7 | 0.584 |
  | `medianCardPrice` | a few dollars | $4 |
  | `yearsToFirst100Dollar` | 3–8 | 5.2 |

  The decile ladder (`--dist`) steps 1.33-1.41x through the middle deciles and
  1.73x, 19x, 12.5x across p90, p99 and the top. Widening steps are the shape;
  equal steps are the mush this replaced. `surpriseGrail` uses CONCEPT.md §10's
  100x bar, not the 20x one it used to.

  **The top tail has steepened** across the region, actor and difficulty passes:
  the p99 step was 2.7x when this section was first written and is 19x now.
  `top1PctShare` is still inside its band, so nothing here is out of tolerance,
  but it is the row to watch next.
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
- The art pipeline. `commissionArt` and `hireArtist` were the last two decision
  types inside the core loop still falling through to `default`, and five
  `Artist` fields — `rate`, `turnaroundWeeks`, `exclusiveTo`, `available` and
  the artist half of `relationship` — were declared and read nowhere.

  The asymmetry is what made this worth building: the whole *reward* half was
  already live. `artQuality * artist.reputation` multiplies every price, the
  value engine reads that reputation live, and `Artist.growth` compounds a
  career in the dark. Nothing paid for any of it. `designCard` rolled quality
  free at design time, so the best art in the game cost nothing, took no time,
  and was available to everybody at once.

  A commission is now money now for art later. The fee leaves at placement and
  the illustration returns `turnaroundWeeks` afterwards, which is what forces
  art to start before `commitPrintRun` rather than after it. Three things keep
  it honest:

  - **A card whose art has not landed by release ships anyway**, as house
    filler at the quality floor. Missing the calendar costs quality; it must
    never be able to hold a release hostage. The commission is still paid for.
  - **The late tail is exponential, not uniform.** Reliability is blowout risk,
    not a predictable slip: an unreliable artist goes quiet for a month. A
    uniform slip mathematically cannot cross the 18 weeks between commit and
    release, which made the schedule decorative — measured, 2.7% of commissions
    now miss, against 0% before the change.
  - **A rate is driven off `baseRate`, never off today's rate.** Computing the
    target from the current rate compounds: a career-long reputation climb
    turned into a bill of $191 billion in the first run of this pass.

  `hireArtist`'s three declared terms each mean something. `perCard` is no
  standing arrangement; `retainer` is a weekly bill that buys a discount and
  gets your briefs taken regardless of relationship; `exclusive` is a larger
  weekly bill that sets `exclusiveTo` and locks the artist away from everyone
  else. Exclusivity is the whole of that mechanism now that rivals are cut:
  it is a cost the player pays to deny nobody, and it has to earn its bill on
  the discount and the guaranteed brief alone.

  The roster drifts: newcomers arrive unproven and cheap, reputation drags
  rates up behind it, and the established retire. Without that, scouting is a
  puzzle you solve once in year one and never think about again.

  Two probe bots make the gamble measurable, both `conservative` in every other
  respect. `scout` commissions the cheapest artist on the board and signs them
  exclusively; `safeHands` buys visible reputation at 2.5x rate on a retainer.
  Over 20 seeds x 50 years:

  | | scout | safeHands |
  |---|---|---|
  | mean `artQuality` | 0.49 | 0.65 |
  | reputation gained by its artists | 0.760 | 0.288 |
  | art spend | $18.4k | $45.1k |
  | median top card | $6,124 | $6,900 |

  **The table above predates the art repricing** — an illustration cost between
  fifty cents and three dollars when it was measured. Re-measured at the shipped
  rates over 20 seeds x 50 years, `scout` beats `safeHands` on top card in 12 of
  20 seeds, and the gamble gained a second dimension: `scout` survives 20/20
  where `safeHands` survives 15/20, because buying visible reputation costs
  26.9% of revenue against `scout`'s 1.6%. Buying low reliably leaves more room
  to climb and just as reliably fails to guarantee the outcome. If scouting ever
  won every seed, `growth` would not be hidden enough to be a bet.
- CSV output + console summary table, plus separate finance, region, secondary
  market, creator/chain, collab, drops, reveal-window, grading and art tables
  that print only for runs that produced any
- Config overrides from CLI without touching code
- Sparse price history with quarterly compaction of anything older than 10 years
- **Regions.** `src/sim/regions.ts`. Four markets; only the US is open at tick 0.
  A region is a decision rather than a bigger number for three reasons: the fee
  is only the door and its channels are still bought one at a time behind their
  own brand gates, its taste is hidden ground truth that `mismatchPenalty`
  discounts a badly-matched set against, and what you can see of it improves
  with `knowledge`.

  `readRegion` is the region twin of the reveal window's signal — built the same
  way, for the same reason. `CardSet.regionReadings` freezes what a reading said
  at the moment the print run locked, which is the only moment at which scoring
  it means anything, and the harness scores it: **r = 0.43** over 10 seeds x 30
  years. Informative, and wrong often enough to be a bet.

  A set ships region by region on `entryLeadWeeks`, and `tickSales` refuses a
  product before its own region's date. Several SKUs in one region split that
  region's demand; SKUs in different regions do not, which is what makes opening
  one worth the fee.
- **The other three secondary-market actors.** `src/sim/actors.ts`. Collectors
  take copies off the market permanently, resellers open sealed product on
  stream, speculators buy heat and sell it back — and only the speculators have
  a sign that flips. Over 10 seeds x 30 years the three separate by strategy
  rather than sitting on a rail: `specialtyOnly` draws the fewest resellers and
  `flooder` the most, and the speculator population swings 5.5x to 10x.

  All three pinned to a rail on the first wiring, which is the same failure
  `unitsPerScalperReference` had, and all three causes are worth remembering.
  `collectorDensityReference` put a healthy run exactly on the ceiling.
  Speculator return read per-unit, which is positive feedback with no brake —
  it is per-capita now, the shape the scalper loop proved. And the rip return
  averaged over every product ever printed, where one appreciated vintage case
  drowns the new boxes a streamer actually opens.
- **The grading feedback loop**, which used to be listed under Known problems.
  A slabbed copy has left the raw pool and a collected copy is not coming back,
  so `tickPrices` computes scarcity over what is tradeable rather than over
  everything ever printed. It is the same term as the collector mechanic, so the
  two were measured once rather than twice.
- **Collabs.** Offers arrive on a brand-standing gate and lapse if you cannot
  afford them, which is what makes cash between print runs worth holding. The
  trade is reach for equity: a collab reaches segments your brand does not and
  returns only `collabs.exposureShare` of the usual exposure to your own IPs,
  because the licensor's audience came for the licensor. Over 12 seeds x 30
  years `licensor` ends on mean IP affection 44.0 against `conservative`'s 53.5
  — it sells, and it does not own.
- **Creators.** A creator is not the reseller population in miniature: the
  population says how much product gets opened, a creator says which card the
  market is talking about this week. Coverage lands on fresh printings and on
  their affinity IPs and moves heat by reach times influence, so a big channel
  with no credibility and a small one with a lot of it land in the same place.

  The relationship converges on how much fresh product there is to cover, and
  must not be paid out of coverage: coverage odds already rise with the
  relationship, so paying it that way is a feedback loop with no stable middle.
  It pinned at 0.99 in every seed on one setting and collapsed to 0.04 on the
  next. Measured now: 0.43 for `specialtyOnly`, 0.58 for `conservative`, 0.72
  for `attentionBurner`.
- **Chains.** `designCard` takes an optional `progressionLink` and the engine
  mints the chain on first reference. Only printed members count, and a chain
  spanning sets pays `spansSetsBonus` more — CONCEPT.md's "hedge that can carry
  a set with a weak subject" is only true if it beats a chain inside one set.
  `chainRunner` and `chainWeaver` both beat `conservative` ($6.9M and $7.5M
  against $5.7M) and the weaver carries the least unsold stock of the three.
- **The studio can die of four different things.** See "Difficulty" below.
- **`SetPerformance.aftermarketIndex`** is written for the first time: 3.3x for
  `conservative`, 0.7x for `flooder`. It is the one way to tell a set that sold
  badly but became valuable from a set that did neither.
- **No decision type falls through to `default`.** `advance` is an explicit
  no-op in the reducer, with the reason written down: it runs ticks, and a tick
  runs the reducer, so applying it there would re-enter the loop it was
  submitted into. `advance()` is exported for callers that want to skip weeks.

## Difficulty

The banked finding was that six of seven bots survived 100% of runs and the only
death was `flooder` in year one. Three structural causes, all fixed:

- **Demand was a property of the print run.** `tickSales` computed the pool as
  `p.unitsPrinted * 0.06`, so printing more conjured more buyers. That one term
  is why sell-through sat at 0.97 for every strategy, why the blind bet had no
  downside, and why *no demand-side lever in the game could be swept* — hype, a
  collab and a region all reached demand that was already being met. Demand now
  comes off the audience, against `attention.referenceRunUnits`.
- **Time was free.** Every outflow was discretionary, so a publisher that
  released nothing paid almost nothing. `finance` carries a weekly overhead now
  — a base, a per-channel line and a per-region line — so reach costs money to
  run and doing nothing runs the $500,000 out in about five years.
- **Inventory was free to hold.** `storagePerUnitPerTick` is a cent a unit a
  week: about $10k a year on a normal 20,000-unit tail and about $624k a year
  against $442k of revenue on 1.2 million units. Overprint death is unreachable
  without it.

20 seeds x 30 years, 18 bots. Re-measured on 2026-09-04, after rivals were cut:

| Survival | Bots |
|---|---|
| 100% | `licensor`, `chainRunner`, `chainWeaver`, `conservative`, `chaseMaxxer`, `dropRunner`, `scout` |
| 95% | `hypeBuilder`, `channelHog` |
| 50-70% | `safeHands` 70%, `hypeGambler` 65%, `bigBets` 50% |
| under 50% | `allIn` 35% |
| 0% | `smallBets`, `globalist`, `flooder`, `attentionBurner`, `specialtyOnly` |

Deaths land in years 4-23 rather than year one, except `flooder` (0.9) and
`attentionBurner` (2.2), which are the flood-death and attention-death
regressions and are meant to. `hypeGambler` ends on the largest net worth in the
roster at $14.2M and dies in a third of its seeds, which is the risk-reward
frontier the target asked for.

**Cutting rivals moved these numbers without changing any formula.** The
`RIVALS` bootstrap loop drew 15 values off `s.rng`, so removing it renumbered
every later roll. Measured on the same seeds either side of the cut, survival
moved `bigBets` 60%->50%, `allIn` 40%->35%, `hypeGambler` 55%->65% and
`conservative` 100%->100% ($5.7M->$5.8M) — both directions, small, and
consistent with a reshuffle rather than a shift. The share term it removed was
`share / referenceShare` = `0.08 / 0.08`, which was exactly 1 for the player on
every tick of every run.

All four of CONCEPT.md §7's death routes fire: `overprint`, `debt_spiral`,
`channel_collapse` and `attention_collapse`. The last of those was never
classified at all, so it could not be reported however often it happened;
`attentionBurner` floods on `flooder`'s cadence with runs a sixth the size,
survives the printing bill, and dies of the audience at year 2.2 with fatigue
0.91 and attention 0.11 in every seed. A fifth route, `irrelevance`, was cut
with rivals.

The reveal window is a real decision space now, and two of the reasons it was
not were defects rather than balance. `submitMarketing` re-submitted its slice
every tick of an 18-week window without tracking what had gone out, so a stated
$50,000 budget spent $150,000 — every measurement of whether marketing pays was
made against three times the bill under test. And hype decayed in a couple of
months while the print run it was built for sells over years. Measured over 20
seeds x 30 years:

| strategy | lived | net worth |
|---|---|---|
| no campaign | 20/20 | $7.1M |
| previews + 1.6x run | 17/20 | $11.7M |
| previews + prerelease + 1.6x run | 20/20 | $11.9M |
| previews + marketing + 1.6x run | 20/20 | $11.1M |
| everything + 2.2x run | 14/20 | $14.6M |

A campaign is worth running when it lets you print a bigger run, and that is
also how it becomes a way to lose. Over-buying demand for the run size you
committed to is simply waste.

## The per-set price measurement (tuning Round 0, 2026-09-04)

`harness/runOne.ts` now snapshots each set's US, non-reprint price vector at
ages 1, 2, 3, 8, 15 and 25 years. `out/sets.csv` carries one row per
(bot, seed, set, age); `runs.csv` carries a median-across-sets reduction at
age 2. This is the statistic the real-world targets are stated against — one
set's card list at one age, which is what a Scryfall set list is.

The old price columns pool **every printing ever made across fifty years**, so a
year-1 common sits beside a year-50 common. They are kept, and they answer a
different question. Do not compare them to a real set.

**Measured for `conservative`, 30 seeds x 50 years:**

| Age | sets | median | under $1 | top 10% | gini | chase/med | alpha |
|---|---|---|---|---|---|---|---|
| 1 | 1470 | $2.78 | 9% | 0.44 | 0.54 | 17 | 2.52 |
| 2 | 1440 | $3.26 | 6% | 0.45 | 0.54 | 18 | 2.49 |
| 3 | 1410 | $3.45 | 6% | 0.45 | 0.55 | 19 | 2.46 |
| 8 | 1260 | $4.13 | 3% | 0.49 | 0.58 | 25 | 2.31 |
| 15 | 1050 | $4.60 | 3% | 0.60 | 0.66 | 50 | 2.06 |
| 25 | 750 | $4.85 | 1% | 0.78 | 0.81 | 156 | 1.87 |

Three findings, and the third is the one that matters.

**1. The chase/median ratio was never right.** The whole-catalogue metric read
~1,125x against a measured real ~1,000x, and this document called it excellent.
Per set it is **18x at age 2**. The 1,125x was an artefact of pooling fifty
years — cheap old cards against expensive new ones — not spread within a set.

**2. Nothing ever becomes bulk.** Share under $1 runs 9% at age 1 down to 1% at
age 25. Real sets run 64% at age 1, rise to about 90% by age 8-15, then fall
back to 69-82% by age 25. Our cards only ever get more valuable.

**3. Our sets are born flat and slowly separate. Real sets are born unequal and
then decay.** We start at gini 0.54 and reach 0.81 by age 25. A real set is
already near 0.85 at age 1-2. The nostalgia engine is doing its job — the
concentration metrics all move the right way, and by age 25 `top10Share` hits
0.78 exactly on target — but it is doing it **twenty-three years too late**, and
it is doing work that rarity and the chase roll should have done on release day.

That reframes the value-block round. It is not only "lower the median 11x". It
is "make a set born unequal, and let it decay to bulk afterwards". The first
half points at `value.chaseSigma` (0.65 today; the research names a body log-SD
of 1.2-1.9) and the rarity ladder, not at the nostalgia triple.

## Tuning reference

`docs/tuning/` carries the reference documents for the balance run:

- `01-knobs.md` — all 207 `SimConfig` paths, with what each one moves and
  whether it was swept, fitted by eye, or never measured.
- `02-hardcoded.md` — the tunable values `--set` cannot reach: the constants
  inside the formulas, `CHANNEL_TRAITS`, the `world.ts` bootstrap, and the bot
  constants. It also records three duplicated constants and one live defect
  (newcomer artists are minted at $0.50-$3.00 a card, 100x below the roster
  `world.ts` seeds).
- `03-targets.md` — the number each system must produce, and the knob that
  moves it.
- `04-workflow.md` — how to run a sweep, and the rules a sweep must obey.
- `05-real-world.md` — measured industry numbers with sources, and what each
  one says about a knob. Includes live price vectors for 19 Magic and 8 Pokemon
  sets, measured 2026-09-04, which show our median card price is about 13x too
  high and our gem rate about 5x too low.

**Everything is tunable as of 2026-09-04.** Every balance constant moved into
`SimConfig`; the path count went from 207 to 511. `CHANNEL_TRAITS`, the rarity
tables, the grade cuts, the demand coefficient, the strides, the world bootstrap
and the grader roster are all `--set` paths now. The move was verified
byte-for-byte against a 360-run baseline.

## Known problems — these are the next tasks

**1. What is still declared and not simulated.** The list is short now.
`preorders` and the `illustrationLink` half of the chain system are untouched.
`UnlockState.marketResearch`, `communityTeam` and `analytics` are read only by
`tickRegionKnowledge`, so two of the three buy nothing. `Region.segmentMix` is
seeded and unread — regional demand draws on the global audience rather than on
a per-region one, which is a real simplification and the obvious next thing to
do to regions.

**2. Performance.** `tickPrices` is still about 20% of a run, and the remaining
ideas change behaviour: backing a cold printing off to a longer stride changes
RNG draw counts, so it cannot be validated by hashing the CSV — it has to be
re-measured against the value targets and the decile ladder as one unit. Typed
arrays for the hot price loop are behaviour-neutral but mean giving up the
object model in `tickPrices`.

**3. What is still unswept.** Much less than before. The `art` and `hype` blocks
are swept, and so are the two grading knobs this section used to name — they do
different jobs (`feeWorthMultiple` decides which printings clear the hurdle at
all, 19.8% of them at 2 and 2.8% at 25; `submitRatePerTick` decides how many
copies of those get sent, 13% to 31%) and at the shipped values they give 6.0%
of printings and 18.6% of copies, which is the range the pop report was fitted
to.

Still unswept: `drops.breakEvenPremium` and `populationGrowth`, which set how
sharply the scalper population reacts rather than where it settles; the rest of
the `grading` block (`tierMultiplier`, `popScarcityReference`,
`popScarcityCeiling` were fitted by eye); the whole `collabs`, `creators`,
`chains` and `actors` blocks, all wired for shape rather than balance; and
`hype.heatFromHype`, which is what puts every set's opening heat at
`1.6 + hype * heatFromHype` and is the most likely cause of the steepening top
tail noted under the power-law bullet.

**4. Three probe bots are unviable and it is not clear they should be.**
`smallBets` dies in 20/20 seeds of `debt_spiral` — under-printing means never
clearing the `minimumOrder` on the distributor or the big box, so a small
printer is locked out of reach and cannot cover its overhead. `globalist` dies
in 20/20, of `channel_collapse` in most: expanding doubles your channel
obligations and the distributors sour.

`specialtyOnly` also dies 20/20 of `debt_spiral`, at a median year 21.3, and
**this contradicts a comment shipped in `config.ts`.** The
`weeklyOverheadBase` note claims "At $1,000 the base is survivable on its own",
citing `specialtyOnly` going from 100% to 0% survival at $2,000. At the shipped
$1,000 it measures 0% over 20 seeds x 30 years — with rivals present as well as
without, so the cut did not cause it. Either the overhead sweep was run at a
shorter horizon than 30 years, or something has moved under it since. The knob
is not necessarily wrong; the claim attached to it is.

All three are plausible mechanisms and all three may simply be too harsh. None
has been tuned.


## The population bug and the nostalgia floor (tuning Round 4a, 2026-09-05)

Round 4 started as a pure tuning round and found two defects first. Both are
corrections, not fits. This section records them before the value sweep moves
every number again.

**`tickSealed` minted copies.** Opening a pack moved copies from `sealed` to
`opened` at `rarity.pull[rarity] / rarity.pullDivisor`. That table is copies per
pack at `rarity.referenceSetSize`, which is 70. The printing's own `pr.pullRate`
is the rate that carries the set size, and `releaseSet` prints against
`pr.pullRate`. At 280 cards a set the two disagree by a factor of four, so a set
opened four copies for every one it printed. `population.sealed` clamped at zero
while `population.opened` grew without bound, so a printing's population
inflated with age. Every old card got cheaper supply that nobody ever printed.
`tickSealed` now reads `pr.pullRate`.

Round 3 introduced this and nothing caught it for a whole round. So
`checkInvariants` now asserts the rule the bug broke: `sealed + opened` must not
pass `printQuantity`. The population is fixed at release and opening a pack
moves a copy, so the two halves must always sum to the print run. The 1%
tolerance is float drift and nothing else.

**Nothing could fall.** `value.nostalgia` was clamped to a floor of 1, so no
term in the price stack could push an old card under its release price. A set's
bulk share fell with age, where a real set's bulk share rises. The new knob
`value.nostalgiaFloor`, at 0.2, lets a forgotten printing decay. The gate that
decides who falls already existed: it reads desire and price standing, so the
cheap half decays and the top keeps climbing.

**What the two fixes bought.** Measured on `npm run check`, 46 gates, 27 PASS,
0 FAIL, 19 KNOWN.

| Gate | Round 3 bank | Round 4a | Band |
|---|---|---|---|
| `shape.median` | 8.47 | 7.73 | 0.20–0.50 |
| `shape.gini` | 0.579 | 0.590 | 0.72–0.98 |
| `shape.top10` | 0.493 | 0.501 | 0.66–0.95 |
| `shape.ageCurveDirection` | −0.004 | 0.000 | 0.02–0.45 |
| `shape.ageCurveLate` | 0 | 0.018 | 0.55–0.92 |

The age curve stopped running backwards and now runs flat. It did not start to
rise, because a floor at 0.2 cannot bite while no card is near it. The body must
fall first, and Round 4 owns the body.

**Two grading gates drifted, and Round 6 inherits the reason.**
`sub.gem10Premium` went 8.53 to 11.11, and `sub.gradedPrintingShare` went 0.232
to 0.160. Both follow from the population fix: fewer opened copies make a
smaller raw pool, so the graded share falls and the slab premium rises.
`gradedPrintingShare` moved toward its band and `gem10Premium` moved away from
it. Round 6 owns both, and this is the cause.

**Neither fix draws RNG, so no stream renumbers.** Both move every price number,
so the Round 3 bank stops being numerically comparable at this commit. Round 4's
bank is the next comparable one.

**A third defect, in the harness.** `--set path=value` with a space reads as a
bare `--set` flag plus a stray positional, so `run.ts` dropped every override
and measured the defaults while it claimed to measure the point. That
invalidated the first Round 3 stride measurement. `run.ts` now throws on a
spaced `--set`. Only `--set=path=value` is valid.

## The counts (tuning Round 3, 2026-09-05)

Every count moved to its real value in one step, because `cardsPerSet`, the
artist roster and the creator roster all change RNG draw counts and doing them
separately pays the re-measurement cost several times over. `cardsPerSet` is
280 on the nine baseline bots and four times its old value on each variant,
`art.maxRosterSize` is 170 with an opening roster of 42, `creators.rosterSize`
is 24 and `creators.audienceExponentMax` is 11.

**After this round, no round may change a draw count.** If one must, it goes to
the end of the run and takes a full re-measurement with it.

The suite ends at **27 PASS, 0 FAIL, 19 KNOWN, 0 DRIFT**, rebanked under
`docs/tuning/bank/round-3/`. Every gate carries a new banked value, so the
Round 1 and Round 2 banks are no longer comparable — that is what a renumbering
round costs and why there is only one of them.

### The pull rate was an absolute count, and the plan missed it

`printQuantity = totalPacks * pullRate`, and `pullRate` came straight out of
`rarity.pull` with no reference to how many cards were in the set. Summed over
the roster's rarity mix a 70-card set put about 17.5 cards in a pack; a 280-card
set put 70 cards in a pack. A booster holds the same number of cards whatever
the set size, so this was the same trap Round 2 swept for: an absolute count
that breaks the moment the thing it counts changes scale.

`rarity.referenceSetSize` is 70 and `rarityPull` scales `pull` by
`referenceSetSize / cards in the set`. A card in a 280-card set is now four
times rarer per pack, which is what a real premier set does, and
`expectedSinglesValue` — which sums the pull rate over every card in the set —
holds steady instead of quadrupling every sealed price in the game.

It costs price: the age-2 median went $3.23 to $4.49 on the card count alone,
and to **$8.47** once each card was properly four times rarer. That is Round 4's
to fix; it is now 28x its $0.30 target rather than 11x.

### Three gates this round broke, deferred with an owner

- **`diff.botsAlwaysSurvive` 7 to 1**, and only `scout` still survives every
  seed. A 280-card set commissions four times the illustrations. On a
  `conservative` seed that dies at year 9.3 the ledger reads $1.24M of art
  against $1.62M of print runs — art is 43% of the print bill. The set size is
  correct and the artist rates are not: finding 3 in `05-real-world.md` already
  says a real illustration is a flat $400-$2,500 and ours is $75-$450 rising
  with reputation, and inconsistency 1 in `02-hardcoded.md` says newcomers are
  still minted at $0.50-$3.00. That is why `scout`, which buys the cheapest
  artist on the roster, is the only bot left standing. Round 7 owns art and
  Round 10 owns difficulty; whichever lands first should report `FIXED`.
- **`sub.scalperCycles` 16 to 0.** Probed on one `dropRunner` seed,
  `scalperProfitability` crosses `breakEvenPremium` at year 8 and never comes
  back under it, so the boom latch never releases and no crash event fires. The
  population climbs to the cap instead of cycling. Nothing in the model pushes
  an old sealed product back down — `shape.ageCurveDirection` is still negative
  and `shape.ageCurveLate` is still 0 — so this is downstream of the decay to
  bulk that Round 4 owns. Read `sub.scalperShare`, which went `FIXED` at 0.242
  in the same round, beside it: the share is right because the population is
  pinned high, not because the trade found its level.
- **`shape.yearsTo100` 5.2 to 1.4.** Four times the chase draws per set, on a
  price body that is already far too high. Round 4.

Two gates went the other way and are now `pass`: `sub.scalperShare` (0.242) and
`sub.channelHogLosesReach` (6, which is the top of its band on purpose — the
next round that loses one more channel gets a `FAIL` rather than a silent drift).

### The performance work the plan asked for is not worth doing

The plan and the Round 2 handoff both named `strides.price` as the lever, on the
grounds that `tickPrices` is the hot loop, and warned that `value.priceLerp` is
not stride-invariant so it would need re-fitting in Round 4. **Measured, the
stride buys nothing.** A 30-seed 50-year `conservative` sweep runs 50.5s at
`strides.price` 4 and 49.9s at 8 with `priceLerp` compensated to 0.6156 —
inside the noise. `strides.sealed` at 8 is 49.2s. Only `strides.grading` at 8
does anything, at 42.9s, and grading is an observer whose stride Round 6 owns.

So `strides.price` stays at 4, `value.priceLerp` stays at 0.38, and **Round 4
inherits no re-fit obligation.** The cost is somewhere that is not on a stride
at all — per-tick work, or simply 14,000 printings' worth of allocation — and
nobody has found it yet. The suite went 52.3s to **185.4s**, which is roughly
the three minutes Round 2 predicted. Per AJ's standing call, correctness comes
first and this is not yet unusable.

**Correction, found in Round 4.** The first run of this measurement was invalid.
It was written `--set strides.price=8` with a space, which reads as a bare
`--set` flag plus a stray positional, so `run.ts` dropped every override and
timed the defaults five times over. The numbers above are the re-run with
`--set=`. The conclusion did not change, but it was not evidence when it was
first written. `run.ts` now throws on a spaced `--set` rather than dropping it.

## The audience system (tuning Round 2, 2026-09-04)

The audience model existed and was dead: six segments each carried a `size`
nothing ever wrote, `audienceAverages` meaned them into one number, demand read
one global scalar, and `Region.truth.segmentMix` was seeded per region and never
read. It is now three layers per (region, segment) — `population`, `reached`,
`engaged` — with demand reading `engaged`, weighted by each segment's affinity
for the set's IPs. `src/sim/audience.ts` owns the loop.

`lapsed` is no longer a segment. With the split it *is* `reached - engaged`
across every segment, so keeping it as a seventh name double-counted the same
people. The five that remain are three age cohorts that flow — kids to teens to
adults to out, on a demographic clock — and two motivations that do not.

### It works, and here is the evidence

**The growth arc.** Mean print run by decade, `conservative`, 20 seeds x 50
years: **17k, 60k, 119k, 158k, 184k**. The plan asked for 8-25k in years 1-5,
60-150k in years 20-25 and 150-250k in years 45-50. All three bands hit.
Engaged audience goes 600,000 to about 15,000,000.

**Scale-coupling holds, which is why the round exists.** Print runs grew tenfold
and the price shape did not move: a year-45 set prices at an age-2 median of
$3.80 against a year-5 set at $3.49, a **1.09x ratio** against a 2.0x
requirement, with Gini flat at 0.54 across all fifty years. Without it,
`value.referencePopulation` fixed at 60,000 against a tenfold larger surviving
population would have priced every late set as bulk.

**Bots do not converge, so the arc is not scenery.** Final engaged audience runs
from 136,000 (`attentionBurner`) to 13,100,000 (`hypeGambler`) — a 96x spread
driven entirely by how each bot plays.

**The lapsed reservoir moves.** Lapsed per engaged: `conservative` 0.54,
`flooder` 1.21, `attentionBurner` **12.22** — it reached 1,670,000 people and
engaged 137,000, having flooded them into lapsing. That is the mechanism doing
exactly what it was built for.

**Year-0 demand did not move.** Five segments times 120,000 is exactly
`attention.referenceAudience`, so `audienceScale` is exactly 1.0 at tick 0.

### Four things this round got wrong first, and what they taught

1. **A bankroll is not a growth engine.** Cash compounds on profit; an audience
   grows logistically. Sizing print runs off the bankroll made them diverge and
   the run reached 1.3 million boxes at 0.50 sell-through with six million units
   in the warehouse. Print runs now scale with `audienceScale` and the bankroll
   is only an affordability cap.
2. **Sizing off the previous release is worse.** It is a feedback loop with no
   floor: one bad set collapses the run, which stops the releases, which
   collapses engagement, which never recovers. It showed up as a print run of
   exactly 1 from year 15 onward.
3. **An affordability cap with no headroom is a trap.** `bankrollFraction` 0.30
   exactly covered the opening run, so the cap bound every tick and
   `conservative` died in 70% of seeds while `allIn` at 0.95 sailed through. It
   is 0.6 now, and the bet-size ladder keeps its own pure `bankroll` policy so
   `allIn` and `smallBets` do not collapse onto the same run.
4. **Goodwill was a ratchet.** It drifted toward 1 rather than toward
   indifference, so high goodwill raised demand, which raised sell-through,
   which raised goodwill. It pinned at exactly 1.000 from year ten in every
   seed. `attention.goodwillBaseline` is 0.5 and goodwill mean-reverts to it.

Two scale-couplings from the plan turned out to be wrong and were reverted.
`drops.unitsPerScalperReference` is already a per-scalper quantity, and scaling
it made every scalper need a bigger market to be worth the same, which stopped
the population cycling entirely — the caps carry the scale instead.
`finance.overprintDeathUnits` as a scaled absolute made a late studio never
cross it, so every death classified as `debt_spiral` and `channel_collapse`
stopped firing; the threshold is measured against the studio's own mean print
run now, which needs no scale-coupling at all.

### Six gates this round moved, deferred with an owner

The suite ends at **28 PASS, 0 FAIL, 18 KNOWN**. Twelve of the known failures
predate this round. Six are new and each names the round that owns it:
`conservativeSurvives` (0.90, Round 10), `allInSurvival` (0.80, Round 10),
`channelHogLosesReach` (7, Round 10), `surpriseGrail` (1.00, Round 4 lowers the
price body elevenfold), `gem10Premium` (7.80, Round 6) and
`gradedPrintingShare` (0.121, Round 6). They are `known-fail` rather than
silenced, so the suite reports `FIXED` the moment the owning round repairs one.

### Round 3 readiness: watch the clock

The regression suite took **28.3s at Round 1 and 52.3s at Round 2**. Nothing
about the suite changed; the growth arc did it, by giving every run a larger
catalogue to price. A 50-year `conservative` run now carries **3,500 printings**
at 70 cards a set.

Round 3 takes `cardsPerSet` from 70 to 280, so expect roughly **14,000
printings** and a suite somewhere near three minutes. AJ's call was "correctness
first, optimise only if it hurts". Three minutes per round is the point where it
starts to hurt, so measure it early in the round rather than at the end.

`tickPrices` is the hot loop and it runs on `strides.price` 4. Raising the
stride is the lever, and Round 3 is the right place because it renumbers RNG
anyway — but `value.priceLerp` is **not** stride-invariant, so a price converges
half as fast in wall-clock years at stride 8. Raise `priceLerp` to compensate,
and re-fit it in Round 4.

## The balance regression suite (tuning Round 1, 2026-09-04)

`npm run check` runs two fixed sweeps and gates 46 balance bands in about 28
seconds. `checkInvariants` asserts structure and `tsc` asserts types; neither
says anything about balance, and a balance regression three rounds back is
unattributable. This is what makes it attributable.

Bands live in `harness/gates.ts` as typed constants, keyed on `keyof RunMetrics`
so a renamed column is a compile error, with a required `why` on every one. The
table in `docs/tuning/03-targets.md` is generated from that file and a
`static.bandsInSync` gate fails if the two drift. Full guide:
`docs/tuning/06-regression.md`.

Four verdicts, not two. `KNOWN` is a band the model does not meet yet; **`FIXED`
is a known failure that started passing**, and the suite names the line to flip.
Flipping it is what stops the next round undoing the work. `NO-DATA` fails a
`pass` gate, because a gate that silently stops measuring looks like success.

Standing at Round 1: **34 PASS, 0 FAIL, 12 KNOWN**. The known failures are the
nine price-shape gates (Round 4), `gemRate` (Round 6), `scalperShare` (Round 5)
and `idleDies` (Round 10). Anything else failing is a real regression.

### The null-denominator rule

**A metric that is a ratio must emit its denominator as its own column, and must
return `null` rather than `0` when that denominator is zero.**

`flopRate` returned `0` when no set had been judged, so `flooder` — which dies at
year 0.9, before any set is a year old — reported the best flop rate in the
roster against a sell-through proxy of 1.000. `signalCorrelation` had the same
defect and worse: `correlation()` returned `0` below three samples, and `0` is
the meaningful value *"the signal is pure noise"*, the exact failure state the
reveal window exists to avoid. `gemRate`, `gradedShare`, `dropSellOutRate`,
`scalperShareOfDrops` and `avgSellThrough` all shared it.

All are nullable now, with `flopSetsJudged`, `signalPairs` and
`regionReadingPairs` as explicit denominators. `toCsv` writes `null` as an empty
cell and the aggregators drop nulls, so an absent measurement can no longer be
read as a zero.

### The `idle` bot, and a fourth stale claim

`CONCEPT.md` §7 and the difficulty targets both say doing nothing is a way to
lose, and nothing measured it, because every bot in the roster released
something. The `idle` bot releases nothing.

It dies of `debt_spiral` in 20 of 20 seeds — **at year 12, not the "about five
years" `finance.weeklyOverheadBase`'s comment claims**. At $65k of annual
overhead the $500,000 lasts 7.7 years, and the borrow ceiling carries it the
rest. The claim never accounted for borrowing. After `specialtyOnly`, the artist
rates and the scalper population, that is the fourth config comment that does not
match its own measurement. Round 10 decides whether the number or the comment is
wrong; `diff.idleDies` is a known-fail until it does.

### `surpriseGrail` is horizon-dependent

It is a per-run boolean, so a longer run has more chances to trip it: 0.40 over
30 years and 0.80 over 50. The banked 0.30 came from a 25-year sweep. The gate
now reads the 30-year roster sweep, and any future comparison must hold the
horizon fixed.

## Things not to break

- A commission is paid for when it is placed, not when the art lands. A late
  illustration is abandoned at release and the money stays spent — that is the
  cost of missing the calendar, and refunding it would make the schedule free
- Art never blocks a release. A card whose commission has not returned ships as
  house art at the quality floor. `releaseSet` resolves every pending card, and
  the invariant pass fails a released card still marked `pending`
- One live commission per card. Without the guard in `placeCommission`, a
  caller that submits every tick pays for the same illustration a hundred times
- `Artist.rate` grows off `baseRate`, never off itself. A target computed from
  the current rate compounds a reputation climb into a bill in the billions
- The late tail is exponential on purpose. A uniform slip cannot cross the 18
  weeks between commit and release, and a deadline that cannot be missed is not
  a deadline
- `Artist.growth` stays hidden. It is the whole scouting bet: reputation is
  visible and priced, growth is not. The measured check is that `scout` beats
  `safeHands` on top card in about half of seeds — if it ever wins them all,
  the gamble has leaked
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
- Demand is a property of the audience, never of the print run. `tickSales`
  sizes its pool off `attention.referenceRunUnits` and the audience, not off
  `p.unitsPrinted`. Restoring that term makes printing conjure its own buyers,
  which puts sell-through back at 0.97 for every strategy and quietly makes
  every demand-side lever in the game worthless again
- Several SKUs in one region split that region's demand; SKUs in different
  regions do not. That asymmetry is the whole reason to open a region, and it
  is what `productShareOfRegion` exists for
- Region taste draws from `s.regionRng`, and the secondary-market actors and
  creators from `s.actorRng`. The same rule that keeps grading on its own stream
  applies: one extra draw on the main stream renumbers every later roll and
  moves every balance number in this file. The three new regions in `world.ts`
  are seeded from `regionRng` for exactly this reason
- A region reading is frozen at `commitPrintRun` and scored against the truth
  afterwards. It is a measurement, nothing in the value engine reads it, and it
  has to be able to be wrong — the same contract the reveal signal has
- A collab returns only `collabs.exposureShare` of the usual IP exposure. Paying
  full exposure makes licensing a straight upgrade over your own IP and deletes
  the only cost a collab has beyond its fee
- A collab attaches to a set still in `design`. After the commit the print run
  is locked and the reveal is running, so there is nothing left for the reach to
  change and signing would be paying for a finished bet
- Speculator return is per-capita, and so is scalper return. Reading either
  per-unit is positive feedback with no brake, and the population pins at its
  cap in every seed
- A creator's relationship converges on how much fresh product there is to
  cover. It must not be paid out of coverage: coverage odds already rise with
  the relationship, so that form has no stable middle and lands on one rail or
  the other
- Only printed chain members count toward chain desire. Counting designed-but-
  unprinted ones turns an announced chain into a free bonus, when the thing
  being modelled is the pull of an incomplete set
- Overhead and storage are the only non-discretionary outflows in the model.
  Removing either makes doing nothing free again, and four of the five death
  routes stop firing
- Scarcity is computed over the tradeable population, not over everything ever
  printed. Slabbed and collected copies have left the market. Reverting
  `tradeablePopulation` to `opened - destroyed` undoes the grading feedback loop
  and the collector floor together
- A pull rate is copies of one card per pack, and a pack holds a fixed number of
  cards. `rarityPull` therefore scales `rarity.pull` by
  `referenceSetSize / cards in the set`. Dropping that scaling makes a bigger
  set put proportionally more cardboard in every box, which quadruples
  `expectedSinglesValue` and reprices every sealed product in the game
- No round may change a draw count after Round 3. `cardsPerSet`, the roster
  sizes and the strides all decide how many RNG draws a run makes, so moving one
  renumbers every later roll and invalidates every banked gate. If one must
  move, it goes last and takes a full re-measurement with it
- Events store data, not prose
- The LGS network and the direct store can sour but can never be lost. CONCEPT.md
  §7 makes LGS-only volume the floor that relationship death collapses you *to*
- `Product.unitsRemaining` is all unsold stock. The allocations hold the sellable
  subset, so their remainders sum to at most `unitsRemaining` — never exactly it.
  Unallocated stock, and stock stranded by a lost channel, is the difference

## Suggested next session

**The tuning and balancing run.** Every mechanism CONCEPT.md names is now
built, rivals are cut, and no balance figure carries a caveat any more. The
reference documents in `docs/tuning/` say what is measured, what was fitted by
eye, and what has never been measured at all — `channels`, `region`, `collabs`,
`creators`, `sealed`, `affection` and `chains` are the untouched blocks.

Alongside it, in order of how self-contained each slice is: give regions their own
audience (`Region.segmentMix` is seeded and unread, so regional demand currently
draws on the global pool), make `communityTeam` and `analytics` buy something,
and tune the two unviable probe bots in problem 4.

Re-run these before you touch the value engine again:

```
npm run typecheck
npm run sim -- --seeds=30 --years=25 --bot=conservative   # the value targets
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist   # the ladder
npm run sim -- --seeds=10 --years=50 --bot=all --check=13       # invariants
```

The four value targets, 30 seeds x 25 years, `conservative`. Every column moved
across this pass, because regions, the actors and the difficulty work all touch
the value engine and none of them is an observer. All four are inside their
bands and the ladder still widens at every step.

| Metric | Band | Before this pass | After |
|---|---|---|---|
| `surpriseGrail` | 15–40% | 33% | 30% |
| `top1PctShare` | 0.4–0.7 | 0.517 | 0.584 |
| `medianCardPrice` | a few dollars | $4 | $4 |
| `yearsToFirst100Dollar` | 3–8 | 6.0 | 5.2 |

The threaded and `--jobs=1` paths must keep producing a byte-identical
`out/runs.csv`. That identity is the acceptance test for any change that is
supposed to be free, and it is only available because a run is a pure function
of (bot, seed, years, config).
