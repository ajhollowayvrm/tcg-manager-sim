# Running costs: staff and space, artists, and marketing

**Status: ACCEPTED by AJ (K1 to K6). The numbers are the main thread's start values, for AJ to review.** Written 2026-11-12. The decisions are K1 to K6 in `docs/decisions.md`. They build on the selling engine (`sales.md`) and the market (`audiences.md`).

The first simulations showed that a studio that pays only for printing cannot fail. These costs make time cost money, and they make the release schedule a real risk.

The build comes in three steps. Each step has its own tests and its own sideload.

1. Staff, space, and the close (sections 1 to 3).
2. Artists (section 4).
3. Marketing (section 5).

## 1. Space (K3)

| Place | Rent each month | Rent each week | Room for hires | Source |
|---|---|---|---|---|
| Garage | $0 | $0 | 1 | |
| Coworking desks | $600 | $140 | 3 | $150 to $300 for each desk ([Optix](https://www.optixapp.com/?p=15115)) [reported] |
| Small office | $3,000 | $690 | 8 | $2,750 to $3,150 for 1,000 sq ft ([Workbox](https://www.workboxcompany.com/workspace-guides/average-office-space-rental-cost-a-strategic-guide/)) [reported] |
| Studio floor | $12,000 | $2,770 | 20 | 4,000 sq ft at the same rate [inferred] |
| Headquarters | $40,000 | $9,230 | 50 | [inferred] |

- The founder is not a hire and costs nothing.
- A move costs one month of the new rent. The player can move down too, if the hires fit.

## 2. Hires (K3)

Each market upgrade (A5) is now a hire. A hire costs a weekly salary, and it needs room in the space.

| Hire | Unlocks | Salary each year | Source |
|---|---|---|---|
| Market analyst ("Market desk") | Audience sizes | $79,000 | BLS median, market research analysts, May 2025 [documented] |
| Survey contractor ("Fan survey") | Your reach | $40,000 | A part-time contractor [inferred] |
| Community manager | Goodwill | $65,000 | [inferred]. BLS has no category |
| Release planner | Release fatigue | $70,000 | [inferred] |
| Buyer researcher ("Buyer research") | Buying rhythms | $79,000 | As the market analyst |
| Analytics team (2 people) | The set forecast | $160,000 | 2 × the market analyst |
| Data department (3 people) | The forecast curve | $250,000 | [inferred] |
| Data scientist ("Data science") | Sharper ranges | $150,000 | [inferred] |

- A hire with more than one person takes that many places of room.
- A dismissal is free, and the hire's part of the market view locks again.
- **"Show the hidden numbers" stays.** It shows everything, with no hires, for testing.

## 3. The weekly costs and the close (K4)

- Each week, the ledger records one line for the rent and one line for the salaries.
- When cash is below zero, the Studio widget shows a warning and the weeks left: "Below zero: 6 weeks left".
- After **8 weeks in a row** below zero, the studio closes (D8). The game shows a closing screen with the studio's history: sets, packs sold, the best set, and the peak cash. Then "Start a new game".
- **The developer tool "Add $50,000" stays** until loans exist.

## 4. Artists (K1, K2)

### 4.1 An artist

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Generated | Flavor | Talent board, card designer |
| `style` | One personality archetype, for example cute or fierce | The style fit with the card's character (the roster's hidden fit "archetype × artist style") | Talent board |
| `fee` | $400 to $2,500 for each card | The cost of a commission | Talent board |
| `weeks` | 2 to 8 weeks for each card | When the art is done | Talent board |
| `popularity` | Hidden, 0 to 100. **Fame does not set the fee** ([research.md](../research.md), section 5) [documented] | Demand: the "Artists" factor | A phrase after the artist's cards release |
| `queue` | The cards in progress | A busy artist adds 1 week for each card in the queue | Talent board |

### 4.2 The talent board

- The board has about 12 artists at a time. Each month, one or two leave and new ones join.
- An artist whose cards sell well gains popularity, and other studios book them: their queue grows.
- **The founder (K8):** the founder is an artist in every list. The founder's art is free and done at once, but collectors see it as amateur (popularity 20). In an existing save, a card in a set with no lead artist counts as founder art.
- **Alumni (K10):** an artist who drew for the studio joins the alumni when they leave the board. The studio can still hire them.

### 4.3 The commission

- The card designer's Art step picks an artist. When the player saves the card, the studio pays the fee, and the art is done after the artist's weeks plus the queue.
- A new artist for a saved card is a new commission: the studio pays again.
- **A set cannot release until all its art is done** (K2). The release plan shows the first week when the art is done, and the plan cannot pick an earlier week.
- **Filler cards** are drawn by the set's lead artist (section 4.5). Stock art no longer exists.

### 4.4 The demand factor

The algorithm gets a 15th factor, **Artists**:

- Art collectors: ×0.6 to ×1.8, from the average popularity of the set's artists.
- Chase collectors: ×0.85 to ×1.3.
- Other audiences: ×0.95 to ×1.1.
- The style fit: an artist whose style matches the character's personality adds up to 10% on that card (D3, "archetype × artist style").

### 4.5 The lead artist (K7)

- Each set needs a lead artist before the print run. The set screen picks it.
- The lead draws all filler cards, and each designed card with no own artist.
- Filler: 10% of the lead's card fee for each card, 10 cards a week. A designed card: the full fee, 1 week.
- The lead's art is done at: the commission week + the lead's weeks, outside queue, and cards in progress + the filler weeks + the designed cards. The founder is done at once.
- The studio pays the lead with the print run, at the fee of the commission week.

### 4.6 Legacy and legends (K9)

| Field | Values | Reader | Screen |
|---|---|---|---|
| `legacy` | Hidden, 0 to 100. Never falls | The fee, the "Artists" factor, a return | A "Legend" badge at 30 or more |

- Each released set records the fan base (reached people in all audiences except resellers) in its release week.
- Each week: legacy target = Σ over released sets of share × 15 × log2(fan base now / fan base at release) / n, where n is the set's release order. Legacy rises to the target, and never falls.
- Fee = base fee × (1 + legacy / 50).
- Fame for the "Artists" factor = popularity or legacy, whichever is higher.

### 4.7 A return (K10)

- A legend returns when they draw for a set and had no art in the studio's last released set before it.
- News at the print run. In the 3 preview weeks: extra reach of 180 × legacy/100 art collectors and 120 × legacy/100 chase collectors each week.
- The "Legend returns" factor: ×(1 + 0.6 L) for art collectors, ×(1 + 0.4 L) for chase collectors, ×(1 + 0.1 L) for the others, where L = legacy / 100.

### 4.8 Breakouts and hot cards (K11, K12)

| Field | Values | Reader | Screen |
|---|---|---|---|
| `breakout` | A wave: rise week, news week, peak 60 to 100, 8 to 20 weeks, kept popularity | The heat, the queue, the news | "Rising" badge (scouts), "Hot" badge (after the news) |
| `heatAtCommission` | 0 to 100, on a card with its own artist, and on a lead commission | The "Hot artist" factor | Hidden numbers |

- Each week, an artist on the board without a wave starts one with a chance of 10%. An artist in a wave does not leave the board.
- Heat: a quiet rise to 30% of the peak over 6 weeks, the peak in the news week, then a straight fall to 0.
- After the wave: popularity + kept (8 to 20, or 40 to 60 for a new star in 3 of 10 waves).
- Queue: round((popularity + heat after the news) / 30) ± 1.
- Talent scout ($55,000 a year): sees the rise 3 weeks before the news. Scouting network ($140,000 a year, 2 people): 6 weeks before, and if the fame will last.
- A card's heat = 0.5 × the heat while the art was made + 0.5 × the artist's heat now.
- The "Hot artist" factor: see K12.

## 5. Marketing (K5, K6)

### 5.1 Campaigns for a release

The release plan gets a **Marketing** step. All costs are paid when the player schedules the release.

| Channel | What the player buys | Reach | Start values |
|---|---|---|---|
| Previews | A preview budget | Chase collectors, teens, completionists, and competitive players, in the 3 weeks before release | $5 for each new person [inferred]. The free 60 people a week stay |
| Creators | One or more sponsored videos from a creator list | The creator's audience mix | $25 for each 1,000 views ($10 to $50 in the research). 2% of the views get to know the studio [inferred] |
| Store events | Prerelease kits for stores | Casual players, competitive players, completionists | The studio pays $8 a kit, and stores pay the rest [inferred]. Each kit reaches one person, and its packs count as sales |
| Ads | An ad budget | Kids 40%, parents 40%, teens 20% | $8 for each 1,000 views (YouTube $5 to $10). 2% of the views get to know the studio [inferred] |

### 5.2 Creators

- A list of about 10 creators, from small channels to one with about 3 million subscribers (the largest real channels have 2.5M to 3.3M) [reported].
- Each creator has an audience mix (for example 60% chase collectors and 30% teens) and a price for each video.
- A creator's video is a one-week burst of reach. A very large creator also raises the hobby heat a little, if the studio is large (A6).

### 5.3 The weekly brand budget

- A standing weekly amount, split between ads and creators by a slider. It adds reach every week, with or without a release.
- The ledger records it each week, with the rent and the salaries.

### 5.4 What the player sees

- The release plan shows the cost and the expected new people for each channel, and the forecast includes them.
- The algorithm screen's "Who can buy" section lists the reach from each campaign.

## 6. Simulation results, 2026-11-12

Three-year and two-year runs with seed 2026, after all three steps:

| Strategy | Result |
|---|---|
| Office, 1 hire, founder art, no marketing, 500 boxes every 26 weeks | Closes in week 23. The first set sells out, and the rent and the salary eat the cash before the next set |
| Office, 3 hires, artists, $10,000 marketing, 2,000 boxes every 13 weeks | Closes in week 8. The first plan costs about $75,000 against $25,000 of cash |
| The same with 6 hires and $40,000 marketing | Closes in week 8 |
| Garage, founder art, 500 boxes, reprints from the sales, size 150 | $3,000 left after the first plan. $190,000 after 2 years, 4 sets |
| Garage, founder art, 500 boxes, size 60 | $320,000 after 2 years, 5 sets |
| Garage, artists, 500 boxes, size 60 | $180,000 after 2 years, 4 sets |

- A lean start survives and grows. An expensive start closes before its first sale.
- This matches D6: "Your first set should feel massive to you but small in the world and maybe require a loan." Loans and crowdfunds (D5, D6) are the next missing piece: they let a player take the expensive path on purpose.
