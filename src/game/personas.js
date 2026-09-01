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
import { packRichnessDelta, printingOf } from './rarities.js'
import { illustrationContext, illustrationOverusePressure } from './illustrationsets.js'
import { getIllustrationKind } from './content/illustrationsets.js'
import { getArtist } from './content/artists.js'
import { getTheme } from './content/themes.js'
import { getArchetype } from './content/archetypes.js'
import { traitNames } from './content/traits.js'

const FEED_MAX = 60 // cap the feedback feed length

// What counts as an expensive single when a collector sizes one up. Shared
// threshold with events.js's market_correction, which treats the same number as
// the line above which a card is "pricey".
const PRICEY_SINGLE = 60

// The fame at which the community knows a character by name. Below it they talk
// about the printing ("Emberwing Charflare is the chase"); at or above it they
// talk about the CHARACTER ("Charflare is the chase"), and the character-chatter
// pools open up. This was already the gate for the display-name substitution;
// naming it makes the two uses share one number.
const CHARACTER_KNOWN_FAME = 50

// A character famous enough to be discussed with no new card to discuss. Set well
// above the "known" line: a mid-tier character is only news when they print, but
// an icon is a permanent topic. See castChatter below.
const CAST_CHATTER_FAME = 78

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
function focusCard(cards, persona, rng, variants, groups, artistHeat) {
  if (cards.length === 0) return null
  const wobble = 30 + (1 - persona.credibility / 100) * 70 // up to ±100 for low-cred
  const scored = cards.map((c) => {
    const f = c.popFactors
    // A variant trading well above its base copy is the thing a room actually
    // argues about, and price alone under-weights it: the premium is the story,
    // not the absolute number. Art- and value-minded voices notice hardest.
    //
    // Deliberately small. The other taste terms reach ~100 each, so this tops
    // out around 15 — enough to lift a hot alt art into the conversation, not
    // enough to make it the ONLY conversation. At 6× that weight the whole feed
    // became one card, which is not what a community sounds like.
    const v = variants?.get(c.id)
    const variantPull = v
      ? Math.min(v.premium, 6) * 2.5 * (0.4 + persona.taste.value * 0.3 + persona.taste.art * 0.3)
      : 0
    // A card that is part of a designed run is a different kind of talking point
    // — the room discusses the SET, and the card that finishes it hardest of
    // all. Art-minded voices notice most.
    //
    // Capped around 8, deliberately quieter than variantPull's ~15: a live price
    // spread between two printings of one card is an immediate, arguable number,
    // while a group is a slow story. It also adds exactly 0 on a Map miss and
    // draws NO rng of its own — an unconditional extra draw here would shift
    // every subsequent one and silently move the whole balance table.
    const g = groups?.get(c.id)
    const groupPull = g
      ? (0.5 + (g.group.cohesion ?? 0)) * (g.isCapstone ? 6 : 3)
        * (0.4 + (persona.taste?.art ?? 0) * 0.5)
      : 0
    // WHO DREW IT. A room with a favourite illustrator talks about their cards,
    // and until artists carried collector heat there was no way for it to. Small
    // and art-weighted, like the group term. Adds 0 with no artist or no heat,
    // and draws no rng.
    const artistPull = c.artistId
      ? ((artistHeat?.get(c.artistId) ?? 0) / 100) * 8 * (0.3 + (persona.taste?.art ?? 0) * 0.7)
      : 0
    const score =
      persona.taste.power * f.punch +
      persona.taste.value * Math.min(c.singlePrice, 200) * 0.5 +
      persona.taste.art * f.artAppeal +
      persona.taste.fun * f.hype +
      variantPull +
      groupPull +
      artistPull +
      range(rng, 0, wobble)
    return { c, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].c
}

// ---- Variant printings ----------------------------------------------------

// What the community can SEE about an alternate printing: its name, and how far
// it trades above the base card it reprints. The premium is the whole story of
// a variant — a real room does not say "the Alt Art is good", it says "the Alt
// Art is five times the regular copy". A variant nobody wants trades at parity,
// and that is worth saying out loud too: it is the clearest feedback a player
// can get that a printing they paid to produce did not land.
export function variantContext(state) {
  const byId = new Map(state.cards.map((c) => [c.id, c]))
  const setById = new Map(state.sets.map((sx) => [sx.id, sx]))
  const out = new Map()
  for (const card of state.cards) {
    if (!card.variantOf) continue
    const printing = printingOf(setById.get(card.setId)?.rarities, card.rarity)
    if (!printing.isVariant) continue
    const base = byId.get(card.variantOf)
    const basePrice = base?.singlePrice ?? 0
    out.set(card.id, {
      name: printing.variantName,
      basePrice,
      premium: basePrice > 0 ? card.singlePrice / basePrice : 1,
    })
  }
  return out
}

// The premium bands the takes below branch on. A variant at 3× the base copy is
// the card everyone is chasing; one at parity is one nobody noticed.
const VARIANT_HOT = 3
const VARIANT_WARM = 1.6
const VARIANT_FLAT = 1.15

// Below this, a group is a run in name only and the room says so. Set at the
// level a kind's requirements produce when roughly half of them are unmet — a
// deliberate design that lands at 0.5 is not "incoherent", but one thrown
// together from unrelated cards scores well under it.
const ILLUSTRATION_LOOSE = 0.45

// Artist collector heat (artists.js) at which the room talks about the hand
// rather than the card, and the level above which it does so breathlessly.
const ARTIST_NOTICED = 40
const ARTIST_HOT = 70

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

export function setGrievances(set, cards = [], illustrationPressure = 0) {
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

  // Manufactured curation: a studio that packages ordinary cards as a designed
  // run on every single release, or leaves a shelf of half-finished ones.
  //
  // Distinct from `scarcity` above, and the distinction is the point: scarcity
  // is about SUPPLY — thin runs, serial numbering, cards that cannot be had.
  // This is about PACKAGING — the cards are as available as ever, they have just
  // been arranged into a thing you are told to complete. Both are cynical; they
  // are cynical about different levers.
  //
  // Capped at 0.5, just above `gated` (0.45), so it CAN become the loudest
  // complaint but only at genuine spam. It is computed by illustrationsets.js
  // and passed in, because it has to read the whole catalogue: this function is
  // handed one set and would therefore never notice a studio opening a
  // perfectly coherent trio on every release forever.
  const manufactured = clamp(illustrationPressure, 0, 1) * 0.5

  const all = { gouging, overprint, scarcity, stingy, gated, manufactured }
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
  manufactured: [
    (s) => `Every set now has a "run" with a capstone. ${s} is a spreadsheet, not an art department.`,
    (s) => `${s} ships another trio you're told to complete. At some point curation is just a checklist.`,
    (s) => `Half of what I own is one card short of something. ${s} does it again.`,
  ],
  // Kept for the reviewer's own bloat branch, which reads set.bloat directly.
  bloat: [
    (s, set) => `${s} is bloated. ${set.setLength} cards, and maybe six of them matter.`,
    (s) => `Master-setting ${s} is a second job. Too much filler around too few hits.`,
    (s) => `${s} is padded out. The chase gets lost in the noise.`,
  ],
}

// ---- Character chatter ----------------------------------------------------
//
// The community does not talk about a famous character the way it talks about a
// card. It talks about them the way a real fandom does — by their temperament,
// their era, and how tired everyone is of seeing them. These pools are what turns
// a fame number into a cast people get attached to.
//
// Keyed by the ARCHETYPE'S VOICE (see content/archetypes.js) and then by the
// stance the normal take already decided. Nothing here changes a stance, a
// probability or an effect: this layer only swaps the TEXT the item carries. That
// is deliberate — the reaction engine is load-bearing for balance, and rewording
// an item cannot move a number.
//
// Every line receives { name, set, trait }. `trait` is always a real word: a
// character's own trait when they have one, and the voice's house adjective when
// they do not, so no line ever has to guard against a blank.
const VOICE_FALLBACK_TRAIT = {
  warm: 'good-natured', brash: 'cocky', menace: 'ruthless',
  cold: 'clinical', reverent: 'ancient', wry: 'slippery', plain: 'quiet',
}

const CHARACTER_LINES = {
  warm: {
    hype: [
      ({ name, set }) => `${name} is the reason to open ${set}. I don't make the rules.`,
      ({ name, trait }) => `A new ${name} card and they're still as ${trait} as the day they debuted. Bought three.`,
      ({ name }) => `${name} could be printed on a napkin and I would sleeve it.`,
    ],
    love: [
      ({ name }) => `I have been collecting ${name} since the beginning and this is the best they have ever looked.`,
      ({ name, trait }) => `Nobody draws ${name} ${trait} enough. This artist did.`,
    ],
    pan: [
      ({ name }) => `They are overexposing ${name}. Third printing this year and it shows.`,
      ({ name, set }) => `${name} deserved better than what ${set} did with them.`,
    ],
    neutral: [
      ({ name, set }) => `${name} shows up again in ${set}. At this point they're furniture.`,
      ({ name }) => `Another ${name} card. Fine. Nice. Sure.`,
    ],
  },
  brash: {
    hype: [
      ({ name, set }) => `${name} runs ${set}. Everyone else is playing for second.`,
      ({ name, trait }) => `Say what you like about ${name} being ${trait} — the card is a monster.`,
    ],
    pan: [
      ({ name }) => `${name} has been coasting on one good printing for years.`,
      ({ name, trait }) => `${name} is ${trait} and this card is not good enough to justify it.`,
    ],
    neutral: [
      ({ name, set }) => `${name} is in ${set}. Of course they are.`,
    ],
  },
  menace: {
    hype: [
      ({ name, set }) => `${name} is the only interesting thing in ${set} and it isn't close.`,
      ({ name, trait }) => `${name} is still the most ${trait} thing in this game. Long may it continue.`,
      ({ name }) => `Every time they print ${name} the whole set gets meaner. Good.`,
    ],
    pan: [
      ({ name }) => `${name} works because they're rare. This is the fourth one.`,
      ({ name }) => `They've softened ${name}. That's the one thing you cannot do to ${name}.`,
    ],
    warn: [
      ({ name }) => `Careful with ${name} right now — that price is fear, not value.`,
    ],
    neutral: [
      ({ name, set }) => `${name} turns up in ${set} and behaves themselves. Disappointing, frankly.`,
    ],
  },
  cold: {
    hype: [
      ({ name }) => `${name} is the most efficiently designed card in the set. I mean that as praise.`,
      ({ name, trait }) => `${name} remains ${trait}. The card understands this.`,
    ],
    pan: [
      ({ name }) => `${name} has no story and this printing does not give them one.`,
    ],
    neutral: [
      ({ name }) => `${name} is present. That is the entire observation.`,
    ],
  },
  reverent: {
    hype: [
      ({ name, set }) => `They printed ${name} in ${set}. I did not think we would see them again.`,
      ({ name, trait }) => `${name} is ${trait} and the art finally sells it. Grail.`,
    ],
    love: [
      ({ name }) => `${name} does not get printed often. When they do, you buy it.`,
    ],
    pan: [
      ({ name }) => `${name} is supposed to be an event. This was a Tuesday.`,
    ],
    neutral: [
      ({ name }) => `${name} appears again. The mystique erodes a little each time.`,
    ],
  },
  wry: {
    hype: [
      ({ name, trait }) => `${name} is ${trait} and somehow the most valuable card in the set. Love that for them.`,
      ({ name, set }) => `${name} stole ${set} out from under the actual chase card.`,
    ],
    pan: [
      ({ name }) => `${name} is a running joke at this point, and not the funny kind.`,
    ],
    neutral: [
      ({ name }) => `${name} again. They get around.`,
    ],
  },
  // The UNALIGNED voice, and the one that matters most for reach: every
  // character in a save that predates archetypes normalises onto 'unaligned'
  // (see normalizeCharacter), so without this pool the whole cast-chatter
  // feature would be invisible on every run already in progress — which is
  // precisely the run the save VERSION was held at 18 to protect.
  //
  // These lines lean on nothing but the character's own name and trait, because
  // an unaligned character has no archetype for the room to react to.
  plain: {
    hype: [
      ({ name, set }) => `${name} is the card everyone actually wants out of ${set}.`,
      ({ name, trait }) => `Say what you like, ${name} being ${trait} sells cards.`,
      ({ name }) => `${name} is having a moment and I am not going to pretend otherwise.`,
    ],
    love: [
      ({ name }) => `${name} has quietly become the character I collect. No idea when that happened.`,
    ],
    pan: [
      ({ name }) => `${name} is in everything now and it is starting to show.`,
      ({ name, set }) => `${name} didn't need to be in ${set}. They were anyway.`,
    ],
    warn: [
      ({ name }) => `${name} is priced on hype right now. Careful.`,
    ],
    neutral: [
      ({ name, set }) => `${name} turns up in ${set}. No complaints, no fireworks.`,
      ({ name }) => `Another ${name} printing. They are just part of the furniture now.`,
    ],
  },
}

// Swap a take's TEXT for a character line, when the take is about a card that
// features a character the community actually knows by name.
//
// Uses its OWN rng, derived per character and week, rather than the shared weekly
// persona stream. Drawing from the shared stream here would shift every
// subsequent random draw in the reaction loop, which would silently move the
// balance table for a change that is meant to be pure flavor.
// `source` separates the two callers' RNG streams. Without it the in-loop take
// and the standing cast line share every seed input (week, character, persona,
// stance), so a week where the same persona hit the same stance for the same
// character printed the SAME SENTENCE twice in one feed.
function dressWithCharacter(take, character, set, week, personaId, source = 'take') {
  if (!character) return take
  const voice = getArchetype(character.archetypeId).voice
  const pool = CHARACTER_LINES[voice]?.[take.stance]
  if (!pool?.length) return take // no line for this voice and stance — keep the card take
  const rng = makeRng(hashSeed(`castline:${source}:${week}:${character.id}:${personaId}:${take.stance}`))
  const names = traitNames(character.traits)
  const trait = names.length ? pick(rng, names) : (VOICE_FALLBACK_TRAIT[voice] ?? 'quiet')
  return { ...take, text: pick(rng, pool)({ name: character.name, set: set?.name ?? 'the set', trait }) }
}

// ---- Take generation ------------------------------------------------------

// Pick one line from a pool, deterministically off the week's RNG.
function pick(rng, pool) {
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

// What each voice says about an ALTERNATE PRINTING, ahead of their normal card
// take. A variant is a different kind of object from a card: nobody argues about
// whether it is strong, they argue about whether it is worth the multiple. So
// these branch on the premium over the base copy, not on `perceived` punch.
//
// Returns null when this voice has nothing variant-specific to say, and the
// caller falls through to the ordinary take — the feed keeps its texture rather
// than turning into one repeated observation about alt arts.
// What the community says about the HAND behind a card, once that illustrator is
// hot enough for the room to know the name. Until artists carried collector
// heat there was no way for a persona to have a favourite illustrator, which is
// a strange gap in a game about collecting art.
//
// Deliberately short and unhedged — this is how people actually talk about an
// artist they have decided is worth following.
function artistTake(persona, card, artistName, heat, rng, displayName) {
  const c = displayName ?? card.name
  const a = artistName
  if (heat >= ARTIST_HOT) {
    return { stance: 'hype', text: pick(rng, [
      `Anything ${a} touches right now is money. ${c} included.`,
      `${a} is having a year. ${c} is the one I would buy.`,
      `I have stopped reading the card names. If it says ${a}, I want it.`,
    ]) }
  }
  return { stance: 'hype', text: pick(rng, [
    `${a} is quietly becoming the reason to open these. Look at ${c}.`,
    `Nobody is talking about ${a} yet. ${c} is the tell.`,
  ]) }
}

// What the community says about a card that belongs to a designed run. The
// subject is the GROUP, not the card — which is the whole point of the mechanic
// and the thing a card-shaped take cannot express.
//
// Three things are worth saying, and they are the three states a run can be in:
// finished and coherent (the good outcome, and someone has to say so or the
// player never learns it landed), still owed (the anticipation the announcement
// buzz is paid for), and incoherent (a run in name only — the clearest feedback
// that a player paid for direction they did not actually apply).
function illustrationTake(persona, card, entry, rng, displayName) {
  const c = displayName ?? card.name
  const g = entry.group
  const noun = getIllustrationKind(g.kindId).noun
  const have = g.members?.length ?? 0
  const want = g.plannedSize ?? have
  const owed = Math.max(0, want - have)

  if (g.cohesion < ILLUSTRATION_LOOSE) {
    return { stance: 'pan', text: pick(rng, [
      `Calling ${g.name} a ${noun} is a stretch. Different hands, no through-line — they just numbered them together.`,
      `${g.name} is a ${noun} on the packaging and nowhere else. ${c} has nothing to do with the rest of it.`,
      `They want me to chase ${g.name} as a set. It isn't one.`,
    ]) }
  }
  if (g.status === 'abandoned') {
    return { stance: 'pan', text: pick(rng, [
      `${g.name} is never getting finished, is it. ${c} is just a card now.`,
      `Still ${owed} short on ${g.name}. I've stopped expecting it.`,
    ]) }
  }
  if (owed > 0) {
    return { stance: 'hype', text: pick(rng, [
      `${c} is ${have} of ${want} for ${g.name}. I am not going to be normal about the last ${owed === 1 ? 'one' : owed}.`,
      `${g.name} is ${have}/${want} and the binder page has a hole in it. ${c} is gorgeous, and that is the problem.`,
      `Whatever finishes ${g.name} is going to cost a fortune. Buying ${c} now.`,
    ]) }
  }
  if (entry.isCapstone) {
    return { stance: 'hype', text: pick(rng, [
      `${c} is the one that finishes ${g.name}, and it is priced like it.`,
      `${g.name} is complete and ${c} is the card everyone actually needs. Good luck.`,
    ]) }
  }
  return { stance: 'hype', text: pick(rng, [
    `${g.name} all sat together on one page is the best thing they have printed.`,
    `Completed ${g.name} today. ${c} in a binder next to the rest of them — that is the hobby.`,
  ]) }
}

function variantTake(persona, card, variant, set, rng, displayName) {
  const c = displayName ?? card?.name
  const v = variant.name
  const s = set?.name ?? 'the set'
  const an = /^[aeiou]/i.test(v) ? 'an' : 'a' // names are player-authored: "an Alt Art", "a Gold"
  const mult = variant.premium
  const x = mult >= 10 ? Math.round(mult) : Math.round(mult * 10) / 10
  const hot = mult >= VARIANT_HOT
  const warm = mult >= VARIANT_WARM
  const flat = mult < VARIANT_FLAT
  const t = persona.type

  if (t === 'collector') {
    if (hot) return { stance: 'hype', text: pick(rng, [
      `The ${v} ${c} is the only version that matters. Base copies are a placeholder.`,
      `${x}× the regular copy for the ${v} ${c} and it is STILL going up. This is the card of ${s}.`,
      `Sold my base ${c} to fund the ${v}. Only version I want in the binder.`,
    ]) }
    if (warm) return { stance: 'hype', text: pick(rng, [
      `The ${v} ${c} is quietly pulling away from the base copy. ${x}× and climbing.`,
      `${v} ${c} is the sleeper of ${s}. Get one before the spread widens.`,
    ]) }
    if (flat) return { stance: 'pan', text: pick(rng, [
      `Nobody is paying up for the ${v} ${c}. It trades like the base copy — that treatment did not land.`,
      `The ${v} ${c} was supposed to be the chase. It is worth the same as the regular. Awkward.`,
    ]) }
    return null
  }

  if (t === 'analyst') {
    if (hot) return { stance: 'warn', text: pick(rng, [
      `${v} ${c} trades at ${x}× the base printing. That spread IS the set — everything else is filler around it.`,
      `The ${v}/base spread on ${c} is ${x}×. Historically that gap closes hard once supply catches up.`,
    ]) }
    if (flat) return { stance: 'pan', text: pick(rng, [
      `${v} ${c} at ${x}× base is a rounding error. The variant is not doing any work in this set.`,
      `Ran the numbers on ${s}: the ${v} treatment added cost and no premium. That is a loss.`,
    ]) }
    if (warm) return { stance: 'neutral', text: pick(rng, [
      `${v} ${c} sits at ${x}× the base copy. Healthy spread, no bubble in it yet.`,
    ]) }
    return null
  }

  if (t === 'authenticator') {
    if (hot) return { stance: 'warn', text: pick(rng, [
      `At ${x}× base, expect ${v} ${c} fakes. Check the print texture before you pay that.`,
      `${v} ${c} population is thin for the money it is moving. Get yours slabbed.`,
      `Seeing base ${c} copies passed off as the ${v}. Know what you are buying.`,
    ]) }
    return null
  }

  if (t === 'streamer') {
    const ragey = persona.taste.fairness >= 0.4
    if (hot && !ragey) return { stance: 'hype', text: pick(rng, [
      `PULLED THE ${v.toUpperCase()} ${c.toUpperCase()} ON STREAM. chat lost it. ${x}x the base copy`,
      `${v} ${c} hit the mat and i genuinely yelled. best pull of ${s}`,
      `been ripping ${s} all night for the ${v} ${c}. worth every box`,
    ]) }
    if (hot && ragey) return { stance: 'alarm', text: pick(rng, [
      `so the ${v} ${c} is ${x}x the normal one now. this is what chase design does to a hobby`,
      `remember when you just... got the card. now there's ${an} ${v} and it costs ${x}x. cool cool cool`,
    ]) }
    if (flat) return { stance: 'pan', text: pick(rng, [
      `opened a ${v} ${c}. worth the same as the normal one lmao what is the point`,
    ]) }
    return null
  }

  if (t === 'reviewer' && set) {
    if (hot) return { stance: 'love', text: pick(rng, [
      `The ${v} treatment is what ${s} will be remembered for. The ${c} is a genuinely beautiful card.`,
      `${s} understood the assignment on the ${v} cards. Worth chasing, worth owning.`,
    ]) }
    if (flat) return { stance: 'pan', text: pick(rng, [
      `The ${v} cards in ${s} do not justify themselves. A second printing needs a reason to exist.`,
    ]) }
    return null
  }

  return null
}

function takeFor(persona, card, perceived, set, rng, displayName, grievances, variant, group, artist) {
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
      // Flagged so the character-chatter layer leaves it alone. A grievance is
      // about what the PLAYER did to the room, not about who is on the card.
      return { stance, text: pick(rng, GRIEVANCE_LINES[grievances.worst])(s, set), grievance: true }
    }
  }

  // An alternate printing is its own conversation, and it outranks the ordinary
  // card take — a room looking at a card that exists twice at two prices talks
  // about the gap, not about how hard the card hits. Sits BELOW grievances on
  // purpose: a player who has gouged the room does not get to change the
  // subject by printing a pretty alt art.
  //
  // Gated the same way a grievance is, and for the same reason: even a genuinely
  // exciting alt art does not make EVERY voice lead with it in the same week.
  // A hot premium and a value/art-minded persona make it likely; a variant
  // trading near its base copy is barely worth the breath.
  if (variant) {
    const heat = clamp((variant.premium - 1) / (VARIANT_HOT - 1), 0, 1)
    const cares = 0.15 + (persona.taste?.value ?? 0) * 0.3 + (persona.taste?.art ?? 0) * 0.25
    if (rng() < cares * (0.35 + heat * 0.65)) {
      const vt = variantTake(persona, card, variant, set, rng, displayName)
      if (vt) return vt
    }
  }

  // Illustration-set take. Sits BELOW the variant branch, and the ordering is
  // grievance > variant premium > group > card. A live price spread between two
  // printings of one card is an immediate, arguable number; a group is a slower
  // story, and a room with a real complaint leads with the complaint.
  //
  // Gated the same probabilistic way, so even a beautiful run does not make
  // every voice lead with it in the same week. Art-minded personas care most,
  // and an unfinished run is talked about harder than a finished one — the hole
  // in the page is the thing people post about.
  if (group) {
    const owed = Math.max(0, (group.group.plannedSize ?? 0) - (group.group.members?.length ?? 0))
    const cares = 0.12 + (persona.taste?.art ?? 0) * 0.35 + (persona.taste?.fun ?? 0) * 0.1
    const heat = owed > 0 ? 0.85 : 0.5
    if (rng() < cares * heat) {
      const it = illustrationTake(persona, card, group, rng, displayName)
      if (it) return it
    }
  }

  // The illustrator, below the group. A room that has noticed an artist talks
  // about them, but a designed run they are part of is the bigger story, and a
  // live price spread is bigger still.
  if (card && artist && artist.heat >= ARTIST_NOTICED) {
    const cares = 0.1 + (persona.taste?.art ?? 0) * 0.4
    if (rng() < cares * (0.3 + (artist.heat / 100) * 0.7)) {
      const at = artistTake(persona, card, artist.name, artist.heat, rng, displayName)
      if (at) return at
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
  // Priced once for the whole week: every take that lands on a variant reads
  // the same premium, so the room agrees with itself about what a card is worth.
  const variants = variantContext(state)
  // What the community has to complain about in the newest set, read off the
  // player's actual business decisions (price, print run, pack richness,
  // manufactured scarcity, bloat) rather than off card stats.
  // Priced once for the week, like `variants` above: every take that lands on a
  // group member reads the same group, so the room agrees with itself.
  const groups = illustrationContext(state)
  // Collector heat per illustrator, indexed once for the week (artists.js).
  const artistHeat = new Map((state.artists ?? []).map((a) => [a.id, a.heat ?? 0]))
  const grievances = latestSet
    ? setGrievances(latestSet, state.cards, illustrationOverusePressure(state))
    : null
  const fieldAvg = liveCards.length
    ? liveCards.reduce((s, c) => s + c.popFactors.punch, 0) / liveCards.length
    : 50

  for (const persona of state.personas) {
    // Not everyone speaks every week; louder personas post more often, and a
    // fresh set gets everyone talking.
    const chattiness = persona.reach / 200 + (setFresh ? 0.35 : 0)
    if (rng() > chattiness) continue

    const card = focusCard(liveCards, persona, rng, variants, groups, artistHeat)
    if (!card && !(persona.type === 'reviewer' && latestSet)) continue

    const truth = card ? cardThreat(card, fieldAvg) : 0
    const perceived = perceive(truth, persona, rng)
    // Once a featured character is famous enough, the community talks about
    // THEM rather than the specific printing — "Charflare is the chase of Set
    // 2" instead of "Emberwing Charflare is...".
    const character = card?.characterId ? state.characters?.find((ch) => ch.id === card.characterId) : null
    const known = character && character.fame >= CHARACTER_KNOWN_FAME ? character : null
    const displayName = known ? known.name : undefined
    const variant = card ? variants.get(card.id) : null
    const group = card ? groups.get(card.id) : null
    // The illustrator behind the focused card, if the room has noticed them.
    const artistOfCard = card?.artistId
      ? { name: getArtist(card.artistId)?.name, heat: artistHeat.get(card.artistId) ?? 0 }
      : null
    const base = takeFor(persona, card, perceived, latestSet, rng, displayName, grievances, variant, group, artistOfCard?.name ? artistOfCard : null)
    // A known character does not just lend their NAME to a card take — the
    // community talks about them in their own right, in the voice their archetype
    // earns. Falls back to the card take whenever that voice has nothing to say
    // about this stance. A grievance take is left alone: when the player has
    // gouged the room, the room is not talking about the cast.
    const take = base.grievance
      ? base
      : dressWithCharacter(base, known, latestSet, state.week, persona.id)

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

  // A truly famous character is a standing topic, not just a release-week one.
  // At most one such line per week, so the cast never crowds out the feed.
  const cast = castChatter(state)
  if (cast) feedItems.push(cast)

  // Newest first; keep the feed bounded.
  const merged = [...feedItems.reverse(), ...state.feedbackFeed].slice(0, FEED_MAX)

  return { feedItems: merged, cardEffects, casualDelta, sentimentById, reachById }
}

// One line a week about a character famous enough to be discussed with nothing
// new to discuss — the thing that makes a cast feel like it exists between
// releases rather than only on release week.
//
// Carries NO effects at all: it never touches a card, a sentiment or a reach.
// The reaction loop's effects are all guarded on a focus card, and this item has
// none, so the balance table cannot move because of it. It runs on its own
// derived rng for the same reason dressWithCharacter does.
function castChatter(state) {
  const famous = (state.characters ?? []).filter((c) => c.fame >= CAST_CHATTER_FAME)
  if (!famous.length || !state.personas?.length) return null

  const rng = makeRng(hashSeed(`castchatter:${state.week}`))
  // Not every week. A standing topic that reappears weekly stops being one.
  if (rng() > 0.3) return null

  const character = pick(rng, famous)
  const persona = pick(rng, state.personas)
  const latestSet = state.sets.length ? state.sets[state.sets.length - 1] : null
  // Between releases the room is warm on a character it loves and bored of one
  // it has seen too much of. Trajectory is the honest read on which it is.
  const stance = character.trajectory === 'fading' ? 'pan'
    : character.trajectory === 'icon' ? 'hype'
    : 'neutral'
  const dressed = dressWithCharacter({ stance, text: null }, character, latestSet, state.week, persona.id, 'cast')
  if (!dressed.text) return null // this voice has no line for that stance

  return {
    week: state.week,
    personaId: persona.id,
    persona: persona.name,
    type: persona.type,
    reach: persona.reach,
    stance,
    cardId: null,
    text: dressed.text,
  }
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
