// Live box breaks — sponsor a live-streamed break of a specific live set. See
// content/breaks.js for the program catalogue. This is the collector-hype
// lever now that organized play (competitive) is hidden: it costs cash, grows
// the collector segment, warms sentiment, and lifts hype across the broken
// set's cards, naming its current priciest card as the "biggest hit" for the
// feed — the same flavor a real group break's highlight reel chases.

import { makeRng, hashSeed } from './rng.js'
import { clamp, communitySentiment } from './simulation.js'
import { getBreakProgram } from './content/breaks.js'

// How many breaks in the trailing window before the audience stops believing
// it is a moment. The fourth break in a quarter reads as astroturf.
const SATURATION_WINDOW_WEEKS = 12
const SATURATION_AT = 4

// Returns reducer patches { cards, segments, playerBase, personas, breakHistory,
// cashDelta, feed } or null if invalid. `nonce` varies repeated runs in the same
// week (mirrors the other player-action nonces, e.g. ripNonce).
export function runBreak(state, kind, setId, nonce = 0) {
  const prog = getBreakProgram(kind)
  if (!prog) return null
  const set = state.sets.find((s) => s.id === setId && !s.rotated && (s.supply ?? 0) - (s.sold ?? 0) > 0)
  if (!set) return null
  // Cash can go negative (a loan) — fundable even on credit, like every other spend.

  // This function used to contain NO RANDOMNESS AT ALL despite accepting a
  // `nonce`, so repeated breaks in one week were byte-identical, infinitely
  // repeatable, and every persona's delta had a hard floor of +1.5 — a free
  // sentiment pump limited only by cash, which stops mattering by year three.
  const rng = makeRng(hashSeed(`break:${kind}:${setId}:${state.week}:${nonce}`))

  const history = (state.breakHistory ?? []).filter((w) => state.week - w <= SATURATION_WINDOW_WEEKS)
  const saturation = clamp(history.length / SATURATION_AT, 0, 1)

  // A live stream can be a dud: bad pulls, dead chat, or an audience that has
  // watched you run this exact promotion three times already.
  const mood = communitySentiment(state.personas) ?? 0
  const flopOdds = clamp(0.18 + 0.25 * saturation + (mood < -20 ? 0.15 : 0), 0, 0.7)
  const flopped = rng() < flopOdds

  const setCards = state.cards.filter((c) => c.setId === setId && !c.banned && !c.rotated)
  const headliner = setCards.reduce((a, b) => ((b.singlePrice ?? 0) > (a?.singlePrice ?? -1) ? b : a), null)

  // A broad hype lift across the whole set's live cards — the marketing-moment
  // effect, not a spike on one card. A flop lifts nothing.
  const lift = flopped ? 0 : prog.hypeLift * (1 - saturation * 0.6)
  const cards = lift > 0
    ? state.cards.map((c) =>
        c.setId === setId && !c.banned && !c.rotated
          ? { ...c, hype: clamp((c.hype ?? 0) + lift, 0, 3) }
          : c,
      )
    : state.cards

  // Collectors specifically grow — this is a pure collector-hype channel.
  const collectorDelta = flopped ? 0 : Math.round(state.segments.collectors * prog.collectorBoost * (1 - saturation * 0.7))
  const segments = { ...state.segments, collectors: state.segments.collectors + collectorDelta }
  const playerBase = segments.casual + segments.collectors

  const personas = state.personas.map((p) => {
    // No floor any more. Collector-leaning and art-appreciating voices warm to a
    // break; fairness-minded voices (half the roster) read a sponsored stream as
    // manufactured hype and cool on it even when it lands.
    const affinity = (p.type === 'collector' ? 1.2 : 0)
      + (p.taste?.art ?? 0) * 0.4
      - (p.taste?.fairness ?? 0) * 0.5
    const d = flopped
      ? prog.sentiment * (-0.8 - saturation)
      : prog.sentiment * affinity * (1 - saturation * 0.6)
    return { ...p, sentiment: clamp(p.sentiment + d, -100, 100) }
  })

  const headlineNote = headliner ? `, headlined by ${headliner.name}` : ''
  const feed = flopped
    ? `Your ${prog.name} of ${set.name} fell flat (-$${prog.cost.toLocaleString('en-US')}). Weak pulls, quiet chat${saturation > 0.5 ? ", and an audience that's seen this promotion too often lately" : ''}.`
    : `You sponsored a ${prog.name} of ${set.name}${headlineNote} (-$${prog.cost.toLocaleString('en-US')}). The stream draws real collector buzz.`

  return {
    cards, segments, playerBase, personas,
    breakHistory: [...history, state.week].slice(-20),
    cashDelta: -prog.cost,
    feed,
  }
}
