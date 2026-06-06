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

const SOLVE_DECAY_PER_WEEK = 4 // tune so a format stays fresh for a few months

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

  // TODO: segment drift driven by metagame dials
  // TODO: auto-slow/pause the clock on interesting moments

  // Loss conditions (twin death spirals): cash or active player base hits zero.
  if (!next.gameOver) {
    if (next.cash <= 0) {
      next.gameOver = { reason: 'Bankrupt — you ran out of cash to fund the next set.' }
    } else if (next.playerBase <= 0) {
      next.gameOver = { reason: 'The community is gone — your active player base hit zero.' }
    }
    if (next.gameOver) {
      next.eventsFeed = [{ week: next.week, text: `GAME OVER: ${next.gameOver.reason}` }, ...next.eventsFeed]
      next.clock = { ...next.clock, paused: true, pauseReason: next.gameOver.reason }
    }
  }

  return next
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
