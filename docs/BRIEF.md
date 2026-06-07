# TCG Manager Simulator — Build Brief

A browser-based management sim where you run a trading card game company. You don't play the card game — you *publish* it. Design sets, release them on your own schedule, watch the secondary market and the competitive metagame react, manage a living community of named personalities, and try not to power-creep or over-print your way into bankruptcy. Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is cardboard.

This brief specifies a complete, buildable **v1**, plus a **v2 roadmap** of parked features.

> **Build status legend** (added as a living checklist; the spec text below is unchanged):
> ✅ built & wired · ⏳ partially built — gap noted · ⬜ not started.
> As of the latest commit, the **v1 core loop is built and playable**; remaining gaps are marked ⏳/⬜ inline.

---

## Platform & tech constraints

- **Single-file browser app** (React preferred). No backend, no server, no database — all state in memory (and optionally serializable to a save string the user can copy/paste, if cheap to add).
- **Turn-based simulation**, not real-time gameplay. The "sim" is numbers-and-text resolving on a clock. No playable card battles.
- **Variable-speed clock** (see Time System). Weeks are the underlying unit.
- Data-heavy UI: dashboards, feeds, a card editor, a market ticker. Lean on a clean component structure with a colorful skin (see Visual Direction).

---

## Core loop ✅

The engine of the whole game is **format decay**:

1. You release a set → the metagame refreshes, engagement and sales spike.
2. Week by week, the community **solves** the format → engagement and sales decay.
3. The decay pressures you to release again — but each release risks **power-creep debt**, which erodes long-term metagame health.
4. Meanwhile the **secondary market** reacts to every release (some cards pop, some flop), the **community personas** react and amplify, and **events** keep throwing curveballs.

You survive as long as you balance fresh-product pressure against power-creep, over-printing, and community goodwill. There is **no win condition** — it's an open-ended run you play until you're bored or you lose.

### The start & loss conditions ✅
- **You start from nothing** — 0 players, 0 satisfaction (neutral); nobody knows
  your game yet. You grow a base by **releasing sets** (each launch is a
  hype-sized discovery wave) and **word-of-mouth** (an additive weekly trickle
  scaled by how fresh/diverse/well-liked your game is). A brand-new studio is
  safe — starting empty is not a loss.
- Cash, players, and satisfaction are **recoverable pressures**, not instant-death
  lines — they crater your *sales* when low, but you can dig out:
  - **Cash can go negative** — a loan, carrying compounding weekly interest. A
    brief dip is cheap; chronic deep debt snowballs.
  - **Players / satisfaction can fall and recover** — a thin base or a soured
    community hurts sales but isn't fatal on its own.
- Only three genuine ruins end a run:
  - **Debt spiral** — cash past a catastrophic floor (~−$3M); the interest alone
    is unpayable.
  - **Broke and abandoned** — deep debt (< −$100k) AND essentially no players
    (< 500) at once: no market to recover with.
  - **Total revolt** — community sentiment hits the −100 floor.

---

## Time system ✅

A **play / pause / fast-forward** clock running in weeks.

> **Status:** the clock is now **manual** — the player clicks **Advance Week** to
> step the sim one week at a time (no auto-timer / speed) ✅. The old attention
> system (`clock.js`) is repurposed: instead of auto-slowing/pausing, it surfaces
> a one-line **"what changed this week"** note in the header — a card crossing a
> ban-pressure threshold, a sharp market mover, a notable player swing, a dramatic
> event, cash dipping into the danger zone (`clock.js`, applied in `useGame.js`).
> The three loss conditions are surfaced as always-visible **health meters** in
> the header (cash / players / satisfaction), each reddening near its threshold.

- Time is a deliberate step: each week is a click, so the player always advances
  intentionally rather than racing or pausing a timer.
- After each week, a short note flags anything worth a look (a card spiking, a
  ban threshold crossed, a major event, a low-cash warning).
- The header's three **death-spiral meters** make every way to lose legible:
  cash → $0 (bankrupt), player base → 0 (community gone), satisfaction → −60
  (the community revolts). Each meter shows its loss line and turns red as it
  approaches it.

---

## Set creation flow ✅

A set is created in two layers:

### 1. The slider layer (the bulk of the set)
High-level levers that generate the ~150 commons/uncommons procedurally from a power budget and theme:
- **Power budget** — overall strength ceiling of the set. Higher = stronger cards, bigger short-term sales, more power-creep debt.
- **Rarity distribution** — how chase-heavy vs. accessible the set is.
- **Print run size** — supply. Under-print → scarcity & high secondary value but lost sales & frustrated players; over-print → bargain bins & crashed values.
- **Theme / mechanics** — flavor identity + 1–2 set mechanics that interact with the metagame's archetype balance.
- **Price point** — MSRP of sealed product.

### 2. Signature cards (the 5–10 cards that define the set)
Hand-designed by the player, with a **per-card granularity toggle**:
- **Flavor-only:** name, art, rarity, a single overall power rating.
- **Full mechanical:** rules text / keywords / stats the sim parses for balance impact.

The player can mix freely — make one card "the most broken thing ever printed" with full mechanical control, and another pure flavor. Signature cards are what the secondary market and personas react to most strongly.

### Artist commissioning ✅
A roster of **~30+ named artists**, each with:

> **Status:** 44-artist roster, commission picker in the card editor, cost +
> reach feed a card's art-appeal pop factor and the "beloved artist" event ✅.
> **Trajectory is now live** (`artists.js`): each artist's cost/reach drift weekly
> by trajectory — rising stars climb (and can graduate or *break out* in an
> event), fading names decline — over a long run, not every week. The set-builder
> dropdown shows a trend cue (↑ rising / ◆ established / ↓ fading) so a cheap
> rising star is spottable before it blows up ✅.
- **Style specialty** (affects which themes/cards they elevate).
- **Cost** (commission fee).
- **Reputation / reach** (popular artists boost a card's collectibility ceiling and market appeal).
- **Trajectory** — rising stars are cheap now but may blow up; established names cost a fortune.

Commissioning a hot artist for a chase card is a real budget decision that feeds the market's "art appeal" pop factor. Make artists specific and quirky, not interchangeable.

### Prerelease events (Build & Battle style) ✅
A simple pre-launch toggle — **no locations to pick**. One real sub-decision:
- **Are chase cards pullable from prerelease product?**
  - Yes → more hype + early revenue, but the meta gets solved sooner and launch-day chase scarcity deflates.
  - No → preserves the launch, less early buzz.

---

## The secondary market ✅

The reward system. The fun is **watching cards pop or flop**, with enough variance that outcomes aren't fully predictable from your inputs.

- Each card has a hidden blend of **pop factors**: playability (meta relevance), rarity, art appeal (artist-driven), and theme/hype.
- Post-release, the market resolves with **real variance plus momentum**: a card you under-valued can catch fire; a "guaranteed chase" can land flat; hype builds or collapses over weeks.
- Track **sealed product** and **singles** prices separately. Reprints crush singles values; print run drives sealed scarcity.
- A live **market ticker** surfaces movers — juicy animations when a card pops (this is where the color budget pays off).
- Speculative bubbles are possible (especially persona-driven hype) and can burst.

> The player runs a real card store IRL and will have strong intuitions here — the model can be genuinely market-accurate (supply vs. demand, reprint pressure, sealed vs. singles divergence) rather than hand-wavy.

---

## Metagame health (four interacting dials) ✅

> **Archetype Balance update:** this dial is now backed by a real **distribution**
> over the four play styles (`archetypes.js`), not a lone scalar. Releases tilt
> the field toward the set's theme lean (scaled by power budget), solving
> concentrates it toward the dominant deck, and bans/rotations flatten it. The
> 0–100 "balance" is derived from how even the split is, and player segments now
> react to the *shape* — a one-style format drives out the squeezed-out players
> (verified: a mono-aggro field collapses the competitive segment). Shown as a
> four-way split bar in the Metagame panel; the set builder shows each theme's lean.

Not a single bar. Four dials that interact and pull on different player segments:

1. **Diversity** — how many archetypes are viable, and how evenly. One deck at 60% of the field = an oppressive/solved format even if only mildly too strong.
2. **Power level** — the format's ceiling. Creeps up whenever you print strong cards. High power makes older cards obsolete (collectors & grinders resent it) and shortens format freshness.
3. **Archetype balance** — the aggro / control / combo / midrange rock-paper-scissors. If one style dominates, the players who prefer the squeezed-out styles leave.
4. **Solve level** — how "figured out" the format is. Resets toward fresh on a set release, then **decays weekly** as the community cracks it. *This decay is the core-loop engine.*

These should be partly obscured by feedback noise (see below) — the player infers health from a mix of lagging stats and chatter, not a perfect readout.

---

## Player segments ✅

The market and metagame are populated by segments that react differently to the same decision:

> **Status:** the three segments exist, are moved by events, bans, rotations, and
> reviewer/streamer sway, and now *passively drift* from the four metagame dials
> each week — competitive bleed on a solved/oppressive format, casual churn out
> of a stale one, collectors bleed as power level creeps (`segments.js`). So a
> rotting meta thins the base on its own, giving the player-base death spiral its
> slow on-ramp ✅.
- **Competitive players** — care about diversity & solve level.
- **Casual / combo players** ("new toys" crowd) — want fresh mechanics & power.
- **Collectors / investors** — track chase value, art, and scarcity.

Almost no decision pleases all three. That tension is the game.

---

## Community personas (lean v1) ✅

A roster of **~15–20 named, specific, quirky personalities** who put faces on the community and make every other system talk to each other. Each has:
- **Reach** — how many players they move.
- **Taste profile** — what they actually care about (power / value / art / fairness / fun).
- **Credibility** — separate from reach (this powers signal-vs-noise).
- **Type** — streamer, competitor/pro, collector-investor, set reviewer/critic, theorycrafter.

They don't just comment — they **cause effects**:
- A **streamer** opening launch product can spike a card's demand (live market pop).
- A respected **competitor** calling a card broken accelerates ban sentiment.
- A **collector/investor** influencer hyping a card can inflate a bubble that later bursts.
- A **reviewer/critic** drives early sales sentiment on a new set.

This is where **signal vs. noise** gets teeth: a high-reach, low-credibility rage-baiter screaming about a fine card vs. a quiet, sharp competitor with a real read. Over a long run the player learns to recognize voices. Persistent named characters also give each playthrough a story.

*(The relationship/sponsorship management layer — cultivating personas, comping product, sponsoring them — is parked for v2.)*

---

## Feedback system ✅

Two channels, deliberately not always in agreement:

- **Stats dashboard** — cash, active player base, sales (sealed & singles), the four metagame dials, set performance.
- **Qualitative feedback feed** — a stream of persona/community chatter that **sometimes lies**. A loud minority rages about a statistically fine card; a quietly broken card draws no complaints yet.

The skill the game tests is **telling signal from noise** — judgment, not number-maxing.

---

## Events feed ✅

A news/events stream that gives an endless run texture and keeps year 6 different from year 2:
- Counterfeiting scandals, tournament-cheating stories, a beloved artist whose cards suddenly spike, print-run / supply-chain issues, a card so dominant the community demands a ban, viral moments, etc.

---

## Bans & rotations ✅

Tools the **player** wields, with **unpredictable community blowback**:
- Banning a hated, oppressive card can be celebrated *or* backfire, depending on hidden community sentiment.
- Rotations restore metagame diversity & reset power creep, but cost goodwill (especially with collectors holding rotated cards).

---

## Economy & loss conditions (summary) ✅

- **Revenue:** sealed product sales (driven by hype, reviews, prerelease, print run, price point), secondary-market activity feeding back into engagement.
- **Costs:** set development, print runs, artist commissions, prerelease events, (later: sponsorships).
- **Lose** when **cash** or **active player base** hits zero.

---

## Visual direction ✅

Pragmatic and colorful:

> **Status:** clean dashboard skeleton with the vivid crimson/noir skin ✅. The
> frontend-polish pass is done: a **live card-frame preview** in the set editor
> (rarity-foiled frame, themed art placeholder, rarity gem, artist credit),
> **per-theme/rarity set symbols** (`SetSymbol.jsx`) on cards, the ticker and
> Sets in Print, **punched-up ticker reactions** (big-mover glow/scale, sparklines),
> and a dashboard shine pass (per-dial colours, the archetype split bar, panel
> depth/hover) ✅.
- **Clean dashboard skeleton** for the data-heavy parts (easiest to build, correct for a sim).
- **Color budget spent where it's cheap and high-impact:** vivid palette, real card-frame styling and art in the card editor, set symbols, and animated market-ticker reactions when a card pops.
- Colorful skin over a clean structure. A frontend-design polish pass at the end.

---

## Suggested state shape (lightweight sketch for Claude Code) ✅

> **Status:** implemented in `src/game/initialState.js`, closely matching this
> sketch. Save/load serialization (the brief's optional copy/paste save string)
> is not implemented ⬜.

```
GameState {
  week, cash, playerBase, segments: { competitive, casual, collectors },
  metagame: { diversity, powerLevel, archetypeBalance, solveLevel },
  sets: [ { id, name, theme, powerBudget, rarityDist, printRun, price,
            signatureCards: [...], prerelease: {...}, releasedWeek } ],
  cards: [ { id, setId, name, rarity, artistId, popFactors:{...},
             sealedPrice, singlePrice, priceHistory:[...] } ],
  artists: [ { id, name, specialty, cost, reach, trajectory } ],
  personas: [ { id, name, type, reach, credibility, taste, sentiment } ],
  feedbackFeed: [...], eventsFeed: [...],
  clock: { speed, paused, pauseReason }
}
```

---

## v2 roadmap (parked features) ⬜

Grouped into three layers. Each assumes the v1 core loop is solid first.

> **Shipped since v1** ✅ — three depth features have since been built on top of
> the core loop:
> - **Booster formats** — the player authors the pack structure slot-by-slot
>   (counts + which rarities each slot pulls, with chase "escalate" slots), from
>   presets or fully custom. (`rarities.js`, `packs.js`, `PackFormatEditor`.)
> - **Counter cards** — a signature card can be designed to answer a specific
>   live card (a silver bullet that nerfs it and bleeds its ban pressure — defuse
>   by design instead of banning) or a whole archetype (broad tech that pushes
>   the metashare off a runaway play style). (`sets.js` `applyCounters`,
>   `archetypes.js` `shiftAway`.)
> - **Distributors & scalper culture** — sign bulk-buyer clients (a Pokébank-style
>   "card bank," big-box, LGS co-op, flippers, importers) who buy huge volume at
>   a wholesale discount for cash now, then flood the resale channel. Heavy
>   flooding raises a **scalper-heat** gauge; over the threshold the game tips
>   into a scalper market — singles spike short-term, but casual players are
>   priced out (segment bleed), the community sours ("a scalper's game"), and the
>   bubble can pop (a crater + sealed-sales glut). Hits all three death spirals.
>   A partial, gameplay-first realization of the market-depth layer below.
>   (`distributors.js`, `DistributorsPanel`.)
> - **Pull from publication** (replaced the old "rotate the oldest set" lever) —
>   stop printing any chosen set: its singles spike on scarcity, its sealed
>   appreciates out of print, collectors are thrilled, and it leaves the
>   competitive format (the same power-creep/diversity relief rotation gave). The
>   real cost is the forfeited future pack sales. (`bans.js` `pullFromPrint`.)
> - **Reprints** — two kinds. **Set-level:** re-issue a whole set as an Unlimited
>   run (fresh supply to sell; the original printing becomes a permanent
>   first-edition premium — the Base/Shadowless effect), especially lucrative on
>   a set whose scarcity you pumped by pulling it first. **Card-level:** in the
>   set builder, reprint a beloved card from an old set into the new one — a
>   fan-service draw that lifts the new set's hype while softening the original.
>   Realizes the "1st-Edition vs Unlimited" and "reprints as a market-management
>   tool" items parked below. (`sets.js` `reprintSet` / `applyCardReprints`.)
> - **Product SKUs** — a set ships a player-chosen product lineup beyond boosters:
>   bundles (casual value), a collector box / SPC (low-volume, high-margin,
>   collector-leaning, can carry an exclusive promo), and tins (impulse). Each SKU
>   has its own price, print run, supply cap, and segment appeal, and sells on its
>   own weekly demand curve — more channels mean more revenue but a bigger up-front
>   print bet. Boosters remain the base product, economically unchanged.
>   (`products.js`, `ProductLineupEditor`; per-SKU resolution in `revenue.js`.)
> - **Promo cards & organized play** — cards you can NEVER pull from a booster,
>   awarded instead through funded programs (championship circuits, league
>   seasons, prerelease events). Each program costs cash, grows the competitive
>   segment, warms sentiment, and mints a scarce, unpullable promo that trades as
>   a prestige grail (a collector-box SKU can also carry an exclusive promo).
>   (`organizedplay.js`, `OrganizedPlayPanel`; `packs.js` excludes promos.)

### A. Product & market depth

- **Regional staggered releases (as a hype engine, not just logistics).** A lead region drops the set first to build anticipation; the main region's drop then "goes nuts." The early region functions as both a **hype builder** and a **preview/information channel** — the player and community see which cards popped in the lead region before the wide release, which shapes anticipation and the player's print/marketing decisions. Sets get **renamed and slightly restructured** between regions (different names, tweaked card lists), mirroring how Japanese sets are renamed/recombined for Western markets. *(Player's reference example: "Ninja Spinner" → "Chaos Rising.")* This reframes the originally-parked geography layer around hype/info flow rather than pure logistics.

- **Serialized cards & variants.** A whole secondary-market depth layer:
  - **Serial-numbered cards** (e.g. /99, /10, 1/1) as ultra-chase pull-rate lottery items that drive sealed demand and create market legends.
  - **1st Edition vs. Unlimited** print distinction — a 1st-Edition stamp creates a permanent premium tier (the real-world Base Set Charizard effect). A core collector-economy lever.
  - **Reprints as a market-management tool** — reprint a runaway single to crush its price and improve accessibility, at the cost of angering collectors holding it. Direct tension lever against the secondary market.

### B. Relationship & community depth

- **Deeper persona relationships & creator sponsorship.** Expands lean-v1 personas into a full management minigame: cultivate relationships over time, **seed streamers/creators with product early** as a hype lever (with risk — looks like favoritism, or a sponsored creator pans the set anyway), sponsor pros, invite to prereleases, run sponsored tournaments. Upside hype; downside a big name turning on you mid-relationship hits *harder* because of their reach. Folds in the original tournament-sponsorship idea.

- **Competitors / rival TCGs** *(possible — v1 is scoped "you vs. the market," but a rival publisher fighting for player attention and shelf space is a natural expansion that would make release timing and power level decisions more adversarial).*

- **Elaborate special release events** — midnight launches, anniversary sets, themed drops.

### C. Business expansion & cultural impact (the long-run ambition layer)

These give a long, win-condition-less run something to *build toward* and insulate a mature brand against metagame churn.

- **Official merchandise** — plush, apparel, accessories, art books. A revenue stream **decoupled from metagame health**, so it acts as a stability/diversification lever and a brand-building investment rather than a card-sales gamble.

- **Cross-media ventures** — someone wants to make an anime, a video game, or a film out of your game. Big, expensive, risky bets that, if they land, **massively expand the player base and brand longevity** (and partially insulate you from format churn) — modeling the cultural-impact flywheel that turns a card game into a phenomenon. This is effectively the endgame ambition for a deep run.

---

## Open tuning notes

- Balance the solve-level decay rate so the release cadence feels like a real TCG (sets every few months), not a treadmill.
- Tune variance in the market so surprises happen often enough to be exciting but not so often that player inputs feel meaningless.
- Calibrate the feedback noise ratio so signal-vs-noise is a real skill, not a coin flip.
