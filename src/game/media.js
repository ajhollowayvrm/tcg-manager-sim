// Cross-media ventures — anime/game/film deals (see content/mediaDeals.js).
// The "big, expensive, risky bets" from docs/BRIEF.md's v2 layer C: only ONE
// explicit player action (pitchMediaDeal) — everything after that is
// autonomous, mirroring characters.js's driftCharacters shape exactly (a
// per-entity weekly state machine with no player input). These are framed as
// bets you watch play out, not relationships you tend — a mid-flight lever
// would undercut that framing, so there's deliberately no "cultivate" action.
//
// Lifecycle: pitched → greenlit → live(outcome: 'hit' | 'flop' | 'fell_through').
// A landed HIT is the concrete "massively expand player base and brand
// longevity" payoff — two-part and PERMANENT: a one-time player injection,
// plus a lasting word-of-mouth multiplier (segments.js) and a reputation
// floor (franchise.js) that partially insulates the brand from format churn.
// A FLOP is a real, asymmetric downside: cash lost on top of the sunk pitch
// cost, a small public sentiment ding, and critically NO insulation granted.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp, communitySentiment } from './simulation.js'
import { hotCastSignal, distributeNewPlayers } from './segments.js'
import { getMediaDeal } from './content/mediaDeals.js'

const PITCH_MIN_WEEKS = 4 // minimum weeks before a greenlight roll can even happen
const PITCH_TIMEOUT_WEEKS = 60 // languishing this long without greenlight = quietly falls through
const GREENLIGHT_ODDS_BASE = 0.05 // weekly roll once past PITCH_MIN_WEEKS

// ---- Pitch (the only explicit player action) -------------------------------

// Returns { mediaDeals, cashDelta, feed } or null. One live (unresolved) bet
// per deal archetype at a time.
export function pitchMediaDeal(state, dealId) {
  const deal = getMediaDeal(dealId)
  if (!deal) return null
  if ((state.franchise?.reputation ?? 0) < deal.reputationGate) return null
  if ((state.mediaDeals ?? []).some((d) => d.dealId === dealId && !d.outcome)) return null

  const entry = {
    id: `media_${state.week}_${dealId}`, dealId, kind: deal.kind,
    stage: 'pitched', weeksInStage: 0, startedWeek: state.week,
    productionWeeksTarget: null, outcome: null,
  }
  const mediaDeals = [...(state.mediaDeals ?? []), entry]
  return {
    mediaDeals, cashDelta: -deal.pitchCost,
    feed: `You pitched ${deal.name} — $${deal.pitchCost.toLocaleString()} committed. Now it's a waiting game.`,
  }
}

// ---- Weekly progression (called from advanceWeek) -------------------------

function advanceOne(entry, state, rng) {
  const deal = getMediaDeal(entry.dealId)
  const weeksInStage = entry.weeksInStage + 1

  if (entry.stage === 'pitched') {
    if (weeksInStage >= PITCH_MIN_WEEKS) {
      const reputationFactor = clamp((state.franchise?.reputation ?? 0) / Math.max(1, deal.reputationGate), 0.5, 2)
      if (rng() < GREENLIGHT_ODDS_BASE * reputationFactor) {
        return {
          ...entry, stage: 'greenlit', weeksInStage: 0,
          productionWeeksTarget: Math.round(range(rng, deal.productionWeeksMin, deal.productionWeeksMax)),
        }
      }
    }
    if (weeksInStage >= PITCH_TIMEOUT_WEEKS) {
      return { ...entry, stage: 'live', weeksInStage, outcome: 'fell_through' }
    }
    return { ...entry, stage: entry.stage, weeksInStage }
  }

  if (entry.stage === 'greenlit') {
    if (weeksInStage >= entry.productionWeeksTarget) {
      const fame = hotCastSignal(state.characters) / 400
      const sentimentBonus = (communitySentiment(state.personas) ?? 0) / 500
      const repBonus = ((state.franchise?.reputation ?? 0) - deal.reputationGate) / 250
      const odds = clamp(deal.baseOdds + repBonus + fame + sentimentBonus, 0.05, 0.85)
      const outcome = rng() < odds ? 'hit' : 'flop'
      return { ...entry, stage: 'live', weeksInStage, outcome }
    }
    return { ...entry, stage: entry.stage, weeksInStage }
  }

  return entry // 'live' with an outcome is terminal
}

function applyOutcome(next, entry, feedEntries) {
  const deal = getMediaDeal(entry.dealId)
  if (entry.outcome === 'hit') {
    const rng = makeRng(hashSeed(`media-payoff:${next.week}:${entry.id}`))
    const injection = Math.round(range(rng, deal.hitPlayerInjectionMin, deal.hitPlayerInjectionMax))
    distributeNewPlayers(next.segments, next.segmentLean, injection)
    next.playerBase = next.segments.casual + next.segments.collectors
    next.mediaWomMultiplier = (next.mediaWomMultiplier ?? 1) + deal.womMultiplierBoost
    next.mediaReputationFloor = Math.max(next.mediaReputationFloor ?? 0, deal.reputationFloorBoost)
    // A landed cross-media hit is the single best week the brand can have —
    // and until now it moved no sentiment at all, while a FLOP cost -4. The
    // biggest bet in the game was muted on the upside and only on the upside.
    if (next.personas) {
      next.personas = next.personas.map((p) => ({ ...p, sentiment: clamp(p.sentiment + 5, -100, 100) }))
    }
    feedEntries.push({
      week: next.week, kind: 'media', tone: 'good',
      text: `IT LANDED: ${deal.name} is a hit. ${injection.toLocaleString()} new players discover the game — and the brand's staying power just went up for good.`,
    })
  } else if (entry.outcome === 'flop') {
    next.cash -= deal.flopCost
    if (next.personas) {
      next.personas = next.personas.map((p) => ({ ...p, sentiment: clamp(p.sentiment - 4, -100, 100) }))
    }
    feedEntries.push({
      week: next.week, kind: 'media', tone: 'bad',
      text: `${deal.name} flopped. -$${deal.flopCost.toLocaleString()} written off — no lasting insulation, just the bill.`,
    })
  } else if (entry.outcome === 'fell_through') {
    feedEntries.push({
      week: next.week, kind: 'media', tone: 'neutral',
      text: `${deal.name} quietly fell through development hell. The pitch money's gone, but nobody noticed.`,
    })
  }
}

// Mutates next.mediaDeals (and, on a resolution, next.segments/playerBase/
// cash/personas/mediaWomMultiplier/mediaReputationFloor/eventsFeed) in place.
// Call after characters/personas have settled this week's numbers, and before
// updateFranchiseReputation (which reads the freshly-set floor).
export function advanceMediaDeals(next) {
  if (!next.mediaDeals?.length) return
  const rng = makeRng(hashSeed(`media:${next.week}`))
  const feedEntries = []
  next.mediaDeals = next.mediaDeals.map((entry) => {
    if (entry.outcome) return entry
    const advanced = advanceOne(entry, next, rng)
    if (advanced.outcome && !entry.outcome) applyOutcome(next, advanced, feedEntries)
    return advanced
  })
  if (feedEntries.length) next.eventsFeed = [...feedEntries, ...(next.eventsFeed ?? [])].slice(0, 60)
}
