// The simulation step. Advances the world by one week and returns the next state.
// Pure-ish: takes a state, returns a new state. Keeps React rendering predictable.
//
// The real systems (persona reactions, events, segment drift) still hang off
// this single entry point — see docs/BRIEF.md "Core loop". Market resolution
// is live below.

import { resolveMarket } from './market.js'
import { reactPersonas, applyPersonaEffects } from './personas.js'

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

  // Secondary market: resolve every card's singles & sealed price for the week.
  // resolveMarket reads next.week/metagame (already advanced) and the cards.
  const { cards, movers } = resolveMarket(next)
  next.cards = cards
  next.movers = movers

  // Community personas react to the resolved week: they post to the feedback
  // feed (signal vs noise) and their reactions feed back as hype/ban-pressure
  // on cards, extra solve pressure, and player-base sway for next week.
  applyPersonaEffects(next, reactPersonas(next))

  // TODO: events feed firing curveballs
  // TODO: segment drift driven by metagame dials
  // TODO: auto-slow/pause the clock on interesting moments

  return next
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
