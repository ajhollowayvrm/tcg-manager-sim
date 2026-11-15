# The selling engine

**Status: BUILT, for AJ's review.** Written 2026-11-11 and 2026-11-12. AJ gave full permission to design and build the selling engine overnight: "work on the entire selling engine of the audiences buying engine. In the morning, I want to be able to watch my decisions turn into sales and see the algorithm of the different audiences". The main thread made every choice in this document. They are B1 to B12 in `docs/decisions.md`. Each one is open for AJ to change.

The engine builds on `audiences.md` (the market) and `roster.md` (the characters).

## 1. What the engine must do

- Turn the player's set decisions into sales, week by week, for each audience.
- Show the algorithm: for each audience, every factor that raised or lowered its demand, with its number (B12).
- Make the release a decision: the week, the print run, and the pack price.
- Make money real: print costs go out, revenue comes in, and the studio has a cash balance.

## 2. The release (B1, B2)

A draft set gets a release plan:

| Field | Values | Default |
|---|---|---|
| Print run | Boxes, 1 to 100,000. Packs = boxes × the pack's box size | 500 boxes |
| Pack price | $1 to $20 | $4.49 |
| Release week | At least 3 weeks from now, for the previews ([research.md](../research.md), section 5) | 4 weeks from now |

- **"Schedule the release"** pays the print cost at once and locks the set. A scheduled or released set cannot change (B2).
- **Print cost** for one pack: $0.025 for each card, $0.05 for the wrapper, plus the extra cost of the looks that the pack gives (C17). Each set also pays a $2,000 print setup. The research gives $0.02 to $0.03 for each card ([research.md](../research.md), section 5) [reported].
- **Revenue:** the studio gets 38% of the pack price. The research gives 35% to 40% ([research.md](../research.md), section 5) [reported].
- **Reprint:** the player orders more boxes. They arrive 6 weeks later, and the player pays at the order.

## 3. Money (B3)

- A new studio starts with **$25,000** in cash.
- A ledger records each print cost, each reprint, and each week's revenue.
- Cash can go below zero. Loans and the lose state (D8) come later. The money screen warns when cash is below zero.
- Money shows in the Studio widget, and the ledger is in the Business tab. A developer tool adds $50,000.

## 4. Demand for one audience (B4)

```
lifetime share = 25% × the factors          (how much of the audience's yearly money this set takes over its life)
weekly dollars = people who know you × yearly spend × lifetime share
               × rhythm(week since release)
               × season × hobby × fatigue × goodwill
               × noise
packs          = weekly dollars / pack price
```

- **25%** is the start value for a normal set: a person who knows the studio spends a quarter of one year's TCG money on it over the set's life [inferred].
- The lifetime share has a ceiling of 90%.
- **Noise:** each week, each audience gets a random factor with a spread of about 15%.

### 4.1 The fan wallet (B13)

- Over any 52 weeks, the studio's sets together can take at most 50% of the yearly money of the people who know the studio.
- When the sets want more than the wallet has left, each set's demand falls by the same share. Resellers are not fans, so the wallet does not limit them.
- **Why word of mouth fell to 0.015:** at 0.05, each $4.49 pack sold to a chase collector brought about $8 of new future money through the new people it told. A loop above 1 grows with no end, and the wallet could not stop it. At 0.015, a normal set's loop is about 0.5.

## 5. The factors (B5)

Each factor is a multiplier. The algorithm screen lists every factor for every audience. A factor of 1.00 means no effect.

| Factor | How it works | Who cares most |
|---|---|---|
| **Characters** | The average appeal of the set's cards for this audience. The headliner counts three times, and filler cards count a fifth. Appeal 33 gives 1.00. Appeal 100 gives about 2.7 | Everyone |
| **Fame** | How well the audience knows the set's characters (awareness). It starts at 1.00 and rises as the characters become known | Everyone |
| **Pull rates** | The chance of a hit in one pack, against the audience's hidden favorite rate | Chase collectors, investors, teens |
| **A grail** | A single card rarer than 1 in 300 packs | Chase collectors, investors |
| **Completion** | How hard the set is to finish. A very rare single hurts | Completionists |
| **Set size** | The set size against the audience's hidden favorite size (S8, S12) | Completionists, kids |
| **Theme** | A hidden fit between the theme and the audience, ×0.80 to ×1.20. No theme gives 0.90 (B15) | Each audience in its own way |
| **Gimmick** | The share of cards that carry the era gimmick. The lift grows with the studio's size. A small studio gets almost nothing, and it can lose a little (S13) | Kids, teens, chase collectors |
| **Art** | Full-art, borderless, frame-break, showcase, and extended-art cards, and art sets | Art collectors, chase collectors |
| **Subsets** | Subsets with their own pack outcome | Completionists, chase collectors |
| **Headliner** | A headliner with a card in the set gives ×1.10. No headliner gives ×0.90 with kids and parents (B15) | Kids, parents, teens |
| **Set type** | Promo sets suit kids and parents. Special sets suit collectors. Parallel pairs suit collectors and split kids | Each audience in its own way |
| **Price** | The pack price against $4.49, with a price sensitivity for each audience | Kids, parents |
| **No game** | The cards have no game rules (C3). Competitive players and casual players buy less | Competitive players, casual players |

The hidden values (favorite rates, favorite sizes, theme fits) come from the world seed. Each world is different.

## 6. Buying rhythms (A4, B6)

Each audience spreads its lifetime demand over 52 weeks from release:

| Audience | Release weeks 0 and 1 | After that |
|---|---|---|
| Resellers | All of it (section 7) | Nothing |
| Chase collectors | 50% | Halves every 3 weeks |
| Competitive players | 50% | Halves every 4 weeks |
| Graders and investors | 40% | Halves every 8 weeks |
| Teens | 25% | Halves every 6 weeks |
| Completionists | 20% | Halves every 20 weeks |
| Casual players | 10% | Halves every 20 weeks |
| Art collectors | 5% | A slow rise, with the peak at about week 6 |
| Kids, parents, nostalgia adults | 5% | Halves every 26 to 30 weeks, and the season lifts the holidays |

So a chase-heavy set has a tall spike and a short tail. A kid-friendly set has a low spike, a long tail, and a holiday lift.

## 7. Resellers (B7)

- Resellers do not need to know the studio. They follow a gap: in release weeks 0 and 1, the game compares the other audiences' demand with the stock.
- When demand is above the stock, resellers take a share of the stock first. The share grows with the gap, up to 50%. The research gives 10% to 50% of the entries of a hot drop ([research.md](../research.md), section 4) [documented].
- When resellers take 25% or more of a release that sells out, kids, parents, and chase collectors lose goodwill.
- Resale to other buyers comes later, with the secondary market.

## 8. Stock and sell-outs (B8)

- Each week, the stock goes to the audiences in proportion to their demand, after the resellers.
- When the stock runs out, the unmet demand is lost. The sales screen shows it as "missed".
- A reprint closes the gap. Kids, parents, and completionists gain goodwill. Investors lose some.

## 9. Growth (B9)

Sales grow the studio:

- **Word of mouth:** each pack sold tells about 0.015 new people in the same audience (B13 lowered it from 0.05). A set with strong characters spreads faster.
- **Shelf discovery:** stock in stores is seen by people who do not know the studio. The new people each week grow with the square root of the stock (about 360 people for 18,000 packs), mostly kids, parents, and teens. The effect halves every 8 weeks after release (B14).
- **Previews:** in the 3 weeks before release, the studio gains reach with chase collectors, teens, completionists, and competitive players.
- **Character awareness:** the buyers in each audience learn the set's characters. The headliner gains the most. This raises the Fame factor of the next set.
- **Buzz:** the characters of a set that sells well gain buzz.

## 10. Reactions (B10)

- **Release week:** the release adds fatigue to every audience (audiences.md, section 3.3). Weak pull rates for chase collectors cost their goodwill.
- **Week 4 review:** the game compares the set with a normal set. A strong set raises goodwill with its buyers, and a large studio's strong set heats the hobby (A6). A weak set does the opposite.

## 11. What the player sees (B11, B12)

- **Set screen → Release:** the plan, the print cost, and a 12-week forecast chart by audience.
- **Set screen → Sales:** a weekly chart, stacked by audience. Totals: packs sold, missed, stock left, and revenue. A "Reprint" button.
- **The algorithm:** a tap on an audience opens its full demand: the people who know you, their yearly spend, every factor, the lifetime share, and the expected packs.
- **Market tab → Sales:** this week's packs by audience across all sets, and the releases.
- **Next week:** a button in the Studio tab and the Market tab moves time by one week, or by four.
- **Hidden numbers:** AJ asked to see the algorithm, so Settings has a switch, "Show the hidden numbers". It is on by default for now. When it is off, the game shows what the upgrades allow (A5): the forecast needs the Analytics team, and the curve needs the Data department.

## 12. Not built yet

- Products other than packs (boxes, collections, singles).
- The secondary market, resale prices, and grading.
- Distributors, retailers, and store orders. For now, all printed stock is in stores on release day.
- Loans, crowdfunds, and the lose state.
- Trends (M1 to M5) as a demand factor.
- Release reports with the three largest causes as text. The algorithm screen shows all causes now.
