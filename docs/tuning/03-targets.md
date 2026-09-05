# Balance targets

What each system must produce, the metric that measures it, and the knob that
moves it. A tuning change is finished when these still hold.

Everything here comes from `CONCEPT.md` §10 and the measurements banked in
`HANDOFF.md`. Metric names are the fields of `RunMetrics` in
`harness/metrics.ts`; they are also the CSV column names in `out/runs.csv`.

---

## The gated bands

`npm run check` enforces every band below. **This table is generated** — it is
printed by `npm run check -- --print-bands` from `harness/gates.ts`, which is the
single source of truth. The `static.bandsInSync` gate compares the two and fails
if they drift, so do not hand-edit it: change the band in `gates.ts` and re-paste.

Widen a band only in the same change that appends a dated reason to that gate's
`why` field.

`expect: known-fail` marks a band the model does not meet yet and a later round
is meant to fix. When one starts passing, the suite reports `FIXED` and names the
line to flip — flipping it is what stops the next round undoing the work.

<!-- BANDS:START -->
| Gate | Category | Band | Banked | Expect |
|---|---|---|---|---|
| `static.typecheck` | static | 1 – 1 | 1 | pass |
| `static.invariants` | static | 0 – 0 | 0 | pass |
| `static.parallelIdentity` | static | 1 – 1 | 1 | pass |
| `static.bandsInSync` | static | 1 – 1 | 1 | pass |
| `struct.deathRoutes` | structural | 4 – 4 | 4 | pass |
| `struct.overprintDeaths` | structural | 15 – 95 | 82 | pass |
| `struct.debtSpiralDeaths` | structural | 15 – 90 | 81 | pass |
| `struct.channelCollapseDeaths` | structural | 8 – 70 | 12 | pass |
| `struct.attentionCollapseDeaths` | structural | 8 – 60 | 20 | pass |
| `struct.speculatorMoves` | structural | 1.2 – 500 | 3.6413 | pass |
| `struct.collectorNotPinned` | structural | 5 – 1000000000 | 20 | pass |
| `struct.printRunVaries` | structural | 4 – 100 | 19 | pass |
| `diff.botsAlwaysSurvive` | difficulty | 3 – 11 | 1 | known-fail |
| `diff.botsNeverSurvive` | difficulty | 2 – 8 | 5 | pass |
| `diff.conservativeSurvives` | difficulty | 0.95 – 1 | 0.7 | known-fail |
| `diff.hypeGamblerSurvival` | difficulty | 0.4 – 0.85 | 0.65 | pass |
| `diff.hypeGamblerTopEarner` | difficulty | 1 – 3 | 1 | pass |
| `diff.allInSurvival` | difficulty | 0.1 – 0.6 | 0.05 | known-fail |
| `diff.flooderDiesEarly` | difficulty | 0.4 – 2.5 | 0.75 | pass |
| `diff.attentionBurnerDies` | difficulty | 0.85 – 1 | 1 | pass |
| `diff.idleDies` | difficulty | 2.5 – 9 | 12.0192 | known-fail |
| `diff.deathsLandMidRun` | difficulty | 3 – 25 | 8.1731 | pass |
| `diff.sellThrough` | difficulty | 0.75 – 0.95 | 0.8789 | pass |
| `diff.flopRate` | difficulty | 0.01 – 0.25 | 0.0286 | pass |
| `shape.median` | shape | 0.2 – 0.5 | 0.26 | pass |
| `shape.under1` | shape | 0.64 – 0.92 | 0.7929 | pass |
| `shape.under25c` | shape | 0.25 – 0.8 | 0.5036 | pass |
| `shape.top1` | shape | 0.21 – 0.62 | 0.3369 | pass |
| `shape.top10` | shape | 0.66 – 0.95 | 0.7647 | pass |
| `shape.gini` | shape | 0.72 – 0.98 | 0.8267 | pass |
| `shape.chaseOverMedian` | shape | 130 – 3100 | 330.7037 | pass |
| `shape.tailAlpha` | shape | 1.6 – 2.7 | 1.9917 | pass |
| `shape.ageCurveDirection` | shape | 0.02 – 0.45 | 0.0821 | pass |
| `shape.ageCurveLate` | shape | 0.55 – 0.92 | 0.8036 | pass |
| `shape.surpriseGrail` | shape | 0.1 – 0.6 | 1 | known-fail |
| `shape.yearsTo100` | shape | 2 – 9 | 2.4423 | pass |
| `sub.signalLow` | subsystem | 0.3 – 0.72 | 0.4299 | pass |
| `sub.signalHigh` | subsystem | 0.65 – 0.97 | 0.8254 | pass |
| `sub.signalRises` | subsystem | 0.08 – 0.55 | 0.3955 | pass |
| `sub.gem10Premium` | subsystem | 2 – 5.5 | 6.082 | known-fail |
| `sub.gradedPrintingShare` | subsystem | 0.02 – 0.09 | 0.0482 | pass |
| `sub.gemRate` | subsystem | 0.3 – 0.6 | 0.1017 | known-fail |
| `sub.scalperCycles` | subsystem | 3 – 35 | 0 | known-fail |
| `sub.scalperShare` | subsystem | 0.1 – 0.5 | 0.0003 | known-fail |
| `sub.houseArtShare` | subsystem | 0.02 – 0.2 | 0.097 | pass |
| `sub.channelHogLosesReach` | subsystem | 0.5 – 6 | 6 | pass |
<!-- BANDS:END -->

See [06-regression.md](06-regression.md) for how to run the suite and read a
verdict.

---

## 1. The price distribution — a power law, not flat mush

Measured over 30 seeds x 25 years on `conservative`.

| Metric | Target | Last measured | Real-world |
|---|---|---|---|
| `surpriseGrail` | 15-40% of runs | 30% | no comparable figure exists |
| `top1PctShare` | 0.4-0.7 | 0.584 | **0.21-0.62, median 0.35** |
| `medianCardPrice` | a few dollars | $4 | **$0.24-$0.34** |
| `yearsToFirst100Dollar` | 3-8 | 5.2 | no comparable figure exists |
| chase / median ratio | — | ~1,125x | **130x-3,100x, central ~1,000x** |

`surpriseGrail` uses CONCEPT.md §10's 100x bar.

**Two of these targets are now known to be wrong.** The right-hand column comes
from live price vectors for 19 Magic and 8 Pokemon sets, measured 2026-09-04 —
see [05-real-world.md](05-real-world.md) §2.

- **`medianCardPrice` should be about $0.30, not "a few dollars".** The measured
  median is stable at $0.24-$0.34 across 15 Magic sets from 2020 to 2025. Ours
  is 13x that. Real distributions are far more bottom-heavy: the median card is
  a bulk common sitting almost on the floor.
- **`top1PctShare` at 0.584 is at the top of the measured band** (0.21-0.62,
  median 0.35), not comfortably mid-band as the 0.4-0.7 target implies.

The chase-to-median ratio, which nothing was targeting, is almost exactly right.
Add it as a target.

**Before retuning the median, fix the unit mismatch.** [Round 0 fixed the second
half of this: the age-2 snapshot measures one set's card list. Round 3 fixed the
first half: sets are 280 cards.] The text below is kept for the record.

Our sets are 70 cards against a real 280, so we carry proportionally fewer bulk
commons by construction; and `medianCardPrice` is taken over printings rather
than over a set's card list.

**Do not read the median and max columns for shape.** Use `--dist`. Only the
step between deciles tells a power law from flat mush. The shipped ladder steps
1.33-1.41x through the middle deciles, then 1.73x at p90, 19x at p99, and 12.5x
to the top. Widening steps are the shape. Equal steps are mush.

**Knobs:** the whole `value` block, as one unit. See `01-knobs.md`.

**The measured shape is not a lognormal.** A Kolmogorov-Smirnov test rejected
lognormality in all 13 sets tested, usually by a factor of 3. The upper tail is
a power law with index α ≈ 1.8-2.2. The recommended generative form is a
three-part mixture: a soft floor near $0.10-$0.30, a lognormal body with log-SD
1.2-1.9, and a Pareto tail over the top 5-10%. Target a Gini of 0.85 and a
top-10% value share of 78% — neither of which we currently measure at all.

**Open watch item:** the p99 step was 2.7x when the value block was swept and is
19x now. It steepened across the region, actor and difficulty passes.
`top1PctShare` is still in band, so nothing is out of tolerance, but this is the
row to watch. Suspect `hype.heatFromHype`.

---

## 2. Difficulty — the studio must be able to die

Measured over 20 seeds x 30 years, 18 bots.

Re-measured 2026-09-04, after rivals were cut.

| Target | Status |
|---|---|
| Not every strategy survives | 7 of 18 bots survive 100% |
| Deaths land mid-run, not in year one | Years 4-23, except the two regressions |
| The greedy strategy earns most and dies most | `hypeGambler`: $14.2M, 65% survival |
| Doing nothing loses | $500,000 runs out in about 5 years |

Survival: 100% for `licensor`, `chainRunner`, `chainWeaver`, `conservative`,
`chaseMaxxer`, `dropRunner` and `scout`; 95% `hypeBuilder` and `channelHog`;
70% `safeHands`; 65% `hypeGambler`; 50% `bigBets`; 35% `allIn`; and 0% for
`smallBets`, `globalist`, `flooder`, `attentionBurner` and `specialtyOnly`.

`flooder` (year 0.9) and `attentionBurner` (year 2.2) are the flood-death and
attention-death regressions and are meant to die.

**Death routes.** CONCEPT.md §7 lists five. Four fire:

| Route | Fires | Reached by |
|---|---|---|
| `overprint` | yes | needs `finance.storagePerUnitPerTick` |
| `debt_spiral` | yes | needs the `weeklyOverhead*` lines |
| `channel_collapse` | yes | `channelHog`, `globalist` |
| `attention_collapse` | yes | `attentionBurner`, at year 2.2, fatigue 0.91, attention 0.11 |

A fifth route, `irrelevance`, was cut with rivals on 2026-09-04. These four are
the complete set and all four fire.

**Metrics:** `survived`, `deathYear`, `deathCause`, `netWorth`,
`liquidNetWorth`, `peakDebt`, `unsoldUnits`, `inventoryValue`.

**Read `netWorth` and `unsoldUnits` together.** Inventory is booked at cost, so
net worth alone cannot tell a full warehouse from a full bank.

---

## 3. Release cadence — an optimum with a cliff on the fast side

Sweeping `conservative` from 6 to 78 weeks put the optimum at 18 weeks.
Under-releasing is a gentle loss; over-releasing is a cliff. That asymmetry is
what CONCEPT.md §6.2 asks for.

**The net-worth levels in the `HANDOFF.md` cadence table predate the difficulty
pass and are not comparable to anything printed today.** The shape is what the
table is kept for. Re-measuring needs a scratch script: cadence is a bot
constant, not a config path.

**Knobs:** `attention.fatigueBite`, `fatigueExponent`, `fatigueDecay`,
`fatigueGain`. **Metric:** `fatigue`.

The two fatigue knobs do different jobs. `fatigueBite` is what makes flooding
fatal. `fatigueExponent` protects the careful publisher and **does not** sharpen
the mid-range penalty — above 1 it is more forgiving in the middle, not less.

---

## 4. The blind bet — how much to print must have a wrong answer

| Target | Last measured |
|---|---|
| A reference-sized run clears ~87% | at `referenceRunUnits` 5000 |
| It flops about 11% of the time | at the same |

At 8000 the run cleared 96% and flopped 2%, so the bet had no variance and no
demand-side lever could buy anything: there was never unmet demand to reach.

**Knob:** `attention.referenceRunUnits`. **Metrics:** `avgSellThrough`,
`flopRate`, `meanPrintRun`.

`meanPrintRun` exists because a roster where every bot prints a fixed number
never makes the bet the game is about. Only the `bankroll` bots vary it.

---

## 5. The reveal window — a signal that must be able to be wrong

| Target | Last measured |
|---|---|
| A no-campaign window reads poorly | r = 0.55 at 3 previews |
| A full campaign reads well, not perfectly | r = 0.86 at 16 previews |

Near 1 gives the answer away and the blind bet is solved. Near 0 is noise the
player should ignore. It wants to be in between and to rise with previews.

**Knob:** `hype.signalNoiseSigma`. **Metric:** `signalCorrelation`.

Campaign economics, 20 seeds x 30 years:

| Strategy | Lived | Net worth |
|---|---|---|
| no campaign | 20/20 | $7.1M |
| previews + 1.6x run | 17/20 | $11.7M |
| previews + prerelease + 1.6x run | 20/20 | $11.9M |
| previews + marketing + 1.6x run | 20/20 | $11.1M |
| everything + 2.2x run | 14/20 | $14.6M |

A campaign pays only when it lets you print a bigger run, and that is also how
it becomes a way to lose. Buying demand past the run you committed to is waste.

**Metrics:** `avgHypeAtRelease`, `marketingTotal`, `prereleasesHosted`.

---

## 6. Regions — a region must be able to be the wrong region

| Target | Knob |
|---|---|
| A reading must be able to be wrong | `region.readingNoiseSigma` |
| Taste must cost something to get wrong | `region.mismatchPenalty` — at 0 a region is a pure size multiplier |
| Knowledge must be worth buying | `region.knowledgeGainPerRelease`, `PerResearch` |

**Metrics:** `regionReadingCorrelation`, `regionsOpen`, `regionKnowledge`,
`exportShare`, `regionUnlockSpend`.

**Open problem:** `globalist` dies in 20/20 seeds, mostly of `channel_collapse`.
Expanding doubles the channel obligations and the distributors sour. Plausible,
untuned, and possibly too harsh.

---

## 7. Grading — a fee that must be a real hurdle

| Target | Last measured | Real-world |
|---|---|---|
| A minority of printings clear the fee | 6.0% | ~5% ("one card in twenty") ✅ |
| A minority of copies get sent | 18.6% | no comparable figure |
| A gem must stay rare | `gemRate` 9.6% | **50% for modern TCG, 1% for vintage** |
| Gem premium over raw | `gem10Premium` 4.7x | 2-5x modern, 5-10x vintage ✅ |
| The third grader arrives mid-run | years 4-13 | — |

**`gemRate` is the grading layer's biggest mismatch.** Modern TCG measures 50%;
ours is 9.6%. But the fix is not a global raise — the measured rate spans **1%
to 88%** across cards, driven by print quality and era. Our
`printing.qualityGradeShift` runs -0.15 to +0.2, far too narrow to span that.
See [05-real-world.md](05-real-world.md) §2b.

**Knobs:** `grading.feeWorthMultiple` decides **which** printings qualify (19.8%
at 2, 2.8% at 25). `grading.submitRatePerTick` decides **how many** copies (13%
to 31%). `grading.sideGraderBrandGate` places the third grader.

**Metrics:** `gradedShare`, `gradedPrintingShare`, `gemRate`, `gem10Premium`,
`printingsGraded`, `gradersActive`, `gradedCopies`.

`gem10Premium` is the number the layer lives on: too low and nobody submits, too
high and raw prices stop meaning anything. It has **no measured band yet** — the
`tierMultiplier` table was fitted by eye.

---

## 8. The art pipeline — a deadline that can be missed

| Target | Last measured |
|---|---|
| House filler is visible but survivable | ~9% of cards, so a 280-card set ships 26-27 |
| Art is a budget line, not a rounding error | 4.6% of revenue on `conservative` |
| Buying visible reputation must hurt | 26.9% of revenue on `safeHands`, 4 deaths in 15 seeds |
| Scouting must be cheap now and pay later | 1.6% of revenue on `scout` |
| Scouting must lose about half its seeds on top card | the bet |

**Knobs:** `art.maxLateWeeks` (must be able to cross the 18 weeks between commit
and release, or the house-art path never fires), `art.rateGrowthPerReputation`,
the opening artist rate range in `world.ts`.

**Metrics:** `artSpend`, `houseArtShare`, `meanArtQuality`,
`meanArtistReputation`, `artistReputationGained`, `artistsRetained`,
`rosterSize`.

**Caveat:** see inconsistency 1 in `02-hardcoded.md`. Newcomer artists are minted
at $0.50-$3.00 a card, so long runs get cheaper art than these figures show.

---

## 9. Drops and scalpers — a population that cycles

| Target | Last measured |
|---|---|
| The population must cycle, not settle | about every 6 years |
| It must settle well below its cap | near 900 against 40,000 |
| Scalpers take a real share, collectors still take most | about a quarter of units |

**Knob:** `drops.unitsPerScalperReference`. Below ~0.1 the population runs away
to `maxScalpers` and stops cycling.

**Metrics:** `dropsRun`, `dropSellOutRate`, `scalperShareOfDrops`,
`peakDropPremium`, `scalperPopulation`, `scalperCycles`, `peakScalpers`.

`scalperCycles` of 0 means the population never moved. That is the failure this
whole block exists to avoid.

---

## 10. Channels — souring must cost reach

**Target:** `channelHog` must lose the distributor and fall back to LGS volume
(CONCEPT.md §6.5).

**Metrics:** `channelsUnlocked`, `channelsLost`, `worstRelationship`,
`avgSellThrough`.

**No block was swept.** All 17 config paths plus the 30 trait constants are
first-guess.

---

## 11. Populations — each one must move and come back

**Metrics:** `collectors`, `collectorHeldShare`, `resellers`, `speculators`,
`speculatorSwing`, `aftermarketIndex`.

A population reporting the same number in every seed is a constant wearing a
population's clothes. That has happened twice already — `collectorDensityReference`
at 0.03 pinned holding to its ceiling, and `ripBreakEven` at 1 pinned resellers
to their floor.

`speculatorSwing` is the one that is meant to move. Read it before believing the
end-of-run population.

---

## 12. Collabs, creators and chains — shape only

No targets are measured. All three blocks are wired for behaviour.

**Collabs.** Reach now against equity later. A studio that lives on collabs
should sell well and own little. **Metrics:** `collabOffers`, `collabsSigned`,
`collabSpend`, `meanIpAffection`.

**Creators.** **Metrics:** `creatorCoverage`, `creatorOwnShare`,
`bestCreatorRelationship`. `creatorOwnShare` is now a constant 100% by
construction — the player is the only publisher. Drop it, or repurpose it.

**Chains.** `acrossSets` must be worth more than `inSet` — it is the hedge that
carries a set with a weak subject. **Metrics:** `chains`,
`chainsSpanningSets`, `meanChainLength`.

---

## No standing caveat

Rivals were cut on 2026-09-04, and CONCEPT.md §11's warning that *"any tuning
done in a world without competitors is tuning against the wrong numbers"* went
with them. **Every number on this page is now measured against the world the
game actually ships.**

What that puts on the `attention` block is worth stating plainly: with no
competitor to soak up demand, fatigue and spent attention are the *only* things
limiting how much a studio can release. `fatigueBite`, `fatigueDecay` and
`referenceRunUnits` carry the whole counterweight. Read them as the most
load-bearing knobs in the model, not as one block among sixteen.
