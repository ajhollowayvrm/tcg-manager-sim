# Sets, printing and distribution

Design discussed 2026-09-06 with AJ. **Not implemented.** Companion to
`characters.md`. Read `../screens-audit.md` for what the sim can already feed.

The loop this describes: **studio → characters → set → print → distribute.**

## 1. Designing a set

Five steps, in AJ's order. Three of them mostly wire fields that already exist.

### 1.1 Where the set falls

`SetType` already covers most of it: `main | specialty | subset | promo | collab`.

**"Era" has no home in the model at all.** Nothing spans sets. `nostalgia` and
`resurgence` attach to printings and characters, never to arcs. An era is the
natural unit for "the end of an era" to mean anything, and it is what makes a
ten-year-old set feel like part of something rather than a loose object.

**Spec it separately.** It changes what the back catalogue *is*, and folding it
into set creation would hide a large idea inside a small step.

### 1.2 The gimmick

`Card.treatment` already exists — `none, holo, reverseHolo, textured, goldFoil,
etched, fullArt, jumbo` — and is **declared, defaulted, and read by nothing.**
It is on the four-field inert list in the screens audit.

The EX/GX/VMax idea is the consumer that field never had. A set-wide gimmick
picks the treatments available in the set; a crafted card chooses among them.

### 1.3 Rarities and pull rates

Nine rarities exist. Pull rates are **config today, not a player decision.**
Making them one is the largest new lever in this design, and it needs its
constraint shipped in the same change.

**The constraint is physical and already true in the model.** From the config:

> *"Summed over the roster's rarity mix it is about 17.5 cards a pack, and a
> pack holds the same number of cards whatever the set size."*

A pack holds a fixed number of slots. **Setting pull rates allocates those
slots; it never creates them.** Make the secret rare 1 in 1000 and those slots
must come from somewhere else.

**A second constraint makes rarity self-taxing.** `value.scarcityExponent` is
**0.45**. Halve a card's pull rate and its copies halve, but its price rises
only by `2^0.45` ≈ 1.37x. Its contribution to box value is `price × pullRate`,
which scales as `pullRate^0.55` — so it **falls**.

| Push slots toward | You gain | You lose |
|---|---|---|
| The chase | Top price, a story, `chaseOverMedian` climbs | Box value, so ripping pays less and sealed softens |
| The commons | A box worth opening, healthy secondary volume | No grail, and nothing to talk about |

Because the exponent is below 1 there is **no runaway optimum**. The UI job is
only to make the trade visible: a fixed pool of pack slots and a live box-value
readout. **Never ship a free slider** — the fixed pool IS the decision.

**Why this matters more than it looks.** `pullRate` feeds both consumers of
"what a box holds" — `expectedSinglesValue` and the sealed-contents loop — which
C9 forced to move together after Round 4a caught them disagreeing by four times.
A player-set pull rate reaches the entire secondary market: ripping, the
reseller population, the scalper trade, sealed prices.

### 1.4 Secret rares and sub-collections

A secret rare that is never advertised is **hidden information the market
discovers after release.** The model has the shape already: `errorDiscovered`
fires when somebody spots a misprint that was always there. A secret rare
discovery is the same event shape with a heat spike attached.

A sub-collection inside a set is new. Note `subset` today is a whole separate
set, not a group within one.

### 1.5 How many cards

`CardSet.targetSize` exists and is already load-bearing: `rarityPull` scales
with set size, so a 280-card set makes every card four times rarer rather than
putting four times the cardboard in a pack.

### 1.6 Art director

New, and it pays for itself: a set-wide director sets baseline art quality and
coherence, and **matching their `specialty` to the set's gimmick is what finally
makes `Artist.specialty` read.** That field is on the inert list too.

### 1.7 Crafted cards — the structural one

Today all 280 cards are equal `Card` records, each individually authored. AJ's
model: **the player crafts a handful, and the rest exist without being
authored.**

The sim already half-supports this from the other direction. When an artist
misses a deadline the card ships as house filler at `art.houseQuality`, and
there is a live gate for it — `sub.houseArtShare` reads 0.086.

So the split is:

| | Carries |
|---|---|
| **Crafted card** | A character, a rarity, a treatment, an artist |
| **Filler** | A rarity and house art |

This is what makes a 280-card set a phone-sized decision instead of 280 of them.

**Variants.** "Three cards, all Aryla, different rarities" works today — nothing
stops two cards sharing a `subjectIp`. What is missing is the *group*.
Collectors chase the complete variant run, and that is pull demand, which is
exactly the shape `chainTerm` already models. **A variant group is a third chain
kind**, beside progression and illustration.

## 2. Relations, authored at set creation

Relations between characters are authored when a set is made.

**Two graphs at two layers, and they must be coupled.**

| Layer | Graph | Status |
|---|---|---|
| Character | IP ↔ IP, typed — family, rival, mentor | Does not exist |
| Card | card → card, ordered — evolves into | Live, but **unordered** |

`progressionLink.position` is declared and read by nothing, so a chain is
currently an unordered set. Charmander, Charmeleon and Charizard pay the same
in any print order. **"Evolves into" is directional, and `position` is the field
declared for exactly that.**

**Couple the layers:** a card chain that expresses a real character relation
pays more than an arbitrary one. That makes the character graph load-bearing at
design time rather than flavour, and `chainTerm` already has the shape — it
gains a multiplier for whether the underlying relation exists.

See `characters.md` for the relation types and for why `mentor` is the answer to
the ageing-roster problem.

**The community authors relations too.** The IN-GAME audience decides two of
your characters are rivals whether or not you intended it, and demand for that
pair moves. `communitySentiment` already exists to carry it. This must NOT mean
real players sharing relation sets — that is a live service with moderation, and
CONCEPT §12 says the sim never depends on the network.

**The stacking risk.** `castDesire` is already `affection + resurgence + cameos
+ chainDesire`. Relations and affiliation would make six modifiers on one
number. **If they stack, every card gets every bonus and the baseline inflates
until none of them is a decision.** They must compete — best bonus, not the sum
— or the set carries a cap. Decide this before four rounds each add a term.

## 3. Printing

**Today's model already IS "you pay an outside printer":**
`unitCost[quality] × packsPerUnit × cogsCoefficient`. Pure variable cost, no
fixed cost, no ceiling. That is the correct starting state.

The arc is outsourced → lease space → buy machinery.

| | Outsourced (today) | Own facility |
|---|---|---|
| Cost shape | Per unit only | **Capex, plus a weekly bill that runs whether or not you print** |
| Marginal cost | High | Lower |
| Capacity | Unlimited — they scale | **A ceiling in units per week** |

That is operating leverage, and it brings a new death route: **buy a factory,
then fail to fill it.** The model already has the bot to catch that shape —
`lateIdle` tests a standing bill against a catalogue that is still selling, and
a factory would be the largest standing bill in the game.

`unlocks.specialtySetSlots` carries the seed, with the comment *"a slot is a
production line, not a receipt."*

**The cost to accept:** a capacity ceiling turns printing into scheduling. A
large run takes weeks of line time and allocation already locks 18 weeks before
release, so this adds a production calendar — a planning layer, not a screen.

**The warning, straight off C11's measurements.** Print quality currently costs
money and buys almost nothing the demand side notices: `budgetSurvivor` is
`conservative` with one field changed and it EARNS MORE. A facility that makes
better quality cheaper does not fix that — it makes it worse, by lowering the
price of something that still buys nothing. **Fit the quality-to-demand link
before or with the facility**, or you have built a factory to cheaply produce a
tier no player wants.

## 4. Distribution

**Regions are market-level and there are no sub-regions.** `reg_us`, `reg_eu`,
`reg_jp`, `reg_latam`. Channels are national — "National Distributor", "Big Box
Chains". **Do not split EU or LATAM into countries:** four markets is right for
a phone game, and every regional constant is calibrated to them.

Live already: per-region `marketSize`, `wealth`, `priceTolerance`, `tasteBias`
per IP kind, `rarityAppetite` per rarity, `setFit()`, and `mismatchPenalty`
(0.25) discounting a set that does not suit a region. A region's reading is
noisy in inverse proportion to `knowledge`.

### Distribution is not a step after printing

A product is region-scoped — `defineProduct(setId, kind, regionId, packs, msrp)`
— and `commitPrintRun` takes quantities per product. Allocation to channels
locks in the same batch: *"this is the blind bet — it lands before reveal and
never changes after."*

**How much, where, and through whom are one irreversible decision, 18 weeks
before anything ships.** That is the core loop, not a limitation.

The UI reconciles this: set → print run → regional split → channel split → one
confirm. **The player experiences a sequence; the sim receives one commitment.**

### The rollout is a waterfall

`releaseTick = tick + 18 + i × 26`. Home ships at week 18, the second region at
week 44, the third at week 70. A region opened today sells nothing for half a
year.

### Moving stock — allowed, and time is the whole cost

Time alone is enough of a penalty here, on three counts: `market.heat` decays so
stock arrives colder than it left; cash stays locked in inventory booked at
cost, which is the shape that kills in an `overprint` death; and the destination
release window has passed. **No write-down needed.** A transfer stays a rescue,
never a plan.

**Guardrail 1, design.** A transfer may only go to a region already **opened and
already released into.** Otherwise freight becomes a way to skip the 26-week
entry lead and region entry stops meaning anything.

**Guardrail 2, engineering.** A transfer must move `unitsPrinted` along with the
stock, not just `sealedRemaining`. Sealed price reads
`scarcity = unitsPrinted / sealedRemaining`; move only the remaining stock and
both regions' scarcity ratios break in opposite directions — the source looks
artificially scarce, the destination artificially flooded. **That is the Round
4a bug shape, and it would stay invisible until sealed prices drifted.**

### Localised versus global SKUs — open, and worth having

A localised SKU fits its region and is stuck there. A global SKU ships anywhere
and suits nowhere in particular. That is a blind bet on regional confidence made
at the same moment as every other blind bet, and it answers "move stuff around"
more in the grain of the design than freight does.

`mismatchPenalty` does **not** model this today — it scores set-to-region taste
fit, not SKU portability. This would be new.

## What is new versus what is wiring

| New concept, no home | Wiring an existing field |
|---|---|
| Era | `Card.treatment` (the gimmick) |
| Art director | `Artist.specialty` (the director's fit) |
| Own print facility, capacity, capex | `progressionLink.position` (evolution order) |
| Player-set pull rates | `SetType`, `targetSize`, `setFit`, `mismatchPenalty` |
| Character relation graph | `chainTerm` (variant groups reuse it) |
| Crafted vs filler cards | `art.houseQuality`, `sub.houseArtShare` |
| Stock transfer | |
| Localised vs global SKU | |
