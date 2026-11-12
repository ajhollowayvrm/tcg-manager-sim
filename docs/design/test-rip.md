# Test rip

**Status: ACCEPTED by AJ, and built.** Written 2026-11-11. The decisions behind it are P1 to P5 in `docs/decisions.md`, plus S2, S6, S14, C16, and C18. Section 7 records AJ's answers.

**Build:** `Packages/SimCore/Sources/SimCore/TestRip.swift` (the draw) and `App/Views/Cards/TestRipView.swift` (the screen).

A test rip opens packs of the player's own set. It is the first time that the pack design feels real. It also lets the player check the odds by hand.

## 1. What the test rip must do

- Open one pack of a set, and show all its cards at once (P2).
- Open one box of a set, and compare the pulls with the expected numbers (P3).
- Use only data that exists now: the slots, the outcomes, the odds, the cards, the versions, and the card looks.
- Change nothing in the world (P4).

## 2. Terms

| Term | Meaning |
|---|---|
| Test rip | One pack or one box that the player opens to test a set |
| Pull | One card, in one version, that a pack gives |
| Hit | A pull from an outcome that comes in fewer than 1 pack in 10 |
| Expected count | The mean count of an outcome in a box: the mean count in a pack, times the box size |

## 3. How a pack draws its cards

The draw follows the pack screen's numbers (`sets.md`, section 5.3), so the test rip and the pull rates agree.

1. The game goes through the slots in order (P1). A slot with a count of 4 gives 4 positions.
2. For each position, the game picks one outcome by its odds.
3. The game picks one card at random from the outcome's pool (`PackStats.pool`):
   - **A tier outcome** gives the base version of a card at that tier.
   - **A version outcome** gives that version of a card, for example the reverse holo (C16).
   - **A subset outcome** gives the base version of a card in that subset (S14).
4. **No duplicates.** A pack does not give the same card in the same version twice. When the pool has no unused card left, the game allows a duplicate.
5. **Empty outcomes.** An outcome with an empty pool gives its odds to the other outcomes in its slot, the same as the print rule (`sets.md`, section 5.4). When all outcomes of a slot are empty, the position shows an empty frame with the text "Slot 3 has no cards yet".

**Build notes:**

- The draw is a pure function in SimCore: a set and a seed in, a list of pulls out. The app passes a new random seed for each rip. The world's random streams do not move, so a rip never changes the world (P4).
- A card's own versions, for example an alt art, have no pack outcome yet (`sets.md`, section 5.4). A test rip cannot pull them until the version pull rates exist.

## 4. When the player can rip

- The set screen's Pack section gets a **"Test rip"** button.
- A blocking warning, for example "Pick a tier", disables the button. The button then shows the reason.
- An advice warning does not stop a rip. The empty frames in the grid show the problem.
- A pack preset in Studio has no cards, so it has no test rip.

## 5. One pack (P2)

- The pack opens straight to a grid of all its cards, in slot order. No reveal step.
- Each **hit** gets a mark: a glow on its frame and its outcome name, for example "SIR".
- The hit rule uses the player's own odds. In the default pack, the hits are Ultra Rare, Illustration Rare, Special Illustration Rare, and Gold. Double Rare (16%) is not a hit.
- A tap on a card opens it large. The large card moves its foil (`CardView`).
- Below the grid: **"Open another pack"** and **"Open a box"**.
- The header shows the wrapper: the set name, the code, the symbol, and the headliner's drawing in the theme colors.

## 6. One box (P3)

The box opens the pack's box size, for example 36 packs, in one step.

- **The hits:** a grid of all hits in the box, rarest outcome first.
- **The counts:** one row for each outcome of the pack, in the pack screen's order:

  | Outcome | Pulled | Expected |
  |---|---|---|
  | Illustration Rare | 4 | 2.9 |
  | Special Illustration Rare | 0 | 0.5 |
  | Gold | 1 | 0.3 |

  A row with a pull count far above or far below the expected count gets no color. Luck makes most boxes uneven, and a color suggests a problem that is not there.
- **"Show all packs":** a list of the box's packs. A tap opens one pack's grid.
- Below: **"Open another box"**.

The game keeps nothing (P4). When the player closes the sheet, the pulls are gone.

## 7. Answers (P5)

AJ kept both start values:

1. **The hit rule** (section 2): a hit comes from an outcome that comes in fewer than 1 pack in 10.
2. **The box counts** (section 6): the table gives no color for luck.
