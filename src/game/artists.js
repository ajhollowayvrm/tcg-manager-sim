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

// Build the initial per-artist career state from the static roster.
export function seedArtists() {
  return ARTISTS.map((a) => ({
    id: a.id,
    cost: a.cost,
    reach: a.reach,
    trajectory: a.trajectory,
    weeksInTrajectory: 0,
  }))
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
  return { ...base, cost: live.cost, reach: live.reach, trajectory: live.trajectory }
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
  next.artists = next.artists.map((a) => driftOne(a, rng))
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
