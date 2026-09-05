# Sweep workflow

How to run a tuning sweep, and the rules a sweep must obey.

---

## The CLI

```
npm run sim -- [flags]
```

| Flag | Default | Meaning |
|---|---|---|
| `--seeds=N` | 40 | Seeds per bot. |
| `--years=N` | 50 | Years per run. |
| `--bot=NAME` | `all` | One bot, a comma-separated list, or `all` (18 bots). |
| `--set=path=value` | — | A config override. Repeatable. Throws on an unknown path or a non-number. |
| `--jobs=N` | one per core | `--jobs=1` forces the synchronous path. |
| `--dist` | off | Price decile ladder for the last run. Forces `--jobs=1`. |
| `--out=DIR` | `./out` | CSV destination. |
| `--check=N` | 52 | Ticks between invariant checks. |

```
npm run sim:quick                                          # 5 seeds, 15 years, all bots
npm run sim -- --seeds=40 --years=50 --bot=all
npm run sim -- --set=value.noiseSigma=0.09 --set=attention.fatigueGain=0.05
npm run sim -- --seeds=1 --years=25 --bot=conservative --dist
npm run typecheck
```

Total runs is `seeds x bots`. `--seeds=20 --bot=all` is 360 runs.

---

## Sample sizes that have been used

| Question | Sample |
|---|---|
| The `value` block | 30 seeds x 25 years, `conservative` |
| Difficulty and survival | 20 seeds x 30 years, all 18 bots |
| The `art` block | 15 seeds x 30 years, 3 art strategies |
| The `hype` block | 20 seeds x 30 years |
| `referenceRunUnits` | 20 seeds x 25 years, `conservative` |
| `sideGraderBrandGate` | 4 seeds x 50 years, `conservative` |

A survival rate needs 20 seeds to mean anything. A price distribution needs 30.

---

## The rules

### 1. Sweep a block, not a knob

The `value` block was tuned as one unit and its knobs are not independent:
`scarcityExponent` and `referencePopulation` set the day-one ladder, the
nostalgia triple decides who climbs it, and `chaseSigma` sets how far the
luckiest card gets. Move one and re-measure all five targets in
`03-targets.md`.

### 2. Use `--dist` for shape, never the median and max columns

Only the step between deciles tells a power law from flat mush. Run it whenever
you touch anything in `value`.

### 3. Do not add or remove an RNG draw

A run is a pure function of `(bot, seed, years, config)`. One extra draw on a
stream renumbers every later roll on it and moves every balance number in
`HANDOFF.md`.

The streams are separate for exactly this reason:

| Stream | Carries |
|---|---|
| `s.rng` | the value engine, sales, the world bootstrap |
| `s.gradingRng` | grading — an observer must not renumber what it observes |
| `s.regionRng` | region taste, region readings, the creator roster |
| `s.actorRng` | the four populations |
| `s.artRng` | commissions and roster drift |

**Draw from the stream the subsystem owns.** The grader roster in `world.ts` is
on literals with no RNG at all, for the same reason.

A change that only reshuffles noise is not free. It is a full re-measurement.

### 4. The parallel path must stay byte-identical

The CSV from a worker-pool run must match `--jobs=1` byte for byte. That
identity is the acceptance test for any change meant to be free.

```
npm run sim -- --seeds=8 --bot=conservative --out=./out-par
npm run sim -- --seeds=8 --bot=conservative --jobs=1 --out=./out-seq
diff ./out-par/runs.csv ./out-seq/runs.csv
```

### 5. Keep the coupled constants in step

Two coupled pairs survive the config move. Changing one alone breaks a contract.

| Value | Path | Must agree with |
|---|---|---|
| Total audience, 600,000 | `world.segmentSize` x 6 segments | `attention.referenceAudience` |
| Starting cash, $500,000 | `finance.startingCash` | `finance.borrowCeilingBase` |

The COGS coefficient is fixed: `printing.cogsCoefficient` is one path, read by
both the engine and the bots.

### 6. Money is cents

`500_000_00` is $500,000. A literal without the `_00` suffix is off by a
hundred. This has already been a live bug twice — artist rates, and starting
cash.

### 7. Preserve operation order when you touch a formula

`(a * b) / c` is not `a * (b / c)`. They disagree in the last bits about a third
of the time, and the price engine amplifies that into a different run. This is
not hypothetical — it broke 47 of 360 runs during the config move, and the CSV
identity check above is what caught it.

### 8. Almost everything is a `--set` path now

511 of them. What is left outside config is the bot strategy constants in
`harness/bots.ts`, which describe how a scripted player plays rather than how
the world works. Release cadence is one of those, so the `HANDOFF.md` cadence
table still needs a scratch script to re-measure. See `02-hardcoded.md`.

### 9. Watch for a constant wearing a population's clothes

If a metric reports the same number in every seed, the knob behind it is
probably pinned to a floor or a ceiling and is not saying anything. It has
happened with `collectorDensityReference`, `ripBreakEven`,
`unitsPerScalperReference`, `speculatorHeatPerCapita` and
`popScarcityReference`. Check the spread across seeds before believing a mean.

---

## A sweep in practice

```bash
# 1. Baseline. Keep it.
npm run sim -- --seeds=20 --years=30 --bot=all --out=./out-base

# 2. One value per run, same seeds and years.
for v in 0.20 0.30 0.45 0.60; do
  npm run sim -- --seeds=20 --years=30 --bot=conservative \
    --set=value.scarcityExponent=$v --out=./out-scarcity-$v
done

# 3. Shape, on the value you chose.
npm run sim -- --seeds=1 --years=25 --bot=conservative \
  --set=value.scarcityExponent=0.45 --dist

# 4. Re-check every target the block touches. See 03-targets.md.
```

Record the finding the way `config.ts` already does: the value, the range you
swept, what broke at each end, and why the chosen point is the right one. A
number with no reason attached gets moved again by the next person.

---

## After a tuning change

0. `npm run check` — the balance regression suite. See
   [06-regression.md](06-regression.md). It runs both standard sweeps, gates
   every band, and reports which of this round's known failures started passing.
   **Run it at the end of every round**, and bank it with `--bank=N`.

1. `npm run typecheck` — the only static check.
2. Invariant checks pass across all bots. They are the only runtime check;
   `--check=N` sets the interval.
3. Re-measure every target in `03-targets.md` that the block touches.
4. Update `HANDOFF.md`, and the comment above the knob in `config.ts`.
5. Mark the knob **swept** in `01-knobs.md`.
