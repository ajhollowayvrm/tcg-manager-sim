# Handoff — TCG Manager Simulator sim core + harness

Read `CONCEPT.md` first. It's the design contract; this code is a partial implementation of it.

## What this is

A headless simulation core and a balance harness. No UI, no React, no storage layer yet.

```
src/sim/types.ts       full domain model (the design contract in type form)
src/sim/rng.ts         seeded PRNG, serializable
src/sim/series.ts      sparse time series + compaction
src/sim/config.ts      every tunable constant, with dotted overrides
src/sim/world.ts       initial state bootstrap
src/sim/engine.ts      tick loop + STUB value math
src/sim/invariants.ts  dev assertions
harness/bots.ts        four strategy bots
harness/metrics.ts     per-run balance metrics + CSV
harness/run.ts         CLI runner
```

Run it:

```
npm run sim:quick
npm run sim -- --seeds=40 --years=50 --bot=all
npm run sim -- --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
```

Requires Node 22.6+ (uses `--experimental-strip-types`, no build step). Swap to `tsx` if that ever gets annoying.

## Verified working

- Runs 50-year simulations headless, deterministic from seed
- Invariant checks pass clean across all four bots
- CSV output + console summary table
- Config overrides from CLI without touching code
- Sparse price history with quarterly compaction of anything older than 10 years

## Known problems — these are the next tasks

**1. The value math is a stub, and the balance is visibly wrong.**
Current symptoms from a 15-year run: `topMultiple` in the tens of thousands, median card price rounds to $0, brand standing pins at 1.0, and `flooder` is the strongest strategy. All four are bugs in the placeholder formula, not in the plumbing. The formula in `tickPrices` needs a real pass — especially the scarcity term (`100000 / surviving` is arbitrary) and the missing floor/ceiling behavior.

**2. Flooding is not punished.**
`flooder` survives with the best numbers, which per CONCEPT.md §6.2 must not be true. Attention regen almost certainly outpaces `perReleaseCost`, and goodwill is currently computed but never actually feeds demand.

**3. Performance.**
~3s per 15-year run, so a 50-year × 40-seed batch is impractical. Prices already update on a 4-tick stride and entity lists are cached. Next candidates: typed arrays for the hot price loop, skipping printings whose price hasn't moved in N ticks, and worker threads for batch runs.

**4. Large parts of the model are declared but not simulated.**
Channels, allocations, street pricing, grading and pop reports, regions beyond `reg_us`, collabs, creators, rival publisher behavior, reprints, chains, and errors all exist in `types.ts` and are untouched by `engine.ts`. `applyDecision` handles four decision types; the rest fall through to `default`.

**5. Bots bypass the decision queue.**
They call `api.*` helpers directly instead of submitting `Decision` objects. That breaks the replay guarantee in CONCEPT.md §10. Route them through `submit()` and expand `applyDecision` to cover every decision type.

## Things not to break

- The sim core stays pure: no React, no DOM, no `Date`, no I/O, no unseeded randomness
- Ground truth stays hidden: `IpEntity.truth`, `Region.truth`, `Artist.growth`, and `SealedMarket.hidden` must never be read by anything that renders
- `Printing` is the priced unit, not `Card`
- The art multiplier reads `Artist.reputation` live, never a value frozen at commission
- Price noise is load-bearing. Don't tune `value.noiseSigma` to zero to make runs look tidier
- Events store data, not prose

## Suggested first session

Fix the value formula and the attention/fatigue balance together, using `npm run sim:quick` as the feedback loop, and drive toward these targets:

| Metric | Target |
|---|---|
| `surpriseGrail` | 15–40% of runs |
| `flooder` survival | well below `conservative` |
| `medianCardPrice` | a few dollars, not zero |
| `top1PctShare` | 0.4–0.7 |
| `yearsToFirst100Dollar` | 3–8 years |
