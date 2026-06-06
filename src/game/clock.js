// Clock attention — decides, after a week resolves, whether the moment deserves
// the player's attention (auto-slow or auto-pause) or is quiet enough to blur
// past (auto-fast-forward). See docs/BRIEF.md "Time system".
//
// The brief's pitch for an endless sim is "quiet stretches compress, interesting
// moments demand attention." We read the just-resolved week against the prior
// state and classify it:
//   pause — a hard stop the player must acknowledge (a card crosses a ban
//           threshold, a real cash/player crisis). Handled like a manual pause.
//   slow  — something worth watching but not stopping for (a sharp market
//           mover, a major event, a notable player swing): drop to 1×.
//   quiet — nothing happened: let the clock run at the fast end.
//
// advanceWeek attaches the directive as next.clock.autoEvent; the reducer in
// useGame applies it (and clears the previous one each tick so it doesn't stick).

// Tunables — thresholds for "this deserves attention."
const BIG_MOVER_PCT = 0.25 // a single jumping/crashing ≥25% in a week
const BAN_PRESSURE_PAUSE = 70 // a card crossing this ban-pressure is a decision point
const PLAYER_SWING_PCT = 0.04 // ±4% of the base in one week is notable
const CASH_CRISIS = 40_000 // dipping under this (from above) is a hard stop
const QUIET_SPEED = 4 // fast-forward speed for nothing-happening weeks

// Event tones that are dramatic enough to slow down for (skip pure-neutral chatter).
const NOTABLE_TONES = new Set(['bad', 'good'])

// Returns { pause?, slow?, quietSpeed?, reason } describing how the clock should
// react to the week just resolved. `prev` is the pre-tick state; `next` is post.
export function clockDirective(prev, next, event) {
  // ---- Hard stops (pause) ----------------------------------------------

  // A card has crossed into ban-decision territory this week (wasn't over the
  // line before). This is a lever the player should consciously weigh.
  const crossed = next.cards.find(
    (c) =>
      !c.banned &&
      !c.rotated &&
      (c.banPressure ?? 0) >= BAN_PRESSURE_PAUSE &&
      (prevPressure(prev, c.id) < BAN_PRESSURE_PAUSE),
  )
  if (crossed) {
    return { pause: true, reason: `${crossed.name} is drawing serious ban pressure — decide what to do.` }
  }

  // Cash just crossed below the crisis line (from above it) — funding is at risk.
  if (next.cash < CASH_CRISIS && prev.cash >= CASH_CRISIS) {
    return { pause: true, reason: `Cash is running low ($${next.cash.toLocaleString()}). Mind your next print run.` }
  }

  // ---- Worth watching (slow to 1×) -------------------------------------

  // A big market mover this week — a card popping or crashing hard.
  const bigMover = (next.movers ?? []).find((m) => Math.abs(m.pct) >= BIG_MOVER_PCT)
  if (bigMover) {
    const dir = bigMover.pct > 0 ? 'spikes' : 'crashes'
    return { slow: true, reason: `${bigMover.name} ${dir} ${Math.round(Math.abs(bigMover.pct) * 100)}% — watch the market.` }
  }

  // A dramatic event fired this week.
  if (event && NOTABLE_TONES.has(event.entry.tone)) {
    return { slow: true, reason: event.entry.text }
  }

  // A notable swing in the active player base (the segment drift / events moved
  // the community meaningfully this week — in either direction).
  if (prev.playerBase > 0) {
    const swing = (next.playerBase - prev.playerBase) / prev.playerBase
    if (Math.abs(swing) >= PLAYER_SWING_PCT) {
      const dir = swing > 0 ? 'surging' : 'sliding'
      return { slow: true, reason: `Player base is ${dir} (${swing > 0 ? '+' : ''}${Math.round(swing * 100)}% this week).` }
    }
  }

  // ---- Quiet week: compress it -----------------------------------------
  return { quietSpeed: QUIET_SPEED }
}

function prevPressure(prev, cardId) {
  const c = prev.cards.find((x) => x.id === cardId)
  return c ? (c.banPressure ?? 0) : 0
}
