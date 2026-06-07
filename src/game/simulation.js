// The simulation step. Advances the world by one week and returns the next state.
// Pure-ish: takes a state, returns a new state. Keeps React rendering predictable.
//
// The real systems (persona reactions, events, segment drift) still hang off
// this single entry point — see docs/BRIEF.md "Core loop". Market resolution
// is live below.

import { resolveMarket } from './market.js'
import { reactPersonas, applyPersonaEffects } from './personas.js'
import { resolveRevenue } from './revenue.js'
import { rollEvent, applyEventEffects } from './events.js'
import { applySegmentDrift } from './segments.js'
import { clockDirective } from './clock.js'
import { concentrate, balanceScore } from './archetypes.js'
import { driftArtists } from './artists.js'
import { applyCadencePressure } from './cadence.js'

const SOLVE_DECAY_PER_WEEK = 4 // tune so a format stays fresh for a few months
// Community sentiment loss: if the reach-weighted mood turns deeply hostile, the
// community revolts and the run ends — a third death spiral beyond cash/players.
const SENTIMENT_COLLAPSE = -60

// Reach-weighted average persona sentiment (-100..100). Loud voices count more,
// matching how the rest of the sim weights reach. Null if there are no personas.
export function communitySentiment(personas) {
  if (!personas || !personas.length) return null
  let wSum = 0
  let total = 0
  for (const p of personas) {
    const w = Math.max(1, p.reach) // never zero-weight a voice
    wSum += p.sentiment * w
    total += w
  }
  return total ? wSum / total : null
}
// Diversity erosion: above this solve level the field starts collapsing to a few
// decks; rate is the max weekly diversity loss at fully-solved (solve=100).
const DIVERSITY_EROSION_SOLVE_FLOOR = 40
const DIVERSITY_EROSION_RATE = 5

export function advanceWeek(state) {
  const next = structuredClone(state)

  next.week += 1

  // Format decay: the community solves the meta over time. This is the
  // pressure that pushes the player to release the next set.
  next.metagame.solveLevel = clamp(
    next.metagame.solveLevel + SOLVE_DECAY_PER_WEEK,
    0,
    100,
  )

  // As the format gets solved, the field collapses toward a few dominant decks —
  // diversity erodes. Without this, diversity only ever ratchets UP on release
  // and pegs at 100; this is the downward pressure that makes it a live dial and
  // gives releasing a real diversity-restoring purpose.
  if (next.metagame.solveLevel > DIVERSITY_EROSION_SOLVE_FLOOR) {
    const pressure = (next.metagame.solveLevel - DIVERSITY_EROSION_SOLVE_FLOOR) / 100
    next.metagame.diversity = clamp(next.metagame.diversity - pressure * DIVERSITY_EROSION_RATE, 0, 100)
    // Same pressure concentrates the metashare: the community piles into the best
    // deck, so the field tilts toward its already-dominant archetype as it solves.
    next.metagame.archetypes = concentrate(next.metagame.archetypes, pressure * 0.5)
  }

  // Artist careers drift: rising stars get pricier/more famous (and can
  // graduate or blow up), fading names decline. Commissioning a cheap rising
  // star before they pop is a real budget bet.
  driftArtists(next)

  // Sealed-product revenue: every live set sells packs (capped by its print
  // run). This is the income that funds the next set — or doesn't.
  const rev = resolveRevenue(next)
  next.sets = rev.sets
  next.cash += rev.cashDelta
  next.lastRevenue = { week: next.week, total: rev.cashDelta, units: rev.unitsSold, perSet: rev.perSet }

  // Secondary market: resolve every card's singles & sealed price for the week.
  // resolveMarket reads next.week/metagame (already advanced) and the cards.
  const { cards, movers } = resolveMarket(next)
  next.cards = cards
  next.movers = movers

  // Community personas react to the resolved week: they post to the feedback
  // feed (signal vs noise) and their reactions feed back as hype/ban-pressure
  // on cards, extra solve pressure, and player-base sway for next week.
  applyPersonaEffects(next, reactPersonas(next))

  // Events: a curveball may fire this week (counterfeits, viral moments, supply
  // snags, ban demands…). Effects land on the world; the entry hits the feed.
  const event = rollEvent(next)
  if (event) {
    applyEventEffects(next, event.effects)
    next.eventsFeed = [event.entry, ...next.eventsFeed].slice(0, 60)
  }

  // Re-derive the Archetype Balance dial from the (now settled) distribution, so
  // the scalar the UI/clock/events read always reflects the real metashare after
  // this week's release/solve/ban effects. The distribution is the source of
  // truth; the scalar is a view of how even it is.
  next.metagame.archetypeBalance = balanceScore(next.metagame.archetypes)

  // Segment drift: the four metagame dials exert a slow weekly pull on the
  // player segments — a healthy meta grows the base, a rotting one bleeds it,
  // each segment reacting to the dials it cares about (now including how the
  // metashare is split). Runs after personas/events have settled the dials.
  applySegmentDrift(next)

  // Cadence pledge: if the player is overdue on their promised release rhythm,
  // unrest escalates (sentiment sours, base bleeds). Layers on top of drift.
  applyCadencePressure(next)

  // Clock attention: classify the week just resolved so the clock can auto-slow
  // or pause on interesting moments and fast-forward through quiet ones. The
  // directive is read by the reducer in useGame; game-over below overrides it.
  next.clock = { ...next.clock, autoEvent: clockDirective(state, next, event) }

  // Loss conditions (the death spirals): cash, active player base, or community
  // sentiment collapses. Any one ends the run.
  if (!next.gameOver) {
    const sentiment = communitySentiment(next.personas)
    if (next.cash <= 0) {
      next.gameOver = { reason: 'Bankrupt — you ran out of cash to fund the next set.' }
    } else if (next.playerBase <= 0) {
      next.gameOver = { reason: 'The community is gone — your active player base hit zero.' }
    } else if (sentiment != null && sentiment <= SENTIMENT_COLLAPSE) {
      next.gameOver = { reason: 'The community revolted — sentiment toward your game collapsed.' }
    }
    if (next.gameOver) {
      next.eventsFeed = [{ week: next.week, text: `GAME OVER: ${next.gameOver.reason}` }, ...next.eventsFeed]
      next.clock = { ...next.clock, paused: true, pauseReason: next.gameOver.reason, autoEvent: null }
    }
  }

  return next
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
