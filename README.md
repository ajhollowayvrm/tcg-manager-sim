# tcg-manager-sim

A headless simulation of running a trading-card publisher: design cards,
commission the art, commit a print run blind, and find out.

There is **no UI**. This repository is the simulation core and a balance
harness, and `CONCEPT.md` is the design contract both answer to.

## Layout

```
CONCEPT.md             the design contract
HANDOFF.md             what is built, what is measured, what is left
docs/tuning/           the tuning reference: every knob, every target

src/sim/types.ts       full domain model (the contract in type form)
src/sim/rng.ts         seeded PRNG, serializable
src/sim/series.ts      sparse time series + compaction
src/sim/config.ts      every tunable constant, with dotted overrides
src/sim/channels.ts    channel traits, capacity, default allocation split
src/sim/regions.ts     regional taste, market entry, noisy region readings
src/sim/actors.ts      collectors, resellers, speculators, named creators
src/sim/world.ts       initial state bootstrap
src/sim/engine.ts      tick loop and the value engine
src/sim/invariants.ts  dev assertions

harness/bots.ts        the strategy bots
harness/metrics.ts     per-run balance metrics + CSV
harness/runOne.ts      one run, shared by the runner and the workers
harness/worker.mjs     worker entry point (installs the TypeScript loader)
harness/worker.ts      batch worker body
harness/run.ts         CLI runner + thread pool
```

## Running it

```
npm run sim:quick
npm run sim -- --seeds=40 --years=50 --bot=all
npm run sim -- --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist
npm run sim -- --jobs=1          # force the synchronous path
npm run typecheck
```

Batches shard across worker threads, one per core. A run is a pure function of
(bot, seed, years, config), so the CSV is byte-identical to the synchronous
path — only the wall clock moves. That identity is the acceptance test for any
change meant to be free.

`--dist` prints a price decile ladder for the last run. Use it, not the median
and max columns, whenever you change anything in the `value` config block: only
the step between deciles tells a power law from flat mush.

Runs through `tsx`, no build step.

## Reading the output

The console prints a wide summary table plus narrower ones for finance and
survival, regions, the secondary market, creators and chains, collabs,
direct-store drops, the reveal window, grading and the art pipeline. Each
narrow table prints only for runs that produced anything in it. Everything also
goes to `out/runs.csv`.

Start with **HANDOFF.md**. It carries the measured numbers, the balance targets
each system is held to, and the list of what is still missing.
