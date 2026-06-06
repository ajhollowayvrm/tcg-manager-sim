// Bans & rotations — tools the PLAYER wields, with UNPREDICTABLE community
// blowback. See docs/BRIEF.md "Bans & rotations".
//
// Banning a hated, oppressive card can be celebrated or backfire depending on
// hidden community sentiment (was the card actually a problem, or was the
// outrage just loud low-credibility noise?). Rotations restore diversity and
// reset power creep but cost goodwill — especially with collectors holding the
// rotated cards.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { flatten, balanceScore } from './archetypes.js'
import { getTheme } from './content/themes.js'

// How genuinely oppressive a card is, mirroring the persona threat model:
// outlier-ness within its set plus raw power. The player can't see this number
// directly — they infer it from (noisy) ban pressure and chatter. This is what
// determines whether a ban was justified.
function trueThreat(card, cards) {
  const live = cards.filter((c) => !c.banned && !c.rotated)
  const fieldAvg = live.length
    ? live.reduce((s, c) => s + c.popFactors.playability, 0) / live.length
    : 50
  const relative = card.popFactors.playability - fieldAvg
  const absolute = card.popFactors.playability - 65
  return clamp(relative * 0.9 + absolute * 0.7, -60, 60)
}

// ---- Ban a card -----------------------------------------------------------

// Returns reducer patches: { cards, metagame, segments, playerBase, feed,
// banReason } describing the outcome and its blowback.
export function banCard(state, cardId) {
  const card = state.cards.find((c) => c.id === cardId)
  if (!card || card.banned || card.rotated) return null

  const rng = makeRng(hashSeed(`ban:${cardId}:${state.week}`))
  const threat = trueThreat(card, state.cards)

  // Justification blends the card's real threat with how much CREDIBLE pressure
  // it drew (ban pressure only accrues from credible pros/theorycrafters), minus
  // a noise term — so a ban can surprise you in either direction.
  const pressure = card.banPressure ?? 0
  const justification = threat * 0.7 + (pressure - 40) * 0.5 + range(rng, -18, 18)
  const justified = justification > 0

  // Mark the card banned and crater its singles value (no longer tournament-legal).
  const cards = state.cards.map((c) =>
    c.id === cardId
      ? { ...c, banned: true, banPressure: 0, hype: 0, momentum: 0,
          singlePrice: Math.round(c.singlePrice * 0.25 * 100) / 100,
          priceHistory: [...c.priceHistory, Math.round(c.singlePrice * 0.25 * 100) / 100] }
      : c,
  )

  // Metagame: banning a genuinely oppressive card heals the format; banning a
  // fine card just removes a viable option and dents diversity.
  const heal = justified ? 1 : -1
  // Flatten the metashare toward an even field — pulling hardest from the banned
  // card's own archetype (its set's theme lean). A justified ban (it really was
  // an oppressive deck) reopens the field more than an unjustified one.
  const bannedSet = state.sets.find((s) => s.id === card.setId)
  const bannedArchetype = bannedSet ? getTheme(bannedSet.themeId)?.archetypes?.[0] ?? null : null
  const archetypes = flatten(state.metagame.archetypes, justified ? 0.3 : 0.12, bannedArchetype)
  const metagame = {
    diversity: clamp(state.metagame.diversity + heal * range(rng, 6, 14), 0, 100),
    // Banning one card trims power only slightly — it doesn't undo a set's worth
    // of creep, so power still trends up under steady releasing (the core
    // long-term pressure). Tuned via tools/playtest.mjs.
    powerLevel: clamp(state.metagame.powerLevel - (justified ? range(rng, 1, 3) : 0), 0, 100),
    archetypes,
    archetypeBalance: balanceScore(archetypes),
    solveLevel: clamp(state.metagame.solveLevel - range(rng, 8, 16), 0, 100), // format reopens
  }

  // Community goodwill / player base. A celebrated ban wins players; a backfire
  // (banning a fine card the loud crowd hated) loses them. Collectors who held
  // the card are unhappy either way — you destroyed their asset.
  const swing = justified ? range(rng, 0.01, 0.03) : -range(rng, 0.02, 0.05)
  const base = Math.round(state.playerBase * swing)
  const collectorHit = -Math.round(state.segments.collectors * range(rng, 0.02, 0.06))

  const segments = {
    competitive: Math.max(0, state.segments.competitive + Math.round(state.segments.competitive * (justified ? 0.03 : -0.03))),
    casual: Math.max(0, state.segments.casual + Math.round(base * 0.4)),
    collectors: Math.max(0, state.segments.collectors + collectorHit),
  }
  const playerBase = Math.max(0, segments.competitive + segments.casual + segments.collectors)

  // Persona sentiment swings: a justified ban pleases fairness-lovers; an unjust
  // one angers everyone, and collectors always resent a ban a little.
  const personas = state.personas.map((p) => {
    let d = justified ? p.taste.fairness * 6 : -8
    if (p.type === 'collector') d -= 4
    return { ...p, sentiment: clamp(p.sentiment + d, -100, 100) }
  })

  const feed = justified
    ? `You banned ${card.name}. The community largely cheers — the format feels open again.`
    : `You banned ${card.name}. Backlash: many felt it was fine, and you torched collectors' value for nothing.`

  return { cards, metagame, segments, playerBase, personas, feed, justified, banReason: `Banned ${card.name}` }
}

// ---- Rotate the format ----------------------------------------------------

// Rotating retires the oldest live set(s). Restores diversity & resets power
// creep, but costs goodwill — collectors holding rotated cards get hit hardest.
// `count` = how many of the oldest sets to rotate out (default 1).
export function rotateFormat(state, count = 1) {
  const liveSets = state.sets
    .filter((s) => !s.rotated)
    .sort((a, b) => a.releasedWeek - b.releasedWeek)
  // Never rotate the format down to nothing — at least one set must remain.
  if (liveSets.length < 2) return null

  const rotating = liveSets.slice(0, Math.min(count, liveSets.length - 1))
  const rotatingIds = new Set(rotating.map((s) => s.id))
  const rng = makeRng(hashSeed(`rotate:${state.week}:${rotating.map((s) => s.id).join(',')}`))

  const sets = state.sets.map((s) => (rotatingIds.has(s.id) ? { ...s, rotated: true } : s))

  // Rotated cards leave the competitive market — singles soften (they keep some
  // collector/nostalgia value, so not as hard a crater as a ban).
  const cards = state.cards.map((c) =>
    rotatingIds.has(c.setId) && !c.rotated
      ? { ...c, rotated: true, hype: 0, momentum: 0,
          singlePrice: Math.round(c.singlePrice * 0.55 * 100) / 100,
          priceHistory: [...c.priceHistory, Math.round(c.singlePrice * 0.55 * 100) / 100] }
      : c,
  )

  // Big positive on format health: diversity restored, power creep relieved,
  // fresh. Rotation is the strongest creep-relief lever, but it's relief, not a
  // reset to zero — power still ratchets up over a long run of releases.
  // It also strongly re-opens the archetype field (the dominant decks rotate out).
  const archetypes = flatten(state.metagame.archetypes, range(rng, 0.4, 0.6))
  const metagame = {
    diversity: clamp(state.metagame.diversity + range(rng, 12, 22), 0, 100),
    powerLevel: clamp(state.metagame.powerLevel - range(rng, 6, 12), 0, 100),
    archetypes,
    archetypeBalance: balanceScore(archetypes),
    solveLevel: clamp(state.metagame.solveLevel - range(rng, 18, 30), 0, 100),
  }

  // Goodwill cost. Competitive players are split (love fresh, mourn lost decks);
  // collectors take the worst of it (rotated cardboard loses tournament demand).
  // Variance means a rotation can land better or worse than expected.
  const mood = range(rng, -1, 1) // -1 grumpy .. +1 receptive this time
  const compDelta = Math.round(state.segments.competitive * (0.02 + mood * 0.03))
  const casualDelta = Math.round(state.segments.casual * 0.01)
  const collectorDelta = -Math.round(state.segments.collectors * range(rng, 0.05, 0.12))

  const segments = {
    competitive: Math.max(0, state.segments.competitive + compDelta),
    casual: Math.max(0, state.segments.casual + casualDelta),
    collectors: Math.max(0, state.segments.collectors + collectorDelta),
  }
  const playerBase = Math.max(0, segments.competitive + segments.casual + segments.collectors)

  const personas = state.personas.map((p) => {
    // Collectors hate it; fairness/fun lovers appreciate a fresh format.
    let d = p.type === 'collector' ? -10 : (p.taste.fairness + p.taste.fun) * 4 - 2
    return { ...p, sentiment: clamp(p.sentiment + d, -100, 100) }
  })

  const names = rotating.map((s) => s.name).join(', ')
  const feed = `Rotation: ${names} leaves the competitive format. Diversity rebounds and power creep resets — but collectors holding those cards aren't happy.`

  return { sets, cards, metagame, segments, playerBase, personas, feed, rotatedNames: names }
}
