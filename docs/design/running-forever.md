# Running forever

Measured 2026-09-06. AJ's answer to "what is the end?" was **"just goes
forever"** — no scored finish, no horizon. This is what that costs.

The harness has never simulated past 50 years. This is one seed, `conservative`,
150 years, on a laptop.

| Year | Liquid | Printings | Events | Median price | Max price | Engaged | Time for 25y |
|---|---|---|---|---|---|---|---|
| 25 | $32M | 7,000 | 31,612 | 0.14 | 1,312 | 9.0M | 1.6s |
| 50 | $161M | 14,000 | 166,545 | 0.13 | 1,866 | 14.7M | 5.6s |
| 75 | $318M | 21,000 | 409,905 | 0.11 | 2,008 | 16.5M | 12.6s |
| 100 | $510M | 28,000 | 760,040 | 0.11 | 2,025 | 19.0M | 23.1s |
| 125 | $717M | 35,000 | 1,213,821 | 0.13 | 2,167 | 21.4M | 36.0s |
| 150 | $948M | 42,000 | **1,782,336** | 0.10 | 2,046 | 22.9M | **53.0s** |

## The hard part already works

**Nothing blows up numerically**, and that is the difficult half:

- Median card price is **flat across 150 years** — 0.14 to 0.10. The
  scale-coupling holds.
- Max price **plateaus near 2,000** instead of compounding. `softCap` holds.
- The audience **saturates** rather than exploding.

Eleven rounds of scale-coupling work paid for this. Do not undo it.

## The cheap part does not

Three collections grow without bound, and two of them grow **quadratically**,
because the event rate rises with the number of printings:

**1. The event log reaches 1.78 million.** The screens audit measured 142,596
events at 50 years costing 36% of a 63.7 MB save. Scaled, the log alone is
roughly **300 MB at year 150**, and the rate is still accelerating.

> **Compaction stops being optional and becomes the thing that makes "forever"
> possible.** `serialize` already takes `trimEventsBefore`. The GAME must use it.
> The harness cannot — it reads drop and creator coverage off the full log — so
> this is a game-side default, not a change to `save.ts`'s behaviour.

**2. Printings reach 42,000**, and every one is repriced on a 4-week rotation
forever.

**3. Per-year cost grows 33x** between the first 25 years and the last. At year
150 one tick costs about 41ms on a laptop. On a phone, advancing the median
4-week gap between interrupts would be a visible pause, and skipping a quiet
38-week stretch would be seconds of spinner.

## The fix agrees with the fiction

A hundred-year-old card does not need weekly repricing. It barely moves, which
is exactly what `nostalgia` says about it.

**Old printings should graduate into a slow lane** — repriced yearly rather than
every 4 weeks — with the fast lane reserved for anything recent or currently
hot. Promotion back to the fast lane on a heat spike or a resurgence.

**Cost then stops growing with the size of the back catalogue and starts growing
with how much of it is actually moving.** That is both the performance fix and a
truer model of a vintage market.

## Note for whoever writes the release notes

CONCEPT.md §12 claims *"A local run simulates 50 years in under a second."* That
is **stale** — this run took 7.2s to reach year 50, on a laptop, with the
current roster. Fix the claim or fix the sim, but do not quote it.
