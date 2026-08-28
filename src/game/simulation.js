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
import { applySegmentDrift, distributeNewPlayers } from './segments.js'
import { clockDirective } from './clock.js'
import { driftArtists } from './artists.js'
import { driftCharacters } from './characters.js'
import { updateFranchiseReputation } from './franchise.js'
import { applyCadencePressure } from './cadence.js'
import { applyRelationships } from './relationships.js'
import { applyDistributors } from './distributors.js'
import { applyGrading } from './grading.js'

// Buzz half-life: how fast a set's own release-buzz fades between drops (tuned
// so a set stays fresh-feeling for a few months, then needs a new release to
// reignite it — see sets.js's set.buzz seeding).
const BUZZ_DECAY_PER_WEEK = 0.965
// Nostalgia-erosion dial: a slow natural cooldown each week (design fatigue
// eases between drops), separate from the relief a pulled-from-print set gives
// (see bans.js's pullFromPrint).
const PRINT_INTENSITY_DECAY_PER_WEEK = 0.25
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

export function advanceWeek(state) {
  const next = structuredClone(state)

  next.week += 1

  // Release-pressure decay: every live set's own buzz fades a little each week
  // (the "the current drop cools, pressuring you to release again" beat — see
  // docs/BRIEF.md's core loop, now per-set instead of a single global dial).
  next.sets = next.sets.map((s) =>
    s.rotated ? s : { ...s, buzz: clamp((s.buzz ?? 50) * BUZZ_DECAY_PER_WEEK, 0, 100) },
  )

  // Nostalgia-erosion dial cools slowly on its own each week (design fatigue
  // eases between drops); a release pushes it up (sets.js), pulling a hot set
  // from print relieves it faster (bans.js).
  next.printIntensity = clamp((next.printIntensity ?? 40) - PRINT_INTENSITY_DECAY_PER_WEEK, 0, 100)

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

  // Channel mix (direct/LGS/big-box/international) feeds scalper heat alongside
  // signed bulk-buyer deals — a big-box-heavy lineup runs hotter than a direct-
  // to-consumer one, even with no distributor deals signed at all. Applied here
  // (before applyDistributors reads/decays heat below) so both sources compound
  // into the one gauge.
  next.scalperHeat = clamp((next.scalperHeat ?? 0) + (rev.channelHeatDelta ?? 0), 0, 100)

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
  // resolveMarket reads next.week (already advanced) and the cards.
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

  // Segment drift: catalog buzz, franchise reputation, character fame, and the
  // nostalgia-erosion dial exert a slow weekly pull on the player segments — a
  // healthy catalog grows the base, a stale/over-designed one bleeds it. Runs
  // after personas/events have settled this week's numbers.
  applySegmentDrift(next)

  // Cadence pledge: if the player is overdue on their promised release rhythm,
  // unrest escalates (sentiment sours, base bleeds). Layers on top of drift.
  applyCadencePressure(next)

  // Relationships: cultivated bonds decay if untended; sponsored creators draw
  // weekly upkeep and amplify, but a soured sponsored name drags the base.
  applyRelationships(next)

  // Character fame: each character's fame drifts off how their live cards are
  // actually doing this week (chase-pull momentum/hype/punch, and any
  // controversy heat) — the persistent "who" behind a card, tracked separately
  // from any one printing. Runs after the market/personas have settled so it
  // reads this week's real numbers.
  driftCharacters(next)

  // Distributors: active bulk-buyers resell and flood the channel, feeding
  // scalper heat. Above the threshold, scalper culture spikes prices short-term
  // but bleeds casuals, sours the community, and risks a bubble pop. Runs after
  // the market/segments/personas have settled so it adjusts the resolved week.
  applyDistributors(next)

  // Grading partners: an active partner ambiently certifies a slice of the
  // market's highest-value eligible singles each week and carries its own
  // scandal risk. Runs alongside distributors — same "living systems" beat.
  applyGrading(next)

  // Regional staggered releases: a lead-region wave applied immediately at
  // release, then a second "wide release" wave lands automatically once its
  // target week arrives (see sets.js/useGame.js RELEASE_SET for how a wave is
  // scheduled). Mirrors the week-gated pattern set.glutUntil already uses.
  if (next.pendingWaves?.length) {
    const due = next.pendingWaves.filter((w) => w.applyWeek <= next.week)
    if (due.length) {
      const segments = { ...next.segments }
      const feedEntries = []
      for (const wave of due) {
        distributeNewPlayers(segments, next.segmentLean, wave.amount)
        // The preview-channel payoff: name whichever of the set's cards moved
        // the most during the lead-region window, off the same priceHistory
        // the ticker's sparkline already renders — no new tracking needed.
        const setCards = next.cards.filter((c) => c.setId === wave.setId && c.priceHistory?.length >= 2)
        const breakout = setCards.reduce((best, c) => {
          const first = c.priceHistory[0]
          const pct = first > 0 ? (c.singlePrice - first) / first : 0
          return !best || pct > best.pct ? { card: c, pct } : best
        }, null)
        const buzzLine = breakout && breakout.pct > 0.1
          ? ` The lead region's early buzz was all about ${breakout.card.name}.`
          : ''
        feedEntries.push({
          week: next.week,
          text: `Wide release: ${wave.leadRegionName ?? wave.setName} hits the rest of the world as “${wave.setName}.”${buzzLine} ${Math.round(wave.amount).toLocaleString()} more players discover the game.`,
        })
      }
      next.segments = segments
      next.playerBase = segments.casual + segments.collectors
      next.eventsFeed = [...feedEntries, ...next.eventsFeed].slice(0, 60)
      next.pendingWaves = next.pendingWaves.filter((w) => w.applyWeek > next.week)
    }
  }

  // Franchise reputation: a slow-moving brand-prestige stat that grows off a
  // sustained healthy cadence + community mood + made-it-big characters, and
  // lifts old sets' collector floor independent of any one card's hype. Needs
  // this week's settled cadence/sentiment/character-fame numbers, so it runs
  // last among the "living systems" ticks.
  updateFranchiseReputation(next)

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
