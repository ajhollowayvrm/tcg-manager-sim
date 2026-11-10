# Research: how to make the TCG manager game succeed

Written 2026-11-10, after the restart in commit `9d21bab`. This document is research only. It does not make design decisions. Section 12 lists the decisions for AJ. The design document starts after AJ answers them.

**Confidence tags.** Each number has a source and one tag: **[documented]** (a filing, an official statement, or an API), **[reported]** (trade press), **[community-estimated]** (forums and fan sources), **[measured]** (computed from an API by the old research), or **[inferred]** (derived here). Where no public data exists, this document says so.

**The old research.** Section 5 reuses the measured facts from the old build. Read the full old document with `git show 160a6bb:docs/tuning/05-real-world.md`.

## Contents

1. Summary
2. Lessons from the old build
3. The Pokemon phenomenon arc
4. Market actors and events
5. Business systems
6. What makes set creation fun and deep
7. How set choices must drive the simulation
8. Many streams of information on a phone
9. No win, but a lose state
10. Quality of life on a phone
11. SwiftUI and sideload practicalities
12. Decisions for AJ

## 1. Summary

1. **The player's mental model is the product.** A simulation effect that no screen shows has no value to the player. The old build failed here (section 7).
2. **Each creation choice needs a reader, a screen, and a line in a report.** If a card field fails one of these three tests, delete it (section 7).
3. **Game Dev Tycoon is the closest model for set creation.** The player combines a few choices, the market judges the result, and a report teaches the hidden rules over time (section 6).
4. **The pack reveal must be a sequence of steps, with a rarity and a market value on each card.** TCG Card Shop Simulator sold 100,000 copies in three days on this loop (section 6).
5. **The real Pokemon arc is a loop with a lag:** shortage, scalpers, incidents, retail limits, reprint, then a fall in common-card prices. Each step is an event that the player can see and answer (section 3).
6. **There are two ways to answer a boom, and both are real.** In 1999 to 2001, sales fell 50% in one year after the market flooded. In 2021, the publisher printed 2.4x more and the brand grew (section 3).
7. **Real TCG marketing is previews, creators, store events, and promo cards.** Paid media is small. A crossover set is the largest revenue source in the industry (sections 4 and 5).
8. **A small TCG starts with a crowdfund of $0.9M to $27M.** Altered raised €6.2M and still shut down when its next €2M round failed. This is a ready-made lose state (section 5).
9. **Losing must be fair:** three meters, warnings in stages, recovery tools that cost the future, and a cause-of-death screen (section 9).
10. **Pay $99 per year for the Apple Developer Program.** A free Apple ID makes the app stop every 7 days. Build save export first, because a deleted app loses its saves (section 11).

## 2. Lessons from the old build

The old build lived from 2026-09-03 to 2026-11-10. Its last commit is `160a6bb`.

AJ gave four reasons for the restart:

- AJ was not involved deeply in the planning.
- Set creation was not fun or deep enough.
- The set-creation choices did not drive the simulation enough.
- The quality of life on the phone was bad.

The old files show the causes:

- **The simulation came first, and the player came last.** The team built a headless simulation core and tuned it with strategy bots for 13 rounds against 55 balance gates. The old `HANDOFF.md` is 2,892 lines, and almost all of it is about tuning. The UI came after the tuning.
- **Bots measured effects that a human cannot see.** A bot finds a 2% effect across thousands of runs. A human plays one run with noise.
- **Card fields existed with no reader.** The old set design (`docs/design/sets-and-distribution.md`) says that `Card.treatment` and `Artist.specialty` were "declared, defaulted, and read by nothing".
- **The planned screens were all data views.** The old concept listed seven player screens: price history, set health, pop reports, IP roster, artist roster, channel board, and feeds. None of them was a screen to create a set.
- **The set-creation design came last.** The old set design was written on 2026-09-06, after the simulation core, and it was never built.

**What to keep from the old build:**

- The measured real-world facts (section 5).
- Three architecture rules that are still correct. The simulation is pure and runs from a seed. Each subsystem has its own random number stream. A read (for example, a screen repaint) never draws a random number.
- The old research's open questions. The most important one: "Which era is this game?" Section 12 asks it again.

## 3. The Pokemon phenomenon arc

The real arc has one loop that repeats. Demand goes above supply. Scalpers and incidents follow. Retailers set limits or stop sales. The publisher prints more, and the price of common cards falls. The game can use each real phase as a game phase.

| Phase | Dates | Cause | Signals that the publisher saw | Publisher response | Result |
|---|---|---|---|---|---|
| Japan launch | Oct 1996 | Tie-in to the video game | First tournament, June 1997 | Media Factory publishes | A base for the US export ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Trading_Card_Game)) [reported] |
| US craze | Jan 1999 to 2000 | Anime, video game, and cards at the same time | 400,000 packs sold in less than 6 weeks [reported]. More than 2 million starter sets ([Newsweek](https://www.newsweek.com/pokemon-evil-164556)) [reported]. Stores could not keep stock. Schools banned the cards ([CSM](https://proof.csmonitor.com/1999/1004/p1s4.html)) [reported] | Wizards could not ship fast enough. Hasbro bought Wizards for $325M in Sept 1999 [reported] | Card sales above $500M in 1999 and 2000. Cards were 15% of Hasbro's 2000 revenue ([ANN](https://animenewsnetwork.com/news/2001-05-09/pokemon-ccg-sales-drop)) [reported] |
| Decline | 2001 to 2003 | Fad fatigue and oversupply | Hasbro US games fell from $398M (Q1 2000) to $190M (Q1 2001), -50% ([ANN](https://animenewsnetwork.com/news/2001-05-09/pokemon-ccg-sales-drop)) [reported]. A fan source says Hasbro blamed the decision to "flood the market" [community-estimated] | Smaller print runs. No 1st Edition for Expedition (2002) ([Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Expedition%20Base%20Set%20(TCG))) [reported] | The license moved from Wizards to Pokemon USA in 2003. Wizards sued and settled. No World Championship in 2003 [reported] |
| Long stable period | 2004 to 2015 | Organized play and the video game cycle | About 1.5B to 2B cards printed per year [community-estimated] | Pokemon USA ran national championships and Worlds from 2004 ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_World_Championships)) [reported] | Stable. The records are poor |
| Pokemon GO | Jul to Dec 2016 | A mobile game and the 20th anniversary | GameStop card sales doubled in one week ([Globe and Mail](https://www.theglobeandmail.com/life/pokemon-go-boosts-real-life-merchandise-sales/article31376529)) [reported]. Germany Christmas week +190.6% [documented] | No public response | No source separates the GO effect from the anniversary effect |
| Boom | Oct 2020 to 2021 | Pandemic, Logan Paul, sports-card investors | Logan Paul's box break had about 300,000 live viewers. StockX trades +300%. Charizard PSA 9 went from $470 to $4,366 ([StockX](https://stockx.com/news/pokemon-the-logan-paul-effect)) [reported]. PSA paused most grading, with a backlog of up to 10M cards [reported]. Target stopped in-store card sales on May 14, 2021, one week after an assault ([NBC](https://www.nbcnews.com/news/us-news/target-halts-sale-trading-cards-including-pok-mon-over-safety-n1267442)) [reported] | Feb 2021: "printing at maximum capacity" ([ICv2](https://icv2.com/articles/news/view/47586/the-pokemon-company-issues-statement-product-availability)) [documented] | Print run 3.7B to 9B cards per year. Commons fell from 6 cents to 1 cent ([Fortune](https://fortune.com/2022/07/06/pokemon-trading-card-shortage-prices-bubble-nine-billion/)) [reported] |
| Mature mega-phase | 2022 to 2026 | A large collector base, TCG Pocket, set hype | About 10B to 11.9B cards per year ([PokeBeach](https://www.pokebeach.com/2025/05/pokemon-tcg-printed-10-2-billion-cards-in-2024-lower-than-the-previous-year)) [reported]. Net sales ¥531B (+29.3%) for the year to Feb 2026 ([PocketGamer](https://www.pocketgamer.biz/news/84117/its-another-record-breaking-year-for-pokmon-as-revenue-reaches-19-billion/)) [reported] | Virtual queues, reprints, a second "maximum capacity" statement in May 2026, lotteries and ID checks in Japan | Demand stays above supply at about 10B cards per year |

### Events from 2025 to 2026

| Event | Date | Facts |
|---|---|---|
| Prismatic Evolutions launch | Jan 2025 | Pokemon Center Singapore cancelled in-store sales 30 minutes before opening. Police helped with the crowd ([GoNintendo](https://gonintendo.com/contents/44632-massive-crowds-cause-pokemon-center-singapore-chaos-pokemon-tcg-prismatic-evolutions)) [reported] |
| Virtual queue | Feb 2025 | The Pokemon Center added a queue. Later drops blocked real shoppers and crashed the site ([ComicBook](https://comicbook.com/gaming/news/black-bolt-white-flare-pokemon-center-pokemon-card-preorder-issues)) [reported] |
| Retail limits | 2024 to 2026 | Walmart: 5 per visit. Some Target stores: 1 per person. Each store or drop sets its own limit [community-estimated] |
| Japan lottery and ID check | Aug 2026 | 30th Celebration products are sold only by lottery, with a residency ID check ([Inven Global](https://www.invenglobal.com/articles/24523/the-pok%C3%A9mon-company-takes-action-to-crack-down-on-physical-tcg-card-resellers)) [reported] |
| Marketplace bans | Sept to Oct 2026 | Mercari and LINE Yahoo restricted listings. TPCi asked eBay to remove early listings ([Dexerto](https://www.dexerto.com/pokemon/pokemon-cracks-down-on-tcg-scalpers-with-new-resale-bans-3418473/)) [reported] |
| Government | July 2026 | A Japanese parliamentary group formed to study scalping and counterfeits [reported] |
| Grading backlog | June 2026 | PSA paused value tiers again, with a backlog of about 12.4M cards [community-estimated] |

### Contrast cases: decline and failure

- **Harry Potter TCG (Wizards, 2001).** It was a strong seller in its launch year. It ended after 5 sets ([Wikipedia](https://en.wikipedia.org/wiki/Harry_Potter_Trading_Card_Game)) [reported]. A large brand gives a strong launch, but it does not keep players.
- **World of Warcraft TCG.** Blizzard did not renew the license in 2013 and launched Hearthstone in 2014 [reported]. A licensor's own priorities can end a game.
- **Altered (Equinox).** The 2024 crowdfund raised about €6.2M. Equinox shut down in March 2026 after a €2M follow-up crowdfund failed ([GamingTrend](https://gamingtrend.com/news/altered-announces-its-shutting-down-after-failing-to-meet-new-funding-goal)) [reported]. This was a shutdown, not a bankruptcy. A cash gap between sets killed a funded game.
- **MetaZoo.** Peaked in 2021. Closed in January 2024 and cited "logistical and product gridlocks". Stores held unsold stock [reported].
- **Lorcana.** More than 1B cards sold by early 2025. Ravensburger sales rose 18.2% in 2024, then fell 5.9% in 2025, because "investment-driven buyers exited" ([Board Game Wire](https://boardgamewire.com/?p=5759)) [reported].

### What the arc gives the game

- **A boom has a lag.** Demand spikes, then scalpers come, then incidents, then retailer limits, then a reprint, then a fall in common-card prices. Each step is a separate event that the player can see and answer.
- **A fad decline is a print run that keeps growing after demand falls.** This matches the Magic Fallen Empires loop from the old research: shortages teach retailers to over-order, and when the publisher fills those orders, the channel fills with stock that does not sell.
- **The 2021 response was the opposite of 1999.** The publisher increased the print run 2.4x and kept it high. Prices of commons fell, but the brand grew. Both paths must be possible.

## 4. Market actors and events

| Actor or event | How it works | Effect on the publisher |
|---|---|---|
| **Scalpers and bots** | Bots buy online drops. Discord groups track restocks. Publishers answer with queues, IP blocks, lotteries, and ID checks. Queues and blocks also stop real fans [reported] | Goodwill falls at each failed drop. Revenue does not fall, because the retailer already bought the stock [inferred] |
| **Campouts and midnight launches** | About 130 people waited overnight at a Tampa Best Buy ([Fox 13](https://www.fox13news.com/news/pokemon-fans-camp-out-overnight-special-card-release-tampa-best-buy)) [reported]. A line dispute at a GameStop ended in a stabbing in 2025. Police controlled a Costco line in 2026 [reported] | A campout is free press. Violence makes a retailer limit or stop sales (Target 2021) |
| **Retail limits** | Store by store, drop by drop: 1 to 5 per customer. Target staff removed shrink-wrap to stop resale [reported] | Limits protect goodwill but cap the sales of one drop |
| **Box breaks and live shopping** | Logan Paul's break moved trade volume +300%. Whatnot passed $8B in sales in 2025, with cards as the core category ([Fortune](https://www.fortune.com/2025/06/16/whatnot-startup-5-billion-dollar-livestream-video-shopping-app-auctions-sports-trade-card-breaks-ebay)) [reported] | One creator can move a whole market. Breaks also cause buyer debt and bad press [reported] |
| **Grading companies** | PSA backlogs of up to 10M cards caused pauses in 2021 and 2026 [reported]. The old research has the gem rates and fees | A grading pause slows the speculator market |
| **Counterfeits** | PSA intercepted more than $200M of fakes in 2025. Pokemon fakes rose more than 125% in one year ([ICv2](https://www.icv2.com/articles/news/view/62339/pokemon-tcg-card-counterfeiting-surged-2025)) [reported]. Customs seized 1.7M fake cards in Rotterdam in May 2026 [reported] | Counterfeits grow with value. They hurt trust in high-value cards |

### Collaborations

| Collaboration | What went right | What went wrong |
|---|---|---|
| Burger King, 1999 | 57 toys. Some stores sold 1,000 meals per day | Shortages caused apology ads. A safety recall of more than 25M toy balls cost more than $1M ([CPSC](https://www.cpsc.gov/Recalls/2000/CPSC-Burger-King-Corporation-Announce-Voluntary-Recall-of-Pokemon-Ball)) [documented] |
| McDonald's 25th anniversary, 2021 | Large reach. The promotion came back in 2022 and 2023 [documented] | Scalpers bought the stock. McDonald's told restaurants to set limits [reported] |
| General Mills cereal, 2021 | Promo packs in 4 cereal brands [reported] | Scalpers bought the stock [reported] |
| Post Malone, 2021 (Pokemon) and 2022 (Magic) | A virtual concert and Secret Lair products [reported] | Mixed reviews for the concert |
| Van Gogh Museum, 2023 (old research) | Large press | Crowd trouble on the first day. The museum withdrew the promo card [reported] |
| Magic x Final Fantasy, 2025 | $200M on the first day ([VGC](https://www.videogameschronicle.com/news/magic-the-gatherings-final-fantasy-set-made-200-million-in-one-day)) [documented] | None found |

The pattern: a mass-market collaboration gives reach, and it always brings scalpers. A crossover set gives the largest revenue in the industry.

## 5. Business systems

### Measured facts from the old research (still valid)

| Fact | Value | Tag |
|---|---|---|
| Booster box MSRP | Pokemon $143.64. 24 packs per box is the industry default | [documented] |
| Publisher share of MSRP | 35% to 40%. Distributor sells at 50% to 55%. Retailer sells at 100% | [reported] |
| Median card price in a modern set | $0.24 to $0.34. The top 10% of cards hold about 78% of a set's value | [measured] |
| Chase card / median card | About 1,000x | [measured] |
| Reprint effect | The older printing falls 20% to 50%. A bad reprint (Chronicles 1995) cut prices 10x to 20x | [reported] |
| Print cost | $0.02 to $0.03 per card from small printers. Wizards ran a 46% operating margin in 2025 | [reported] / [documented] |
| Foil press limit | 220,000 standard sheets per day against 15,000 holo sheets per day | [reported] |
| Artist fee | $400 to $2,500 per card, flat, no royalty. Fame does not raise the fee | [documented] |
| Warehousing | $20.17 per pallet per month. Surcharges start after 90 to 180 days | [reported] |
| Mid-size print run | 16,700 to 250,000 booster boxes per set (Flesh and Blood) | [reported] |
| Set size | About 280 cards and about 170 artists (Magic). About 207 cards and 102 artists (Pokemon) | [measured] |
| Preview window | About 3 weeks | [documented] |
| Paid media | Wizards: less than $750,000 per year, company-wide | [reported] |
| Crossover license | 5% to 15% royalty on net sales, plus an advance and a minimum guarantee. Lead time 4 to 7 years | [documented] |
| Scalper share of a hot drop | 10% to 50% of entries | [documented] |
| Distributor terms | No returns. 18% per year interest after 21 days past terms | [documented] |

The sources for these facts are in the old `docs/tuning/05-real-world.md`. Read it with `git show 160a6bb:docs/tuning/05-real-world.md`.

### New facts

**Loans**

- SBA 7(a) loans go up to $5M. The rate cap is prime plus 3.0% to 6.5%. A smaller loan has a larger spread. The 2026 prime rate is about 6.75% to 7.5% ([NerdWallet](https://www.nerdwallet.com/article/small-business/sba-loan-rates)) [reported].
- Each owner of 20% or more must give a personal guarantee. Lenders expect collateral above $50,000 [documented].
- Revenue-based financing repays 1.1x to 2.5x of the advance, plus a 3% to 5% fee [community-estimated].
- No reliable public rate exists for inventory financing.

**Crowdfunding (the real path for a small new TCG)**

| Game | Raised | Backers | Result |
|---|---|---|---|
| Grand Archive (2021) | $947,400, against a $50,000 goal | 1,539 | Retail release in 2023 [reported] |
| Sorcery (2022) | More than US$4M | 6,456 | Active [documented] |
| Altered (2024) | About €6.2M | About 15,000 | Shut down in 2026 [reported] |
| Cyberpunk TCG (2026) | About $26.95M | 47,676 | The record for a TCG [reported] |

Flesh and Blood used no crowdfund. It launched to local game stores in 2019 with 7 staff [reported].

**Advertising**

- Real TCG marketing is previews, creators, store events, and promo cards. Paid media is small (see the old facts above).
- A Wizards Game Boy TCG campaign had a $4M print and TV budget [reported].
- No public figure exists for a TCG influencer deal. General YouTube sponsorships pay $10 to $50 per 1,000 views. Gaming creators get $500 to $10,000 per video [community-estimated].
- Grand Archive (6 core staff) started with Discord only. Then it added store newsletters, promo cards, and an ambassador program ([GATCG](https://www.gatcg.com/article/dev-update-1-state-of-the-business-and-grand-archive-tcg-future-plans)) [documented].

**Licensing out your own IP**

- Licensed merchandise pays 8% to 12% of net sales. Toys and games average 8.21%. Apparel averages 9.71% ([Licensing Letter](https://www.thelicensingletter.com/average-industry-wide-royalty-rate-up-0-7-percentage-points-to-reach-8-87-in-2019/)) [reported].
- Pokemon had about $12B of licensed retail sales in 2025 [reported].

**New TCG launches, 2023 to 2026**

- Star Wars Unlimited (2024) "far exceeded the sales of any game we have ever released", and demand "notably outpaced supply" [documented].
- Lorcana moved a reprint forward by one quarter because of demand [reported].
- No public data gives the print run or the time to profit for any new TCG.
- Common causes of failure: a funding gap after the first crowdfund (Altered), stores that hold unsold stock (MetaZoo), investors that leave after the hype (Lorcana), and a licensor's own priorities (WoW TCG).

## 6. What makes set creation fun and deep

The games that work have one thing in common. Each creation choice changes a number that the player can see, and a named screen tells the player which choice caused which result.

| Game | Creation mechanic | Depth source | How the game shows the result |
|---|---|---|---|
| **Game Dev Tycoon** | Pick a topic, a genre, a platform, and an audience. Set sliders in three phases (for example, Engine, Gameplay, Story) ([dbbaldwin](https://www.dbbaldwin.com/game-dev-tycoon-cheatsheet/)) | Hidden fit values for each pair: topic with genre, genre with platform, topic with audience ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=199815017)). A repeated combination scores lower ([Pro Game Guides](https://progameguides.com/game-dev-tycoon/best-combos-in-game-dev-tycoon/)). Fans report that the score compares with the studio's previous best [community-estimated] | A review score with a one-line verdict. A paid **game report** after release says which pairs fit and which design areas matter most ([GamerHorizon](https://gamerhorizon.com/2014/01/15/lttp-game-dev-tycoon-review-simgame/)). The game keeps this knowledge. It scored 89 on iOS against 68 on PC ([Wikipedia](https://en.wikipedia.org/wiki/Game_Dev_Tycoon)) |
| **Game Dev Story** (Kairosoft) | Genres and types level up with use | Progress carries to the next playthrough | **Failure:** the late game became "too easy to churn out successful games" ([Pocket Gamer](https://www.pocketgamer.com/game-dev-story/review/)). After the player solves the combinations, the creation step needs new pressure |
| **Mad Games Tycoon 2** | Build engines, research features, add features to a game | A long feature list | **Failure:** the first game "lacks descriptions of its basic features" ([ButWhyTho](https://butwhytho.net/2019/11/26/review-mad-games-tycoon-just-needs-a-better-tutorial/)). More features do not add depth if the player cannot see what each one does |
| **Football Manager** | Each player attribute shows as a **range**. Scouts and time make the range narrower. Hidden attributes show only at deep knowledge ([Passion4FM](https://www.passion4fm.com/football-manager-player-attributes/)) | The player pays to remove uncertainty, then decides when the estimate is good enough | Match results confirm or contradict the estimate. For cards: the market appeal of a card shows as an estimate before release |
| **Two Point Hospital** | Each level has objectives in star tiers. One star unlocks the next level ([Wikipedia](https://en.wikipedia.org/wiki/Two_Point_Hospital)) | Optional harder goals pay more | Stars. Goals in tiers give a game with no win state short-term targets |
| **Prison Architect** | Grants: a concrete goal with a cash reward, for example "build 15 cells" ([Player.One](https://www.player.one/prison-architect-cheats-tips-and-advice-what-ive-learned-after-140-hours-wardens-363143)) | Each goal has strict rules | The grant teaches the rules and pays money. Retailer or licensor contracts can work the same way |
| **Big Pharma** | Machines move a drug's concentration. Each range turns on good or bad effects ([Chemistry World](https://chemistryworld.com/review/big-pharma/9195.article)) | Every choice has a visible number and a visible result | **Failure:** players said it "lacks any incentive or narrative" ([GOG](https://www.gog.com/en/game/big_pharma)). A clear system alone is not enough |
| **Software Inc.** | Pay for reviews during the alpha to measure quality before release ([Steam](https://steamcommunity.com/app/362620/discussions/0/1697167803862010528)) | A paid preview turns hidden quality into a decision | The preview score |
| **TCG Card Shop Simulator** (2024) | Stock, order, and expand a shop. Open packs and resell the cards ([GameDiscoverCo](https://newsletter.gamediscover.co/p/tcg-card-shop-simulator-the-second)) | Foil check (1 in 20), then rarity checks. Ghost foils are the top chase ([Upcomer wiki](https://tcg-card-shop-sim.upcomer.com/wiki/Card_Pricing_Strategies)) | Each card in the reveal shows a rarity and a market price right away. The developer's target was 100,000 copies in one year. It sold 100,000 in three days ([Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-originals/the-solo-dev-who-built-a-card-shop-game-and-watched-it-explode)) |
| **Balatro** | Scoring plays as a sequence. Each card steps forward in turn, the numbers tick up, and the sound gets louder ([Blake Crosley](https://blakecrosley.com/guides/design/balatro)) | The player builds a machine and watches it run | The developer said that a score preview would change "the entire feel" ([GMTK](https://gmtk.substack.com/p/balatros-cursed-design-problem)). Show a result as a sequence, not as one number |
| **Marvel Snap** | Each card has an upgrade ladder. Each tier adds one visible change: the art breaks the frame, then 3D, then animation, then a logo, then a border. The top tier gets one of four finishes ([Snap.fan](https://snap.fan/guides/infinity-splits-and-frame-breaks-guide/)) | The top tiers are scarce. The game launched with more than 1,000 variants [reported] | The card itself shows its tier |
| **Hearthstone** | Golden, signature, and diamond versions of a card. They are "purely aesthetic". Signature cards drop about 1 in 181 packs ([Hearthstone wiki](https://hearthstone.wiki.gg/wiki/Quality)) | Some versions come only as rewards, not from packs | The chase is for the version, not for power |

**For this game:** treatments (foil, alt-art, serialized) are a creation lever. They add no power, but they control how much collectors want a card. The player must see the cost of each treatment and the demand it creates.

### Patterns for deep creation on a phone

These patterns come from the games above.

1. **Few decisions per card.** Give each card 3 to 5 decisions, not 20 fields.
2. **A fixed budget of slots.** Each set has a fixed number of rare, chase, and treatment slots. A pack has a fixed number of cards, so a rarer chase takes slots from somewhere else. Scarcity of the top tier makes the trade-off real.
3. **Combinations to discover.** Pairs such as theme with art style, or creature type with audience, have hidden fit values. A report reveals them over time.
4. **Hidden quality as a range.** Show appeal as an estimate. Research and tests make it narrower.
5. **A hero card in each set.** Each set has one card that the release report follows from design to market price.
6. **Novelty decay.** A repeated combination scores lower, so the late game stays a puzzle.
7. **Goals in tiers.** Contracts and grants give short-term targets.

## 7. How set choices must drive the simulation

This section answers AJ's second reason for the restart.

### What the designers say

- **Tynan Sylvester (RimWorld):** "The whole value of a game is in the mental model of itself it projects into the player's mind." Parts of a simulation that do not reach that model "degrade into noise". He says to "choose the minimum representation that supports the kinds of stories you want to generate" ([Game Developer](https://gamedeveloper.com/design/the-simulation-dream)).
- **Will Wright (SimCity, The Sims):** "As a player, a lot of what you're trying to do is reverse engineer the simulation." A more accurate player model gives "better strategies" ([Game Studies](https://www.gamestudies.org/0102/pearce)).
- **Soren Johnson (Civilization IV):** transparency "fosters many positive traits, including deep engagement, player comfort and meaningful choice" ([designer-notes](https://www.designer-notes.com/a-study-in-transparency)). Also: "Given the opportunity, players will optimize the fun out of a game" ([designer-notes](https://designer-notes.com/game-developer-column-17-water-finds-a-crack)).
- **Banished (negative case):** reviewers criticized "a lack of feedback for player actions" ([Wikipedia](https://wikipedia.com/wiki/Banished_(game))).

### When hidden depth is wasted

Hidden depth is wasted when two things are both true:

1. No screen shows the result.
2. The result is too small to change a later decision.

The old build had both problems.

### Patterns that connect a choice to a result

1. **A release report with reasons.** The report lists the 3 largest causes of the result as signed numbers. Example: "Chase rate: +18% sales. Theme fatigue: -9%."
2. **Review quotes tied to fields.** Each collector, press, or creator line comes from one design choice.
3. **Knowledge that the player keeps.** A rule that a report reveals goes into a codex. The player can read the codex later.
4. **A preview before commit.** A paid test (focus group, playtest, store survey) makes the estimate narrower before the print run locks.
5. **Few, strong levers.** Each lever must change the result by more than the random noise in one run. The research found no source for a threshold. A start value of about 10% is [inferred].
6. **The field audit rule.** Each card field needs (a) a system that reads it, (b) a screen that shows it, and (c) a report line that names it. If a field fails a test, delete it or label it as flavor.

### How to use bots this time

- A human tunes the feel first.
- Bots then look for exploits ("water finds a crack").
- Bots also check that each lever's effect is larger than the noise in one run.
- Bots do not set the feel.

## 8. Many streams of information on a phone

| Game | Mechanic | Lesson |
|---|---|---|
| **Football Manager 26** | Sports Interactive removed the Inbox, because "modern football managers today spend more time on mobile phones than on laptops" ([AltChar](https://www.altchar.com/game-news/football-manager-25-developers-to-remove-inbox-feature-will-introduce-new-one-called-portal-aomEo7q9akK3)). The new Portal puts news, calendar, tasks, and messages on one screen. Critics said it "has loads of panels, making it difficult to find what you're looking for" ([Galaxus](https://www.galaxus.nl/en/page/football-manager-26-is-floundering-in-an-interface-labyrinth-40507)) | One hub works only when it is sorted by priority |
| **Crusader Kings 3** | Alert flags for urgent problems. An Issues tab for long-term states. Alerts must not be "reminders of an ongoing status that you already know about" ([PC Gamer](https://pcgamer.com/the-crusader-kings-3-team-is-working-hard-to-make-the-game-easier-to-learn)) | Separate "act now" from "know this" |
| **Stellaris** | A situation log in categories "ordered by importance and urgency". Repeated items move to a Findings tab. The player can pin items ([PatchTracker](https://patchtracker.gg/stellaris/stellaris-dev-diary-417-situation-log-updated)) | Pins and categories |
| **Anno 1800** | Notification filters. Old news loses priority ([Anno Union](https://anno-union.com/updates/anno-1800-game-update-12/)) | Filters, and news that fades |
| **Reigns** | One card, two choices. Each choice moves four meters ([analysis](https://lochrist.github.io/blog/2017-04-03-reigns-and-emerging-narrative)) | The smallest decision unit for one hand |
| **Frostpunk** | Each law shows a preview of its effect on the hope and discontent meters ([Xbox Wire](https://news.xbox.com/en-us/?p=126631)) | Show the effect before the choice |

### A pattern for many streams without overload

1. **Three priority levels.** *Act now* pauses the game and shows a badge. *This week* goes to the hub. *Feed* is flavor only.
2. **One voice for each stream.** Press, retailers, collectors, creators, and social media each get a tab. Each tab shows one number for its stream (for example, retailer sentiment) and a short trend line.
3. **A weekly digest.** It shows what changed and why. Each line links to its cause.
4. **Aggregate before you show.** Show "47 posts about the Ember chase card, 80% positive". Do not show 47 posts.
5. **Swipe cards for small decisions.** Use Reigns-style yes or no cards for low-cost choices, for example a retailer request or a creator offer.
6. **Pins and filters,** as in Stellaris and Anno.

## 9. No win, but a lose state

| Game | Mechanic | Lesson |
|---|---|---|
| **Frostpunk** | Warnings in stages. A meter reaches a critical level. The game offers solutions. Then an ultimatum: move the meter 15% in two days, or the people exile you ([Gamepressure](https://www.gamepressure.com/frostpunk/what-happens-when-discontent-or-hope-reach-critical-values/zfad7c)) | The player always sees the end coming and gets a last chance |
| **Game Dev Tycoon** | The game ends if cash stays below zero for 90 days in a row [community-estimated] | A clock gives time to recover |
| **Football Manager** | The Confidence screen shows the board and the fans as separate bars ([FMScout](https://www.fmscout.com/confidence.htm)) | Separate meters for separate groups |
| **RimWorld** | The storyteller eases off when the colony is small ([Game Developer](https://gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)) | A struggling player gets room to recover |
| **Reigns** | A death brings the next monarch. The game counts deaths as a collection ([TechRaptor](https://techraptor.net/content/reigns-review-addicted-death)) | Loss can be content |
| **Banished** | A player traced a death spiral only after the collapse: stone, then tools, then food, then starvation ([GOG forum](https://gog.com/forum/banished/everyone_died_off_at_once_with_food_to_spare)) | **Failure:** the chain was not visible while it happened |

### Structure that the research supports

1. **Three meters, each with its own clock:** cash runway (in weeks), brand health, and retailer trust. Any one can end the company. The real cases match: Altered (cash), MetaZoo (goodwill and stores with unsold stock), and Fallen Empires (retailer trust).
2. **Warnings in stages:** a warning, then options, then an ultimatum with a clock.
3. **Recovery tools that cost the future:** an emergency loan, a cheap reprint, a sale of IP rights, or layoffs.
4. **A cause-of-death screen.** It shows the 3 to 5 decisions that started the spiral, with dates. The cards that the player designed are the evidence.
5. **Loss ends the save, but a legacy stays.** The codex of discovered combinations, a list of past companies, and a hall of fame of hero cards carry over. A full comeback path takes away the tension.

## 10. Quality of life on a phone

| Item | Example | Source |
|---|---|---|
| Short sessions with natural stops | FM Mobile: a season "in a few days" | [TouchArcade](https://toucharcade.com/2015/12/01/football-manager-mobile-2016-review/) |
| One-hand use | Reigns: one card, two choices | [analysis](https://lochrist.github.io/blog/2017-04-03-reigns-and-emerging-narrative) |
| Shallow menus | RimWorld console: "never more than three button presses away" | [DualShockers](https://www.dualshockers.com/bringing-rimworld-from-pc-to-console-interview/) |
| Large touch targets | Civ VI iPhone: the port's main change was bigger buttons | [Macworld](https://www.macworld.com/article/3310235/gaming/civilization-vi-iphone-review.html) |
| A battery budget | Civ VI: strong battery drain on older iPhones | [Macworld](https://www.macworld.com/article/3310235/gaming/civilization-vi-iphone-review.html) |
| Cards instead of tables | FM Touch 2016: "chunky cards" for players | [Pocket Gamer](https://www.pocketgamer.com/football-manager-touch-2016/review) |
| No dense menu trees | FM Handheld 2015: "awful to navigate" | [GodIsAGeek](https://www.godisageek.com/reviews/football-manager-handheld-2015-review/) |
| Built for the phone, not stretched from a PC | Game Dev Story iPhone: "not optimized" | [Pocket Gamer](https://www.pocketgamer.com/game-dev-story/review/) |
| Auto-pause on events that need action | CK3 alerts; Frostpunk ultimatums | Section 8 |
| A hub sorted by priority, with pins and filters | Stellaris, Anno 1800 | Section 8 |
| A paid preview before commit | Software Inc. alpha reviews | Section 6 |
| A tooltip that explains a number | Frostpunk law previews | Section 8 |

The research found no strong source for these items. They are standard practice, and the old build needed them:

- **Templates.** Copy the structure of the last set.
- **Bulk actions.** Set the treatment for all commons in one step.
- **Compare.** Show two sets side by side.
- **Undo.** Undo any decision before the print run locks.
- **Autosave.** Save at each week boundary, with a rolling backup for each slot.

## 11. SwiftUI and sideload practicalities

**Current versions on 2026-11-10:** iOS 27.2.1, Xcode 27, Swift 6.4.2. iOS 27 supports every iPhone that iOS 26 supports ([Wikipedia](https://en.wikipedia.org/wiki/IOS_27)).

### Sideload

| Item | Free Apple ID (Personal Team) | Paid Apple Developer Program ($99 per year) |
|---|---|---|
| App expiry | 7 days. Then rebuild and reinstall from Xcode | About 1 year |
| Limits | 3 apps per device, 3 devices, 10 App IDs | No practical limit |
| iCloud and CloudKit | Not supported | Supported |

Sources: [Apple, compare memberships](https://developer.apple.com/support/compare-memberships/), [Apple Developer Forums 838074](https://developer.apple.com/forums/thread/838074).

- **Developer Mode** must be on: Settings > Privacy & Security > Developer Mode ([Apple](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)).
- **Wireless install** works after you pair the iPhone with a cable one time. Some users report failures on Xcode 26.5 ([Forums 827644](https://developer.apple.com/forums/thread/827644)).
- **Save data:**
  - When the profile expires, the app does not open, and iOS can offer to delete it. **Do not delete the app.** Deleting the app deletes its saves.
  - A reinstall from Xcode with the same bundle ID keeps the saves. Only third-party sources say this. Test it one time with a dummy save.
  - A move from the free team to the paid team changes the Team ID. Data that depends on the Team ID can be lost ([Forums 803229](https://developer.apple.com/forums/thread/803229)). **Export the saves before you change teams.**
  - Export works without iCloud. Set `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` so that the Files app shows the saves. A `ShareLink` can also send a save to AirDrop.

### Data volume

300 sets × 280 cards = 84,000 cards. A weekly price for 50 years is about 218 million points, or about 870 MB as `Float32` [inferred]. **The price-history design is the main technical constraint.** Keep weekly prices only for recent years and for important cards, and keep coarse prices for old data.

### Save storage

| Option | Verdict |
|---|---|
| **GRDB (SQLite)** | **Recommended.** Fast bulk writes, atomic transactions, explicit migrations, and one file per save slot. GRDB 7 supports Swift 6 concurrency ([Swift Forums](https://forums.swift.org/t/grdb-7-is-out/77465)) |
| SwiftData | Slow inserts and no batch insert. iOS 26.1 broke some existing stores (error 134140) ([Forums 806161](https://developer.apple.com/forums/thread/806161)). Known problems remain in iOS 27 ([Tsai](https://mjtsai.com/blog/2026/06/23/swiftdata-in-appleos-27/)) |
| Core Data | Mature, but Apple has added no new features for 2 years |
| Codable files | Simple and atomic, but the app rewrites the full file on each save. Not practical for large history |

### Simulation core

- Put the simulation in a **pure Swift package** with no UI imports. `swift test` runs it on the Mac without a simulator.
- **Do not use the standard library's random functions for determinism.** Apple says the algorithm "may change in a future version of Swift" ([Apple](https://developer.apple.com/documentation/swift/int/random(in:using:)-4lsb5)). Write a SplitMix64 or Xoshiro256** generator and your own range functions. Add a test that pins the output sequence.
- A `SimEngine` actor owns the state and runs ticks in batches. After each batch, it sends a small snapshot to a `@MainActor @Observable` store. Send no more than about 10 to 30 snapshots per second during fast-forward.
- A large struct state can copy whole arrays by accident. Mutations through a dictionary value or a computed setter are the usual cause ([Swift Forums](https://forums.swift.org/t/property-wrapper-causing-excessive-array-copying/30637)). Measure with Instruments.

### UI

- **Charts:** Swift Charts vectorized plots (`LinePlot`, iOS 18) are still slow above about 2,000 to 3,000 points ([Forums 763757](https://developer.apple.com/forums/thread/763757)). Downsample to a few hundred points.
- **Pack reveal:** `PhaseAnimator`, `KeyframeAnimator`, and `sensoryFeedback` (haptics) all work on iOS 17 and later.
- **Holographic foil:** SwiftUI `layerEffect` runs Metal shaders. MIT examples exist: [ShaderKit](https://github.com/jamesrochabrun/ShaderKit) (`HolographicCardContainer`, with tilt), [Sticker](https://github.com/bpisano/Sticker) (a Pokemon-style foil), and [Inferno](https://github.com/twostraws/Inferno). Xcode 26 and later need `xcodebuild -downloadComponent MetalToolchain`.

### Workflow for Claude Code

- Build and run on the simulator from the command line: `xcodebuild`, `xcrun simctl install`, `xcrun simctl launch`, and `xcrun simctl io booted screenshot`.
- **MobileBuildMCP** (formerly XcodeBuildMCP) can build, tap, swipe, read the accessibility tree, and take screenshots without Xcode open ([repo](https://github.com/getsentry/XcodeBuildMCP)).
- A `SimState.sample(seed:)` factory gives SwiftUI Previews realistic data.

### Recommended stack

| Choice | Pick | Reason |
|---|---|---|
| Signing | Paid program ($99 per year) | 1-year profiles instead of 7 days |
| Minimum OS | iOS 18 | Needed for `LinePlot` and `PreviewModifier` |
| Simulation | Pure Swift package, nonisolated | Tests run on the Mac |
| Random numbers | Own SplitMix64 or Xoshiro, with a golden test | The standard library algorithm can change |
| Tick runner | `actor SimEngine`, batched | Keeps the UI free |
| UI state | `@MainActor @Observable` store with snapshots | The pattern that the sources recommend |
| Saves | GRDB, one SQLite file per slot | Atomic, fast, explicit migrations |
| Price history | Packed `Float32`, coarse for old data | Full weekly history is about 870 MB |
| Foil | `layerEffect`, start from ShaderKit or Sticker | MIT examples exist |
| Backup | Files app access and `ShareLink` export | Works without iCloud |

### The 5 largest technical risks

1. **Price-history volume.** Set a storage budget before you write code.
2. **Save loss from signing changes.** Build save export first.
3. **Accidental copies in a large state struct.** Measure with Instruments.
4. **Too many UI updates during fast-forward.** Throttle the snapshots.
5. **Swift Charts limits.** Downsample, or draw with `Canvas`.

## 12. Decisions for AJ

**AJ answered these questions on 2026-11-10. The answers are in `docs/decisions.md`.** Some answers differ from the recommendations below, for example D8, D12, and D13. Use `docs/decisions.md`, not this section, as the source of truth.

Each question gives the options, the evidence, and a recommendation. The recommendation is only a recommendation. AJ decides.

### D1. How many cards does the player design by hand in each set?

- **A.** All of them (about 200 to 280).
- **B.** A featured group of 10 to 20 cards by hand, with 3 to 5 decisions each. The game makes the other cards from set-level rules, and bulk tools edit them.
- **C.** Set-level choices only. No card-level design.

**Evidence:** the old build designed every card and was not fun. Good creation games give each item 3 to 5 decisions (section 6). A real set has about 280 cards (section 5).
**Recommendation:** B.

### D2. Do you design the creatures and characters themselves?

- **A.** Yes. Name each creature, and pick its type, its look (from parts), and its evolution line.
- **B.** The game offers generated creatures, and you pick, rename, and combine them.
- **C.** No. Creatures are generic. The design work is at the card level.

**Evidence:** the old concept said that the core fantasy is a card you printed as filler that becomes a grail years later. Football Manager shows that hidden appeal, seen as a range, makes a roster interesting (section 6).
**Recommendation:** A, with a hidden appeal value that shows as a range.

### D3. Which hidden combinations does the player discover?

- **A.** Creature type × art style × audience (kids, collectors, players), like Game Dev Tycoon.
- **B.** A different set of pairs that you choose.
- **C.** No hidden combinations. All effects are visible.

**Evidence:** Game Dev Tycoon (section 6). Novelty decay keeps the late game a puzzle. Game Dev Story became "too easy" without it.
**Recommendation:** A, with novelty decay and a codex that keeps what the reports reveal.

### D4. Which market regime does the game simulate?

- **A.** The 1994 to 2001 regime: overprint kills you (Fallen Empires, the 2001 Pokemon decline).
- **B.** The 2021 to 2026 regime: shortage is permanent, and scalpers are everywhere.
- **C.** Both, as phases of one arc. The phenomenon grows into shortage. Your print decisions decide whether you get a 2001 collapse or a 2021 expansion.

**Evidence:** section 3. The old research left this question open.
**Recommendation:** C.

### D5. How does the company start?

- **A.** A garage start with savings, and a crowdfund as the first big decision.
- **B.** A small funded studio with a bank loan.
- **C.** You pick at the start.

**Evidence:** real small TCGs raise $0.9M to $27M by crowdfunding. Flesh and Blood launched to local stores with 7 staff (section 5).
**Recommendation:** A. The crowdfund teaches the systems, and Altered shows that it can also fail.

### D6. Which funding tools exist?

- **A.** Bank loans (prime plus 3% to 6.5%, personal guarantee), revenue-based financing (repay 1.1x to 2.5x), and crowdfunds.
- **B.** A plus outside investors, who take equity and can push you.
- **C.** Bank loans only.

**Evidence:** section 5.
**Recommendation:** A for the first version. Investors are a good later system.

### D7. Which deal types exist for collaborations?

- **A.** Crossover sets (you license another brand in: royalty 5% to 15%, an advance, a minimum guarantee, a lead time of years).
- **B.** Licensing out (other companies make toys or apparel from your IP: you get 8% to 12% royalties).
- **C.** Promotions (fast food, cereal, museums, music artists: large reach, scalpers, and safety risk).
- **D.** Creators and artists (preview access, free product, signature cards).

**Evidence:** sections 4 and 5. Each type has a different real risk shape.
**Recommendation:** all four, each with its own contract card. Start with C and D, because they come early in a small company's life.

### D8. How does the company lose?

- **A.** Three meters (cash runway, brand health, retailer trust), warnings in stages, recovery tools, and a cause-of-death screen. Loss ends the save. A legacy (codex, hall of fame) carries over.
- **B.** Cash only: bankruptcy after a clock below zero.
- **C.** Meters as in A, but a comeback path keeps the save alive.

**Evidence:** section 9. Altered, MetaZoo, and Fallen Empires each match one meter.
**Recommendation:** A.

### D9. What is one tick, and what is one session?

- **A.** One tick is one week. The game auto-pauses on "act now" events. A session is about one set cycle.
- **B.** One tick is one day, for fine control of release days and drops.
- **C.** One tick is one month.

**Evidence:** the old build used week, month, and quarter skips. Phone sessions must have natural stopping points (section 10).
**Recommendation:** A, with release day shown as a special event of its own (queues, campouts, sell-out time).

### D10. How does the information hub work?

- **A.** Three priority levels (act now, this week, feed), one tab for each stream, a weekly digest with causes, and swipe cards for small decisions.
- **B.** One inbox, like the old Football Manager.
- **C.** Something else that you describe.

**Evidence:** section 8. Football Manager removed its inbox for mobile reasons.
**Recommendation:** A.

### D11. Do rival publishers exist?

- **A.** No. The old build cut them. You compete against the audience, the calendar, and your balance sheet.
- **B.** Yes, as simple background actors that take attention and copy your hits.

**Evidence:** the old build cut rivals on 2026-09-04. Your new pitch does not mention them.
**Recommendation:** A for the first version.

### D12. What do you build first?

- **A.** A vertical slice of one set: design the featured cards, print, reveal, open packs, and read the release report. A simple market is enough at first.
- **B.** The economy first, then the screens.
- **C.** The information hub first.

**Evidence:** the old build did B and failed. The design research recommends the release report and the field audit rule first, and the pack reveal close behind (section 7).
**Recommendation:** A. Apply the field audit rule from the first commit: no card field without a reader, a screen, and a report line.

### D13. Which Apple account do you use?

- **A.** The paid Apple Developer Program ($99 per year). The app runs for about 1 year between installs.
- **B.** A free Apple ID. You rebuild from Xcode every 7 days.

**Evidence:** section 11.
**Recommendation:** A. If you start on B, build save export before you move to A.

### D14. Real dollars or abstract numbers?

- **A.** Real dollars, based on the measured facts (a $0.30 median card, a $140 box).
- **B.** Abstract units.

**Evidence:** the old research recommended real numbers, and it found that the real price distribution is a power law with a soft floor (section 5).
**Recommendation:** A. Real numbers make the news and the market feel true.
