# TCG Manager Simulator

A browser-based management sim where you run a trading card game company. You don't play the
card game — you *publish* it. Design sets, release them on your own schedule, watch the secondary
market and the competitive metagame react, manage a living community of named personalities, and
try not to power-creep or over-print your way into bankruptcy.

Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is cardboard.

## Status

Pre-build. The full v1 specification and v2 roadmap live in [`docs/BRIEF.md`](docs/BRIEF.md).

## Tech

- Single-file browser app (React preferred), no backend — all state in memory.
- Turn-based simulation on a variable-speed weekly clock.
