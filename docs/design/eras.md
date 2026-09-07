# Eras

Design discussed 2026-09-06 with AJ. **Not implemented.** Third companion to
`characters.md` and `sets-and-distribution.md`.

## What an era is

A **named arc spanning several sets with a shared gimmick** — Sword & Shield,
Sun & Moon, Mega Evolution. Nothing in the model spans sets today; `nostalgia`
and `resurgence` attach to printings and characters, never to arcs.

**An era concludes. It does not rotate.** In a real TCG an era ends when its
cards leave Standard, and playable prices crash while collector prices hold.
**This sim has no competitive play** — it models collectors, resellers,
speculators and scalpers, nobody who needs a card to be legal. Rotation has no
hook here, so it is out of scope. Decided, not deferred.

## What an era does

> **You bring in a new era to bring in more people. It gets everyone excited and
> might anger current fans.** — AJ

Both halves already exist as quantities, so this costs almost no new state.

| Half | Mechanism | Already exists? |
|---|---|---|
| Excitement | A burst on the acquisition drive, converting `population - reached` | Yes — `tickAudienceSystem` step 3, and `seedRegionEntry` is already a discrete one-off version of it for market entry |
| Anger | A `goodwill` hit on the already-reached | Yes — `SegmentState.goodwill` |

**The trade is self-limiting, which is what makes it good.** An era converts
strangers into fans and spends the fans you already have. Do it too often and
there is nobody left to betray.

The cost bites without being invented: goodwill feeds `collectorHeldShare`, the
engagement target and the acquisition drive itself.

## Boldness is derived, never a slider

**Do not ship an abstract boldness dial. Derive it from how much of the previous
era's roster carries forward.**

| Carry forward | Excitement | Anger |
|---|---|---|
| Everything — Pikachu in every era | Low | Low |
| Nothing | Maximum | Maximum |

The player expresses the decision by picking characters, which is the thing they
already do. It also means the answer depends on *which* characters carry over:
bringing your most-loved character forward should buy more forgiveness than
bringing a minor one, and `affection` is already the number that says which is
which.

## Segments do not respond equally

Kids have no history and are easy to excite. Adults have history and are the
ones who feel betrayed. That asymmetry falls out of the fiction and needs no
special-casing — it is a weight per segment on each half of the trade.

## This closes a loop across three design conversations

Worth recording because it was not designed on purpose:

1. **Characters age** and drift out of the `kids` cohort (`characters.md`).
2. **`kids` is the only bucket that refills every tick**, from births — so an
   aged roster loses the one self-replenishing segment.
3. **A new era is the release valve.** It reaches the kids who have aged in
   since the last one, and it costs the adults who grew up with the old roster.

Character ageing creates the pressure. The era launch releases it. Existing fans
pay for it. The `mentor` relation in `characters.md` is the gentler alternative:
succession without a betrayal.

## Two other jobs an era should take

- **It owns the gimmick.** An era decides which treatments its sets may use.
  `Card.treatment` already has `none, holo, reverseHolo, textured, goldFoil,
  etched, fullArt, jumbo` and is read by nothing.
- **It is the unit nostalgia attaches to.** Today `nostalgia` is per printing.
  Nobody feels nostalgic about a printing; they feel it about an era. This is
  what makes a ten-year-old set feel like part of something.

## Risks and open numbers

**Two new goodwill drivers are now proposed** — the character link in
`characters.md` and the era launch here. Both move gates. **They must land in a
known order with a rebank between them**, or a gate move is unattributable. Same
discipline as C11.

**The tuning question that IS the mechanic:** how fast goodwill recovers,
against how long an era's acquisition boost lasts.

- Recovery fast → era spam is optimal, and the mechanic is a free button.
- Recovery slow → one bad era launch can end a studio.

That ratio is a sweep, not a guess. Fit it against era cadence: real arcs run
about three years, so the numbers should make roughly that the natural rhythm
without a hard cooldown enforcing it.

**Do not let an era launch also clear fatigue.** It is tempting — a new era does
refresh interest, and `fatigueLeaves` and `engagedFromFreshness` are right
there. But excitement plus reach plus a fatigue reset makes the launch strictly
correct, and the cost stops mattering. If fatigue relief is wanted, it should be
paid for separately.
