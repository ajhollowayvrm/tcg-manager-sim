# Singles: the value of each card

Status: built on 2026-11-15. Decisions M1 to M4 in `docs/decisions.md`.

AJ's words: "I want the scenario where a type of card might be worth more even though it isn't as premium. An example is a prime Gengar vs a modern day SIR. The prime only has frame break and holo but is worth wayyyy more than a modern etched gold card."

## 1. The model

A **single** is one card in one version, for example "Aryla, Shade (Base)" or "Wyrkit (Reverse holo)". The price of a single is the demand now, divided by the copies that exist. So an old card from a small print run can be worth more than a modern card with a richer look from a huge print run.

| Part | Formula |
|---|---|
| Copies per pack | From the set's pull rates: each outcome's mean count per pack, divided by its pool |
| Packs in the world | Before the release: the print run. After it: the opened packs, at least 20% of the print run |
| Survival | exp(−0.06 × years since the last print) |
| Copies | packs in the world × copies per pack × survival, at least 1 |
| Collectors | Reached people: chase collectors × 1.0, investors × 0.7, art collectors × 0.5, completionists × 0.3, teens × 0.1 |
| Character now | exp((appeal − 33) / 67) × (1 + awareness) × (1 + buzz / 200), with chase and art collectors, today |
| Nostalgia | 1 + min(3, 0.3 × years since the release), and the years part × 1.5 for the first era |
| Look and artist | (1 + 0.02 × the version's rarity feel) × (1 + 0.3 × legacy / 100 + 0.3 × heat / 100). A small weight |
| The last card of an old state | × 1.3 for a character's last cards before a change (L7) |
| Competition | 1 / (1 + 0.05 × newer released cards of the character), at least 0.7 |
| Wanted | collectors × 1% × character now × nostalgia × look and artist × last card × competition |
| Price | $5 × (wanted / copies)^0.8 × a weekly wobble of ±5%, at least $0.10 |

A price is a read. The wobble comes from a hash of the card and the week, so a read draws no random number.

Example (a test): a first-era SIR from a 30-box print is worth about $4 at release. Five years later, with 50 times the fans, it is worth about $281. A modern gold card from a 20,000-box print is worth about $3, although its look feels rarer.

## 2. Feedback (M1)

- The "Singles" demand factor: chase collectors and investors read the value of the singles in one pack against the pack price. Half the pack price is normal. Factor = 1 + 0.25 × log2(ratio / 0.5), from ×0.8 to ×1.6. Only a set with a release plan has it.
- Each week, the top 10 singles of each released set make news in the hobby: √(price − $20) people for each single, split 50% chase collectors, 30% investors, and 20% art collectors.
- The news reports price milestones: $100, $250, $500, $1,000, $2,500, $5,000, and $10,000.

## 3. Screens (M3)

- The set screen of a scheduled or released set shows "Singles": the value of a pack, the top 5 singles with their price, copies, and 4-week trend, and a list of all singles.
- Studio → Product → Hall of fame: the 25 most valuable singles of all released sets.
- The game keeps 13 weeks of price history for the top 10 singles of each released set.

## 4. Reprints (M4)

- A reprint adds copies, so the prices fall, and it restarts the survival clock.
- When a reprint arrives and cuts a set's top single (at least $20) by 30% or more: investors −10 goodwill, chase collectors −5, and a news story.
- A newer released card of the same character takes a small part of the demand (see Competition).

## 5. Not built

Grading, card condition, sealed product value, and singles sales by the studio.
