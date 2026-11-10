# Design decisions

AJ makes the design decisions for this game. This file records each decision, its date, and AJ's words. The questions and their evidence are in `docs/research.md`, section 12.

When a later decision changes an earlier one, add a new entry. Do not edit the old entry.

## 2026-11-10: answers to research decisions D1 to D14

### D1. Cards designed by hand: 10 to 20 featured cards per set

The player designs 10 to 20 featured cards by hand in each set. The game makes the other cards from set-level rules.

Each featured card links to:

- one **artist**, and
- one **character** from the player's roster.

One character can appear at more than one rarity in the same set. AJ's words: "similar to how Pokemon will have a character that's rare, Ultra Rare and SIR in the same set."

### D2. A roster of characters, creatures included

The player builds a **roster of characters**. Creatures are characters. Each character has its own **feel**, and the feel affects how well its cards sell.

AJ's example: the parallel sets Black Bolt and White Flare. They released together, and each had a special rarity that matched the black of Zekrom or the white of Reshiram.

Consequences for the design:

- The game must support **parallel sets** that release together.
- A set can have a **special rarity** whose look matches the feel of a character.

### D3. Hidden combinations: many, and deep

AJ's words: "you can go crazy here." The combinations that AJ named:

- The popularity of an artist meets the popularity of a character.
- A set features a character that people like, or one that people dislike.
- A **gimmick of the era** that gets people excited.
- An **art set**: an evolution line illustrated as connected art across its cards. AJ's example: Froakie, Frogadier, and Greninja in Chaos Rising.

### D4. Market regime: modern

The market works like the modern market (2021 to 2026): demand above supply, scalpers, store limits, and reprints. See `docs/research.md`, section 3.

### D5. Start: a garage start, with a crowdfund as the first big decision

Accepted as recommended.

### D6. Funding and growth

Funding tools: bank loans, revenue-based financing, and crowdfunds.

AJ's words: "Your first set should feel massive to you but small in the world and maybe require a loan."

Later in the game, the company can grow into its own production, for example **its own print facility**.

### D7. Collaborations: all four types

All four deal types are in: crossover sets, licensing the player's IP out, promotions, and creators and artists. Promotions with **restaurant chains** come later in the game.

### D8. Loss: running out of money

The company loses when it runs out of money. **Nothing carries over between saves.** No legacy, no codex, no hall of fame across saves.

### D9. Time: one tick is one week

Accepted as recommended. Release day is a special event. One session is about one set cycle.

### D10. Information hub, plus actions

Accepted as recommended: three priority levels (act now, this week, feed), one tab for each stream, a weekly digest that shows causes, and swipe cards for small decisions.

AJ added **actions**. The player can do an action, for example an interview. An action may help, or it may not. Actions unlock as the company's popularity grows.

### D11. Rival publishers: not at first

No rival publishers in the first version.

### D12. Build first: the roster of characters (the IP)

The first thing to design and build is the **roster of characters**, not the full set loop.

### D13. Apple account: the free Apple ID

AJ uses the free Apple ID. The app expires after 7 days, and AJ rebuilds it from Xcode.

Consequences:

- The app cannot use iCloud or CloudKit.
- Save export through the Files app or a share sheet is necessary.
- When the app expires, do not delete it. Deleting the app deletes its saves.

### D14. Money: real dollars

Prices and costs use real dollars, based on the measured facts in `docs/research.md`, section 5.

## 2026-11-10: the character roster

### R1. The parts of a character's feel: all four

A character's feel has four parts:

- **Type or element**, for example fire, water, shadow, or light.
- **Personality archetype**, for example cute, cool, fierce, mysterious, or goofy.
- **Color palette**: two or three signature colors.
- **Role in the world**, for example starter, mascot, legendary, villain, or human trainer.

### R2. Creation: the player builds every character

AJ's words: "you do all of them yourself but there can be ideas from sponsors and other folks on special versions of a card but you control and build the IP."

- The player creates every character. The game does not generate characters.
- Sponsors and other people can **propose special versions of a card**. The player decides. The player owns and controls the IP.

### R3. Visuals: drawn from parts

SwiftUI draws each character from its parts and its palette. Foil shaders go on top.

### R4. Popularity: deep, with all three models together

AJ's words: "I want it to be deep and complex."

Popularity combines all three options:

- a **hidden true appeal**, shown to the player as a range,
- a visible **buzz** that rises with good cards and falls with overuse, and
- appeal that is **different for each audience** (for example kids, collectors, and players).

## 2026-11-10: roster follow-up (answers to the roster draft's open questions)

### R5. A new character costs only game time, and starts with no popularity

AJ's words: "Nothing but gameplay time but each new character generally starts from no popularity."

- A new character costs no money.
- A new character starts with no popularity. **Interpretation, for AJ to confirm:** nobody knows the character yet, so its awareness starts at zero. Its hidden appeal still exists. The roster draft models this as `awareness`, section 3.3.
- **Interpretation, for AJ to confirm:** "gameplay time" means in-game design time. The roster draft uses 1 week of studio design time for each new character.

### R6. Each set also generates characters. This amends R2

AJ's words: "each set should randomly generate some even if you have some in there. This creates some variety and data points if a randomly generated character gets wildly popular."

- The player still builds and controls the IP.
- Each set also adds some **generated characters** to the roster. They appear on the set's filler cards.
- A generated character can become very popular. The player can then feature it, give it a line, or redesign it.
- AJ left the start count to the main thread. The choice is in the roster draft, section 6.

### R7. Forms: yes, and a form can headline a set

A character can get a new **form**, for example a mega form or a regional form. A form can be the headliner of a new set.

### R8. Ten audiences

AJ's words: "Let's aim for 10 audiences." The proposed list is in the roster draft, section 3.4, for AJ to confirm.

### R9. Redesign: yes

The player can redesign a character after its debut. A redesign costs some of the character's affection.

### R10. Retire: yes, but value does not depend on it

The player can retire a character. AJ's words: "it doesn't need to be retired to gain value." Old cards gain value through the normal market (age, scarcity, and nostalgia), whether the character is retired or not.

## 2026-11-10: roster second draft (answers to its open questions)

### R11. Confirmations of R5

- **"Gameplay time" means the player's own time.** AJ's words: "no like your time playing the game." A new character costs nothing in the game: no money and no in-game time. This replaces the "1 week of design time" interpretation in R5.
- **"No popularity" means zero awareness.** Confirmed. The hidden appeal exists from the start.

### R12. Audiences: add resellers and scalpers

AJ's words: "There needs to be a reseller or scalper audience."

- Resellers and scalpers are an audience. This replaces the draft's statement that "scalpers are not an audience."
- With this audience, the list has eleven audiences. AJ said "aim for 10", so eleven is in range. Merge two audiences if AJ asks for exactly ten.

### R13. Generated characters: 10 to 20 per main set, named by the game

- The count of 10 to 20 new generated characters for each main set is confirmed.
- The game names each generated character.

## 2026-11-10: characters can be people

### R14. A character can be a creature or a person

AJ's words: "One change is that it doesn't need to be a creature. My first mascot will be a person."

- Each character has a **kind**: creature or person. Any role can have either kind. A mascot can be a person.
- A person has its own look parts: skin, hair, eyes, outfit, and accessory. The palette colors a person: the first color is the outfit, the second is the hair, and the third is the detail.
- **Interpretation, for AJ to confirm:** the kind is **flavor**. It changes the drawing and the look parts only. It does not change appeal. The roster draft, section 9, asks AJ about this.

### R15. Later: the IP is more than characters

AJ's words: "that might be your mascot but eventually for just general IP you should be able to make a place or an event or something"

- The mascot stays a character: a creature or a person (R14).
- Later, the player can also create other kinds of IP, for example a **place** or an **event**.
- This is not in the current build. The roster draft, section 9, lists the questions to answer before the build.

## 2026-11-10: answers to the R14 and R15 questions

In this file, **kind** means creature, person, place, or event. **Type** still means the element type, for example fire or water (R1). AJ said "type of a card" for a kind.

### R16. Each kind has its own popularity recipe. This replaces the R14 interpretation

AJ's words: "Each type of a card has a different recipie for how it becomes popular and might appeal to differing audiences."

- The kind is **not flavor**. It changes appeal.
- Each kind has its own hidden fit for each audience.
- Each kind has its own **recipe** for how it becomes popular. **Interpretation, for AJ to confirm:** a recipe sets which parts of the feel count most, and how fast buzz, fatigue, and affection move for that kind. For example, a place can gain buzz slowly but keep it longer than a creature.

### R17. The generator makes every kind, in a mix that follows the set or the era

AJ's words: "Yes it can generate any type of card and probalby a mix of all of them based on the set or era's schtick."

- The generator can make creatures, people, places, and events.
- The mix of kinds changes with the set's theme and the era's gimmick (D3).

### R18. A place or an event can be on its own card, and can be the theme of a set

AJ's answer: "C yes."

### R19. Every kind has a feel and an audience appeal

AJ's words: "Yes it does. All types will have one."

Places and events use the same model as characters: a feel, a hidden appeal, awareness, and buzz.

### R20. IP items link to each other

AJ's words: "Yes it can!"

For example, a character's home town, or the characters that take part in an event.

### R21. The roster is one list with filters

AJ's answer: "I like A." The roster shows all IP in one list. Filters select characters, places, or events.

### R22. A card's art can feature more IP, and that can help or hurt the card

AJ's words: "I also like the idea that the art of a particular card might feature another character or a place and that might boost or tank the card."

- A card has one subject. Its art can also feature other IP, for example a second character or a place.
- Each featured item adds its own appeal to the card. An item that an audience likes raises the card's sales to that audience. An item that an audience dislikes lowers them (D3).
- This extends the "cameo demand" in the roster draft. The set design document will define it.

## 2026-11-10: forms and cards

### R23. A form is part of its character, with a small extra of its own (model C). This changes R7

AJ's words: "There should be a distinction between a character in the roster and the cards of that character. So a Gengar card is the same Gengar everywhere but in different forms." AJ chose model C: "Let's do C."

- A roster entry is the IP: one character with one popularity. A card is a separate thing that points to a character (D1).
- A form, for example a mega form, lives **inside** its character. It is not a separate roster entry.
- A form shares its character's popularity: awareness, affection, and knowledge.
- A form adds a small appeal adjustment of its own and its own buzz. A form's buzz also lifts its character's buzz.
- A form can still headline a set (R7).

### R24. Each card has a life of its own

AJ's words: "I want the individual cards too to have a life of their own. So the Gengar rare holo from Perfect Order and it's loved but not like the Fusion Strike SIR Alt Art."

- Two cards of the same character can have very different popularity.
- The character's popularity is the base for all of its cards. Each card adds its own appeal and its own history on the market.
- The set design document will define what gives a card its own appeal, for example the art, the artist, the rarity, the treatment, and the IP in the art (R22).

### R25. A card has its own name. A card name is not a form name

AJ's words: "I guess Aryla, Destined Trainee is the CARD NAME so I'm not sure what the Form Name is."

- Each card has its own name, in the format "Character, Title". Example: "Aryla, Destined Trainee". The set designer sets the card name.
- The base form has no separate name. It is the character: "Aryla".
- **Interpretation, for AJ to confirm:** a form name exists only for a form after the base form, and only when the character's design changes. Examples: "Mega Aryla", or an older "Captain Aryla" after a time skip.

### R26. The game saves a form when a card shows a new design

AJ's words: "Can we store the forms when a card with a new form is made? So we don't need to keep up with the forms -- just keep up with it as they're made."

- The player does not manage forms in a separate screen. The roster has no "Create a new form" action.
- When the player designs a card and gives the character a new design, the game saves that design as a new form of the character.
- A later card can show the base form, a saved form, or another new design.
- The character's detail screen shows the forms as a record.

## 2026-11-10: the card designer

### C1. Build the card designer first

AJ chose option A: build only the card designer at first. The player designs and saves cards inside a set. The print run, the packs, and sales come after it.

### C2. A card has five decisions. The treatment is on top of the rarity

AJ's words: "Ooo, yes all of those -- however the treatment of the card is ON TOP OF what the rarity of that card naturally gives it."

The five decisions:

- **Subject:** a character, then the base form, a saved form, or a new design (R26).
- **Card name:** "Character, Title" (R25).
- **Rarity.**
- **Treatment.** The rarity gives the card its natural value. The treatment adds to that value. It does not replace it.
- **Art:** the artist and the other IP in the art (R22).

### C3. Cards are for collecting only

AJ's words: "Hmm, for now let's just stick to collectability."

Cards have no gameplay stats at this time.

### C4. The rarity ladder is fully customizable, with presets

AJ's words: "The rarity ladder should be 100% customizable and there should be different Presets you can make. We can have a default but many other things."

- The player can change every tier of a rarity ladder: its name, its order, and how many tiers there are.
- The player can save ladders as **presets**. The game has a default preset.

### C5. No procedural card art

AJ's words: "I don't really care about art in the game because that's really hard to procedurally create."

The game does not draw art for each card. A card shows the existing character drawing in a frame. The art decision is about who made the art and what IP it shows, not about a picture.

### C6. A card belongs to a set, and can later be standalone

AJ's words: "Cards can belong to a set but could eventually be standalone or have versions that are standalone."

- At this time, every card belongs to a set.
- The model must allow a card with no set later, for example a promo card, or a standalone version of a set card.

## 2026-11-10: card designer draft (answers to its open questions)

### C7. The treatment list is customizable

AJ's answer to "Must the treatment list also be customizable?": "Yes." The studio has one editable treatment list, with no presets.

### C8. No artist in the first designer

AJ's words: "Ok, that's fine for now." The Art step has only the featured IP. The artist arrives with the artist system.

### C9. Pull rates are fully customizable

AJ's words: "Pull rates are totally customizable." The player sets the pull rate of each rarity tier. The pack design document will define the pull-rate fields.

### C10. A set keeps its own copy of the ladder

AJ's answer: "Yes." A later change to a preset does not change an existing set.

### C11. Any treatment can go on any rarity, and treatments cost money

AJ's words: "Yes and treadments cost money."

- Any treatment can go on any rarity.
- Each treatment has a cost for each printed copy. The print system will charge it. The designer shows it.

### C12. Keep the competitive players audience

AJ's words: "I like it." The audience stays, with no special reader until cards get stats.

### C13. A theme is the shape of a set, not its element type

AJ's words: "The themes are good but there should be more themes like Feudalism or Castles or stuff like that. The theme is like the shape of a set and not necessarily it's type."

- The game has a **theme library** in groups: elements, history and cultures, places, stories and moods, and things and hobbies.
- The element types stay, as one group of themes.
- Each theme has a hidden fit for each audience. Each world rolls its own fits. The market will read them.

### C14. Frame styles on tiers, and treatments built from four parts

AJ's words: "yes, build the frame styles and the other things like etchings or texture or a half art that comes out of frame or a full art etc etc. Research some of these"

- Each rarity tier has a **frame style**: solid, rainbow, gold, silver, or black. Every card at the tier gets that frame.
- A treatment's look has four parts: a **layout** (standard, extended art, full art, borderless, frame break, showcase), a **foil** (none, holo, reverse holo, pattern reverse, cosmos, cracked ice, galaxy, etched, rainbow, gold), a **textured** surface, and a **stamp** (serial number, signature, event stamp).
- The research behind this is in `docs/design/cards.md`, section 5.1.

### C15. The rarity tier sets the card look. No separate treatments. This changes C2, C7, and C11

AJ's words: "When setting up the rarity ladder, that's when I should be able to assign a finish and texturing and such to it. It doesn't need to be its own section."

AJ's answer to "Does a card still get its own treatment step in the card designer?": "No, tier decides."

- Each rarity tier sets the whole look of every card at that tier: the frame style, the layout, the foil, the texture, the stamp, and the extra cost for each printed copy.
- The studio's treatment list ends (this replaces C7).
- The card designer has four steps: subject, card name, rarity, and art (this replaces the treatment decision in C2).
- The tier's extra cost for each copy replaces the treatment cost (C11).
- Reverse holo copies of common cards come later with the pack design, as parallels.

### C16. Printed versions: on tiers and on single cards

AJ asked: "Can I apply multiple things to a rarity? Kinda like how pokemon Rares can be Holo or Reverse Holo." To the proposal, AJ said: "Oh I like that. That way I can have true alt arts."

- A tier can have **extra versions**, for example a reverse holo. Every card at the tier is also printed in these versions.
- A card can turn off a tier's extra version.
- A card can add **its own versions**, for example a true alt art. **Interpretation, for AJ to confirm:** "true alt arts" means option B, a per-card choice, because an alt art belongs to one card.
- Each version has a name, a frame style, a look, and a cost for each copy. Each version is a separate collectible. Later, each version gets its own pull rate (C9) and its own market price (R24).
- The default ladder gives Common, Uncommon, Rare, and Holo Rare a reverse holo version.

### C17. The game sets the print cost. The player cannot edit it

AJ's words: "I see. I shouldn't be able to edit this number then."

- The extra cost for each printed copy comes from the look: a fixed price for the layout, the foil, the texture, the stamp, and the frame style. The prices are in `docs/design/cards.md`, section 5.2.
- The tier editor and the version editor show the cost and its parts. They do not let the player change it.

## 2026-11-10: market trends

AJ asked: "I wonder if there should be a market sentiment for the finishes and types and such. Like maybe the market currently really likes etching but not gold cards etc." The design is in `docs/design/trends.md`.

### M1. Trends for as many things as possible

AJ's words: "I'd say as many things as we can. This feels like it mirrors real life the best."

Foils, layouts, frame styles, texture, stamps, set themes, element types, personalities, roles, and kinds all get a trend.

### M2. Trends move by seasons and by the player's own cards

AJ's answer: "Both." Trends drift by themselves. A hit can start a fad, and overuse can kill it.

### M3. The player sees a phrase for each range

AJ's words: "Create a generic phrase with ranges so like 0-20 is "People don't like it much" etc."

The phrases are in `docs/design/trends.md`, section 5.

### M4. Record now. Build with the market. Show trends in the rarity ladder

AJ's words: "Record the design now and note that we should show some of that data here in the rarity ladder."

- Trends are built with the market system.
- The tier editor and the version editor will show the trend phrase next to each look part.
- Until the market exists, the look parts stay flavor (C14). With trends, they become levers.

### M5. Answers to the trends draft's open questions

- **The phrases.** AJ's words: "Yeah they look good for now." The five phrases in `docs/design/trends.md`, section 5, stay.
- **Market research improves trend readings, in two ways.** AJ's words: "Yes! And I'm imagining market research as both an on demand action and an overall improvement via upgrades to the studio."
  - An **on-demand action**: the player pays for one study, and the readings become more exact at once.
  - A **studio upgrade**: a permanent improvement that makes all readings more exact over time. This connects to roster draft section 7 (the community team) and to D10 (actions unlock as the company grows).
- **No preview before the market.** AJ's words: "Hmm No that's okay." The trend phrases appear when the market system exists.


## 2026-11-10: one card design at many rarities

### C18. A new card can take more than one rarity

AJ's words: "When creating a card in a set, I should be able to select multiple rarities for a card like how Greninja in CRI has a common, rare, ultra rare and SIR"

- The Rarity step of a new card lets the player pick one or more tiers. This builds on D1.
- Each picked tier adds a **separate card**. The cards have the same subject, name, and featured IP.
- Each card has its own hidden shift (R24) and its own versions (C16). The Versions step has a rarity switcher. For example, only the SIR card gets the alt art.
- The game adds all the cards or no card. If one card is not valid, the game adds none.
- A saved card has one rarity. When the player changes a saved card, the Rarity step picks one tier.
