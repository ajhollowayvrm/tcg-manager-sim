# Cards and the card designer

**Status: DRAFT for AJ's review.** Written 2026-11-10, first draft. The decisions behind it are C1 to C6 in `docs/decisions.md`, plus R22 to R26. Section 8 lists the open questions for AJ.

This document covers the card designer only (C1). The print run, packs, the release report, and sales come in a later document.

## 1. What the card designer must do

- The player designs cards inside a set (C6).
- Each card has four decisions: subject, card name, rarity, and art (C15). The rarity tier sets the card's look. The designer also shows the card's printed versions (C16).
- Cards are for collecting only. A card has no gameplay stats (C3).
- The player builds rarity ladders and saves them as presets (C4).
- The game does not draw new art. A card shows the character drawing in a frame (C5).
- A card has a life of its own: two cards of the same character can have very different popularity (R24).

## 2. Terms

One word, one meaning in this document and in the code:

| Term | Meaning |
|---|---|
| **Set** | A named group of cards that release together |
| **Card** | One design that the player makes in a set. A print run makes many copies of it later |
| **Subject** | The character on the card, and which form of the character it shows |
| **Rarity** | One tier of the set's rarity ladder. It gives the card its natural value (C2) |
| **Rarity ladder** | The ordered list of tiers that a set uses, from the most common tier to the rarest tier |
| **Ladder preset** | A saved rarity ladder. A new set starts from a preset |
| **Card look** | The layout, foil, texture, and stamp of a card. The rarity tier sets it (C15) |
| **Featured IP** | Other characters (and later places) that the art shows (R22) |

## 3. A card

The field audit rule from `roster.md`, section 2, applies. A reader that is not built yet says so.

| Field | Values | Reader | Screen | Report line example |
|---|---|---|---|---|
| `id` | Unique in the world | None | None | None |
| `setID` | A set. Optional in the model, so a standalone card is possible later (C6). The designer always sets it now | The set's release (not built yet) | Set screen | None |
| `name` | Text, "Character, Title" (R25). The designer suggests the character's name | **Flavor** | Card, set list | "Aryla, Destined Trainee" |
| `characterID` | One character from the roster | Card appeal: the character's popularity is the base (R24) | Card, designer | "Aryla's buzz lifted this card: +12%" |
| `formID` | Optional. Nil means the base form. A new design saves a new form (R26) | Card appeal: the form's appeal replaces the character's appeal (R23) | Card, designer | "Mega Aryla headlined the set: +25%" |
| `rarity` | One tier of the set's ladder | Natural value: scarcity and chase appeal (market, not built yet) | Card frame, rarity symbol | "Gold rarity: chase collectors +30%" |
| `featuredIP` | Up to 2 other characters in the art (R22) | Card appeal: each item adds its own appeal for each audience, plus or minus (market, not built yet) | Card, designer | "Noctra in the art: kids -6%" |
| `artistID` | One artist (see question 2) | Artist fit and artist popularity (artists, not built yet) | Card, designer | "Art by a famous artist: +9%" |
| `cardShift` | Hidden. A random appeal shift for each audience, drawn when the player creates the card | Card appeal (R24) (market, not built yet) | Shown later as a range, like a character reading | "This card is loved more than its rarity suggests" |

**Card appeal for one audience** (the market will read this):

```
card appeal = subject appeal (the form's appeal, or the character's appeal)
            + featured IP term (each item's appeal, at a reduced weight)
            + card shift
```

The rarity and its look do not change appeal. They change scarcity and chase value in the market.

## 4. Rarity ladders and presets (C4)

### 4.1 A tier

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Text, for example "Special Illustration Rare" | **Flavor** | Card, designer, set screen |
| `code` | 1 to 4 characters, for example "SIR" | **Flavor** | Card corner |
| `symbol` | One of a fixed list of shapes: circle, diamond, star, double star, crown, and others | **Flavor** | Card corner |
| `color` | One palette color | **Flavor** | The frame of a solid frame, and the tier chip |
| `frameStyle` | Solid, rainbow, gold, silver, or black (C14). The default ladder: Ultra Rare silver, SIR rainbow, Gold gold | **Flavor** | Card frame |
| `rank` | The order in the ladder. 1 is the most common | Natural value. The print system will derive scarcity from it (see question 3) | Designer order |

### 4.2 The default preset

The default preset is a modern ladder with nine tiers:

| Rank | Name | Code |
|---|---|---|
| 1 | Common | C |
| 2 | Uncommon | U |
| 3 | Rare | R |
| 4 | Holo Rare | HR |
| 5 | Double Rare | RR |
| 6 | Ultra Rare | UR |
| 7 | Illustration Rare | IR |
| 8 | Special Illustration Rare | SIR |
| 9 | Gold | G |

### 4.3 Presets

- The studio keeps a list of ladder presets. The default preset is always in the list, and the player cannot delete it.
- The player can make a new preset from an existing one. The player can then rename, add, remove, and reorder its tiers.
- A ladder must have from 2 to 12 tiers.
- When the player creates a set, the set takes a **copy** of the chosen preset. A later change to the preset does not change the set (see question 4).
- The player can edit a set's own ladder until the set is printed. A tier that a card uses cannot be removed.

## 5. Card looks (C14, C15)

Each rarity tier sets the look of every card at that tier (C15). There is no separate treatment list, and the card designer has no treatment step.

A look has four parts (C14). All four are flavor: they change the look, not the appeal.

| Part | Values |
|---|---|
| Layout | Standard, extended art, full art, borderless, frame break, showcase frame |
| Foil | None, holo, reverse holo, pattern reverse, cosmos, cracked ice, galaxy, etched, rainbow, gold |
| Textured | Yes or no |
| Stamp | None, serial number, signature, event stamp |

The tier also sets the **frame style** (solid, rainbow, gold, silver, or black) and the **extra cost for each printed copy** (C11). Reader of the cost: the print system (not built yet).

### 5.0.1 Market trends (M1 to M4)

Each look part will get a market trend: for example, etched foil is hot and gold is tired. The trend makes a look part a market bet, in addition to its print cost. The tier editor and the version editor will show the trend phrase next to each part (M4). The design is in `docs/design/trends.md`. It is not built yet.

### 5.0 Printed versions (C16)

A card can be printed in more than one **version**. Each version is a separate collectible.

| Version | Where it comes from | Example |
|---|---|---|
| Base | The tier's own look. Every card has it | A Rare in its plain look |
| Tier version | The tier's list of extra versions. Every card at the tier has it, unless the card turns it off | The reverse holo of every Common, Uncommon, Rare, and Holo Rare |
| Card version | The card's own list, up to 6 | A true alt art of one card |

Each version has a name, a frame style, a look, and a cost for each copy. Readers: pull rates (C9) and the market (not built yet). The card designer has a Versions step after the Rarity step.

### 5.1 Research: real card treatments

| Treatment | Real example | Source |
|---|---|---|
| Extended art | MTG: the art widens past its usual box, and the card keeps its black edge | [Scrytics](https://scrytics.com/blog/mtg-card-treatments-guide) |
| Borderless | MTG: the art reaches the card's edges. Lorcana Enchanted: borderless, always foil | [Scrytics](https://scrytics.com/blog/mtg-card-treatments-guide), [Lorcana.gg](https://lorcana.gg/why-enchanted-cards-are-the-most-wanted-lorcana-collectibles/) |
| Showcase frame | MTG: a different frame design for each set, for example the woodland frame in Bloomburrow | [Scrytics](https://scrytics.com/blog/mtg-card-treatments-guide) |
| Frame break | Marvel Snap: an upgrade tier where the art breaks the frame | `docs/research.md`, section 6 |
| Cosmos, cracked ice, starlight | Pokémon holo patterns. Cracked ice is mainly in theme decks and blister promos | [Pokefolio](https://www.pokefolio.eu/en/blog/pokemon-holo-patterns-guide-masterball-cosmos/) |
| Pattern reverse holo | Pokémon Prismatic Evolutions: Poké Ball and Master Ball pattern reverse holos. The Master Ball pattern is the rarest | [PokeCottage](https://pokecottage.com/prismatic-evolutions-master-set-guide), [Pokefolio](https://www.pokefolio.eu/en/blog/pokemon-holo-patterns-guide-masterball-cosmos/) |
| Gold, textured | Pokémon Hyper Rare: full-art foil with gilded borders and an extra layer of glitter foil | [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Hyper_rare_%28TCG%29), [Pokémon](https://www.pokemon.com/us/pokemon-news/pokemon-tcg-scarlet-and-violet-revamps-pokemon-tcg-card-aesthetic) |
| Serial number, signature | Sports cards: numbered parallels (/99, /10, 1/1) and autographs | [Card Shop Finder](https://thecardshopfinder.com/guides/card-brands/parallels-and-refractors-explained/), [Wikipedia](https://en.wikipedia.org/wiki/Refractor_card) |

The research did not confirm a rainbow border on Prismatic Evolutions SIRs. The rainbow frame style is available for any tier.

### 5.2 Print prices (C17)

The game sets the extra cost for each printed copy from the look. The player cannot change it. A plain card costs about $0.02 to $0.03 to print (`docs/research.md`, section 5). The extra prices below are [inferred]: the research found no measured price for foil or texture.

| Part | Extra price for each copy |
|---|---|
| Layout | Standard $0. Extended art and showcase $0.005. Full art and borderless $0.01. Frame break $0.015 |
| Foil | None $0. Reverse holo $0.015. Holo $0.02. Pattern reverse and cosmos $0.025. Cracked ice $0.03. Galaxy and etched $0.035. Rainbow $0.04. Gold $0.05 |
| Texture | $0.03 |
| Stamp | Event stamp $0.005. Signature $0.03. Serial number $0.20, because each copy gets its own number |
| Frame style | Solid and black $0. Silver $0.01. Gold and rainbow $0.015 |

The extra cost of a look is the sum of its parts.

### 5.3 The looks of the default ladder

| Tier | Frame | Look | Extra versions | Extra cost for each copy |
|---|---|---|---|---|
| Common | Solid | Plain | Reverse holo | $0 |
| Uncommon | Solid | Plain | Reverse holo | $0 |
| Rare | Solid | Plain | Reverse holo | $0 |
| Holo Rare | Solid | Holo | Reverse holo | $0.02 |
| Double Rare | Solid | Cosmos | None | $0.025 |
| Ultra Rare | Silver | Full art, holo, textured | None | $0.07 |
| Illustration Rare | Solid | Borderless, holo | None | $0.03 |
| Special Illustration Rare | Rainbow | Frame break, holo, textured | None | $0.08 |
| Gold | Gold | Full art, gold, textured | None | $0.105 |

## 6. Sets (C6)

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Text | **Flavor** | Sets list, set screen |
| `theme` | Optional. One theme from the theme library (section 6.1) | Set theme fit (market, not built yet) | Set screen |
| `ladder` | A copy of a ladder preset | The designer, the print system (not built yet) | Set screen, designer |
| `cards` | The cards in the set. D1 asks for 10 to 20 featured cards. The set screen shows the count against this range | The print system (not built yet) | Set screen |
| `status` | `draft` at this time. The print system adds `printed` and `released` | The designer: only a draft set can change | Sets list |

### 6.1 The theme library (C13)

A theme is the shape of a set, for example Feudalism or Castles. It is not the element type. The library has 42 themes in five groups:

| Group | Themes |
|---|---|
| Elements | The 12 element types, from Fire to Dragon |
| History and cultures | Feudalism, Castles, Royal court, Samurai, Pirates, Ancient empires, Frontier |
| Places | Deep sea, Sky islands, Jungle, Desert, Frozen north, Volcano, Big city, Outer space, Underworld |
| Stories and moods | Festival, Haunted, Tournament, Heist, Fairy tale, Dreams, End of the world, Rebirth, Myths and gods |
| Things and hobbies | Robots, Toys, Food, Music, Sports |

Each theme has a hidden fit for each audience (spread 15). Each world rolls its own fits from its seed. Reader: set theme fit (market, not built yet).

Generated filler cards (R6) arrive with the print system. They are not part of the designer.

## 7. Screens

### 7.1 Sets tab

A new tab between Roster and Studio. It shows the list of sets, with each set's name, theme, card count, and status. A button creates a new set: a name, a theme, and a ladder preset.

### 7.2 Set screen

- The set's name, theme, and ladder.
- A grid of its cards. Each tile is a small card.
- The featured-card count against the range of 10 to 20 (D1).
- A button adds a card.

### 7.3 Card designer

One step per screen, with a live card at the top, like the character creator:

1. **Subject:** pick a character. Then pick the base form, a saved form, or "New design". "New design" opens the character creator in form mode. The game saves the result as a form (R26).
2. **Name:** the title. The designer suggests "Aryla" and lets the player add ", Destined Trainee".
3. **Rarity:** the tiers of the set's ladder, from common to rarest. A new card can take more than one tier (C18). Each picked tier adds a separate card with the same subject, name, and art. The Versions step has a switcher, so each card gets its own versions.
4. **Art:** the artist (see question 2), and up to 2 characters as featured IP.

The same designer, opened from a card, changes the card while the set is a draft.

### 7.4 The card

A card is a rounded rectangle in a 5:7 ratio:

- The frame color comes from the rarity tier.
- The character drawing (or the form's drawing) is in the art window, on the character's type tint (C5).
- The card name is at the top.
- The rarity symbol and code are in the bottom corner.
- The tier's look changes the card: for example a moving shimmer for a holo, or a character that comes out of the art box for a frame break.
- Featured IP shows as small drawings in the bottom of the art window.

### 7.5 Ladder presets in Studio

The Studio tab gets "Rarity ladders": the list of presets, and an editor to rename, add, remove, and reorder tiers.

## 8. Answers (C7 to C12)

AJ answered all six questions:

1. **Treatments are customizable (C7).** Replaced by C15: each tier sets the look.
2. **No artist yet (C8).** The Art step has only the featured IP.
3. **Pull rates are fully customizable (C9).** The pack design document will add a pull-rate field to each tier.
4. **A set keeps its own copy of the ladder (C10).**
5. **Any treatment on any rarity, and treatments cost money (C11).** Replaced by C15: each tier has its own look and its own cost for each copy.
6. **The competitive players audience stays (C12).**

### 8.1 Treatment costs

Moved to section 5.2.
