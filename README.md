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

- **Segment drift from the metagame dials** — the four dials don't yet passively
  push player segments week-to-week; segments only move via events, bans, and
  persona sway. (`// TODO` in `simulation.js`.)
- **Clock auto-slow on interesting moments** — the clock auto-*pauses* on
  release/ban/rotate/game-over, but doesn't auto-*slow* on spikes, crashes, or
  ban-pressure thresholds. (`// TODO` in `simulation.js`.)
- **Quiet-week fast-forward** — quiet weeks don't yet compress automatically.
- **Save/load string** — the brief's optional copy/paste save is not implemented.

After those, the brief calls for a frontend-polish pass and the open tuning
notes (decay rate, market variance, feedback-noise ratio).

## Tech

- Single-page browser app (Vite + React), no backend — all state in memory.
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
    useGame.js          # reducer + clock hook
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
