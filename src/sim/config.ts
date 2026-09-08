/**
 * Every tunable constant in one place, with dotted-path overrides for
 * balance runs. These starting values are a reasonable first guess, not a
 * tuned economy — see HANDOFF.md "Known problems" for what's still wrong.
 */
import type { SimConfig, Cents } from './types.ts';

const C = (n: number) => Math.round(n) as Cents;

export const defaultConfig: SimConfig = {
  startYear: 2026,

  // The value block was tuned as one unit against the targets in HANDOFF.md,
  // by sweeping over 30 seeds and 25 years. The knobs are not independent:
  // `scarcityExponent` and `referencePopulation` set the day-one ladder, the
  // nostalgia triple decides who climbs it afterwards, and `chaseSigma` sets
  // how far the luckiest card gets. Move one and re-measure all five targets.
  value: {
    // The level knob, and it carries no shape at all. Swept 30/50/80/110/150
    // in Round 4: the age-2 set median is exactly linear in it at 0.052 cents
    // per cent, and `top1`, `top10`, `gini`, `chaseOverMedian` and the tail
    // index do not move to three decimals, because the nostalgia gate
    // normalises against `baseCardPrice * nostalgiaStandingReference`. So set
    // the shape with `chaseSigma` first and land the level with this last.
    // 6 puts the age-2 median at $0.28, inside the measured $0.24-$0.34.
    baseCardPrice: C(6),
    cameoWeight: 0.15,
    // Deliberately shallow. A steep day-one ladder puts a $100 card in year 2
    // and leaves nothing for the next twenty years to discover.
    // Round 4 swept 0.30/0.45/0.60 and the knob is NOT inert: it takes the Gini
    // from 0.695 to 0.820 and the top-10% share from 0.634 to 0.768. It is a
    // second shape knob nearly as strong as `chaseSigma`. It stays at 0.45 on
    // the measurement, not on non-responsiveness: the measured per-rarity
    // medians put a common and an uncommon at almost the same price, and
    // `printQuantity` is already rarity-scaled, so a steeper exponent would
    // separate the body by rarity in a way the real price vectors reject.
    scarcityExponent: 0.45,
    artMultiplierWeight: 0.6,
    nostalgiaRatePerYear: 0.16,
    heatDecayPerTick: 0.08,
    noiseSigma: 0.12,
    // Bulk commons are worth cents. A floor at a dollar piles half the
    // population onto one price and calls it a distribution.
    // Round 4 dropped this 20 -> 5, and the plan was wrong to leave it alone.
    // A 20-cent floor never binds against the old $8.47 median, but against
    // the fitted $0.26 median it pinned 40% of a set within a cent of it: the
    // decile ladder read 1.00x from p10 to p20 and again from p30 to p40.
    // The measured minima of a real set run $0.02-$0.07 and its most common
    // single price holds only 3-6% of the set, so the spike was ours, not the
    // market's. At 5 the Gini, the top-1% and the top-10% shares all move
    // closer to the measured centre and nothing else moves at all.
    // No gate caught this. `under25c` counts cards below $0.25 and cannot tell
    // a spread from a stack, which is why rule 2 asks for the ladder.
    priceFloorCents: C(5),
    priceCeilingMultiple: 5000,
    // Speculators can push heat below 1, and a crash has to be able to
    // overshoot for the amplify-and-crash shape to mean anything. It cannot go
    // to zero: heat multiplies the price, so a floor of 0 is a floor of $0.
    heatFloor: 0.4,
    heatCeiling: 6,
    nostalgiaCeiling: 20,
    // A forgotten card has to be able to fall, not merely stop rising. With a
    // floor of 1 nothing in the price stack ever pushed an old card under its
    // release price, so a set's bulk share fell with age where a real set's
    // rises. The gate that decides who falls is already there: it reads desire
    // and price standing, so the cheap half decays and the top keeps climbing.
    nostalgiaFloor: 0.2,
    // The shape knob. `rollChase` is `exp(gauss(0, chaseSigma))`, whose median
    // is 1 at any sigma, so widening it pushes the bottom of a set down and the
    // top up without moving the level. Swept 0.65/0.9/1.2/1.5/1.9 in Round 4
    // against a researched body log-SD of 1.2-1.9. At 0.65 the Gini is 0.55 and
    // a set is born flat; at 1.9 the tail index falls under 1.9 and the first
    // $100 card arrives in year 1.2. 1.5 fits the measured distribution best.
    // This is also the answer to the Round 4b question, stated carefully: a
    // single lognormal reaches every target SUMMARY STATISTIC at this sigma,
    // so the three-part mixture was not needed. It is not a distributional
    // result. The research rejected lognormality by KS test in 13 of 13 sets
    // and no gate here tests a distribution, so a later round that wants the
    // measured shape rather than its moments may still have to build it.
    chaseSigma: 1.5,
    referencePopulation: 60_000,
    // The gate is tight on purpose. Nostalgia is the engine that separates the
    // top 1% from the rest over twenty years; open it wider and it stops
    // separating anything, because it lifts the whole population together.
    nostalgiaDesireReference: 90,
    nostalgiaStandingReference: 80,
    // What turns a set into bulk. Swept 0.05/0.12/0.20/0.30/0.45 in Round 4
    // against `shape.ageCurveDirection`, which asks that the bulk share RISE
    // from age 1 to age 8 the way a real set's does. At 0.05 an ungated
    // printing only falls to 0.72x over seven years, which the climb in
    // scarcity outruns, and the curve ran backwards for the whole project up
    // to this point. 0.20 is the first value that turns it: the direction
    // reads +0.06 and the age-25 bulk share reaches 0.80, against a measured
    // 69-82%. Past 0.30 the median drops under the measured floor.
    nostalgiaDecayPerYear: 0.20,
    shockChancePerTick: 0.0015,
    shockGain: 1.1,
    // Cast desire at which the demand term equals 1. A second reference point
    // alongside `referencePopulation`, on the desire axis rather than the
    // supply one. It was a bare `/ 40` inside the price stack.
    desireReference: 40,
    priceLerp: 0.38,
    nostalgiaBrandFloor: 0.4,
    // A discovered error adds heat inversely to how common it is: a one-in-a-
    // million misprint is a story, a one-in-fifty is a defect.
    errorHeatGain: 0.00000004,
    errorIncidenceFloor: 0.0002,
    resurgenceCheckChance: 0.02,
    // [round 11] Both of these were dead `--set` paths: `engine.ts` minted every
    // printing with the literals 1.6 and 0.5 and never read the config. The
    // single `mintPrinting` now reads them, at exactly the values the literals
    // had, so this un-deads two paths and changes nothing.
    openingHeat: 1.6,
    openingLiquidity: 0.5,
    // The three weights sum to 1, so liquidity before the supply term is a
    // unit. First-guess numbers; nothing reads liquidity at `buylistWeight` 0,
    // so Round 12 fits them against the spread rather than on their own.
    liquidityFromPrice: 0.4,
    liquidityFromHeat: 0.25,
    liquidityFromRecency: 0.35,
    liquidityPriceReference: 2000,
    liquidityHeatReference: 0.5,
    liquidityStaleHalfLifeWeeks: 26,
    liquidityLerp: 0.2,
    // The measured average value drop from a reprint is about 27%, and the
    // older printing typically falls 20-50% on announcement
    // (05-real-world.md §2). This was 0.85, a 15% haircut, fitted by eye.
    reprintNostalgiaPenalty: 0.73,
  },

  affection: {
    exposureToConvergence: 40,
    convergenceRate: 0.08,
    decayPerTickUnexposed: 0.01,
    resurgenceFromVintage: 0.4,
    resurgenceToModernDemand: 0.3,
    resurgenceDecayPerTick: 0.02,
    unitsPerExposurePoint: 20_000,
    exposureDecayPerTick: 0.015,
    // The measured vintage turn is near 20 years, not 5: a real set's bulk
    // share keeps rising until about age 20 and only then falls back as
    // scarcity and nostalgia lift a widening group (05-real-world.md §2).
    resurgenceMinAgeYears: 18,
    resurgenceMinGrowth: 3,
    resurgenceGainScale: 0.02,
    // An IP's ceiling on affection. The spread between a dud character and a
    // hit, and the reason two sets built the same way perform differently.
    relatabilityMin: 8,
    relatabilityMax: 96,
    affinityMin: -0.8,
    affinityMax: 0.9,
    // Exactly 0 on purpose: `ageing` evaluates to exactly 1 and no number
    // moves. Round 12 fits it. This is the only thing that makes an IP's roll
    // matter past `relatability`.
    longevityWeight: 0,
    longevityMin: 0.85,
    longevityMax: 1.18,
  },

  attention: {
    /**
     * The print run one region's demand is measured against, and the audience
     * it is measured at. Together they replace the old `p.unitsPrinted` term:
     * a reference-sized run into the starting audience sells exactly as it did
     * before, and a larger one no longer brings its own buyers with it.
     */
    // Swept over 20 seeds x 25 years on `conservative`. At 8000 a
    // reference-sized run cleared 96% of its stock and flopped 2% of the time,
    // so the blind bet had no variance and no demand-side lever could buy
    // anything — there was never unmet demand to reach. At 5000 the same run
    // sells 87% and flops 11% of the time, which makes how much to print a
    // decision with a wrong answer.
    referenceRunUnits: 5000,
    /**
     * What attention death looks like at the moment of failure: the audience
     * saturated with fatigue and out of attention to give. CONCEPT.md §7 lists
     * it as a death route and nothing ever classified it, so it could not be
     * reported however often it happened.
     */
    deathFatigueThreshold: 0.75,
    deathAttentionThreshold: 0.25,
    referenceAudience: 600_000,
    perReleaseCost: 0.22,
    regenPerTick: 0.02,
    fatigueGain: 0.18,
    // Proportional decay. Chosen with `fatigueBite`/`fatigueExponent` by sweeping
    // release cadence from 6 to 78 weeks: this triple puts the profit optimum at
    // ~18 weeks, kills a 6-10 week cadence outright, and taxes a once-a-year
    // publisher under 5% of demand.
    //
    // [round 10] MEASURED AND LEFT ALONE. The optimum has drifted: re-measured
    // on `conservative` over 20 seeds x 30 years with the new `--cadence` flag,
    // it now sits at 26 weeks, an 18-week cadence kills 55% of runs and a
    // 14-week one — roughly what Wizards actually ships — kills 100%.
    //
    // 0.03 puts the optimum back on 18 weeks and leaves 14 weeks survivable
    // 45% of the time, which is the shape this comment claims. It is NOT
    // shipped, because it is not affordable here: faster recovery is more
    // demand everywhere, and it breaks four difficulty gates in one move —
    // `diff.sellThrough` 0.949 -> 0.956, `diff.flopRate` 0.014 -> 0.003,
    // `diff.allInSurvival` 0.300 -> 0, `diff.attentionBurnerDies` 1 -> 0.750.
    // The obvious compensating knob does not pay for it either: pulling
    // `referenceRunUnits` 5000 -> 3500 restores the sell-through and the flop
    // rate and costs `conservative` 15 points of survival, taking the count of
    // always-surviving bots below its own band floor.
    //
    // This is a demand-side re-fit wearing a difficulty knob's clothes, and the
    // plan orders the demand rounds BEFORE this one for that reason. See the
    // Round 10 handoff section: it needs a round, not a knob.
    fatigueDecay: 0.015,
    fatigueBite: 0.97,
    fatigueExponent: 2,
    fatigueWarnThreshold: 0.45,
    goodwillSensitivity: 0.6,
    goodwillRegenPerTick: 0.001,
    goodwillBaseline: 0.5,
    // The master demand coefficient. Every unit of demand in the model passes
    // through this number, which makes it the largest single lever there is.
    // It was a bare `* 0.06` in the middle of the demand stack.
    demandCoefficient: 0.06,
    // e^(-1.4 * years). A five-year-old set is three zeroes down, which is what
    // stops a back catalogue selling forever.
    demandDecayPerYear: 1.4,
    goodwillDemandFloor: 0.2,
    brandDemandFloor: 0.3,
    chaseDemandFloor: 0.5,
    demandCutoff: 0.5,
    /**
     * How hard box demand reads what the box is WORTH against what it costs.
     *
     * **This is the feedback the model was missing, and it is the root cause of
     * all three of C11's findings.** Demand read chase, audience, attention,
     * goodwill, brand, hype and region, plus a price response comparing street
     * price to MSRP — which asks "is this shop gouging?", never "is this box
     * worth opening?". So what a box actually held never entered the decision
     * to buy one.
     *
     * Measured before this existed: cutting every raw card price by 30% moved
     * `budgetSurvivor`'s net worth from $84.1M to $84.1M. The entire value
     * engine — the most carefully tuned part of the model — barely reached the
     * publisher's business at all.
     *
     * Three consequences follow from the one term:
     *
     * - **Print quality matters.** Quality moves the raw price, the raw price
     *   moves expected contents, and contents now move demand. Before this,
     *   budget stock EARNED MORE than standard.
     * - **Price matters.** A 2.6x sticker with the same cards in the box is no
     *   longer nearly free; it halves what the box is worth to open.
     * - **Pull rates will matter**, which is what makes a player-set rarity
     *   ladder a real decision rather than a cosmetic one.
     *
     * **Built, measured, and left OFF — the same verdict as the slow lane.**
     * Switched on it destabilises the roster rather than differentiating it:
     * the observed contents-to-price ratio runs p10 0.77, median 1.48, p90 5.53
     * for `conservative`, so the term swings demand several-fold, and every bot
     * sizes its print run off measured demand (`unitsPolicy: 'market'`). The
     * result is over-printing into the storage cliff — `conservative` falls from
     * 100% survival to 75% at weight 0.3 and 58% at 0.6, with unsold stock up
     * half again.
     *
     * That is a joint fit with `unitsPolicy` and `finance.storageSurcharge*`,
     * not a single knob, and HANDOFF's rule applies: a block like this is tuned
     * as one unit. The contained fix for the finding it was meant to solve is
     * `printing.qualityDemandMultiplier` below.
     *
     * 0 is exactly neutral (`pow(x, 0)` is 1), so it lands byte-identical.
     */
    boxValueWeight: 0,
    /**
     * The contents-to-price ratio at which the term is 1.
     *
     * Matched to `actors.ripBreakEven`, which is the ratio at which ripping
     * stops paying. The two numbers are the same fact seen by two different
     * populations — resellers and consumers — so they should agree.
     */
    boxValueReference: 0.5,
    /** A box worth nothing still sells a little; a bargain does not sell forever. */
    boxValueFloor: 0.35,
    boxValueCeiling: 2.5,
  },

  printing: {
    // What a print run actually costs, against the list unit cost.
    cogsCoefficient: 0.55,
    errorIncidenceMin: 0.0001,
    errorIncidenceMax: 0.004,
    // Shifts the latent condition mean by `grading.gradeShiftWeight` times this,
    // so the span here is the whole reason print quality is worth choosing.
    // Round 6 widened it: at -0.15..+0.2 a premium printing gemmed 1.36 times
    // as often as a standard one, which is not a decision. Fitted so a standard
    // printing gems about half the time, a premium one 87%, and a budget one
    // about 2%. Past +0.5 the premium rate pins at 1.000 and stops saying
    // anything.
    //
    // `budget` is arithmetic, not measurement: `flooder` is the only bot that
    // prints it and it dies at a median year 0.75, so no budget printing ever
    // survives to be graded in any seed. `archival` is worse - no bot prints it
    // at all. Nothing in the roster can check either number.
    qualityGradeShift: { budget: -0.56, standard: 0, premium: 0.3, archival: 0.4 },
    errorRate: { budget: 0.02, standard: 0.008, premium: 0.002, archival: 0.0005 },
    unitCost: { budget: C(80), standard: C(140), premium: C(240), archival: C(400) },
    errorDiscoveryChance: 0.01,
    /**
     * What print quality does to the RAW price of a typical copy.
     *
     * This is the quality-to-demand link, and before it existed print quality
     * reached exactly two things: the misprint lottery, and the latent
     * condition used for GRADING. Only 5.5% of printings are ever graded, so
     * quality bought a better outcome on a twentieth of the catalogue and cost
     * up to 2.86x on the whole print bill. Measured over 16 seeds x 30 years,
     * `budgetSurvivor` finished on 2,727k against `conservative`'s 2,610k —
     * the cheap tier earned MORE, which made the whole axis a false choice.
     *
     * The physical claim: a raw price is the price of a TYPICAL, ungraded copy,
     * and what a typical copy looks like depends on what it was printed on.
     * Budget stock curls, scuffs and wears at the edges, so the copies in
     * circulation are worse and the market pays less for them.
     *
     * **A graded price divides this back out**, because a grade is a statement
     * about condition and a 10 is a 10 whatever it was printed on. Without that,
     * a budget PSA 10 would sell below a standard PSA 10, which is wrong.
     */
    qualityPriceMultiplier: { budget: 0.85, standard: 1, premium: 1.08, archival: 1.13 },
    /**
     * What print quality does to the WHOLESALE price the studio realises.
     *
     * This is the quality-to-demand link, and it sits here rather than on
     * demand because of where the arithmetic actually lands. The publisher's
     * take is `sold x msrp x marginShare` — quality-blind, so a budget box
     * wholesaled for exactly what an archival one did.
     *
     * A demand penalty cannot fix that, and the measurement says so plainly:
     * swept from 0.93 to 0.82, `budgetSurvivor`'s liquid net worth moved 0.75M
     * to 0.73M against `conservative`'s 0.62M. Every bot sizes its run off
     * measured demand, so cutting demand just makes it print fewer boxes at the
     * same fat unit margin. **A per-unit penalty is the one a strategy cannot
     * dodge by printing less.**
     *
     * Fitted from the trade it has to price. At MSRP 14000 and the LGS's 0.55
     * share the studio takes $77 a box. Standard COGS is $18.48 and budget
     * $10.56, so budget saves $7.92 — which is 10.3% of $77. A budget
     * multiplier of 0.90 therefore cancels the saving almost exactly, which is
     * what makes the tier a genuine operating point rather than free money.
     *
     * Premium and archival cannot repay their cost on this line alone: premium
     * costs $13.20 more and 1.06 returns $4.62. The rest of their return is the
     * grading ladder and the channel relationship — measured, budget loses 2.13
     * channels over 30 years against archival's 0.31 — and this only stops them
     * being strictly worse.
     */
    qualityRevenueMultiplier: { budget: 0.90, standard: 1, premium: 1.06, archival: 1.10 },
  },

  // First-guess numbers, wired for behaviour and NOT swept — the balance pass
  // owns them. The shape that matters: art costs money and takes weeks, so it
  // has to be started before the print run is committed; a card whose art does
  // not arrive in time still ships, at `houseQuality`; and who will take a
  // brief at all depends on relationship, brand standing and exclusivity.
  art: {
    /** Quality of in-house filler. The floor a card falls back to. */
    houseQuality: 0.15,
    /** Weight on the artist's linework/colour/composition mean. */
    statsWeight: 0.75,
    /** Width of the roll on top of stats. Two briefs to one artist differ. */
    qualityNoise: 0.35,
    /**
     * Paying over the artist's rate buys a better result, with diminishing
     * returns — logarithmic in the multiple of rate, so a caller cannot buy a
     * masterpiece by paying a hundred times.
     */
    budgetQualityGain: 0.18,
    /** Turnaround multiplier at speed 0 and at speed 1. */
    slowestTurnaround: 1.4,
    fastestTurnaround: 0.7,
    /**
     * An unreliable artist runs late. Weeks added, scaled by (1 - reliability).
     * The roll is exponential and capped at 3x this scale, so it has to be able
     * to cross the 18 weeks between commit and release — otherwise the
     * house-art path never fires and the schedule is decorative. How often it
     * should cross is unswept.
     */
    // Swept over 15 seeds x 30 years. It must be crossable — a deadline that
    // cannot be missed is not a deadline — and at 8 weeks only 2% of cards
    // shipped as house filler, which is a freak event rather than a schedule.
    // At 14 about 9% do, so a 70-card set typically ships five or six cards
    // with in-house art: visible, expensive, and survivable.
    maxLateWeeks: 14,
    /** Relationship: earned by commissioning, decays when you stop. */
    relationshipPerCommission: 0.05,
    relationshipDecayPerTick: 0.0015,
    /**
     * Below this an artist turns the brief down, unless they are on a retainer.
     * Brand standing offsets it: a known studio gets its calls returned.
     */
    minRelationshipToAccept: 0.25,
    brandStandingOffsetsRelationship: 0.3,
    /** Weekly bills, as a multiple of the artist's per-card rate. */
    retainerWeeklyMultiple: 0.35,
    exclusiveWeeklyMultiple: 1.1,
    /** A retainer discounts each brief; an exclusive discounts it further. */
    retainerFeeDiscount: 0.2,
    exclusiveFeeDiscount: 0.35,
    /** Roster drift: newcomers arrive, the established retire or price up. */
    newcomerChancePerTick: 0.012,
    retireChancePerTick: 0.0009,
    maxRosterSize: 170,
    // A rising reputation drags the rate up behind it, but only gently: the
    // measured fee did not move across 27 years of a real illustrator's career.
    // Fame pays an artist in the aftermarket for their old work, not in a
    // higher rate for the next brief. At 2.5 a reputable artist tripled their
    // fee, which priced the scouting bet out of its own reward.
    rateGrowthPerReputation: 0.15,
    rateAdjustRate: 0.02,
    // $80 to $500 an illustration. The researched fee is $400 to $2,500
    // (docs/tuning/05-real-world.md finding 3) and this is deliberately a fifth
    // of it, because our publisher earns about a fifth of a real one: it prints
    // 6,000 to 66,000 units against a real 16,700 to 248,000 booster boxes, at
    // about $29 a unit against about $100. Art's share of revenue is the
    // quantity the design cares about, so the fee is scaled to hold that share
    // where the research puts it rather than to match the headline dollars.
    // At the full researched band a 280-card set costs $406,000 in art — 81% of
    // the studio's whole starting capital, spent before a unit prints — and
    // `conservative` and `safeHands` both died 8/8 in year 4. See HANDOFF.md.
    // **When Round 10 lifts capital and print volume toward real scale, this
    // factor must shrink toward 1.** It is a scale correction, not a rate.
    openingRateMin: C(8_000),
    openingRateMax: C(50_000),
    // The newcomer band is the opening band. It used to be 50 to 300 *cents* —
    // a hundredth of what the opening roster charged — so every artist the
    // roster drift minted was nearly free, and after twenty years of drift the
    // whole board was nearly free. That was the live defect in
    // docs/tuning/02-hardcoded.md §5, and at 280 cards a set it dominated the
    // P&L rather than hiding in it.
    newcomerRateMin: C(8_000),
    newcomerRateMax: C(50_000),
    openingStatMin: 0.2,
    openingStatMax: 0.6,
    newcomerStatMin: 0.2,
    newcomerStatMax: 0.7,
    speedMin: 0.3,
    speedMax: 0.8,
    reliabilityMin: 0.4,
    reliabilityMax: 0.9,
    openingTurnaroundMin: 2,
    openingTurnaroundMax: 8,
    openingReputationMin: 0.05,
    openingReputationMax: 0.25,
    newcomerReputationMin: 0.03,
    newcomerReputationMax: 0.2,
    growthMin: 0.0005,
    growthMax: 0.004,
    reputationGrowthFloor: 0.6,
    reputationGrowthRange: 0.8,
    retireReputationThreshold: 0.85,
    retireAtPeakChance: 0.002,
    openingRosterSize: 42,
    openingRelationship: 0.5,
  },

  finance: {
    // $500,000. Everything in the model is cents, so the `_00` suffix is
    // load-bearing: without it this reads as $5,000, which does not cover a
    // single print run.
    startingCash: C(500_000_00),
    startingCredit: 0.2,
    // You are nobody. Every channel gate is measured against this.
    startingBrandStanding: 0.02,
    // The borrow ceiling used to carry its own copy of the starting cash as a
    // literal, so changing one did not change the other.
    borrowCeilingBase: C(500_000_00),
    overprintDeathUnits: 20_000,
    creditGainPerTick: 0.0006,
    creditLossPerTick: 0.002,
    // brandStanding mean-reverts toward this target rather than accumulating
    // without limit. These three weights gate every `requiredBrandStanding` in
    // the game, including the channel tree and the third grader.
    brandBase: 0.15,
    brandFromAffection: 0.55,
    brandFromGoodwill: 0.30,
    brandAffectionReference: 100,
    interestBase: 0.14,
    creditToRate: 0.08,
    borrowCeilingMultiple: 2.5,
    /**
     * A lender lends against the business, not against the door being open.
     *
     * The ceiling used to read `base * multiple * (0.3 + credit)` and nothing
     * else, so a studio with no sales at all could borrow exactly what a
     * working one could. That is what kept the `idle` bot alive to year 12: its
     * $500,000 lasted 7.7 years and the bank carried it for another 4.3 on no
     * revenue whatsoever.
     *
     * The ceiling is now multiplied by
     * `idleFloor + (1 - idleFloor) * min(1, annualRevenue / revenueReference)`.
     * A studio at or above the reference borrows what it always could. One with
     * no sales gets the floor. The reference is deliberately low — one year of
     * `conservative`'s opening revenue — because this is a solvency test, not a
     * growth lever, and a studio that is selling anything at all should not
     * find its credit line rationed.
     */
    borrowCeilingRevenueWeeks: 52,
    /**
     * A new studio borrows against its plan, not against its sales, because it
     * has not had time to have any. Inside this window the full ceiling is
     * available whatever the revenue test says.
     *
     * It is not a nicety. Without it the revenue gate fires hardest on exactly
     * the publisher it was not aimed at: `allIn` commits its bankroll in week 8
     * against a release 18 weeks out, so it went cash-negative with no sales on
     * the books, found its credit line at the floor, and died at year 0.2 in
     * every seed — before its first set shipped, having never placed the bet
     * the bot exists to measure. Two years covers the first release and its
     * first year of selling, and it is far short of the 7.7 years `idle` takes
     * to burn its cash, so it does not weaken the test it was built for.
     */
    borrowCeilingGraceTicks: 104,
    borrowCeilingRevenueReference: C(400_000_00),
    borrowCeilingIdleFloor: 0.1,
    brandConvergenceRate: 0.01,

    // Time is not free. Every outflow in the model used to be discretionary —
    // print runs, marketing, unlocks, art — so a publisher that released
    // nothing paid almost nothing and could not die, and four of the five death
    // routes in CONCEPT.md §7 were unreachable. These three lines are the
    // standing bill.
    //
    // Sized against measured revenue: `conservative` earns about $442k a year
    // and spends about $148k of it printing, so a four-channel studio paying
    // about $156k a year in overhead is under real pressure and still ahead.
    // A studio that releases nothing runs out of its $500,000 in about five
    // years, which is what makes doing nothing a way to lose.
    // Swept over 20 seeds x 30 years. At $2,000 a week the base alone is
    // $104k a year and it kills every small studio outright — `specialtyOnly`
    // went from 100% survival to 0%. At $1,000 the per-channel line is what
    // makes a large studio expensive, which is the right way round: reach is
    // what costs money to run.
    //
    // [round 10] The claim that "$1,000 is survivable on its own" is WRONG, and
    // the number is not. `specialtyOnly` measures 0% survival at $1,000 over 20
    // seeds x 30 years, dying of `debt_spiral` at a median year 10.6. It is not
    // the base rate that kills it: its whole standing bill is 82% of its
    // revenue, because it earns about $94,000 a year against a $77,000 bill. A
    // studio that small is not viable at any overhead this model would call a
    // bill, and the fix is a bigger niche business, not a cheaper one. The
    // survival number quoted above was measured at a shorter horizon than the
    // 30 years the suite now runs.
    weeklyOverheadBase: C(1_000_00),
    weeklyOverheadPerChannel: C(250_00),
    /** Per region past the home market. An office abroad is a standing cost. */
    weeklyOverheadPerRegion: C(600_00),
    /**
     * How hard the whole standing bill follows the market. The three lines
     * above are multiplied by `audienceScale ** overheadAudienceExponent`, so 0
     * is a flat bill and 1 is one that grows exactly as fast as the market
     * around it.
     *
     * A flat bill does not stay a bill. Measured over 20 seeds, `conservative`
     * pays about 35% of its revenue in overhead in year 1 and 1.9% by year 50,
     * because the market it sells into grows about 25x and the bill does not
     * move. Four of the five death routes in CONCEPT.md §7 need the standing
     * bill to keep biting, and a line worth 1.9% cannot bite anything.
     *
     * 1 is affordable only because the multiplier is FLOORED at 1 — see
     * `overheadReferenceScale`. Without the floor, an exponent of 1 quoted at
     * day one costs `conservative` 60 points of survival, and quoted at a 10x
     * market it hands every small studio a 55% discount for its whole life and
     * takes `diff.idleDies` from 8.8 years to 18.7. Floored, the same exponent
     * changes no survival number on the roster at either horizon and lifts the
     * mature overhead share from 1.9% to 3.1% — next to the only real anchor we
     * have, Stonemaier's $25M on 8 staff.
     */
    overheadAudienceExponent: 1.0,
    /**
     * The market size past which the bill starts to follow the market. The
     * multiplier is `max(1, (audienceScale / overheadReferenceScale) ** exp)`,
     * so the three weekly lines above are the bill for every studio up to a 10x
     * market, and only a studio that outgrows one pays more.
     *
     * The floor is what makes this affordable, and it was not obvious. A plain
     * power law cannot be neutral at day one AND neutral where the roster dies:
     * quoted at day one it raises the bill 1.6x exactly where the deaths
     * cluster and costs `conservative` 15 points of survival; quoted at 10x it
     * halves the early bill and lets `idle` live to 18.7 years. Flooring it
     * keeps every early and mid-game death route at the value Rounds 0-9 fitted
     * and adds pressure only in the tail nothing was measuring.
     *
     * 10 is where the roster's deaths cluster, which is why it is the point the
     * bill is allowed to start moving.
     */
    overheadReferenceScale: 10,
    /**
     * Warehousing, per unsold unit per week. Deliberately small: it is nothing
     * to a publisher holding a normal tail of stock and ruinous to one holding
     * a million units, which is the difference between capital locked up and
     * capital bleeding. Overprint death is unreachable without it.
     */
    // Three cents per unit per week, and 5.1 past the surcharge age. This was
    // one cent, fitted before the growth arc: a publisher holding 1.2 million
    // units paid $624k a year against $442k of revenue and died of it, which no
    // longer describes a mature studio's revenue.
    //
    // Swept on the roster (20 seeds x 30 years, all bots) against the four
    // death-route gates. One cent gives 35 overprint deaths; three cents with
    // the cliff gives 60, mid-band, and costs 41 runs of overall survival. Five
    // cents flat gives 65 for the same money, so the cliff buys the same
    // pressure and puts it on the publisher who actually overprinted. Eight
    // cents pushes debt_spiral to 143, well past its ceiling of 90.
    storagePerUnitPerTick: C(1),
    /**
     * The surcharge cliff. Stock still unsold half a year after the print run
     * is not a tail, it is an overprint, and it costs the surcharged rate from
     * there on. Storage has to keep biting once the growth arc makes cash
     * plentiful, and a flat per-unit rate cannot: revenue outgrows it.
     *
     * The age is NOT load-bearing and does not need sweeping again: from 13 to
     * 104 ticks the overprint death count moves only 60 to 64. Stock that is
     * going to sit sits for years, so where the cliff falls inside the first
     * two years does not change who it catches. Half a year is kept because it
     * is the point at which a release has stopped being new.
     */
    storageSurchargeAfterTicks: 26,
    storageSurchargeMultiple: 1.7,
  },

  sealed: {
    scarcityExponent: 0.5,
    priceLerp: 0.1,
    priceFloorMultiple: 0.4,
    msrpWeight: 0.6,
    contentsWeight: 0.6,
    baseRipRatePerTick: 0.01,
    ripPriceElasticity: 0.8,
    sealedNostalgiaRatePerYear: 0.04,
    heatDecayPerTick: 0.05,
    heatCeiling: 4,
  },

  // Swept on `unitsPerScalperReference`, which was the knob holding the whole
  // population on its floor. The loop this block has to produce is scalpers
  // arriving when resale pays, buying the drop out, and leaving again once they
  // have closed the premium; it now does that about every six years.
  drops: {
    // An ETB or a premium collection is camped harder than a booster box.
    scalperAppealPremium: 0.8,
    scalperAppealDefault: 0.4,
    cadenceWeeks: 6,
    collectorReach: 0.06,
    // Nearly everybody turns up for a drop they think will flip, and camping is
    // a speed advantage rather than a bigger wallet: a scalper at the queue
    // beats a collector to the stock several times over. Both were first
    // guesses, and both are what decide whether the population can ever take a
    // share of a drop that its own numbers do not already win.
    scalperReach: 0.9,
    scalperSpeed: 8,
    breakEvenPremium: 0.15,
    // What a scalper reads off the queue itself. A drop oversubscribed 5x is a
    // shortage anybody standing in it can see, and it is the only forward-
    // looking number they have on release day.
    shortagePremiumWeight: 0.2,
    shortagePremiumCap: 4,
    baseResaleRate: 0.04,
    holdLimitWeeks: 26,
    // Units a scalper has to be flipping per stride to count as fully employed.
    // This is the knob that sets the population's LEVEL: the equilibrium sits
    // where realized premium times crowding meets `breakEvenPremium`, so the
    // population lands near the drop flow divided by this number. At 0.3 the
    // direct store opens too late and drops too rarely to supply it, crowding
    // read 0.02-0.05 for everybody, and the population sat on its floor of
    // `minScalpers * audienceScale` taking 0.03% of a drop. Measured on
    // `dropRunner`, 20 seeds: 0.02 takes 47% of drop units over 50 years and
    // 0.05 takes 22%.
    unitsPerScalperReference: 0.03,
    resaleUrgency: 0.5,
    // Per stride, against the profitability edge. It sets how fast the
    // population answers the trade, so it is the cycle clock rather than the
    // level: at 0.06 a boom took longer than the run.
    populationGrowth: 0.25,
    minScalpers: 50,
    maxScalpers: 40_000,
    profitabilitySmoothing: 0.1,
    goodwillPerCollectorDrop: 0.01,
    goodwillPerScalperDrop: 0.014,
    goodwillPerShortage: 0.006,
    heatPerOversubscription: 0.35,
    dumpHeatDrag: 1.5,
  },

  channels: {
    // Per-kind traits, moved here from a constant table in channels.ts. The two
    // ratios that carry the design: the LGS earns goodwill at 12x the
    // distributor's rate, and the distributor sours 2.7x faster than the LGS.
    traits: {
      // Small volume, huge goodwill, prices hot product at whatever it will bear.
      lgs: {
        reach: 1.0, markupSensitivity: 0.9, discountFloor: 0.1,
        priceElasticity: 0.7, goodwillPerSellThrough: 0.006, strainSensitivity: 0.6,
      },
      // Volume at a thin margin. Over-allocate or under-deliver and it sours fast.
      distributor: {
        reach: 1.35, markupSensitivity: 0.1, discountFloor: 0.25,
        priceElasticity: 0.4, goodwillPerSellThrough: 0.0005, strainSensitivity: 1.6,
      },
      // Reach and legitimacy, brutal terms, and it holds the line at MSRP.
      bigbox: {
        reach: 1.8, markupSensitivity: 0, discountFloor: 0.35,
        priceElasticity: 0.5, goodwillPerSellThrough: 0.001, strainSensitivity: 1.1,
      },
      // Floats freely in both directions.
      online: {
        reach: 1.5, markupSensitivity: 0.6, discountFloor: 0.4,
        priceElasticity: 1.2, goodwillPerSellThrough: 0.0015, strainSensitivity: 0.8,
      },
      // Your own store. Full margin, always MSRP, never sours.
      direct: {
        reach: 0.8, markupSensitivity: 0, discountFloor: 0,
        priceElasticity: 0.6, goodwillPerSellThrough: 0.004, strainSensitivity: 0.2,
      },
    },
    // A fully soured channel keeps 40% of its capacity. This is the mechanism
    // behind the channel-collapse death route.
    capacityFloor: 0.4,
    streetPriceFloorMultiple: 0.25,
    // A channel with no relationship still moves half of what its reach and
    // stock would otherwise win it. Relationship scales the other half.
    demandRelationshipFloor: 0.5,
    // The opening state of every channel. `minimumOrder` is load-bearing: a
    // studio printing under 2,000 units cannot reach the distributor at all,
    // which is why an under-printing strategy is locked out of reach.
    seeds: {
      ch_lgs: {
        relationship: 0.6, capacityUnits: 12_000, marginShare: 0.55,
        minimumOrder: 1, reliability: 0.8, requiredBrandStanding: 0, queueCapacity: 0,
      },
      ch_online: {
        relationship: 0.5, capacityUnits: 40_000, marginShare: 0.5,
        minimumOrder: 500, reliability: 0.85, requiredBrandStanding: 0.12, queueCapacity: 0,
      },
      ch_dist: {
        relationship: 0.5, capacityUnits: 120_000, marginShare: 0.38,
        minimumOrder: 2_000, reliability: 0.9, requiredBrandStanding: 0.25, queueCapacity: 0,
      },
      ch_bigbox: {
        relationship: 0.4, capacityUnits: 250_000, marginShare: 0.3,
        minimumOrder: 10_000, reliability: 0.75, requiredBrandStanding: 0.45, queueCapacity: 0,
      },
      ch_direct: {
        relationship: 1, capacityUnits: 25_000, marginShare: 1,
        minimumOrder: 1, reliability: 1, requiredBrandStanding: 0.6, queueCapacity: 5_000,
      },
      // Abroad. Capacity is scaled by the region's `marketSize` on top of this.
      abroadLgs: {
        relationship: 0.45, capacityUnits: 12_000, marginShare: 0.55,
        minimumOrder: 1, reliability: 0.75, requiredBrandStanding: 0, queueCapacity: 0,
      },
      abroadOnline: {
        relationship: 0.45, capacityUnits: 40_000, marginShare: 0.5,
        minimumOrder: 500, reliability: 0.8, requiredBrandStanding: 0.12, queueCapacity: 0,
      },
      abroadDist: {
        relationship: 0.4, capacityUnits: 120_000, marginShare: 0.38,
        minimumOrder: 2_000, reliability: 0.85, requiredBrandStanding: 0.25, queueCapacity: 0,
      },
    },
    relationshipGainPerSellThrough: 0.02,
    relationshipLossPerUnsold: 0.03,
    unsoldGraceWeeks: 26,
    evaluationWindowWeeks: 104,
    reopenRelationship: 0.45,
    sellThroughTarget: 0.6,
    strainThreshold: 0.3,
    lossThreshold: 0.12,
    idleDriftPerTick: 0.004,
    idleGraceWeeks: 78,
    streetPriceLerp: 0.15,
    stalenessPerWeek: 0.012,
    // Distributors and chains cost relationship-building money, not a licence fee.
    // The direct store is the one you actually build.
    unlockCost: {
      lgs: C(0),
      distributor: C(150_000_00),
      bigbox: C(400_000_00),
      online: C(80_000_00),
      direct: C(750_000_00),
    },
  },

  // First-guess numbers, wired for behaviour rather than swept. The shape that
  // matters: every lever diminishes, and none of them can rescue a set the
  // audience does not want — hype multiplies demand, it does not create it.
  hype: {
    // Weeks before the home release that previews start, so the free window is
    // `defaultLeadWeeks / defaultCadenceWeeks` previews long — 1 at these
    // values. It is counted back from the release, the same way a bot's
    // `revealLeadWeeks` is.
    //
    // [round 9] It used to count FORWARD from the commit, against a release
    // fixed 18 weeks out, so 12 meant a 6-week window and 3 previews, and
    // lowering it made the window LONGER. Both the plan and the handoff read it
    // the other way round. The number moved 12 -> 2 and the window moved 3
    // previews -> 1; the direction of the knob is what actually changed.
    defaultLeadWeeks: 2,
    defaultCadenceWeeks: 2,
    revealHypePerCard: 0.05,
    revealHalfLife: 0.8,
    revealAttentionCost: 0.004,
    // NOT a price. It is the scale at which the log curve bends, so LOWERING it
    // makes cash-bought hype STRONGER per dollar. Round 9's plan asked for it
    // to come down "so cash-bought hype is weak per dollar", which is the
    // opposite of what the knob does; the gain carries that job alone instead.
    marketingReference: C(100_000_00),
    // Swept over 20 seeds x 30 years at equal spend against a prerelease. At
    // 0.35 marketing was strictly dominated — the same hype cost twice what
    // the LGS route charged for it, so there was never a reason to buy it. At
    // 1.2 it is competitive and still the more expensive way to the same
    // number, which is the right relationship: attention bought with cash
    // should cost more than attention earned through the stores.
    //
    // [round 9] 1.2 had stopped meeting that description. Per $50,000 it paid
    // 0.487 hype against a prerelease's 0.24, so cash was the CHEAP route, not
    // the dear one, and it carried two thirds of a campaign once the window
    // shrank. 0.5 pays 0.203 against the prerelease's 0.24: still worth buying,
    // and once again the dearer of the two. Swept at 0.35, 0.5, 0.7 and 1.2 —
    // median net worth moves 2.6% across that whole range, so this knob buys
    // the RELATIONSHIP between the two routes and almost no outcome.
    marketingHypeGain: 0.5,
    prereleaseCostPerScale: C(25_000_00),
    prereleaseHypeGain: 0.12,
    prereleaseGoodwillGain: 0.02,
    prereleaseRelationshipGain: 0.04,
    ceiling: 3,
    // Swept over 20 seeds x 30 years. At 0.06 launch hype is gone inside a
    // couple of months while the print run it was built for sells over years,
    // so a campaign could not reach the sales it paid for and every lever in
    // the reveal window lost money at every price. At 0.02 hype lasts about a
    // year, which is the horizon a print run actually sells over.
    decayPerTickAfterRelease: 0.02,
    // Wide on purpose. The read has to be genuinely poor without a campaign,
    // or the reveal window is a solved problem and its levers buy nothing: at
    // 0.55 a publisher who spent nothing already scored r = 0.93. Error shrinks
    // as 1/sqrt(previews).
    //
    // [round 9] Re-fitted for the short window. The campaign fell from 16
    // previews to 3 and the free window from 3 to 1, so the same sigma no
    // longer reads the same. Swept over 20 seeds x 30 years at 1.0, 1.2 and
    // 1.4, which give (free, campaign) reads of (0.53, 0.75), (0.47, 0.69) and
    // (0.42, 0.63). 1.2 holds the free read at the 0.45 the last three rounds
    // measured, and puts the campaign mid-band rather than near either edge.
    signalNoiseSigma: 1.2,
    heatFromHype: 0.8,
  },

  // First-guess numbers, deliberately smaller than a prerelease: an event is
  // run for a set already on the shelf, so it cannot move the launch. What it
  // buys is goodwill, a shop relationship and one scarce promo printing.
  // Nothing calls `hostEvent` until C11 adds `eventHost`, so these move no
  // number today.
  events: {
    costPerScale: C(8_000_00),
    maxScale: 20,
    goodwillGain: 0.004,
    relationshipGain: 0.01,
    promoCopiesPerScale: 250,
    promoHeat: 2.2,
  },

  // First-guess numbers. The shape that matters: grading has to be worth doing
  // only on cards that are already worth something (the fee is a real hurdle),
  // and a gem has to stay rare enough to be worth chasing — which is what print
  // quality and grader strictness between them decide.
  grading: {
    // Grade boundaries on the latent 1-10 condition score. With `conditionMean`
    // and `conditionSigma` these are what set the gem rate: tune them together
    // or you are tuning half the problem.
    gradeCuts: { '10': 9.75, '9.5': 9.25, '9': 8.5, '8': 7.5, '7': 6.5 },
    submitRatePerTick: 0.004,
    feeWorthMultiple: 5,
    appetiteCeiling: 4,
    maxGradedShare: 0.35,
    // The latent scale is NOT the grade scale: it is an unbounded normal whose
    // only meaning is its distance from `gradeCuts`. A mean of 10 against a
    // 9.75 cut for a 10 says a factory-fresh modern copy clears the top bar
    // about half the time, which is what the measured 50-53% gem rate for
    // modern TCG in 2024-25 means. At 9 a 10 sat near the 14th percentile,
    // where reality puts it at the median. Read it with `conditionSigma` and
    // `gradeCuts`; on their own none of the three says anything.
    conditionMean: 10.0,
    conditionSigma: 0.7,
    gradeShiftWeight: 3,
    strictnessWeight: 0.6,
    agePenaltyPerYear: 0.02,
    agePenaltyCap: 0.8,
    tierMultiplier: { '10': 4.5, '9.5': 2.4, '9': 1.6, '8': 1.1, '7': 0.85, below7: 0.55 },
    reputationWeight: 0.35,
    // A pop report of one tier of one printing is counted in tens, not
    // thousands, so the reference has to sit down where the counts actually
    // are. At 250 every tier was pinned to `popScarcityCeiling` and the
    // pop-report term stopped saying anything at all.
    popScarcityReference: 8,
    popScarcityExponent: 0.35,
    popScarcityCeiling: 2.5,
    popScarcityFloor: 0.5,
    priceLerp: 0.35,
    // Swept over 4 seeds x 50 years on `conservative`: 0.4 lets the third
    // grader in around year 3, before the publisher is anybody, and 0.65 keeps
    // it out until year 26 in the slower seeds. At 0.55 it arrives between
    // years 4 and 13 depending on how the run has gone, which is what a
    // brand-standing reward should look like.
    sideGraderBrandGate: 0.55,
  },

  // First-guess numbers. The shape that matters: a region has to be able to be
  // the wrong region, or opening one is a pure size multiplier and the decision
  // is "yes, all of them, as soon as you can afford it".
  region: {
    knowledgeGainPerRelease: 0.02,
    knowledgeGainPerResearch: 0.05,
    mismatchPenalty: 0.25,
    /**
     * What a pack costs in a region that finds prices normal, in cents.
     *
     * The reference the affordability term measures a product against. 583 is
     * the standard booster box the whole roster prints — 14000 over 24 packs —
     * so a studio pricing at the reference sells at exactly the demand the
     * model was tuned on.
     *
     * Measured per PACK rather than per unit, because a 36-pack box should cost
     * more than a 24-pack box without being punished for it.
     */
    referencePackPrice: 583,
    /**
     * How hard demand responds to price. 0 disables the term entirely.
     *
     * **Before this, MSRP had NO effect on demand at all.** `setFit`'s price
     * component read `Region.truth.priceTolerance` and compared it against
     * nothing, and the only other price signal was
     * `(msrp / streetPrice)^elasticity`, which asks whether a SHOP is marking
     * up — and street price floats around MSRP, so raising MSRP moved neither
     * term. A studio could charge anything.
     *
     * That is C11's "a 2.6x price is nearly free" finding, and it was literally
     * true: `archivist` prices at 36000 against `conservative`'s 14000 and
     * finished on 2.05M of liquid net worth against 0.62M.
     */
    affordabilityElasticity: 0,
    /** Nobody is priced out entirely; a few collectors will pay anything. */
    affordabilityFloor: 0.12,
    /**
     * Spread on a region reading at `knowledge` 0. Wide on purpose, for the
     * same reason `hype.signalNoiseSigma` is: a reading that is nearly right
     * from the first week makes knowledge worthless and the entry bet solved.
     */
    readingNoiseSigma: 0.8,
    /** Weeks between a region unlock and the first release the player can ship there. */
    entryLeadWeeks: 26,
    // `tasteBias` runs about -0.3..+0.3 and `rarityAppetite` about 0.5..1.5, so
    // both are folded onto a 0..1 scale rather than multiplied raw. A region
    // with no opinion at all lands on exactly 1.
    fitTasteWeight: 0.25,
    fitAppetiteWeight: 0.25,
    fitProductWeight: 0.25,
    fitPriceWeight: 0.25,
    tasteFitCentre: 0.5,
    appetiteFitDivisor: 1.5,
    productFitDivisor: 1.5,
    priceFitGain: 1.2,
    wealthFloor: 0.4,
    knowledgeCeiling: 0.95,
    researchCreditShare: 0.25,
    tasteReadingNoiseScale: 0.5,
    // Exactly 0 on purpose: `mixTilt` evaluates to exactly 1, so the mechanism
    // lands without moving a number. Round 12 fits the on-value.
    segmentMixAcquisitionWeight: 0,
  },

  // First-guess numbers, wired for behaviour rather than swept. Each population
  // has to be able to move and to come back: one that only grows is a price
  // multiplier with extra steps.
  actors: {
    collectorShareOfAudience: 0.02,
    collectorConvergence: 0.08,
    minCollectors: 500,
    // Collectors per head of audience is this floor plus this weight times
    // goodwill, less this penalty times fatigue. They were literals in
    // `collectorTarget` until Round 5b, which is why nothing could sweep them.
    // Goodwill runs 0.43 to 1.00 across the bot roster, so the pair below is
    // the whole reason a collector base reads the strategy. Fatigue does not:
    // it measures 0.220 to 0.223 in every bot at every decade, so the penalty
    // term is a constant of 0.89 wearing a variable's clothes. Whichever round
    // owns fatigue should read that before trusting this knob.
    collectorGoodwillFloor: 0.3,
    collectorGoodwillWeight: 1.4,
    collectorFatiguePenalty: 0.5,
    // Collectors per head of audience at which holding reaches its ceiling.
    // At 0.03 a healthy run sits exactly on it and every seed reports the
    // ceiling, which is a constant wearing a population's clothes.
    //
    // Round 5b measured the ramp across the whole roster. Density is
    // `collectorShareOfAudience` times a goodwill and fatigue term, so it is
    // bounded by 0.006 to 0.034 by construction, and at 30 years it runs 0.0151
    // for `channelHog` to 0.0271 for `scout` - a 1.8x spread that is entirely
    // goodwill. Against a reference of 0.09 every run sat in the bottom third
    // of the ramp and that spread arrived as 0.250 against 0.290. At 0.035 the
    // same runs read 0.330 against 0.432. At 0.025 a healthy run pins on the
    // ceiling, which is the failure the round-3 note recorded.
    //
    // Round 5's first reading of this said no reference could make holding
    // respond to play. That was measured on three bots which all happened to
    // sit near goodwill 1.0, and it was wrong.
    collectorDensityReference: 0.035,
    // A third of opened copies off the market at the floor is not a guess about
    // this game — it is roughly what any collectible market looks like, and it
    // is the term that makes a loyal audience worth money.
    collectorHoldFloor: 0.2,
    collectorHoldCeiling: 0.5,

    resellerReference: 300,
    resellerConvergence: 0.12,
    minResellers: 20,
    maxResellers: 20_000,
    // Singles-to-sealed value ratio at which ripping stops paying. Measured
    // after Round 4, the weighted ratio runs 0.53-1.30 and differs by strategy:
    // `conservative` sits near 1.0 and `hypeGambler` near 0.6, which is what
    // makes the reseller population read the strategy rather than the clock. A
    // break-even of exactly 1 would hold the population on its floor for every
    // strategy except a flooder. Below 1 is also the honest number: a streamer
    // earns on the stream and on the retail spread, not only on the pull.
    ripBreakEven: 0.5,
    // Exactly 0 on purpose: `realisableCardValue` returns the raw price
    // unchanged and both consumers keep the number they had. Round 12 fits it.
    // A shop pays about 15% of retail for bulk and about 70% for a card it can
    // sell the same week; those are the ends this interpolates between.
    buylistWeight: 0,
    buylistFloorShare: 0.15,
    buylistCeilingShare: 0.7,
    ripPerReseller: 0.5,
    // Units one reseller opens per stride, scaled to the market. This is the
    // second consumer of the reseller population, and it is the reason the
    // population's LEVEL means anything: `ripMultiplier` reads the pool only as
    // a ratio to `resellerReference`, so scaling both leaves every rate
    // identical and the reported number was decoration.
    //
    // Fitted so the ration bites when the pool is depressed rather than always.
    // Measured on `conservative` over 50 years, the reseller-driven demand runs
    // 3 to 6 times under the capacity at 0.5, so it never bound at all.
    ripUnitsPerReseller: 0.1,

    // Speculators per printing at which their push runs at full strength. Not
    // an absolute population: see `speculatorCrowd`. The loop is stable at
    // `speculatorHeatGain` 0.2 and detonates by 0.5, so 1 leaves about a four
    // times margin on the knob that sets the gain.
    speculatorsPerPrinting: 1,
    speculatorConvergence: 0.1,
    minSpeculators: 50,
    maxSpeculators: 30_000,
    /** Heat above the pack per speculator at which the population holds still. */
    // At 0.02 the population settles near 25,000 against a 30,000 cap, which
    // is the runaway this per-capita form exists to prevent. The pool scales
    // with the size of the catalogue, so this is the number that decides how
    // many speculators a market of a given size supports.
    speculatorHeatPerCapita: 0.3,
    speculatorMomentumGain: 0.35,
    // Pure amplification, and no longer a stability question: since the
    // population's return reads `market.speculatorHeat` out of the pool, this
    // knob cannot feed itself. Measured on `conservative` at 50 years, the
    // share of the heat pool the speculators supply runs 2% at 0.05, 12% at
    // 0.25, 29% at 0.6 and 96% at 2.5. Before the split it could not pass 15%
    // at any stable value, and the loop detonated between 0.25 and 0.35.
    //
    // It stays at 0.05, and the reason has moved. Stability no longer binds;
    // `shape.yearsTo100` does. More heat on a young printing reaches $100
    // sooner, and the gate measures 2.442 at 0.05, 1.981 at 0.08 through 0.12,
    // 1.673 at 0.3 and 1.423 at 0.6, against a floor of 2.0. Buying more
    // amplification means lowering the price body to pay for it, which reopens
    // the Round 4 value fit, or revisiting that band with the round that owns
    // it. Do not raise this knob on its own.
    speculatorHeatGain: 0.05,
    speculatorSensitivity: 1.5,
    speculatorNoise: 0.004,
  },

  // First-guess numbers. The shape that matters: a collab buys reach you do
  // not have and cannot buy affection you have not earned — the licensor keeps
  // the IP equity, so a studio that lives on collabs owns nothing at the end.
  collabs: {
    // Reach one offer carries, and the brand standing it demands. With
    // `reachToDemand` these decide whether a licence is ever worth its fee.
    reachBonusMin: 0.15,
    reachBonusMax: 0.6,
    gateMin: 0.1,
    gateMax: 0.6,
    // A collab that reached everybody equally would be a flat demand
    // multiplier, and choosing between two offers would stop being a decision.
    segmentsReachedMin: 1,
    segmentsReachedMax: 3,
    /** Chance per quarter that an offer arrives, at full brand standing. */
    offerChancePerQuarter: 0.35,
    offerWindowWeeks: 26,
    maxOpenOffers: 3,
    // The deal, in the shape the licensing research documents: an advance, a
    // royalty on net sales, and a minimum guarantee under both.
    //
    // ONE roll sets the advance and the royalty share, and it sets them in
    // opposite directions. That is not a shortcut — it is the decision. A
    // licensor either wants the money now or wants a share of what the set
    // does, so an offer is a point on that line, and choosing between two
    // offers is choosing how much of the bet to keep. Two independent rolls
    // would have produced offers that are simply cheaper or dearer than each
    // other, which is not a choice.
    //
    // It also costs exactly the one draw the flat fee used to cost, so the
    // main RNG stream keeps its numbering. Round 9 is the only round after
    // Round 3 that is allowed to renumber it.
    advanceMin: C(60_000_00),
    advanceMax: C(500_000_00),
    royaltyShareMin: 0.05,
    royaltyShareMax: 0.15,
    // A flop still owes twice its advance. This is the whole downside of a
    // licence: the reach was rented in advance, and the rent does not fall
    // when nobody turns up.
    minimumGuaranteeMultiple: 2.0,
    // Two years after the home release. Sales decay as e^(-1.4 * years), so by
    // then a set has earned about 94% of everything it will ever earn, and the
    // royalty measured against the guarantee is the final one in all but name.
    guaranteeSettleWeeks: 104,
    /**
     * Demand multiplier per point of weighted reach bonus.
     *
     * 1.2 -> 8 in Round 8, and the size of that jump is the point. At 1.2 a
     * licence bought about a 5% demand lift against a fee, an exposure cut and
     * a royalty, so `licensor` earned LESS than `conservative` — the inverted
     * sign the round exists to fix. The ladder, measured at the gate suite's
     * own shape (20 seeds x 30 years), reads `licensor`/`conservative` median
     * net worth and `licensor` survival:
     *
     *   1.2 -> 0.98 / 0.95      6 -> 1.39 / 0.90
     *     3 -> 1.10 / 0.95      7 -> 1.52 / 0.95
     *                           8 -> 1.47 / 0.85
     *                          10 -> 1.47 / 0.80
     *
     * The earnings ratio plateaus around 7; survival keeps falling, because
     * the run is now sized to the licence and a licence that under-delivers is
     * an overprint. 8 is where both land mid-band. 7 reads 0.950 survival,
     * which is exactly the band ceiling and would flap.
     */
    reachToDemand: 8,
    /** Goodwill a collab set earns in the segments it reaches. */
    goodwillPerReach: 0.05,
    /**
     * Share of the usual IP exposure a collab set returns to your own IPs. The
     * licensor's audience came for the licensor: the reach is rented, and this
     * is the rent.
     */
    exposureShare: 0.3,
  },

  // First-guess numbers. The shape that matters: a creator has to be somebody
  // in particular. Coverage lands on their affinities and on new cards, and
  // the relationship that raises their odds decays if you stop giving them
  // things to cover.
  // A chain is pull demand: an incomplete set of anything is worth more than
  // the same cards unrelated. First-guess numbers.
  // First-guess numbers, wired for reachability rather than balance — Round 11's
  // sweep fits them. The shape that matters: every tier is a real cost against a
  // real gate, the two ongoing hires are payroll rather than purchases, and
  // nothing here can be bought before the studio is somebody.
  //
  // Until this block existed, `purchaseUnlock` rejected every unlock except
  // `channels` in one line, so six declared systems were permanently dead:
  // market research, the community team, analytics, the print-quality tiers,
  // specialty set slots and self-hosted events.
  unlocks: {
    maxLevel: 3,
    // Per-project research. The cheapest of the three because it buys the
    // narrowest thing — one region's read, one project at a time.
    marketResearchCost: C(120_000_00),
    marketResearchCostLevelMultiple: 2.2,
    // A standing team, gated on audience size (CONCEPT.md §9). The upkeep is
    // what stops every tier being bought the moment it is affordable: a hire
    // with a one-off price and a permanent benefit is not a decision.
    communityTeamCost: C(200_000_00),
    communityTeamCostLevelMultiple: 2.0,
    communityTeamUpkeepPerTick: C(2_000_00),
    communityTeamAudienceGate: 2,
    // Capital AND brand standing, per CONCEPT.md §9. The dearest of the three:
    // it reads the market rather than the audience.
    analyticsCost: C(300_000_00),
    analyticsCostLevelMultiple: 2.0,
    analyticsUpkeepPerTick: C(3_000_00),
    analyticsBrandGate: 0.35,
    // "Capital, distributor terms" — so the gate is a live distributor
    // relationship, not a number the studio can reach by waiting.
    premiumTierCost: C(250_000_00),
    archivalTierCost: C(600_000_00),
    printQualityRelationshipGate: 0.5,
    // "Prior set performance": slots are earned by shipping, not bought.
    specialtySlotCost: C(150_000_00),
    specialtySlotCostMultiple: 1.8,
    specialtySlotSetsPerSlot: 3,
    eventsCost: C(400_000_00),
    eventsAudienceGate: 3,
    enforcePrintQuality: 0,
    enforceSpecialtySlots: 0,
  },

  // First-guess numbers; Round 11's sweep fits them. The shape that matters:
  // every tier narrows the band, none of them closes it, and the narrowing
  // diminishes — the third level of a tier is worth less than the first.
  //
  // `baseSigma` 0.5 means a studio that has bought nothing reads an affection of
  // 50 as somewhere between about 30 and 82, which is wide enough to build the
  // wrong set around. Fully invested it reads between about 44 and 57, which is
  // still wide enough to be wrong and never wide enough to be an excuse.
  readings: {
    baseSigma: 0.5,
    residualSigma: 0.12,
    researchNarrowing: 0.35,
    communityNarrowing: 0.45,
    analyticsNarrowing: 0.5,
    // A reading holds for a quarter. Shorter and a UI flickers; longer and a
    // player can wait out the error instead of paying to remove it.
    rereadWeeks: 13,
    forecastHorizonWeeks: 52,
    /**
     * How far back a price forecast measures its trend, in weeks.
     *
     * `rawHistory` is compacted, so the gap between the last two points is
     * arbitrary. Reading the drift off them made the forecast a function of
     * when compaction happened to write a point.
     */
    forecastDriftWindowWeeks: 52,
    /**
     * The most a forecast will extrapolate, as a multiple per year, in either
     * direction. Nothing read by the value engine touches this — `forecastPrice`
     * is a reading and exists to be looked at.
     */
    forecastMaxDriftPerYear: 2.5,
  },

  // Orders taken during the reveal window. Ships INERT at `conversionRate: 0`
  // — the whole system computes zero and returns — because preorders move
  // `diff.sellThrough` and `diff.flopRate`, both of which are already strained,
  // and turning it on is a tuning decision with its own measurement.
  //
  // The shape that matters: a preorder is demand brought FORWARD. Units taken
  // here come off what the shelf can sell, so the studio gets its money earlier
  // and a read on demand it can trust, and gets neither for free.
  //
  // MEASURED, and the sweep needs to know it: bringing demand forward is not
  // sell-through-neutral, because a preorder converts an uncertain sale into a
  // certain one. On `conservative` over 12 years, sell-through reads 0.9643 at
  // rate 0, 0.9652 at 0.0002 and 0.9758 at 0.002. That is economically right —
  // it is why publishers take preorders — but `diff.sellThrough` has sat ON its
  // 0.95 ceiling for two rounds, so this knob is fitted against that gate or
  // not at all.
  preorders: {
    conversionRate: 0,
    hypeWeight: 0.6,
    chaseWeight: 0.4,
    windowFraction: 1,
    goodwillPerUnfilled: 0.000002,
    // Preorders are taken direct, so the studio keeps more of the price than
    // any channel would leave it. That margin is the carrot; the promise is the
    // stick.
    marginShare: 0.95,
  },

  chains: {
    desirePerLink: 6,
    maxCountedLinks: 5,
    spansSetsBonus: 1.6,
    // [round 11] The illustration chain, wired for the first time — `ChainKind`
    // had two variants and `designCard` hardcoded one of them, so
    // `Card.illustrationLink` was written null and read by nothing.
    //
    // It pays LESS per link than a progression chain and more when it spans
    // sets, because an art subset that runs across a year of releases is the
    // thing collectors actually chase. The hedge term is the reason it exists:
    // at `illustrationWeakSubjectFloor` the chain adds almost nothing to a card
    // whose character is already loved, and the full amount to one whose
    // character nobody bonded with. First-guess numbers; Round 11's sweep fits
    // them against the progression chain that has never been swept either.
    illustrationDesirePerLink: 4,
    illustrationSpansSetsBonus: 2.0,
    illustrationWeakSubjectFloor: 0.25,
    subjectReference: 60,
    /**
     * What one link of a VARIANT run is worth.
     *
     * Three cards, all the same character, at three rarities. Collectors chase
     * the complete run, which is pull demand — the shape `chainTerm` already
     * models. Starts equal to `desirePerLink`, so a variant chain behaves like
     * a progression chain until somebody separates them deliberately.
     */
    variantDesirePerLink: 6,
    /**
     * What printing a progression chain IN ORDER is worth, as a multiplier on
     * the chain term.
     *
     * **0 until fitted.** `progressionLink.position` had no reader at all, so a
     * chain was an unordered set and shipping the middle of an evolution line
     * first cost nothing.
     */
    orderBonus: 0,
  },

  creators: {
    rosterSize: 24,
    // A couple of large channels and a lot of small ones, which is what a
    // creator ecosystem looks like and what makes picking one worth doing.
    audienceBase: 20_000,
    audienceGrowth: 1.6,
    audienceExponentMax: 11,
    influenceMin: 0.2,
    influenceMax: 0.9,
    openingRelationshipMin: 0.05,
    openingRelationshipMax: 0.3,
    coverChancePerStride: 0.25,
    /** Weeks a printing counts as new enough to be worth covering. */
    freshnessWeeks: 60,
    /** Redraws allowed to land on a creator's affinity IP before settling. */
    affinityTries: 4,
    audienceReference: 250_000,
    heatPerCoverage: 0.35,
    maxCoverageHeat: 2.5,
    /** Fresh printings on the market at which a creator is fully engaged. */
    freshPrintingsReference: 140,
    relationshipConvergence: 0.05,
  },

  /**
   * Finishes: what a treated card costs to print, and what it buys.
   *
   * `Card.treatments` has been declared, defaulted and read by NOTHING since
   * the engine was written — one of the four dead fields in
   * `docs/screens-audit.md`. The set wizard has been letting players choose
   * finishes per rarity for several commits, and the choice reached the
   * decision payload and then stopped.
   *
   * **Both weights ship at 0, which is exactly neutral**, so this lands
   * byte-identical and the fit is a separate, measured change.
   *
   * The shape, from `docs/design/sets-and-distribution.md` §1.2: a finish costs
   * money on the print bill and buys desire on the card, and it only works
   * while it is RARE. Past `saturationShare` of the set it stops reading as a
   * special card and the premium falls away, while the bill does not.
   */
  /**
   * The desire budget.
   *
   * `castDesire` is a plain sum: affection, resurgence, cameos, chains. Four
   * more signals are specified — character relations, affiliation, variant
   * groups, and the pairings the community invents — and
   * `docs/design/sets-and-distribution.md` §2 settles what happens if they are
   * simply added: eight additive terms on one number, nothing stopping a card
   * qualifying for all eight, so the optimal card becomes a checklist, every
   * card becomes that card, and each mechanic stops being a decision.
   *
   * The answer is a BUDGET, not a cap. No term is ever dropped or beaten by a
   * `max()`. Every signal contributes on every card; what is bounded is the
   * total:
   *
   *     desire = affection + resurgence                  <- who is on the card
   *            + bonusBudget x SUM(w_i x signal_i)       <- what it connects to
   *
   * with SUM(w) = 1 and each signal in 0..1. **The property that solves the
   * problem is that a new mechanic can only take share** — it can never inflate
   * the total, so adding a ninth signal forces a re-division somebody has to
   * defend.
   *
   * **The budget is ADDED, never multiplied, and that is load-bearing.**
   * `chainTerm` pays an illustration chain MORE when the subject is weak — the
   * hedge against a weak subject. A multiplicative bundle scales with affection
   * and would invert that; an additive one preserves it for free, because the
   * same absolute bonus is worth far more at affection 4 than at 60.
   *
   * **`bonusBudget` 0 means the legacy path**, and that is deliberate: the
   * restructure lands byte-identical, and dividing the budget is one measured
   * sweep afterwards. HANDOFF already flags that a single illustration chain
   * produces a 349% price lift at affection 5 and may be too strong, so
   * whatever the budget should be, it is smaller than what one term does today.
   */
  /**
   * The archetype table.
   *
   * **Every entry is the global `affection` range today, which makes this
   * exactly neutral**, per `docs/design/characters.md`: ship the table neutral,
   * then widen the ranges as one measurable change. The roll count and order
   * are unchanged, so nothing renumbers.
   *
   * The shape the widening must take, from the design document, with two rules:
   *
   * - **No archetype dominates.** Where one wins on the ceiling it must lose on
   *   longevity or on breadth. If a sweep finds one archetype is simply
   *   correct, the table is wrong, not the player.
   * - `mascot` is the reason `affection.longevityWeight` has to stop being 0.
   *   The label is meaningless unless longevity does something, so the table
   *   and the longevity fit are ONE task, not two.
   */
  archetypes: {
    none:      { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
    mascot:    { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
    rival:     { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
    mentor:    { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
    trickster: { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
    legend:    { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
    upstart:   { relatability: [8, 96], longevity: [0.85, 1.18], affinity: {} },
  },

  desire: {
    /** Total the connection bundle is worth. 0 keeps the old additive sum. */
    bonusBudget: 0,
    /**
     * How the budget divides. **These must sum to 1.** The four zeros are the
     * signals that do not exist yet; landing each at 0 is the C11 rule.
     */
    weights: {
      cameo: 0.25,
      progression: 0.3,
      illustration: 0.3,
      treatment: 0.15,
      /** Character relation graph — `characters.md`. Not built. */
      relation: 0,
      /** Faction affiliation — `characters.md` §3. Not built. */
      affiliation: 0,
      /** A complete variant run, the third chain kind. Not built. */
      variantGroup: 0,
      /** Pairings the in-game audience invented — `communitySentiment`. Not built. */
      community: 0,
    },
    /** Cameo affection at which the cameo signal saturates. */
    cameoReference: 120,
  },

  treatments: {
    /**
     * Extra print cost per treated card, as a share of the pack's unit cost,
     * per finish on that card. Finishes stack, so three finishes cost three
     * times one.
     */
    costPerFinish: 0,
    /**
     * Desire a finish adds to a card, per finish, before saturation.
     * Additive, never multiplicative — the same rule the chain hedge follows.
     */
    desirePerFinish: 0,
    /**
     * The share of a set that can carry a finish before it stops reading as
     * one. Past this the desire term decays toward zero; the cost does not.
     */
    saturationShare: 0.34,
  },

  history: {
    weeklyRetentionTicks: 520,
    writeThreshold: 0.03,
    /**
     * Age, in years, past which a quiet printing reprices yearly instead of
     * every `strides.price` weeks.
     *
     * **Ships at 0, which is off, and the harness leaves it off.** Skipping a
     * repricing skips its shock and resurgence draws, so switching this on
     * renumbers the run — it is a measured change, never a free one.
     *
     * `docs/design/running-forever.md` is why it exists: a 150-year run holds
     * 42,000 printings and reprices every one on a 4-week rotation forever, so
     * the per-year cost grows 33x between the first 25 years and the last. A
     * hundred-year-old card does not need weekly repricing, which is exactly
     * what its nostalgia says about it. With this on, cost grows with how much
     * of the catalogue is MOVING rather than with how big it is.
     */
    slowLaneAfterYears: 0,
    /**
     * Heat above which an old printing is pulled back into the fast lane.
     *
     * The slow lane is for the quiet back catalogue. A vintage card whose price
     * is running is the single thing a player is most likely to be watching, so
     * a heat spike must promote it back immediately.
     */
    slowLaneHeatFloor: 1.15,
  },

  // The rarity model, moved here from two constant tables in engine.ts.
  // `weight` is a demand-side signal and never touches price. `pull` is copies
  // printed per card, and is how rarity reaches price, through scarcity.
  // Changing either table moves everything.
  rarity: {
    weight: {
      common: 1, uncommon: 1.4, rare: 2.6, doubleRare: 5, ultraRare: 12,
      illustrationRare: 22, specialIllustrationRare: 60, hyperRare: 90, promo: 8,
    },
    pull: {
      common: 4, uncommon: 2.2, rare: 0.9, doubleRare: 0.28, ultraRare: 0.09,
      illustrationRare: 0.035, specialIllustrationRare: 0.008, hyperRare: 0.004, promo: 0.05,
    },
    pullDivisor: 10,
    // The `pull` table is copies of one card per pack at this set size. Summed
    // over the roster's rarity mix it is about 17.5 cards a pack, and a pack
    // holds the same number of cards whatever the set size — so a 280-card set
    // makes every individual card four times rarer rather than putting four
    // times the cardboard in the box. Without this, `printQuantity` and
    // `expectedSinglesValue` both scale with the set size and a bigger set
    // quietly reprices every sealed product in the game.
    referenceSetSize: 70,
    weightDivisor: 10,
    chaseWeightDivisor: 100,
  },

  market: {
    climateNoiseSigma: 0.012,
    climateReversion: 0.008,
    climateFloor: 0.5,
    climateCeiling: 1.8,
    climateWriteThreshold: 0.02,
  },

  // NOT free to change. A stride decides how many RNG draws a run makes, so
  // moving one renumbers every later roll and invalidates every banked
  // measurement. It also rescales any `PerTick` rate multiplied by the stride.
  strides: {
    price: 4,
    sealed: 4,
    scalper: 4,
    channel: 4,
    grading: 4,
    art: 2,
    interest: 4,
    quarterly: 13,
    annual: 52,
  },

  // First-guess numbers, every one of them. This block landed with the growth
  // arc and has never been swept. The shape that matters: acquisition must be
  // driven by what the studio does, or the growth arc is scenery; and churn
  // must be recoverable, or one bad decade ends the run.
  audience: {
    // x1.5 over fifty years. The hobby grows; it does not multiply.
    populationGrowthPerTick: 0.00016,
    // Set against agingAdultsOut so the pyramid stays a pyramid, plus a little.
    birthRatePerTick: 0.00035,
    climateToPopulation: 0.6,
    // A cohort spans roughly 6, 7 and 40 years, so a share of 1/(years*52)
    // leaves it on schedule.
    agingKidsToTeens: 0.0032,
    agingTeensToAdults: 0.0027,
    agingAdultsOut: 0.00048,

    // Derived, not guessed: to convert a 24,000,000 population from a 1,200,000
    // start to 90% reached over 2,600 ticks needs 0.00087 per tick on the
    // unreached pool, and the typical drive below is about 1.09.
    acquisitionRate: 0.0008,
    // Endogenous-dominant with a small exogenous floor. A purely exogenous
    // curve makes every bot end the same size and the growth arc becomes
    // scenery; a purely endogenous one makes a bad early decade unrecoverable.
    acquisitionFloor: 0.15,
    acquisitionFromReach: 0.55,
    acquisitionFromBrand: 0.35,
    acquisitionFromGoodwill: 0.30,
    reachPerCapitaReference: 0.004,
    recentUnitsDecayPerTick: 0.02,

    engagedFloor: 0.35,
    engagedFromFreshness: 0.45,
    engagementRate: 0.05,
    freshnessWeeks: 78,
    winBackAdvantage: 3,

    churnRate: 0.004,
    churnGoodwillFloor: 0.45,

    entrySeedShare: 0.08,
  },

  world: {
    // 5 segments x 120,000 = 600,000 = attention.referenceAudience, so year-0
    // demand is exactly what it was before the audience system landed.
    segmentSize: 120_000,
    openingReachedMultiple: 2,
    // 40x headroom on engaged. That is what a 200,000-box print run needs,
    // because the demand pool scales linearly in engaged over referenceAudience.
    openingPopulationMultiple: 40,
    segmentAttention: 1,
    segmentFatigue: 0,
    segmentGoodwill: 0.5,
    startingScalpers: 500,
    startingResellers: 300,
    startingCollectors: 5_000,
    startingSpeculators: 800,
    startingClimate: 1,
    // Each region is a different shape of bet rather than a bigger version of
    // the same one. Japan is small, rich and opinionated; Latin America is
    // large, poor and cheap to enter; Europe is the safe middle. The taste
    // itself is rolled per seed, so these are the constants and the specifics
    // are what a run has to learn.
    regions: {
      reg_us: { marketSize: 1, wealth: 0.8, unlockCost: C(0), priceTolerance: 1, knowledge: 0.3 },
      reg_eu: { marketSize: 0.85, wealth: 0.75, unlockCost: C(600_000_00), priceTolerance: 0.95, knowledge: 0 },
      reg_jp: { marketSize: 0.55, wealth: 0.9, unlockCost: C(900_000_00), priceTolerance: 1.15, knowledge: 0 },
      reg_latam: { marketSize: 1.1, wealth: 0.35, unlockCost: C(250_000_00), priceTolerance: 0.6, knowledge: 0 },
    },
    productPreference: {
      pack: 1, boosterBox: 0.8, etb: 0.6, collectionBox: 0.5, tin: 0.4,
      premiumCollection: 0.3, bundle: 0.4, blister: 0.5, surpriseBox: 0.2,
    },
    segmentMixMin: 0.05,
    segmentMixMax: 0.3,
    tasteBiasMin: -0.3,
    tasteBiasMax: 0.3,
    rarityAppetiteMin: 0.5,
    rarityAppetiteMax: 1.5,
    productPreferenceJitterMin: 0.6,
    productPreferenceJitterMax: 1.4,
    // The span a studio-invented product form is rolled from. Set to the exact
    // span of the nine-form table above — `surpriseBox` 0.2 to `pack` 1.0 — so
    // inventing a form is a genuine gamble against the built-in distribution
    // rather than a buff or a trap. The old `?? 1` fallback scored an unknown
    // form 1.0, tying the BEST built-in and beating the other eight.
    customLinePreferenceMin: 0.2,
    customLinePreferenceMax: 1,
    homeTasteBias: { character: 0.2, location: -0.1, faction: 0.05, concept: -0.2, event: 0 },
    foreignChannelScale: 1,
  },

  // Two graders cover the market from day one. The third does not look at a
  // publisher nobody has heard of, and enters when brand standing clears
  // `grading.sideGraderBrandGate`.
  graders: {
    // The strict, expensive one. Fewer 10s, and the 10s it hands out carry the
    // reputation premium.
    grd_pinnacle: {
      reputation: 0.85, strictness: 1.15, marketShare: 0.55,
      tiers: {
        bulk: { price: C(12_00), turnaroundWeeks: 16 },
        standard: { price: C(30_00), turnaroundWeeks: 8 },
        express: { price: C(90_00), turnaroundWeeks: 3 },
      },
    },
    // Cheaper, softer, faster. Grades more copies and is trusted less for it.
    grd_cardsafe: {
      reputation: 0.6, strictness: 0.9, marketShare: 0.32,
      tiers: {
        bulk: { price: C(8_00), turnaroundWeeks: 12 },
        standard: { price: C(20_00), turnaroundWeeks: 6 },
        express: { price: C(60_00), turnaroundWeeks: 2 },
      },
    },
    grd_apex: {
      reputation: 0.7, strictness: 1, marketShare: 0.13,
      tiers: {
        standard: { price: C(25_00), turnaroundWeeks: 7 },
        express: { price: C(75_00), turnaroundWeeks: 2 },
      },
    },
  },
};

/** Applies dotted-path numeric overrides (e.g. "value.noiseSigma") to a clone. */
export function withOverrides(base: SimConfig, overrides: Record<string, number>): SimConfig {
  const clone: SimConfig = JSON.parse(JSON.stringify(base));
  for (const [path, value] of Object.entries(overrides)) {
    const parts = path.split('.');
    let node: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = node[parts[i]!];
      if (next === undefined) throw new Error(`unknown config path: ${path}`);
      node = next as Record<string, unknown>;
    }
    const last = parts[parts.length - 1]!;
    if (node[last] === undefined) throw new Error(`unknown config path: ${path}`);
    node[last] = value;
  }
  return clone;
}
