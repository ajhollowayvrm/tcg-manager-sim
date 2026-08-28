// Character roster — the persistent "who", parallel to artists.js's persistent
// "whose art". A character isn't tied to one card or one set: it recurs across
// printings, and each new appearance both DRAWS ON and FEEDS its accumulated
// fame — the Charizard-as-a-character effect from the v2 addendum.
//
// Unlike an artist (static identity + a drifting career the roster seeds), a
// character has NO static identity — the player mints one from scratch in the
// set builder. So there's no seed/live split here: the record in state.characters
// IS the character, full stop.
//
// Fame (0–100) drifts weekly, driven by how its LIVE cards are actually doing —
// price momentum and hype (chase pulls), punch, and any controversy heat —
// rather than a pure random walk. A character with no live cards just idles.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

// Weeks a trajectory must hold before it can graduate, so an arc unfolds over a
// real run instead of flipping every card release.
const ICON_FAME_FLOOR = 85
const ICON_WEEKS_REQUIRED = 40
const ICON_DEMOTE_FAME = 30 // an icon this neglected can (rarely) fall from grace
const ICON_DEMOTE_WEEKS = 80
const ESTABLISHED_FAME_FLOOR = 55
const ESTABLISHED_WEEKS_REQUIRED = 20
const RECOVERY_WEEKS_REQUIRED = 26

// Treatment tiers a signature card can carry when it features an EXISTING
// character. Each is a cost multiplier on the card's artist commission (a bigger
// treatment costs more to produce) and an appeal multiplier on the fame bonus the
// card gets from the character (see famePopBonus). 'icon' is gated on the
// character actually having graduated — it's the reward for a character that
// blew up, not something you can buy on day one.
export const TREATMENTS = [
  { id: 'debut', name: 'Debut appearance', costMul: 1, appealMul: 1, requiresIcon: false,
    blurb: "The character's first-ever printing — no fame to draw on yet, but it starts their story." },
  { id: 'standard', name: 'Standard reprint', costMul: 1, appealMul: 1.15, requiresIcon: false,
    blurb: 'A straightforward new appearance, riding the fame the character already has.' },
  { id: 'premium', name: 'Premium treatment', costMul: 1.5, appealMul: 1.45, requiresIcon: false,
    blurb: 'A bigger, pricier printing that leans harder into the character’s pull.' },
  { id: 'icon', name: 'Icon treatment', costMul: 2.2, appealMul: 1.9, requiresIcon: true,
    blurb: 'A reserved alt-art/foil slot for characters who’ve graduated to icon status.' },
]

export function getTreatment(id) {
  return TREATMENTS.find((t) => t.id === id) ?? TREATMENTS[0]
}

// Fresh character roster. Empty by default — see content/characters.js.
export function seedCharacters() {
  return []
}

export function getCharacter(state, id) {
  return (state.characters ?? []).find((c) => c.id === id) ?? null
}

let _uid = 0
function characterId() {
  _uid += 1
  return `char_${_uid}`
}

// Mint a brand-new character. `species` is free-text flavor (a species/archetype
// label like "dragon" or "detective") — purely cosmetic, no mechanical weight.
// Starts with a small seed of fame (a debut is still a debut) and a 'rising'
// trajectory; whether it actually rises is earned by how its cards perform.
export function createCharacter(name, species = '') {
  return {
    id: characterId(),
    name: name.trim() || 'Unnamed Character',
    species: species.trim(),
    debutSetId: null,
    appearances: [], // { cardId, setId, treatment }
    fame: 12,
    trajectory: 'rising', // 'rising' | 'established' | 'fading' | 'icon'
    weeksInTrajectory: 0,
  }
}

// The baseline pop-factor bump a card gets from featuring a character, before
// the treatment's appealMul is applied. A brand-new character (fame ~12) adds
// almost nothing; an icon-tier character (fame 100) adds a hefty built-in draw —
// "a new Pikachu card gets demand no matter how it's designed".
export function famePopBonus(fame, treatmentId = 'debut') {
  const mul = getTreatment(treatmentId).appealMul
  return clamp(fame * 0.28 * mul, 0, 45)
}

// Record a new appearance (called on set release for every signature card that
// features an existing character). Bumps fame by how good a showing it was —
// bigger for a richer treatment and for a genuinely appealing card — and files
// the debut set if this is the character's first printing. Returns the patched
// characters array.
export function recordAppearance(characters, id, { cardId, setId, treatment, popFactors }) {
  return characters.map((c) => {
    if (c.id !== id) return c
    const t = getTreatment(treatment)
    const appeal = ((popFactors?.hype ?? 40) + (popFactors?.artAppeal ?? 40)) / 2
    const bump = clamp(3 + (appeal / 100) * 10 * t.appealMul, 0, 18)
    return {
      ...c,
      debutSetId: c.debutSetId ?? setId,
      appearances: [...c.appearances, { cardId, setId, treatment }],
      fame: clamp(c.fame + bump, 0, 100),
    }
  })
}

// A character's live, unbanned/unrotated cards — the signal fame drift reads.
function liveCardsFor(state, id) {
  return (state.cards ?? []).filter(
    (c) => c.characterId === id && !c.banned && !c.rotated,
  )
}

// -1..+1 read on how a character's cards are doing this week: rich in momentum,
// hype, and punch (with ban pressure biting) reads strongly positive; flat,
// unloved cards read negative. 0 (idle) if the character has no live cards.
function performanceSignal(cards) {
  if (!cards.length) return 0
  let sum = 0
  for (const c of cards) {
    const f = c.popFactors ?? {}
    const momentum = clamp((c.momentum ?? 0) / 3, -1, 1)
    const hype = clamp(((c.hype ?? 0) - 0.4) / 1.2, -1, 1)
    const punch = clamp((f.punch - 50) / 50, -1, 1)
    const banBite = clamp((c.controversy ?? 0) / 100, 0, 1) * -0.4 // heat is a mixed blessing
    sum += momentum * 0.35 + hype * 0.3 + punch * 0.35 + banBite
  }
  return clamp(sum / cards.length, -1, 1)
}

// Advance one character's fame + trajectory a week, given its performance signal.
function driftOne(c, signal, rng) {
  let { fame, trajectory, weeksInTrajectory } = c
  weeksInTrajectory += 1

  // Signal-driven drift, small per week (a career arc, not a coin flip) with a
  // touch of noise so two characters with identical cards don't move in lockstep.
  const base = signal * range(rng, 1.2, 2.4) + range(rng, -0.4, 0.4)

  switch (trajectory) {
    case 'icon': {
      // Icons barely move — fame is a legacy at this point — but sustained neglect
      // (idle or genuinely disliked cards for a long stretch) can end the era.
      fame = clamp(fame + base * 0.25, 0, 100)
      if (fame <= ICON_DEMOTE_FAME && weeksInTrajectory > ICON_DEMOTE_WEEKS) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
      break
    }
    case 'established': {
      fame = clamp(fame + base * 0.6, 0, 100)
      if (fame >= ICON_FAME_FLOOR && weeksInTrajectory > ICON_WEEKS_REQUIRED && rng() < 0.03) {
        trajectory = 'icon'
        weeksInTrajectory = 0
      } else if (fame < 35 && weeksInTrajectory > 30 && rng() < 0.02) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
      break
    }
    case 'fading': {
      fame = clamp(fame + Math.min(base, 0.3), 0, 100) // fading resists a positive jolt, doesn't erase it
      if (fame < 6) fame = clamp(fame + range(rng, 0, 0.3), 0, 100) // floors out rather than vanishing
      if (fame >= ESTABLISHED_FAME_FLOOR && weeksInTrajectory > RECOVERY_WEEKS_REQUIRED) {
        trajectory = 'rising' // a real comeback re-earns established the normal way
        weeksInTrajectory = 0
      }
      break
    }
    default: {
      // rising
      fame = clamp(fame + base, 0, 100)
      if (fame >= ESTABLISHED_FAME_FLOOR && weeksInTrajectory > ESTABLISHED_WEEKS_REQUIRED) {
        trajectory = 'established'
        weeksInTrajectory = 0
      } else if (fame < 8 && weeksInTrajectory > 30 && rng() < 0.03) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
    }
  }

  return { ...c, fame: Math.round(fame * 10) / 10, trajectory, weeksInTrajectory }
}

// Advance every character's fame one week, reading their live cards' performance.
// Mutates next.characters in place, mirroring driftArtists.
export function driftCharacters(next) {
  if (!next.characters?.length) return
  const rng = makeRng(hashSeed(`characters:${next.week}`))
  next.characters = next.characters.map((c) =>
    driftOne(c, performanceSignal(liveCardsFor(next, c.id)), rng),
  )
}
