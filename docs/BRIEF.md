# TCG Manager Simulator — Design Reference

A browser management sim. You run a trading card game company. You do not play
the card game — you **publish** it. Design sets, release them on your own
schedule, watch the secondary market react, manage a community of named
personalities, and try not to over-print or over-charge your way into bankruptcy.

*Game Dev Tycoon*, but you are The Pokémon Company and the product is cardboard.

This file describes the game **as built**. It is not a wishlist. When a feature
ships, edit the section it belongs to rather than appending a status note.

---

## The shape of a run

The run is **open-ended and has no win condition**. It is a survival sim you play
until you lose or retire.

You start from nothing — 0 players, 0 satisfaction. You grow by shipping sets
(each launch is a hype-sized discovery wave) and by word of mouth. Then two
pressures pull against each other for the rest of the run:

- **Go quiet and the community sours.** Missing your cadence pledge drives
  sentiment toward a floor, and an ambient rival TCG grows while your shelf is
  cold.
- **Ship constantly and the shelf eats you.** Recurring costs scale
  superlinearly with how much you keep in print, and the release treadmill is
  priced — rider fatigue damps a set's revenue for its whole life.

**Pruning the shelf is the central late-game decision.**

### Losing

Cash, players and satisfaction are recoverable pressures, not instant-death
lines. Cash may go negative as a loan carrying compounding weekly interest.

Only three ruins end a run:

| Ruin | Condition |
| --- | --- |
| Debt spiral | Cash past roughly −$3M; the interest alone is unpayable |
| Broke and abandoned | Deep debt (< −$100k) AND almost no players (< 500) |
| Total revolt | Community sentiment hits the −100 floor |

### Time

A **manual weekly clock**. The player clicks "Advance Week" to step one week.
There is no timer and no speed control. After each week `clock.js` surfaces a
one-line "what changed" note. The three ruins are always-visible header meters
that redden as they approach.

---

## Designing a set

### Tier and block

Every release picks a tier. A **major** opens a block and may introduce a block
**gimmick** — an era-defining chase treatment picked from a 28-strong roster in 6
categories, tuned on a chase-intensity slider. A gimmick is purely a collector
engine: it mints scarce treatment cards and nudges nostalgia erosion. Gimmicks
are **optional**; a plain themed era is a first-class, cheaper choice.

**Minor** (~40–90 cards) and **micro** (~15–35) sets *ride* a live block. They
inherit its theme and gimmick, draw a far smaller discovery wave, and hit rider
fatigue — but they are cheap and chase-dense. An **anniversary** set is
freestanding, reprint-centric, and gated on a real history.

Blocks coexist. A new major never retires the old.

### The dials

| Dial | What it does |
| --- | --- |
| Design loudness | How hard the set is pushed to outshine what came before. Drives nostalgia erosion. A presentation dial, never a strength dial |
| Set length | Read as event scale, with a bloat penalty past ~⅔ of the tier band. Normalised so a default-length set is exactly balance-neutral |
| Rarity sheet | How chase-heavy against accessible the set runs |
| Print run | Supply. Under-print for scarcity and lost sales; over-print for bargain bins |
| Price point | MSRP of sealed product |
| Booster format | The pack authored slot by slot, from presets or fully custom |
| Product SKUs | Boosters plus optional bundles, collector boxes and tins, each with its own price, supply and segment appeal |
| Channel mix | Each product's supply splits across direct/LGS/big-box/international, trading margin against reach and scalper exposure |

### Studio standards

Two of those dials are worth keeping between releases, so they can be named once
and pulled into any set: a **rarity sheet** and a **booster format** (which
carries the god-pack config, since its picks name rarities). A **blueprint**
pins one of each, so starting a set from the usual pair is a single choice. They
are authored in the Studio, saved from the set builder with one button, and one
of each can be marked the default a new draft starts from.

**An import copies; it never links.** A released set stores its own snapshot of
the sheet and the pack it shipped with — `reprintAsUnlimited` rebuilds an entire
card pool from nothing but that record — so editing a standard afterwards cannot
reach a set already on shelves. This is the whole reason the two are deep-copied
on release rather than assigned by reference.

Four things name rarities by id: pack slots, god-pack picks, a signature card's
rarity, and an anniversary reprint's upgrade target. Nothing validates that any
of them resolve, and an unreconciled import does not error — it shows a
plausible, wrong odds table. So importing a sheet that lacks something the set
uses **reports what would move and where** before it moves it, and remaps each
orphan to the surviving rarity closest in value tier rather than dropping it (a
dropped slot with no rarities left cannot be released at all). Per-card unique
rarities stay with their signature card and are never part of a shared sheet.

### Signature cards

Hand-designed marquee cards: standout appeal, a printing finish (holo through
gold etch), flavour text, art-direction notes, an optional serial cap
(10/25/50/99/1-of-1), and an artist commission.

There is deliberately **no rules text and no mechanical mode**. Nothing is
designed around what a card *does*, only around how much it is wanted.

### Illustration sets

A named group of cards meant to be collected **together** — the Froakie /
Frogadier / Greninja shape, where the capstone is worth a multiple of its
linemates precisely because it finishes the run.

Five **kinds** (`content/illustrationsets.js`): a progression line, an
illustrator's suite, a character run across releases, linked art broken over
several cards, and a flat themed cycle. Kinds differ in their coherence
*requirements* — pure data — and in exactly one market number, `capstoneWeight`,
saying how hard the payoff concentrates on the rarest member.

**Cohesion** (0–1) scores a group against its kind's requirements: an escalating
rarity ladder, one illustrator, a related cast, a shared art brief, breadth. It
is frozen when members change. The set builder shows the per-requirement
breakdown live, because otherwise it is a hidden number.

Groups live in top-level state and **span releases**: a set opens one or
continues one already open. Announcing a run you do not finish buys launch buzz
now; leave it 26 weeks and it goes stale, 26 more and it is written off — the
premium is withdrawn and the room says so. A studio that breaks promises is
believed less next time. Overusing the mechanic draws a `manufactured` grievance,
which is about *packaging* where `scarcity` is about supply.

Collectors also name runs the studio never planned — rarely, about one every
forty weeks.

**Character promotion.** A new character can be a later role or form of one
already on the roster — Kell, Broken Boy into Kell, Royal Soldier. Two entries
with their own archetypes and fame, linked by a lineage the cohesion scorer
reads. The successor debuts already partly famous. Locks on debut.

### Presentation

- **Spotlight reveals** — preview up to five cards pre-launch. Buzz peaks at
  about 3; over-revealing spoils the rip while the cost keeps climbing.
- **Cover character** — one cast member fronts the box, lending the set their fame.
- **Art director** — one artist across the whole set at double their card rate;
  their specialty match lifts every card.
- **Release event** — an optional midnight launch (bigger buzz, stokes scalper
  heat) or a themed drop (free, smaller, safe).

---

## The cast

Characters are the player's own IP: invented in the set builder or the Cast
panel, and printed again and again.

- **Archetype** — 12 across 4 categories (`content/archetypes.js`). The one
  identity field the sim reads. It carries theme tags, so an on-theme character
  earns +10 art appeal and +10 hype, beside the artist specialty match and
  deliberately smaller than it. It also biases fame drift: a mascot climbs
  fastest and bruises easiest; a villain grows on the heat that would sink one.
  **It locks on debut** — otherwise re-picking it per set is a free exploit.
- **Traits** — up to 2 from 27 (`content/traits.js`). Flavour only. They exist to
  be said: the community names them in the feed.
- **Fame** (0–100) drifts weekly off how the character's live cards perform, not
  on a random walk. A character with no live cards idles.
- **Trajectory** — rising → established → icon, with falls and comebacks. Icon
  status unlocks a reserved icon-tier treatment and its pack slot.
- **Story beats** record the turning points (debut, breakout, icon, fall,
  comeback), so a career reads as a narrative. The debut beat is pinned.

Artists are the parallel system: a fixed 44-name roster with drifting cost and
reach, so a cheap rising star is spottable before it blows up. They also carry
**collector heat**, drifting off how their live cards actually perform — a
sought-after illustrator's cards carry a premium and the community talks about
the hand, not just the card.

---

## The market and the community

**Secondary market.** Each card carries hidden pop factors — rarity, art appeal,
punch and hype. Prices resolve weekly with real variance plus momentum, so an
undervalued card can catch fire and a guaranteed chase can land flat. Sealed and
singles track separately. Speculative bubbles are possible and can burst.
Franchise reputation lifts old sets' collector floor independent of any one
card's hype — the Base Set Charizard effect. Cards in an illustration set carry a
completion premium, capped well below serialisation because a group is a design
act rather than a scarcity one, and their hype is nudged toward the group's mean
each week so the members visibly move together.

**Segments.** Two: `casual` and `collectors`. Almost no decision pleases both.

**Personas.** 52 named voices (`content/personas.js`). Reach and credibility are
deliberately anti-correlated, so the loudest voices are systematically the least
reliable — that is the signal-versus-noise skill the game tests. They cause real
effects, not just chatter: a streamer spikes demand, an authenticator accumulates
controversy heat, a reviewer sways casual sales.

Reach drifts over a run as the community learns who to trust. `setGrievances`
reads the player's actual business decisions — MSRP against the genre norm, print
run against sell-through, manufactured scarcity, pack stinginess, bloat — and the
room leads with whatever it objects to.

**Relationships.** Comp product, sponsor a creator, invite to a prerelease,
sponsor a tournament. Relationships decay if neglected, and a sponsored creator
who sours hits harder for their reach. A standing community-goodwill programme
buys back a soured room — but not permission to gouge it.

---

## Distribution and the shelf

- **Distributors** (5) buy volume at a wholesale discount for cash now, then
  flood resale. Flooding raises **scalper heat**; over the threshold the game
  tips into a scalper market and casual players are priced out.
- **Anti-scalping toolkit** — purchase limits and phantom stock, both with a real
  cost.
- **Supply-chain capacity** — makes the supply-snag event rarer and cheaper.
- **Grading partners** (3) certify a slice of high-value singles weekly for a
  collector premium, carrying a scandal risk that cultivating the relationship
  halves.
- **Regional staggered releases** — a major-only lever. A lead region drops first
  as a smaller wave and a hype channel; the player gets one read-the-room call
  before the wide release.
- **Pull from publication** — stop printing any set. Its singles spike on
  scarcity and its sealed appreciates, but yanking one that was still selling
  reads as manufactured scarcity and costs goodwill. The real cost is the
  forfeited future pack sales.
- **Reprints** — set-level (an Unlimited run; the original becomes a permanent
  first-edition premium) and card-level (fan service that lifts the new set while
  softening the original).

---

## Ambition

- **Franchise reputation** — a slow, EWMA-smoothed brand prestige that grows off
  a sustained cadence, community mood and made-it-big characters.
- **Merchandise** — plush, apparel, accessories, art books. No print run or
  supply cap, sold on franchise reputation and cast fame rather than any set's
  hype. Never feeds scalper heat.
- **Cross-media ventures** — 6 deals from a mobile spinoff to a theatrical
  blockbuster, gated on reputation. Pitched, then they progress on their own to a
  hit, a flop, or fell-through. A hit grants a player injection plus two permanent
  buffs; a flop costs real cash and grants neither.
- **Legacy** — 25 milestones, a scored retrospective, a voluntary retirement, and
  banked prestige that unlocks perks in future runs. This is **not** a win
  condition: nothing in the sim ever proposes retiring.
- **A rival TCG** — ambient, read-only pressure that grows when your shelf goes
  quiet.

---

## Architecture

Single-page browser app (Vite + React), no backend. Plain JavaScript, no
TypeScript. One immutable `GameState` in a `useReducer`.

| File | Role |
| --- | --- |
| `game/initialState.js` | The state shape — the single source of truth |
| `game/reducer.js` | Every player action, in one switch |
| `game/simulation.js` | `advanceWeek()` — the one tick entry point, order-sensitive |
| `game/useGame.js` | The React binding only: the hook, autosave, callbacks |
| `game/persistence.js` | IndexedDB run save, localStorage prestige and hall of fame |
| `game/rng.js` | Seeded RNG. Never use `Math.random` in the sim |
| `game/content/` | Static rosters. Ids are load-bearing — they reach the save |

### Rules that are load-bearing

1. **`reducer.js` and its whole import graph must import in plain Node.** No
   browser global at module scope. The headless harness imports the real reducer.
2. **The save has no migrations.** `loadState()` discards a save whose `VERSION`
   differs, so a bump destroys every run in progress. Prefer additive fields
   normalised on load. Current version: **18**.
3. **Content ids are permanent.** They are stored in saves. Renaming one orphans
   every record that references it.
4. **`tools/playtest.mjs` is the only automated check.** There is no test runner.
   It drives the real reducer, because a hand-mirrored copy once drifted and
   silently dropped state. Measure a sim change by diffing its table.

### State shape

```
GameState {
  week, cash, playerBase, segments: { casual, collectors }, segmentLean,
  printIntensity, franchise, scalperHeat, rival, supplyChainCapacity,
  sets: [ { id, name, tier, blockId, themeId, designLoudness, printRun, price,
            products: [...], buzz, printLevel, riderFatigue, releasedWeek } ],
  blocks: [...], pendingWaves: [...],
  cards: [ { id, setId, name, rarity, artistId, characterId, treatment,
             popFactors: {...}, sealedPrice, singlePrice, priceHistory: [...] } ],
  characters: [ { id, name, archetypeId, traits, hook, pronouns, fame,
                  trajectory, appearances, beats, fameHistory } ],
  illustrationSets: [ { id, kindId, name, plannedSize, status, cohesion,
                       members: [ { cardId, setId, week, artistId,
                                    characterId, valueTier } ] } ],
  raritySheets: [ { id, name, note, sheet: [...], isDefault } ],
  packFormats: [ { id, name, note, format: { preset, slots }, godPack, isDefault } ],
  blueprints:  [ { id, name, note, sheetId, formatId, isDefault } ],
  artists: [...], personas: [...], distributors: [...], gradingPartners: [...],
  merchLines: [...], mediaDeals: [...],
  goodwillSpend, lastOverhead, legacy, retirement, prestige,
  feedbackFeed: [...], eventsFeed: [...], clock: { reason }
}
```

---

## Removed — do not rebuild

The game was originally specified around a **competitive metagame**. That entire
engine was deleted in the collector/reseller pivot. Nothing in the shipped game
reads any of it:

- The four metagame dials (diversity, power level, archetype balance, solve
  level) and `archetypes.js`. Removed at save v13. **`content/archetypes.js` is
  unrelated** — it holds *character* archetypes and shares only the name.
- The `competitive` player segment.
- Counter cards and the keyword parser that scored rules text (v12).
- Player-facing bans and rotations. `bans.js`'s `banCard` and `rotateFormat`
  survive for the harness only; **pull from publication** is the live lever.
- Organized play (`organizedplay.js`). Promos now mint only from a collector-box
  SKU.

Collector-side dials replaced them: `printIntensity` (nostalgia erosion) and each
set's own `buzz`.

---

## Measured balance

An audit found the v1 loop worked but the run had no arc: it could not be lost
after week 36 and cash grew without bound. Across 312 weeks and 3 salts, after
remediation:

| Metric | Before | After |
| --- | --- | --- |
| Failure weeks | All in 33–36 | Spread from 34 to 291 |
| Lifetime recurring spend | ~8% of gross | 27–97% of gross |
| End cash | $10M–$165M | $2M–$49M |

A shelf that is never pruned now finishes on a negative weekly net; a disciplined
one stays positive. Run `npm run playtest` for the current table.

## Open tuning notes

- Tune market variance so surprises are exciting without making inputs feel
  meaningless.
- Calibrate the feedback noise ratio so signal-versus-noise is a real skill
  rather than a coin flip.
- A fuller rival (a counter-lever such as poaching a designer) if the ambient
  version tests as too flat.
- Regional releases are cosmetic over one card pool. Real per-region card lists,
  the way Japanese sets are recombined for Western markets, remain unbuilt.
