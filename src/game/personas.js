// The persona reaction engine. Each week, personas observe the world through
// their taste profile and emit feedback items — and those items cause real
// effects on the market, ban pressure, and community sentiment.
//
// The central mechanic is SIGNAL vs. NOISE (see docs/BRIEF.md):
//   - A persona forms a *take* on a card. How close that take lands to the
//     card's hidden truth is governed by their CREDIBILITY, not their reach.
//     Low-cred voices are essentially guessing (loud, wrong); high-cred voices
//     track reality. Credibility is hidden from the player — learned over a run.
//   - REACH governs how loud/prominent the item is, never how true.
//
// Effects by type:
//   streamer    → hype on a card spikes its market demand (a live pop)
//   competitor  → "broken" call accumulates BAN PRESSURE on the card
//   collector   → hyping a card inflates a bubble (extra hype that can burst)
//   reviewer    → verdict on a fresh set drives sales/goodwill sentiment
//   theorycrafter → solves the format faster (nudges solveLevel) + reads power

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

const FEED_MAX = 60 // cap the feedback feed length

// How "true power" of a card reads to the format. A card is oppressive when it
// is an OUTLIER — far stronger than the other cards it shares the format with —
// not merely because the whole set is strong (a uniformly powerful set just
// resets the baseline). We blend that set-relative standing with a contribution
// from raw absolute power, so a genuinely busted card reads busted regardless
// of how its setmates look. Deliberately NOT keyed off metagame.powerLevel,
// which the releasing set itself inflated.
function cardThreat(card, fieldAvgPlayability) {
  const relative = card.popFactors.playability - fieldAvgPlayability // outlier-ness
  const absolute = card.popFactors.playability - 65 // raw "above curve" pressure
  return clamp(relative * 0.9 + absolute * 0.7, -60, 60) // -60 weak .. +60 busted
}

// A persona's *perceived* threat = the truth blurred by (1 - credibility).
// High credibility → perception ≈ truth. Low credibility → perception is mostly
// their own noise, biased by how much they care about power/fairness.
function perceive(truth, persona, rng) {
  const cred = persona.credibility / 100
  const noise = range(rng, -55, 55) * (1 - cred)
  // Low-cred power-obsessed voices skew toward crying "broken" regardless.
  const bias = (persona.taste.power + persona.taste.fairness) * (1 - cred) * 18
  return clamp(truth * cred + noise + bias, -80, 80)
}

// Pick the card a persona is most likely to fixate on this week, weighted by
// their taste (a collector eyes high-value cards; a competitor eyes strong ones).
// Low-credibility personas have a much noisier focus — they latch onto the
// wrong card more often, which (with a noisy read) is how a rage-baiter ends up
// screaming about a perfectly fine card.
function focusCard(cards, persona, rng) {
  if (cards.length === 0) return null
  const wobble = 30 + (1 - persona.credibility / 100) * 70 // up to ±100 for low-cred
  const scored = cards.map((c) => {
    const f = c.popFactors
    const score =
      persona.taste.power * f.playability +
      persona.taste.value * Math.min(c.singlePrice, 200) * 0.5 +
      persona.taste.art * f.artAppeal +
      persona.taste.fun * f.hype +
      range(rng, 0, wobble)
    return { c, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].c
}

// ---- Take generation ------------------------------------------------------

// Pick one line from a pool, deterministically off the week's RNG.
function pick(rng, pool) {
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

function takeFor(persona, card, perceived, set, rng) {
  const strong = perceived > 25
  const busted = perceived > 50
  const weak = perceived < -20
  const t = persona.type
  const c = card?.name
  const s = set?.name ?? 'the set'

  if (t === 'competitor' || t === 'theorycrafter') {
    if (busted) return { stance: 'ban', text: pick(rng, [
      `${c} is breaking the format. This needs to go.`,
      `There's no answer to ${c}. Ban it.`,
      `Every top deck runs ${c}. That's not a format, that's a tax.`,
    ]) }
    if (strong) return { stance: 'warn', text: pick(rng, [
      `Keeping an eye on ${c} — it's over-rate and warping games.`,
      `${c} is quietly everywhere. Watch this one.`,
      `${c} pushes win rates higher than it should. Noted.`,
    ]) }
    if (weak) return { stance: 'pan', text: pick(rng, [
      `${c} is a trap. Doesn't make the cut.`,
      `Tried ${c}, cut it by round two. Unplayable.`,
    ]) }
    return { stance: 'neutral', text: pick(rng, [
      `${c} looks fair. Format feels healthy so far.`,
      `Reps on ${c} say it's fine. Diversity's holding.`,
      `Nothing scary in the data this week.`,
    ]) }
  }
  if (t === 'collector') {
    if (perceived > 20 || card.popFactors.value > 70) return { stance: 'hype', text: pick(rng, [
      `${c} is the chase of ${s}. Buy now, thank me later.`,
      `Calling it: ${c} is the card people regret not grabbing.`,
      `${c} is moving. Get in before it runs.`,
    ]) }
    if (weak) return { stance: 'pan', text: pick(rng, [
      `${c} is a bulk rare. Don't hold the bag.`,
      `${c} is dead money. Pass.`,
    ]) }
    return { stance: 'neutral', text: pick(rng, [
      `${c} is a slow grower. Patience.`,
      `Sitting on ${c}. No rush either way.`,
    ]) }
  }
  if (t === 'reviewer') {
    if (set) {
      if (perceived > 20) return { stance: 'warn', text: pick(rng, [
        `${s} is powerful — fun now, but watch the creep.`,
        `${s} hits hard. Great today; I worry about next year.`,
      ]) }
      if (weak) return { stance: 'pan', text: pick(rng, [
        `${s} feels flat. Not much to chase here.`,
        `${s} is a skip for me. Low ceiling.`,
      ]) }
      return { stance: 'love', text: pick(rng, [
        `${s} is a clean, well-rounded set. Worth your money.`,
        `${s} nails the fundamentals. Easy recommend.`,
      ]) }
    }
  }
  // streamer — splits on temperament. A fairness-leaning streamer is a
  // rage-baiter who panics about strength (and false-alarms when wrong); a
  // value/fun-leaning one is a hype-merchant who pumps everything.
  const ragey = persona.taste.fairness >= 0.4
  if (ragey) {
    if (strong) return { stance: 'ban', text: pick(rng, [
      `${c} IS BUSTED AND NOBODY IS TALKING ABOUT IT. FIX YOUR GAME`,
      `delete ${c}. unplayable. devs asleep at the wheel`,
    ]) }
    if (weak) return { stance: 'pan', text: pick(rng, [
      `${c}? trash. devs are clueless`,
      `imagine printing ${c}. embarrassing`,
    ]) }
    return { stance: 'warn', text: pick(rng, [
      `whole format feels off rn, just saying`,
      `this meta is cooked and you all know it`,
    ]) }
  }
  if (busted) return { stance: 'ban', text: pick(rng, [
    `YO ${c} IS ABSOLUTELY BUSTED THIS IS UNPLAYABLE`,
    `${c} broke my whole lobby LOL devs pls`,
  ]) }
  if (strong) return { stance: 'hype', text: pick(rng, [
    `${c} is INSANE, pulled three today, chat went wild`,
    `${c} popped off on stream, you NEED this`,
  ]) }
  if (weak) return { stance: 'pan', text: pick(rng, [`${c}? mid. next pack`, `${c} straight to the binder lol`]) }
  return { stance: 'hype', text: pick(rng, [
    `cracked some ${s} on stream, good vibes`,
    `${s} opening was a blast today, ty chat`,
  ]) }
}

// ---- The weekly reaction pass --------------------------------------------

// Returns patches the reducer/sim applies:
//   feedItems   — new feedback feed entries (newest first when prepended)
//   cardEffects — Map<cardId, {hype, banPressure}> deltas to apply
//   solveDelta  — extra solve-level pressure from theorycrafters
//   sentimentById — Map<personaId, newSentiment>
//   playerBaseDelta — small drift from reviewer/streamer sway on a fresh set
export function reactPersonas(state) {
  const rng = makeRng(hashSeed(`personas:${state.week}`))
  const latestSet = state.sets.length ? state.sets[state.sets.length - 1] : null
  const setFresh = latestSet && state.week - latestSet.releasedWeek <= 4
  const setCards = latestSet ? state.cards.filter((c) => c.setId === latestSet.id) : []

  const feedItems = []
  const cardEffects = new Map()
  const sentimentById = new Map()
  let solveDelta = 0
  let playerBaseDelta = 0

  const bump = (id, key, amt) => {
    const e = cardEffects.get(id) ?? { hype: 0, banPressure: 0 }
    e[key] += amt
    cardEffects.set(id, e)
  }

  // Only live cards are part of the format — banned/rotated cards are out of the
  // conversation. The "field" average and persona focus both work off live cards.
  const liveCards = state.cards.filter((c) => !c.banned && !c.rotated)
  const fieldAvg = liveCards.length
    ? liveCards.reduce((s, c) => s + c.popFactors.playability, 0) / liveCards.length
    : 50

  for (const persona of state.personas) {
    // Not everyone speaks every week; louder personas post more often, and a
    // fresh set gets everyone talking.
    const chattiness = persona.reach / 200 + (setFresh ? 0.35 : 0)
    if (rng() > chattiness) continue

    const card = focusCard(liveCards, persona, rng)
    if (!card && !(persona.type === 'reviewer' && latestSet)) continue

    const truth = card ? cardThreat(card, fieldAvg) : 0
    const perceived = perceive(truth, persona, rng)
    const take = takeFor(persona, card, perceived, latestSet, rng)

    feedItems.push({
      week: state.week,
      personaId: persona.id,
      persona: persona.name,
      type: persona.type,
      reach: persona.reach,
      stance: take.stance,
      cardId: card?.id ?? null,
      text: take.text,
    })

    // ---- Effects (scaled by reach — loudness moves players) ----
    const loud = persona.reach / 100

    if (card) {
      if (persona.type === 'streamer' && (take.stance === 'hype')) {
        bump(card.id, 'hype', 0.18 * loud) // live demand pop
      }
      if (persona.type === 'collector' && take.stance === 'hype') {
        bump(card.id, 'hype', 0.22 * loud) // inflate a bubble (may burst later)
      }
      if ((persona.type === 'competitor' || persona.type === 'theorycrafter')) {
        if (take.stance === 'ban') bump(card.id, 'banPressure', 14 * loud)
        else if (take.stance === 'warn') bump(card.id, 'banPressure', 5 * loud)
      }
      // Persona's own mood: airing an alarm sours them, enthusiasm lifts them.
      // (warn is mildly negative, so a chronic rage-baiter drifts hostile.)
      const moodByStance = { ban: -6, warn: -2.5, pan: -1.5, neutral: 0.5, hype: 4, love: 4 }
      const mood = moodByStance[take.stance] ?? 0
      sentimentById.set(persona.id, clamp(persona.sentiment + mood, -100, 100))
    }

    if (persona.type === 'theorycrafter') {
      solveDelta += 0.6 * loud // they crack the format faster
    }

    // A reviewer's verdict on a fresh set sways the casual base's willingness to buy.
    if (persona.type === 'reviewer' && setFresh) {
      const sway = take.stance === 'love' ? 1 : take.stance === 'pan' ? -1.2 : take.stance === 'warn' ? -0.2 : 0
      playerBaseDelta += sway * loud * 60
    }
  }

  // Newest first; keep the feed bounded.
  const merged = [...feedItems.reverse(), ...state.feedbackFeed].slice(0, FEED_MAX)

  return { feedItems: merged, cardEffects, solveDelta, playerBaseDelta, sentimentById }
}

// Apply the persona pass to the next-state in place (called from advanceWeek).
export function applyPersonaEffects(next, result) {
  next.feedbackFeed = result.feedItems

  // Card hype/ban-pressure effects.
  next.cards = next.cards.map((card) => {
    const e = result.cardEffects.get(card.id)
    if (!e) return card
    return {
      ...card,
      hype: clamp((card.hype ?? 0) + e.hype, 0, 3),
      banPressure: clamp((card.banPressure ?? 0) + e.banPressure, 0, 100),
    }
  })

  // Theorycrafters accelerate solve; reviewers/streamers sway the base.
  next.metagame.solveLevel = clamp(next.metagame.solveLevel + result.solveDelta, 0, 100)
  next.playerBase = Math.max(0, Math.round(next.playerBase + result.playerBaseDelta))

  // Persona sentiments.
  if (result.sentimentById.size) {
    next.personas = next.personas.map((p) =>
      result.sentimentById.has(p.id) ? { ...p, sentiment: result.sentimentById.get(p.id) } : p,
    )
  }
}
