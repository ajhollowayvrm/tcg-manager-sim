// Live box breaks — sponsor a live-streamed break of a specific live set. See
// content/breaks.js for the program catalogue. This is the collector-hype
// lever now that organized play (competitive) is hidden: it costs cash, grows
// the collector segment, warms sentiment, and lifts hype across the broken
// set's cards, naming its current priciest card as the "biggest hit" for the
// feed — the same flavor a real group break's highlight reel chases.

import { clamp } from './simulation.js'
import { getBreakProgram } from './content/breaks.js'

// Returns reducer patches { cards, segments, playerBase, personas, cashDelta,
// feed } or null if unaffordable / invalid. `nonce` varies repeated runs in
// the same week (mirrors the other player-action nonces, e.g. ripNonce).
export function runBreak(state, kind, setId, nonce = 0) {
  const prog = getBreakProgram(kind)
  if (!prog) return null
  const set = state.sets.find((s) => s.id === setId && !s.rotated && (s.supply ?? 0) - (s.sold ?? 0) > 0)
  if (!set) return null
  // Cash can go negative (a loan) — fundable even on credit, like every other spend.

  const setCards = state.cards.filter((c) => c.setId === setId && !c.banned && !c.rotated)
  const headliner = setCards.reduce((a, b) => ((b.singlePrice ?? 0) > (a?.singlePrice ?? -1) ? b : a), null)

  // A broad hype lift across the whole set's live cards — the marketing-moment
  // effect, not a spike on one card.
  const cards = state.cards.map((c) =>
    c.setId === setId && !c.banned && !c.rotated
      ? { ...c, hype: clamp((c.hype ?? 0) + prog.hypeLift, 0, 3) }
      : c,
  )

  // Collectors specifically grow — this is a pure collector-hype channel.
  const collectorDelta = Math.round(state.segments.collectors * prog.collectorBoost)
  const segments = { ...state.segments, collectors: state.segments.collectors + collectorDelta }
  const playerBase = segments.casual + segments.collectors

  const personas = state.personas.map((p) => {
    // Collector-leaning and art-appreciating voices warm the most to a break.
    const d = prog.sentiment * (0.5 + (p.type === 'collector' ? 0.7 : 0) + (p.taste?.art ?? 0) * 0.4)
    return { ...p, sentiment: clamp(p.sentiment + d, -100, 100) }
  })

  const headlineNote = headliner ? `, headlined by ${headliner.name}` : ''
  const feed = `You sponsored a ${prog.name} of ${set.name}${headlineNote} (-$${prog.cost.toLocaleString('en-US')}). The stream draws real collector buzz.`

  return { cards, segments, playerBase, personas, cashDelta: -prog.cost, feed }
}
