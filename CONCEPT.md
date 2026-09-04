# TCG Manager Simulator — Concept Document

*Collector-meta redesign. Concept locked; systems below are the build target.*

---

## 1. Premise

You found a trading card company in year 0 with a modest runway and no audience. You invent an IP — characters, locations, factions — and print cards featuring it. Over the following decades the market tells you, slowly and expensively, which parts of your IP people actually loved.

You are the publisher. You never play the card game and neither does anyone else — demand is entirely collector-driven. You experience your own fandom the way a real publisher does: through sales data, market screens, social feeds, creator streams, and distributor phone calls.

**The core fantasy:** watching a card you printed as filler in year 3 become a $400 grail in year 22, and knowing you're the one who set the print run.

---

## 2. Core Loop

**Create → Commit → Reveal → Release → Aftermarket → Reprint**

1. **Create.** Design IP entities and the cards that feature them. Assign artists, rarities, foiling, serialization, cast/cameos, progression and illustration links, flavor text.
2. **Commit.** Lock print runs, product SKUs, and channel allocation with distributors — months before anyone has seen a card. This is the blind bet.
3. **Reveal.** Previews drip out. Influencers react. Preorders come in. Prerelease events run. If you've unlocked staggered regions, region one becomes a live preview of region two. Signal arrives; the print run does not change.
4. **Release.** Drop day. Channels sell through at different speeds. Scalpers, resellers, and collectors move. Your direct store queues melt or don't.
5. **Aftermarket.** Singles find prices. Graded copies enter pop reports. Chase cards climb or die. Errors surface.
6. **Reprint.** Six months to two years later you decide whether to make the chase accessible again — and what that does to the original.

Then time passes, and everything you already printed keeps moving without you.

---

## 3. Time Model

- Player-chosen skip: **1 week / 1 month / 1 quarter.**
- Skips are **interruptible**. Any material event (a card spikes, a distributor renegotiates, a creator opens a case on stream, a rival announces a set, an error is discovered) halts the skip and surfaces the event.
- Run length is **infinite**. There is no end state, only a death state.
- Design consequence: the first five years should be playable in short skips (dense decisions, tight money), and years 10+ should be quarter-skippable so vintage appreciation actually arrives within a session.

---

## 4. Data Model

### IP Entity
The root object. A character, location, faction, event, or concept.
- Hidden: **relatability** (0–100), **audience affinities** (kids / adults / lapsed / region-specific), **longevity** (does affection decay or compound).
- Visible: a **vibe reading** — a fuzzy band around the true value, narrowed by upgrades (§6.1).
- Tracked: total appearances, first appearance printing, affection history over time.

### Card
- Name, IP subject, **cast/cameos** (other IP entities appearing in the art)
- Rarity, serialization (yes/no + numbering), foiling/special treatment
- Artist, art brief
- **Progression link** (evolution-style chains — collectors chase complete lines)
- **Illustration link** (art-subset chains that span sets — the hedge against a weak character)
- Flavor text

### Printing
A specific card in a specific set/product/region. **This is the unit that has a price.** Same card, different printing = different market entirely.
- Print quantity, pull rate, region, print quality tier, error flags

### Population
Per printing: copies in circulation, copies destroyed/lost, copies graded by grade and grader. Feeds scarcity and pop reports.

### Set
Size 1–500. Type determines viable size and cost curve:
- **Main set** — large, broad, the backbone
- **Specialty set** — small, expensive per card, high-margin, high-risk (First Partner style)
- **Subset / mini set**, **promo run**, **collab set**

### Product SKU
Booster pack, booster box, ETB, collection box, tin, premium collection, bundle, blister, surprise box. Each has cost, margin, channel fit, and its own scalper appeal.

**Sealed product has its own market.** A sealed box appreciates independently of its singles, and the two are coupled: opening a unit destroys sealed supply and adds singles supply. A heavily ripped product gets scarcer while its singles get cheaper; a hoarded one does the reverse.

**MSRP is a sticker price, not a price.** What consumers actually pay is set per channel and floats freely above or below MSRP — an LGS marks up hot product, a big box holds the line, online floats with demand.

**SKUs are regional.** Variants of the same product line can differ by region in mix, pack count, or existence entirely. Tailoring them only pays off once you know what that region likes, and regional taste is hidden until earned through research and release history.

### Artist
Personality, stats (linework, color, composition, speed, reliability), specialty (creature / landscape / character / graphic). Rate, turnaround, current reputation.
- **Career arc:** artists grow independently. A cheap unknown hired in year 2 can become a legend by year 15, and their early cards carry a premium on their name alone.
- Artists reach out to you for collabs once your brand has standing.

### Channel
Distributor, big-box chain, LGS network, online retail, your **direct store**. Each has allocation limits, margin, relationship score, and popularity gates.

### Rival Publisher
Competing TCGs with their own IP, release calendars, and audience share. You fight for shelf space, artists, and attention until you reach a dominant state — and even then rivals persist and occasionally out-perform you on singles.

---

## 5. The Value Engine

Every printing carries a price driven by four factors:

```
price = cast_desire × scarcity × art_multiplier × condition_multiplier × market_heat
```

- **cast_desire** — affection for the subject *plus* weighted affection for cameos. A Trainer card with your mascot in the background appreciates for reasons you didn't plan.
- **scarcity** — pull rate × print quantity × surviving population. Reprints add supply to the *card* but never to the *original printing*.
- **art_multiplier** — artist reputation **at time of viewing**, not at time of printing. This is why the year-2 unknown pays off.
- **condition_multiplier** — raw vs. graded, grade tier, grader reputation, pop report position.
- **market_heat** — current speculation, creator attention, set nostalgia, region.

**Nostalgia term:** early printings gain a compounding multiplier as the brand grows. This is the Skyridge effect and it must be emergent, not authored. If the designer decides which card is valuable, the player never gets the surprise.

**Noise is mandatory.** A meaningful percentage of price movement must be unexplainable. Random commons should occasionally take off.

---

## 6. Systems

### 6.1 Relatability & the Vibe
Character affection is a real simulated number, displayed as a fuzzy band. Three separate investments narrow it:
- **Market research spend** — per-project, buys a sharper pre-release read
- **Community team** — ongoing, sharpens affection reads across your whole roster
- **Data/analytics hire** — sharpens market and price forecasting

Even fully upgraded, the reading is never exact. You can build a beautiful, expensive set around a character nobody bonds with and eat the entire print run.

### 6.2 Fanbase Attention & Fatigue
Attention is the scarce early resource and the counterweight to infinite printing. Every release consumes attention. Over-releasing:
- thins chase demand per set
- burns goodwill (a persistent modifier, slow to recover)
- devalues recent product across the board

Set count per year is entirely your call. This system is what makes that call dangerous.

### 6.3 Print Quality & Errors
A real dial with real downside. Cheaper printing means worse centering, weaker pop reports on graded copies, and a higher error rate. Errors are uncontrolled and occasionally become the most valuable cards you never designed.

### 6.4 Grading
Main graders plus occasional side graders, each with reputation, price tiers, and turnaround. Your print quality feeds grade distribution and pop reports. Graded prices tracked separately by grade and grader.

### 6.5 Channels & Relationships
Each channel has benefits, downsides, and popularity gates:
- **Distributors** — volume, low margin, relationships that sour if you over-allocate or under-deliver
- **Big-box chains** — reach and legitimacy, brutal terms, require brand standing
- **LGS network** — loyalty, prerelease infrastructure, small volume, huge goodwill
- **Direct store** — your Pokémon Center equivalent. Drops, queues, exclusives, full margin, and the most volatile scalper interaction in the game.

### 6.6 Regions
Start **US-only**. Upgrade to international, then country by country. Staggered releases serve double duty: regional exclusives generate hype, and region one becomes a live preview of region two's demand.

### 6.7 Collabs, Promos & Events
- External IP licensing (a restaurant chain, a museum, a musician, another franchise)
- Event promos for events you host
- Prerelease events, sized and scheduled by you

### 6.8 The Secondary Market Actors
Simulated populations you never control:
- **Scalpers** — camp drops, buy allocation, resell above MSRP
- **Resellers & rip-and-ship streamers** — open product on stream, create visible price events
- **Genuine collectors** — set completers, character loyalists, PC builders; the stable demand floor
- **Speculators** — amplify and crash heat

### 6.9 Finance
Modest opening runway. Debt available, with borrowing capacity growing as credit improves. Print runs are the largest capital commitment and they're committed blind.

---

## 7. Failure States

The studio can die.

- **Overprint death** — a large print run of a set nobody wanted, capital locked in unsold inventory
- **Attention death** — flooding the market until each release stops mattering
- **Debt spiral** — leverage on a swing that missed
- **Relationship death** — losing distributor and chain access, collapsing back to LGS-only volume
- **Irrelevance** — a rival takes your shelf space and your artists and you can't fund a comeback

---

## 8. Player-Facing Screens

- **Card price history** — per printing, raw and graded, by grade and grader, over full history
- **Set health** — sell-through, chase performance, aftermarket index
- **Pop reports** — your printings by grade
- **IP roster** — affection vibes, appearance counts, trend arrows
- **Artist roster** — stats, reputation trajectory, availability, rates
- **Channel board** — allocation, relationship scores, gates
- **Feeds** — social reactions, creator streams, drop chaos, error discoveries
- **Rival tracker** — their releases, share, and singles performance

---

## 9. Progression & Unlocks

There is no feature cut. Every system ships. What changes is what the player has *access* to — the game opens bare bones and the rest is earned.

### Opening state (year 0)
- US only
- LGS network only — no distributor, no chains, no direct store
- A small pool of cheap, unproven artists
- No market research, no community team, no analytics — the vibe reading is at its fuzziest
- One main-set slot, modest runway, debt available at bad terms
- **Rival publishers already exist and already have audience share**

### Unlock tree
| Unlock | Gated on |
|---|---|
| Distributor relationships | sell-through volume, LGS goodwill |
| Big-box chains | brand standing, distributor track record |
| Direct store (drops, queues, exclusives) | audience size, capital |
| International release | brand standing, capital |
| Country-by-country regions | per-region demand proof |
| Market research spend | capital |
| Community team | audience size |
| Data/analytics hire | capital, brand standing |
| Specialty set slots | prior set performance |
| Higher print quality tiers | capital, distributor terms |
| Additional graders entering your market | brand standing |
| Artists reaching out for collabs | brand standing, artist relationships |
| External IP collab offers | brand standing, audience demographics |
| Self-hosted events + event promos | audience size, capital |

Rivals are not an unlock. They are the environment. Attention is a shared, finite resource from the first tick, and any tuning done in a world without competitors is tuning against the wrong numbers.

---

## 10. Simulation Harness & Architecture

**Build the simulation core before any UI.**

### Architecture rules
- The sim core is a **pure module** with no React, no DOM, no `Date.now()`, no unseeded randomness
- All randomness flows from a **single seeded PRNG**. A seed plus a decision log fully reproduces a run
- The core exposes `tick()`, a serializable state object, and an event stream
- UI is a read-only consumer of state plus a submitter of decisions. It should be replaceable without touching the sim
- Decisions are data — see below

### Decisions as data
Every player action is a serializable object (`{ type, payload, tick }`), never a direct method call. The sim consumes a decision queue; the UI only produces it.

This buys four things that are painful to retrofit:
- **Replay** — seed + decision log reconstructs any run exactly
- **Strategy bots** — scripted decision streams let you auto-play thousands of runs
- **Tuning diffs** — rerun an identical decision log against new constants and diff the outcome
- **Bug reports & save integrity** — a broken run ships as a seed and a log, not a state dump

### Harness capabilities
- Run 50+ simulated years headless in well under a second
- Batch across N seeds and dump CSV: price histories, populations, finances, attention, rival share
- Scriptable AI strategies (conservative printer, chase-maxxer, flooder, specialty-only) to probe for degenerate optima
- Snapshot/diff a run before and after a tuning change

### Balance metrics to track
| Metric | What a bad result looks like |
|---|---|
| % of runs producing a 100x card that wasn't a planned chase | Near zero — value is authored, not emergent |
| Per-set price distribution shape | Flat mush instead of a power law |
| Chase-to-common price ratio over time | Static — no vintage compounding |
| Studio death rate by year | Flat across the run; should be brutal early, rare once dominant |
| Convergence of optimal sets-per-year | A single dominant number — fatigue is mis-tuned |
| Median years to first $100 card | Too fast (no patience payoff) or never (no payoff at all) |
| Median years to dominance, across strategies | One strategy always wins |
| Artist scouting payoff | Hiring unknowns never beats hiring stars |

The harness is not a side tool. It's how a game about emergent value gets tuned at all.

---

## 11. UI & Platform

### Platform
- **iPhone first**, built natively via **Capacitor** and deployed through Xcode. Keeps the existing React/Vite codebase.
- **Local-first.** The device holds the authoritative save and the sim runs entirely on-device. Network is used for services (§12), never to run the game.
- **Storage is native SQLite**, not localStorage or IndexedDB. Real indexes and aggregation queries matter for dense time-series charting.
- **Price history:** ~10 years at weekly resolution, then downsampled to monthly and quarterly.
- **Store sparsely.** Write a price point only when the value moves past a threshold and interpolate between. Naive weekly storage is ~500 points per printing across thousands of printings — mostly flat lines for commons nobody trades. Sparse storage gives full fidelity to cards that matter and collapses the junk.

### Structure
- Bottom tab navigation: **Studio** (IP, cards, sets in development), **Market** (prices, pop reports, trends), **Feed** (social, creators, events, drop chaos), **Business** (channels, distributors, finance), **Roster** (artists, staff), **Misc** (options, upgrades, saves)
- Dense by design — compact tables, sparklines, sticky first columns, horizontal scroll for wide data, drill-down into detail sheets
- Aesthetic: simulation-game density and functional chrome, not corporate SaaS and not toy-like

### The interface is an upgrade tree
The game starts in **2026** — the interface doesn't age, it *improves as you buy it*. Screens begin bare and uncertain, and unlocks (market research, community team, analytics hire, brand standing) buy real interface capability. This makes the unlock tree in §9 visible and felt.

**Affection display progression:**
1. Uncertain prose — *"people seem lukewarm on this one"*
2. Adjective plus trend direction
3. Coarse range or band
4. Number, history chart, and audience breakdown

Even at the top tier the reading carries residual error. It never becomes ground truth.

The same principle applies elsewhere: early price screens show last known sale only; later ones show full charts, graded splits by grader and grade, pop reports, and rival comparisons.

### Procedural card faces
Cards must feel collectible, so a card is never just a text row. Each face is composed from its own data:
- Artist style palette and composition tendencies
- Rarity frame
- Foiling / special treatment
- Serialization stamp
- Optional generated subject shape (nice to have; frame, treatment, and typography alone are sufficient to read as a card)
- Set symbol and printing marks

Reprints are visibly distinct from originals at a glance. Errors render their error.

**Performance note:** list views need cheap thumbnails (cached, simplified), with full detail composition only in single-card views. A market table on a phone may render hundreds of faces while scrolling.

---

## 12. Online Services

Network access is available, but the simulation never depends on it. The game runs on-device; services are additive and every one of them degrades gracefully to nothing.

| Service | Value | Fallback |
|---|---|---|
| Cloud save backup & restore | Protects long runs; survives device changes and rebuilds | Local SQLite is authoritative |
| Remote balance constants | Tune the economy without an Xcode rebuild | Bundled defaults |
| Generated flavor content | LLM-generated IP names, flavor text, feed chatter, creator commentary — keeps a decades-long run from repeating itself | Local name/phrase pools |
| Run sharing | Since decisions are data, a seed plus a decision log is a complete shareable run | Off |

**Do not** put the tick loop, price engine, or save state behind a server. A local run simulates 50 years in under a second; round-tripping that to a backend would be slower, costlier, and add failure modes for zero gameplay gain.
