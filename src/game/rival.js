// A rival TCG — a persistent, AMBIENT competitor for attention and shelf
// space (v2 roadmap, "possible" per docs/BRIEF.md — the most speculative item
// in the whole list, so this is deliberately the smallest useful version: a
// strength gauge and a weekly tick, no player-facing actions).
//
// The brief's original framing ("make release timing AND power level
// decisions more adversarial") predates the collector/reseller pivot, which
// removed the competitive engine entirely (no more state.metagame/powerLevel
// dial — see persistence.js v13). This hooks into what's actually live
// instead: `segments.js`'s catalogBuzz (how fresh your shelf looks right
// now), `cadence.js`'s overdueWeeks (release TIMING), and `printIntensity`
// (the live proxy for loud, power-creep-heavy design).
//
// The rival mostly leaves you alone. Every `cadenceWeeks` (10-18, rerolled
// each time), it drops its own release: the staler your catalog and the more
// overdue your own pledge, the bigger the bite it takes out of your casual
// segment (and, once your own design has run loud, a smaller collectors
// nibble too). A strong, established franchise (high reputation) holds
// shelf space better — damping both the rival's growth and its bite.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { catalogBuzz } from './segments.js'
import { PRINT_INTENSITY_NEUTRAL, PRINT_INTENSITY_SPAN } from './config.js'
import { RIVALS, getRival } from './content/rivals.js'

export const RIVAL_HOT_THRESHOLD = 65 // meter reads "danger" above this

const AMBIENT_DRIFT = 0.8 // max strength points/week from ambient catalog-health pressure
const BASE_BITE = 0.03
const BITE_CAP = 0.12
const CADENCE_MIN = 10
const CADENCE_MAX = 18

function rerollCadence(rng) {
  return Math.round(range(rng, CADENCE_MIN, CADENCE_MAX))
}

// Called once at game start.
export function seedRival(rng) {
  const pick = RIVALS[Math.floor(rng() * RIVALS.length)] ?? RIVALS[0]
  return { id: pick.id, strength: 20, lastReleaseWeek: 1, cadenceWeeks: rerollCadence(rng) }
}

// Weekly tick — mutates `next.rival` and, when the rival lands a release,
// `next.segments`/`next.playerBase`/`next.eventsFeed` too. Call from
// advanceWeek after applyCadencePressure (needs the freshly-settled
// overdueWeeks) and before updateFranchiseReputation.
export function applyRival(next) {
  const rival = next.rival
  if (!rival) return
  const rng = makeRng(hashSeed(`rival:${next.week}`))

  const buzz = catalogBuzz(next.sets) // 0-100
  const reputation = next.franchise?.reputation ?? 0
  // A holds-shelf-space damp: an established brand blunts both the rival's
  // ambient growth and (below) how hard a landed release bites.
  const reputationDamp = clamp(1 - reputation / 300, 0.3, 1)

  // --- Ambient drift: nudges up when your catalog is quiet, down when hot ---
  const buzzHealth = (buzz - 50) / 50 // -1 (dead) .. +1 (red hot)
  let strength = clamp(rival.strength - buzzHealth * AMBIENT_DRIFT * reputationDamp, 0, 100)

  // --- Release check ---
  let feed = null
  if (next.week - rival.lastReleaseWeek >= rival.cadenceWeeks) {
    const weakness = clamp(1 - buzz / 100, 0.25, 1.1) // a stale catalog takes it hardest, floor 0.25
    const overdueMult = 1 + clamp(next.cadence?.overdueWeeks ?? 0, 0, 15) * 0.05 // up to +75% at 15+ overdue weeks
    const bite = clamp(BASE_BITE * (strength / 100) * weakness * overdueMult, 0, BITE_CAP)

    const casualLoss = Math.round((next.segments?.casual ?? 0) * bite)
    if (next.segments) next.segments.casual = Math.max(0, next.segments.casual - casualLoss)

    // Only nibbles collectors once your own design has run loud — the "power
    // level" tie-in via the dial that's actually live. Read as a deviation
    // above NEUTRAL rather than against a hard-coded 60: the dial used to sit
    // pinned at 0 in every default run, so this branch never once fired.
    const printIntensity = next.printIntensity ?? PRINT_INTENSITY_NEUTRAL
    const loud = clamp((printIntensity - PRINT_INTENSITY_NEUTRAL) / PRINT_INTENSITY_SPAN, 0, 1)
    let collectorsLoss = 0
    if (loud > 0 && next.segments) {
      const collectorsBite = bite * loud * 0.35
      collectorsLoss = Math.round(next.segments.collectors * collectorsBite)
      next.segments.collectors = Math.max(0, next.segments.collectors - collectorsLoss)
    }
    if (next.segments) next.playerBase = Math.max(0, next.segments.casual + next.segments.collectors)

    const rivalInfo = getRival(rival.id)
    const name = rivalInfo?.name ?? 'A rival'
    feed = collectorsLoss > 0
      ? `${name} drops a hyped set this week — ${casualLoss.toLocaleString()} casual players and ${collectorsLoss.toLocaleString()} collectors drift their way.`
      : `${name} drops a hyped set this week — ${casualLoss.toLocaleString()} casual players drift their way.`

    // A successful poke emboldens them, damped again by your own reputation.
    strength = clamp(strength + bite * 100 * 0.5 * reputationDamp, 0, 100)

    next.rival = { ...rival, strength, lastReleaseWeek: next.week, cadenceWeeks: rerollCadence(rng) }
  } else {
    next.rival = { ...rival, strength }
  }

  if (feed) {
    next.eventsFeed = [{ week: next.week, text: feed, kind: 'community', tone: 'bad' }, ...(next.eventsFeed ?? [])].slice(0, 60)
  }
}
