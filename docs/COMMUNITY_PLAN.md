# Plan: expand the community & personas

**Status:** proposal, not yet built. Awaiting approval / prioritization.

## Where it stands today

18 named personas (`content/personas.js`), each `{ id, name, type, reach,
credibility, taste{power,value,art,fairness,fun}, sentiment }`. Each week
`reactPersonas` (personas.js) has them form a take on a focused card, blurred by
credibility (signal vs noise), and emit feed items + effects (hype, ban pressure,
solve pressure, player-base sway). Types: streamer / competitor / collector /
reviewer / theorycrafter. The roster is **static** — personas never change,
relate to each other, or to the player.

The brief's v2 roadmap explicitly parks the deepening of this layer
("Deeper persona relationships & creator sponsorship"). This plan covers it plus
a few adjacent expansions, grouped so you can pick what to build.

---

## A. More + more varied personas (cheapest, high flavor)

- **Grow the roster to ~30–40** with new archetypes the current 5 types don't
  cover:
  - **Lapsed veteran** — high credibility, low current reach, nostalgic; reacts
    to power creep and rotations harder than anyone.
  - **Drama channel / news aggregator** — amplifies whatever's already loud
    (reach multiplier on other personas' takes) rather than forming its own.
  - **Budget brewer** — cares about *accessible* decks; sours when the meta is
    chase-gated, loves a meta common.
  - **Whale collector** — only moves on the top rarity tiers; their hype is what
    makes a secret rare a grail (ties into the two-meta market).
  - **Grader/authenticator** — reacts to the counterfeit/condition events;
    bridges to a future grading sub-feature.
- **Per-theme affinity:** give personas a soft preference for certain themes/
  archetypes so the *same* set lands differently with different voices.

## B. Personas that evolve (medium — the "living community")

- **Reach drifts over a run** (mirroring the artist-trajectory system we already
  built): a streamer who keeps making good calls *gains* reach and credibility;
  a serial rage-baiter who's wrong slowly loses reach as the community tunes them
  out. Rising/fading persona arcs give each playthrough a story.
- **Persona-to-persona dynamics:** feuds (the existing `influencer_feud` event
  could name two real personas), pile-ons (one big voice calling a card broken
  pulls others toward that take next week), and bandwagons that inflate a bubble.
- **Memory:** a persona remembers how your sets treated their taste — chronic
  power-creep slowly makes the collector/veteran hostile regardless of any single
  set, so sentiment has history, not just this-week mood.

## C. Player ↔ community relationships (the brief's headline v2 item)

This is the management minigame the brief describes — turning personas from a
*read* into something you *act on*:

- **Comp product / seed creators:** send a streamer early product for a hype
  spike — but it risks looking like favoritism, or them panning it anyway. A real
  spend-for-hype lever with downside.
- **Sponsor pros / invite to prerelease:** cultivate a relationship over time;
  upside is amplified hype, downside is a big name turning on you mid-relationship
  hits *harder* because of their reach.
- **Relationship meter per persona** (separate from sentiment): cultivated
  relationships decay if neglected, and a sponsored creator who sours is a
  bigger reputational hit. Folds in the brief's parked tournament-sponsorship idea.
- **Respond to the community:** a lightweight "address the controversy" action
  when ban pressure spikes — a dev statement that can calm or backfire.

## D. Surfacing it (UI)

- The Community panel already lists all 18 with sentiment. Add: a **reach/cred
  trend cue** (↑↓, like the artist dropdown) once B lands; a **relationship
  state** chip once C lands; and per-persona **click-through** to their recent
  takes + a relationship action menu.
- A "**top voices this week**" highlight so the feed isn't a flat stream — surface
  who moved the needle.

---

## Suggested sequencing

1. **A (roster + variety)** — pure content, low risk, immediately makes the feed
   richer. Half a day.
2. **B (evolving personas)** — reuses the artist-trajectory pattern; gives the
   community a life of its own. Self-contained in personas.js + a UI trend cue.
3. **C (relationships/sponsorship)** — the big one: new state, new player actions,
   new panel. The brief's marquee v2 feature; build last, on top of B.

## Verification

Each phase verifies against the headless harness (`tools/playtest.mjs`): confirm
the roster changes don't break the signal/noise balance (A), that persona reach
actually drifts and feuds fire over a run (B), and that sponsorship is a real
risk/reward lever — seeding can backfire, sponsored sours hurt more (C). Plus a
browser pass on the Community panel for each UI addition.

## Open questions for AJ

- **Scope to start:** just A (more personas) now, or commit to the A→B→C arc?
- **Sponsorship economy:** should comping/sponsoring cost cash (a real budget
  line vs. set development), or goodwill/relationship only?
- **Roster size:** how many personas feels right — 30, 40, more? (More = richer
  feed but a longer Community list to scan.)
