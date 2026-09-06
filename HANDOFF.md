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
  `chaseMaxxer` while `flooder` dies at a median year 0.75), and results reassemble in
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

**3. What is still unswept.** Much less than before. The `art`, `hype` and
`finance` storage lines are swept, and so are the two grading knobs this section used to name — they do
different jobs (`feeWorthMultiple` decides which printings clear the hurdle at
all, 19.8% of them at 2 and 2.8% at 25; `submitRatePerTick` decides how many
copies of those get sent, 13% to 31%) and at the shipped values they give 6.0%
of printings and 18.6% of copies, which is the range the pop report was fitted
to.

**The `channels` block has never been swept at all** — 17 paths plus 30 trait
constants — and `sub.channelHogLosesReach` is now a known-fail sitting one above
its ceiling because of it. Round 11 item 2 owns that sweep and it has been
promoted from "medium priority" by the tripwire firing.

Still unswept: the rest of the `grading` block (`tierMultiplier`,
`popScarcityReference`, `popScarcityCeiling` were fitted by eye); the whole
`collabs`, `creators` and `chains` blocks, all wired for shape rather than
balance; the `actors` paths Round 5 did not need to move, which is most of them
— it swept the speculator heat loop and measured the collector and reseller
terms, and left `collectorConvergence`, `resellerConvergence`,
`speculatorConvergence`, `speculatorMomentumGain` and `speculatorSensitivity`
untouched; and
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

**[Round 7] `smallBets` and `globalist` are unchanged, but the diagnosis above is
now partly wrong.** It attributed all three deaths to their own strategies. Art
was taking the bankroll off the whole roster before any strategy could express
itself — fixing the artist rates alone moved `diff.botsAlwaysSurvive` from 1 to 6
and `allIn` from 0.05 to 0.40. Re-derive the `smallBets` and `globalist`
mechanisms before tuning them; the shipped numbers under them have moved.


## Licensing (tuning Round 8, 2026-09-05)

**The suite reads 52 gates, 48 PASS, 0 FAIL, 4 KNOWN, 0 DRIFT.** Two gates are
new and both pass. No existing gate moved outside its drift threshold. Banked
under `docs/tuning/bank/round-8/`.

The round replaced the flat licence fee with the structure the licensing
research documents, and fixed the reason the mechanism could not be tuned.

### What the deal is now

`Collab.licenseFee` is gone. A collab now carries five numbers:

| Field | What it is |
|---|---|
| `advance` | paid at signing, and recoupable against the royalty |
| `royaltyShare` | the licensor's share of the set's net sales revenue |
| `minimumGuarantee` | `advance * minimumGuaranteeMultiple`, the floor under the deal |
| `royaltyAccrued` | royalty earned to date, before recoupment |
| `paidTotal` | cash handed over to date, the advance included |

One function pays all of it, because the advance, the recoupment, the running
royalty and the guarantee are the same question asked at different times:

```
due = max(royaltyAccrued, advance, settled ? minimumGuarantee : 0)
pay(due - paidTotal)
```

The advance sits inside the `max`, which is what makes it recoupable: a set has
to earn past the advance before another dollar leaves. The guarantee joins the
`max` only at settlement, so a set still selling is never charged for a
shortfall it has not finished making up. Settlement is
`collabs.guaranteeSettleWeeks` (104) after the home release, by which point
`e^(-1.4 * years)` decay has taken a set past 94% of everything it will earn.

The royalty is charged where revenue is booked — both the shelf path and the
drop path — so it is a cost of selling and lands in the same tick as the sale.

### One roll sets both terms, and it sets them in opposite directions

The plan asked for two draws on `advance` and `royaltyShare`, on the basis that
two draws already set the fee. **That was wrong: `randRange` is one `rand` call,
so the fee cost one draw.** Taking two would have added a draw to the main RNG
stream and renumbered it, which no round after Round 3 may do — Round 9 is the
only permitted exception.

So one roll sets both, inverted: `advanceMin -> advanceMax` against
`royaltyShareMax -> royaltyShareMin`. This is better than the plan, not a
concession to it. A licensor either wants the money up front or wants a share
of what the set does, so an offer is a position on that trade-off and choosing
between two offers is choosing how much of the bet to keep. Two independent
rolls would have produced offers that were merely dearer or cheaper.

Shipped: advance $60,000-$500,000, royalty 5-15%, guarantee 2x the advance.

### `reachToDemand` was inert, and the print run was the reason

`collabs.reachToDemand` went 1.2 -> 8. The first sweep of it moved `licensor`
net worth by 3% across a fivefold change, which is the signature of a knob
nothing reads.

It was read. Nothing could act on it. `licensor` printed a fixed
`collabRunMultiple` of 1.5 on every collab set, and sell-through was already
0.968 — **the bot was supply-bound, not demand-bound**, so demand the licence
bought was demand nobody had printed for.

The fix is on the bot: it now sizes the run to `collabOfferFactor` of the offer
it just signed. `collabRunMultiple` is deleted. The engine exports the factor
rather than the bot recomputing it, because the moment the two copies disagree
the roster is choosing offers by one rule and being paid by another.

The bot also prices the whole deal instead of the advance:
`max(minimumGuarantee, advance + royaltyShare * expectedRevenue)`, where the
expected revenue is itself sized by the offer's demand factor. Scoring the
advance alone would have taken every low-advance offer and handed the licensor
a seventh of every set it ever sold.

### The ladder

Measured at the gate suite's own shape, 20 seeds x 30 years, as
`licensor`/`conservative` median net worth and `licensor` survival:

| `reachToDemand` | earns | survives |
|---|---|---|
| 1.2 | 0.98 | 0.95 |
| 3 | 1.10 | 0.95 |
| 6 | 1.39 | 0.90 |
| **7** | **1.52** | **0.95** |
| **8** | **1.47** | **0.85** |
| 10 | 1.47 | 0.80 |

Earnings plateau around 7. Survival keeps falling, and it should: the run is now
sized to the licence, so a licence that under-delivers is an overprint. **8
ships.** 7 earns marginally more but reads 0.950 survival, exactly the band
ceiling, and a gate sitting on its boundary flaps.

The suite reads `diff.licensorEarns` 1.536 and `diff.licensorSurvival` 0.850.

### The shape the round bought

At 40 seeds x 50 years, `licensor` signs 14.5 licences, pays $22.4M for them,
and **81% of that is royalty rather than advance** — the deals are earned, not
bought, which is the whole difference from a fee. About 3 of those licences per
run never earn their guarantee and the shortfall falls due years later. That is
the licence going wrong, and it is why survival is 0.775 over the long run
against 0.925 for `conservative`.

### One defect found and fixed on the way

The drop path never applied `collabs.exposureShare`. A collab set sold through
the direct store built full affection for the publisher's own IPs, so a bot that
sold through drops got the reach of a licence without paying the equity for it.
The shelf path had always applied it. This is the fourth instance of HANDOFF
lesson 4's shape — the same rule implemented twice and only maintained once.

### A rule this round paid for

**Never discard stderr in a sweep.** A `>/dev/null 2>&1` sweep hid a thrown
`TypeError` in all three legs, left the previous run's `out/runs.csv` in place,
and produced three byte-identical rows that read as a cleanly inert knob. The
loop now writes the log to a file and reports a non-zero exit.

## Art and storage (tuning Round 7, 2026-09-05)

**The suite reads 50 gates, 46 PASS, 0 FAIL, 4 KNOWN, 0 DRIFT.** Two known-fails
are repaired and one new one is added. Banked under `docs/tuning/bank/round-7/`.

### Art was killing the roster, and nobody had measured it

The round's headline is not a tuning result. `art.newcomerRateMin/Max` was 50 to
300 **cents** against an opening roster of $75 to $450 — a hundredfold
inconsistency, recorded as a live defect in `02-hardcoded.md` §5 and shipped
that way since before the tuning run started. Roster drift mints newcomers
continuously, so after twenty years most of the board was working for pennies
and the art budget was noise. Fixing the inconsistency is what this round did;
everything below is the consequence.

Two of Round 10's four assigned known-fails were repaired by it, without
touching a single finance knob:

| Gate | Was | Now | |
|---|---|---|---|
| `diff.botsAlwaysSurvive` | 1 | **6** | in [3, 11] |
| `diff.allInSurvival` | 0.050 | **0.400** | in [0.1, 0.6] |
| `diff.conservativeSurvives` | 0.700 | 0.900 | still short of [0.95, 1] |

`allIn` is the one worth understanding. It was not losing its bet — the art bill
took the bankroll before the bet could be placed, so it never made one. The
Round 3 note that predicted this ("the set size is correct and the artist rates
are not") was right, and the plan's instruction to measure the side effect
before Round 10 repeated the work paid for itself.

### The rates are scaled to our revenue, not to the research

`05-real-world.md` finding 3 documents a card illustration at **$400 to $2,500**,
flat fee, no royalty. Shipping that number outright kills the game:

| | art as % of revenue | survived |
|---|---|---|
| `conservative` | 92.4% | 0/15 |
| `safeHands` | 224.1% | 0/15 |
| `scout` | 4.7% | 14/15 |

A 280-card set costs $406,000 in art at the researched median — 81% of the
studio's entire starting capital, spent before a single unit prints.
`conservative` and `safeHands` died 8/8 in year 4 of `debt_spiral`.

**The shipped band is $80 to $500, a fifth of the researched one.** That is a
deliberate, documented deviation from decision 2 of the tuning run, made by AJ
on the measurement above. The reasoning is that art's *share of revenue* is the
quantity the design cares about, and our publisher earns about a fifth of a real
one: it prints 6,000 to 66,000 units against a real 16,700 to 248,000 booster
boxes, at about $29 a unit against about $100. The band was swept as a scale
factor over the researched one, 30 seeds x 30 years:

| scale | 0.0625 | 0.125 | **0.20** | 0.25 | 0.30 | 1.0 |
|---|---|---|---|---|---|---|
| band | $25–156 | $50–312 | **$80–500** | $100–625 | $120–750 | $400–2500 |
| `conservative` | 1.2% | 2.1% | **8.6%** | 9.2% | 13.0% | 92.4% |
| `safeHands` | 5.0% | 7.6% | **20.8%** | 41.0% | 69.9% | 224.1% |
| `scout` | 0.2% | 0.4% | **1.0%** | 1.2% | 1.5% | 4.7% |

0.20 was the only point putting all three inside the plan's exit bands, and it
is the point shipped. **When Round 10 lifts capital and print volume toward real
scale, this factor must shrink toward 1.** It is a scale correction standing in
for a revenue side that has not grown yet, not a claim about what art costs.

`safeHands` is nonlinear here — 20.8% to 69.9% across a 1.5x change in the band
— because it dies. Read its share beside its survival or it means nothing.

### `art.rateGrowthPerReputation` 2.5 -> 0.15, and the scouting bet

The research is unambiguous: Giancola's per-card rate did not move in 27 years,
and fame pays in the art aftermarket instead. Ours dragged the rate up by 250%.

Across 0.0 to 0.2 the knob is indistinguishable on all three bots. Its whole
bite was at 2.5, and it fell on exactly one strategy:

| `rateGrowthPerReputation` | 0.0 | 0.1 | **0.15** | 0.2 | 2.5 |
|---|---|---|---|---|---|
| `scout` art as % of revenue | 4.3% | 7.2% | **4.7%** | 6.5% | 34.9% |
| `conservative` | 91.5% | 93.2% | 92.4% | 95.2% | 96.3% |

That is the scouting bet leaking through a knob nobody had connected to it:
`scout` buys the cheapest artist on the board, and at 2.5 its own scouted
artists priced themselves up as their reputation climbed, so the bet paid for
itself and then billed for it. The value is 0.15 rather than 0.0 only to keep
`rateAdjustRate` a live mechanism; any value in the band measures the same.

### The storage cliff, and why it is 1 cent and not 5

New `finance.storageSurchargeAfterTicks` (26) and `storageSurchargeMultiple`
(1.7). `Product.printedTick` is new state, written at `commitPrintRun`: stock
still unsold half a year after the print run pays the surcharged rate. The point
is the cliff, not the tax — a normal tail sells through inside the window and
never meets it, so the surcharge only ever bills a publisher who printed more
than the market wanted.

**The plan asked for the base rate to go 1 -> 5 cents. It stays at 1.** Five
cents spends the survival the art fix had just bought and breaks three gates:

| base / surcharge | 1c / 1.0x | 1c / **1.7x** | 3c / 1.7x | 5c / 1.7x |
|---|---|---|---|---|
| `diff.botsAlwaysSurvive` | 7 | **6** | 4 | 4 |
| `diff.conservativeSurvives` | 0.950 | **0.900** | 0.800 | 0.800 |
| `diff.allInSurvival` | 0.050 | **0.400** | 0 | 0 |
| `shape.yearsTo100` | 2.442 | **2.442** | 1.981 FAIL | 1.981 FAIL |
| `sub.scalperShare` | 0.099 FAIL | **0.103** | 0.071 FAIL | 0.071 FAIL |
| gates | 41 PASS 4 FAIL | **45 PASS 1 FAIL** | 42 PASS 3 FAIL | 42 PASS 3 FAIL |

The cliff at the *old* base rate is strictly better than raising the base rate:
it fixes `allInSurvival` and rescues `scalperShare`, which a flat rate cannot,
because a flat rate bills the healthy tail at the same rate as the overprint.

**The surcharge age is not load-bearing and does not need sweeping again.** From
13 to 104 ticks the overprint death count moves only 60 to 64. Stock that is
going to sit sits for years, so where the cliff falls inside the first two years
does not change who it catches.

**The multiple is noisy between 1.3 and 1.7 and was not over-fitted.** 1.3
reaches `conservativeSurvives` 0.950 but pushes `diff.sellThrough` to 0.963 and
`diff.flopRate` to 0.002 — publishers survive so well that the blind bet loses
its downside, which is a worse failure than the gate it fixes. 1.5 is worse than
both. That last 0.05 of `conservativeSurvives` is bought by taking the downside
off the bet, so it is a trade Round 10 should make deliberately, not a defect.

### What the exit criteria actually read

Per AJ's call this round, the plan's art bands are treated as pre-measurement
guesses: they get re-fitted after Round 10 settles capital, against what the
corrected model produces. Measured at the shipped configuration, 30 seeds x 30
years, so the re-fit starts from a number rather than a guess:

| | target | measured | survived |
|---|---|---|---|
| `conservative` art as % of revenue | 3–9% | **3.5%** | 93% |
| `safeHands` | 20–35% | **13.3%** | 80% |
| `scout` | 1–3% | **0.7%** | 100% |
| `scout` beats `safeHands` on top card | ~10/20 | **15/20** | |

Two shares sit below their band and the scouting bet has leaked toward `scout`,
both for the same reason: milder storage means longer survival means more
revenue, so art is a smaller share of it. Nothing here is a defect. `safeHands`
also cannot reach 20–35% by tuning at all — paying 2.5x rate to the single most
reputable artist for all 280 cards is a policy the researched rates do not
permit, and that is a bot to rewrite, not a knob to turn.

### Two new harness metrics

`revenue` and `artSpendShare`. The art exit criteria are stated as a share of
revenue and the harness could not measure one — every earlier art claim was a
scratch probe. `ofRev` now prints in the art table. This is the Round 6 lesson
applied before it cost anything.

### `sub.channelHogLosesReach` is a tripwire that fired

It reads 7 against a ceiling of 6, and it is demoted to known-fail rather than
tuned away. Round 3 armed it deliberately: "it sits on the ceiling, so the next
round that adds one more lost channel turns this into a FAIL rather than a
silent drift. That is the intent." The cause is not mysterious — art no longer
bankrupts the roster, so `channelHog` lives long enough to sour one more
channel. The `channels` block has never been swept at all (17 paths plus 30
trait constants) and Round 11 item 2 owns that sweep. **Do not widen the band to
make it green.** The number rising means the souring mechanism is working
harder, and the band is what says how hard is too hard.

### What this round teaches

6. **A defect recorded in the docs is not a defect anybody has measured.** The
   `newcomerRate` inconsistency sat in `02-hardcoded.md` §5 with a NOTE comment
   in `config.ts` preserving it on purpose, through six rounds, while three
   difficulty gates that it caused were being assigned to Round 10. The fix was
   not a cheaper board — it was a *consistent* one.
7. **Check whether the change you just made pays for the gate you were about to
   spend money on.** The plan told this round to measure the side effect before
   Round 10 did the work twice, and it repaired two gates for free. Reverting one
   half of a round's change and re-running the suite is two minutes and it is the
   only way to know which half did what.
8. **A survival fix and a difficulty gate are the same budget.** Every storage
   point above trades `conservativeSurvives` against `sellThrough` and
   `flopRate`. Making the roster live longer and keeping the bet dangerous pull
   against each other, so a round that improves survival must show what it spent.

## Grading (tuning Round 6, 2026-09-05)

**The suite goes to 50 gates, 45 PASS, 0 FAIL, 5 KNOWN, 0 DRIFT.** Both gates
Round 6 owned are fixed and promoted, two new gates are added, and every other
gate held — the price shape, the scalper pair and the populations did not move.

| Gate | Round 5b | Round 6 | Band |
|---|---|---|---|
| `sub.gemRate` | 0.100 | 0.521 | 0.30-0.60 |
| `sub.gem10Premium` | 6.049 | 3.929 | 2-5.5 |
| `sub.gemRateByQuality` | — | 1.704 | 1.3-2.0 (new) |
| `sub.gemRateVintage` | — | 0.397 | 0.15-0.45 (new) |

```
grading.conditionMean                 9  -> 10.0
printing.qualityGradeShift.budget  -0.15 -> -0.56
printing.qualityGradeShift.premium  0.12 -> 0.3
printing.qualityGradeShift.archival  0.2 -> 0.4
```

### The latent scale is not the grade scale

`conditionMean` 9 against a `gradeCuts['10']` of 9.75 with `conditionSigma` 0.7
put a 10 at the 14th percentile. Reality puts it at the median, so the mean has
to sit ABOVE the cut, and 10.0 is not a contradiction on a "1-10" scale because
the latent variable is an unbounded normal whose only meaning is its distance
from the cuts. The config comment said "on the familiar 1-10 scale" and that
framing is what made the knob look untouchable. It now says what the number
actually is.

Measured, `conditionMean` alone: 9.0 gives a standard gem rate of 0.087, 9.4
gives 0.204, 9.75 gives 0.358 and 10.0 gives 0.487. It is a clean level knob.

### The spread needed the other half of the fix

`conditionMean` moves every quality together, so raising it made print quality
matter LESS: premium over standard fell from 2.06 at mean 9.0 to 1.36 at 10.0,
because both ends saturate against the same ceiling. Widening
`printing.qualityGradeShift` is what puts the decision back.

At `premium` 0.3 a premium printing gems 87% of the time against a standard 51%.
At 0.5 it reads 0.974 and at 0.8 it reads 1.000 — a pinned constant, workflow
rule 9, so the shipped value stops well short.

**`gem10Premium` came free.** Nothing in `tierMultiplier` moved. The graded
price is `raw * tierMultiplier * reputation * popScarcity`, so more tens on a
pop report push the scarcity term down and the premium with it: 6.082 to 3.929.

### The vintage column had to be rewritten before it could say anything

The round plan asks for `gemRateVintage`, and the obvious implementation — the
gem rate on printings now over 20 years old, read off their pop reports — does
not measure what it appears to. **A pop report is cumulative.** It averages a
printing's whole submission history, most of which happened while the printing
was young. That version read 0.464 against a modern 0.487, a 5% difference,
where the age penalty should produce a third.

`SimState.market.gradingTally` counts outcomes AT grading, split by the
printing's age at that moment. The same run then reads 0.510 modern against
0.376 vintage. Both versions respond to `agePenaltyPerYear`, which is why the
first one looked plausible: only the split by age at grading separates them.

**The vintage rate is 40% against a real-world 1% for true vintage, and that
gap is left open.** `agePenaltyPerYear` 0.02 with `agePenaltyCap` 0.8 can only
take 0.4 off the mean over 20 years, and 0.12 only reaches 0.242. Closing it
means a far harsher wear curve, and `05-real-world.md` has no band for the
shape of that curve — only the endpoint. It is a measurement job before it is a
tuning one.

### Two things the roster cannot check

**The budget end of the quality table is arithmetic.** `flooder` is the only bot
that prints budget and it dies at a median year 0.75, so no budget printing is ever graded
in any seed. `gemRateBudget` reads null in all twenty. The same is true of
archival: nothing prints it. So `sub.gemRateByQuality` is premium over
STANDARD, formed across bots — `chaseMaxxer` prints premium, `conservative`
prints standard — and its ceiling of 2.0 is arithmetic rather than a target,
because standard sits near 0.50.

This is the third unreachable knob the tuning run has found, after
`drops.scalperAppealPremium` and the budget shift. **The pattern is the bot
roster, not the config:** a knob that only applies to a strategy no surviving
bot plays cannot be measured, however carefully it is fitted.

### `feeWorthMultiple` re-read, and the rule it cannot carry

The plan asks for it to be retargeted on the measured rule: a card above $100
raw gains 120-300% from a slab, one under $10 gains less than 70% and does not
cover the fee.

**The premium cannot carry that rule at all.** `target = raw * tierMultiplier *
reputation * popScarcity` is a multiple of the raw price, so the premium is
scale-invariant by construction and an expensive card gains exactly the same
multiple as a cheap one. What carries the rule is the flat fee plus the
submission hurdle: grader fees run $8 to $30, `feeWorthMultiple` 5 keeps
anything under about $60 raw out of a slab entirely, and at a 3.9x gross
multiple a $100 card nets about +240%. The rule holds; it just does not live
where the plan expected.

Swept anyway against the moved price body: the multiple now barely touches the
gem rate (0.52 at 2, 0.46 at 12) and `sub.gradedPrintingShare` stays in band. It
stays at 5.

### What the review of this round found

Six findings, all real. Recorded because two of them are about how this document
gets written, not about the code.

**The band table went out of sync and the suite caught it.** Correcting two
banked values in `gates.ts` without regenerating the table in `03-targets.md`
put `static.bandsInSync` into FAIL. That gate exists for exactly this and it
worked.

**The banked values were wrong in the first place.** `sub.gemRateByQuality` was
banked at 1.79 and `sub.gemRateVintage` at 0.376, both taken from the scratch
probe the round fitted on — 20 seeds x 50 years over three bots — rather than
from the suite's own roster sweep at 20 x 30, which reads 1.704 and 0.397. Under
the 25% drift threshold, so nothing flagged, but it silently spends 5% of the
next round's drift budget. **Bank what the suite measures, not what the probe
measured.**

**The quality split had the same defect as the age split, and the round shipped
it anyway.** `gemRateBudget`, `gemRateStandard` and `gemRatePremium` were read
off the cumulative pop reports — the very distortion this round diagnosed for
age, one screen further down the same file. Since the ratio divides two
different bots, their different release cadences carry different age mixes, so
the confound is structural rather than incidental. `market.gradingTally` now
splits by print quality too.

**State the size of it honestly: correcting it moved the ratio from 1.704 to
1.703.** The defect was real, the fix is right, and the number did not care.
Both bots' age mixes happened to be similar. That is worth knowing before the
next round spends a day on a confound it has not sized.

Two smaller ones: `sub.gemRateByQuality` had no denominator guard where every
neighbouring ratio gate has one, so a single seed that happened to grade a
premium printing would have reported as a twenty-seed median. And a stale
`flooder` lifetime survived in `HANDOFF.md` after being corrected in five other
files — the one uncorrected copy being, as the review put it, the one a reader
is most likely to trust. `flooder` dies at a median year 0.75, not "in year two".

### The whole grade distribution, which no gate measures

Five seeds of `conservative` over 50 years, every graded copy:

| 10 | 9.5 | 9 | 8 | 7 | below 7 |
|---|---|---|---|---|---|
| 48.1% | 24.9% | 21.5% | 5.2% | 0.1% | 0.1% |

That is the right shape — tens about half, nines carrying most of the rest, a
thin tail — and it is what says `conditionMean` 10.0 did not simply push the
whole catalogue through the top cut. Only `gemRate` is gated, so nothing else
would have noticed if it had.

### `strides.grading` at 8: measured and declined

Round 3 handed this to Round 6 as a runtime win. Measured on a 30 seed x 50 year
`conservative` sweep it is 32.6s at stride 4 and 28.4s at stride 8 — **13%, not
the several-fold saving the note implied**, and the suite is about 119s, so it
buys under ten seconds.

It is not free either. `gem10Premium` moves 3.55 to 3.70 and `gradedShare` 0.319
to 0.325, because the graded price lerp runs half as often and the submission
volume is compensated rather than identical. Small, but it is a behaviour change
bought for 8 seconds. **The stride stays at 4.** Round 3's own conclusion still
holds: the hot spot is not on a stride.

One thing worth recording for whoever revisits it: because grading draws on its
own `gradingRng` stream, changing this stride does NOT renumber the main stream.
That is exactly what the per-subsystem streams were built for.

## The screen (tuning Round 5c, 2026-09-05)

Round 5 owns 46 config paths and Rounds 5 and 5b fitted twelve of them. This
round measures the rest rather than leaving them unswept, because a gate that
passes at one point in a space nobody has explored is not the same as a gate
that passes.

**Method.** Every remaining first-guess path, run at 3x and 1/3x its shipped
value, 20 seeds x 30 years over `conservative`, `dropRunner` and `hypeGambler`,
reporting the largest move on thirteen metrics. Nothing shipped changed. The
script is a scratch job under `out/scratch/`, not repo code.

### The `drops` block is a closed room

Every one of its remaining paths moves its own subsystem hard and moves nothing
outside it. Not one moved `medianCardPrice`, `setMedianAge2`, `setGiniAge2`,
`netWorth` or survival by more than measurement noise.

**That cuts both ways.** The subsystem is safe to tune — nothing else is
downstream of it — and the two gates Round 5 fixed sit at the bottom of a band
inside it, with five unswept knobs able to push them out. Measured on
`dropRunner`, 20 seeds x 30 years, against `sub.scalperShare` [0.10, 0.50] and
`sub.scalperCycles` [3, 35]:

| Path | shipped | low | at shipped | high |
|---|---|---|---|---|
| `holdLimitWeeks` | 26 | 9: **0.044, 0 cycles** | 0.132, 4 | 78: 0.417, 3 |
| `cadenceWeeks` | 6 | 2: **0.055** | 0.132, 4 | 18: 0.420, 5 |
| `heatPerOversubscription` | 0.35 | 0.12: **0.054** | 0.132, 4 | 1.0: 0.341, 5 |
| `scalperAppealDefault` | 0.4 | 0.15: **0.022** | 0.132, 4 | 0.8: 0.253, 5 |
| `baseResaleRate` | 0.04 | 0.013: **0.056** | 0.132, 4 | 0.12: 0.181, 4 |
| `collectorReach` | 0.06 | 0.02: **0.092** | 0.132, 4 | 0.18: **0.048** |

Bold is out of band. **The shipped share is 0.132 against a floor of 0.10, so
the fit has almost no room underneath it**, and every knob above breaks it on
the low side. `collectorReach` breaks it on both sides, because collectors
crowd scalpers out of the queue at high reach and stop the drops selling at
all at low reach.

The clean fix is not another knob. The share drifts up with the horizon —
0.132 at 30 years and 0.389 at 50 — so centring the 30-year figure in the band
would push the 50-year figure through the ceiling. What would buy margin at
both ends is tying the scalper population to the collector base rather than to
the drop flow, which is a mechanism change and belongs to a round that wants
it.

### Two coverage gaps the screen found

**`drops.scalperAppealPremium` is untested by the whole roster.** It reads 0%
on every metric at 3x and 1/3x because it only applies to an ETB or a premium
collection, and no bot in `harness/bots.ts` drops one. `dropRunner` sells
booster boxes. A knob the roster cannot reach is not a knob that has been
measured, and the fix is a bot, not a value.

**The `actors` block is invisible to difficulty.** `survivedFraction` moved 0%
for all sixteen actor paths at both multipliers. Populations move prices and
supply; they do not decide whether a studio lives. That is worth knowing before
Round 10 goes looking for difficulty knobs in here.

### What the screen says is load-bearing

| Path | Biggest move | Reading |
|---|---|---|
| `actors.collectorHoldCeiling` | `medianCardPrice` **+67%**, `setMedianAge2` +10% | A price knob living in the actors block. The strongest single lever the screen found, and it is marked `fitted` with no sweep behind it |
| `actors.collectorShareOfAudience` | `collectors` +199%, `scalperShareOfDrops` -68% | Collectors crowd scalpers out of the drop queue. The two subsystems are coupled through the queue and nowhere else |
| `actors.collectorGoodwillWeight` | `collectors` +164%, `scalperShareOfDrops` -65% | Same path, one term further back |
| `actors.ripBreakEven` | `resellers` **+432%** | The reseller population's whole range sits on this one knob |
| `actors.resellerReference` | `sealedRipRation` -46% | Confirms Round 5b: the reseller level reaches this column and nothing else |
| `actors.speculatorHeatPerCapita` | `speculators` +199%, everything downstream 0% | After the Round 5b split the speculator headcount is decoupled from price. Their heat push is `speculatorHeatGain`, and that is the knob `shape.yearsTo100` binds |

`actors.speculatorConvergence`, `speculatorMomentumGain`, `speculatorSensitivity`
and `speculatorNoise` move nothing but the speculator count. They are shape
knobs on a population that currently supplies 2% of the heat pool.

### The plan's exit criterion, stated exactly

The round plan asks for `scalperCycles` in 5 to 30. The gate band is [3, 35] and
`harness/gates.ts` is the single source of truth, so the suite passes at 4. On
the round's own stated sample — 20 seeds x 50 years — it is 14. Both readings
are recorded because they disagree, and the disagreement is the horizon and not
the health of the population.

## The three loose ends (tuning Round 5b, 2026-09-05)

Round 5 recorded three things rather than fixing them. This round fixes all
three, and one of the three findings turned out to be wrong.

**The suite goes from 46 gates to 48, and from 39 PASS to 41 PASS, 0 FAIL,
7 KNOWN, 0 DRIFT.** Two new structural gates, and every price gate held.

```
actors.collectorDensityReference  0.09  -> 0.035
actors.collectorGoodwillFloor        -  -> 0.3    (new, was a literal)
actors.collectorGoodwillWeight       -  -> 1.4    (new, was a literal)
actors.collectorFatiguePenalty       -  -> 0.5    (new, was a literal)
actors.ripUnitsPerReseller           -  -> 0.1    (new)
PrintingMarket.speculatorHeat        -  -> new field
```

### Round 5 was wrong about collector holding

It said no reference value could make holding respond to play. That was
measured on `conservative`, `dropRunner` and `hypeGambler`, which all sit near
goodwill 1.0. Across the roster goodwill runs 0.43 to 1.00 and density with it:

| Bot | goodwill at y30 | density | holding at 0.09 | holding at 0.035 |
|---|---|---|---|---|
| `channelHog` | 0.655 | 0.0151 | 0.250 | 0.330 |
| `hypeGambler` | 0.785 | 0.0254 | 0.285 | 0.415 |
| `conservative` | 1.000 | 0.0267 | 0.289 | 0.428 |
| `scout` | 1.000 | 0.0271 | 0.290 | 0.432 |

Density is bounded by 0.006 to 0.034 by construction, so a reference of 0.09
put every run in the bottom third of the ramp and crushed a 1.8x spread into
4%. At 0.035 the spread arrives. At 0.025 a healthy run pins on the ceiling,
which is the failure the Round 3 note recorded, so this knob has a floor as
well as a ceiling.

`shape.median` moved 0.220 to 0.230 and nothing else moved. Holding more copies
off the market makes every card scarcer, which is the mechanism behind
"goodwill is worth money", and it now costs a bad strategy something.

**The fatigue half of the same term is inert.** Fatigue measures 0.220 to 0.223
in every bot at every decade, so `(1 - 0.5 * fatigue)` is a constant of 0.89
wearing a variable's clothes. The three coefficients are config paths now, so
whichever round owns fatigue can sweep them.

### You cannot pay a speculator with their own bid

Round 5 left `speculatorHeatGain` four times under a cliff and called the trade
deliberate. It did not have to be. The loop was degenerate for a structural
reason: the population's return read the whole heat pool, including the heat the
population had just pushed in. Solve it and the equilibrium is
`S = E / (heatPerCapita - a)`, which either damps to the exogenous level or
diverges to the cap, with nothing usable in between. Measured, that is exactly
what happens - the pool reads 1,049 at gain 0.25 and 37,595 at 0.35.

`PrintingMarket.speculatorHeat` now carries their own standing contribution,
decayed on the same clock as `heat` and clamped to what the printing actually
carries, so a push that ran into the ceiling did not land. `tickActors`
subtracts it from the pool. The population then converges on an external driver,
which is the shape workflow rule 9 asks for, and the gain stops being a
stability question:

| `speculatorHeatGain` | 0.05 | 0.25 | 0.6 | 1.2 | 2.5 |
|---|---|---|---|---|---|
| speculators at y50, before | 2,564 | 2,974 | **30,000 (cap)** | cap | cap |
| speculators at y50, after | 2,416 | 2,423 | 2,424 | 2,426 | 2,455 |
| share of the heat pool they supply | 2% | 12% | 29% | 59% | 96% |

**The gain still ships at 0.05, and the reason has moved.** `shape.yearsTo100`
binds now: more heat on a young printing reaches $100 sooner, and the gate reads
2.442 at 0.05, 1.981 at 0.08 through 0.12, 1.673 at 0.3 and 1.423 at 0.6,
against a floor of 2.0. So amplification is buyable at last, and its price is
paid in the value block. Do not raise this knob on its own.

That 1.981 is worth a second look: it is identical at 0.08, 0.10 and 0.12
because the metric is a median of a small set of discrete per-seed values, and
it is the same 1.981 the Round 4 section recorded for a 20-seed sample. The gate
moves in steps, not smoothly.

**`struct.heatNotPinned` is new** and reads the share of printings sitting at
`value.heatCeiling` after 50 years. It is 0 now and it was 0.82 before the Round
5 fix. No gate could see that detonation, because nothing measured the catalogue
past the gated horizon.

### The reseller population now has a second consumer

`actors.resellers` was read by exactly one thing, `ripMultiplier`, and only as
`resellers / resellerReference`. Scale both and every rate is identical, so the
level could not be fitted against anything.

`tickSealed` now rations. The consumer half of the rip rate is people opening
what they bought and is never rationed; the rip-and-ship half above it is a
business with a headcount, `actors.ripUnitsPerReseller` units per reseller per
stride, scaled to the market and shared across every product. That needed the
opening pass split in two — every product asks first, then the pool is divided
in proportion, so no product is starved by its position in the array. With the
throughput unbound the arithmetic is identical to before.

The new `sealedRipRation` column is what makes the level readable, and it
separates the roster on the pool AND on the volume it has to serve:

| Bot | `sealedRipRation` | resellers |
|---|---|---|
| `hypeGambler` | 0.522 | 84 |
| `attentionBurner` | 0.778 | 158 |
| `conservative` | 0.978 | 189 |
| `chaseMaxxer` | 1.000 | 139 |
| `safeHands` | 1.000 | 367 |

`chaseMaxxer` has fewer resellers than `hypeGambler` and is never rationed, so
this is not headcount with extra steps. `struct.ripRationBinds` gates it.

**State the effect honestly: it is small.** Rationing changes WHEN sealed
product opens, not WHETHER, and over fifty years nearly all of it opens either
way. Measured on `hypeGambler` at 20 seeds x 50 years, turning the throughput
off moves `topSealedPrice` about 11% and moves the median card price, the p90
and net worth by nothing at all. Making it a first-order force would mean
raising `ripPerReseller` until rip-and-ship dominates opening, which moves the
whole singles supply and reopens the Round 4 value fit. The level is load-
bearing and measurable now; it is not yet important.

## The populations (tuning Round 5, 2026-09-05)

**The suite goes from 37 PASS to 39 PASS, 0 FAIL, 7 KNOWN, 0 DRIFT.** Both
gates Round 4 handed to this round are fixed and promoted to `pass`, and every
Round 4 value target still passes.

| Gate | Round 4 | Round 5 | Band |
|---|---|---|---|
| `sub.scalperShare` | 0.000 | 0.131 | 0.10-0.50 |
| `sub.scalperCycles` | 0 | 4 | 3-35 |
| `struct.speculatorMoves` | 3.641 | 2.894 | 1.2-500 |
| `shape.median` | 0.260 | 0.220 | 0.20-0.50 |
| `shape.gini` | 0.827 | 0.833 | 0.72-0.98 |
| `shape.ageCurveLate` | 0.804 | 0.854 | 0.55-0.92 |

The knobs that moved:

```
drops.scalperReach              0.5  -> 0.9
drops.scalperSpeed                3  -> 8
drops.unitsPerScalperReference  0.3  -> 0.03
drops.populationGrowth         0.06  -> 0.25
drops.shortagePremiumWeight       -  -> 0.2   (new)
drops.shortagePremiumCap          -  -> 4     (new)
actors.speculatorReference      800  -> removed
actors.speculatorsPerPrinting     -  -> 1     (new, replaces it)
```

### A scalper could not see release day, and release day is the only day

`resolveDrop` read appetite off the CURRENT sealed premium:
`p.market.price / p.msrp - 1`. A product's market price is initialised at its
MSRP, so on the day of its first drop that premium is zero by construction. It
only climbs later, as `tickSealed` walks the price toward its target and
scarcity bites. Measured on one `dropRunner` seed, the first drop of each
product read a premium of -0.05 to +0.08, and the second drop six weeks later
read 0.08 to 0.28.

So no `drops` money constant could have fixed this gate. Sweeping
`breakEvenPremium` from 0.15 down to 0.0 moved the share from 0.000 to 0.002.
Scalpers camp a drop because they expect a shortage, and the shortage was
already in the same function - `collectorDemand / offered` is computed three
lines above. `drops.shortagePremiumWeight` lets them read it.

**This is a mechanism change in a tuning round.** It is the same class as Round
4a: a term that could not do its job, found while fitting the constants around
it. It draws no RNG, so it renumbers nothing.

### The level knob and the clock knob

The `drops` block splits the way the `value` block did.

`unitsPerScalperReference` sets the LEVEL. The equilibrium sits where realized
premium times crowding meets `breakEvenPremium`, so the population lands near
the drop flow divided by this number. At 0.3 the direct store opens too late
and drops too rarely to supply it: crowding measured 0.02 to 0.05 for every
seed, the trade never cleared its hurdle, and the population sat exactly on
`minScalpers * audienceScale`. Measured on `dropRunner`, 20 seeds x 50 years,
the share reads 0.47 at 0.02, 0.39 at 0.03 and 0.22 at 0.05.

`populationGrowth` sets the CLOCK. At 0.06 a single boom took longer than the
run, which is why `scalperCycles` was zero rather than low.

`scalperReach` and `scalperSpeed` decide whether the population can win a share
its own numbers do not already win. The queue splits on
`3 * scalperDemand / (3 * scalperDemand + collectorDemand)`, and against 26,000
collectors at a 5,000-unit drop, 940 scalpers cannot reach 10% of the units at
any appetite. Both were first guesses. Nearly everybody turns up for a drop
they think will flip, and camping beats standing in line by more than three to
one.

### The share rises with the horizon. Read the gate beside its run length

`scalperShareOfDrops` reads 0.131 over 30 years and 0.389 over 50, at the same
config. The drop flow grows with the print runs while the collector base
saturates, so the scalper share of a queue climbs across a run. `scalperCycles`
does the same for the opposite reason: it is about one cycle every seven years,
so a 30-year sweep sits near the band floor by arithmetic and not by ill
health. Both bands hold at both horizons, but a future round that changes the
sweep length will move these two numbers without touching a drops constant.

### The speculator heat loop detonated at year 40

This is the defect the round found, and it is not a scalper problem.

`speculatorHeatDelta` scaled the push by
`speculators / actors.speculatorReference`, an absolute count of 800. Heat feeds
the heat pool, the pool feeds the population, and the population feeds the heat,
with no term anywhere dividing by the size of the market. The loop gain crosses
1 between year 40 and year 50, and then it detonates. Measured on
`conservative`, one seed:

| Year | heat pool | speculators | printings at `value.heatCeiling` |
|---|---|---|---|
| 20 | 317 | 690 | 0% |
| 30 | 681 | 1,530 | 0% |
| 40 | 1,448 | 3,140 | 0% |
| 50 | **57,198** | **30,000 (the cap)** | **82%** |

Measured on three bots at seed 0, which is what the probe ran. **The first
write-up of this said "every bot, every seed", and that was not measured** - it
is the same overstatement this document made about collector holding one round
earlier. By year 50 the speculators had driven 82% of a 14,000-printing
catalogue to the heat ceiling and pinned themselves at `maxSpeculators`. Round 4
fitted the value block with the late years of every 50-year run inside that.
`struct.heatNotPinned` now reads the same quantity over 30 seeds, so the claim
is checked at the suite's sample from here on.

The fix is workflow rule 9 applied to a push rather than to a population:
`speculatorCrowd` now divides by the catalogue the pressure is spread across,
`actors.speculatorsPerPrinting * printings`. A catalogue twice the size gets
half the push per card from the same population. The heat pool then grows
smoothly to 915 by year 50, the population ends near 2,500 against a 30,000
cap, and nothing pins at the ceiling.

**`speculatorHeatGain` is the loop gain and it sits near a cliff.** At
`speculatorsPerPrinting` 1 the loop is stable at 0.2 and detonates by 0.5. It
stays at 0.05, which keeps about a four times margin. The cost is that
speculators now supply about 5% of the heat pool, so "amplify and crash"
(CONCEPT.md) is a small effect.

> **Round 5b removed the cliff.** The gain is no longer a stability knob at all;
> see below.

### Two populations that cannot answer a question

**Collector holding cannot respond to play, and no reference value fixes it.**
`collectorHeldShare` ramps on density against `collectorDensityReference`, but
density is `collectorShareOfAudience` times a goodwill and fatigue term, so it
is bounded by 0.006 to 0.034 by construction. Measured, every bot converges on
0.0283 by year 40 - `conservative`, `dropRunner` and `hypeGambler` all within 2%
of each other.

> **Corrected by Round 5b, below. The second sentence is wrong.** It was
> measured on three bots which all happen to sit near goodwill 1.0. Across the
> whole roster density runs 0.0151 (`channelHog`) to 0.0271 (`scout`), and
> lowering the reference to 0.035 turns that 1.8x spread into holding of 0.330
> against 0.432.

**The reseller population's level is unobservable.** `actors.resellers` is read
by exactly one thing, `ripMultiplier`, and only as `resellers / resellerReference`.
Scaling both leaves the rip rate identical, so `resellerReference` cannot be
fitted against anything and the reported population is cosmetic. What the
population does read is the strategy: the weighted singles-to-sealed ratio
measures 0.53 to 1.30, near 1.0 for `conservative` and near 0.6 for
`hypeGambler`. That is the part worth keeping.

### The ladder

Run during the round, per workflow rule 2. One `conservative` seed, 25 years,
the age-2 set vector: steps of 1.33x, 1.63x, 1.62x, 1.43x, 1.77x, 1.85x, 2.03x,
4.45x. No flat step and nothing stacked on the price floor.

The whole-catalogue ladder does show three 1.00x steps at its bottom, at $0.06.
That is fifty years of decayed bulk sitting on `value.priceFloorCents`, which is
what Round 4 asked the age curve to produce. The per-set vector is the
measurement of record; the world ladder is kept only so old readings stay
readable.


## The value block (tuning Round 4, 2026-09-05)

**The suite goes from 27 PASS to 37 PASS, 0 FAIL, 9 KNOWN, 0 DRIFT.** Eleven
gates that had never passed now pass. An age-2 set matches the 19 Magic and 8
Pokemon price vectors measured in `05-real-world.md`.

| Gate | Round 3 | Round 4 | Measured centre |
|---|---|---|---|
| `shape.median` | 8.47 | 0.260 | $0.24-$0.34 |
| `shape.under1` | 0.004 | 0.793 | 70-81% (Magic) |
| `shape.under25c` | 0 | 0.504 | 30-50% (Magic) |
| `shape.top1` | 0.156 | 0.337 | 0.35 |
| `shape.top10` | 0.493 | 0.765 | 0.78 |
| `shape.gini` | 0.579 | 0.827 | 0.85 |
| `shape.chaseOverMedian` | 38.5 | 330.7 | ~1000 |
| `shape.tailAlpha` | 2.388 | 1.992 | 2.0 |
| `shape.ageCurveDirection` | -0.004 | 0.082 | rising |
| `shape.ageCurveLate` | 0 | 0.804 | 69-82% |
| `shape.yearsTo100` | 1.442 | 2.442 | — |

The five knobs that moved:

```
value.baseCardPrice             150  -> 6
value.chaseSigma               0.65  -> 1.5
value.nostalgiaDecayPerYear    0.05  -> 0.20
value.priceFloorCents            20  -> 5
value.reprintNostalgiaPenalty  0.85  -> 0.73
affection.resurgenceMinAgeYears   5  -> 18
```

### The block splits into a level knob and a shape knob

This is the finding that made the round tractable, and it is exact rather than
approximate. `baseCardPrice` scales the age-2 median linearly at 0.052 cents
per cent and moves the Gini, the top-1% share, the top-10% share, the
chase/median ratio and the tail index **by nothing at all to three decimals**,
across five points spanning 30 to 150. The nostalgia gate normalises against
`baseCardPrice * nostalgiaStandingReference`, which is why.

`chaseSigma` carries the shape. `rollChase` is `exp(gauss(0, chaseSigma))`,
whose median is 1 at any sigma, so widening it pushes the bottom of a set down
and the top up while leaving the level alone.

**So: set the shape first, land the level last.** Anyone tuning this block
again should use that order.

### Round 4b was not needed, stated carefully

The plan said that if no single point satisfied the median, the bulk share and
the Gini together, a single lognormal could not make this shape and
`truth.chase` would have to become a three-part mixture. One does: at
`chaseSigma` 1.5, eleven of twelve gates land together.

State that carefully. A single lognormal reaches every target **summary
statistic**. It is not a distributional result — the research rejected
lognormality by KS test in 13 of 13 sets, and no gate here tests a
distribution. A later round that wants the measured shape rather than its
moments may still have to build the mixture. If it does, `gauss` consumes
exactly two `rand` draws, so keeping one `gauss(s.rng, 0, 1)` call and mapping
it through the normal CDF into the mixture's inverse CDF stays draw-count
neutral.

### Two things the plan got wrong

**`scarcityExponent` is not inert.** The plan said to sweep 0.30/0.45/0.60 and
"expect no move and confirm that". It moves a lot: the Gini goes 0.695 to
0.820 and the top-10% share 0.634 to 0.768. It is a second shape knob nearly as
strong as `chaseSigma`. It still stays at 0.45, but on the measured per-rarity
medians — a common and an uncommon sit at almost the same price, and
`printQuantity` is already rarity-scaled — and no longer on a claim of
non-responsiveness that turned out to be false.

**`priceFloorCents` had to move, and the plan said to leave it.** A 20-cent
floor never binds against the old $8.47 median. Against the fitted $0.26 median
it pinned 40% of every set within a cent of itself. The plan's instruction was
correct when written and its premise did not survive its own round.

### The gates could not see the floor spike. The ladder could

`under25c` read 0.486 and passed while describing a distribution the research
rejects: it counts cards below $0.25 and cannot tell a spread from a stack.
What caught it was rule 2 of `04-workflow.md`, the decile ladder:

```
before (priceFloorCents 20)        after (priceFloorCents 5)
  p 10  $ 0.19   step —              p 10  $ 0.06   step —
  p 20  $ 0.19   step 1.00x          p 20  $ 0.08   step 1.33x
  p 30  $ 0.21   step 1.11x          p 30  $ 0.12   step 1.50x
  p 40  $ 0.21   step 1.00x          p 40  $ 0.21   step 1.75x
  p 50  $ 0.30   step 1.43x          p 50  $ 0.30   step 1.43x
```

Two 1.00x steps are the flat mush rule 2 exists to detect. **This round fitted
the whole block from the gate table and did not run `--dist` until the numbers
were already in `config.ts`.** Run the ladder during a value sweep, not after
it. No gate measures concentration at the floor, so the suite cannot replace
it — which is worth knowing about the suite, not only about this round.

### `shape.surpriseGrail` cannot be cleared by any tuning round

`metrics.ts` tests `rawPrice / value.baseCardPrice >= 100`. That is a
scale-invariant ratio, so lowering the price body cannot move it, and it did
not: 1.000 at fifteen measured points spanning a 30x range of `baseCardPrice`.
The gate's own note said Round 4 "should restore it". That note was wrong by
construction.

The real cause is Round 3. This is a per-run boolean over the whole catalogue,
so at 280 cards a set it asks whether any one of about 8,400 printings ever
broke out over 30 years, and the answer is certain. Its neighbour
`shape.yearsTo100` carries the same diagnosis in its own note and nobody
applied it here.

**Fixing it needs the metric redefined per set, and that needs a band nobody
has.** `05-real-world.md` calls its own 0.5-1%-per-year figure weak. What the
gate uniquely tests — that the breakout card is a *common or uncommon*, value
emergent rather than authored by rarity placement, CONCEPT.md §10 — is worth
keeping, so this is a design decision and not a tuning one. It is left
`known-fail` with the cause recorded.

### `sub.scalperShare` regressed on paper and improved in substance

It went 0.242 to 0.000 and is now `known-fail`, owned by Round 5. **The 0.242
was never a real pass.** `peakScalpers` was 0 and `scalperCycles` was 0, so the
population never moved once in thirty years — the gate's own note said as much
and predicted Round 4 would move both.

Isolated on `dropRunner` over 20 seeds x 30 years, varying only
`baseCardPrice`: the share reads 0.475 at 150, 0.062 at 30 and 0.004 at 6.
Round 4c then took it to 0.000, and took the reseller population off its floor
of 20 up to 266.

**Round 5 must not fix this by re-pinning the population.** The `drops` and
`actors` constants are calibrated to a price body that no longer exists, and
they are what needs refitting. Read the gate beside `sub.scalperCycles`.

### The sample-size warning

`shape.yearsTo100` passes at 2.442 over 30 seeds and reads 1.981 over 20,
against a band floor of 2.0. It is a median across seeds of a strongly skewed
quantity. It is a real pass at the suite's own sample size, and it is the gate
most likely to flip on an unrelated change.

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
- A scalper's appetite reads the queue as well as the sealed premium. A fresh
  product's market price opens at its MSRP by construction, so on the premium
  alone a release-day drop can never be worth camping — and a release-day drop
  is the only kind anybody camps. `drops.shortagePremiumWeight` is what makes
  the whole subsystem more than an ornament
- **Per-capita applies to what a population PUSHES, not only to what it earns.**
  The scalper loop divides its return by the population; the speculator loop did
  not divide its heat push by anything, so heat fed the pool, the pool fed the
  population, and the population fed the heat. It held for forty years and then
  pinned 82% of the catalogue at `value.heatCeiling`. `speculatorCrowd` now
  divides by the catalogue the pressure is spread across
- **A population must not be paid with its own bid.** `PrintingMarket.speculatorHeat`
  is the heat the speculators themselves pushed in, and `tickActors` subtracts it
  before reading the pool as a return. Put it back and the loop is degenerate
  again — the population becomes `E / (heatPerCapita - a)`, which damps to the
  exogenous level or diverges to its cap with nothing usable between.
  `struct.heatNotPinned` is the gate that catches it
- **The reseller pool's level only reaches the world through
  `actors.ripUnitsPerReseller`.** Everything else reads the population as a ratio
  to its own reference, where scaling both changes nothing. Remove the throughput
  and the level is decoration again; `struct.ripRationBinds` is the gate
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

**Round 9 of the tuning run: the reveal window.** The round plan lives outside
the repo, at `~/.claude/plans/let-s-start-the-tuning-zesty-magpie.md`. It holds
the ordering and the reasoning for all twelve rounds, and its round-order table
and per-round outcome notes are current to Round 8. Read it first, then the
"Licensing" section above, then run `npm run check`.

Rounds 0 to 8 are done and banked under `docs/tuning/bank/`. The suite stands at
**48 PASS, 0 FAIL, 4 KNOWN, 0 DRIFT** across 52 gates, and takes about two and a
half minutes.

### Read this before you change anything

**Round 9 renumbers the main RNG stream, and it is the last round allowed to.**
`tickReveal` draws one `gauss` per preview, which is two `rand` calls on
`s.rng`. Shrinking the window from 12 previews to 3 removes 18 draws per set,
and every draw after the first preview of the first set shifts. So:

- Every banked value becomes incomparable at the moment the window changes.
  **Rebank the whole suite** with `npm run check -- --bank=9`.
- Do not read a Round 8 number against a Round 9 one, including the numbers in
  the "Licensing" section above.
- Exit criteria are therefore absolute — bands, invariants, no NaN — never a
  comparison to an earlier bank. Rounds 2 and 3 worked the same way.
- Make the renumbering change FIRST, rebank, and only then tune. Tuning against
  a bank you are about to invalidate is a round thrown away.

### The knobs, and what they read today

| Path | Now | Round 9 target |
|---|---|---|
| `hype.defaultLeadWeeks` | 12 | 3 |
| `hype.defaultCadenceWeeks` | 2 | — |
| `hype.marketingReference` | $100,000 | down |
| `hype.marketingHypeGain` | 1.2 | down |
| `hype.prereleaseCostPerScale` | $25,000 | see below |
| `hype.prereleaseHypeGain` | 0.12 | — |
| `hype.signalNoiseSigma` | 2.0 | holds the signal band |

`hypeBuilder` and `hypeGambler` both carry `revealLeadWeeks: 16` and
`revealCadenceWeeks: 1` in `harness/bots.ts`. The plan takes both to 3. They are
the only bots that campaign, so they are the only bots that will move.

**`marketingHypeGain` was swept in an earlier round and has a reason attached.**
At 0.35 marketing was strictly dominated by a prerelease at equal spend, so
nobody would ever buy it. 1.2 makes it competitive and still the dearer route to
the same hype, which is the relationship the round wanted. Lowering it is
allowed — that is this round's job — but do not lower it past the point where
cash-bought hype is dominated again, or the lever stops being a decision.

### One premise in the plan to check before acting on it

The plan says to make a prerelease **cost-neutral rather than revenue-positive**,
on the grounds that a free lever with an upside is not a decision. **Verify that
premise first.** `hostPrerelease` in `engine.ts` books a `category: 'event'`
debit and no revenue at all — it buys hype, segment goodwill and LGS
relationship for cash, and sells nothing. So it is already revenue-negative, and
the plan's recommendation may be describing a model that no longer exists. If it
is, say so in the round notes rather than implementing a change to match it.

### Exit criteria

- `marketingTotal` under 1% of revenue. The metric already exists in
  `harness/metrics.ts` and prints in the hype table.
- `signalCorrelation` still rises with previews and lands 0.5-0.9. The three
  gates that hold this are `sub.signalLow` (0.447), `sub.signalHigh` (0.826) and
  `sub.signalRises` (0.379). **A three-preview window is the low end of that
  spread**, and `signalNoiseSigma: 2.0` was fitted so a default three-preview
  window reads r = 0.55 — check the fit still holds when 3 becomes the default
  rather than the floor.
- The campaign-economics shape survives: a campaign pays only when it lets you
  print a bigger run.

### The gates most likely to move

| Gate | Reads now | Why it is exposed |
|---|---|---|
| `sub.signalLow` | 0.447 | fewer previews at the low end |
| `sub.signalHigh` | 0.826 | the 16-preview campaign is going to 3 |
| `sub.signalRises` | 0.379 | the spread between the two shrinks |
| `diff.hypeGamblerSurvival` | 0.850 | sits on its band ceiling of 0.85 already |
| `diff.hypeGamblerTopEarner` | 1 | the greedy campaign must stay the top earner |
| `diff.licensorEarns` | 1.536 | see below |
| `diff.licensorSurvival` | 0.850 | see below |

**The two licensing gates are the newest and neither has survived a
renumbering.** Round 8 made `licensor` the only bot whose print run is sized by
an engine-side quantity — `collabOfferFactor` — rather than by its own options.
The reveal window and the licence now compete for the same lever: a campaign
sizes the run through `campaignRunMultiple`, and a licence sizes it through the
demand it bought. If Round 9 weakens cash-bought hype, read both licensing gates
in the same sweep rather than assuming they are out of scope.

### The commands

```
npm run check                                                   # all 52 gates
npm run check -- --bank=9                                       # and rebank it
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist   # the ladder
npx tsx harness/check.ts --print-bands                          # after a band edit
```

`harness/gates.ts` is the single source of truth for every band.
`docs/tuning/03-targets.md` holds a generated copy between the `BANDS:START` and
`BANDS:END` markers, and `static.bandsInSync` fails if they drift. `--bank=N`
writes `docs/tuning/bank/round-N/` but does **not** write the `banked:` values
back into `gates.ts` — set those by hand, then regenerate the band table, then
run `npm run check` once more to confirm it is green.

### The four remaining known-fails

| Gate | Reads | Owner |
|---|---|---|
| `diff.conservativeSurvives` | 0.900 against [0.95, 1] | Round 10 |
| `diff.idleDies` | 12.019 against [2.5, 9] | Round 10 |
| `sub.channelHogLosesReach` | 7 against [0.5, 6] | Round 11 item 2 |
| `shape.surpriseGrail` | 1 against [0.1, 0.6] | **nobody** |

Round 7 repaired `diff.botsAlwaysSurvive` (1 -> 6) and `diff.allInSurvival`
(0.050 -> 0.400), both by fixing the artist rates rather than by touching
finance. `diff.conservativeSurvives` moved 0.700 -> 0.900 and is one seed short;
the Round 7 section shows the storage setting that reaches 0.950 and what it
costs, which is the blind bet's downside. That is Round 10's trade to make.

`sub.channelHogLosesReach` is new, and it is a tripwire Round 3 armed on purpose
rather than a regression. Do not widen its band. See the Round 7 section.

`shape.surpriseGrail` cannot be cleared by tuning at any value: it is a
scale-invariant ratio over the whole catalogue, so at 280 cards a set it asks
whether any one of about 8,400 printings ever broke out over 30 years, and the
answer is certain. Fixing it needs the metric redefined per set, and that needs
a band `05-real-world.md` says the research cannot supply. **It is a design
decision, not a round.**

### Two things Round 10 should know before it starts

1. **The art rate band is a scale correction, not a rate.** It ships at a fifth
   of the researched $400-$2,500 because our publisher earns about a fifth of a
   real one. When Round 10 lifts `startingCash` and print volume toward real
   scale, that factor must shrink toward 1 in step, or art silently becomes a
   rounding error again. The full reasoning is in the Round 7 section.
2. **The art exit bands are unfitted on purpose.** Per AJ's call in Round 7 they
   are pre-measurement guesses, to be re-fitted after capital settles, against
   what the corrected model produces. Round 7 recorded the measurements to start
   that re-fit from: `conservative` 3.5%, `safeHands` 13.3%, `scout` 0.7%, and
   `scout` beating `safeHands` on top card in 15 of 20 seeds.

### Nine things this run has learned the hard way

Each of these cost a round or a correction. They are in `04-workflow.md` as
rules; this is the short form. Numbers 6 to 8 are stated in full in the Round 7
section above.

1. **Run the decile ladder DURING a value sweep, not after it.** Round 4 fitted
   the whole value block off the gate table and shipped a distribution with 40%
   of every set pinned against the price floor. No gate measures concentration
   at the floor.
2. **Per-capita applies to what a population PUSHES, not only to what it earns
   — and a population must not be paid with its own bid.** The speculator loop
   broke both and detonated at year 40, silently, because nothing measured the
   catalogue past the gated horizon.
3. **A knob the bot roster cannot reach has not been measured**, however
   carefully it is fitted. Three so far: `drops.scalperAppealPremium` (the only
   bot that makes a premium collection never opens the direct store),
   `printing.qualityGradeShift.budget` (`flooder` is the only budget bot and it
   dies at a median year 0.75) and `.archival` (nothing prints it). The fix is a
   bot, not a value.
4. **A cumulative state cannot answer a question about a moment.** A gem rate
   read off a pop report averages a printing's whole submission history. It
   understated the age effect by nearly six times — and the same round shipped
   the identical defect on the quality split one screen further down the same
   file. When you find a defect of this shape, grep for its siblings before
   closing the round.
5. **Measure the claim you are about to write down.** This document has twice
   recorded something as true of "every bot and every seed" that was measured on
   three bots at one seed, and was wrong once. Round 5 declared collector
   holding unfixable on that basis; Round 5b fixed it.
9. **Never discard stderr in a sweep, and never trust `out/runs.csv` without
   checking the exit code.** A silenced sweep in Round 8 threw on every leg,
   left the previous run's CSV in place, and read back as three identical rows
   — a perfectly convincing measurement that a live knob was inert. A sweep loop
   writes its log to a file and reports a non-zero exit.

### Before you touch the value engine again

```
npm run check                                                   # all 52 gates
npm run check -- --bank=9                                       # and bank it
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist   # the ladder
```

`harness/gates.ts` is the single source of truth for every band. `03-targets.md`
holds a generated copy between comment markers and `static.bandsInSync` fails if
they drift — so after editing a band or a banked value, regenerate it:

```
npx tsx harness/check.ts --print-bands
```

**Bank what the suite measures, not what a scratch probe measured.** Round 6
banked two gates off the probe it fitted on; both sat under the drift threshold,
so nothing flagged, and it quietly spent the next round's drift budget.

### The scratch scripts are gone

Round 7 needed none of them: every sweep it ran was `npm run sim --set=...`
piped through `awk`, and the two numbers the harness could not produce
(`revenue`, `artSpendShare`) were added to `harness/metrics.ts` instead of
measured in a probe. Prefer that order — a metric the suite owns cannot drift
away from the claim it supports.

Rounds 5 and 6 leaned on throwaway scripts under `out/scratch/` — a config
sensitivity screen, a drops sweep driver, a grading probe, a config-path
auditor. **`out/` is gitignored, so none of them are in the repo.** They are
cheap to rewrite and the method matters more than the code: each one builds
`RunTask`s, calls `runBatch` from `harness/batch.ts` with 12 jobs, and reduces
`RunMetrics` to a median per config point. If a later round wants the screen
permanently, promote it into `harness/` rather than rebuilding it a third time.
