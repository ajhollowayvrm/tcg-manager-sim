# Plan: make archetypes actually mean something

**Status:** proposal, not yet built. Awaiting approval.

## The problem

The brief defines the **Archetype Balance** dial as the *"aggro / control / combo /
midrange rock-paper-scissors. If one style dominates, the players who prefer the
squeezed-out styles leave."*

Today it's a **single 0–100 scalar** (`metagame.archetypeBalance`, starts at 60):

- Nudged by exactly one event, by bans (`±3–9`), and by rotations (`+8–16`).
- **Not touched on release** — `sets.js:177` literally says `// theme nudges this later`.
- Every theme already carries an `archetypes: [...]` lean (e.g. Dragons →
  `['midrange','aggro']`), but **nothing reads it.** It's dead data.

A single scalar fundamentally can't model the brief's intent: it can't say *which*
style is dominant, so it can't make the squeezed-out players leave, and themes
can't push the meta toward their identity. "Balance: 47" is meaningless — balanced
between *what*?

## The design

Replace the scalar with a **distribution over the four archetypes** — a metashare
that always sums to ~100 — and derive everything from how lopsided it is.

### 1. State shape

```
metagame.archetypes = { aggro: 25, control: 25, combo: 25, midrange: 25 }  // % of the field
```

Keep `archetypeBalance` as a **derived read-only number** for the existing dial UI
(so MetagamePanel and events that nudge it keep working): balance = how *even* the
distribution is, e.g. `100 - (spread between max and min share)`. Even field → high
balance; one deck at 60% → low balance. This preserves the dial's meaning while the
real state underneath becomes the distribution.

### 2. Releases push the metashare (this is the missing link)

On release, shift the distribution toward the set's `theme.archetypes` lean, scaled
by **power budget** (a strong set in an archetype warps the meta toward it harder):

```
for each archetype in theme.archetypes:
  shift = base + (powerBudget - 50) / k     // stronger set → bigger shift
  move `shift` percentage points into that archetype, drawn proportionally from the others
then renormalize to 100
```

So spamming aggro-leaning, high-power sets really does create an aggro-dominated
format — exactly the power-creep-into-oppression arc the brief wants.

### 3. Solve decay sharpens the dominant deck

The weekly solve-level rise should **concentrate** the metashare (the community
finds the best deck and piles in): each week, nudge share from the smaller
archetypes into the current largest, scaled by solve level. This makes an unattended
format naturally collapse toward one-deck dominance — extra pressure to release.

### 4. Bans & rotations flatten it (relief)

Both already raise the scalar; rewire them to **even out the distribution** (pull
shares toward 25% each), which automatically raises the derived balance. Banning a
card in the dominant archetype flattens harder than a random ban.

### 5. Segment drift reacts to the *shape* (the payoff)

This is where it gains teeth. In `segments.js`, segment health already keys off
diversity/solve/power. Add an archetype term:

- Each player segment has an **implicit style preference** (the brief: competitive
  lean toward interactive/diverse fields; casual like aggro/combo "new toys";
  collectors are style-agnostic, they care about value).
- When an archetype that a segment dislikes dominates — or the field collapses to
  one style — that segment bleeds faster. A balanced four-way field keeps everyone.
- Concretely: derive a per-segment "happiness with the current metashape" and fold
  it into the existing drift rate.

So "aggro is 65% of the field" finally *does something*: the control-loving
competitive players start leaving, just as the brief describes.

### 6. Surface it

- MetagamePanel: under the Archetype Balance dial, show the four-way split (a thin
  stacked bar: aggro/control/combo/midrange). Cheap, and it makes the whole system
  legible — the player can see the format warping and decide whether to ban, rotate,
  or release a counter-archetype set.
- The set-builder already shows a theme's mechanics; also show its archetype lean so
  the player can release *intentionally* to correct an over-tilted meta.

## Files touched

| File | Change |
|---|---|
| `initialState.js` | add `metagame.archetypes` distribution |
| `simulation.js` | derive `archetypeBalance` from the distribution; solve-driven concentration |
| `sets.js` | release shifts the metashare by theme lean × power budget (fills the TODO) |
| `bans.js` | bans/rotations flatten the distribution instead of bumping a scalar |
| `segments.js` | segment drift reacts to the metashape (the teeth) |
| `MetagamePanel.jsx` | render the four-way split bar |
| `SetBuilder.jsx` | show the theme's archetype lean |
| `tools/playtest.mjs` | report metashare trajectory; verify one-deck dominance bleeds players |

## Verification

The playtest harness is the proof. After building, sweep and confirm:

- A mono-archetype, high-power strategy drives that archetype's share toward
  dominance and **bleeds the segments that dislike it** (new failure mode).
- A varied-theme strategy keeps a flatter split and a healthier base.
- Bans/rotations visibly flatten the split.
- The derived `archetypeBalance` still moves sensibly so the existing dial + events
  keep working (no regression).

## Scope / sequencing

Two reasonable cut points:

- **Core (recommended first):** state shape + release shift + derived balance +
  segment reaction (items 1–5). This is the gameplay; ~5 files.
- **Polish (follow-up):** the UI split bar + builder lean display (item 6).

Estimated as one focused implementation pass for the core, verified against the
harness, then a small UI pass.
