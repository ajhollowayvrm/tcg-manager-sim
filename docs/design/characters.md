# Characters — name, base age, archetype, affiliation

Design decided 2026-09-06 with AJ. **Not implemented.** This is the spec for the
next round of sim work, and it is the first thing the player does in a new game:
define the studio, then define characters.

## The shape of the decision

A character has **a name, a base age, an archetype, and optionally an
affiliation.** The archetype decides how people see the character, which reaches
**sales** and **community happiness**.

The player authors the bet. The player does not see the odds. Every number below
stays hidden behind `readAffection`, per screens rule 1 — the archetype says
what KIND of bet was placed, never how it landed.

## 1. Archetype — a named prior on the roll

**The archetype already exists in the model, unnamed.** Three hidden numbers per
IP carry it today, and every IP draws them from one global range, which is why
every character is the same shapeless lottery ticket:

| Field | Range today | What it means |
|---|---|---|
| `truth.relatability` | 8..96 | The affection ceiling. How broadly it can be loved. |
| `truth.affinities` | -0.8..0.9 per segment | Who bonds and who bounces off. |
| `truth.longevity` | 0.85..1.18 | Whether it holds once the exposure stops. |

An archetype **replaces the global range with a per-archetype range.** It is a
config table and one changed signature. It is not a new subsystem.

The roll survives, so the blind bet survives. What changes is that the player
chose the distribution they are drawing from.

```
createIp(s, name, kind, { archetype, baseAge, affiliation? })
```

### The proposed set

Six, spanning the three axes plus the two motivation segments. **The names are
AJ's to edit** — what matters is that no two archetypes are the same shape, and
that each is a real strategy rather than a better or worse one.

| Archetype | Ceiling | Longevity | Who bonds | The strategy |
|---|---|---|---|---|
| **Mascot** | mid-high, narrow spread | **highest** | mildly positive across every segment | The safe compounder. Nobody's favourite, everybody's second. Carries a catalogue for decades. |
| **Rival** | high, wide spread | low | polarised — teens high, kids negative | Intense and short. Sells hard, then fades, so it needs replacing. |
| **Mentor** | low-mid, narrow | mid-high | adults and artFans positive, kids neutral | Quiet and durable. Will not carry a launch. |
| **Trickster** | widest spread | mid | the widest affinity spread of any archetype | The gamble. Can be a grail or can be nothing. |
| **Legend** | high | high | adults and **investors** positive, kids low | The one the secondary market wants. Reaches price, not reach. |
| **Upstart** | mid, wide | **lowest** | kids and teens high, adults negative | Cheap reach now, gone in a decade. |

Two rules for the table:

- **No archetype dominates.** Where one wins on the ceiling it must lose on
  longevity or on breadth. If a sweep finds one archetype is simply correct, the
  table is wrong, not the player.
- **Archetypes apply to `kind: 'character'`.** `location`, `faction`, `concept`
  and `event` keep the global prior until somebody gives them their own table.

### This settles a loose end

`affection.longevityWeight` is **0** today. "Mascot" is a meaningless label
unless longevity does something, so **the archetype table and the longevity fit
are one task, not two.** HANDOFF.md calls longevity the highest-value inert item
in the model; this is what makes it load-bearing.

## 2. Base age — the character ages, not the audience

**What the model cannot do.** `flow()` in `audience.ts` moves a FRACTION of each
bucket per tick, so a kid who became a teen is indistinguishable from every
other teen. `SegmentState` has no birth year and no cohort identity. Tracking a
generation means per-birth-year buckets, which is a rewrite of the audience
system and is out of scope.

**What it does instead, which is the better mechanic.** The character carries an
age and that age advances with the run:

```
currentAge = baseAge + (s.tick - ip.createdTick) / 52
```

The age-cohort part of `affinities` becomes **derived from the character's
current age** rather than frozen at birth. The motivation segments — `investors`
and `artFans` — stay rolled, because no character's age reaches them.

So a character created at age 10 hooks kids. Twenty years later the same
character is 30 and speaks to adults. The player watches a roster drift out of
the kids market and has to decide: introduce new young characters, or ride the
ageing one and follow it up the cohorts.

**Why this is the stronger version.** The `kids` bucket is refilled every tick by
births. A studio whose whole roster has aged loses access to the one segment
that keeps replenishing itself. That is a real, legible pressure, and it is
CONCEPT.md's finite-attention idea applied to the IP roster instead of the
calendar.

**And the nostalgia payoff is already wired.** `IpEntity.resurgence` exists,
already feeds `castDesire`, and already spikes when an old printing's price
runs. Ageing does not add that mechanic; it makes it legible. An old character
whose vintage prices run is a character that grew up with the adults who now buy
it.

**Cost, stated plainly:** this makes `truth.affinities` partly dynamic.
`segmentAffinity` reads it and weights the demand pool (`engine.ts:1993`), which
is live and gate-bearing. **Numbers will move.** AJ accepted that.

## 3. Affiliation — this un-deletes a field, with a consumer this time

`IpEntity.relatedIps` was declared, read by nothing, and **cut in C12 on
2026-09-06**. Affiliation is the reason to bring it back, and this time it has a
reader. Re-adding a field that was struck needs saying out loud, so: CONCEPT.md
§13 must be edited when this lands, or the struck list becomes a lie.

`IpKind` already includes `'faction'`, so **an affiliation is a link from a
character IP to a faction IP.** No new entity type.

Not to be confused with `Card.cameos`, which is a different and already-live
thing: per card, feeds `castDesire`.

**The mechanic.** A faction accrues affection from every member's appearances,
and each member borrows a share of the faction's affection back. Two
consequences worth having:

- A stable of characters beats one hero, so the roster becomes a portfolio.
- It is the IP-level version of the card-level chain hedge that already works —
  and it must be weaker than the chain, or chains stop mattering.

Affiliation is **optional** on creation, and its absence must mean the branch is
not evaluated, per the C11 rule.

## 4. Community happiness — the one genuinely new link

`SegmentState.goodwill` is driven today **only by publisher behaviour**: collabs,
flooding, prereleases, events, broken preorder promises, set performance. Grep
confirms it — **nothing about the characters themselves touches goodwill.** A
studio could ship a segment's favourite character forever and their goodwill
would not move.

**The link:** goodwill drifts toward the affection of the characters that segment
actually got shipped, weighted by that segment's affinity for them.

That closes the loop with fields that already exist. It also means the archetype
choice reaches BOTH halves of what AJ specified — sales through `castDesire` and
`segmentAffinity`, community happiness through goodwill.

**Warning, not an objection.** Goodwill is load-bearing: it feeds
`collectorHeldShare`, the engagement target and the acquisition drive. A new
driver on it moves gates. Rebank after it, the way C11 did.

## What this is worth, and what it costs

Four mechanisms. Two of them move numbers by design — dynamic affinities and the
goodwill link — so this is a **plan, not a step.** It is Round 12-sized work
sitting beside Plan 2's five neutral knobs.

The order that keeps failures attributable:

1. **Archetype table + `createIp` signature.** Neutral by construction if every
   archetype's range is the current global range. Ship it neutral, then widen the
   ranges as one measurable change.
2. **Base age and derived affinities.** Moves numbers. One rebank.
3. **Affiliation.** Neutral at weight 0, per the C11 rule.
4. **The goodwill link.** Moves numbers. One rebank. Last, because it is
   downstream of the other three.

Steps 1 and 3 are byte-identity steps. Steps 2 and 4 are the two intended jumps.
