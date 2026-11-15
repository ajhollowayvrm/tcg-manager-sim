# TCG Manager

A single-player iOS game. You found a trading card company, build a roster of characters, and grow it into a collector phenomenon. There is no win state. You lose when you run out of money.

AJ plays it alone, sideloaded with Xcode.

## Documents

- `docs/research.md`: the research behind the design.
- `docs/decisions.md`: every design decision, with AJ's words. This file is the source of truth.
- `docs/design/roster.md`: the character roster design.
- `docs/design/cards.md`: the card designer design.
- `docs/design/trends.md`: the market trends design (not built yet).
- `docs/design/sets.md`: the set configuration design.
- `docs/design/test-rip.md`: the test rip (pack opening) design.
- `docs/design/eras.md`: the era designer design.
- `docs/design/audiences.md`: the audience demand design (the market).
- `docs/design/sales.md`: the selling engine: releases, money, demand, and sales.
- `docs/design/costs.md`: running costs: staff and space, artists, and marketing.
- `docs/design/lore.md`: lore: races, factions, relations, and story beats.

## Layout

| Path | Contents |
|---|---|
| `Packages/SimCore/` | The simulation. Pure Swift, no UI imports. |
| `App/` | The SwiftUI app. |
| `project.yml` | The XcodeGen spec. The Xcode project is generated from it and is not committed. |

## Build and run

1. Generate the Xcode project:

   ```sh
   xcodegen generate
   ```

2. Open `TCGManager.xcodeproj` in Xcode.
3. Select your iPhone as the run destination, then press Run.

The project uses the bundle ID `com.ajholloway.tcgmanager` and the personal team `2BY68WLT6R`. The new app replaces the old Capacitor app on the phone.

### The 7-day expiry

The free Apple ID makes the app stop after 7 days.

- When the app stops, **do not delete it**. Deleting the app deletes the save.
- Connect the iPhone and press Run in Xcode again. The save stays.
- Export the save often: Settings tab, then "Export the save". The Files app also shows the save in "On My iPhone > TCG Manager > Saves".

## Tests

Run the simulation tests after each change. The 269 tests run in about 0.12 s. A clean build takes about 8.5 s:

```sh
cd Packages/SimCore && swift test
```

Keep each test under 20 ms. Set up the state directly, and do not simulate long runs of weeks. The shared test worlds are in `Packages/SimCore/Tests/SimCoreTests/Fixtures.swift`.

## Rules for the simulation

- The world is a pure value. The same seed and the same decisions give the same world.
- Each subsystem has its own random stream.
- A read never draws a random number. A screen repaint must not change the world.
- Do not use the standard library's random functions in the simulation. Use the helpers in `RNG.swift`. A golden test pins their output.
- Every character field has a reader, a screen, and a report line, or it is labeled flavor (`docs/design/roster.md`, section 2).
