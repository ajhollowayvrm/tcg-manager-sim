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

> **Status:** manually banning a card is retired from the UI as of the
> collector/reseller pivot — `bans.js`'s `banCard` is kept only for the
> headless playtest harness (`tools/playtest.mjs`), with no in-game way to
> trigger it. **Pull from publication** (below, under Shipped since v1) is
> the live player-facing lever: pick any set, stop printing it, and its
> cards leave the format on a scarcity pop instead of a ban's crater.
> `rotateFormat` (retire the oldest set(s)) is likewise kept only for the
> harness. Ban pressure itself still runs headlessly — personas and events
> keep nudging a card's `banPressure`, which still feeds the clock's
> attention note and gives a counter card something to answer — the player
> just responds to it by designing a counter or pulling the set, not by
> clicking Ban.

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
>   tool" items parked below. (`sets.js` `reprintAsUnlimited` / `applyCardReprints`.)
> - **Product SKUs** — a set ships a player-chosen product lineup beyond boosters:
>   bundles (casual value), a collector box / SPC (low-volume, high-margin,
>   collector-leaning, can carry an exclusive promo), and tins (impulse). Each SKU
>   has its own price, print run, supply cap, and segment appeal, and sells on its
>   own weekly demand curve — more channels mean more revenue but a bigger up-front
>   print bet. Boosters remain the base product, economically unchanged.
>   (`products.js`, `ProductLineupEditor`; per-SKU resolution in `revenue.js`.)
> - **Promo cards** — cards you can NEVER pull from a booster: a scarce,
>   unpullable single that trades as a prestige grail. Originally minted via
>   funded organized-play programs (championship circuits, league seasons,
>   prerelease events); that funded-program action is retired as of the
>   collector/reseller pivot below. The one remaining mint path is a
>   Collector-box (SPC) SKU flagged as carrying an exclusive promo.
>   (`promos.js` `makePromoCard`; `packs.js` excludes promos.)
> - **Major / minor / micro sets & block gimmicks** — every release picks a
>   **tier**. A **major** is a full expansion that OPENS A BLOCK: it introduces a
>   block **gimmick** (a Pokémon-style Mega / Ascended / Phantasmal / Tera era
>   mechanic) chosen from a roster and tuned on a **competitive↔collector nature**
>   slider plus an archetype lean. The gimmick exerts a *persistent meta-warp* that
>   bends the field toward its lean for the block's era and **decays weekly**
>   unless a new set prints into the block to refresh it; it also mints scarce
>   **treatment chase cards** (the collector engine). A **minor** (~40–90 cards)
>   and a **micro** (~15–35) *ride* a live block: they inherit its theme + gimmick,
>   barely refresh the format, draw a far smaller discovery wave (and hit **rider
>   fatigue** — consecutive riders since the last major recruit less), but are
>   cheap and chase-dense. **Blocks coexist** — a new major never retires the old,
>   so their warps stack and power-creep accumulates, pushing the player toward the
>   ban/pull-from-print relief levers. The playtest harness confirms the tension:
>   a *major + minor* mix grows the healthiest base, rider-spam rots the metagame
>   (lower balance), and your first set must always be a major. (`blocks.js`,
>   `content/gimmicks.js`; tier/block wiring in `sets.js`; weekly warp in
>   `simulation.js`; `TierPicker` + `BlockEditor` in `SetBuilder`; block grouping
>   in `SetsPanel`.) Realizes the parked "elaborate special release events" /
>   anniversary-set depth around a real two-tier release calendar.
> - **The collector/reseller pivot** — the dashboard now reads
>   collector/reseller-first (sets & scarcity, market & packs, community &
>   distribution, news); the competitive-only panels (Bans, Organized Play,
>   Metagame, Meta Report) are removed from the UI, though the metagame
>   simulation they read (ban pressure, the four dials) still runs headless
>   underneath and feeds card pricing. Ships alongside it:
>   - **Franchise Reputation & persistent characters** — a slow,
>     EWMA-smoothed brand-prestige stat that grows off a sustained healthy
>     release cadence and community mood (plus made-it-big characters), and
>     lifts old/vintage sets' collector floor independent of any one card's
>     hype — the real-world Base Set Charizard effect. Characters are a
>     persistent "who" a signature card can feature (new or existing), whose
>     fame drifts weekly off how their live cards perform, unlocking a
>     reserved icon-tier treatment once a character graduates.
>     (`characters.js`, `franchise.js`; wired into `market.js`'s `fairValue`
>     and hype ceiling, and `sets.js`'s pop factors.)
>   - **Grading partners** — a distributor-shaped relationship with a
>     third-party authenticator: a flat sign-on cost, then it ambiently
>     certifies a slice of the market's highest-value singles each week (a
>     flat collector-value premium) and carries its own weekly scandal risk
>     that can strip a card's certification and crater its price.
>     Cultivating the relationship tightens standards and halves that risk
>     at max warmth. (`grading.js`, `content/grading.js`; surfaced in
>     `DistributorsPanel` and `MarketTicker`'s "graded" tag + population
>     count.)
>   - **Live box breaks & god packs** — a collector-hype marketing spend
>     (sponsor a streamed break of a live set), parallel to the retired
>     organized-play spend: it grows the collector segment and lifts the
>     broken set's hype instead of the competitive scene. Packs can also
>     roll a vanishingly rare **god pack** (every slot hits the set's top
>     rarity tier), a real-hobby legend that lifts hype across the whole
>     set and posts to the events feed. (`breaks.js`, `content/breaks.js`;
>     `packs.js` `drawGodPack`.)
>   - **Serialized chase cards** — a signature card can carry a hard total
>     copy cap (10/25/50/99/1-of-1) independent of the set's print run; once
>     that many copies are pulled from packs, ever, it stops appearing.
>     Realizes the "serial-numbered cards" item from the market-depth
>     roadmap (the other two items there, 1st-Edition/Unlimited and
>     reprints-as-a-market-tool, already shipped via Reprints above).
>     (`sets.js`, `packs.js`; numbered pulls surfaced in `PackRipper` and
>     `MarketTicker`.)
>   - **Channel mix & the anti-scalping toolkit** — each product's supply
>     splits across direct/LGS/big-box/international channels, trading
>     margin against reach and scalper exposure (`products.js` `CHANNELS`);
>     a big-box-heavy lineup runs hotter than a direct-to-consumer one even
>     with no distributor deals signed. Two free-standing policy toggles
>     counter it: **purchase limits** (caps how much any one distributor
>     deal can take) and **phantom stock** (shows "sold out" early to deter
>     bots, at a small real-demand cost). (`distributors.js`, `revenue.js`;
>     toggles in `DistributorsPanel`.)
>   - **Supply-chain capacity** — a logistics investment that makes the
>     print/supply-chain-snag event both rarer and cheaper when it does hit.
>     (`distributors.js` `upgradeSupplyChain`; `events.js`'s `supply_chain`
>     `weightMul`.)
>   - **Regional staggered releases** — a major-only lever: a lead region
>     drops first as a smaller discovery wave and a preview/hype channel
>     (its biggest mover gets named in the wide-release feed line), and the
>     wider "rest of the world" wave lands automatically a few weeks later.
>     The player gets one read-the-room call during the window: invest more
>     marketing into the wide release, or pull back. Realizes the "regional
>     staggered releases" item from the market-depth roadmap below.
>     (`sets.js` `releaseSet`/`adjustPendingWave`; weekly check in
>     `simulation.js`; wave UI in `SetsPanel`.)
> - **Deeper persona relationships & creator sponsorship** — two new one-off
>   actions on top of the existing comp/sponsor minigame: inviting a persona to
>   a live set's prerelease (a narrower, cheaper gesture than a full comp,
>   with real scoop risk if the set's chase cards are pullable), and
>   sponsoring a tournament (a one-off marquee spend, not an ongoing deal,
>   since there's no metagame/ban-pressure dial left for an ongoing version to
>   compound on — see the collector/reseller pivot above). A backfire on
>   either stings harder for a bigger name, per the brief's original "hits
>   *harder* because of their reach" note. (`relationships.js`
>   `invitePrerelease`/`sponsorTournament`.)
> - **Special release events** — a set's release carries an optional flavor:
>   a midnight launch (a real cash cost for a bigger buzz spike, but it stokes
>   scalper heat — a line out the door draws flippers) or a themed drop (free,
>   a smaller, safe lift). Extends the existing prerelease/anniversary
>   machinery rather than inventing a new release-type system.
>   (`sets.js` `releaseSet`'s `releaseEvent` field.)
> - **A rival TCG** — a persistent, ambient competitor for attention and
>   shelf space, read-only pressure with no player-facing actions (the
>   brief's most speculative v2 item, so shipped at its smallest useful
>   scope). A strength gauge drifts off your own catalog freshness and is
>   damped by franchise reputation; periodically the rival drops its own
>   release, biting your casual segment harder the staler your catalog and
>   the more overdue your cadence pledge (the "release timing" tie-in), with
>   a smaller collectors nibble once your own design has run loud (the
>   "power level" tie-in, via `printIntensity` — the dial that's actually
>   still live post-pivot). Replaces the old one-shot `rival_release` flavor
>   event. (`rival.js`, `content/rivals.js`; meter in `TopBar`.)
> - **Merchandise** — plush/apparel/accessories/art-book lines with NO print
>   run or supply cap (produced to order), sold every week they're active at
>   a demand driven by franchise reputation and cast fame rather than any
>   set's hype — the structural reason it's decoupled from metagame health.
>   Never feeds scalper heat. Sign/refresh/retire mirrors the distributor
>   relationship shape. (`merch.js`, `content/merch.js`; `AmbitionPanel`.)
> - **Cross-media ventures** — pitch an anime/game/film deal (gated on
>   franchise reputation); it then progresses on its own, mirroring
>   `characters.js`'s autonomous fame-drift shape, through greenlight and
>   production to a hit/flop/fell-through resolution — no mid-flight lever,
>   since these are framed as bets you watch play out, not relationships you
>   tend. A landed hit grants a one-time player injection PLUS two permanent
>   buffs: a word-of-mouth multiplier (`segments.js`) and a franchise-
>   reputation floor (`franchise.js`) — the concrete "massively expand the
>   player base and insulate the brand" payoff. A flop costs real cash on top
>   of the sunk pitch spend and grants neither buff. (`media.js`,
>   `content/mediaDeals.js`; `AmbitionPanel`.)

### A. Product & market depth

*(Regional staggered releases and serialized cards & variants have shipped — see the collector/reseller pivot under Shipped since v1 above. One nuance from the original pitch remains parked: sets don't actually get renamed/restructured with different card lists per region, the way Japanese sets are recombined for Western markets — the shipped lead-region name is cosmetic flavor text over the same card pool.)*

### B. Relationship & community depth ✅

*(All three items shipped — see "Shipped since v1" above. Deeper persona relationships & creator sponsorship: the base comp/sponsor minigame shipped earlier in `relationships.js`; prerelease invites and sponsored tournaments shipped alongside this pass. Rival TCGs shipped at the brief's own suggested minimal scope — read-only ambient pressure, no player actions; a fuller version with a counter-lever, e.g. "poach a designer," remains a possible follow-up if the ambient version tests as too flat. Special release events shipped as midnight launches/themed drops on top of the already-shipped anniversary-set/prerelease machinery.)*

### C. Business expansion & cultural impact (the long-run ambition layer) ✅

*(Both items shipped — see "Shipped since v1" above. These give a long, win-condition-less run something to build toward and insulate a mature brand against metagame churn: merchandise as the stability/diversification revenue lever, cross-media ventures as the big-bet endgame-ambition layer.)*

---

## Open tuning notes

- Balance the solve-level decay rate so the release cadence feels like a real TCG (sets every few months), not a treadmill.
- Tune variance in the market so surprises happen often enough to be exciting but not so often that player inputs feel meaningless.
- Calibrate the feedback noise ratio so signal-vs-noise is a real skill, not a coin flip.
