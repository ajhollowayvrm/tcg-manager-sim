// Meta report — which cards are actually defining the current format.
//
// "Meta-ness" is a card's competitive relevance right now: its raw playability,
// lifted by how much it stands out from the live field (an outlier warps the
// format) and damped as the format gets solved (a figured-out format has a
// settled, smaller meta). This mirrors the threat model the personas and ban
// logic use, surfaced for the player as a readable tier list.

import { clamp } from './simulation.js'
import { visualTier } from './rarities.js'

// Tier thresholds on the 0–100 meta score.
const TIER_DEFINING = 70 // the decks everyone has to beat
const TIER_STRONG = 50 // strong, widely played
const TIER_FRINGE = 30 // playable but not shaping the field

export function metaTier(score) {
  if (score >= TIER_DEFINING) return 'defining'
  if (score >= TIER_STRONG) return 'strong'
  if (score >= TIER_FRINGE) return 'fringe'
  return 'unplayed'
}

export const TIER_LABEL = {
  defining: 'Format-defining',
  strong: 'Strong',
  fringe: 'Fringe',
  unplayed: 'Unplayed',
}

// Score one card's current meta relevance (0–100). Banned/rotated cards are out
// of the format and score 0.
function metaScore(card, fieldAvg, solveLevel) {
  if (card.banned || card.rotated) return 0
  const play = card.popFactors.playability
  // Outlier lift: standing above the field's average playability warps the meta.
  const outlier = clamp((play - fieldAvg) * 0.6, -20, 20)
  // A solved format settles into a tighter meta — relevance compresses toward the
  // strongest few, so mid cards fade. Slight damp as solve climbs.
  const solveDamp = 1 - (solveLevel / 100) * 0.25
  return clamp((play + outlier) * solveDamp, 0, 100)
}

// Build the ranked meta report from game state: live cards scored and sorted,
// each tagged with its tier and set name. Returns [{ id, name, rarity, setName,
// score, tier, playability }], highest first.
export function metaReport(state) {
  const live = state.cards.filter((c) => !c.banned && !c.rotated && !c.promo)
  if (!live.length) return []

  const fieldAvg = live.reduce((s, c) => s + c.popFactors.playability, 0) / live.length
  const setById = new Map(state.sets.map((s) => [s.id, s]))

  return live
    .map((c) => {
      const score = metaScore(c, fieldAvg, state.metagame.solveLevel)
      const set = setById.get(c.setId)
      return {
        id: c.id,
        name: c.name,
        setName: set?.name ?? '—',
        themeId: set?.themeId ?? null,
        rarityTier: visualTier(set?.rarities, c.rarity), // common/uncommon/rare/mythic foil
        playability: c.popFactors.playability,
        score: Math.round(score),
        tier: metaTier(score),
      }
    })
    .sort((a, b) => b.score - a.score)
}
