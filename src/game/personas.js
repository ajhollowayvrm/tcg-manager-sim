// The persona reaction engine. Each week, personas observe the world through
// their taste profile and emit feedback items — and those items cause real
// effects on the market, controversy heat, and community sentiment.
//
// The central mechanic is SIGNAL vs. NOISE (see docs/BRIEF.md):
//   - A persona forms a *take* on a card. How close that take lands to the
//     card's hidden truth is governed by their CREDIBILITY, not their reach.
//     Low-cred voices are essentially guessing (loud, wrong); high-cred voices
//     track reality. Credibility is hidden from the player — learned over a run.
//   - REACH governs how loud/prominent the item is, never how true.
//
// Effects by type:
//   streamer      → hype on a card spikes its market demand (a live pop)
//   authenticator → skeptical of a card's splashiness; a "get this verified"
//                   call accumulates CONTROVERSY heat on the card
//   collector     → hyping a card inflates a bubble (extra hype that can burst)
//   reviewer      → verdict on a fresh set drives sales/goodwill sentiment
//   analyst       → reads price patterns / population reports; a loud "this is
//                   overvalued" call also accumulates controversy heat

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'

const FEED_MAX = 60 // cap the feedback feed length

// How suspicious a card's splashiness reads. A card draws scrutiny when it is
// an OUTLIER — far punchier than the other cards it shares the catalog with —
// not merely because the whole set is strong (a uniformly splashy set just
// resets the baseline). We blend that set-relative standing with a
// contribution from raw absolute punch, so a genuinely over-the-top card
// reads suspicious regardless of how its setmates look.
function cardThreat(card, fieldAvgPunch) {
  const relative = card.popFactors.punch - fieldAvgPunch // outlier-ness
  const absolute = card.popFactors.punch - 65 // raw "above curve" pressure
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
// their taste (a collector eyes high-value cards; an authenticator eyes splashy ones).
// Low-credibility personas have a much noisier focus — they latch onto the
// wrong card more often, which (with a noisy read) is how a rage-baiter ends up
// screaming about a perfectly fine card.
function focusCard(cards, persona, rng) {
  if (cards.length === 0) return null
  const wobble = 30 + (1 - persona.credibility / 100) * 70 // up to ±100 for low-cred
  const scored = cards.map((c) => {
    const f = c.popFactors
    const score =
      persona.taste.power * f.punch +
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

function takeFor(persona, card, perceived, set, rng, displayName) {
  const strong = perceived > 25
  const busted = perceived > 50
  const weak = perceived < -20
  const t = persona.type
  const c = displayName ?? card?.name
  const s = set?.name ?? 'the set'

  if (t === 'authenticator') {
    if (busted) return { stance: 'pull', text: pick(rng, [
      `${c}'s "scarcity" doesn't add up. This needs independent verification.`,
      `Something's off with ${c}'s numbers. I'd want this pulled and audited.`,
      `Too many red flags on ${c}. Get it authenticated before you pay that price.`,
    ]) }
    if (strong) return { stance: 'warn', text: pick(rng, [
      `Keeping an eye on ${c} — the population count looks thin for how many are moving.`,
      `${c} is quietly everywhere for how "scarce" it's supposed to be. Watch this one.`,
      `${c}'s pull rate doesn't match the odds sheet. Noted.`,
    ]) }
    if (weak) return { stance: 'pan', text: pick(rng, [
      `${c} checks out. Nothing to see here.`,
      `Verified ${c}. It's exactly what it says on the tin.`,
    ]) }
    return { stance: 'neutral', text: pick(rng, [
      `${c} looks legit. The catalog feels honest so far.`,
      `Nothing scary in the population data this week.`,
    ]) }
  }
  if (t === 'analyst') {
    if (busted) return { stance: 'pull', text: pick(rng, [
      `${c} is way overpriced relative to its real scarcity. This is a bubble.`,
      `The spreadsheet says ${c} is a sell. Way ahead of fair value.`,
      `${c}'s chart is a blow-off top waiting to happen.`,
    ]) }
    if (strong) return { stance: 'warn', text: pick(rng, [
      `${c} is running hot — I'd take some profit here.`,
      `${c}'s momentum is strong but stretched. Watch this one.`,
    ]) }
    if (weak) return { stance: 'pan', text: pick(rng, [
      `${c} is a trap buy. Doesn't hold value.`,
      `Modeled ${c}, it's dead money long-term.`,
    ]) }
    return { stance: 'neutral', text: pick(rng, [
      `${c} is fairly priced. Nothing to chase or dump here.`,
      `Reps on ${c} say it's holding steady. Market feels healthy.`,
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
    if (strong) return { stance: 'alarm', text: pick(rng, [
      `${c} IS OBVIOUSLY OVERPRINTED AND NOBODY IS TALKING ABOUT IT. FIX YOUR PRINT RUNS`,
      `they're printing ${c} into the ground. devs asleep at the wheel`,
    ]) }
    if (weak) return { stance: 'pan', text: pick(rng, [
      `${c}? trash. devs are clueless`,
      `imagine printing ${c}. embarrassing`,
    ]) }
    return { stance: 'warn', text: pick(rng, [
      `whole catalog feels off rn, just saying`,
      `this set is cooked and you all know it`,
    ]) }
  }
  if (busted) return { stance: 'alarm', text: pick(rng, [
    `YO ${c} IS ABSOLUTELY INSANE THIS IS TOO GOOD TO BE REAL`,
    `${c} broke my whole binder LOL devs pls`,
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
//   cardEffects — Map<cardId, {hype, controversy}> deltas to apply
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
  const reachById = new Map() // weekly reach drift from how accurate a take was
  let playerBaseDelta = 0

  const bump = (id, key, amt) => {
    const e = cardEffects.get(id) ?? { hype: 0, controversy: 0 }
    e[key] += amt
    cardEffects.set(id, e)
  }

  // Only live cards are part of the format — banned/rotated cards are out of the
  // conversation. The "field" average and persona focus both work off live cards.
  const liveCards = state.cards.filter((c) => !c.banned && !c.rotated && !c.promo)
  const fieldAvg = liveCards.length
    ? liveCards.reduce((s, c) => s + c.popFactors.punch, 0) / liveCards.length
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
    // Once a featured character is famous enough, the community talks about
    // THEM rather than the specific printing — "Charflare is the chase of Set
    // 2" instead of "Emberwing Charflare is...".
    const character = card?.characterId ? state.characters?.find((ch) => ch.id === card.characterId) : null
    const displayName = character && character.fame >= 50 ? character.name : undefined
    const take = takeFor(persona, card, perceived, latestSet, rng, displayName)

    // Reach drift: the community slowly learns who to listen to. A take that
    // tracks reality (perceived close to truth) earns reach; a loud, confidently
    // WRONG take (big perceived gap on a strong opinion) bleeds it. Tiny per
    // week — a career-shaping current over a run, like the artist trajectories.
    if (card) {
      const errorMag = Math.abs(perceived - truth) // 0 = nailed it, ~100 = way off
      const opinionated = Math.abs(perceived) / 80 // confident takes are judged harder
      // Accurate takes earn reach; loud-and-wrong takes bleed it. Scaled so a
      // run produces visibly rising/fading voices (crosses the ±3 trend cue).
      const drift = clamp((25 - errorMag) / 50, -1, 1) * (0.8 + opinionated * 1.2)
      reachById.set(persona.id, (reachById.get(persona.id) ?? 0) + drift)
    }

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
      if ((persona.type === 'authenticator' || persona.type === 'analyst')) {
        if (take.stance === 'pull') bump(card.id, 'controversy', 14 * loud)
        else if (take.stance === 'warn') bump(card.id, 'controversy', 5 * loud)
      }
      // Persona's own mood: airing an alarm sours them, enthusiasm lifts them.
      // (warn is mildly negative, so a chronic rage-baiter drifts hostile.)
      const moodByStance = { pull: -6, alarm: -6, warn: -2.5, pan: -1.5, neutral: 0.5, hype: 4, love: 4 }
      const mood = moodByStance[take.stance] ?? 0
      sentimentById.set(persona.id, clamp(persona.sentiment + mood, -100, 100))
    }

    // A reviewer's verdict on a fresh set sways the casual base's willingness to buy.
    if (persona.type === 'reviewer' && setFresh) {
      const sway = take.stance === 'love' ? 1 : take.stance === 'pan' ? -1.2 : take.stance === 'warn' ? -0.2 : 0
      playerBaseDelta += sway * loud * 60
    }
  }

  // Newest first; keep the feed bounded.
  const merged = [...feedItems.reverse(), ...state.feedbackFeed].slice(0, FEED_MAX)

  return { feedItems: merged, cardEffects, playerBaseDelta, sentimentById, reachById }
}

// Apply the persona pass to the next-state in place (called from advanceWeek).
export function applyPersonaEffects(next, result) {
  next.feedbackFeed = result.feedItems

  // Card hype/controversy effects.
  next.cards = next.cards.map((card) => {
    const e = result.cardEffects.get(card.id)
    if (!e) return card
    return {
      ...card,
      hype: clamp((card.hype ?? 0) + e.hype, 0, 3),
      controversy: clamp((card.controversy ?? 0) + e.controversy, 0, 100),
    }
  })

  // Reviewers/streamers sway the base.
  next.playerBase = Math.max(0, Math.round(next.playerBase + result.playerBaseDelta))

  // Persona sentiments + reach drift (the community learning who to trust).
  next.personas = next.personas.map((p) => {
    const sentiment = result.sentimentById.has(p.id) ? result.sentimentById.get(p.id) : p.sentiment
    const rd = result.reachById.get(p.id) ?? 0
    if (!result.sentimentById.has(p.id) && rd === 0) return p
    // Remember the seed reach once, so the panel can show a ↑/↓ career trend.
    const reachSeed = p.reachSeed ?? p.reach
    const reach = clamp(p.reach + rd, 5, 100)
    return { ...p, sentiment, reach, reachSeed }
  })
}
