# Audience demand

**Status: ACCEPTED by AJ.** Written 2026-11-11. The decisions behind it are A1 to A7 in `docs/decisions.md`, plus R4, R8, R11, R12, S8, S9, M1 to M5, D4, D6, D9, D10, and D14. Section 10 records AJ's answers.

Audience demand is the first part of the conditions that a set enters. It answers three questions:

1. How large is each audience, and how much of it knows the studio? (Section 2.)
2. What changes the audiences from week to week? (Section 3.)
3. When does each audience buy a set, and how much? (Sections 4 and 5.)

The roster design already defines the eleven audiences, what each one likes, and each character's appeal and awareness (`roster.md`, sections 3 and 4). This document adds the market around them.

## 1. What audience demand must do

- Make the world large and the studio small at the start (A1, D6).
- Make the release date a decision: the season, the hobby heat, and the time since the last release all change the result (A2).
- Make the set's design decide which audiences buy, and when (A4).
- Show the player more of the market as the studio grows (A3).
- Give the release report causes with signed numbers, for example "Holiday season: +40% from parents" (`research.md`, section 7).

## 2. The market (A1)

### 2.1 The fields of an audience

| Field | Values | Reader | Screen |
|---|---|---|---|
| `size` | People in the world who buy TCG products in this audience | Demand | Market screen (upgrade) |
| `spend` | Dollars that one person spends on TCG products in one year | Demand | Market screen (upgrade) |
| `reach` | The share of the audience that knows the studio, 0 to 1. Starts near 0 (section 2.3) | Demand | Market screen (upgrade) |
| `goodwill` | The audience's feeling about the studio, -100 to 100. Starts at 0 (section 3.4) | Demand | A phrase |
| `fatigue` | How tired the audience is of new releases, 0 to 1 (section 3.3) | Demand | A phrase |
| `cadence` | The audience's buying rhythm over a set's life (section 4) | Demand | Forecast curve (upgrade) |

`size`, `spend`, and the sensitivities in section 3 are hidden. The player sees ranges and phrases, as with character appeal (R4) and trends (M3).

### 2.2 Start values

The total is about $8.3B per year, which matches the 2025 market estimates of $7.8B to $8.4B ([GM Insights](https://www.gminsights.com/industry-analysis/trading-card-games-market), [BCC Research](https://www.bccresearch.com/market-research/information-technology/trading-card-game-market.html)) [reported]. No public source splits the market into these audiences, so the split is a start value [inferred].

| Audience | People | Spend per year | Total |
|---|---|---|---|
| Kids | 25M | $60 | $1.50B |
| Parents and gift buyers | 30M | $40 | $1.20B |
| Teens | 10M | $90 | $0.90B |
| Casual players | 8M | $100 | $0.80B |
| Competitive players | 2M | $500 | $1.00B |
| Nostalgia adults | 5M | $150 | $0.75B |
| Set completionists | 2M | $300 | $0.60B |
| Chase collectors | 1.5M | $400 | $0.60B |
| Art collectors | 0.3M | $600 | $0.18B |
| Graders and investors | 0.5M | $800 | $0.40B |
| Resellers and scalpers | 0.2M | $2,000 | $0.40B |

The sizes move slowly with the hobby heat (section 3.2).

**The nostalgia audience.** The world has many nostalgia adults, but they are nostalgic for other games. For the studio, nostalgia demand comes only from people who were kids when they bought the studio's cards (`roster.md`, section 3.4). So the studio's nostalgia reach starts at 0, and it grows only from its own past kids, about 15 to 20 years later.

### 2.3 Reach: how the studio becomes known

- **Start.** A garage studio is known by a few thousand people at most. Grand Archive started with 1,539 crowdfund backers ([research.md](../research.md), section 5) [reported]. The start reach is about 2,000 people, mostly casual players, completionists, and chase collectors. Kids and parents start at about 0.
- **Growth.** Each sale reaches the buyer. Hit sets spread by word of mouth. Later systems add creators, store events, promotions, and collaborations (D7). A restaurant promotion reaches kids and parents fast.
- **Decay.** Reach falls slowly when the studio releases nothing. A person who knows the studio forgets it over about two years with no new product.
- **Character awareness.** A character's awareness (R5) grows mostly inside the studio's reach. A viral character can reach past it.

## 3. The conditions (A2)

Each condition is a multiplier on an audience's demand. Each audience has its own sensitivity to each condition. The release report names the conditions that moved sales the most.

### 3.1 Seasons

Q4 holds about 50% to 70% of US toy sales ([Toycycle](https://toycycle.co/pages/toy-industry-statistics), [Digital Commerce 360](https://digitalcommerce360.com/?p=1314010)) [reported]. The start values give kids about 50% of their year in Q4 [inferred]:

| Audience | Jan to Sep | Oct | Nov | Dec | Other |
|---|---|---|---|---|---|
| Kids | 0.67 | 1.2 | 2.2 | 2.6 | |
| Parents and gift buyers | 0.55 | 1.2 | 2.6 | 3.2 | Birthdays keep the base above 0 |
| Teens | 0.9 | 1.0 | 1.2 | 1.4 | Summer (Jun to Aug): 1.2 |
| Casual players | 0.95 | 1.0 | 1.1 | 1.2 | Summer: 1.1 |
| Competitive players | 1.0 | 1.0 | 1.0 | 0.9 | Tournament season (later system) |
| The collector and money audiences | 1.0 | 1.0 | 1.0 | 1.0 | Small changes only |

- One tick is one week (D9). A week takes the multiplier of its month.
- The game calendar starts in January of year 1.

### 3.2 Hobby boom and bust

- **Hobby heat** is one market-wide value from 0 to 100. It moves each week toward a target. The target changes every 1 to 3 years, so a boom or a bust lasts long enough to plan for.
- **Start:** heat 75, in a boom, because the market works like 2021 to 2026 (D4).
- **Sensitivity.** Investors and resellers follow the heat strongly: in a bust their demand falls to about 30%, and in a boom it rises to about 200%. Chase collectors follow it moderately (70% to 140%). The other audiences change by about 10% at most.
- **Sizes.** A long boom slowly grows the investor and reseller audiences. A long bust shrinks them.
- **The studio's own effect.** A small studio does not move the hobby heat. (Open question 2.)
- **What the player sees:** a phrase, for example "The hobby is booming" or "The hobby is cooling".

### 3.3 Release fatigue

- Each release adds fatigue to each audience that it reaches. A larger set adds more. A promo set adds little.
- Fatigue falls by half about every 6 weeks [inferred]. Pokemon releases a main set about every 3 months, so a 3-month gap clears most of it.
- **Effect:** fatigue lowers demand by up to about 30% [inferred].
- Each audience has its own tolerance. Completionists and competitive players tire fastest, because they must buy every set. Kids tire slowest.
- A parallel pair releases in one week and adds fatigue once for each half (S9).

### 3.4 Studio reputation

Each audience has a goodwill value from -100 to 100. It starts at 0. Goodwill multiplies demand: about 70% at -100, and about 120% at +100 [inferred].

| Event | Effect |
|---|---|
| A sell-out where resellers took most of the stock | Kids, parents, chase collectors: down |
| Bad pull rates for the set's chase | Chase collectors, completionists: down |
| A strong set (high demand, good reviews) | All audiences that bought: up |
| A reprint | Kids, parents, completionists: up. Investors: down |
| A disliked character on the box art (D3) | The audiences that dislike it: down |

- Goodwill slowly returns toward 0 over about a year.
- **What the player sees:** a phrase for each audience, for example "Collectors trust you" or "Kids' parents are angry about sell-outs".
- The drop and release systems will add more events (queues, store limits, bots).

## 4. Buying rhythms (A4)

Each audience has a cadence: when it buys over a set's life, counted from release week.

| Audience | Before release | Release weeks 1 to 4 | Later |
|---|---|---|---|
| Resellers and scalpers | Preorders | Most of their buying, in week 1 | Come back only for a restock or a reprint |
| Chase collectors | Preorders | Peak in weeks 1 and 2 | Then singles, not packs |
| Graders and investors | Preorders | Some sealed product | A second peak when the set goes out of print |
| Teens | | Peak in weeks 1 to 4 | A slow fall |
| Competitive players | | Peak in week 1 for the playable cards | Before tournaments (later system) |
| Art collectors | | Small | Weeks 2 to 8, after the singles prices settle |
| Casual players | | Even | Even, for months |
| Kids | | Even | Even, for months, with the Q4 lift |
| Parents and gift buyers | | Small | Holidays and birthdays |
| Set completionists | | Medium | A long tail of 6 to 12 months |
| Nostalgia adults | | Small | Reprints and anniversaries |

- **Hype before release.** Previews run for about 3 weeks before release ([research.md](../research.md), section 5) [documented]. Hype raises awareness and preorders. It does not sell packs before release day.
- **The shape of a set's demand** is the sum of the cadences, weighted by how much the set appeals to each audience. A chase-heavy set has a tall release spike and a short tail. A kid-friendly set has a low spike and a long, steady tail, with a holiday lift. This is A4: the set's design decides its curve.

## 5. How the parts make demand

The weekly demand of one audience for one set:

```
dollars = size × reach × spend / 52       (the audience's weekly money that knows the studio)
        × set share                        (how much of that money goes to this set)
        × season × hobby × fatigue × goodwill
        × cadence(week since release)
        × noise
```

- **Set share** comes from the set's appeal to the audience: the characters (`roster.md`, section 4), the pull rates, the set size (S8), the theme, the trends (M1), the gimmick (E4), and the art sets (S10). A strong set takes a large share. A weak set takes a small share. Without rival publishers (D11), the rest of the money goes to "the rest of the market".
- **Units.** Products do not exist yet. Until they do, demand counts packs at the pack price. The print and product systems will split it into packs, boxes, and other products.
- **Noise** is the luck of one run. Each lever must be larger than the noise (`research.md`, section 7).
- **Resellers** follow the resale gap (R12), not the set share. They buy when the other audiences want more than the supply.

## 6. What the player sees (A3)

What the player sees depends on studio upgrades. **Interpretation, for AJ to confirm:**

| Level | How the player gets it | What the player sees |
|---|---|---|
| 0: Garage | The start | The market feed only, in phrases: "Holiday shoppers are out", "The hobby is booming". The release report after each release |
| 1: Market desk | First upgrade | The market screen: each audience's size and the studio's reach as ranges. Goodwill and fatigue as phrases. The season and the hobby heat as phrases |
| 2: Analytics team | Second upgrade | A forecast for each set: first-month demand as a range for each audience |
| 3: Data department | Third upgrade | Narrower ranges, and the forecast curve week by week, so the player sees the shape from A4 |

**A5 replaces these levels** with one upgrade for each part (section 10.1).

- On-demand market research (M5) narrows the ranges for one audience at once, at any level.
- **Build note:** money does not exist yet, so upgrades cannot be bought. Until they can, a developer tool in Settings sets the level.

## 7. Screens

- **Studio → Market** (new row): the season, the hobby heat, and one row per audience. A tap opens the audience: its size, reach, goodwill, fatigue, and buying rhythm, as far as the level allows.
- **Set screen → Forecast** (level 2 and up): the demand range for each audience, and the curve at level 3.
- **Market feed** (D10): a line when a condition changes its phrase.
- **Release report** (later): the conditions that moved sales the most, as signed percentages.

## 8. Time

- Each week, the game moves the hobby heat, decays fatigue and goodwill, applies the season, and moves reach.
- **Advance one week** in Settings already exists. It runs these steps.
- The market uses its own random stream, so a new market system does not change the existing characters and sets.

## 9. Build order

The release system (print, release day, sales) does not exist yet. So this document builds in two steps:

1. **The market state:** the audiences, reach, the four conditions, the weekly step, the market screen, and the upgrades (developer tool). This step needs no release. **Built 2026-11-11.**
2. **Set demand:** the set share for each audience, the cadences, and the forecast. The release system then turns the forecast into sales.

## 10. Answers

1. **Upgrades** (A5): each part of the market view has its own upgrade, in place of the four levels in section 6. The season and the hobby heat are free.
2. **The studio's effect on the hobby heat** (A6): a large studio moves it. A small studio does not.
3. **The start reach** (A7): about 2,000 people. A media crossover (D7) is a likely catalyst for the first large jump in reach.

### 10.1 The market upgrades (A5)

Each upgrade unlocks one part. The names are flavor. The prices come with the money system.

| Upgrade | Unlocks |
|---|---|
| Market desk | The audience sizes, as ranges |
| Fan survey | The studio's reach in each audience, as ranges |
| Community manager | The goodwill of each audience, as a phrase |
| Release planner | The release fatigue of each audience, as a phrase |
| Buyer research | The buying rhythm of each audience |
| Analytics team | The set forecast: first-month demand for each audience, as a range |
| Data department | The forecast curve, week by week |
| Data science | Sharper ranges: every range is half as wide |
