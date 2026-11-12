# Era designer

**Status: ACCEPTED by AJ.** Written 2026-11-11. The decisions behind it are E1 to E8 in `docs/decisions.md`, plus S7, S13, D3, and S6. Section 8 records AJ's answers.

An era is a period of sets with one look and one gimmick. Now an era has a name, a start week, an end week, and a gimmick word with a color (`sets.md`, section 6.2). The era designer gives an era three more parts (E1):

- **The name bar** of its cards (E3).
- **The gimmick look and its home tier** (E4, E5).
- **The defaults and the code** for its sets (E6).

## 1. What the era designer must do

- Make each era look different on the card, so a player can date a card by its look.
- Make the gimmick a real card type with its own look and its own tier, like the "ex" cards.
- Give each new set of the era a good start: the era's ladder, the era's pack, and a series number.
- Show each choice on a live sample card (E2).

## 2. The fields

### 2.1 The era

| Field | Values | Reader | Screen |
|---|---|---|---|
| `name` | Text, 1 to 30 characters (exists) | **Flavor** | Studio, Eras |
| `code` | 2 or 3 capital letters, for example "SV". Unique among the eras | The series numbers (section 5) | Era designer, sets list, set screen |
| `nameBar` | A name bar style (section 2.2) | The card face of each card in the era's sets | Era designer |
| `gimmick` | A gimmick (section 2.3), or none (exists, with more fields) | The gimmick cards | Era designer |
| `ladderPresetID` | One ladder preset | The new set sheet: the preselected ladder | Era designer |
| `packPresetID` | One pack preset | The new set sheet: the preselected pack | Era designer |
| `startWeek`, `endWeek` | Weeks (exist) | Gimmick freshness, nostalgia (market, not built yet) | Studio, Eras |

### 2.2 A name bar style

| Field | Values |
|---|---|
| `shape` | **Rounded** (the look now), **square**, **banner** (pointed ends, like a ribbon), or **plain** (no bar; the name sits on the frame with a shadow) |
| `color` | One palette color. **Snow** is the look now. The game picks black or white text for the best contrast |

All fields are **flavor**. Later, the market can give the name bar a trend (M1).

### 2.3 The gimmick

The gimmick has a name and a color now. It gets four more fields:

| Field | Values | Reader |
|---|---|---|
| `mark` | **Word** (the colored word after the character name, as now), **badge** (the word in a colored block), or **logo** (a large, heavy word in the gimmick color) | The card name |
| `nameBar` | A name bar style (section 2.2). A gimmick card uses it in place of the era's name bar (E4) | The card face |
| `frameColor` | One palette color, or none. On a tier with a **solid** frame, a gimmick card takes this color in place of the tier color (E4). Rainbow, gold, silver, and black frames do not change | The card face |
| `homeTierID` | One tier of the era's ladder preset, or none (E5) | The card designer |

Example: a "Tera" gimmick with a logo mark, a black banner name bar, and a crimson frame. A Double Rare Tera card has a crimson frame and a black banner. An SIR Tera card keeps its rainbow frame, but it has the black banner and the Tera logo.

**The tier keeps its layout, its foil, and its rarity code** (E4).

## 3. The home tier (E5)

- The gimmick names one tier of the era's ladder preset, for example Double Rare.
- A set's ladder is a copy, so the game matches the home tier first by the tier ID, then by the tier name, like the pack outcomes (S6). A set with no match has no home tier.
- In the card designer, a new card at the home tier carries the gimmick by default. The player can turn it off.
- When one design adds cards at many rarities (C18), only the card at the home tier gets the gimmick by default. The switch for the other cards stays as the player set it.
- A card at another tier can still carry the gimmick, for example an SIR ex.

## 4. The defaults (E1)

- The new set sheet preselects the current era's ladder preset and pack preset. The player can still pick others.
- When the player deletes a preset that an era uses, the era goes back to the default preset.
- A set keeps its own copy of the ladder and the pack (C10). A later change to the era does not change an existing set.

## 5. The series code and numbers (E6)

- Each set of the era gets a series number from the order in which the player created the sets. The game calculates the number. It does not store it.
- **Main sets** count up: SV1, SV2, SV3.
- **A mini set** takes the number of the main set before it, plus .5: SV3.5. A second mini set after the same main set takes .6, then .7.
- A mini set before the first main set of the era takes 0.5: SV0.5.
- **A parallel pair** takes one main number, and each half adds a letter in creation order: SV4a and SV4b (E8).
- Each set keeps its own set code, for example "PAL".
- The series number shows in the sets list, in the set header ("SV2 · PAL"), and on the test rip wrapper.
- An era code of the Base era is "BS" by default. The player can change it.

## 6. The era designer (E2)

The designer opens from Studio, Eras: "Start a new era", or a tap on an era to change it. It has five steps, with a sample card at the top. The sample card shows the studio's mascot, or a sample creature when the studio has no mascot.

1. **Name and code.** The era name and the code. The game suggests a code from the name.
2. **Name bar.** The shape and the color. The sample card is a Common card of the era.
3. **Gimmick.** On or off. The word, the color, the mark, the gimmick's name bar, the frame color, and the home tier. The sample card is a home-tier card with the gimmick.
4. **Defaults.** The ladder preset and the pack preset. The home tier list comes from this ladder, so a change here can clear the home tier. The designer then shows "Pick the home tier again".
5. **Review.** A strip of four sample cards: the most common tier, a Rare, a home-tier gimmick card, and the rarest tier. Then "Start the era", or "Save" for an existing era.

- "Start the era" ends the current era and starts the new one (S13).
- The player can change an era until one of its sets is printed. The print system does not exist yet, so for now the player can always change it. A change to the name bar or the gimmick changes the look of every card in the era's sets.

## 7. The card face

- A card draws the name bar of its set's era, not of the current era.
- A gimmick card draws the gimmick's name bar and frame color (section 2.3).
- **The Base era keeps the look of today's cards:** a rounded, snow name bar, and a gimmick with the word mark, no frame color, and no home tier. The existing cards do not change.
- **Build note:** the new fields have default values when the game loads a save that does not have them. The current save keeps working, and no migration step is necessary.

## 8. Answers

1. **Prime-style looks** (E7): the border, the name font, and the art window go into the card look later, as a separate change.
2. **A parallel pair's number** (E8): both halves take one main number, with a letter: SV4a and SV4b.
