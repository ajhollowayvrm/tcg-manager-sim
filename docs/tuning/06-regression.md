# The regression suite

```
npm run check                  run both sweeps and gate them
npm run check -- --bank=N      also write docs/tuning/bank/round-N/
npm run check -- --from=DIR    gate an already-banked sweep instead of re-running
npm run check -- --print-bands emit the Markdown band table for 03-targets.md
```

**Run it at the end of every round.** Not at the end of the plan. A death route
that stopped firing three rounds ago is unattributable.

It takes about 28 seconds.

## What it does

Two sweeps, fixed so that a band always means the same thing:

| Sweep | Parameters | Feeds |
|---|---|---|
| `roster` | 20 seeds x 30 years, every bot | difficulty, structural, subsystem |
| `shape` | 30 seeds x 50 years, `conservative` | the per-set price shape and the age curve |

Then a thread-identity check (8 seeds, 15 years, both paths, byte-compared),
`tsc --noEmit`, and the band-table sync check.

## Reading a verdict

| `expect` | in band | Verdict | Exit |
|---|---|---|---|
| `pass` | yes | `PASS` | 0 |
| `pass` | no | **`FAIL`** | 1 |
| `known-fail` | no | `KNOWN` | 0 |
| `known-fail` | yes | **`FIXED`** | 0 |
| either | no data | `NO-DATA` | 1 on a `pass` gate |

**`FIXED` is the verdict this suite exists for.** A round aimed at the price
shape should end by reporting that seven `shape` gates went `KNOWN` to `FIXED`.
The output names the gate to flip in `harness/gates.ts`. Flipping it is what
stops the next round undoing the work.

**`NO-DATA` fails a `pass` gate.** A gate that silently stops measuring is worse
than one that fails, because it looks like success. Every ratio gate is guarded
on its denominator column — `flopSetsJudged`, `signalPairs`, `gradedCopies`,
`dropsRun`, `setsAtAge2` — so an absent measurement is never read as a zero.

**`DRIFT`** annotates any value that has moved more than 25% from its banked
figure, whatever the verdict. That is what catches a number sliding a long way
inside a wide band, which no pass/fail can see.

## The rules

1. **Gate on bands, not points.** A band a round narrows is a band later rounds
   will fail for no reason.
2. **Widen only with a written reason.** Append a dated line to the gate's `why`
   in the same change. The field is required, so the cost is zero.
3. **`gates.ts` is the source; `03-targets.md` is the reader.** Change a band in
   the code, then re-paste the table. `static.bandsInSync` enforces it.
4. **Bank every round.** `--bank=N` writes `gates.json` and `report.md` under
   `docs/tuning/bank/round-N/`, and those are committed. The CSVs are not:
   `sets.csv` is megabytes and would dominate the repository within four rounds.
   `git diff` across two banks is what answers "did round 3 regress round 1".

## Known failures, and what owns them

**[2026-09-05, after Round 8] Four gates fail by design.** Rounds 4, 5 and 6
cleared the nine `shape` gates, `sub.gemRate` and `sub.scalperShare` that this
table used to list.

| Gate | Reads | Owner |
|---|---|---|
| `diff.conservativeSurvives` | 0.900 against [0.95, 1] | Round 10, finance |
| `diff.idleDies` | 12.019 against [2.5, 9] | Round 10, finance |
| `sub.channelHogLosesReach` | 7 against [0.5, 6] | Round 11, item 2 |
| `shape.surpriseGrail` | 1 against [0.1, 0.6] | **nobody** — see below |

`shape.surpriseGrail` cannot be cleared by tuning at any value. It is a
scale-invariant ratio over the whole catalogue, so at 280 cards a set it asks
whether any one of about 8,400 printings ever broke out over 30 years, and the
answer is certain. Fixing it needs the metric redefined per set, and that needs
a band `05-real-world.md` says the research cannot supply. It is a design
decision, not a round.

Anything **else** failing is a real regression. Investigate it in the round that
caused it, not later.

## What is deliberately not gated

- **Absolute net worth.** Every dollar figure has moved on every pass, including
  passes that changed no formula. `diff.hypeGamblerTopEarner` gates the *rank*
  instead, because the design claim is an ordering.
- **The whole-catalogue price columns** (`medianCardPrice`, `p90`, `p99`, `max`).
  They pool fifty years of printings and the project has decided they are the
  wrong measurement. The per-set columns supersede them.
- **Creators and chains.** No targets are measured for either; both are wired
  for behaviour rather than balance. **Collabs are no longer on this list:**
  Round 8 gave them `diff.licensorEarns` and `diff.licensorSurvival`, which
  gate the licence as a trade — it has to pay, and it has to be able to be the
  wrong licence.
- **The p99 decile step.** Read from `--dist`, which forces one run. A sample of
  one is not a gate.
