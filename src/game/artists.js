// Artist trajectory — the living career of each artist over a run.
//
// The static roster in content/artists.js is the SEED (identity + starting
// cost/reach/trajectory). The mutable career state lives in state.artists, and
// drifts every week: rising stars get pricier and more famous (and can graduate
// to established, or blow up in an event); established names hold; fading ones
// decline. So commissioning a cheap rising star early — before they pop — is a
// real budget bet, exactly as the brief frames it.
//
// Anything that needs an artist's LIVE value (set cost, art appeal, the UI
// dropdown) goes through currentArtist(state, id); the static getArtist remains
// the fallback when state isn't seeded (e.g. unit tests, the harness).

import { ARTISTS, getArtist } from './content/artists.js'
import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

// Cost bounds so drift can't run away in a long game.
const COST_MIN = 1_500
const COST_MAX = 30_000

// ---- Collector heat ---------------------------------------------------------
// How badly collectors want an artist's work RIGHT NOW, 0-100.
//
// Until this existed, card.artistId was written at print time, spent on a
// one-off art-appeal bonus, and then read by nothing ever again. An illustrator
// was a cost line. Nobody in the community had a favourite artist, no card was
// worth more because of who drew it, and the whole forty-four-name roster with
// its drifting careers existed only to be a price tag with a specialty tag
// attached.
//
// Heat is the collector-side counterpart to a character's fame, and it is built
// the same way: off how the artist's LIVE cards are actually performing, not on
// a random walk. An artist with nothing in print cools toward zero.
const HEAT_DECAY = 0.94 // ~11 weeks to halve with nothing in print
const HEAT_GAIN = 0.16 // how fast a hot week pulls heat toward the signal
// The value premium itself lives in market.js (ARTIST_HEAT_PREMIUM) — see the
// note there on why it is not imported across this module boundary.

// Build the initial per-artist career state from the static roster.
// `perks` carries the prestige unlocks from previous runs (see legacy.js).
// 'seed_artist' promotes the highest-reach rising star straight to established,
// so a returning player starts with one name already at the top of their game.
export function seedArtists(perks = []) {
  const seeded = ARTISTS.map((a) => ({
    id: a.id,
    cost: a.cost,
    reach: a.reach,
    trajectory: a.trajectory,
    weeksInTrajectory: 0,
    heat: 0,
  }))
  if (!perks.includes('seed_artist')) return seeded
  const star = seeded
    .filter((a) => a.trajectory === 'rising')
    .reduce((best, a) => (!best || a.reach > best.reach ? a : best), null)
  if (star) {
    star.trajectory = 'established'
    star.reach = clamp(star.reach + 12, 0, 100)
  }
  return seeded
}

// The artist as the player sees them RIGHT NOW: static identity (name,
// specialty) merged with the live drifted cost/reach/trajectory. Falls back to
// the static seed if career state is missing.
export function currentArtist(state, id) {
  if (!id) return null
  const base = getArtist(id)
  if (!base) return null
  const live = state.artists?.find((a) => a.id === id)
  if (!live) return base
  return { ...base, cost: live.cost, reach: live.reach, trajectory: live.trajectory, heat: live.heat ?? 0 }
}

// Per-trajectory weekly drift. Multipliers/deltas are small — a career moves
// over months, not weeks. Returns the next career record.
function driftOne(a, rng) {
  let { cost, reach, trajectory, weeksInTrajectory } = a
  weeksInTrajectory += 1

  // Transitions are deliberately RARE — a career arc should unfold over a long
  // run, not flip every artist within a few years. Drift magnitudes are gentle
  // and the trajectory-change odds are low, so most of the roster keeps its seed
  // identity across a typical game while a handful genuinely rise or fade.
  switch (trajectory) {
    case 'rising': {
      // Cost and reach climb slowly. Graduate to 'established' only once they're
      // genuinely famous (high reach) AND have been rising a long while.
      cost *= 1 + range(rng, 0.002, 0.009)
      reach = clamp(reach + range(rng, 0.05, 0.3), 0, 100)
      if (reach >= 92 && weeksInTrajectory > 120 && rng() < 0.02) {
        trajectory = 'established'
        weeksInTrajectory = 0
      }
      break
    }
    case 'established': {
      // Roughly flat — small symmetric noise. Only a very long-tenured name has
      // a small chance to start fading.
      cost *= 1 + range(rng, -0.003, 0.004)
      reach = clamp(reach + range(rng, -0.12, 0.1), 0, 100)
      if (weeksInTrajectory > 200 && rng() < 0.01) {
        trajectory = 'fading'
        weeksInTrajectory = 0
      }
      break
    }
    case 'fading': {
      // Cost and reach decline gently; can bottom out and quietly stabilize.
      cost *= 1 - range(rng, 0.002, 0.008)
      reach = clamp(reach - range(rng, 0.1, 0.4), 0, 100)
      if (reach <= 22 && rng() < 0.03) {
        trajectory = 'steady'
        weeksInTrajectory = 0
      }
      break
    }
    default: {
      // steady — gentle noise, a rare chance to catch a wave and start rising.
      cost *= 1 + range(rng, -0.004, 0.004)
      reach = clamp(reach + range(rng, -0.15, 0.15), 0, 100)
      if (weeksInTrajectory > 120 && rng() < 0.008) {
        trajectory = 'rising'
        weeksInTrajectory = 0
      }
    }
  }

  return {
    ...a,
    cost: Math.round(clamp(cost, COST_MIN, COST_MAX) / 100) * 100, // tidy to $100s
    reach: Math.round(reach * 10) / 10,
    trajectory,
    weeksInTrajectory,
  }
}

// Advance every artist's career one week. Mutates next.artists in place. Seeds
// the career state on first run if it's missing (back-compat with old saves).
export function driftArtists(next) {
  if (!next.artists || next.artists.length === 0) {
    next.artists = seedArtists()
  }
  const rng = makeRng(hashSeed(`artists:${next.week}`))
  const heat = heatSignals(next)
  next.artists = next.artists.map((a) => {
    const drifted = driftOne(a, rng)
    const signal = heat.get(a.id)
    const prev = a.heat ?? 0
    // No live cards: cool off. Otherwise ease toward this week's signal.
    const target = signal ?? 0
    return { ...drifted, heat: clamp(prev * HEAT_DECAY + (target - prev * HEAT_DECAY) * HEAT_GAIN, 0, 100) }
  })
}

// This week's collector signal per artist: how well their live cards are doing.
// Built from the same quantities characters.js's performanceSignal reads —
// momentum and hype — so a hot artist and a hot character are hot for the same
// observable reasons. Averaged per artist rather than summed, so an illustrator
// with one adored card is not beaten by one with forty forgettable ones.
function heatSignals(state) {
  const acc = new Map()
  for (const c of state.cards ?? []) {
    if (!c.artistId || c.rotated || c.outOfPrint) continue
    const e = acc.get(c.artistId) ?? { sum: 0, n: 0 }
    // hype is 0..~3 and momentum is a price delta; both are scaled into the
    // same 0..100 space heat lives in.
    e.sum += clamp((c.hype ?? 0) * 30 + clamp((c.momentum ?? 0) * 2, -20, 20), 0, 100)
    e.n += 1
    acc.set(c.artistId, e)
  }
  const out = new Map()
  for (const [id, e] of acc) out.set(id, e.n ? e.sum / e.n : 0)
  return out
}

// Apply a one-off "blow up" to a rising/steady artist (used by the breakout
// event): a sharp cost/reach jump and a graduation to established. Returns a new
// artists array, or the same one if the artist can't be found.
export function blowUpArtist(artists, id, rng) {
  return artists.map((a) =>
    a.id === id
      ? {
          ...a,
          cost: Math.round(clamp(a.cost * range(rng, 1.4, 2.0), COST_MIN, COST_MAX) / 100) * 100,
          reach: clamp(a.reach + range(rng, 8, 18), 0, 100),
          trajectory: 'established',
          weeksInTrajectory: 0,
        }
      : a,
  )
}

// A rising/steady artist below stardom — a candidate to "break out" this week.
export function breakoutCandidate(state, rng) {
  const pool = (state.artists ?? []).filter(
    (a) => (a.trajectory === 'rising' || a.trajectory === 'steady') && a.reach < 80,
  )
  if (!pool.length) return null
  return pool[Math.floor(rng() * pool.length) % pool.length]
}
