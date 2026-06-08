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
import { decayBlocks, applyBlockPull } from './blocks.js'
import { driftArtists } from './artists.js'
import { applyCadencePressure } from './cadence.js'
import { applyRelationships } from './relationships.js'
import { applyDistributors } from './distributors.js'

const SOLVE_DECAY_PER_WEEK = 4 // tune so a format stays fresh for a few months
// Community sentiment loss: sentiment runs -100..100. Only a TOTAL revolt (the
// floor) ends the run — short of that, bad sentiment is a recoverable pressure
// that craters your sales, not an instant death.
const SENTIMENT_COLLAPSE = -100

// Bankruptcy ruin thresholds — BOTH must hold (deep debt AND no market). Cash can
// go negative (a loan you service with future sales); it's only fatal once the
// debt is unserviceable and the player base that would service it is gone.
const DEBT_FLOOR = -100_000 // cash below this is a debt you can't dig out of…
const ABANDONED_PLAYERS = 500 // …AND under this many players, there's no recovery
// A separate, catastrophic debt floor: debt this deep is unserviceable on its own
// — weekly interest alone outpaces any plausible recovery, so the studio is
// insolvent regardless of player count. This is what punishes reckless
// overspending (a brief loan stays survivable; a runaway debt spiral does not).
const DEBT_RUIN = -3_000_000

// Weekly interest charged on negative cash (a loan). Compounds, so a short dip is
// cheap but chronic deep debt snowballs toward the bankruptcy floor. Tuned so a
// brief loan is survivable but sustained deep debt (a reckless overspender) gets
// dragged under before sales can dig out.
const DEBT_INTEREST_PER_WEEK = 0.06 // ~6%/wk: -$2M debt → -$120k/wk and compounding

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

  // Live blocks exert a persistent warp on the archetype field: each active block
  // gimmick keeps the format bent toward its lean for its era, then fades as its
  // warp decays. STACKED blocks compound — the coexistence creep that makes a
  // player reach for bans/rotations. Apply the pull, then decay every block's warp
  // one week (an era cools unless a new set prints into the block to refresh it).
  if (next.blocks?.length) {
    next.metagame.archetypes = applyBlockPull(next.metagame.archetypes, next.blocks)
    next.blocks = decayBlocks(next.blocks)
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

  // Debt interest. Negative cash is a LOAN — survivable, but not free. It accrues
  // compounding weekly interest, so a brief dip is cheap while chronic deep debt
  // snowballs and drives you toward the bankruptcy floor. This is what punishes
  // reckless overspending without removing the "you can run a loan" forgiveness.
  if (next.cash < 0) {
    const interest = Math.round(next.cash * DEBT_INTEREST_PER_WEEK) // negative
    next.cash += interest
    next.lastDebtInterest = -interest // positive = cost paid this week
  } else {
    next.lastDebtInterest = 0
  }

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

  // Relationships: cultivated bonds decay if untended; sponsored creators draw
  // weekly upkeep and amplify, but a soured sponsored name drags the base.
  applyRelationships(next)

  // Distributors: active bulk-buyers resell and flood the channel, feeding
  // scalper heat. Above the threshold, scalper culture spikes prices short-term
  // but bleeds casuals, sours the community, and risks a bubble pop. Runs after
  // the market/segments/personas have settled so it adjusts the resolved week.
  applyDistributors(next)

  // Clock attention: classify the week just resolved so the clock can auto-slow
  // or pause on interesting moments and fast-forward through quiet ones. The
  // directive is read by the reducer in useGame; game-over below overrides it.
  next.clock = { ...next.clock, autoEvent: clockDirective(state, next, event) }

  // Loss conditions. Cash, players, and satisfaction are RECOVERABLE pressures,
  // not instant-death lines — a real company can carry debt, rebuild from a tiny
  // base, or win back a soured community. Only two genuinely unrecoverable ruins
  // end a run:
  //   • Bankruptcy ruin — a deep, unserviceable debt AND no market to recover it:
  //     cash below the debt floor AND the player base essentially gone. (Negative
  //     cash alone is just a loan; zero players alone you can still rebuild.)
  //   • Brand ruin — the community has totally revolted (sentiment at the -100
  //     floor). Unrecoverable regardless of cash.
  if (!next.gameOver) {
    const sentiment = communitySentiment(next.personas)
    if (next.cash < DEBT_RUIN) {
      next.gameOver = { reason: 'Insolvent — debt spiralled past saving; the interest alone is unpayable. The studio folds.' }
    } else if (next.cash < DEBT_FLOOR && next.playerBase < ABANDONED_PLAYERS) {
      next.gameOver = { reason: 'Insolvent — buried in debt with no players left to sell to. The studio folds.' }
    } else if (sentiment != null && sentiment <= SENTIMENT_COLLAPSE) {
      next.gameOver = { reason: 'The community revolted — sentiment toward your game hit rock bottom.' }
    }
    if (next.gameOver) {
      next.eventsFeed = [{ week: next.week, text: `GAME OVER: ${next.gameOver.reason}` }, ...next.eventsFeed]
      next.clock = { ...next.clock, reason: next.gameOver.reason, autoEvent: null }
    }
  }

  return next
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
