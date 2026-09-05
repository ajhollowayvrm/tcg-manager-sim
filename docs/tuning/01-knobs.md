# The config knobs

Every path in `src/sim/config.ts`. There are **511**. Each one is reachable with
`--set=<path>=<number>`; `withOverrides` throws on a path it does not know, and
nested paths work to any depth:

```
--set=channels.traits.lgs.reach=2.0
--set=rarity.pull.common=6
--set=world.regions.reg_jp.marketSize=0.9
--set=graders.grd_pinnacle.tiers.standard.price=5000
```

Values are the shipped defaults on 2026-09-04.

This page documents the knobs that were already here before the config move,
with what each one does and whether it was measured. The blocks added by the
move — `rarity`, `market`, `strides`, `world`, `graders`, `channels.traits`,
`channels.seeds`, and the per-formula constants folded into `value`,
`attention`, `affection`, `art`, `finance`, `printing`, `sealed`, `region`,
`collabs` and `creators` — are documented in `src/sim/config.ts` itself, beside
their values. **All of them are first-guess unless a comment there says
otherwise.**

The largest of the new ones, worth knowing by name:

| Path | Value | Why it matters |
|---|---|---|
| `attention.demandCoefficient` | 0.06 | The master demand coefficient. Every unit of demand passes through it. |
| `attention.demandDecayPerYear` | 1.4 | How long a set keeps selling. A 5-year-old set is three zeroes down. |
| `rarity.pull.*` | 4 to 0.004 | Copies of one card per pack, at `rarity.referenceSetSize`. How rarity reaches price. |
| `rarity.referenceSetSize` | 70 | Set size the `pull` table is written for. A pack holds a fixed number of cards, so `rarityPull` scales `pull` by `referenceSetSize / cards in the set`. Added in Round 3. |
| `rarity.weight.*` | 1 to 90 | Demand-side rarity signal. Never touches price. |
| `channels.traits.*` | 30 values | The whole shape of the retail layer. |
| `grading.gradeCuts.*` | 9.75 to 6.5 | Sets `gemRate` jointly with `conditionSigma`. |
| `finance.startingCash` | $500,000 | The scale the whole difficulty curve is set against. |
| `value.desireReference` | 40 | Desire at which the price demand term equals 1. |
| `strides.*` | 4, 2, 13, 52 | Tick rotations. See `02-hardcoded.md` before touching. |

---

## `value` — the price engine (20 paths)

This block was swept as one unit over 30 seeds x 25 years. The knobs are not
independent. Move one and re-measure all five targets in
[03-targets.md](03-targets.md).

The formula in `tickPrices`:

```
scarcity   = (referencePopulation / survivingCopies) ^ scarcityExponent
art        = 1 + artQuality * artistReputation * artMultiplierWeight
target     = baseCardPrice * softCap(scarcity * (desire/40) * art * truth.chase
             * heat * nostalgia * climate * noise, priceCeilingMultiple)
rawPrice  := rawPrice * 0.62 + max(priceFloorCents, target) * 0.38
```

| Path | Value | What it moves | Status |
|---|---|---|---|
| `value.baseCardPrice` | 150 | $1.50. The price of a card with every multiplier at 1. Scales the whole ladder. | structural |
| `value.cameoWeight` | 0.15 | How much a cameo IP's affection adds to a card's desire. | first-guess |
| `value.scarcityExponent` | 0.45 | Steepness of the day-one rarity ladder. Deliberately shallow: a steep ladder spends the next 20 years of discovery in year 2. | swept |
| `value.artMultiplierWeight` | 0.6 | How much art quality times artist reputation multiplies price. The payoff on the whole art pipeline. | swept |
| `value.nostalgiaRatePerYear` | 0.16 | Growth per year on a printing that passes the nostalgia gate. The engine that separates the top 1%. | swept |
| `value.heatDecayPerTick` | 0.08 | How fast heat returns to 1. Sets how long a spike lasts. | swept |
| `value.noiseSigma` | 0.12 | Width of the per-update lognormal price noise. | swept |
| `value.priceFloorCents` | 20 | $0.20. Bulk commons are worth cents. A floor at $1 piles half the population on one price. | swept |
| `value.priceCeilingMultiple` | 5000 | Soft cap on the multiplier stack, in multiples of `baseCardPrice`. | structural |
| `value.heatFloor` | 0.4 | Heat cannot reach 0, because heat multiplies price. A crash must overshoot below 1. | swept |
| `value.heatCeiling` | 6 | Cap on heat. | swept |
| `value.nostalgiaCeiling` | 20 | Cap on compounded nostalgia. Bounds the top tail. | swept |
| `value.chaseSigma` | 0.65 | Width of the hidden per-printing lognormal `truth.chase` roll. This is what makes two commons in one set settle at different prices. | swept |
| `value.referencePopulation` | 60000 | Surviving copies at which scarcity equals 1. A unit, not a strength. | structural |
| `value.nostalgiaDesireReference` | 90 | Desire at which the nostalgia gate opens fully. Tight on purpose: open it wider and nostalgia lifts the whole population together. | swept |
| `value.nostalgiaStandingReference` | 80 | Price, in multiples of `baseCardPrice`, at which a printing counts as standing above the pack. | swept |
| `value.nostalgiaDecayPerYear` | 0.05 | Decay back toward 1 on a printing the market does not want. | swept |
| `value.shockChancePerTick` | 0.0015 | Chance of a visible speculation spike, weighted by `truth.chase`. | swept |
| `value.shockGain` | 1.1 | Heat added by one shock. | swept |

**Watch:** the p99 decile step was 2.7x when this block was swept and is 19x
now. `top1PctShare` is still in band. See `hype.heatFromHype`.

---

## `affection` — IP equity (6 paths)

Affection is what a studio owns. A collab rents reach and returns only
`collabs.exposureShare` of the usual exposure, so this block is the equity half
of the collab trade.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `affection.exposureToConvergence` | 40 | Exposure at which an IP converges on its full affection. | first-guess |
| `affection.convergenceRate` | 0.08 | How fast affection follows exposure. | first-guess |
| `affection.decayPerTickUnexposed` | 0.01 | Weekly decay on an IP the studio stopped printing. | first-guess |
| `affection.resurgenceFromVintage` | 0.4 | How much a vintage price run revives a character. | first-guess |
| `affection.resurgenceToModernDemand` | 0.3 | How much that resurgence feeds today's desire. | first-guess |
| `affection.resurgenceDecayPerTick` | 0.02 | Weekly decay on resurgence. | first-guess |

---

## `attention` — the audience and fatigue (13 paths)

This block is the load-bearing counterweight in the whole model. With rivals
cut, nothing else limits how much a studio can release: what stops it is only
what the audience has left to give.

The sharpest penalty in the model. `fatigueResponse` is
`1 - fatigueBite * fatigue^fatigueExponent`.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `attention.referenceRunUnits` | 5000 | Print run one region's demand is measured against. **The single most load-bearing number in the model.** At 8000 a reference run cleared 96% and flopped 2% of the time, so the blind bet had no variance. At 5000 it clears 87% and flops 11%. | swept |
| `attention.referenceAudience` | 600000 | Audience the run is measured at. With the line above, a reference run into the starting audience sells as it did before demand was decoupled from print size. | structural |
| `attention.perReleaseCost` | 0.22 | Attention one release spends. | first-guess |
| `attention.regenPerTick` | 0.02 | Weekly attention recovery. | first-guess |
| `attention.fatigueGain` | 0.18 | Fatigue one release adds. | swept |
| `attention.fatigueDecay` | 0.015 | Proportional weekly decay. Proportional, not flat: a flat decay makes fatigue bimodal and the response curve stops discriminating. | swept |
| `attention.fatigueBite` | 0.97 | Demand lost at saturated fatigue. This is what makes flooding fatal. The old 0.6 let a flooder keep 40% of demand whatever it did. | swept |
| `attention.fatigueExponent` | 2 | Protects the careful publisher only. Above 1 it makes low fatigue nearly free. It does **not** sharpen the mid-range penalty. | swept |
| `attention.fatigueWarnThreshold` | 0.45 | Mean fatigue that emits `fatigueWarning`. | first-guess |
| `attention.deathFatigueThreshold` | 0.75 | Fatigue at death that classifies the cause as `attention_collapse`. | fitted |
| `attention.deathAttentionThreshold` | 0.25 | Attention at death for the same classification. | fitted |
| `attention.goodwillSensitivity` | 0.6 | How hard goodwill responds to what the studio does. | first-guess |
| `attention.goodwillRegenPerTick` | 0.001 | Weekly goodwill recovery. Deliberately far slower than fatigue recovery: flood damage outlives it. | first-guess |

---

## `printing` — cost and quality (13 paths)

| Path | Value | What it moves | Status |
|---|---|---|---|
| `printing.unitCost.budget` | 80 | $0.80 per pack. COGS is `unitCost * packsPerUnit * 0.55`. | first-guess |
| `printing.unitCost.standard` | 140 | $1.40 per pack. | first-guess |
| `printing.unitCost.premium` | 240 | $2.40 per pack. | first-guess |
| `printing.unitCost.archival` | 400 | $4.00 per pack. | first-guess |
| `printing.qualityGradeShift.budget` | -0.15 | Shift on the latent 1-10 condition score. Drives `gemRate`. | fitted |
| `printing.qualityGradeShift.standard` | 0 | The reference tier. | structural |
| `printing.qualityGradeShift.premium` | 0.12 | | fitted |
| `printing.qualityGradeShift.archival` | 0.2 | | fitted |
| `printing.errorRate.budget` | 0.02 | Chance a printing carries an error. | first-guess |
| `printing.errorRate.standard` | 0.008 | | first-guess |
| `printing.errorRate.premium` | 0.002 | | first-guess |
| `printing.errorRate.archival` | 0.0005 | | first-guess |
| `printing.errorDiscoveryChance` | 0.01 | Weekly chance an error in circulation is spotted. | first-guess |

**Note:** `archival` is priced and graded but no bot uses it. Nothing measures it.

---

## `art` — the illustration pipeline (18 paths)

Swept over 15 seeds x 30 years against three art strategies (`scout`,
`safeHands`, and `conservative` as the control).

| Path | Value | What it moves | Status |
|---|---|---|---|
| `art.houseQuality` | 0.15 | Quality of in-house filler. The floor a late card falls back to. | swept |
| `art.statsWeight` | 0.75 | Weight on the artist's linework, colour and composition mean. | swept |
| `art.qualityNoise` | 0.35 | Width of the roll on top of stats. Two briefs to one artist differ. | swept |
| `art.budgetQualityGain` | 0.18 | Quality bought by paying over the rate. Logarithmic, so nobody buys a masterpiece at 100x. | swept |
| `art.slowestTurnaround` | 1.4 | Turnaround multiplier at speed 0. | first-guess |
| `art.fastestTurnaround` | 0.7 | Turnaround multiplier at speed 1. | first-guess |
| `art.maxLateWeeks` | 14 | Scale of the exponential lateness roll, capped at 3x. **It must be able to cross the 18 weeks between commit and release**, or the house-art path never fires. At 8, 2% of cards shipped as filler; at 14, about 9% do. | swept |
| `art.relationshipPerCommission` | 0.05 | Relationship earned per brief. | swept |
| `art.relationshipDecayPerTick` | 0.0015 | Weekly decay when the studio stops commissioning. | swept |
| `art.minRelationshipToAccept` | 0.25 | Below this the artist turns the brief down, unless retained. | swept |
| `art.brandStandingOffsetsRelationship` | 0.3 | How far brand standing substitutes for relationship. A known studio gets its calls returned. | swept |
| `art.retainerWeeklyMultiple` | 0.35 | Weekly bill as a multiple of the per-card rate. | swept |
| `art.exclusiveWeeklyMultiple` | 1.1 | The same, for exclusivity. | swept |
| `art.retainerFeeDiscount` | 0.2 | Discount on each brief under retainer. | swept |
| `art.exclusiveFeeDiscount` | 0.35 | The same, under exclusivity. | swept |
| `art.newcomerChancePerTick` | 0.012 | Roster drift in. Applied every 13 ticks as `rate * 13`. | first-guess |
| `art.retireChancePerTick` | 0.0009 | Roster drift out. | first-guess |
| `art.maxRosterSize` | 170 | Cap on available artists. Round 3 raised it from 24: a 280-card set cannot be staffed from 24 illustrators, and the measured real figure is about 170 per premier set. | first-guess |
| `art.rateGrowthPerReputation` | 2.5 | How far a rising reputation drags the rate up. This is what makes scouting pay and what makes it expensive later. | swept |
| `art.rateAdjustRate` | 0.02 | How fast the rate follows. | swept |

Measured art spend as a share of revenue: `conservative` 4.6%, `scout` 1.6%,
`safeHands` 26.9%. `safeHands` loses 4 seeds in 15 to that bill. Three times
higher and it is not viable at all.

---

## `finance` — the standing bill (8 paths)

These three overhead lines are what makes doing nothing a way to lose. Before
them, every outflow was discretionary and four of five death routes were
unreachable.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `finance.weeklyOverheadBase` | 100000 | $1,000/week = $52k/year. At $2,000 the base alone kills every small studio: `specialtyOnly` went 100% to 0% survival. | swept |
| `finance.weeklyOverheadPerChannel` | 25000 | $250/week per channel. Reach is what costs money to run. | swept |
| `finance.weeklyOverheadPerRegion` | 60000 | $600/week per region past the home market. An office abroad. | swept |
| `finance.storagePerUnitPerTick` | 1 | $0.01 per unsold unit per week. Nothing on a 20,000-unit tail (~$10k/year), ruinous on 1.2M units (~$624k/year against $442k revenue). **Overprint death is unreachable without it.** | swept |
| `finance.interestBase` | 0.14 | Annual interest before credit. Charged every 4 ticks as `(base - credit*creditToRate)/13`. | first-guess |
| `finance.creditToRate` | 0.08 | How far good credit cuts the rate. | first-guess |
| `finance.borrowCeilingMultiple` | 2.5 | Debt ceiling, as a multiple of a hardcoded $500,000 base times `(0.3 + credit)`. See [02-hardcoded.md](02-hardcoded.md). | first-guess |
| `finance.brandConvergenceRate` | 0.01 | How fast brand standing follows its affection-and-goodwill target. | fitted |

Sizing reference: `conservative` earns ~$442k/year and spends ~$148k printing.
A four-channel studio pays ~$156k/year of overhead.

---

## `sealed` — sealed product value (6 paths)

| Path | Value | What it moves | Status |
|---|---|---|---|
| `sealed.contentsWeight` | 0.6 | How much the singles inside set the sealed price. | first-guess |
| `sealed.baseRipRatePerTick` | 0.01 | Weekly share of sealed stock opened. | first-guess |
| `sealed.ripPriceElasticity` | 0.8 | How hard the singles-to-sealed ratio moves ripping. | first-guess |
| `sealed.sealedNostalgiaRatePerYear` | 0.04 | Sealed appreciation. | first-guess |
| `sealed.heatDecayPerTick` | 0.05 | | first-guess |
| `sealed.heatCeiling` | 4 | | first-guess |

---

## `drops` — the direct store and scalpers (18 paths)

The loop this block must produce: scalpers arrive when resale pays, buy the drop
out, and leave once they have closed the premium. It cycles about every 6 years.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `drops.unitsPerScalperReference` | 0.3 | Units per stride a scalper must flip to count as employed. **The knob that held the whole population on its floor.** At 1 no cadence could supply that, so crowding was zero, the trade never cleared its hurdle, and scalpers took 11% of a drop. At 0.3 the population settles near 900 and takes about a quarter of the units. Below ~0.1 it runs away to `maxScalpers` and stops cycling. | swept |
| `drops.cadenceWeeks` | 6 | Automatic drop cadence when a bot schedules none. | first-guess |
| `drops.collectorReach` | 0.06 | Share of collectors who reach a queue. | first-guess |
| `drops.scalperReach` | 0.5 | Share of scalpers who reach a queue. Scalpers camp; collectors do not. | first-guess |
| `drops.scalperSpeed` | 3 | Queue weight per scalper. Why they take a share larger than their numbers. | first-guess |
| `drops.breakEvenPremium` | 0.15 | Resale premium at which flipping starts to pay. Sets how sharply the population reacts. | **unswept, named in HANDOFF** |
| `drops.baseResaleRate` | 0.04 | Weekly share of held stock a scalper resells. | first-guess |
| `drops.holdLimitWeeks` | 26 | How long a scalper holds before dumping. | first-guess |
| `drops.resaleUrgency` | 0.5 | How hard the premium drives resale speed. | first-guess |
| `drops.populationGrowth` | 0.06 | Weekly population response to profitability. Sets reaction sharpness, not the level. | **unswept, named in HANDOFF** |
| `drops.minScalpers` | 50 | Floor. | structural |
| `drops.maxScalpers` | 40000 | Cap. Reached only if `unitsPerScalperReference` is too low. | structural |
| `drops.profitabilitySmoothing` | 0.1 | Smoothing on the profitability signal the population follows. | first-guess |
| `drops.goodwillPerCollectorDrop` | 0.01 | Goodwill earned when a collector gets the product. | first-guess |
| `drops.goodwillPerScalperDrop` | 0.014 | Goodwill lost per collector a scalper shuts out. | first-guess |
| `drops.goodwillPerShortage` | 0.006 | Goodwill lost to a drop that is far too small. Stops "print nothing" being a free win. | first-guess |
| `drops.heatPerOversubscription` | 0.35 | Heat from a drop that sells out hard. | first-guess |
| `drops.dumpHeatDrag` | 1.5 | Heat lost when scalpers dump held stock. | first-guess |

---

## `channels` — retail relationships (17 paths)

Per-kind traits are **not** here. They are constants in `src/sim/channels.ts` —
see [02-hardcoded.md](02-hardcoded.md).

| Path | Value | What it moves | Status |
|---|---|---|---|
| `channels.unlockCost.lgs` | 0 | The LGS is where you start. | structural |
| `channels.unlockCost.online` | 8000000 | $80,000. | first-guess |
| `channels.unlockCost.distributor` | 15000000 | $150,000. Relationship-building money, not a licence fee. | first-guess |
| `channels.unlockCost.bigbox` | 40000000 | $400,000. | first-guess |
| `channels.unlockCost.direct` | 75000000 | $750,000. The one you actually build. | first-guess |
| `channels.relationshipGainPerSellThrough` | 0.02 | Relationship earned by moving product. | first-guess |
| `channels.relationshipLossPerUnsold` | 0.03 | Relationship lost to stale allocation. Scaled by each kind's `strainSensitivity`. | first-guess |
| `channels.unsoldGraceWeeks` | 26 | Weeks before unsold allocation starts to sour. | first-guess |
| `channels.evaluationWindowWeeks` | 104 | Window the channel judges the studio over. | first-guess |
| `channels.sellThroughTarget` | 0.6 | Sell-through the channel expects. | first-guess |
| `channels.strainThreshold` | 0.3 | Relationship below which the channel is straining. | first-guess |
| `channels.lossThreshold` | 0.12 | Relationship at which the channel is lost. Drives `channel_collapse` death. | first-guess |
| `channels.reopenRelationship` | 0.45 | Relationship a re-opened channel starts at. | first-guess |
| `channels.idleDriftPerTick` | 0.004 | Relationship decay on a channel that gets nothing. | first-guess |
| `channels.idleGraceWeeks` | 78 | Weeks before idle drift starts. | first-guess |
| `channels.streetPriceLerp` | 0.15 | How fast street price follows its target. | first-guess |
| `channels.stalenessPerWeek` | 0.012 | How fast unsold stock gets discounted. | first-guess |

---

## `hype` — the reveal window (14 paths)

Swept over 20 seeds x 30 years. Every lever diminishes, and none of them can
rescue a set the audience does not want: hype multiplies demand, it does not
create it.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `hype.signalNoiseSigma` | 2.0 | Error on the reveal-window signal, shrinking as `1/sqrt(previews)`. Wide on purpose. At 0.55 a publisher who spent nothing already read r = 0.93 and the window was a solved problem. At 2.0 a default 3-preview window reads r = 0.55 and a 16-preview campaign r = 0.86. | swept |
| `hype.decayPerTickAfterRelease` | 0.02 | Hype decay after launch. At 0.06 hype was gone in two months while the run it paid for sells over years, so every lever lost money at every price. At 0.02 hype lasts about a year, which is the horizon a print run sells over. | swept |
| `hype.marketingHypeGain` | 1.2 | Hype per unit of marketing spend. At 0.35 marketing was strictly dominated by prereleases. At 1.2 it is competitive and still the dearer route, which is the right relationship. | swept |
| `hype.marketingReference` | 10000000 | $100,000. Spend at which the marketing curve equals 1. | structural |
| `hype.prereleaseCostPerScale` | 2500000 | $25,000 per point of scale. | swept |
| `hype.prereleaseHypeGain` | 0.12 | Hype per point of prerelease scale. | swept |
| `hype.prereleaseGoodwillGain` | 0.02 | Goodwill a prerelease earns. | swept |
| `hype.prereleaseRelationshipGain` | 0.04 | LGS relationship a prerelease earns. | swept |
| `hype.defaultCadenceWeeks` | 2 | Preview cadence when a bot schedules none. | first-guess |
| `hype.revealHypePerCard` | 0.05 | Hype per previewed card. | swept |
| `hype.revealHalfLife` | 0.8 | Decay on hype inside the reveal window. | swept |
| `hype.revealAttentionCost` | 0.004 | Attention a preview spends. | swept |
| `hype.ceiling` | 3 | Cap on hype level. Demand carries `(1 + hype)`. | swept |
| `hype.heatFromHype` | 0.8 | Opening heat is `1.6 + hype * heatFromHype`. **The most likely cause of the steepening top tail.** | **unswept, named in HANDOFF** |

---

## `grading` — slabs and pop reports (22 paths)

Grading must be worth doing only on cards already worth something, and a gem
must stay rare. At the shipped values, 6.0% of printings and 18.6% of copies get
graded.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `grading.feeWorthMultiple` | 5 | How far a raw price must clear the fee before anybody submits. Decides **which** printings qualify: 19.8% of them at 2, 2.8% at 25. | swept |
| `grading.submitRatePerTick` | 0.004 | Weekly submission rate on a qualifying printing. Decides **how many** copies: 13% to 31% across the swept range. | swept |
| `grading.appetiteCeiling` | 4 | Cap on submission appetite. | first-guess |
| `grading.maxGradedShare` | 0.35 | Cap on the share of a printing that can be slabbed. | first-guess |
| `grading.conditionMean` | 9 | Latent condition mean on the 1-10 scale. A standard copy averages 9, so a 10 is a tail event. | fitted |
| `grading.conditionSigma` | 0.7 | Width of that distribution. With the grade cuts, this is what sets `gemRate`. | fitted |
| `grading.gradeShiftWeight` | 3 | How hard print quality moves the condition mean. | fitted |
| `grading.strictnessWeight` | 0.6 | How hard grader strictness moves it. | fitted |
| `grading.agePenaltyPerYear` | 0.02 | Condition lost per year in circulation. | first-guess |
| `grading.agePenaltyCap` | 0.8 | Cap on that penalty. | first-guess |
| `grading.tierMultiplier.10` | 4.5 | Slab price over raw. Drives `gem10Premium`. | **fitted by eye** |
| `grading.tierMultiplier.9.5` | 2.4 | | **fitted by eye** |
| `grading.tierMultiplier.9` | 1.6 | | **fitted by eye** |
| `grading.tierMultiplier.8` | 1.1 | | **fitted by eye** |
| `grading.tierMultiplier.7` | 0.85 | | **fitted by eye** |
| `grading.tierMultiplier.below7` | 0.55 | Slabbing a bad copy loses money. | **fitted by eye** |
| `grading.reputationWeight` | 0.35 | Premium a strict grader's slab carries. | first-guess |
| `grading.popScarcityReference` | 8 | Pop count at which the scarcity term equals 1. A pop report is counted in tens. At 250 every tier pinned to the ceiling and the term said nothing. | **fitted by eye** |
| `grading.popScarcityExponent` | 0.35 | Steepness of the pop-report term. | **fitted by eye** |
| `grading.popScarcityCeiling` | 2.5 | Cap. | **fitted by eye** |
| `grading.popScarcityFloor` | 0.5 | Floor. | **fitted by eye** |
| `grading.priceLerp` | 0.35 | How fast a slab price follows its target. | first-guess |
| `grading.sideGraderBrandGate` | 0.55 | Brand standing that brings the third grader in. At 0.4 it arrives in year 3, before the studio is anybody; at 0.65 not until year 26. At 0.55 it lands between years 4 and 13. | swept |

---

## `region` — second markets (5 paths)

A region must be able to be the wrong region. Otherwise it is a pure size
multiplier and the answer is "yes, all of them, as soon as you can afford it".

| Path | Value | What it moves | Status |
|---|---|---|---|
| `region.mismatchPenalty` | 0.25 | Demand a badly-matched set forfeits. **At 0 taste stops mattering.** | first-guess |
| `region.readingNoiseSigma` | 0.8 | Error on a region reading at `knowledge` 0. Wide for the same reason as `hype.signalNoiseSigma`. | first-guess |
| `region.knowledgeGainPerRelease` | 0.02 | Knowledge earned by shipping into the region. | first-guess |
| `region.knowledgeGainPerResearch` | 0.05 | Knowledge bought with market research. Applied every 13 ticks at 0.25 weight. | first-guess |
| `region.entryLeadWeeks` | 26 | Weeks between a region unlock and the first release there. | first-guess |

Knowledge is capped at 0.95. A reading is never quite the truth.

---

## `actors` — the four populations (22 paths)

Each population must be able to move **and to come back**. One that only grows
is a price multiplier with extra steps.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `actors.collectorShareOfAudience` | 0.02 | Collectors as a share of the audience. | first-guess |
| `actors.collectorConvergence` | 0.08 | How fast the population follows. | first-guess |
| `actors.minCollectors` | 500 | Floor. | structural |
| `actors.collectorDensityReference` | 0.09 | Collector density at which holding hits its ceiling. At 0.03 a healthy run sat exactly on the ceiling in every seed, which is a constant wearing a population's clothes. | fitted |
| `actors.collectorHoldFloor` | 0.2 | Share of opened copies off the market at the floor. Roughly what any collectible market looks like. Feeds `scarcity` in `tickPrices`. | fitted |
| `actors.collectorHoldCeiling` | 0.5 | The same, at full density. | fitted |
| `actors.resellerReference` | 300 | Reference reseller population. | first-guess |
| `actors.resellerConvergence` | 0.12 | | first-guess |
| `actors.minResellers` | 20 | Floor. | structural |
| `actors.maxResellers` | 20000 | Cap. | structural |
| `actors.ripBreakEven` | 0.5 | Singles-to-sealed ratio at which ripping stops paying. The measured weighted ratio runs 0.7-1.0, so a break-even of 1 pins the population on its floor for every strategy except a flooder. Below 1 is also honest: a streamer earns on the stream and the retail spread, not only the pull. | fitted |
| `actors.ripPerReseller` | 0.5 | Units ripped per reseller per stride. | first-guess |
| `actors.speculatorReference` | 800 | Reference speculator population. | first-guess |
| `actors.speculatorConvergence` | 0.1 | | first-guess |
| `actors.minSpeculators` | 50 | Floor. | structural |
| `actors.maxSpeculators` | 30000 | Cap. | structural |
| `actors.speculatorHeatPerCapita` | 0.3 | Heat above the pack per speculator at which the population holds still. At 0.02 it settled near 25,000 against a 30,000 cap — the runaway this per-capita form exists to prevent. This decides how many speculators a market of a given size supports. | fitted |
| `actors.speculatorMomentumGain` | 0.35 | How hard speculators chase what is already moving. | first-guess |
| `actors.speculatorHeatGain` | 0.05 | Heat they add. Amplify-and-crash lives here. | first-guess |
| `actors.speculatorSensitivity` | 1.5 | Population response to the signal. | first-guess |
| `actors.speculatorNoise` | 0.004 | | first-guess |

---

## `collabs` — licensing (8 paths)

A collab buys reach you do not have and cannot buy affection you have not
earned. A studio that lives on collabs owns nothing at the end.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `collabs.offerChancePerQuarter` | 0.35 | Offer arrival rate at full brand standing. Rolled every 13 ticks. | first-guess |
| `collabs.offerWindowWeeks` | 26 | How long an offer stands. | first-guess |
| `collabs.maxOpenOffers` | 3 | | first-guess |
| `collabs.feeMin` | 12000000 | $120,000. | first-guess |
| `collabs.feeMax` | 90000000 | $900,000. | first-guess |
| `collabs.reachToDemand` | 1.2 | Demand multiplier per point of weighted reach. | first-guess |
| `collabs.goodwillPerReach` | 0.05 | Goodwill a collab earns in the segments it reaches. | first-guess |
| `collabs.exposureShare` | 0.3 | Share of usual IP exposure a collab set returns to your own IPs. The licensor's audience came for the licensor; this is the rent. | first-guess |

The arithmetic: a collab only pays back if the run is sized up to meet the extra
demand, and sizing up is exactly how it becomes an overprint. `licensor` uses
`collabRunMultiple: 1.5`.

---

## `creators` — named coverage (9 paths)

| Path | Value | What it moves | Status |
|---|---|---|---|
| `creators.rosterSize` | 24 | Creators in the world. Read by `world.ts` at bootstrap. Round 3 raised it from 8. | first-guess |
| `creators.coverChancePerStride` | 0.25 | Chance a creator covers something. | first-guess |
| `creators.freshnessWeeks` | 60 | How long a printing is new enough to cover. | first-guess |
| `creators.affinityTries` | 4 | Redraws allowed to land on a creator's affinity IP. | first-guess |
| `creators.audienceReference` | 250000 | Creator audience at which coverage effect equals 1. | structural |
| `creators.heatPerCoverage` | 0.35 | Heat one coverage adds. | first-guess |
| `creators.maxCoverageHeat` | 2.5 | Cap. | first-guess |
| `creators.freshPrintingsReference` | 140 | Fresh printings at which a creator is fully engaged. | first-guess |
| `creators.relationshipConvergence` | 0.05 | How fast a creator relationship follows coverage. Decays when you stop. | first-guess |

**Note:** coverage lands on the player's own cards 100% of the time, because the
player is the only publisher. That is now correct behaviour rather than an
artefact, and `creatorOwnShare` is a constant — drop it or repurpose it to mean
the share of coverage landing on *fresh* printings, which would measure
something.

---

## `chains` — progression lines (3 paths)

An incomplete set of anything is worth more than the same cards unrelated.

| Path | Value | What it moves | Status |
|---|---|---|---|
| `chains.desirePerLink` | 6 | Desire added per printed chain member. Enters `castDesire`. | first-guess |
| `chains.maxCountedLinks` | 5 | Cap on counted links. | first-guess |
| `chains.spansSetsBonus` | 1.6 | Bonus for a chain that runs across sets. The cross-set hedge that can carry a weak set. | first-guess |

---

## `history` and `startYear` (3 paths)

| Path | Value | What it moves | Status |
|---|---|---|---|
| `startYear` | 2026 | Cosmetic. | structural |
| `history.weeklyRetentionTicks` | 520 | Ticks kept at weekly resolution before compaction. | structural |
| `history.writeThreshold` | 0.03 | Relative change needed to write a series point. **Performance and fidelity, not balance.** Raising it loses detail in every chart. | structural |

---

## Summary of what the balance run owns

| Block | Paths | Swept | Fitted | First-guess |
|---|---|---|---|---|
| `value` | 20 | 16 | 0 | 1 (+3 structural) |
| `attention` | 19 | 6 | 2 | 9 (+2 structural) |
| `art` | 20 | 16 | 0 | 4 |
| `hype` | 14 | 12 | 0 | 1 (+1 structural) |
| `finance` | 8 | 4 | 1 | 3 |
| `drops` | 18 | 1 | 0 | 15 (+2 structural) |
| `grading` | 23 | 3 | 15 | 4 (+1 structural) |
| `printing` | 13 | 0 | 4 | 8 (+1 structural) |
| `channels` | 17 | 0 | 0 | 16 (+1 structural) |
| `region` | 5 | 0 | 0 | 5 |
| `actors` | 22 | 0 | 5 | 11 (+6 structural) |
| `affection` | 6 | 0 | 0 | 6 |
| `collabs` | 8 | 0 | 0 | 8 |
| `creators` | 9 | 0 | 0 | 8 (+1 structural) |
| `chains` | 3 | 0 | 0 | 3 |
| `sealed` | 6 | 0 | 0 | 6 |
| `history` + `startYear` | 3 | 0 | 0 | 0 (+3 structural) |

The four blocks with no measurement at all are `channels`, `region`, `collabs`
and `creators`, plus `sealed`, `affection` and `chains`. Those are the balance
run's largest open surface.
