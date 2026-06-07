# TCG Manager Simulator

A browser-based management sim where you run a trading card game company. You don't play the
card game — you *publish* it. Design sets, release them on your own schedule, watch the secondary
market and the competitive metagame react, manage a living community of named personalities, and
try not to power-creep or over-print your way into bankruptcy.

Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is cardboard.

## Status

**v1 core loop is built and playable.** Design a set, release it, and the world
reacts week by week: the secondary market resolves singles & sealed prices with
momentum and burstable hype bubbles, 18 named community personas chatter through
a signal-vs-noise feedback feed, an events feed throws curveballs, and you wield
bans & rotations against the metagame — all funded by a sealed-product economy
with the twin cash / player-base death spirals. Format decay drives the whole
thing. See [`docs/BRIEF.md`](docs/BRIEF.md) for the spec, now annotated with
per-section build status (✅ done / ⏳ remaining) and the v2 roadmap.

### Known v1 gaps (remaining work)

- **Artist trajectory** — artists have a `trajectory` field but don't yet rise or
  blow up dynamically over a run; commissioning is otherwise complete.

After that, the brief calls for a frontend-polish pass and the open tuning
notes (decay rate, market variance, feedback-noise ratio).

_Recently completed: silent autosave — the whole run persists to localStorage on
every change and resumes on reload (`game/persistence.js`); segment drift from
the metagame dials (`segments.js`); and clock auto-slow / auto-pause / quiet-week
fast-forward (`clock.js`)._

## Tech

- Single-page browser app (Vite + React), no backend — state lives in memory and
  autosaves to localStorage, so a run survives a reload.
- Turn-based simulation on a variable-speed weekly clock.

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
    sets.js             # set draft, cost, card generation, release effects
    market.js           # secondary market: singles & sealed price resolution
    revenue.js          # weekly sealed-product sales + supply cap
    personas.js         # persona reaction engine (signal vs noise)
    events.js           # events catalogue + weekly roll
    bans.js             # ban / rotate logic + community blowback
    content/            # static rosters: artists (32), personas (18), themes (10)
  components/           # TopBar, MetagamePanel, MarketTicker, feeds, panels
    setbuilder/         # SetBuilder, SignatureCardEditor, Slider
  styles/index.css      # vivid crimson / noir dashboard skin
```
