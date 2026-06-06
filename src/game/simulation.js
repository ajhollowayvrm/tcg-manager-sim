// The simulation step. Advances the world by one week and returns the next state.
// Pure-ish: takes a state, returns a new state. Keeps React rendering predictable.
//
// v1 stub: this currently only advances the clock and decays the format.
// The real systems (market resolution, persona reactions, events, segment
// drift) hang off this single entry point — see docs/BRIEF.md "Core loop".

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

  // TODO: market resolution (sealed vs singles, variance + momentum)
  // TODO: persona reactions feeding feedbackFeed (signal vs noise)
  // TODO: events feed firing curveballs
  // TODO: segment drift driven by metagame dials
  // TODO: auto-slow/pause the clock on interesting moments

  return next
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
