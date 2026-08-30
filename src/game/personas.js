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
import { packRichnessDelta } from './rarities.js'
import { getTheme } from './content/themes.js'

const FEED_MAX = 60 // cap the feedback feed length

// What counts as an expensive single when a collector sizes one up. Shared
// threshold with events.js's market_correction, which treats the same number as
// the line above which a card is "pricey".
const PRICEY_SINGLE = 60

// How suspicious a card's splashiness reads. A card draws scrutiny when it is
// an OUTLIER — far punchier than the other cards it shares the catalog with —
// not merely because the whole set shouts (a uniformly splashy set just resets
// the baseline). We blend that set-relative standing with a contribution from
// raw absolute standout, so a genuinely over-the-top card reads conspicuous
// regardless of how its setmates look.
//
// `punch` here is PRESENTATION LOUDNESS — how hard a card is pushed relative to
// its shelfmates — not a power level. Nothing in this game is designed around
// what a card does.
function cardThreat(card, fieldAvgPunch) {
  const relative = card.popFactors.punch - fieldAvgPunch // outlier-ness
  const absolute = card.popFactors.punch - 65 // raw "louder than the norm" pressure
  return clamp(relative * 0.9 + absolute * 0.7, -60, 60) // -60 muted .. +60 overbearing
}

// A persona's *perceived* threat = the truth blurred by (1 - credibility).
// High credibility → perception ≈ truth. Low credibility → perception is mostly
// their own noise, biased by how much they care about loudness/fairness.
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

// ---- Grievances -----------------------------------------------------------

// What the community has to COMPLAIN about in a set, read off the actual
// business decisions the player made rather than off card stats.
//
// This exists because the sim had a structural hole: MSRP, print run, pack
// richness and manufactured scarcity are the biggest levers in the game, and
// nothing in this file read any of them. Greed was a pure arithmetic
// optimization — the only cost of a $12 pack was the elasticity curve, and
// nobody ever said a word about it. (The one line in here that mentioned print
// runs fired off `punch`, which has nothing to do with print runs.)
//
// Each grievance is 0 (nobody minds) .. 1 (loudly indefensible). `worst` names
// the loudest one so a take can be specific about what it's angry about.
const GENRE_NORM_PRICE = 4.5 // the booster elasticity reference (products.js)

export function setGrievances(set, cards = []) {
  if (!set) return { worst: null, score: 0, all: {} }
  const price = set.price ?? GENRE_NORM_PRICE
  const printRun = set.printRun ?? 50
  const sellThrough = set.supply > 0 ? clamp((set.sold ?? 0) / set.supply, 0, 1) : 0

  // Gouging: how far MSRP runs past the genre norm. ~$7 starts to sting, $12 is
  // indefensible.
  const gouging = clamp((price - GENRE_NORM_PRICE - 1.5) / 5, 0, 1)

  // Overprinting: a big run that ISN'T selling. A big run that sells through is
  // just a popular set — the grievance is warehouses of unwanted product
  // tanking what people already own.
  const overprint = clamp((printRun - 60) / 40, 0, 1) * clamp((0.65 - sellThrough) / 0.5, 0, 1)

  // Manufactured scarcity: a deliberately thin run that sold out, plus any
  // serialized cards. Serial-numbered chase is the purest form of it.
  const serialCount = cards.filter((c) => c.setId === set.id && c.serialCap).length
  const scarcity = clamp(
    clamp((45 - printRun) / 40, 0, 1) * clamp((sellThrough - 0.5) / 0.4, 0, 1) + serialCount * 0.18,
    0, 1,
  )

  // Stinginess: a pack leaner than the Classic baseline. packRichnessDelta is
  // already computed for cost/appeal — this is the community's read on it.
  // (Guarded: a set with no authored format is a legacy record, not a stingy
  // one — packRichnessDelta reads an absent format as maximally lean.)
  const stingy = set.packFormat ? clamp(-packRichnessDelta(set.packFormat) * 3, 0, 1) : 0

  // NOTE: bloat is deliberately NOT a grievance. It already has three channels
  // of its own — the reviewer's dedicated branch below, the collector-drift
  // term in segments.js, and events.js's bloated_set_backlash. Adding a fourth
  // here triple-counted it and turned a landmark-size set from a trade-off into
  // a death sentence.
  // Gating: a chase card obtainable ONLY inside a $90 collector box is the
  // purest pay-to-own move in the game, and until now it drew no reaction at
  // all — the flag was free to set and invisible to everyone.
  const gated = (set.products ?? []).some((p) => p.kind === 'spc' && p.exclusivePromo) ? 0.45 : 0

  const all = { gouging, overprint, scarcity, stingy, gated }
  let worst = null
  let score = 0
  for (const [k, v] of Object.entries(all)) {
    if (v > score) { worst = k; score = v }
  }
  return { worst, score, all }
}

// The lines the community reaches for, per grievance. Kept beside the data so
// adding a grievance means adding its voice too.
const GRIEVANCE_LINES = {
  gouging: [
    (s, set) => `$${(set.price ?? 0).toFixed(2)} a pack for ${s}. They're taking the mick.`,
    (s) => `${s} is priced like a luxury good and it is not one.`,
    (s, set) => `Genuinely can't recommend ${s} at $${(set.price ?? 0).toFixed(2)}. Wait for a sale.`,
  ],
  overprint: [
    (s) => `${s} is everywhere and nothing in it holds value. They printed way too much.`,
    (s) => `You cannot give ${s} away. Pallets of it sitting in every shop.`,
    (s) => `${s} is a bargain-bin set already. Overprinted, plain and simple.`,
  ],
  scarcity: [
    (s) => `${s} is artificially scarce and they know exactly what they're doing.`,
    (s) => `Nobody can actually buy ${s} at retail. This is manufactured hype.`,
    (s) => `Serial-numbered chase in ${s} — engineered for the secondary market, not for us.`,
  ],
  stingy: [
    (s) => `${s} packs are thin. You feel robbed opening them.`,
    (s) => `Cracking ${s} is miserable. There's nothing IN these packs.`,
    (s) => `${s} has the stingiest pack I've opened in a while.`,
  ],
  gated: [
    (s) => `The best card in ${s} is locked inside the expensive box. That's the whole design.`,
    (s) => `You cannot pull the ${s} exclusive. You can only buy the box. Think about that.`,
    (s) => `${s}'s chase card is paywalled behind a collector box. Grim.`,
  ],
  // Kept for the reviewer's own bloat branch, which reads set.bloat directly.
  bloat: [
    (s, set) => `${s} is bloated. ${set.setLength} cards, and maybe six of them matter.`,
    (s) => `Master-setting ${s} is a second job. Too much filler around too few hits.`,
    (s) => `${s} is padded out. The chase gets lost in the noise.`,
  ],
}

// ---- Take generation ------------------------------------------------------

// Pick one line from a pool, deterministically off the week's RNG.
function pick(rng, pool) {
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

function takeFor(persona, card, perceived, set, rng, displayName, grievances) {
  const strong = perceived > 25
  const busted = perceived > 50
  const weak = perceived < -20
  const t = persona.type
  const c = displayName ?? card?.name
  const s = set?.name ?? 'the set'

  // GRIEVANCES COME FIRST. If the player has done something the community
  // objects to — gouged on price, overprinted, manufactured scarcity, shipped a
  // stingy pack, bloated the set — that's what people talk about, ahead of any
  // individual card.
  //
  // Sensitivity is `taste.fairness`, which until now read no card or set field
  // anywhere in the sim: it was a perception bias and a branch threshold and
  // nothing else. This is the axis's real job — fairness-minded voices are the
  // ones who notice when you're being greedy, and they notice sooner.
  const fairness = persona.taste?.fairness ?? 0
  if (grievances?.worst && set && GRIEVANCE_LINES[grievances.worst]) {
    // Probabilistic, not a hard gate: even a flagrantly greedy set doesn't make
    // EVERY voice say the same thing in the same week. The louder the
    // grievance and the more the persona cares about fairness, the likelier
    // they lead with it — but plenty still talk about cards, so the feed keeps
    // its texture instead of turning into one repeated complaint.
    const notices = (0.25 + fairness * 0.55 + (t === 'reviewer' ? 0.25 : 0)) * grievances.score
    if (rng() < notices) {
      // A loud grievance from a fairness-minded voice is a call to action;
      // otherwise it's a pan.
      const stance = grievances.score > 0.75 && fairness >= 0.4 ? 'alarm' : 'pan'
      return { stance, text: pick(rng, GRIEVANCE_LINES[grievances.worst])(s, set) }
    }
  }

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
    // A collector hypes a card they READ as hot, or one that is already
    // demonstrably expensive. The second half used to test
    // `card.popFactors.value`, a field that does not exist — popFactors carries
    // {punch, rarity, artAppeal, hype} — so it was always undefined and the
    // whole clause was dead. `singlePrice` is the real "this is valuable"
    // signal, and 60 is the same threshold events.js's market_correction uses
    // to decide a single counts as pricey.
    if (perceived > 20 || (card.singlePrice ?? 0) >= PRICEY_SINGLE) return { stance: 'hype', text: pick(rng, [
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
      // Set size the reviewer still reads directly (bloat is also a grievance
      // above, but a TIGHT set is a compliment, which grievances don't model).
      const bloat = set.bloat ?? 0
      const size = set.sizeScore ?? 0
      if (bloat > 0.5 && persona.taste.value >= 0.3) return { stance: 'pan', text: pick(rng, [
        `${s} is bloated. ${set.setLength} cards, and maybe six of them matter.`,
        `Master-setting ${s} is a second job. Too much filler around too few hits.`,
        `${s} is padded out. The chase gets lost in the noise.`,
      ]) }
      if (size <= -0.5) return { stance: 'love', text: pick(rng, [
        `${s} is tight. ${set.setLength} cards, every one earning its slot — a completable set.`,
        `Finally, a set you can actually finish. ${s} respects your binder.`,
      ]) }
      if (perceived > 20) return { stance: 'warn', text: pick(rng, [
        `${s} is loud — gorgeous now, but I worry what it does to last year's cards.`,
        `${s} really shouts. Great on the shelf today; ask me again next year.`,
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
      `${c} IS SO OVER THE TOP AND NOBODY IS TALKING ABOUT IT. read the room`,
      `every card in this era is shouting louder than the last. ${c} is the worst of it`,
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
//   casualDelta — small drift from reviewer sway on a fresh set. Applied to
//                 segments.casual, NOT playerBase: applySegmentDrift recomputes
//                 playerBase from the segments later in the same tick, so
//                 anything written straight to playerBase is discarded.
export function reactPersonas(state) {
  const rng = makeRng(hashSeed(`personas:${state.week}`))
  const latestSet = state.sets.length ? state.sets[state.sets.length - 1] : null
  const latestTheme = latestSet?.themeId ? getTheme(latestSet.themeId) : null
  const setFresh = latestSet && state.week - latestSet.releasedWeek <= 4
  const setCards = latestSet ? state.cards.filter((c) => c.setId === latestSet.id) : []

  const feedItems = []
  const cardEffects = new Map()
  const sentimentById = new Map()
  const reachById = new Map() // weekly reach drift from how accurate a take was
  let casualDelta = 0

  const bump = (id, key, amt) => {
    const e = cardEffects.get(id) ?? { hype: 0, controversy: 0 }
    e[key] += amt
    cardEffects.set(id, e)
  }

  // Only live cards are part of the format — banned/rotated cards are out of the
  // conversation. The "field" average and persona focus both work off live cards.
  const liveCards = state.cards.filter((c) => !c.banned && !c.rotated && !c.promo)
  // What the community has to complain about in the newest set, read off the
  // player's actual business decisions (price, print run, pack richness,
  // manufactured scarcity, bloat) rather than off card stats.
  const grievances = latestSet ? setGrievances(latestSet, state.cards) : null
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
    const take = takeFor(persona, card, perceived, latestSet, rng, displayName, grievances)

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

    // Card-specific effects only land when the take was ABOUT a card.
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
    }

    // Persona's own mood: airing an alarm sours them, enthusiasm lifts them.
    // (warn is mildly negative, so a chronic rage-baiter drifts hostile.)
    //
    // Applies to EVERY take, not just card-focused ones — a reviewer panning a
    // bloated set or praising a tight one is an opinion about the game and has
    // to move their mood, or the whole set-level reaction path is decorative.
    const moodByStance = { pull: -6, alarm: -6, warn: -2.5, pan: -1.5, neutral: 0.5, hype: 4, love: 4 }
    const mood = moodByStance[take.stance] ?? 0

    // Affinity: a set in a theme this voice loves lands warmer, one they're not
    // into lands colder. Soft flavor weight (see content/personas.js) — small
    // next to `mood`, and only kicks in for the ~10 personas that carry an
    // affinity list.
    let affinityShift = 0
    if (latestTheme && persona.affinity?.length) {
      const liked = persona.affinity.includes(latestTheme.id) ||
        latestTheme.tags.some((tag) => persona.affinity.includes(tag))
      affinityShift = liked ? 2 : -1
    }

    sentimentById.set(persona.id, clamp(persona.sentiment + mood + affinityShift, -100, 100))

    // A reviewer's verdict on a fresh set sways the casual base's willingness to
    // buy. Casuals specifically — collectors care about scarcity and legacy, not
    // about what a reviewer thought of this week's set.
    if (persona.type === 'reviewer' && setFresh) {
      const sway = take.stance === 'love' ? 1 : take.stance === 'pan' ? -1.2 : take.stance === 'warn' ? -0.2 : 0
      casualDelta += sway * loud * 60
    }
  }

  // Newest first; keep the feed bounded.
  const merged = [...feedItems.reverse(), ...state.feedbackFeed].slice(0, FEED_MAX)

  return { feedItems: merged, cardEffects, casualDelta, sentimentById, reachById }
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

  // Reviewers sway the casual base. This MUST land on segments, not playerBase:
  // applySegmentDrift (simulation.js, later this same tick) recomputes
  // playerBase from the segments, so a direct playerBase write is thrown away.
  // Mirrors how events.js applies its casualDelta.
  if (result.casualDelta) {
    const seg = next.segments
    seg.casual = Math.max(0, Math.round(seg.casual + result.casualDelta))
    next.playerBase = Math.max(0, seg.casual + seg.collectors)
  }

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
