# Market trends

**Status: DRAFT. Recorded 2026-11-10. Not built yet.** The decisions behind it are M1 to M4 in `docs/decisions.md`. Build it with the market system (M4). Section 8 records AJ's answers.

A trend is how much the market likes one thing at this time: a foil, a layout, a theme, an element type, and so on. Trends move week by week. A hot thing sells more, and a tired thing sells less.

## 1. What the trends must do

- Mirror the real market: fads start, peak, and fade (M1).
- Give every look decision a market bet, in addition to its print cost (C17).
- Move by themselves (seasons), and move because of the player's own cards (M2).
- Show the player a phrase and a direction, never an exact number (M3).
- Make "the gimmick of the era" from D3 real.

## 2. What has a trend (M1)

As many things as possible. AJ's words: "This feels like it mirrors real life the best."

| Group | Items | Count |
|---|---|---|
| Foil | None, holo, reverse holo, pattern reverse, cosmos, cracked ice, galaxy, etched, rainbow, gold | 10 |
| Layout | Standard, extended art, full art, borderless, frame break, showcase | 6 |
| Frame style | Solid, rainbow, gold, silver, black | 5 |
| Texture | Textured | 1 |
| Stamp | Serial number, signature, event stamp | 3 |
| Set theme | The 42 themes of the theme library (C13) | 42 |
| Element type | Fire to Dragon | 12 |
| Personality | Cute to Creepy | 8 |
| Role | Starter to Human trainer | 8 |
| Kind | Creature, person (later place, event) | 2 |

## 3. A trend

| Field | Values | Reader | Screen | Report line example |
|---|---|---|---|---|
| `heat` | Hidden. 0 to 100. 50 is neutral | Card demand: a hot thing raises demand, a cold thing lowers it | A phrase (section 5) | "Etched foil was in fashion: +12%" |
| `direction` | Rising, steady, or falling. From the change in heat over the last 8 weeks | The phrase | An arrow next to the phrase | "Gold cards are going out of fashion" |
| `sensitivity` | For each audience, how much the audience cares about this group | Card demand | None. The reports reveal it over time | "Chase collectors care about foils. Kids do not." |

**The effect on demand.** A card's demand from one audience is multiplied by a trend term for each trend that the card touches. The term is between about 0.85 and 1.20. The audience's sensitivity scales it. For example, chase collectors and art collectors care a lot about foils and layouts. Kids care more about element types and personalities. The total effect must be larger than the noise in one run (`docs/research.md`, section 7), so that the player can see it.

## 4. How a trend moves (M2)

Both ways, every week:

1. **Seasons.** Each trend drifts toward a slowly moving target. A target changes every few months, so a fad lasts long enough to plan a set around it.
2. **The player's own cards.**
   - **A hit starts a fad.** When a card or a set sells very well, the things on it get hotter. Example: a hit set with etched foils makes etched foil hot across the market.
   - **Overuse kills a fad.** When many of the player's recent cards use the same thing, its heat falls. This is novelty decay (`docs/research.md`, section 6).
3. **Later: rival publishers and events.** D11 says no rival publishers in the first version. When they arrive, their cards move the trends too. Market events (a famous creator, a news story) can also push a trend.

## 5. What the player sees (M3)

A phrase for each range of heat, plus an arrow for the direction:

| Heat | Phrase |
|---|---|
| 0 to 20 | "People don't like it much" |
| 21 to 40 | "People are lukewarm on it" |
| 41 to 60 | "People like it" |
| 61 to 80 | "People are excited about it" |
| 81 to 100 | "Everyone wants it" |

- The phrase comes from the studio's **reading** of the heat, not from the true value. With little knowledge, the reading can be one range off. Market research and releases make the reading more exact, the same as a character's appeal.
- The arrow shows rising (↑), steady (→), or falling (↓).

## 6. Where the trends show

- **The rarity ladder (M4).** The tier editor and the version editor show the phrase and the arrow next to each look part: the foil, the layout, the frame style, the texture, and the stamp. Example: "Foil: Etched · Everyone wants it ↑". The player then sees the market bet at the same place where they see the print cost (C17).
- **The theme library.** The phrase next to each theme.
- **The character creator.** The phrase next to each element type, personality, role, and kind.
- **The market feed** in the hub (D10): a line when a trend changes range. Example: "Collectors are tired of gold cards."
- **The release report:** the trend terms that moved sales the most, as signed percentages.

## 7. Market research (M5)

Market research makes the readings more exact: the trend readings and the character appeal readings. It comes in two forms:

| Form | How it works | Example |
|---|---|---|
| On-demand action | The player pays for one study. The readings for one group become more exact at once | "Survey the collectors on foils: $8,000" |
| Studio upgrade | A permanent improvement. All readings become more exact a little each week | A market research team, then a data department |

The roster draft (section 7) already names a focus group, market research, and a community team. The studio upgrades connect to D10: actions unlock as the company grows. The actions and upgrades design will define the prices and the effects.

## 8. Answers

AJ answered the draft's questions (M5):

1. The five phrases stay.
2. Market research improves the trend readings, as an on-demand action and as a studio upgrade.
3. No preview in the ladder before the market exists.
