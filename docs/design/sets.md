# Set configuration

**Status: ACCEPTED by AJ, with one interpretation open (section 8).** Written 2026-11-10, fourth draft. The decisions behind it are S1 to S14 in `docs/decisions.md`, plus D1, D2, D3, C9, R6, R7, R13, R17, and R18. Section 8 lists the open questions for AJ.

This document covers the set-level configuration only. The print run, the products (booster box, collection boxes), the release, and the market come in a later document.

## 1. What the set configuration must do

- The player picks the total card count of a set (S3). The game fills the cards after the designed cards with filler cards (R6).
- Each main set adds 10 to 20 new generated characters (R13). The mix of kinds follows the theme (R17).
- The player builds the pack from slots and sets the odds in each slot (S2, C9).
- A set has a type: main set, mini set, or one half of a parallel pair (D2).
- A set has a headliner: a character, a form, a place, or an event (R7, R18).
- A set can use an era gimmick, art sets, and a special rarity that matches a character's feel (D2, D3).

## 2. Terms

One word, one meaning in this document and in the code:

| Term | Meaning |
|---|---|
| **Designed card** | A card that the player makes in the card designer. D1 calls these "featured cards". This document says "designed card", because "featured IP" already means the other IP in a card's art (R22) |
| **Filler card** | A card that the game makes from set-level rules. The player does not design it |
| **Set size** | The total card count of the set: designed cards plus filler cards |
| **Pack** | One sealed pack. It has a fixed number of slots |
| **Slot** | One card position in a pack. A slot has a list of outcomes, and each outcome has odds |
| **Outcome** | One thing that a slot can give: a tier, or a version of a tier (for example "any tier, reverse holo") |
| **Odds** | The chance of one outcome in one slot. The odds in a slot add up to 100% |
| **Pull rate** | The chance to get one outcome in one pack, over all slots. The game calculates it from the slots |
| **Headliner** | The one IP item on the pack art and the box art |
| **Gimmick** | A named mark that the game puts on some cards, for example "ex". It belongs to an era |
| **Era** | A named period with a start, an end, and one gimmick (S7). The player starts and ends it |
| **Pack preset** | A saved pack: its slots and their odds (S6) |
| **Art set** | An ordered group of designed cards whose art connects into one picture (D3) |

## 3. Set type, identity, and headliner

### 3.1 The fields

The field audit rule from `roster.md`, section 2, applies. A reader that is not built yet says so.

| Field | Values | Reader | Screen |
|---|---|---|---|
| `type` | `main`, `mini`, or `parallel`. See section 3.2 | The generator count (section 4.3), the products (print system, not built yet) | Sets list, set screen |
| `code` | 2 to 4 capital letters, for example "BBL". Unique in the world | **Flavor** | Card corner, sets list |
| `symbol` | One shape from a fixed list, plus one palette color | **Flavor** | Card corner, sets list, pack art |
| `headliner` | One IP item: a character, a form of a character, and later a place or an event (R18). Optional while the set is a draft | Set demand: the headliner's appeal lifts the whole set (market, not built yet) | Pack art, set screen |
| `pairID` | For a parallel set only: the other set of the pair | The release: both sets release in the same week (release, not built yet) | Set screen |

### 3.2 Set types

Every type allows any size (S8). The type sets the generator count and, later, the products.

| Type | New generated characters | Real example |
|---|---|---|
| **Main** | 10 to 20 (R13) | A main Pokemon expansion has about 190 to 260 cards, with the secret rares [from memory, not checked] |
| **Mini** | 3 to 8 | Pokemon special sets, for example Pokemon 151 and Prismatic Evolutions. They have no booster box in English [from memory, not checked] |
| **Parallel** | 5 to 10 for each set | Black Bolt and White Flare (2025). Each set has its own special rarity (D2) |

The generator never makes more new characters than the set has filler cards.

### 3.3 Parallel sets (D2)

- The player creates a parallel pair in one step. The game creates two sets and links them.
- Each set of the pair has its own name, code, symbol, headliner, ladder, cards, and pack.
- The two sets release in the same week.
- The halves compete and lift each other (S9). Collectors want both halves, so each half lifts the other with collectors. Other buyers split their money, so a strong half can take sales from a weak half. Each audience reacts in its own way (market, not built yet).

### 3.4 Headliner (R7, R18)

- The headliner is the drawing on the pack art and the box art.
- A form can be the headliner (R7). A place or an event can be the headliner later (R18).
- The set screen warns when the headliner has no designed card in the set. It does not block the print.
- **The hero card.** The game follows one card from design to market price in the release report (research, section 6, pattern 5). The game picks it: the headliner's card at the rarest tier. The player does not set it.

## 4. Set size and filler cards

### 4.1 The fields

| Field | Values | Reader | Screen |
|---|---|---|---|
| `size` | Any count from the designed-card count to 400. The player picks it (S3, S8) | The filler count. The pull rate of each single card (section 5.3). Set acceptance (section 4.5) | Set screen, pack screen |
| Designed cards | 10 to 20 (D1). The set screen shows the count against this range | Card appeal (market, not built yet) | Set screen |
| Filler cards | `size` minus the designed cards. The game makes them | Card appeal, the generated characters (section 4.3) | Set screen, in a separate list |

### 4.2 Which tiers get filler cards (S4)

- Each tier in the ladder has a new field: **filler share**, from 0% to 100%. The shares of all tiers add up to 100%.
- The default ladder: Common 50%, Uncommon 33%, Rare 17%. The other tiers have 0%.
- The game multiplies the filler count by each share. It rounds with the largest-remainder method, so the counts add up to the filler count.
- Example: a main set of 150 cards with 16 designed cards has 134 filler cards. The default ladder gives 67 commons, 44 uncommons, and 23 rares.
- A tier with 0% has only designed cards.
- The tier editor has a stepper and a slider for the share. The ladder editor shows the sum of the shares. The game does not save a ladder until the sum is 100%.
- The filler share is part of the ladder, so a ladder preset keeps it, and a set copies it (C10, S12).

### 4.3 Generated characters (R6, R13, R17)

- Each filler card shows one character. It is a new generated character, or a character that is already in the roster.
- The set type sets the count of new generated characters (section 3.2). The game names each one (R13).
- The theme sets the mix of kinds (R17). Each theme group has a default mix, and some themes change it:

| Theme group | Creatures | People | Places | Events |
|---|---|---|---|---|
| Elements | 80% | 10% | 10% | 0% |
| History and cultures | 30% | 50% | 15% | 5% |
| Places | 50% | 15% | 35% | 0% |
| Stories and moods | 40% | 25% | 15% | 20% |
| Things and hobbies | 50% | 30% | 10% | 10% |

- **Built:** the generator makes creatures and people. **Not built yet:** places and events (R15). Until they exist, the generator uses only the creature and person weights of the table.
- About 1 in 5 new filler cards shows an active roster character, not a generated character (R6). This value is a start value to tune by play.
- A filler card has the name of its character, no featured IP, and no versions of its own. It gets its own hidden shift, like a designed card (R24).
- One generated character can appear on more than one filler card, at different tiers (C18).

### 4.4 When the game makes the filler

- The game makes the filler cards when the player creates the set.
- When the size, the designed cards, or the ladder change, the game keeps the filler cards that still fit. It adds or removes only the difference. A removed filler card is the newest one at its tier.
- The player cannot change or delete a filler card.
- A set from a save before version 9 has no filler cards. The set screen shows "Make the filler cards".
- The player sees the filler cards in a separate list on the set screen.
- The player can **reroll** all filler cards while the set is a draft (S5). A reroll gives new characters and new cards. The player cannot reroll a single filler card. The hidden appeal stays hidden, so a reroll does not let the player search for a hit.
- When the set is printed, the generated characters join the roster as normal characters (`roster.md`, section 6.2).

### 4.5 Size and acceptance (S8)

AJ's words: "No limits but it affects the acceptance and popularity of the set."

- Each audience has a hidden preferred size, and a tolerance around it (S12). A set far from an audience's preferred size loses appeal with that audience (market, not built yet).
- Each world rolls the preferred sizes from its seed, like the other hidden fits. Start values: kids and casual buyers prefer small sets, and completionist collectors prefer large sets.
- The size has a second effect that the player sees now: a larger set makes each single card rarer (section 5.3).
- The release report names the size when it matters. Example: "Set size 300: casual buyers felt lost in it: -8%."

## 5. Packs and pull rates (S2, C9)

### 5.1 The fields

| Field | Values | Reader | Screen |
|---|---|---|---|
| `pack.slots` | Slots, in order, with 1 to 20 cards in all | The pull rates (section 5.3), pack opening (not built yet) | Pack screen |
| `slot.count` | The card positions that use the slot, for example 4 Commons | The pull rates | Pack screen |
| `slot.outcomes` | A list of outcomes, each with odds. The odds add up to 100% | The pull rates | Pack screen |
| `pack.boxSize` | Packs in one booster box. Default 36 | Hits per box (section 5.3), the box product (print system, not built yet) | Pack screen |
| `pack.name` | Text, for a pack preset | **Flavor** | Studio, new set sheet |

An outcome is one of:

- **One tier**, for example "Ultra Rare".
- **A version, by name**, for example "Reverse holo". It gives that version of a random card at any tier that has a version with that name (C16). A card that turned the version off is not in the pool. **Build note:** the player cannot pick a group of tiers. To keep a version out of a tier, remove the version from that tier in the ladder.
- **A subset** with the "Own pack outcome" switch on, for example "Trainer Gallery" (S14, section 6.6).

### 5.2 The default pack

The studio has a default pack preset of 10 slots. It points to the tiers of the default ladder. The odds follow the community numbers for the Pokemon Scarlet and Violet era [community-estimated, from memory, not checked]. They are start values only.

| Slots | Outcomes and odds |
|---|---|
| 1 to 4 | Common: 100% |
| 5 to 7 | Uncommon: 100% |
| 8 | Reverse holo of C, U, R, or HR: 100% |
| 9 | Reverse holo of C, U, R, or HR: 90%. Illustration Rare: 8%. Special Illustration Rare: 1.3%. Gold: 0.7% |
| 10 | Rare: 55%. Holo Rare: 22%. Double Rare: 16%. Ultra Rare: 7% |

### 5.3 What the pack screen shows

The pack screen calculates numbers from the slots. It shows them live while the player changes the odds:

- **The pull rate of each tier:** "Special Illustration Rare: 1 in 77 packs".
- **The hits in one box:** "About 2.9 Illustration Rares in a box of 36".
- **The chance of at least one:** "1 in 77 packs" comes from the chance of at least one card of the outcome in a pack. An outcome with a chance of 50% or more shows the mean count instead: "1.9 per pack".
- **The chance of one single card:** "One Special Illustration Rare card: 1 in 460 packs", for a set with 6 SIR cards. This number divides the tier's pull rate by the count of cards at the tier. It is where the set size (S3) meets the pull rates.

The pack screen does not show prices or box value. The market adds them later.

### 5.4 Rules

- The odds in each slot must add up to 100%. The slot editor moves the last outcome to keep the sum. A slot with a sum that is not 100% blocks the print.
- A tier that has cards but no slot can give it is a **warning**: "Nobody can pull your Gold cards." A version outcome reaches every tier that has that version.
- **Build note:** a card's own versions, for example an alt art, have no pack outcome yet. They get one with the version pull rates (C16, C9).
- A slot outcome that points to a tier with no cards is a **warning**. A pack cannot hold an empty outcome, so the print system skips it.
### 5.5 Pack presets (S6)

- The studio keeps a list of pack presets, next to the ladder presets. The default pack preset is always in the list, and the player cannot delete it.
- The player can make a new pack preset from an existing one, then change its slots and odds.
- When the player creates a set, the player picks a ladder preset and a pack preset. The set takes a copy of both (C10).
- **The match.** An outcome points to a tier. The game matches each outcome to a tier of the set's ladder: first by the tier ID, then by the tier name. An outcome with no match shows "Pick a tier" in the slot editor, and it blocks the print until the player fixes it.
- A pack preset is edited against one ladder preset, which the player picks in the pack editor (S12). This gives the editor a list of tiers to choose from.

### 5.6 Why the slots are the lever

A pack has a fixed number of slots, so the player cannot add odds. A rarer chase card takes odds from another outcome in the same slot. The old build found the same rule: "setting pull rates allocates those slots; it never creates them." A free odds slider with no limit is not a decision.

## 6. Gimmick and chase

### 6.1 The era gimmick (D3)

AJ's words in D3: "a gimmick of the era that gets people excited." Real examples: Pokemon "ex", "GX", "V", "VMAX", and "Tera ex".

Cards are for collecting only (C3), so a gimmick has no gameplay effect. A proposed gimmick:

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Text, 1 to 12 characters, for example "ex" or "Mega" | **Flavor** | Card name ("Aryla ex") |
| `color` | One palette color. The card shows the gimmick word in this color after the character part | **Flavor** until the market (M1: the gimmick gets a trend) | The card |
| `freshness` | Hidden. It falls with each set that uses the gimmick | Gimmick appeal: a new gimmick excites, an old one tires (market, not built yet) | A trend phrase (M3) |

**Build note:** the build stores the gimmick's name and color on its era. It does not store `freshness` yet. The market will derive it from the era's start week and its sets. A "mark" with more looks (banner, stamp) can come later.

- In the card designer, each designed card gets a switch: "Carries the gimmick". The card name then gets the gimmick name.

### 6.2 Eras (S7)

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Text, for example "The Ember Age" | **Flavor** | Studio, sets list (grouped by era) |
| `gimmick` | One gimmick (section 6.1), or none | The gimmick on the era's cards | Era screen, card designer |
| `startWeek` | The week when the player starts the era | Gimmick freshness: it falls from the start (market, not built yet) | Era screen |
| `endWeek` | Empty while the era runs. The week when the player ends it | Nostalgia for the era's sets (market, not built yet) | Era screen |

- The player starts an era and ends it on purpose. A new era needs a name and a gimmick, or "No gimmick".
- One era runs at a time. A new era ends the current era (S13).
- A new set belongs to the era that runs when the player creates the set. The set uses the era's gimmick (S13).
- A new save starts with a first era. Its default name is "Base", and the player can give it any name (S13). **Build note:** the game creates the Base era by itself. The player renames it in Studio, Eras. The opening steps do not ask for it.
- **An early gimmick is weak.** The player can give the first era a gimmick. AJ's words: "it won't do much and might hurt the set." **Interpretation, for AJ to confirm:** a gimmick's lift grows with the company's popularity. With low popularity, the lift is small, and some audiences can dislike it (market, not built yet).
- The sets list groups the sets by era.

### 6.3 A special rarity (D2)

AJ's example: Black Bolt and White Flare each had a special rarity that matched the black of Zekrom or the white of Reshiram.

- A tier in a set's ladder can link to one character. The tier then takes that character's palette for its frame.
- The player names the tier, for example "Black White Rare".
- Reader: the special rarity's appeal follows the linked character's popularity (market, not built yet).

### 6.4 Art sets (D3)

AJ's example: Froakie, Frogadier, and Greninja in connected art in Chaos Rising.

| Field | Values | Reader | Screen |
|---|---|---|---|
| `cards` | 2 to 5 designed cards in the same set, in order | Chase demand: collectors want the whole art set (market, not built yet) | Set screen, as one wide strip |
| `name` | Text | **Flavor** | Set screen |

- Any 2 to 5 designed cards in the same set can form an art set now (S10).
- The set screen shows the cards of an art set side by side, with one connected background. **Build note:** the background is a gradient in the first card's character colors. The game draws no connected art (C5).
- **Not built yet:** links between IP items (R20). When links exist, an art set of linked characters (for example a family or an evolution line) gives more chase demand than an art set of unlinked characters.

### 6.5 Secret rares (S11)

- Each tier gets a switch: **"Secret"**.
- The printed set total counts only the cards at tiers that are not secret. Cards at a secret tier number above the total, for example "205/191".
- The game numbers the cards by tier, from the most common tier to the rarest tier, then in the order the cards were made. Filler cards get numbers too. The card number shows in the card's bottom corner.
- In the default ladder, Illustration Rare, Special Illustration Rare, and Gold are secret.
- Reader: set completion appeal. A set with secret rares has a "base set" and a "master set" for collectors (market, not built yet).

### 6.6 Subsets (S11)

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Text, for example "Trainer Gallery" | **Flavor** | Set screen |
| `prefix` | 1 to 3 capital letters, for example "TG" | **Flavor** | Card number ("TG04/TG30") |
| `cards` | Designed cards of the set | Subset chase: collectors want the whole subset (market, not built yet) | Set screen |

- A set can have 0 to 3 subsets.
- A card in a subset numbers in the subset, not in the main set: "TG04/TG30".
- A card can be in one subset at most.
- Only designed cards go into a subset. Filler cards stay in the main set.
- A subset has a switch: **"Own pack outcome"** (S14). Real examples: the Trainer Gallery and the Galarian Gallery.
  - When the switch is on, a slot can have the subset as an outcome. Example: slot 9 gives "Trainer Gallery: 10%". The pack draws the subset's cards only through that outcome, not through their tiers.
  - When the switch is off, the subset's cards keep their tiers, and the pack draws them through those tiers.
- The pack screen shows the pull rate of a subset with its own outcome: "Trainer Gallery: 1 in 10 packs".

## 7. Screens

### 7.1 New set

The "New set" sheet gets more steps:

1. **Type:** main, mini, or parallel pair.
2. **Name, code, and symbol.** A parallel pair asks for two of each.
3. **Theme** (C13).
4. **Ladder preset and pack preset** (S6).
5. **Size**, with the range of the type.

### 7.2 Set screen

The set screen gets sections:

- **Header:** name, code, symbol, type, theme, and the headliner's drawing.
- **Designed cards:** the grid that exists now, with the count against 10 to 20.
- **Filler cards:** a compact list by tier, with a "Reroll" button.
- **Art sets:** each art set as one strip.
- **Subsets:** each subset with its cards and its numbers.
- **Pack:** a summary line ("10 cards. SIR 1 in 77 packs"). A tap opens the pack screen.
- **Set options:** name, code, symbol, theme, headliner, size, ladder, and pack. The era sets the gimmick.

### 7.3 Pack screen

- A vertical list of slots. Each slot shows its outcomes as a stacked bar.
- A tap on a slot opens the slot editor: add an outcome, remove an outcome, and set the odds with a slider and a number field.
- The live numbers from section 5.3 are at the bottom.

### 7.4 Studio

The Studio tab gets two more lists, next to "Rarity ladders":

- **Pack presets** (S6), with the pack screen as the editor.
- **Eras** (S7): the current era, the past eras, and a "Start a new era" button. Each era shows its gimmick and its sets.

## 8. Open questions for AJ

1. **Early gimmick** (section 6.2): a gimmick's lift grows with the company's popularity. With low popularity, the lift is small, and some audiences can dislike it.
