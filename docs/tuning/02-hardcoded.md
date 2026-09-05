# What is still not a config path

Before 2026-09-04 this document listed about 90 balance constants that `--set`
could not reach. They are all config paths now. `SimConfig` went from 207 paths
to 511.

This is what is left, and why each one stays where it is.

---

## 1. Not tunable, and should not be

| Value | Where | Why |
|---|---|---|
| The `normalCdf` coefficients (0.3275911, 1.061405429, …) | `engine.ts` | Abramowitz-Stegun 7.1.26, the erf approximation. Mathematical constants, accurate to about 1e-7. Changing them makes the maths wrong, not the balance different. |
| `52` weeks per year | everywhere | The tick unit. Changing it redefines every `PerTick` and `PerYear` rate at once. |
| `CHANNEL_IDS`, region ids, grader ids | `channels.ts`, `world.ts` | Identity, not balance. The numbers attached to each id are all in config. |
| Segment, rarity, IP-kind and product-kind enumerations | `world.ts`, `types.ts` | The shape of the model. Every weight attached to them is in config. |

---

## 2. Tunable in config, but do not move casually

### Strides — `config.strides`

`price`, `sealed`, `scalper`, `channel`, `grading`, `art`, `interest`,
`quarterly`, `annual`.

A stride decides **how many RNG draws a run makes**. Moving one renumbers every
later roll, so every banked measurement is invalidated and the CSV cannot be
compared to anything measured before. A stride also rescales any `PerTick` rate
that is multiplied by it.

They are config paths because the ask was that everything be tunable. Treat a
stride change as a re-measurement of the whole model, not as a tuning step.

### The rarity model — `config.rarity`

`weight` is a demand-side signal and never touches price. `pull` is copies
printed per card, and is how rarity reaches price through the scarcity term.
Changing either table moves everything at once.

### The master demand coefficient — `attention.demandCoefficient`

Every unit of demand in the model passes through it. It is the largest single
lever there is.

---

## 3. The harness, which is not the game

Bot strategy constants live in `harness/bots.ts` as `SetBotOptions`, not in
`SimConfig`. They describe *how a scripted player plays*, not how the world
works, so they are deliberately outside the game's config.

That still leaves one real gap: **release cadence is a bot constant, so it
cannot be swept with `--set`.** The cadence table in `HANDOFF.md` was measured
with a scratch script and has to be re-measured the same way.

The shared baseline nine bots vary one axis from:

```
cadenceWeeks 52, cardsPerSet 70, setType main, quality standard,
units 8000, packsPerUnit 24, msrp 14000 ($140), boosterBox, spread
```

Other harness constants: `RARITY_DISTRIBUTION` (the 45/25/14/7/4/2.5/1.5/0.7/0.3
set composition every bot uses), `UNLOCK_ORDER`, the 0.7 IP-reuse chance, and
the two-print-run reserve in `maybeExpand`.

---

## 4. Duplicated constants — now down to one

Three values used to be written in two places. Two are fixed:

| Value | Status |
|---|---|
| Starting cash, $500,000 | **Fixed.** `finance.startingCash` and `finance.borrowCeilingBase` are separate paths, so the coupling is now explicit and visible rather than two literals that silently disagreed. |
| COGS coefficient, 0.55 | **Fixed.** One path, `printing.cogsCoefficient`, read by both the engine and the bots. |
| Total audience, 600,000 | **Still coupled.** `world.segmentSize` x 6 segments must equal `attention.referenceAudience`. Changing one alone shifts the demand curve away from what the value pass was tuned against. |

---

## 5. The newcomer artist rate defect, still live

`art.newcomerRateMin` and `newcomerRateMax` ship at **50 and 300 cents** —
$0.50 to $3.00 per card. `art.openingRateMin` and `openingRateMax` ship at 7,500
and 45,000 cents — $75 to $450.

The opening roster was repriced in the art-cost pass and the roster-drift path
was not. A run long enough for the roster to turn over fills with artists who
work for almost nothing, and `art.rateGrowthPerReputation` cannot lift them
because it multiplies `baseRate`, which is in cents.

**The values were preserved exactly during the config move**, so that the
refactor changed no behaviour. Fixing them is a balance decision, not a
refactor, and it belongs in the tuning run:

```
npm run sim -- --seeds=20 --years=30 --bot=scout,safeHands,conservative \
  --set=art.newcomerRateMin=7500 --set=art.newcomerRateMax=45000
```

Expect `scout` to get worse and long-run `artSpend` to rise.

---

## 6. A floating-point trap, found the hard way

While moving `RARITY_PULL` into config, two sites were rewritten from
`x * pull / 10` to `x * (pull / 10)`. Those disagree in the last bits **about a
third of the time**, and the price engine amplified that into 47 of 360 runs
ending differently.

**When you replace a literal with a config read, preserve the operation order
exactly.** `(a * b) / c` is not `a * (b / c)`. The CSV identity check in
[04-workflow.md](04-workflow.md) is what caught it.
