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
High-level levers that generate the numbered set procedurally from a theme:
- **Design loudness** — how hard this set's cards are pushed to outshine what came
  before: bigger frames, splashier foils, more presentation. Loud sells now, but
  it ages the back catalogue (it drives the nostalgia-erosion dial). *Formerly
  "power budget" — this game is collector-first, so the dial is about how a set
  presents itself, never about how strong its cards are.*
- **Set length** — how many cards the set runs, within its tier's band. A real
  headline decision: size reads as EVENT SCALE (a bigger launch wave, more buzz,
  a richer dev budget) with a BLOAT downside past ~⅔ of the band (the chase
  thins across more cards, the set stops being completable, and reviewers say
  so). A tight set is the inverse — dense and completable, beloved by
  set-collectors, but a weaker growth event. Normalized around each tier's
  DEFAULT length, so a default-length set is exactly balance-neutral.
  See `sizeProfile` in `sets.js`.
- **Rarity distribution** — how chase-heavy vs. accessible the set is.
- **Print run size** — supply. Under-print → scarcity & high secondary value but lost sales & frustrated players; over-print → bargain bins & crashed values.
- **Theme** — flavor identity. Carries naming *motifs* — cosmetic word-fuel for
  generated card names, nothing the sim reads as a rule.
- **Price point** — MSRP of sealed product.
- **Cover character** — one roster character fronts the box art, lending the set
  their accumulated fame. Marketing, not a card.
- **Art director** — commission one artist across the WHOLE set (double their
  card rate); their specialty match lifts every card, not just the ones they drew.

### 2. Signature cards (the marquee cards that define the set)
Hand-designed by the player:
- **Standout appeal** — how much the card is meant to stand out on a shelf.
- **Finish** — Standard / Holofoil / Full art / Textured foil / Gold etch. A
  richer printing reads louder and costs more to commission.
- **Flavor text** and **art direction notes** — a brief that leans into the set's
  theme reads as a more cohesive commission and is worth a little extra appeal.

There is deliberately **no rules text and no mechanical mode**. Nothing here is
designed around what a card *does* — only around how much it is wanted.
Signature cards are what the secondary market and personas react to most strongly.

### 3. Spotlight & preview
Pick up to five of the set's cards — signature highlights, the block's chase
cards, or chosen reprints — to reveal publicly before launch. A couple of
reveals build real anticipation; preview most of what's worth pulling and
there's nothing left to find in the pack (buzz peaks at ~3 reveals, then
declines while the cost keeps climbing). Reveals resolve at release for now; a
dedicated **Marketing tab** landing them over the weeks *before* a launch is the
natural follow-up.

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

> **Removed.** The whole four-dial metagame — `archetypes.js` included — was
> deleted in the collector/reseller pivot (see persistence.js v13). Nothing in
> the shipped game reads diversity, power level, archetype balance or solve
> level; the collector-side dials that replaced them are `printIntensity`
> (nostalgia erosion) and each set's own `buzz`. The section below is kept as
> the original spec, not as a description of the code. Historically: Releases tilt
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
- **Casual / combo players** ("new toys" crowd) — want fresh ideas & spectacle.
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
>   (`promos.js` `makePromoCard`; `packs.js` excludes promos. `organizedplay.js`
>   was deleted with the pivot.)
> - **Major / minor / micro sets & block gimmicks** — every release picks a
>   **tier**. A **major** is a full expansion that OPENS A BLOCK. It **may**
>   introduce a block **gimmick** — an era-defining chase TREATMENT (a
>   Pokémon-style Mega / Tera / full-art / serialized era) picked from a
>   **28-strong roster grouped into six characters** (form change, art treatment,
>   rarity structure, character & crossover, nostalgia, novelty & physical) and
>   tuned on a chase-intensity slider. A gimmick is purely a collector engine: it
>   mints scarce **treatment chase cards** and nudges the nostalgia-erosion dial.
>   Gimmicks are **optional** — a block opened without one is a *plain themed
>   era*: cheaper to develop, no chase subtype, a smaller launch spike, and
>   nothing eroding what collectors already own. A **minor** (~40–90 cards)
>   and a **micro** (~15–35) *ride* a live block: they inherit its theme + gimmick,
>   barely refresh the format, draw a far smaller discovery wave (and hit **rider
>   fatigue** — consecutive riders since the last major recruit less), but are
>   cheap and chase-dense. **Blocks coexist** — a new major never retires the old,
>   so their warps stack and power-creep accumulates, pushing the player toward the
>   ban/pull-from-print relief levers. The playtest harness confirms the tension:
>   a *major + minor* mix grows the healthiest base, rider-spam hits diminishing
>   returns, and your first set must always be a major. (`blocks.js`,
>   `content/gimmicks.js`; tier/block wiring in `sets.js`; weekly warp in
>   `simulation.js`; `TierPicker` + `BlockEditor` in `SetBuilder`; block grouping
>   in `SetsPanel`.) Realizes the parked "elaborate special release events" /
>   anniversary-set depth around a real two-tier release calendar.
> - **The wiring rule: every decision moves sales AND opinion** — a systems audit
>   pass over every set-draft field, every reducer action, and both engines. It
>   found the rule broken four ways and fixed them.
>   **Three dead effects:** reviewer verdicts on a fresh set wrote `playerBase`,
>   which `applySegmentDrift` then overwrote in the same tick (now applied to
>   `segments.casual`, like events do); persona mood updates sat inside
>   `if (card)`, so set-level takes were decorative; and `applyDistributors` ran
>   *after* `resolveMarket`, leaving the ticker's sparkline describing prices the
>   game had already overwritten (distributors now run before the market, so
>   channel pressure is an input to pricing rather than an edit after it).
>   **The missing loop:** `setAppeal` averaged each card's *frozen release-time*
>   hype, so the live `card.hype` that personas, breaks, god packs and previews
>   move all game reached singles prices and stopped — community excitement could
>   not sell a single pack. It now reads live hype (floored at intrinsic quality
>   so a set never decays a third time), weighted toward the cards people
>   actually chase.
>   **Greed made visible:** a new `setGrievances` reads the player's real
>   business decisions — MSRP vs. the genre norm, print run vs. sell-through,
>   manufactured scarcity (serialized caps), pack stinginess, bloat — and the
>   community leads with whatever it objects to. This finally gives
>   `taste.fairness` something to read: it governed a perception bias and nothing
>   else, so the axis that should notice greed was inert. (The one line in the
>   game about print runs fired off `punch`, a field with nothing to do with
>   print runs.) Unlimited reprints, merch lines and both anti-scalping toggles
>   now carry sentiment too.
>   **Free levers priced:** chase intensity, `treatmentWeight`, secret rares,
>   serialized caps and design loudness all cost money now — all anchored so a
>   default-length, default-loudness set is unchanged.
>   **Dead travel removed:** `printIntensity` used `Math.max(0, creep)`, so the
>   bottom half of the loudness slider was a no-op *and* — creep being exactly 0
>   at the default loudness — every gimmick's creep weight was multiplied by
>   zero. A restrained set now actively relieves nostalgia erosion.
>   Also: graded **population** finally prices (the point of grading);
>   sponsorships deliver the reach they always promised; a landed media hit
>   raises sentiment (only the flop did); and a custom era name survives
>   `openBlock`.
> - **Set creation, redesigned collector-first** — the builder's last competitive
>   framing is gone. The **power budget** slider became **design loudness** (same
>   nostalgia-erosion role, reframed as presentation rather than strength);
>   themes' "mechanics" became naming **motifs**; and signature cards lost their
>   *mechanical* rules-text mode entirely — with it the keyword parser that scored
>   "draw / destroy / untap / counter" — replaced by standout appeal, a printing
>   **finish** (holo → gold etch), flavor text and art-direction notes. Block
>   **gimmicks became optional** (a plain themed era is a first-class, cheaper
>   choice) and the roster grew **4 → 28** across six categories. **Set size
>   finally matters**: `sizeProfile` normalizes a set's length against its tier's
>   DEFAULT (so default-length sets stay exactly balance-neutral) and drives the
>   launch wave, buzz, dev cost, chase density and completion appeal — with a
>   bloat ramp past ~⅔ of the band that reviewers pan (`personas.js`), collectors
>   drift away from (`segments.js`), and that can trigger a
>   `bloated_set_backlash` event. New **spotlight reveals** let you preview up to
>   five cards pre-launch (buzz peaks at ~3, then over-revealing spoils the rip),
>   plus a **cover character** and a whole-set **art director**.
>   (`sets.js` `sizeProfile`/`cardAppeal`/`loudnessOf`, `content/gimmicks.js`,
>   `blocks.js`, `SetBuilder` reorganized identity-first.) Save **v17**.
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

## Audit remediation pass ✅

A full audit of the shipped game, a 312-week harness sweep and a measured
six-year trace found that the v1 loop worked but the run had no arc: the game
could not be lost after week 36, and cash grew without bound. Seven commits
addressed it. The spec text above is unchanged; this records what the code now
does differently.

**Eight correctness bugs.** `applyEventEffects` clamped cash at zero, so every
costed event erased the player's whole debt. A collector take read
`popFactors.value`, a field that does not exist. The set-builder cost summary
omitted serialization. `PULL_FROM_PRINT` was the only reducer case that never
truncated the events feed. `PackRipper` read serial numbers from a parallel
array after filtering. `popFactors` read `theme.tags` unguarded. Rarity and
character ids used module counters that reset on reload. `promoSupply` was
written and never read.

**The harness drives the real reducer.** `reducer` moved out of `useGame.js`
into `reducer.js`; `tools/playtest.mjs` had re-implemented three transitions by
hand and that mirror had drifted, silently dropping `characters`,
`pendingWaves`, `scalperHeat` and the odds-transparency sentiment bump.

**Recurring costs** (`overhead.js`) — the money sink the economy never had.
Studio overhead scaling superlinearly with the number of sets in print,
warehousing on unsold stock, per-block era upkeep, and a voluntary
community-goodwill programme. Revenue is bounded (word of mouth is additive,
segment drift is capped) while these are not, so an unpruned catalogue
eventually outruns any income it can generate. Pruning the shelf is now the
central late-game decision.

**The cadence cliff is gone.** Unrest subtracted `1.5 × lateBy` from all 52
personas every week with nothing bounding it, so cumulative loss crossed the
−100 revolt floor at about 11 weeks late on a fixed schedule. That single
quadratic was not *a* difficulty in this game, it was the only one. Unrest now
drives sentiment toward a floor. A young studio also gets 8 weeks of grace
rather than 3.

**`printIntensity` is alive.** `creep = (loudness − 50) / 5` is exactly 0 at the
default and a flat weekly decay gave the dial one fixed point: zero. Sets now
declare a `printLevel`, the dial relaxes toward the buzz-weighted mean of the
in-print shelf, and its consumers read the two-sided deviation from neutral — so
restraint is a reward, not merely the absence of a penalty.

**The release treadmill is priced.** Cadence only ever punished being late, and
any release reset the clock, so shipping the cheapest set as fast as possible
was optimal. Rider fatigue now reads spacing as well as count and damps a set's
revenue for its whole life.

**Franchise reputation** reaches 96–123 rather than 45–60, which finally puts
the upper `content/mediaDeals.js` gates and the anniversary tier in reach. The
gate ladder was always staged sensibly; the growth rate had never been tuned to
match it.

**Legacy, retirement and prestige** (`legacy.js`, `content/milestones.js`) — a
scored retrospective, 25 milestones, a voluntary exit, and banked legacy that
unlocks perks in future runs. This does NOT introduce a win condition:
retirement is dispatched only by a button, nothing in the sim proposes it, and
it reuses the existing `gameOver` field rather than adding stop machinery.

**Persistence** moved to IndexedDB, with a 46% smaller serialized state,
export/import, and a visible warning on failure. A week-312 run had reached
4.07 MB against localStorage's ~5 MB quota and the quota error was swallowed, so
long runs stopped saving silently.

**The dashboard** gained a card browser (the ticker showed 12 of several
thousand cards), a profit-and-loss view (only gross revenue ever reached the
screen), trend charts, and real keyboard support — Escape, focus traps, focus
styles, and tab semantics that match the roles the markup already claimed.

Measured across 312 weeks × 3 salts: failures spread from week 34 to week 291
(previously all four landed in weeks 33–36), lifetime recurring spend runs
27–97% of gross income (previously ~8%), end cash runs $2M–$49M (previously
$10M–$165M), and a shelf that is never pruned finishes on a negative weekly net
while a disciplined one stays positive.

---

## Open tuning notes

- Balance the solve-level decay rate so the release cadence feels like a real TCG (sets every few months), not a treadmill.
- Tune variance in the market so surprises happen often enough to be exciting but not so often that player inputs feel meaningless.
- Calibrate the feedback noise ratio so signal-vs-noise is a real skill, not a coin flip.
