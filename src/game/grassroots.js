// Grassroots — the studio's money to the fans who run things outside the game
// store. Two levers:
//
//   - a STANDING programme, 0..1, charged weekly through overhead.js (sink F).
//     It buys word of mouth (segments.js multiplies discovery by
//     1 + level × GRASSROOTS_WOM_BONUS) and makes the good local-scene events
//     likelier (events.js weights lgs_appreciation and grassroots_showcase by
//     1 + level). It buys no forgiveness — that is the goodwill programme's job.
//   - discrete GRANTS (content/grassroots.js): a one-off cost for a jolt of
//     casual players, a taste-keyed sentiment bump, and buzz on the hottest live
//     set, with a small chance the organiser makes a mess of it. The same shape
//     as relationships.js's sponsorTournament.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { getGrantKind } from './content/grassroots.js'

export const GRASSROOTS_WOM_BONUS = 0.35
const GRANT_HISTORY_MAX = 20

export function grassrootsLevel(state) {
  return clamp(Number(state.grassroots?.level) || 0, 0, 1)
}

// How the standing programme scales the good local-scene events.
export function grassrootsEventWeight(state) {
  return 1 + grassrootsLevel(state)
}

// Why a grant kind cannot be funded right now, or null.
export function grantBlock(state, kindId) {
  const kind = getGrantKind(kindId)
  if (!kind) return 'Unknown grant.'
  const last = [...(state.grassrootsGrants ?? [])].reverse().find((g) => g.kindId === kindId)
  if (last && state.week - last.week < kind.cooldownWeeks) {
    return `Again in ${kind.cooldownWeeks - (state.week - last.week)} weeks.`
  }
  return null
}

function hottestLiveSet(sets) {
  const live = (sets ?? []).filter((s) => !s.rotated && !s.outOfPrint)
  if (!live.length) return null
  return live.reduce((best, s) => (!best || (s.buzz ?? 0) > (best.buzz ?? 0) ? s : best), null)
}

// Returns { grassrootsGrants, segments, playerBase, personas, sets, cashDelta, feed } or null.
export function fundGrant(state, kindId) {
  const kind = getGrantKind(kindId)
  if (!kind || grantBlock(state, kindId)) return null

  const rng = makeRng(hashSeed(`grant:${kindId}:${state.week}`))
  // A volunteer organiser can fumble it. Likelier when the room is already
  // sour — nobody volunteers well for a studio they resent.
  const sentimentNow = (state.personas ?? []).reduce((s, p) => s + p.sentiment, 0) / Math.max(1, (state.personas ?? []).length)
  const backfired = rng() < 0.08 + (sentimentNow < 0 ? 0.08 : 0)

  const segments = { ...state.segments }
  let playerBase = state.playerBase
  if (!backfired) {
    const gained = Math.round(range(rng, kind.casual[0], kind.casual[1]))
    segments.casual = (segments.casual ?? 0) + gained
    playerBase = segments.casual + segments.collectors
  }

  const personas = (state.personas ?? []).map((p) => {
    const cares = (p.taste?.[kind.tasteKey] ?? 0) >= 0.4
    const amt = backfired ? -(cares ? 3 : 1) : (cares ? kind.sentiment : 1)
    return { ...p, sentiment: clamp(p.sentiment + amt, -100, 100) }
  })

  const target = hottestLiveSet(state.sets)
  const sets = target && !backfired
    ? state.sets.map((s) => (s.id === target.id ? { ...s, buzz: clamp((s.buzz ?? 50) + range(rng, kind.buzz[0], kind.buzz[1]), 0, 100) } : s))
    : state.sets

  const grassrootsGrants = [...(state.grassrootsGrants ?? []), { kindId, week: state.week, backfired }].slice(-GRANT_HISTORY_MAX)
  const feed = backfired
    ? `The ${kind.name.toLowerCase()} you funded fell apart — the organiser walked, the venue fell through, and the scene noticed who paid for it.`
    : `You funded a ${kind.name.toLowerCase()} — ${(segments.casual - state.segments.casual).toLocaleString('en-US')} new players find the game through people who run it for the love of it.`

  return { grassrootsGrants, segments, playerBase, personas, sets, cashDelta: -kind.cost, feed }
}
