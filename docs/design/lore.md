# Lore: races, factions, and story

**Status: ACCEPTED by AJ.** Written 2026-11-12. The decisions behind it are L1 to L7 in `docs/decisions.md`, plus R15, R20, S9, and D3. Section 8 records AJ's answers.

Lore gives the roster a world: races, the factions inside them, the relations between factions, and a story that each set moves forward. Fans pick sides, so the lore drives demand.

## 1. What lore must do

- Let the player build races and factions, for example Orcs against Humans, and Human factions that disagree (L1).
- Let each set tell a chapter: a story beat that changes the world (L3).
- Give factions their own fans, so the story choices change sales (L4).
- Show the player a timeline: the world's history, chapter by chapter.

Every field passes the field rule (`research.md`, section 7): a system reads it, a screen shows it, and a report names it.

## 2. Races and groups (L1, changed by L8 to L10)

**L8 to L10 change this section:**

- **A race** is what a character is (Orcs, Elves). **A group** is who a character serves. Race and group are separate, so a kingdom can hold Humans and Elves, and an Orc can serve a Human kingdom.
- A group has a kind: kingdom, clan, order, guild, tribe, or cult. "Faction" in this document now means a group.
- A group can sit inside one larger group, one level only. A card counts fully for its group and at half weight for the larger group.
- The player can delete a race or a group. Released chapters keep their history, and a deleted group shows as "a removed group".
- The demand factor is called **Groups**.

The table below is the first draft (L1).

| Field | Values | Reader | Screen |
|---|---|---|---|
| Race `name` | Text, for example "Orcs" | Flavor | Lore screen, character creator |
| Race `emblem`, `colors` | A symbol shape and two palette colors | Flavor. The emblem shows on its characters' cards | Lore screen, the card |
| Faction `name` | Text, for example "The Iron Crown" | Flavor | Lore screen, character creator |
| Faction `race` | One race | Groups the factions | Lore screen |
| Faction `emblem`, `colors` | As a race | Flavor | Lore screen, the card |
| Faction `fans` | Hidden: the appeal for each audience, -50 to 100, from hidden fits plus a random part | Demand: the "Factions" factor (section 6) | A range, as with character appeal (R4) |
| Faction `fame` | The share of each audience that knows the faction, 0 to 1. Starts at 0 | Demand | A range |

- A character has one race at most and one faction at most. A creature can have no race, as now.
- The faction's fans come from hidden fits, like a character's appeal. Example start fits: kids like heroic, bright factions; teens like dark, rebel factions; chase collectors like mythical, ancient ones. The fits come from a faction's **tone** (heroic, dark, wild, noble, rebel, ancient), which the player picks.

## 3. Relations (L2)

- Each pair of factions has a relation from -100 (sworn enemies) to +100 (allies). The player sets the start, for example Orcs against the Human kingdom at -80.
- Factions of the same race start at 0, so a Human civil war is possible.
- Story beats move the relations (section 4).
- **The Lore screen** shows the relations as a list of pairs with a phrase: "Sworn enemies", "Rivals", "Uneasy", "Friendly", "Allies".

## 4. Story beats (L3)

Each set picks one beat and its factions. The beat takes effect on release day.

| Beat | Factions | Effect on the world | Effect on fans |
|---|---|---|---|
| **War** | Two | Their relation falls by 30 | Both fan groups buy more: each side wants its army |
| **Alliance** | Two | Their relation rises by 40 | A small lift with both. A large lift if they were enemies (a surprise) |
| **Betrayal** | Two: the traitor and the betrayed | Their relation falls by 50 | The betrayed faction's fans buy the next set to see the revenge (anticipation). The traitor's fans split |
| **Rise** | One | The faction's fame rises | Its fans buy more |
| **Fall** | One | The faction loses fame | Its fans are angry now (less demand), and they want its return (more anticipation for a later "Rise") |
| **Discovery** | One, or none | A new race or faction debuts | Curiosity with every audience. A good way to introduce a race |

**The cards add to the beat (L3).** The share of the set's designed cards from each faction is its **presence**. A war set where 80% of the cards are Orcs is "the Orc side of the war".

**The timeline.** The game keeps each set's beat, factions, and presence in a lore timeline, one chapter for each set.

## 5. A story across sets (L4)

- **An arc** is two or more sets in a row that involve the same factions. A running arc builds **anticipation**: the next set in the arc gets a demand lift with those factions' fans.
- An arc that drags on too long tires the fans, like release fatigue.
- **Parallel pairs** fit opposing factions: one half for each side of a war (S9). Each half draws its own side's fans, and collectors want both halves.

## 6. The demand factor (L4)

The algorithm gets a factor, **Factions**, for each audience:

```
Factions = 1 + Σ over the set's factions:
                presence × fans (scaled) × fame
                × beat effect for this faction
           + rivalry draw (two factions below -50 in one set or one pair)
           + anticipation (the arc continues)
```

- The range is about ×0.7 to ×1.6 [inferred]. The simulations must check that it beats the luck (`research.md`, section 7).
- The algorithm screen lists each faction's part, for example "The Iron Crown at war: ×1.12 with teens".

## 7. Screens

- **Studio → Product → Lore:** the races with their factions, the relations, and the timeline of chapters.
- **The character creator:** a Lore step to pick the race and the faction.
- **The set screen:** a Story section to pick the beat and its factions. It shows the presence of each faction from the cards.
- **The card:** a small faction emblem in the corner, when the character has a faction.
- **The release report and the news:** the beat, for example "War: the Iron Crown and the Bloodtusk clans. Their fans are buying."

## 8. Answers (L5 to L7)

1. **Defection (L5):** a "Betrayal" beat can move a named character to the other faction. A form can also belong to another faction than its character, so one version can sit on the other side. A card that shows the form counts for the form's faction.
2. **The beats (L6):** the six beats stay.
3. **Fates (L7):** a "Fall" beat can end a named character, who retires (R10). Change hype and nostalgia are two different draws:
   - **Change hype** is short-term: a character that defects, falls, or debuts a dark form gains buzz at once. The algorithm reads it in a "Hype" factor.
   - **Nostalgia** belongs to individual cards over time. It is a reader of the secondary market (not built yet).
   - **The last card of the old state:** when a character changes, the game records the change in the timeline and marks the character's last cards from before it. The secondary market will raise their value while the change lasts.

**Status: ACCEPTED by AJ.** The build adds races, factions, relations, story beats, the timeline, faction fans, the "Factions" and "Hype" factors, and the Lore screen. The card emblem and the secondary-market readers come later.
