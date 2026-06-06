# TCG Manager Simulator

A browser-based management sim where you run a trading card game company. You don't play the
card game — you *publish* it. Design sets, release them on your own schedule, watch the secondary
market and the competitive metagame react, manage a living community of named personalities, and
try not to power-creep or over-print your way into bankruptcy.

Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is cardboard.

## Status

Scaffolded. Vite + React app boots into a dashboard shell with a working
play/pause/fast-forward clock and the four metagame dials. The simulation
currently only decays the format each week — the market, personas, events,
and set-creation systems are stubbed and wired to their panels.

The full v1 specification and v2 roadmap live in [`docs/BRIEF.md`](docs/BRIEF.md).

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
  components/           # TopBar, MetagamePanel, MarketTicker, feeds
  styles/index.css      # vivid dashboard skin
```
