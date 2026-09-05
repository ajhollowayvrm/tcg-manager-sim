# Tuning reference

Reference documents for the balance run. They record what can be tuned, where
it lives, what it moves, and what number it must produce.

| Document | Contents |
|---|---|
| [01-knobs.md](01-knobs.md) | The `SimConfig` blocks. All 511 paths are reachable with `--set`. |
| [02-hardcoded.md](02-hardcoded.md) | What is still not a config path, and why. Now a short list. |
| [03-targets.md](03-targets.md) | The metric each system must produce, and the knob that moves it. |
| [04-workflow.md](04-workflow.md) | How to run a sweep, and the rules a sweep must obey. |
| [05-real-world.md](05-real-world.md) | Measured industry numbers, with sources, to tune against. |

## How to read the status column

- **swept** — a sweep set this value, and `HANDOFF.md` records the measurement.
- **fitted** — a person set this value by eye against an output. No sweep.
- **first-guess** — nobody measured this value. The balance run owns it.
- **structural** — do not tune. The value defines a unit, a reference point, or
  a contract with another part of the model.

## Units

- Every money value is in **cents**. `100000` is $1,000.
- Every time value is in **ticks**. One tick is one week. 52 ticks is one year.
- A name that ends in `PerTick` is a weekly rate.
- A name that ends in `Reference` is a denominator. It sets where a curve equals
  1. It is a unit, not a strength.

## Everything is tunable

On 2026-09-04 every balance constant in the model moved into `SimConfig`. The
count went from 207 paths to 511. `CHANNEL_TRAITS`, the rarity tables, the grade
cuts, the demand coefficient, the strides, the whole world bootstrap and the
grader roster are all `--set` paths now.

The move was verified byte-for-byte: 360 runs over 20 seeds and 30 years produce
a CSV identical to the one before it. Nothing changed except what a sweep can
reach.

## Source files

```
src/sim/config.ts      the 207 tunable paths
src/sim/channels.ts    CHANNEL_TRAITS, effectiveCapacity
src/sim/world.ts       the opening state: rosters, seeds, starting cash
src/sim/engine.ts      the formulas, and the constants inside them
harness/bots.ts        the strategy constants
harness/metrics.ts     the measurements
```
