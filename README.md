# TCG Manager Simulator

A browser management sim where you run a trading card game company. You don't
play the card game — you *publish* it. Design sets, release them on your own
schedule, watch the secondary market react, manage a community of named
personalities, and try not to over-print, over-extend or over-charge your way
into bankruptcy.

Think *Game Dev Tycoon*, but you're The Pokémon Company and the product is
cardboard.

**Playable, and it can be lost.** You start from nothing — 0 players, 0
satisfaction — and grow a base by shipping sets and word of mouth. The run is
open-ended with **no win condition**. You can retire the studio to bank its
legacy toward future runs, but nothing ever asks you to.

## What you actually manage

- **Sets.** Four tiers — major (opens a block, optionally with an era gimmick
  from 28), minor and micro (ride a live block), and anniversary (freestanding,
  reprint-centric). Length, design loudness, rarity sheet, booster format, print
  run, MSRP, product SKUs, channel mix, spotlight reveals, cover character,
  art director.
- **The shelf.** Recurring costs scale steeply with how much you keep in print,
  so pruning is the central late-game decision. Pull a set and its singles spike
  on scarcity — but yanking one that was still selling reads as manufactured
  scarcity and costs goodwill.
- **Illustration sets.** Groups of cards meant to be collected together — a
  progression line up a rarity ladder, an illustrator's suite, one character
  across eras, linked art broken over several cards. A group can span releases:
  open one now, finish it years later. The capstone that completes a run is worth
  a multiple of its linemates, the members move together on the ticker, and a run
  you announce and never finish goes stale, gets written off, and costs you the
  room's trust — after which nobody believes the next announcement either.
- **The cast.** Characters you invent and print again and again. One can be
  *promoted* into a later role — Kell, Broken Boy into Kell, Royal Soldier — a
  second roster entry that debuts already partly famous and reads as one story. Each picks an
  archetype from 12 — mascot, villain, legendary, trickster and the rest — which
  decides both which sets they suit and how their fame behaves: a mascot climbs
  fastest and bruises easiest, a villain grows on the heat that would sink one.
  Give them traits and a hook and the community starts naming them in the feed.
  Turning points are recorded as a story you can read back.
- **The community.** 52 personas whose reach and credibility are deliberately
  anti-correlated, so the loudest voices are systematically the least reliable.
  Comp them, sponsor them, invite them to a prerelease. Run a standing goodwill
  programme to buy back a soured room — but not permission to gouge it.
- **Distribution.** Bulk-buyer deals for cash now at the price of a market flood
  and rising scalper heat; grading partners; supply-chain capacity; purchase
  limits and phantom stock as anti-scalping stances.
- **Ambition.** Merchandise lines and cross-media ventures from a mobile spinoff
  up to a theatrical blockbuster.
- **A rival.** An ambient competitor that grows when your shelf goes quiet.

## Balance

Measured across 312 weeks and 3 salts: failures spread from week 34 to week 291,
end cash runs $2M–$49M, and a shelf you never prune ends on a negative weekly net
while a disciplined one stays positive. `npm run playtest` prints the current
table; `docs/BRIEF.md` records how it got there.

## Develop

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build
npm run preview   # preview the build
npm run playtest  # headless balance sweep (--fast, --strategy=, --trace, --help)
```

Vite + React, no backend. State lives in one immutable `GameState` and autosaves
to IndexedDB, so a run survives a reload. The clock is manual: the player clicks
"Advance Week" to step the sim one week.

There is also an iOS shell — a WKWebView wrapper around the same build. See
`ios/README.md`; the `npm run ios:*` scripts generate the Xcode project and run
it on the simulator or a device.

**Before changing the sim, read the load-bearing rules in `docs/BRIEF.md`** —
notably that the save has no migrations, that `reducer.js` must import in plain
Node, and that `playtest.mjs` is the only automated check.

## Structure

```
src/
  main.jsx              # entry
  App.jsx               # dashboard layout + mobile tabs
  game/
    initialState.js     # GameState shape — the source of truth
    reducer.js          # every player action; imported by useGame AND the harness
    useGame.js          # React binding: the hook, autosave, action callbacks
    simulation.js       # advanceWeek() — the one tick entry point
    persistence.js      # IndexedDB run save + localStorage prestige/hall of fame
    rng.js              # seeded RNG (deterministic weekly resolution)
    config.js           # tuning constants
    sets.js             # set draft, cost, card generation, release
    blocks.js           # tiers (major/minor/micro/anniversary) + era blocks
    rarities.js         # rarity sheet, finishes + booster pack formats
    packs.js            # pack ripping, god packs
    products.js         # product SKUs + channel mix
    market.js           # secondary market: singles & sealed price resolution
    revenue.js          # weekly per-SKU sealed sales + supply caps
    overhead.js         # recurring costs — the money sinks
    legacy.js           # run score, milestones, retirement, prestige perks
    personas.js         # persona reactions (signal vs noise), grievances, chatter
    relationships.js    # persona comp/sponsor management layer
    distributors.js     # bulk-buyer deals + scalper-culture heat
    grading.js          # third-party grading partners
    breaks.js           # sponsored live box breaks
    merch.js            # merchandise lines
    media.js            # cross-media ventures
    franchise.js        # franchise reputation + legacy multiplier
    characters.js       # the cast: identity, fame drift, story beats
    artists.js          # artist careers (cost/reach drift)
    cadence.js          # release-pledge pressure, both directions
    rival.js            # ambient competing TCG
    segments.js         # player-segment drift + word of mouth
    events.js           # events catalogue + weekly roll
    bans.js             # pull-from-print + community blowback
    promos.js           # unpullable promo cards
    clock.js            # weekly "what changed" attention note
    content/            # static rosters: personas (52), artists (44), themes (18),
                        # gimmicks (28), archetypes (12), traits (27), milestones
                        # (25), distributors, grading, merch, media, rivals, concepts
  components/           # TopBar, SetsPanel, MarketTicker, CardBrowser, LedgerPanel,
                        # HistoryPanel, Chart, PackRipper, PersonasPanel, CastPanel,
                        # CharacterDetail, DistributorsPanel, AmbitionPanel,
                        # RetrospectivePanel, SettingsPanel, Onboarding, SetSymbol,
                        # EventsFeed, FeedbackFeed, useModal
    setbuilder/         # SetBuilder (accordion), RarityEditor, PackFormatEditor,
                        # ProductLineupEditor, SignatureCardEditor
  styles/index.css      # vivid crimson / noir dashboard skin
```
