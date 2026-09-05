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
    openingHeat: 1.6,
    openingLiquidity: 0.5,
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
  },

  printing: {
    // What a print run actually costs, against the list unit cost.
    cogsCoefficient: 0.55,
    errorIncidenceMin: 0.0001,
    errorIncidenceMax: 0.004,
    qualityGradeShift: { budget: -0.15, standard: 0, premium: 0.12, archival: 0.2 },
    errorRate: { budget: 0.02, standard: 0.008, premium: 0.002, archival: 0.0005 },
    unitCost: { budget: C(80), standard: C(140), premium: C(240), archival: C(400) },
    errorDiscoveryChance: 0.01,
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
    /** A rising reputation drags the rate up behind it. */
    rateGrowthPerReputation: 2.5,
    rateAdjustRate: 0.02,
    // $75 to $450 for an unproven newcomer. This used to be 50 to 300 *cents*,
    // which made a 25-year art budget about $7,800 against a $22M net worth —
    // art was a rounding error rather than a budget line.
    openingRateMin: C(7_500),
    openingRateMax: C(45_000),
    // NOTE: the engine's roster drift still mints newcomers at the old cents
    // range. It is preserved here so this refactor changes no behaviour. See
    // docs/tuning/02-hardcoded.md, "Inconsistencies".
    newcomerRateMin: C(50),
    newcomerRateMax: C(300),
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
    // went from 100% survival to 0%. At $1,000 the base is survivable on its
    // own and the per-channel line is what makes a large studio expensive,
    // which is the right way round: reach is what costs money to run.
    weeklyOverheadBase: C(1_000_00),
    weeklyOverheadPerChannel: C(250_00),
    /** Per region past the home market. An office abroad is a standing cost. */
    weeklyOverheadPerRegion: C(600_00),
    /**
     * Warehousing, per unsold unit per week. Deliberately small: it is nothing
     * to a publisher holding a normal tail of stock and ruinous to one holding
     * a million units, which is the difference between capital locked up and
     * capital bleeding. Overprint death is unreachable without it.
     */
    // One cent per unit per week. A publisher holding a normal 20,000-unit
    // tail pays about $10k a year and never notices; one holding 1.2 million
    // units pays about $624k a year against revenue of $442k and does not
    // survive it. That gap is the whole design of this line.
    storagePerUnitPerTick: C(1),
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
    scalperReach: 0.5,
    scalperSpeed: 3,
    breakEvenPremium: 0.15,
    baseResaleRate: 0.04,
    holdLimitWeeks: 26,
    // Units a scalper has to be flipping per stride to count as fully
    // employed. At 1 no realistic drop cadence could ever supply that, so
    // crowding was near zero for everybody, the trade never cleared its
    // hurdle, and the population sat on its floor taking 11% of a drop. At
    // 0.3 it settles near 900, cycles about every six years, and scalpers
    // take about a quarter of the units — a real force at the queue with
    // collectors still taking the majority. Below ~0.1 it runs away toward
    // `maxScalpers` and stops cycling at all.
    unitsPerScalperReference: 0.3,
    resaleUrgency: 0.5,
    populationGrowth: 0.06,
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
    defaultLeadWeeks: 12,
    defaultCadenceWeeks: 2,
    revealHypePerCard: 0.05,
    revealHalfLife: 0.8,
    revealAttentionCost: 0.004,
    marketingReference: C(100_000_00),
    // Swept over 20 seeds x 30 years at equal spend against a prerelease. At
    // 0.35 marketing was strictly dominated — the same hype cost twice what
    // the LGS route charged for it, so there was never a reason to buy it. At
    // 1.2 it is competitive and still the more expensive way to the same
    // number, which is the right relationship: attention bought with cash
    // should cost more than attention earned through the stores.
    marketingHypeGain: 1.2,
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
    // as 1/sqrt(previews), so 2.0 puts a default three-preview window at
    // r = 0.55 and a sixteen-preview campaign at r = 0.86.
    signalNoiseSigma: 2.0,
    heatFromHype: 0.8,
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
    // On the familiar 1-10 scale. A standard-quality copy averages a 9, so a
    // 10 is a tail event rather than the expected outcome of submitting.
    conditionMean: 9,
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
  },

  // First-guess numbers, wired for behaviour rather than swept. Each population
  // has to be able to move and to come back: one that only grows is a price
  // multiplier with extra steps.
  actors: {
    collectorShareOfAudience: 0.02,
    collectorConvergence: 0.08,
    minCollectors: 500,
    // Collectors per head of audience at which holding reaches its ceiling.
    // At 0.03 a healthy run sits exactly on it and every seed reports the
    // ceiling, which is a constant wearing a population's clothes.
    collectorDensityReference: 0.09,
    // A third of opened copies off the market at the floor is not a guess about
    // this game — it is roughly what any collectible market looks like, and it
    // is the term that makes a loyal audience worth money.
    collectorHoldFloor: 0.2,
    collectorHoldCeiling: 0.5,

    resellerReference: 300,
    resellerConvergence: 0.12,
    minResellers: 20,
    maxResellers: 20_000,
    // Singles-to-sealed value ratio at which ripping stops paying. Measured,
    // the weighted ratio runs 0.7-1.0, so a break-even of exactly 1 sits at the
    // top of the range and holds the population on its floor for every strategy
    // except a flooder. Below 1 is also the honest number: a streamer earns on
    // the stream and on the retail spread, not only on the pull.
    ripBreakEven: 0.5,
    ripPerReseller: 0.5,

    speculatorReference: 800,
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
    /** Licence fee, as a share of a typical print run's cost. */
    feeMin: C(120_000_00),
    feeMax: C(900_000_00),
    /** Demand multiplier per point of weighted reach bonus. */
    reachToDemand: 1.2,
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
  chains: {
    desirePerLink: 6,
    maxCountedLinks: 5,
    spansSetsBonus: 1.6,
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

  history: {
    weeklyRetentionTicks: 520,
    writeThreshold: 0.03,
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
    startingIndex: 100,
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
