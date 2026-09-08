# Screens audit — what the sim can feed a UI

> **Update, Phase 1 (UI build).** All seven screens are now BUILT, not merely
> feedable, and the decision surface went from 6 of 22 `api.*` calls to 24 of 24
> (counting `borrow` and `repay`, which had no wrapper at all). Building them
> found five defects the audit could not have predicted, and they are recorded
> at the end of this file under "What the build found".

Written 2026-09-06, Round 11 C13. It closes Plan 1.

**Purpose.** CONCEPT.md §8 names seven screens. This says, for each one, which
state field feeds each element, what is missing, and what a UI must NOT do.
Read it before designing a screen. Every field named here exists at HEAD and
every claim was checked against the code, not against the design document.

## The three rules a UI must not break

1. **Never render `truth.*`.** Every `truth` block is ground truth the player
   must not see: `IpEntity.truth.relatability`, `.affinities`, `.longevity`,
   `Region.truth.*`, `Printing.truth.chase`, `Artist.growth`. A screen shows a
   READING — `readAffection`, `forecastSetDemand`, `forecastPrice`,
   `readRegion` — which is the same number wearing the error the studio has
   not paid to remove. Rendering the truth deletes the whole progression tree,
   because every tier in it buys error reduction and nothing else.
2. **Reading the world must not change it.** `readRegion` used to draw three
   Gaussians per call, so opening the region screen twice gave two answers and
   advanced the run. It derives its error from a stored seed now. Any new
   reader must do the same: **no `rand`, `gauss` or `chance` on a read path.**
   A repaint is not a decision.
3. **Drive the sim through `api.*` only.** Every `api` call submits a
   `Decision` onto a queue, so a run is reconstructable from its seed plus its
   decision log. A UI that mutates `SimState` directly breaks save/load,
   replay and every gate in the suite.

## Screen by screen

### 1. Card price history — READY

| Element | Field |
|---|---|
| Raw price over time | `Printing.market.rawHistory` (`SparseSeries`) |
| Graded price over time | `Printing.market.gradedHistory[graderId][tier]` |
| Current raw / graded | `market.rawPrice`, `market.gradedPrices` |
| Heat, nostalgia | `market.heat`, `market.nostalgia` |
| Liquidity | `market.liquidity`, `market.lastTradeTick` (live since C9) |
| Forward price band | `forecastPrice(s, printingId, weeks)` |
| Reprint / error badge | `isReprintOf`, `error.kind`, `error.discoveredTick` |

`SparseSeries` is compacted, so points are unevenly spaced by design — plot
against the stored tick, never against an array index.

`forecastPrice` sharpens with `unlocks.analytics` and **cannot see a shock
coming**. That is deliberate: analytics buys a sharper view of the trend,
never of the surprise. Do not present it as a prediction.

### 2. Set health — READY

| Element | Field |
|---|---|
| Sell-through | `SetPerformance.unitsSold`, `.unitsUnsold` |
| Sell-through per channel | `SetPerformance.sellThroughByChannel` |
| Chase performance | `SetPerformance.chaseIndex` |
| Aftermarket index | `SetPerformance.aftermarketIndex` |
| Goodwill effect | `SetPerformance.goodwillDelta` |
| Revenue against cost | `SetPerformance.revenue`, `CardSet.actualCost` |
| Pre-launch demand read | `forecastSetDemand(s, setId)` |
| Hype at launch | `CardSet.hype.level`, `.levelAtRelease`, `.signal` |
| Preorders | `CardSet.preorders` — `units`, `cap`, `revenue`, `unfilled` |

`performance` is `null` until the set releases. A set screen needs three
states, not one: design/committed (a forecast), revealing (hype and preorders),
released (performance).

`hype.signal` and `forecastSetDemand` are **two different instruments and may
disagree**. The signal measures chase and arrives after the print run locks;
the forecast reads demand before commit and sharpens with money. Showing them
as one number destroys the decision they exist to inform.

`preorders.unfilled` is a promise the studio broke. Surface it.

### 3. Pop reports — READY

| Element | Field |
|---|---|
| Copies by grade | `Printing.population.graded[graderId][tier]` |
| Raw / opened / sealed | `population.opened`, `.sealed`, `.destroyed` |
| Submissions in flight | `MarketState.gradingQueue` |
| Grader identity | `Grader.name`, `.strictness`, `.reputation`, `.marketShare` |

**The tradeable pool is not the printed count.** `tradeablePopulation` in
`actors.ts` subtracts destroyed, slabbed and collector-held copies, and it is
what the price engine reads. A pop report that shows only the print run is
telling the player a number the market does not use.

### 4. IP roster — READY

| Element | Field |
|---|---|
| Affection vibe | `readAffection(s, ipId)` — **never `ip.affection`** |
| Appearance counts | `IpEntity.appearanceCount`, `.cameoCount` |
| Trend arrows | `IpEntity.affectionHistory`, `.resurgenceHistory` |
| First printing | `IpEntity.firstPrintingId` |

`readAffection` returns a `Reading` with a `display` tier that says how sharp a
number the UI is ALLOWED to print: `prose` at tier 0, then `adjective`, `band`,
and only at tier 3 a bare number — and even then the noisy one. **The display
tier is a rendering contract, not a hint.** It is how CONCEPT.md §11's "the
reading firms up as the studio invests" reaches the screen.

`resurgenceHistory` is what makes a trend arrow honest: affection says where a
character is, resurgence says whether a vintage price run is pulling it back.

### 5. Artist roster — READY

| Element | Field |
|---|---|
| Stats | `Artist.stats` — linework, color, composition, speed, reliability |
| Reputation now | `Artist.reputation` |
| Reputation trajectory | `Artist.reputationHistory` (added in C4) |
| Availability | `Artist.available`, `.exclusiveTo` |
| Rates | `Artist.rate`, `.baseRate`, `.turnaroundWeeks` |
| Relationship | `Artist.relationship` |

**`Artist.growth` is hidden and must stay hidden.** It is the whole scouting
gamble: the cheap unknown is either the bargain of the decade or filler, and a
visible growth number turns a bet into a sort. `reputation` is the visible,
priced half; `growth` is the free, hidden half.

`Artist.specialty` exists, is rolled, and is read by nothing yet. Do not build
a filter on it until Round 12 wires it.

### 6. Channel board — READY

| Element | Field |
|---|---|
| Allocation per channel | `Product.allocations[channelId]` |
| Relationship score | `Channel.relationship` |
| Capacity | `Channel.capacityUnits`, `effectiveCapacity(s, ch)` |
| Terms | `Channel.marginShare`, `.minimumOrder` |
| Gate | `Channel.requiredBrandStanding` against `Publisher.brandStanding` |
| Under-delivery | `Channel.lastAllocatedTick` — a long gap IS the warning |
| Drop queue | `Channel.queueCapacity` (direct store only) |

Show `effectiveCapacity`, not `capacityUnits`. The raw field ignores souring,
so the board would promise shelf space the channel will not give.

`Channel.reliability` is declared and unread. Do not surface it yet.

### 7. Feeds — READY, with one caveat that is a real constraint

Every entry is a `SimEvent`: `{ id, t, kind, interrupts, refs, data }`. There
are 43 kinds, and the table below accounts for every one. `interrupts` is the
priority flag — an interrupting event earns a modal or a toast, the rest belong
in a scrolling feed.

| Feed | Kinds |
|---|---|
| Social reactions | `communitySentiment`, `fatigueWarning` |
| Creator streams | `creatorOpened` |
| Drop chaos | `dropScheduled`, `dropSoldOut`, `dropUndersold`, `scalperCrash` |
| Error discoveries | `errorDiscovered` |
| Price events | `priceSpike`, `priceCrash`, `newGrail`, `vintageSpike`, `setRediscovered`, `characterResurgence`, `speculatorSwing` |
| Art pipeline | `artCommissioned`, `artDelivered`, `artMissedRelease`, `artistSigned`, `artistRetired`, `artistArrived`, `artistBreakout` |
| Business | `channelStrained`, `channelLost`, `channelUnlocked`, `unlockPurchased`, `debtWarning`, `studioDead`, `regionUnlocked`, `eventHosted`, `preordersTaken`, `preordersFilled` |
| Sets and stock | `setReleased`, `setSoldOut`, `setUnsold`, `sealedSqueeze` |
| Licensing and offers | `collabOffer`, `collabOffered`, `collabSigned`, `collabExpired`, `collabGuaranteeCalled`, `artistOffer` |
| Grading | `graderEnteredMarket` |

**The caveat, measured: a 50-year run holds 142,596 events, and the event log
is 36% of a 63.7 MB save.** The feed cannot be "render the array". It needs a
windowed query by tick range and kind. `serialize` takes an explicit, lossy
`trimEventsBefore` for the save path, and it is deliberately NOT the default,
because the harness reads drop and creator coverage off the full log.

## What is missing

Nothing blocks a screen. Two things are worth knowing before you draw:

1. **There is no price index.** `MarketState.indexes` was cut in C12 — it was
   written once at world creation and never updated, so a chart built on it
   would have drawn a flat line for fifty years. A market-wide index has to be
   computed from `rawHistory` when a screen asks for one.
2. **Four fields are declared and unread**, so a screen that binds to one shows
   a frozen value: `Card.treatment`, `progressionLink.position`,
   `Artist.specialty`, `Channel.reliability`. Round 12 wires them.

Five more mechanisms are live at a weight of exactly 0, which means they exist,
they are correct, and they do nothing yet: the mascot term
(`affection.longevityWeight`), preorder conversion (`preorders.conversionRate`),
the buylist spread (`actors.buylistWeight`), the regional segment mix
(`region.segmentMixAcquisitionWeight`) and illustration chains. A screen may
show all five; it will read zero until Round 12 turns them on.

## Save and load

`save.ts` round-trips the whole state, and `static.saveRoundTrip` gates it every
run. Two things a UI must respect:

- **No cache may live on `SimState`.** The three engine caches are `WeakMap`s
  held outside state on purpose, so a revived state simply gets fresh ones.
  Moving one onto the state is how C1 found the sealed-contents defect: a value
  refreshed every sixth stride became state, and a reloaded run diverged by a
  cent that then propagated.
- **A 50-year save is 63.7 MB.** Budget for it, or trim the event log.


## What the build found

Wiring a screen to a field is how you find out whether the field was right. Five
defects, none of which a green suite could have shown.

1. **`api.borrow` had no ceiling.** The `borrow` handler took any amount and
   booked it, with no reference to the lending ceiling `tickFinance` computes
   eight lines above. Nothing had ever called it, so the hole never opened — a
   UI calling it is infinite money. `borrowCeiling` is now a shared pure
   function and the handler clamps to it.

2. **`forecastPrice` diverged.** It read drift off the last TWO points of a
   compacted series and compounded that per-week rate over the whole horizon.
   Measured in the app: a card standing at $122.71 forecast a band of $1.15 to
   $8.49 a year out. Drift is now measured over a window and bounded by
   `readings.forecastMaxDriftPerYear`. Nothing in the value engine reads
   `forecastPrice`, so this moved no gate.

3. **A save could not survive a new FIELD, in two separate ways.** A save carries its whole
   config, so a save written before a knob existed came back missing it, and a
   missing knob is `undefined` — which turns the first arithmetic that touches
   it into `NaN` and spreads. Two knobs added in one session turned a live
   save's forecast into "NaN to NaN". `deserialize` now backfills missing keys
   from `defaultConfig`, adding only what the save lacks.

   The entity half was found the same way, by the app crashing: an `IpEntity`
   written before `archetype` existed came back without it and the roster read
   `undefined.toUpperCase()`. `migrateEntities` handles that, and **every field
   added to an entity from now on needs a line there** — the same discipline as
   a database migration, and for the same reason. Adding one is cheap;
   forgetting one breaks every existing save the first time a screen reads it.

4. **The interrupt modal nested a button inside a button.** Invalid HTML, and a
   real hit-target bug on iOS where the inner tap can be swallowed.

5. **Three dead symbols in the app.** `MIXES` and a module-level `pickRarity`
   were the first rarity screen, replaced by the editable ladder and unreachable
   since; `pickRarity` only read as live because a local variable shares its
   name. `FINISHES` was declared and never read.

### Two things the screens must keep saying honestly

- **`realisableCardValue` returns the raw price**, because `actors.buylistWeight`
  ships at exactly 0. The market screen says "no spread is modelled yet" rather
  than "after the shop's spread", and it must keep telling the truth until that
  knob is fitted.
- **`Artist.specialty` is still unread**, so the artist screen does not filter on
  it. It gains a consumer when the art director lands.
