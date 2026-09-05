# Real-world baselines

Measured industry numbers, with sources, and what each one says about a knob.

Researched 2026-09-04. Every figure carries a confidence tag from its source:
**[documented]** from a filing, a press release or an API; **[reported]** from
trade press; **[community-estimated]** from forums and reconstruction;
**[inferred]** derived here from the numbers above it.

**Read the gaps as findings.** No publisher discloses a modern per-set print
run, a true cost per pack, a sell-through percentage, a per-set marketing
budget, or any measured link between preview hype and sales. Where the record is
empty this document says so rather than inventing a number.

Section 2 covers the price distribution and grading. It is pending — that
research is still running.

---

## 1. Where the model already matches reality

These are worth stating first, because they mean the model is anchored in the
right place and the mismatches below are local rather than systemic.

| Our value | Real-world | Verdict |
|---|---|---|
| `msrp 14000` = $140 per booster box | Pokemon booster box $143.64 MSRP | Almost exact [documented] |
| `packsPerUnit 24` | 24 packs per box is the industry default. Pokemon 36 and MTG Play Boosters 30 are the exceptions | Correct default [documented] |
| `channels.seeds.ch_dist.marginShare 0.38` | Publisher receives 35–40% of MSRP through distribution | Almost exact [reported] |
| `art.openingTurnaroundMin/Max` 2–8 weeks | 6–8 weeks brief-to-delivery is the freelance benchmark; a fast professional paints in 3 days | Right range [reported] |
| `scalperShareOfDrops` ≈ 25% measured | Bots take 10–50% of entries on a high-demand drop | In band [documented, from sneakers] |
| `finance.interestBase 0.14` | GTS Distribution charges 18% per annum from 21 days past terms | Right order [documented] |

**Sources:** [Wargamer](https://www.wargamer.com/pokemon-trading-card-game/cards-retail-price),
[Looney Labs](https://faq.looneylabs.com/question/811),
[GTS Terms of Sale](https://www.gtsdistribution.com/images/GTS_Terms-of-sale.pdf),
[CNBC on Nike SNKRS](https://www.cnbc.com/2023/06/01/why-bots-make-it-so-hard-to-buy-nikes.html).

---

## 2. The price distribution — measured, not reported

This section is the strongest evidence in the document. It is not trade
commentary: the price vector for **19 Magic sets and 8 Pokemon sets** was pulled
live from the Scryfall and pokemontcg.io APIs on 2026-09-04, and the statistics
were computed from it. **[measured]**

### The headline: our median card is 13x too expensive

| Metric | Measured reality | Ours | Verdict |
|---|---|---|---|
| **Median card price** | **$0.24 – $0.34** | **$4** | **13x too high** |
| Share of set under $1 | 64–92% (Magic 70–81%) | not measured | — |
| Share of set under $0.25 | 30–50% Magic, 67–77% Pokemon | — | — |
| Top 1% share of set value | 21–62%, median ~35% | 0.584 | high but in band |
| Top 10% share of set value | 66–95%, median ~78% | not measured | — |
| Chase / median ratio | 130x – 3,100x, central ~1,000x | ~1,125x | **excellent** |
| Gini | 0.72 – 0.98, central 0.85 | not measured | — |

The median is stable at $0.24–$0.34 across **15 Magic sets from 2020 to 2025**.
It is one of the most reliable numbers in the whole research.

**What this means.** Our `priceFloorCents` is 20 ($0.20) and our median lands at
$4 — twenty times the floor. In reality the median sits *almost on* the floor:
the median card in a real set is a bulk common worth about $0.30. The real
distribution is far more bottom-heavy than ours.

`HANDOFF.md`'s target of "medianCardPrice: a few dollars" is wrong against the
measured market. **The target should be about $0.30.**

Two honest caveats before you retune to it. Our sets are 70 cards against a real
280, so we have proportionally fewer bulk commons by construction. And our
`medianCardPrice` is taken over printings, not over a set's card list. Fix the
set size first, or compare like with like.

**[Round 3, 2026-09-05] Both caveats are closed.** Round 0 replaced the
whole-catalogue price vector with a per-set age-2 snapshot, and Round 3 took
sets to 280 cards. The measured age-2 median is $8.47, so the retune is Round
4's and the comparison is now like with like.

### The shape is not lognormal — this is a real finding

A lognormal was fitted by maximum likelihood and tested with Kolmogorov-Smirnov
across 13 sets. **The KS statistic exceeded the 5% critical value in every
single set, usually by a factor of 3.** Log price is right-skewed everywhere
(skew +1.0 to +2.1).

The upper tail is a **power law with index α between 1.6 and 2.7, central value
α ≈ 2.0**. An α near 2 means the mean is finite but the variance is not — which
is exactly why a set's total value is hostage to two to five cards.

**The recommended generative model** is a three-part mixture:

1. a soft floor near $0.10–$0.30 (not a spike — the most common single price
   holds only 3–6% of a set, and observed minima run $0.02–$0.07),
2. a lognormal body with log-SD 1.2–1.9,
3. a Pareto tail with α ≈ 1.8–2.2 over the top 5–10%.

Target a Gini of 0.85 and a top-10% value share of 78%.

**What we do now:** `value.chaseSigma 0.65` is a single lognormal roll, plus
`nostalgia` compounding to separate the top. That produces a power-law-ish
ladder — our decile steps widen correctly and our chase/median ratio is nearly
perfect — but it is not the measured three-part shape, and our body is far too
thin at the bottom.

### Rarity separates the tail, not the body

Measured per-rarity medians, Magic:

| Set | Common | Uncommon | Rare | Mythic |
|---|---|---|---|---|
| Bloomburrow | $0.20 | $0.27 | $1.23 | $5.87 |
| Foundations | $0.19 | $0.21 | $0.98 | $8.69 |
| Wilds of Eldraine | $0.22 | $0.27 | $0.41 | $5.18 |

**The median common and the median uncommon are almost the same price. More than
half of all rares are bulk.** Rarity does its work in the maximum, not the
median — Bloomburrow's rare maximum is $408 against a $1.23 median.

This vindicates a design decision already in the model: `value.scarcityExponent`
is deliberately shallow (0.45), and `rarity.weight` is kept out of price
entirely. Both are correct against the measurement.

### The age curve — decay, then recovery

| Age | Share under $1 | Median |
|---|---|---|
| 1 year | ~64% | $0.33 |
| 2–3 years | 70–81% | $0.24–$0.34 |
| 8 years | 90% | $0.22 |
| 12–15 years | 90–93% | $0.15–$0.20 |
| 21–28 years | **69–82%** | $0.24–$0.42 |
| 33 years (Alpha) | **0%** | **$63.06** |

**After about 20 years the bulk share stops rising and starts falling again.**
Scarcity and nostalgia lift a widening group of cards. Pre-1996 material is a
separate regime entirely — in Alpha, *zero* cards are under $1.

**This is exactly the curve `value.nostalgiaRatePerYear` and
`nostalgiaDecayPerYear` exist to produce**, and it is the best validation in the
research that the nostalgia gate is the right mechanism. Our
`affection.resurgenceMinAgeYears` is 5; the measured turn is nearer 20.

Note also: **a set's total value collapses**. Wilds of Eldraine at age 3 totals
$514; Bloomburrow at age 2 totals $4,146; Khans of Tarkir at age 12 totals $173.

### The bulk buylist spread — a mechanic we do not have

- Magic commons/uncommons: dealers pay **$3–$5 per 1,000 cards** = $0.003–$0.005 each.
- Pokemon: **$15–$25 per 1,000** = $0.015–$0.025 each.
- **The buylist floor is 5x to 60x below the TCGplayer market price.**

A card showing $0.20 on TCGplayer converts to $0.004 in a bulk sale. **Without
this spread a player can liquidate bulk at market price and break the economy.**
We have no buylist and no liquidity discount; `Printing.market.liquidity` is
declared and barely read.

### Surprise grails

Documented single-card moves: Cateran Summons 8.6x in one week; Booster Tutor
+460% while banned in every format; sleeper rares +1,566% and +1,623%; Living
Wish $3 to $13 after "more than a decade".

**Frequency is a genuine gap.** No study counts them. The trade press reports
1–5 spikes per week across ~27,000 Magic cards, implying roughly 0.5–1% of the
catalogue per year — treat that as weak. Our `surpriseGrail` target of 15–40%
*of runs* is a different unit and cannot be checked against it.

### Reprints cut ~27%, not 15%

- **Average value drop from a reprint: about 27%.**
- On announcement, the older printing typically falls **20–50%** immediately.
- Cards whose value came from scarcity fall far harder than cards with real demand.
- A crash from a *ban* is partly reversible; a crash from a *reprint* is not.

Our `value.reprintNostalgiaPenalty` is 0.85, a 15% haircut. The measured figure
is nearer 0.73.

---

## 2b. Grading — our gem rate is 5x too low

| Metric | Measured reality | Ours |
|---|---|---|
| **Gem rate, modern TCG** | **50–53%** | **9.6%** |
| Gem rate, all categories | 43–45% | — |
| Gem rate, vintage | ~1% or below | — |
| PSA 10 premium, modern | 2–5x raw | `gem10Premium` 4.7x ✅ |
| PSA 10 premium, vintage | 5–10x raw | — |
| Grading threshold | ~$50 raw at $100 all-in cost | `feeWorthMultiple` 5 |

(GemRate 2025, via cllct and Yahoo Sports) **[documented]**

**The gem rate is the biggest single mismatch in the grading layer.** Ours is
9.6%; modern TCG measures 50%. Our `grading.conditionMean 9` with
`conditionSigma 0.7` against a `gradeCuts['10']` of 9.75 puts a 10 at roughly
the 14th percentile. Reality puts it at the median.

**But do not just raise it.** The research is emphatic that the gem rate is not
a constant — it is a **print-quality and era attribute**, and the spread is
**80 to 1**:

| Card | Gem rate |
|---|---|
| McDonald's Pikachu, Japanese promo (2025) | **88%** |
| Umbreon EX SAR, Japanese (2024) | 87% |
| Charizard V, Champion's Path promo (2020) | 56% |
| Charizard ex SIR, 151 (2023) | 29% |
| Ancient Mew (2000) | 5% |
| **Charizard Holo, Base Set (1999)** | **1%** |

That 80:1 spread is what `printing.qualityGradeShift` and
`grading.agePenaltyPerYear` exist to produce. Our shifts run -0.15 to +0.2 on
the condition mean — far too narrow to span 1% to 88%.

**Other grading numbers:**

- **26.8 million cards graded in 2025**, up 32% from 20 million in 2024. TCG was 16.8 million of that, up 95% year over year — **TCG has overtaken sports**.
- PSA holds **72% market share**; CGC 17%. Our `graders` roster is 0.55 / 0.32 / 0.13 — the right shape.
- PSA fees 2026: Value Bulk $24.99 (95 days) to Walk Through $599 (7 days). Ours: $8–$90. **Our fees are 3x too low**, though our card prices are also lower.
- **All-in PSA cost is about $100 per card** once shipping and insurance are added. The community threshold is a **$50 raw value**.
- **Cards above $100 raw gain 120–300% when graded; cards below $10 raw gain under 70%, which does not cover the fee.** This is the single most useful rule for our `feeWorthMultiple`.
- **"For maybe one card in twenty, the maths works for grading"** — about 5% of held cards. Our `gradedPrintingShare` is 4.6% for `conservative`. **Excellent match.**
- PSA 10 populations run from **~122 copies** (1st Edition Base Charizard) to **273,159** (Japanese McDonald's Pikachu). That is 3–4 orders of magnitude; our `popScarcityReference` of 8 is calibrated to our own tiny pop counts, not to these.
- Pop count suppresses price, but **no public regression of price against population exists**. The relationship is described everywhere and measured nowhere.

**Source conflict the research adjudicated for us:** one site reports an 8.88%
PSA 10 rate. GemRate, the primary vendor, reports 43% overall and 50% for TCG.
**Use GemRate.**

---

## 2c. Sealed product

- A modern booster box returns **40–80% of its retail price in singles** — typically 60–80%, and 40–70% for Pokemon. **Most modern boxes have negative expected value at MSRP.**
- Buying the specific single beats opening packs by about **4x**.
- Out-of-print boxes appreciate **10–30% per year**; vintage sealed averaged 18–24% annualised since 2010, **dropping to 13–17% after carrying costs**.
- Base Set 1st Edition booster box: ~$118 retail in 1999 → $408,000 in January 2021 (~45% CAGR) → **$256,200 in August 2025**, a 37% fall. **Sealed is not a monotonic asset.**

**What it says about us.** `sealed.contentsWeight 0.6` and
`actors.ripBreakEven 0.5` encode "singles are worth less than the box", which
matches the 60–80% finding well. The carrying-cost drag of 5–7 percentage points
is something we model through `storagePerUnitPerTick` — but only for the
publisher, not for collectors holding sealed.

---

## 2d. Market structure

- The **secondary market is 53.6% of the total TCG market** — larger than primary sales. (Grand View Research, 2025)
- Marketplace fees land at **13–14%** on both TCGplayer and eBay.
- Global TCG market estimates run **$7.4bn to $18.5bn** for 2025. The consultancies disagree by a factor of 2.5 and rarely publish method — **treat these as weak**.
- **No public data exists on average days-on-market or sell-through rate for a trading card.** Genuine gap.

---

## 3. Print runs and scale

### The one usable print-run table

Flesh and Blood, by Legend Story Studios, is the only mid-size publisher with
published per-set print runs. In **booster boxes**:

| Band | Boxes per set |
|---|---|
| Small | 16,700 – 40,000 |
| Mid | 120,000 – 180,000 |
| Large, for a non-Pokemon publisher | 200,000 – 250,000 |

([The Realistic Collector, 2022](https://therealisticcollector.com/2022/10/18/flesh-and-blood-tcg-complete-print-run-numbers-and-pull-rates/)) [reported]

**What it says about us.** Our bots print `units: 8000` booster boxes per set.
That is **half the smallest real first-edition print run** in the table. Our
`attention.referenceRunUnits` is 5,000.

This is not necessarily wrong — the sim starts a studio at $500,000, which is
far smaller than Legend Story Studios at launch — but it means our whole print
run scale sits below the real industry floor. If you want the numbers to read as
a real publisher, the honest move is to raise starting cash and the run sizes
together, not to raise the runs alone.

### The absolute bounds

- Pokemon printed **10.2 billion cards** in FY2024-25 and 11.9 billion in FY2023-24, from a cumulative 85 billion. ([PokeBeach](https://www.pokebeach.com/2025/05/pokemon-tcg-printed-10-2-billion-cards-in-2024-lower-than-the-previous-year)) [documented]
- Magic's 1993-94 growth was 100x in 12 months: Alpha 2.6 million cards to Fallen Empires 312–340 million. ([MTG Wiki](https://mtg.wiki/page/Fallen_Empires)) [reported]
- **No modern per-set print run is public for any game.** Genuine gap.

### Set size — we are 5x small

| Measure | Real | Ours |
|---|---|---|
| Card names per premier set | ~280 | `cardsPerSet: 280` (Round 3; was 70) |
| Unique illustrations per set | ~380 | 70 |
| Distinct artists per set | ~170 | `art.maxRosterSize: 170` (Round 3; was 24) |

Counted directly from the Scryfall API across Bloomburrow, Duskmourn, Karlov
Manor and Tarkir; and from pokemontcg.io, where a Pokemon set runs ~207 cards
across ~102 artists. ([Scryfall](https://scryfall.com/docs/api), [pokemontcg.io](https://pokemontcg.io/)) [documented]

**Verdict.** A 70-card set is a quarter of a real premier set, and a 24-artist
roster is a seventh of a real one. This is a defensible simplification — it
keeps the sim fast — but it means `chains.maxCountedLinks`, `creators.affinityTries`
and anything else counted per set is being tuned against a small set.

**[Round 3, 2026-09-05] Done: 280 cards and a 170-artist ceiling.** The cost
landed on the art budget rather than on the clock. A 280-card set commissions
four times the illustrations, and at 17,000 boxes a year-1 studio cannot carry
it — art reaches 43% of the print bill on a `conservative` seed that dies at
year 9. `diff.botsAlwaysSurvive` fell from 7 to 1 because of it. The set size is
right; the artist rates are the thing that is wrong (see finding 3 below).

---

## 4. Manufacturing cost

**No publisher discloses cost per pack or per card.** Only commercial printer
quotes exist, and those are far above true cost at TCG volume.

- Small-printer quotes: **$0.02–$0.03 per card** at 1,000-deck volume, including packaging. A 15-card pack is therefore $0.30–$0.45 to make. ([WJPC](https://wjplayingcard.com/game-card-printing-costs/), [PrintNinja](https://printninja.com/printing-resource-center/printing-options/custom-game-printing/sample-pricing/)) [reported]
- The hard constraint on the true figure: **Wizards of the Coast ran a 46.0% operating margin in 2025**, on $2,186.9M revenue and $1,007M operating profit. ([Hasbro FY2025 10-K](https://www.sec.gov/Archives/edgar/data/46080/000004608026000011/has-20251228.htm)) [documented]
- Konami states gross margin on physical Yu-Gi-Oh cards exceeds 50%. [reported]

**What it says about us.** `printing.unitCost.standard` is 140 cents per pack,
times `cogsCoefficient 0.55` = $0.77 effective. That is roughly **2x the
small-printer quote** and far above true volume cost. Our COGS per box is
$18.48 against a $140 MSRP, so 13% of retail — but the publisher only receives
38% of retail, making COGS about 35% of publisher revenue. That is in the right
region given a 46% operating margin ceiling, so **the number is defensible even
though it is high per pack**.

**Recommendation from the research:** derive cost per pack backwards from the
46% operating margin plus the 35–40% publisher share, rather than from printer
quotes. Do not treat the printer quotes as the target.

### The foil bottleneck — a mechanic we do not have

A Pokemon press runs **220,000 standard sheets per day against 15,000
holographic sheets per day**, a 14.7:1 ratio. One press costs about $8.5 million
and produces about 26.62 million card positions per day.
([Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Draft:Production_lifecycle_of_Pok%C3%A9mon_Trading_Card_Game_cards)) [reported]

This is the only hard evidence found for **why chase cards stay scarce**. Our
model gets scarcity purely from `rarity.pull`, with no production constraint. A
foil queue would be a second, physical reason.

---

## 5. Channels — the strongest data in the research

### The margin ladder

Every source agrees on the shape:

```
publisher sells at 35-40% of MSRP
distributor sells at  50-55% of MSRP
retailer   sells at 100% of MSRP
```

([Looney Labs](https://faq.looneylabs.com/question/811), [RPGnet](https://www.rpg.net/columns/businessofgamingretail/businessofgamingretail11.phtml)) [reported]

Concretely for Pokemon: a booster box is **$80–$90 wholesale against $143.64
MSRP**; a pack is $2.20–$2.50 wholesale against $4.49.
([Digital Media Vending](https://www.digitalmediavending.com/pokemon-card-wholesale-sourcing-distributor-guide)) [reported]

**Our `marginShare` values against this:** distributor 0.38 ✅, bigbox 0.30,
online 0.50, lgs 0.55, direct 1.0. The ladder is right.

### The margin trap we do not model

The nominal LGS margin is 44%. **The realised margin after competitive
discounting collapses to single digits** — under $0.25 profit per pack when a
store discounts a box to move volume, under $0.40 selling packs singly.
([MTG Salvation retailer thread](https://www.mtgsalvation.com/forums/magic-fundamentals/magic-general/322043-how-much-do-stores-retailers-pay-for-boxes)) [community-estimated]

We model street price floating with `markupSensitivity` and `discountFloor`, but
not the competitive pressure that drives it. Our `channels.traits.lgs.discountFloor`
is 0.1 — the LGS barely discounts. Reality says it discounts hard.

### Big box carries a hidden tax

- Chargebacks and compliance deductions take **1–5% of invoice volume**; individual vendors lose 2–5% of gross revenue.
- Established brands budget **15–25% of gross sales** for trade allowances, slotting fees and promotional support.

([RetailerHub](https://www.retailerhub.ai/guides/retail-chargebacks)) [reported]

**What it says about us.** `bigbox.marginShare 0.30` gives the publisher 30% and
models no deductions. Net of real chargebacks and allowances, big box can be
*worse* than distribution despite the larger order. We currently make it
strictly better on reach with only `strainSensitivity 1.1` as the cost.

### Online take rates

- TCGplayer: about **13.5% all-in** (10.75% commission + 2.5% + $0.30). ([TCGplayer](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees)) [documented]
- Amazon: 15% referral, **25–40% blended with FBA**. ([Futureproof](https://www.runfutureproof.com/amazon-fees/toys)) [documented]

### Distribution is one-way

GTS Distribution's published terms: **no returns** except damage reported within
24 hours; 20% restocking fee on authorised returns; 18% per annum interest from
21 days past terms; free freight over $750; and an explicit right to "allocate
limited availability products among its customers at any time for any reason."
([GTS Terms of Sale](https://www.gtsdistribution.com/images/GTS_Terms-of-sale.pdf)) [documented]

**Inventory risk passes down the chain and never comes back.** Our model already
gets this right — stock allocated to a channel is stranded there.

### Scale

About **3,000 independent hobby retailers** in North America; the Wizards Play
Network covers **6,000–9,000 stores worldwide**. ([BoardGameWire](https://boardgamewire.com/index.php/2025/05/19/universal-distribution-completes-alliance-game-distributors-buyout-after-chaotic-bankruptcy-auction/), [WPN](https://wpn.wizards.com/en)) [reported]

---

## 6. The Fallen Empires loop — a mechanic worth building

This is the best-evidenced dynamic in the whole research, documented end to end.

1. Magic could not stay in stock for its first ~18 months. Alpha, Beta and Unlimited each sold out.
2. Retailers, tired of receiving small fractions of their orders, **began ordering far more than they wanted**, expecting to be cut down.
3. In November 1994 Wizards **filled every order in full**. Stores that expected one case received ten and could not pay.
4. Wizards paid to warehouse the unsold product, and had already scaled back Revised — which was selling — to make room.
5. Fallen Empires sealed product remains cheap three decades later.

([MTGGoldfish](https://www.mtggoldfish.com/articles/magic-history-fallen-empires-strikes-back), [MTG Wiki](https://mtg.wiki/page/Fallen_Empires)) [reported]

**The loop to model:** under-supply raises an `orderInflationFactor`; inflated
orders make the demand signal useless; printing to the inflated signal destroys
`retailerTrust` and creates unsellable stock. We have channel souring, but it is
driven by over-allocation, not by a corrupted demand signal. This would make the
blind print-run bet genuinely hard in a new way.

Related: **Chronicles (1995)** increased circulation of the cards it reprinted by
an estimated 10–20x and collapsed their value — a $20 Killer Bees fell to about
$1. Wizards created the Reserved List in response. Our
`value.reprintNostalgiaPenalty` is 0.85, a 15% haircut. Reality says a bad
reprint is an order-of-magnitude event. ([MTGPrice](https://blog.mtgprice.com/2016/03/03/how-chronicles-burned-wizards/)) [community-estimated]

---

## 7. Warehousing — our storage cost is 4-5x too low

- US average: **$20.17 per pallet per month** in 2025; most providers charge $18–$25.
- Volume: 500+ pallets negotiates to about $14; under 50 pallets pays about $22.50.
- **Long-term surcharges of $5–$15 per pallet per month start at 90 or 180 days.**

([Olimp Warehousing](https://olimpwarehousing.com/pallet-storage-cost-per-month-usa/)) [reported]

**What it says about us.** `finance.storagePerUnitPerTick` is 1 cent per unit
per week. At roughly 100 booster boxes to a pallet, $20.17 per pallet per month
is about **4.7 cents per unit per week**. We are 4-5x under.

We also have **no ageing cliff**. Real storage roughly doubles per pallet after
six months, which is precisely the mechanic that punishes an overprint. Our
storage cost is linear in units and flat in time.

```
npm run sim -- --seeds=20 --years=30 --bot=all --set=finance.storagePerUnitPerTick=5
```

Expect overprint deaths to rise sharply. `allIn` and `bigBets` already die of it.

---

## 8. Artists — our rates are an order of magnitude too low

| Tier | Real per-card fee | Ours |
|---|---|---|
| Newcomer / mid-tier | $400–$600 | `openingRateMin` $75 |
| Established | $1,000–$1,300 | `openingRateMax` $450 |
| Top negotiator | $1,000–$2,500 | — |
| **Roster newcomers** | — | **`newcomerRateMin/Max` $0.50–$3.00** |

A Magic card illustration paid **$1,000 in 1996 and about $1,250 in 2024** —
flat fee, work for hire, no royalty. The real fee fell about 50% in purchasing
power over 27 years.
([Draftsim / Donato Giancola](https://draftsim.com/mtg-artist-policy-donato-giancola/), [Muddy Colors](https://muddycolors.com/2024/11/pricing-aftermarket-and-secondary-market-artist-compensation-for-magic/)) [documented]

**Two findings here.** First, even our *opening* roster tops out at $450, below
the real newcomer floor. Second, the `newcomerRate` defect (see
`02-hardcoded.md` §5) puts drifted-in artists at a hundredth of that.

**Fame does not raise the fee.** Giancola is among the most famous Magic
illustrators and his per-card rate did not move for 27 years. Our
`art.rateGrowthPerReputation 2.5` makes reputation drag the rate up by up to
250%. **That is the opposite of how the real market works.**

Where fame actually pays is the aftermarket: a finished Magic original resells
for **$2,000–$10,000**, sketches $300–$800, with records at $350,000. For a
mid-career illustrator the aftermarket is **2–8x the commission fee**.
([Original Magic Art](https://www.originalmagicart.store/blogs/oma-blog/the-price-of-original-magic-art-from-karlov-manor)) [documented]

**The design opportunity.** Universes Beyond contracts prohibit selling original
art, and a senior illustrator publicly stopped working for Wizards over it. That
is a real, documented mechanic: *cheap contracts that cost you talent*. Our
`art.exclusiveWeeklyMultiple` models locking an artist down as a cash cost only.
With rivals cut there is nobody to lock them away from, so exclusivity currently
buys a discount and nothing else — this would give it a real downside instead.

---

## 9. Marketing — the reveal window is far too long and too expensive

| Measure | Real | Ours |
|---|---|---|
| Preview window | **3 weeks** | `hype.defaultLeadWeeks` 12; `hypeBuilder` uses 16 |
| Prerelease timing | 1 week before release | — |
| Measured media spend | **under $750,000/year, company-wide** | `hypeBuilder` spends $50,000 *per set* |

A Magic preview season runs about 3 weeks from debut stream to tabletop release,
and the full ~280 card names reach the public inside it.
([Wizards, Bloomburrow 2024](https://magic.wizards.com/en/news/feature/where-to-find-bloomburrow-previews)) [documented]

Wizards spent about **$547,000 on measured media in 2018** and under $750,000
per year in recent tracking — company-wide, against $1.7 billion of Magic
revenue in 2025. ([GeekNative citing Winmo](https://www.geeknative.com/62589/wizards-coast-spent-500000-marketing-last-year-appoints-martin-agency-spend/)) [reported]

**What it says about us.** Real TCG marketing is **previews, creators and store
events — not paid media**. Our `hype.marketingReference` of $100,000 and
`marketingHypeGain 1.2` make cash-bought hype a first-class lever. Against
`conservative`'s ~$442k annual revenue, `hypeBuilder`'s $50k per set is over 10%
of revenue on media. The real figure is about 0.04%.

Either our marketing lever should be much weaker per dollar, or much cheaper —
and prereleases should carry more of the load. Note that **prereleases may be a
revenue line, not a cost**: stores buy the kits and keep the entry fees. Wizards
sold about **300,000 prerelease kits per set** at $30–$40 per player across
6,000–9,000 stores. Our `hype.prereleaseCostPerScale` charges the publisher
$25,000 per point of scale.

**The largest modelling assumption in the game:** no public analysis links
preview reception to set sales. Our `signalCorrelation` target has no real-world
anchor and cannot get one. It is a design decision, not a research question.

Two documented cases show the link is weak in both directions. *March of the
Machine: The Aftermath* previewed above average and crashed ~30% below MSRP.
The *30th Anniversary Edition* at $999 drew furious community reaction, with
prominent creators telling viewers not to buy — and sold out in about 30 minutes.

---

## 10. Drops and scalpers — we match reality well

| Measure | Real | Ours |
|---|---|---|
| Reseller share of a hot drop | 10–50% of entries | ~25% measured |
| Resale premium, top product | 3–4x MSRP | `breakEvenPremium 0.15` |
| Premium decay on restock | ~28% average drop | modelled via `dumpHeatDrag` |
| Sell-out time | minutes to 3 hours | modelled as a single queue pass |

Prismatic Evolutions ETB: $49.99 MSRP, $160–$220 secondary, held for months.
Journey Together ETBs fell $150 → $85 when restocks landed; the average tracked
drop was 28%. ([PriceCharting](https://www.pricecharting.com/game/pokemon-prismatic-evolutions/elite-trainer-box), [Card Chill](https://cardchill.com/article/pokemon-tcg-sealed-products-price-drop-2025-great-news-for-collectors-as-scalpers-get-crushed)) [reported]

**The lesson the research is blunt about: supply is the only tool that works.**
Nike claims up to 98% bot-block success and bots still take up to half the
entries. Pokemon prices fell only when a very large reprint arrived. Our model
already says this — `queueCapacity` and print size are the levers, and
`goodwillPerShortage` stops "print nothing" being a free win.

**Goodwill damage is real and documented.** Target pulled all trading cards from
every US store in May 2021 after an assault outside a store. The Van Gogh Museum
withdrew a Pikachu promo after opening-day crowd trouble. Our
`drops.goodwillPerScalperDrop 0.014` models exactly this.

---

## 11. Creators — our audience ceiling is 10x too low

| Measure | Real | Ours |
|---|---|---|
| Largest channels | PokeRev 3.3M, UnlistedLeaf 2.5M, Tolarian 1.2M | `audienceBase` 20,000 × 1.6^U(0,6) → max ~335,000 |
| The tail | 60–100 notable channels, most under 100,000 | `rosterSize: 24` (Round 3; was 8) |

([Kotaku](https://kotaku.com/pokemon-tcg-151-youtube-pokerev-unlistedleaf-pokichloe-1850924313)) [reported]

Our long-tail *shape* is right; the ceiling is about 10x short. Raising
`creators.audienceExponentMax` from 6 to about 11 would put the top channel near
3.3 million while keeping the shape. **[Round 3, 2026-09-05] Raised to 11, and
`creators.rosterSize` from 8 to 24.**

**How creators are actually paid:** preview access and free product, not fees.
Large creators mostly buy their own product on camera — Logan Paul spent about
$2 million. One documented single-video price spike: Unfulfilled Desires rose
about **900%** after The Command Zone featured it, because the supply was thin
and fixed. Our `creators.heatPerCoverage 0.35` with `maxCoverageHeat 2.5` caps
the effect at 2.5x. Reality's tail is far longer on thin supply.

**No study measures a creator video's effect on a publisher's sell-through of
new sealed product.** Genuine gap.

---

## 12. Licensing — our collab model is inverted

**Crossover sets outsell in-house sets decisively.** The three best-selling
Magic sets of all time are all Universes Beyond crossovers. The revenue-to-$200M
series is stark:

| Set | Time to $200M |
|---|---|
| Modern Horizons (in-house) | ~2 years |
| The Lord of the Rings | 6–7 months |
| FINAL FANTASY | **1 day** |

([Hasbro CEO via Kotaku](https://kotaku.com/final-fantasy-mtg-magic-gathering-vivi-stock-1851786817), [Wargamer](https://www.wargamer.com/magic-the-gathering/best-selling-final-fantasy-sales)) [documented]

Universes Beyond has generated close to $2 billion since 2021, and **half of all
future Magic premier sets will be crossovers**. [documented]

**Our `licensor` bot ends on $3.8M against `conservative`'s $5.8M.** We have the
sign backwards: in our model licensing is a net loss, and in reality it is the
single biggest growth engine in the industry.

**But the tension is real and documented.** Hasbro's Q4 2023 operating profit
fell 2% "due to higher royalty costs associated with Universes Beyond" — a
licensed set must outsell an in-house set to reach the same profit. Wizards
prices the licence in: collector boosters cost more for licensed sets.

**Structure to copy:** licence fees are **5–15% of net sales plus an advance and
a minimum guarantee**, not a flat fee. Our `collabs.feeMin/feeMax` are flat
$120,000–$900,000. A royalty scales with success and a flat fee does not, which
changes the whole risk shape of the decision.

**Lead time is years:** a Universes Beyond partnership runs 5–7 years; the Final
Fantasy set took over 4 years from first contact. Our
`collabs.offerWindowWeeks` is 26.

**On brand equity — the criticism is real but unmeasured.** Wizards' own research
says crossover buyers are mostly enfranchised players, with lapsed players
second. No brand damage has been measured; player counts and revenue rose. Our
`collabs.exposureShare 0.3` assumes a licensed set builds only 30% of the usual
IP equity. That is a design choice, not a measured effect — but Hasbro cutting
its 2026 Magic forecast to single-digit growth suggests the crossover premium
does decay.

---

## The ten numbers to tune against first

Ordered by how far our value sits from the measured one.

1. **The median card in a modern set is $0.24–$0.34.** Ours is $4 — about 13x high, and `HANDOFF.md`'s "a few dollars" target is wrong against the market. Stable across 15 Magic sets, 2020–2025. [measured]
2. **The modern TCG gem rate is 50%, and it spans 1% to 88% by print quality and era.** Ours is 9.6%, from shifts far too narrow to span that. [documented]
3. **A card illustration pays $400–$2,500 flat, no royalty, and the fee does not rise with fame.** Ours is $75–$450, rising up to 250% with reputation — the opposite direction. [documented]
4. **Warehousing is $20.17/pallet/month ≈ 4.7c/unit/week, with a surcharge cliff at 90–180 days.** Ours is 1c/unit/week and flat in time. [reported]
5. **Crossovers outsell in-house sets by an order of magnitude, at 5–15% of net sales in royalties.** Our `licensor` bot loses money against `conservative`. The sign is inverted. [documented]
6. **A premier set is ~280 cards, ~380 illustrations, ~170 artists.** Ours is 280 cards and a 170-artist ceiling since Round 3. [measured]
7. **Preview window is 3 weeks; measured media is under $750k/year company-wide against $1.7bn revenue.** Ours is 12–16 weeks and $50k per set. [documented]
8. **A mid-size print run is 16,700–248,000 booster boxes.** Ours is 8,000 — below the real industry floor. [reported]
9. **Publisher receives 35–40% of MSRP.** Our distributor `marginShare 0.38` already matches. Keep it. [reported]
10. **The Fallen Empires loop:** shortage teaches retailers to inflate orders; filling inflated orders destroys the channel. Not modelled, and the best-evidenced dynamic in the research. [reported]

### What we already get right — do not "fix" these

- Chase-to-median ratio ~1,125x against a measured central value of ~1,000x.
- `gem10Premium` 4.7x against a measured 2–5x for modern cards.
- `gradedPrintingShare` 4.6% against "about one card in twenty".
- Distributor `marginShare` 0.38 against a measured 35–40%.
- `msrp` $140 per box against Pokemon's $143.64.
- `packsPerUnit` 24, the industry default.
- Scalper share of a drop ~25% against a measured 10–50%.
- Shallow `scarcityExponent` and `rarity.weight` kept out of price — both vindicated by the per-rarity medians.
- The `graders` market-share split 0.55/0.32/0.13 against PSA 72% / CGC 17%.

---

## Open design questions the research cannot settle

1. **Which era is this game?** The 1994–96 numbers describe a market where overprinting kills you. The 2021–26 numbers describe one where under-supply is permanent. These are opposite regimes and need different constants. Our model is currently the first.
2. **What scale is the studio?** Stonemaier at $25M with 8 staff, Legend Story Studios at 16k–250k boxes, Wizards at $2.19B, and Pokemon at $3.34B are four different games with the same channel model and print runs three orders of magnitude apart.
3. **Should hype predict sales at all?** No public analysis exists in either direction, and two documented cases point opposite ways. `hype.signalNoiseSigma` is a pure design choice.
4. **Should prereleases be a cost or a revenue line?** Stores buy the kits and keep entry fees, so the publisher's net cost may be negative.
5. **Nominal or normalised prices?** The measured figures embed 2026 dollars and the current Pokemon boom. Reproducing a $0.30 median and an $800 chase is one choice; a median of 1.0 and a chase of 1000 is another.
6. **Should serialised inserts be a separate mechanism?** The measurement shows two regimes: sets with a serialised ultra-chase card push the top-1% share from 35% to 94% and the chase/median ratio to 14,000x. We model one regime.
7. **Should the 50-year horizon reproduce the Alpha regime?** A 33-year-old set measures zero bulk, a $63 median and a Gini of 0.685 — qualitatively unlike every modern set. Our runs are 50 years long, so the model will reach that age.

---

## Two things this research adds that we do not model at all

**The bulk buylist spread.** A card at $0.20 market sells for $0.004 in bulk —
5x to 60x below list. Without it, a player can liquidate a warehouse of commons
at market price. `Printing.market.liquidity` is declared and barely read; this is
what it is for.

**The foil production bottleneck.** 220,000 standard sheets per day against
15,000 holographic. It is the only hard evidence for *why* chase cards stay
scarce, and it would give `printing` a physical constraint rather than a purely
statistical one.
