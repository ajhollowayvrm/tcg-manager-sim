# The character roster

**Status: DRAFT for AJ's review.** Written 2026-11-10, third draft. The decisions behind it are R1 to R13 in `docs/decisions.md`. Section 9 lists the open questions for AJ.

The roster is the player's IP: every character that can appear on a card. Creatures are characters, and people are characters (R14). The roster is the first system to design and build (decision D12).

## 1. What the roster must do

- The player builds and controls the IP (R2). Each set also adds some generated characters, for variety and for surprises (R6).
- Each character has a **feel** with four parts: type, archetype, palette, and role (R1). The feel affects how well the character's cards sell.
- Popularity is deep. Each of eleven audiences has a hidden true appeal, shown as a range. Awareness and buzz move week by week (R4, R8, R12).
- A new character costs nothing in the game: no money and no in-game time. It starts with no popularity (R5, R11).
- One character can appear on several cards in one set, at different rarities (D1).
- The roster must give the player the moments that the research names:
  - A filler character becomes a favorite years later.
  - A generated character becomes very popular, and the player builds on it (R6).
  - Two counterpart characters sell as parallel sets.
  - An evolution line is drawn as connected art.
  - A new form headlines a set (R7).

## 2. The field audit rule

Every field in this document passes three tests. If a field fails a test, delete it or label it **flavor**.

1. **Reader:** a system in the simulation reads the field.
2. **Screen:** a screen shows the field, or shows a reading of it.
3. **Report:** a line in a release report or the weekly digest can name the field as a cause.

Flavor fields are allowed. They have no reader, and this document labels each one.

## 3. A character

### 3.1 Identity (the player sets these, or the generator sets them)

| Field | Values | Reader | Screen | Report line example |
|---|---|---|---|---|
| `name` | Text | Flavor | Everywhere | "Ember" |
| `origin` | `created` or `generated` | Display and filters only. The simulation treats both kinds the same | Roster filter, detail | "Generated in Set 4, now your third most popular character" |
| `role` | starter, companion, mascot, legendary, mythical, villain, rival, human trainer | Audience fit, rarity fit, fatigue rate | Creator, detail | "A legendary at common rarity: chase collectors -12%" |
| `primaryType` | About 12 types, for example fire, water, nature, storm, ice, stone, sky, shadow, light, mystic, metal, dragon | Audience fit, era-gimmick fit, set theme fit | Creator, detail, roster filter | "Shadow types are in fashion this era: +9%" |
| `secondaryType` | Optional, one type | Same as primary, at half weight | Same | Same |
| `archetype` | cute, cool, fierce, mysterious, goofy, majestic, elegant, creepy | Audience fit, artist style fit | Creator, detail | "Kids love cute starters: +15%" |
| `palette` | 2 or 3 colors from a fixed list of about 16 | Special-rarity match, set palette harmony | Drawing, card frame | "Gold palette matched the Gilded rarity: +11%" |
| `evolutionLine` | Optional. A line of up to 3 stages, with this character's stage | Art-set bonus, line completion demand | Detail, line view | "Full line in one art set: +20% for the line" |
| `forms` | The character's forms (section 3.5). Each form shares the character's popularity | Card demand for a card that shows the form, headliner bonus | Detail | "Mega Ember headlined the set: +25%" |
| `counterpart` | Optional. One other character | Parallel-set bonus | Detail | "Released beside its counterpart: +14%" |
| `relations` | Optional links: rival, companion | Cameo demand (a card can show two characters) | Detail | "Cameo by Ember lifted this card" |
| `status` | `active` or `retired` (section 3.6) | The set designer, the generator | Detail, roster filter | "Retired: no new cards" |
| `kind` | `creature` or `person` (R14). Later also `place` and `event` (R15) | Appeal: each kind has its own audience fit and its own popularity recipe (R16). **Not built yet:** the current build uses the kind for the drawing only | Creator, detail, roster filter (R21) | "People are popular with nostalgia adults: +8%" |
| `bodyParts` | A creature's look: body shape, head features, eyes, tail, pattern | **Flavor.** The drawing only | Drawing | None |
| `personParts` | A person's look: skin, hair, eyes, outfit, accessory (R14). The palette colors the outfit, the hair, and the detail | **Flavor.** The drawing only | Drawing | None |

### 3.2 Hidden truth (the simulation knows, the player does not)

| Field | Meaning | Reader | What the player sees |
|---|---|---|---|
| `baseAppeal[audience]` | How much each audience will like the character **when it knows the character**, from -50 (dislike) to 100. Set at creation from the hidden fits (section 5) plus a random part | Demand for every card that shows the character | A range for each audience |
| `affection[audience]` | Appeal earned or lost over time. Good cards, chase pulls, and events raise it. Bad cards, overuse, and redesigns lower it | Same | Included in the range |
| `longevity` | Does affection fade or grow with age? A high value gives the "vintage favorite" effect years later | The yearly affection update and nostalgia | Nothing directly. The player learns it from the trend over years |

**True appeal for an audience = `baseAppeal` + `affection`.** A negative value means the audience dislikes the character. A card that features a disliked character sells less to that audience (decision D3).

### 3.3 Visible state (the player sees these)

| Field | Meaning | Reader | Screen |
|---|---|---|---|
| `awareness[audience]` | The share of an audience that knows the character, from 0 to 1. **Every new character starts at 0** (R5). Cards, creator videos, events, and promotions raise it. It falls very slowly | Demand: an audience that does not know a character does not buy for it | Detail, digest |
| `buzz` | Short-term attention, 0 to 100. Rises with a new card, a good pull on a stream, a creator video, or an event. Falls each week | Demand in the current weeks, creator interest | Detail, roster sort, digest |
| `fatigue` | Rises when the character appears on many cards in a short time. Falls slowly | Reduces the demand gain of each new card | Detail, set designer warning |
| `appearances` | Every card that shows the character, by set and rarity | Fatigue, the history screens | Detail |
| `debut` | The first card of the character | The "first appearance" premium on that card | Detail |
| `readings[audience]` | The range that the player sees for true appeal | Display only. A reading never draws a random number | Detail, roster |

**Popularity = awareness × true appeal.** This split gives two different problems:

- A character with high appeal and low awareness is a hidden gem. Exposure grows it.
- A character with high awareness and low appeal is famous but not loved. More exposure does not help.

AJ confirmed this model (R11): "starts from no popularity" means awareness starts at zero. The hidden appeal exists from the start.

### 3.4 Eleven audiences (R8, R12)

Each audience buys different products and likes different things. The "likes" column is hidden in the game. The player learns it from reports.

| # | Audience | Buys | Likes, in general (hidden) | Size over time |
|---|---|---|---|---|
| 1 | **Kids** | Packs at retail | Cute, goofy, starters, bright palettes | Large from the start |
| 2 | **Parents and gift buyers** | Boxes and collections at big-box stores | Whatever kids ask for. Safe, friendly characters | Follows the kids |
| 3 | **Teens** | Packs, singles | Cool, fierce, rivals | Medium |
| 4 | **Casual players** | Starter decks, packs | Characters that play well, and starters | Medium |
| 5 | **Competitive players** | Singles, playable rares | The card's power. Character feel matters less | Grows with organized play |
| 6 | **Nostalgia adults** | Sealed product, vintage cards, reprints of old favorites | The characters from their childhood | **Starts near zero.** Kids from earlier years become nostalgia adults about 15 to 20 years later |
| 7 | **Set completionists** | Packs, singles, binders | Complete sets and complete lines. Every card counts | Medium |
| 8 | **Chase collectors** | Special rarities, alt-arts, grails | Legendary, majestic, mythical, strong art | Grows with the phenomenon |
| 9 | **Art collectors** | Illustration rares, artist signatures | The artist and the art set, more than the character | Small, but pays high prices |
| 10 | **Graders and investors** | Sealed boxes, graded slabs. They **hold** for months or years | Price momentum and scarcity. Character feel matters less | Grows in a boom, falls in a bust |
| 11 | **Resellers and scalpers** | Hot products on release day, in volume. They **flip** within days or weeks | The resale gap: what the other audiences will pay above MSRP. Character feel matters only through that gap | Grows fast when products sell out, shrinks when reprints close the gap |

**Resellers and scalpers are different from the other audiences (R12).** Their appeal for a character does not come from the feel. It comes from what the other ten audiences will pay for that character's cards, compared with the supply.

- They follow buzz and awareness, so a hot character draws them.
- On release day they buy first, and in volume. This takes stock from kids and collectors, causes sell-outs, and costs goodwill.
- They resell at a premium. The premium raises market prices in the short term.
- A reprint closes the resale gap. Then they leave, and the stock that they hold can drop the price.
- The drop and market design will define release-day queues, store limits, and bots. The roster gives that design one input: the resale gap for each character.

**The nostalgia audience comes from the kids audience.** It is the one audience that the player cannot buy into existence. It grows only from kids who bought cards years before. This gives the "after about 20 years, old cards rise" curve from the research (`docs/research.md`, section 5).

**Eleven bars on a phone is too many on one screen.** The character detail screen shows the three audiences with the largest popularity, and a button that shows all eleven.

### 3.5 Forms (R7, R23)

A form is a new design of a character, for example a mega form or a regional form. A form lives **inside** its character.

**The game saves a form when a card shows a new design (R26).** The player does not create forms in the roster. In the card designer, the player picks a character, then picks the base form, a saved form, or a new design. A new design opens the creator, and the game saves the result as a new form. The base form has no separate name (R25).
 It is not a separate roster entry, so the roster shows one tile for the character.

- A form **shares its character's popularity**: awareness, affection, and knowledge. Mega Ember is the same Ember everywhere.
- A form has its own feel: role, type, archetype, and palette. Its look follows the character's kind.
- A form has a small **appeal adjustment** of its own:

  ```
  form appeal = character's true appeal
              + 0.5 × (fit of the form's feel − fit of the character's feel)
              + the form's own random shift (spread 6)
  ```

- A form has its own **buzz**. Each week, the character's buzz rises to at least half of its forms' highest buzz. So a new form's hype also helps its character.
- A new form costs nothing. A change to a saved form costs half of a character redesign.
- A form can be the **headliner** of a set (R7). A headliner gets the box art and the most featured cards.

### 3.6 Redesign and retire (R9, R10)

**Redesign.** The player can change the feel or the drawing of a character after its debut.

- A redesign costs affection. A larger change costs more.
- Some audiences may like the new design better. The hidden appeal is set again for the changed parts.
- Old cards keep the old design. A redesign can make the old cards more valuable to nostalgia adults.

**Retire.** The player can stop a character from appearing on new cards.

- A retired character keeps its awareness and affection. Its fatigue falls.
- Old cards gain value through the normal market (age, scarcity, and nostalgia). Retirement is not necessary for that (R10).
- The player can bring a retired character back. A return after years can be a big event.

## 4. How appeal reaches sales

For one card, demand from one audience is:

```
demand = awareness × true appeal × buzz term × fatigue term × card fits × noise
```

- **Awareness** and **true appeal** come from the character (sections 3.2 and 3.3). If the card shows a form, the form's appeal replaces the character's appeal (section 3.5).
- **Buzz term** is above 1 when buzz is high and close to 1 when it is low.
- **Fatigue term** is below 1 when the character is overused.
- **Card fits** come from the card: the artist, the rarity, the treatment, the set theme, and the IP in the art (R22). Each card also has a life of its own (R24): its own appeal and its own history on the market. The set design document will define them. The roster gives them their inputs: type, archetype, palette, role, line, form, and counterpart.
- **Noise** is the luck of one run. Each fit must be larger than the noise, or the player cannot see it (`docs/research.md`, section 7).

Each term is a line in the release report. The report shows the three largest terms as signed percentages.

## 5. Hidden fits (the combinations to discover)

Decision D3 says "go crazy here." These are the fits that involve a character. Each fit is a hidden table in the simulation. The release reports reveal the tables over time.

| Fit | Example | Revealed by |
|---|---|---|
| Archetype × audience | Cute does well with kids | Release report, market research |
| Type × audience | Dragon does well with chase collectors | Release report |
| Role × rarity | A legendary at common rarity disappoints chase collectors | Release report |
| Type × era gimmick | The era gimmick favors some types | Release report in that era |
| Archetype × artist style | An artist with a cute style draws cute characters better | Release report, artist screen |
| Artist popularity × character popularity | A popular artist on a popular character multiplies demand | Release report |
| Palette × special rarity | A special rarity that matches the character's palette (Black Bolt and White Flare) | Release report |
| Evolution line × art set | All stages of a line in one set, by one artist, as connected art | Release report |
| Counterpart × parallel sets | Two counterparts released as parallel sets | Release report |
| Form × headliner | A new form of a loved character on the box art | Release report |
| Liked or disliked × featured | A disliked character on the box art lowers sales | Release report, social feed |

**Novelty decay.** A fit that the player repeats gives less each time. This keeps the late game a puzzle (`docs/research.md`, section 6).

**The random part.** `baseAppeal` is the fit values plus a random part. Good choices raise the odds of a popular character. They do not promise one. A filler character or a generated character can still become a favorite.

## 6. Where characters come from

### 6.1 Characters that the player creates

- A new character costs nothing in the game: no money and no in-game time (R11). The only cost is the player's own time in the creator.
- There is no limit on how many characters the player creates.
- The game clock does not move while the player uses the creator.

### 6.2 Generated characters (R6)

- When the player commits a set, the generator adds **new characters for the set's filler cards**. The filler cards can also reuse older roster characters.
- Each main set gets **10 to 20 new generated characters**, and small sets get fewer (R13). The exact count is a value to tune by play.
- The generator picks a feel and body parts at random. It can make every kind. The mix of kinds follows the set's theme and the era's gimmick (R17). **Not built yet:** the current build makes only creatures. **The game names each generated character** (R13).
- The hidden appeal of a generated character uses the same fit tables and the same random part as a created character. So a generated character can become very popular.
- After it appears, a generated character is a normal roster character. The player can feature it, give it a line or a form, redesign it, or retire it.
- The digest flags a generated character that does well: "Mossbun, a generated filler character from Set 3, is now popular with kids."

### 6.3 The start of a new save

This is the main thread's choice, because AJ left it open (R6):

1. The player creates **one mascot** in the opening steps. The step is required, and it teaches the creator. The mascot can be a creature or a person (R14).
2. The game then suggests a **starter trio**: three starters of different types. The player can create them or skip the step.
3. The first set's generator fills the rest.

## 7. How the player learns

The player narrows a reading in four ways:

1. **Releases.** Each card that shows the character narrows the range for the audiences that bought it. This is free.
2. **Focus group.** Before debut, the player pays for a test. It narrows the range a little for one audience.
3. **Market research.** A larger payment narrows the range for all audiences.
4. **Community team.** A weekly cost. It narrows all readings in the roster slowly.

A reading is never exact. A shock (a viral video, a meme) can still move true appeal.

The **codex** records each fit that a report reveals, for example "Cute × kids: strong." The codex lasts for one save only. Nothing carries between saves (D8).

## 8. Screens

### 8.1 Roster

- A grid of drawn characters.
- Sort by popularity, buzz, awareness, appearances, or debut date.
- Filter by type, archetype, role, line, origin (created or generated), and status (active or retired).
- Each tile shows the drawing, the name, a buzz arrow, and a fatigue warning when it applies.

### 8.2 Character detail

- The drawing, large.
- The feel: type, archetype, palette, and role.
- Popularity: the top three audiences, each as a range bar with an awareness mark. A button shows all eleven.
- Buzz and fatigue: a small trend line for the last 52 weeks.
- Appearances: every card, by set and rarity, with its current market price.
- Relations: the evolution line, forms, the counterpart, rivals, and companions.
- Forms: a record of the saved forms (R26). A tap opens a form to change it.
- Actions: redesign, retire, or bring back.

### 8.3 Character creator

A sequence of steps, one screen each, sized for one hand:

1. Kind: creature or person (R14)
2. Role
3. Type (primary, then the optional secondary)
4. Archetype
5. Palette
6. Look parts (flavor), with a live drawing. A creature and a person have different parts
7. Name
8. Relations: evolution line, form of, counterpart, rival, companion

The drawing updates at each step. The same creator, opened from a character, does a redesign or a form.

### 8.4 Special versions from other people

Sponsors, artists, and creators can propose a **special version** of a card that shows one of the player's characters (R2). The proposal arrives as a swipe card in the hub. The player accepts or declines. The player never loses control of a character. Collaboration terms belong in the collaboration design document.

## 9. Open questions for AJ

AJ answered all earlier questions (R5 to R22).

Two items wait for AJ to confirm:

1. **The recipe of a kind (R16).** The interpretation: a recipe sets which parts of the feel count most, and how fast buzz, fatigue, and affection move for that kind. Is this what AJ means?
2. **Places and events need their own design.** R15 to R22 make places and events full IP, with a feel, appeal, links, and their own cards. The next design draft must define their feel parts, their look, and their recipes.

The roster connects to systems that later design documents will define:

- **Set design:** featured cards, rarities, treatments, parallel sets, art sets, and the IP that a card's art features (R22).
- **Artists:** artist style and artist popularity.
- **Drops and the market:** release day, resellers and scalpers, and prices.
- **The hub and actions:** the digest, the feeds, and actions such as interviews.
