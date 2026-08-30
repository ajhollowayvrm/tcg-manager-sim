# TCG Manager Simulator

A browser-based management sim where you run a trading card game company. You don't play the
card game — you *publish* it. Design sets, release them on your own schedule, watch the secondary
market react, manage a living community of named personalities, and try not to over-print,
over-extend or over-charge your way into bankruptcy.

Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is cardboard.

## Status

**Playable, and it can be lost.** You start from nothing — 0 players, 0
satisfaction — and grow a base by shipping sets and word of mouth. Design a set,
release it, and the world reacts week by week: the secondary market resolves
singles and sealed prices with momentum and burstable hype bubbles, 52 named
community personas chatter through a signal-versus-noise feedback feed, and an
events feed throws curveballs.

The run is an open-ended survival sim with **no win condition**. You can retire
the studio voluntarily to bank its legacy toward future runs, but nothing ever
asks you to.

### What you actually manage

- **Sets.** Four tiers — major (opens a block, optionally with an era gimmick
  drawn from a 28-strong roster), minor and micro (ride a live block), and
  anniversary (freestanding, reprint-centric, gated on a real history). Length,
  design loudness, rarity sheet, booster format, print run, MSRP, product SKUs,
  channel mix, spotlight reveals, cover character, art director.
- **The shelf.** Recurring costs scale steeply with how much you keep in print,
  so pruning is the central late-game decision. Pull a set from publication and
  its singles spike on scarcity — but yanking one that was still selling reads
  as manufactured scarcity and costs you goodwill.
- **The community.** 52 personas whose reach and credibility are deliberately
  anti-correlated, so the loudest voices are systematically the least reliable.
  Comp them, sponsor them, invite them to a prerelease. Run a standing
  community-goodwill programme to buy back a soured room — but not permission
  to gouge it.
- **Distribution.** Bulk-buyer deals for cash now at the price of a market flood
  and rising scalper heat; grading partners; supply-chain capacity; purchase
  limits and phantom stock as anti-scalping stances.
- **Ambition.** Merchandise lines, cross-media ventures from a mobile spinoff up
  to a theatrical blockbuster, and a persistent cast whose fame compounds.
- **A rival.** An ambient competitor that grows when your shelf goes quiet.

### Recent work — an audit remediation pass

A full audit found the game could not be lost after week 36: 14 of 18 harness
strategies survived 312 weeks, all four failures landed in a nine-week band, and
end cash ran to $165M with nothing to spend it on. Seven commits addressed it.

- **Eight correctness bugs.** The worst erased the player's entire debt whenever
  a costed event fired.
- **The harness drives the real reducer.** It used to re-implement three
  transitions by hand, and that mirror had drifted.
- **Recurring costs** (`overhead.js`) — studio overhead scaling superlinearly
  with the shelf, warehousing on unsold stock, era upkeep, and a voluntary
  community programme. Lifetime spend went from ~8% of gross income to 27-97%.
- **The cadence cliff is gone.** Unrest used to integrate without bound and
  crossed the revolt floor on a fixed ~11-week schedule; it now drives toward a
  floor. Going dark cripples a studio; it no longer guarantees its death.
- **`printIntensity` is alive.** It had exactly one fixed point — zero — and sat
  there from about week 140 in every run, with both consumers reading nothing.
- **The release treadmill is priced**, so rider spam went from top earner to
  dead by week 88.
- **Franchise reputation** reaches 96-123 instead of 45-60, which finally puts
  the upper media deals and the anniversary tier in reach.
- **A legacy score, voluntary retirement and cross-run prestige.**
- **Persistence** moved to IndexedDB with a 46% smaller save, export/import, and
  visible failures — a long run used to stop saving silently.
- **The dashboard** gained a card browser (the ticker showed 12 of several
  thousand cards), a profit-and-loss view, trend charts, and real keyboard
  support.

Measured across 312 weeks and 3 salts: failures now spread from week 34 to week
291, end cash runs $2M-$49M, and a shelf you never prune ends on a negative
weekly net while a disciplined one stays positive.

Run `npm run playtest` to see the current table.

## Tech

- Single-page browser app (Vite + React), no backend — state lives in memory and
  autosaves to localStorage, so a run survives a reload.
- Turn-based simulation on a manual weekly clock — the player clicks "Advance
  Week" to step the sim one week at a time (no auto-timer).

## Develop

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build
npm run preview   # preview the build
npm run playtest  # headless balance sweep (--fast, --strategy=, --trace, --help)
```

## Structure

```
src/
  main.jsx              # entry
  App.jsx               # dashboard layout + mobile tabs
  game/
    initialState.js     # GameState shape (see BRIEF.md)
    reducer.js          # every player action; imported by useGame AND the harness
    useGame.js          # React binding: the hook, autosave, action callbacks
    simulation.js       # advanceWeek() — the one tick entry point
    persistence.js      # IndexedDB run save + localStorage prestige/hall of fame
    rng.js              # seeded RNG (deterministic weekly resolution)
    config.js           # tuning constants: cadence, treadmill, erosion neutral
    sets.js             # set draft, cost, card generation, release
    blocks.js           # tiers (major/minor/micro/anniversary) + era blocks
    rarities.js         # rarity sheet, finishes + booster pack formats
    packs.js            # pack ripping, god packs (promos excluded)
    products.js         # product SKUs + channel mix
    market.js           # secondary market: singles & sealed price resolution
    revenue.js          # weekly per-SKU sealed sales + supply caps
    overhead.js         # recurring costs — the money sinks
    legacy.js           # run score, milestones, retirement, prestige perks
    personas.js         # persona reaction engine (signal vs noise) + grievances
    relationships.js    # persona comp/sponsor management layer
    distributors.js     # bulk-buyer deals + scalper-culture heat
    grading.js          # third-party grading partners
    breaks.js           # sponsored live box breaks
    merch.js            # merchandise lines
    media.js            # cross-media ventures
    franchise.js        # franchise reputation + legacy multiplier
    characters.js       # persistent cast + fame drift
    artists.js          # artist careers (cost/reach drift)
    cadence.js          # release-pledge pressure, both directions
    rival.js            # ambient competing TCG
    segments.js         # player-segment drift + word of mouth
    events.js           # events catalogue + weekly roll
    bans.js             # pull-from-print + community blowback
    promos.js           # unpullable promo cards
    clock.js            # weekly "what changed" attention note
    content/            # static rosters: artists (44), personas (52), themes,
                        # gimmicks (28), distributors, grading, merch, media,
                        # rivals, concepts, milestones
  components/           # TopBar, SetsPanel, MarketTicker, CardBrowser,
                        # LedgerPanel, HistoryPanel, Chart, PackRipper,
                        # PersonasPanel, CastPanel, DistributorsPanel,
                        # AmbitionPanel, RetrospectivePanel, feeds, useModal
    setbuilder/         # SetBuilder (accordion), RarityEditor, PackFormatEditor,
                        # ProductLineupEditor, SignatureCardEditor
  styles/index.css      # vivid crimson / noir dashboard skin
```
