# TCG Manager Simulator

A browser-based management sim where you run a trading card game company. You don't play the
card game — you *publish* it. Design sets, release them on your own schedule, watch the secondary
market and the competitive metagame react, manage a living community of named personalities, and
try not to power-creep or over-print your way into bankruptcy.

Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is cardboard.

## Status

**v1 core loop is built and playable.** Design a set, release it, and the world
reacts week by week: the secondary market resolves singles & sealed prices with
momentum and burstable hype bubbles, 50+ named community personas chatter through
a signal-vs-noise feedback feed, an events feed throws curveballs, and you wield
bans against the metagame — all funded by a sealed-product economy with the
cash / player-base / sentiment death spirals. Format decay drives the whole
thing. On top of the core loop you also **author the booster format**
(slot-by-slot pack structure), **design counter cards** to answer a card or a
runaway archetype instead of banning, **sign distributors** for bulk-buy cash
that can tip the game into a price-spiking scalper market, **pull a set from
publication** (stop printing it → its singles spike on scarcity, collectors
cheer, the format refreshes), and **reprint** — re-issue a whole set as an
Unlimited run (the original becomes a 1st-edition premium) or reprint a beloved
card into a new set as a fan-service draw. See [`docs/BRIEF.md`](docs/BRIEF.md)
for the spec, annotated with per-section build status (✅ done / ⏳ remaining)
and the v2 roadmap.

### Known v1 gaps (remaining work)

- **Artist trajectory** — artists have a `trajectory` field but don't yet rise or
  blow up dynamically over a run; commissioning is otherwise complete.

After that, the brief calls for a frontend-polish pass and the open tuning
notes (decay rate, market variance, feedback-noise ratio).

_Recently completed: pull-from-publication (replaced rotate — `bans.js`
`pullFromPrint`) and reprints — set-level Unlimited re-issues + first-edition
premiums and card-level fan-service reprints (`sets.js` `reprintSet` /
`applyCardReprints`); booster formats (authored pack slots — `rarities.js` /
`packs.js`), counter cards (`sets.js` `applyCounters`), and distributors +
scalper culture (`distributors.js`); a manual click-to-advance clock with the
three death-spiral health meters (cash / players / satisfaction) surfaced in the
header (`TopBar.jsx`); silent autosave to localStorage (`game/persistence.js`);
and segment drift (`segments.js`)._

## Tech

- Single-page browser app (Vite + React), no backend — state lives in memory and
  autosaves to localStorage, so a run survives a reload.
- Turn-based simulation on a manual weekly clock — the player clicks "Advance
  Week" to step the sim one week at a time (no auto-timer).

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build
npm run preview  # preview the build
```

## Structure

```
src/
  main.jsx              # entry
  App.jsx               # dashboard layout
  game/
    initialState.js     # GameState shape (see BRIEF.md)
    simulation.js       # advanceWeek() — the one tick entry point
    useGame.js          # reducer + clock hook (+ autosave wiring)
    persistence.js      # localStorage autosave: load/save/clear the run
    rng.js              # seeded RNG (deterministic weekly resolution)
    sets.js             # set draft, cost, card generation, release + counters
    rarities.js         # rarity sheet + booster pack formats (slots/presets)
    packs.js            # pack ripping from the authored booster format
    market.js           # secondary market: singles & sealed price resolution
    revenue.js          # weekly sealed-product sales + supply cap
    personas.js         # persona reaction engine (signal vs noise)
    relationships.js    # persona comp/sponsor management layer
    distributors.js     # bulk-buyer deals + scalper-culture heat
    events.js           # events catalogue + weekly roll
    bans.js             # ban / rotate logic + community blowback
    archetypes.js       # metashare distribution math (shift/flatten/counter)
    content/            # static rosters: artists, personas (50+), themes, distributors
  components/           # TopBar, MetagamePanel, MarketTicker, DistributorsPanel, feeds
    setbuilder/         # SetBuilder, SignatureCardEditor, RarityEditor, PackFormatEditor
  styles/index.css      # vivid crimson / noir dashboard skin
```
