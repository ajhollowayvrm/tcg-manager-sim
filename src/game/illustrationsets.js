// Illustration sets — groups of cards that go together, in the art and in the
// collecting. See content/illustrationsets.js for what the KINDS mean; this file
// is the engine: how coherent a group is, what that is worth, and what happens
// to a group the studio announces and never finishes.
//
// The nearest thing already in the codebase is a rarity VARIANT (rarities.js): a
// thing the player authors on a draft that the whole sim then reads, with a real
// premium behind it (variantScarcityPremium) and a real community read on it
// (personas.js's variantContext/variantPull). This is shaped the same way on
// purpose.
//
// FOUR DESIGN RULES, each of which fixed something that would otherwise be a bug
// rather than a preference:
//
//   1. MEMBERSHIP IS NOT ON THE CARD. A group stores its member list; nothing is
//      written back onto card records. The save is ~92% cards (persistence.js's
//      CARD_DEFAULTS exists purely to stop paying for `"characterId":null` six
//      thousand times), and a second copy of an index is a second thing to drift.
//      illustrationContext() builds the lookup once per week instead, exactly as
//      variantContext already does.
//
//   2. COHESION IS FROZEN ON WRITE. It is scored when members change — at
//      release — and never recomputed on a tick. Recomputing weekly would mean a
//      pass that has to run BEFORE resolveMarket (fairValue reads it) while
//      wanting THIS week's prices, which is circular. Freezing it also gives the
//      right causality: a group's status changing this week moves next week's
//      prices, the same argument simulation.js already makes for running
//      applyDistributors ahead of the market.
//
//   3. THE HALO MOVES `hype`, NEVER PRICE OR MOMENTUM. stepCard already carries
//      memory (`momentum = momentum*0.5 + delta*0.5`), so coupling N members
//      through a shared price move feeds each member's momentum and raises next
//      week's mean — a runaway. `card.hype` decays 14%/week against a hard cap
//      and is the designed bubble channel, so it is bounded by construction.
//
//   4. NO FAME TERM. It is tempting to make a character carried by a coherent
//      group build fame faster. It already does: the cohesion lift raises
//      artAppeal and hype, which raise price and momentum, and
//      characters.js's performanceSignal reads exactly momentum, hype and punch.
//      Adding an explicit term double-counts it — and fame feeds famePopBonus
//      (+45, the largest additive in the game) into the NEXT member of the same
//      group, which is undamped positive feedback. The connection is expressed
//      in the UI and the community chatter instead. revenue.js:62 and
//      personas.js:187 already refuse two other terms for this same reason.
//
// This module imports only rng.js, rarities.js and two content tables. It
// deliberately does NOT import clamp from simulation.js: market.js and
// characters.js already close import cycles with that module and they survive
// only because clamp is a hoisted function declaration. A third one is not worth
// the risk, so there is a module-local clamp below — the same call rarities.js
// makes with its own clampUnit.

import { getRarity } from './rarities.js'
import { castIdsOf } from './cast.js'
import { getArtist } from './content/artists.js'
import { makeRng, hashSeed } from './rng.js'
import {
  getIllustrationKind,
  MAX_CAPSTONE_WEIGHT,
} from './content/illustrationsets.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// ---- Tuning ---------------------------------------------------------------
// Every number here is anchored against something that already exists, because
// an illustration set has to be worth authoring without being worth authoring
// EVERY time. The existing anchors: artist specialty match +20 art appeal, art
// director +12, character archetype match +10, art notes +6, flavour text +4,
// famePopBonus up to +45; serialLift up to 15x, variantScarcityPremium up to
// 12x, gradedLift ~1.4x, a treatment card 1.25x; spotlightAppeal 0..0.12.

// Art-appeal and hype added at print time to an ordinary member at full
// cohesion, before the capstone weighting. Sits between the archetype match
// (+10) and the artist specialty match (+20).
//
// It has to be SMALL, and this is the sharpest constraint on the whole feature:
// an illustrator suite is BY CONSTRUCTION one artist across several cards, and
// that artist is already being paid +20 per card by the specialty match in
// popFactors. A generous cohesion bonus would pay twice for one decision and
// make the suite kind strictly dominant over every other kind in the roster.
const POP_LIFT = 9

// The half of the print-time lift that survives the clamp. popFactors ends in
// `clamp(artAppeal + fameBonus + archetypeMatch, 0, 100)`, and the capstone is
// exactly the card most likely to be pinned there already: an art-director
// match (+12), a specialty match (+20), an on-theme archetype (+10) and an
// icon-treatment famous character (+45) reach the ceiling on their own. A lift
// added only to popFactors is therefore silently ZERO on the one card this
// mechanic exists to elevate.
//
// sets.js:1012 hit this exact bug with the cover-character bonus and fixed it
// the same way — by moving the effect outside the per-face cap. Here the second
// home is the card's `hype` SEED, whose ceiling is ~3 rather than 100. Compare
// the neighbours it sits beside: a prerelease-pullable chase is x1.3, a spotlit
// card x1.25.
const HYPE_SEED_LIFT = 0.35
const HYPE_SEED_MAX = 1.6

// The completion premium in fairValue, as the multiplier at FULL cohesion on a
// COMPLETE group. Split so that a concentrated kind (a family line) pays its
// capstone hard while a spread kind (a triptych, a cycle) pays every panel.
//
// The ceiling is deliberately far below serialLift (15x) and
// variantScarcityPremium (12x), and that is a statement about what this
// mechanic IS: a group is a DESIGN AND MARKETING act, not a scarcity act.
// Nothing about grouping three cards reduces the number of copies printed. It
// lands just above a treatment card (1.25x) and around gradedLift. Taken past
// roughly 2.5x the dominant strategy collapses into "every set is a five-card
// group with a capstone", which the manufactured grievance would then have to
// paper over — better not to create the pressure.
const CAPSTONE_PREMIUM_BASE = 0.45 // a fully-spread kind's capstone: 1.45x
const CAPSTONE_PREMIUM_CONC = 0.35 // ...rising to 1.80x for a family line
const MEMBER_PREMIUM_BASE = 0.30 // a fully-spread kind's members: 1.30x
const MEMBER_PREMIUM_CONC = 0.12 // ...falling to 1.18x for a family line

// How much harder a group is to finish once its earlier members are gone. This
// is the whole point of letting a group span releases: by the time a capstone
// lands forty weeks later, member one's set is out of print or sold through, so
// the run is harder to complete and the survivors are more wanted — not less.
// Without this the cross-set case is an accounting inconvenience; with it, it is
// the most interesting version of the mechanic.
const OUT_OF_REACH_PREMIUM = 0.15

// The most one week of group halo can move a member's hype. Deliberately below a
// loud collector persona's bump (0.22 x reach/100) and below a god pack (+0.15):
// a group is a slow story that makes its members move TOGETHER, not a spike.
const HALO_MAX = 0.1

// Sealed-demand lift per coherent group in a set, and the cap across all of
// them. The CAP matches spotlightAppeal's 0..0.12 exactly — both are marketing
// acts of comparable size and neither should be able to run away.
//
// The per-group rate is higher than a single reveal's, though, and measurement
// forced the question. At 0.04 a coherent trio bought 0.032 of appeal for
// $36,000 while a full spotlight campaign bought the whole 0.12 for $10,000 —
// so the cheaper lever was nearly four times better and there was no reason to
// ever author a group. The two are not equivalent: a reveal is SPENT at launch
// (it front-loads attention on a card people then open packs to find once),
// while an illustration set is a chase that persists for as long as the run is
// unfinished. Two coherent groups now reach the cap.
const APPEAL_PER_GROUP = 0.06
const APPEAL_MAX = 0.12

// Launch buzz from a coherent illustration set, in two parts.
//
// PRESENT is for simply having one in the release, finished or not. A designed
// run IS a headline feature of a set, and an earlier version paid buzz only for
// what was still OWED — so the most desirable outcome the mechanic can produce,
// a finished coherent run, was the one the launch said nothing about.
//
// PROMISED is for a run this release does not finish. Without an up-front payoff
// the risk of abandoning one is fake: there would be nothing taken, only a bonus
// never collected. Teasing "the capstone comes later" has to buy something now
// so that walking away is a broken promise.
//
// Compare spotlightBuzz (0..9), a midnight launch (+8..14), a themed drop (+4..8).
const ILLUSTRATION_BUZZ_PRESENT = 2
const ILLUSTRATION_BUZZ_PROMISED = 4

// How long an open group may sit untouched. 26 weeks is two full cadence cycles
// at the brief's 12-20 week reference — long enough that a studio shipping on
// rhythm is never caught out, short enough that abandoning one lands inside a
// run rather than after it.
const STALE_WEEKS = 26
const ABANDON_WEEKS = 26

// The community's reaction to a broken promise. Bigger than a pack-odds bump
// (+/-3) and smaller than merch overreach (-6): it is a real breach of faith,
// but it is one product line, not a betrayal of the whole audience.
const ABANDON_SENTIMENT = -5
const ABANDON_AMBIENT_SENTIMENT = -1.5

// ---- Cohesion -------------------------------------------------------------

// Share of the members holding the single most common value of `key`. Members
// with no value at all (a bulk card with no artist) count against it, which is
// correct: an uncommissioned card in an illustrator suite really is a hole in it.
function modalShare(members, key) {
  if (!members.length) return 0
  const counts = new Map()
  for (const m of members) {
    const v = m[key]
    // `== null`, not falsy: a valueTier of 0 is a real tier (a rarity missing
    // from a set's sheet resolves to it), and treating it as absent silently
    // dropped those members out of flatRarity.
    if (v == null || v === '') continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best = 0
  for (const n of counts.values()) best = Math.max(best, n)
  return best / members.length
}

// Distinct non-null values of `key`, over the member count.
function distinctShare(members, key) {
  if (!members.length) return 0
  const seen = new Set()
  for (const m of members) if (m[key]) seen.add(m[key])
  return seen.size / members.length
}

// Members in the order they were actually printed. A group extended across
// releases has to be sorted before a ladder claim can be judged.
//
// Sorted by WEEK ALONE, and that is load-bearing. An earlier version broke ties
// on valueTier, which meant every member printed in the same set — the common
// case — sorted into ascending tier order before being asked whether it ascended.
// The ladder scorer returned 1 for literally any within-set group, including one
// authored deliberately backwards. Array#sort is stable, so week-only sorting
// preserves the order the player actually picked the cards in, which is the
// thing the scorer is supposed to be reading.
function inPrintOrder(members) {
  return [...members].sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
}

// Two characters are "related" if they are the same person, or if one was
// promoted from the other (characters.js's promotedFromId). The second case is
// the reason this scorer exists at all: "Kell, Broken Boy" and "Kell, Royal
// Soldier" are two separate roster entries, so a line built from them scores
// ZERO on oneCharacter — the mechanic would refuse to recognise exactly the
// example it was designed for. Walks the chain in both directions.
function related(aId, bId, chainOf) {
  if (!aId || !bId) return false
  if (aId === bId) return true
  return (chainOf.get(aId) ?? []).includes(bId) || (chainOf.get(bId) ?? []).includes(aId)
}

// Every ancestor of each character, precomputed once, over EVERY parent (a
// fusion has two — characters.js's lineageParentIds; older records carry the
// one in promotedFromId). Depth is capped by characters.js's own loop guard,
// but this walks defensively anyway — a cycle smuggled in through an imported
// save must not hang the market.
function ancestryIndex(characters = []) {
  const byId = new Map(characters.map((c) => [c.id, c]))
  const parentsOf = (c) => (Array.isArray(c.lineageParentIds) && c.lineageParentIds.length
    ? c.lineageParentIds
    : (c.promotedFromId ? [c.promotedFromId] : []))
  const out = new Map()
  for (const c of characters) {
    const chain = []
    const seen = new Set([c.id])
    let frontier = parentsOf(c)
    let depth = 0
    while (frontier.length && depth < 8) {
      const next = []
      for (const pid of frontier) {
        const p = byId.get(pid)
        if (!p || seen.has(pid)) continue
        seen.add(pid)
        chain.push(pid)
        next.push(...parentsOf(p))
      }
      frontier = next
      depth++
    }
    out.set(c.id, chain)
  }
  return out
}

// The fixed scorer vocabulary the kind requirements draw on. Each returns 0..1.
const SCORERS = {
  // Strictly ascending value tiers, as a share of adjacent pairs. A two-card
  // line either ladders or does not; a four-card one can be two-thirds right.
  ladder(members) {
    const ordered = inPrintOrder(members)
    if (ordered.length < 2) return 0
    let rising = 0
    for (let i = 1; i < ordered.length; i++) {
      if ((ordered[i].valueTier ?? 0) > (ordered[i - 1].valueTier ?? 0)) rising++
    }
    return rising / (ordered.length - 1)
  },
  // The inverse: one shared tier. A cycle is spoiled by a ladder, not helped.
  flatRarity(members) {
    return modalShare(members, 'valueTier')
  },
  oneArtist(members) {
    return modalShare(members, 'artistId')
  },
  // Wants BREADTH of illustrators. One artist across four cards scores 0.25;
  // four different hands score 1. This is what makes a character run read as the
  // opposite decision to a suite rather than a weaker version of one.
  manyArtists(members) {
    return distinctShare(members, 'artistId')
  },
  oneCharacter(members) {
    return modalShare(members, 'characterId')
  },
  // Share of members whose cast is related to the group's most common one.
  // Subsumes oneCharacter and additionally accepts a promotion chain.
  //
  // Reads the WHOLE cast on each card, not just its lead. That is the point of
  // a many-per-card relationship: three cards that each star someone different
  // but all feature Aryla in the background ARE a related run, and a collector
  // pairs them for exactly that reason.
  relatedCast(members, ctx) {
    if (!members.length) return 0
    const chainOf = ctx.ancestry ?? new Map()
    let best = 0
    for (const anchor of members) {
      for (const anchorId of castIdsOf(anchor)) {
        let n = 0
        for (const m of members) {
          if (castIdsOf(m).some((id) => related(anchorId, id, chainOf))) n++
        }
        best = Math.max(best, n)
      }
    }
    return best / members.length
  },
  brief(members) {
    if (!members.length) return 0
    return members.filter((m) => m.briefMatch).length / members.length
  },
  oneSet(members) {
    return modalShare(members, 'setId')
  },
  manySets(members) {
    return distinctShare(members, 'setId')
  },
  // How close the member count is to the kind's natural size. Scales from the
  // kind's floor up to its default; at or above the default this is satisfied.
  // Note this is NOT the same thing as completion (members / plannedSize), which
  // scales the premium separately — a player cannot dodge the size requirement
  // by promising fewer cards, because a two-card "cycle" still scores 0 here.
  size(members, ctx) {
    const kind = ctx.kind
    const span = Math.max(1, kind.defaultPlannedSize - kind.minSize + 1)
    return clamp((members.length - kind.minSize + 1) / span, 0, 1)
  },
}

// Score a group against its kind's requirements. Returns the weighted mean plus
// the per-requirement breakdown, which is not decoration: the set builder renders
// it as the reason a group scores what it does. Without that readout cohesion is
// a black box the player can only probe by shipping a set and guessing.
export function scoreCohesion(group, { characters = [] } = {}) {
  const kind = getIllustrationKind(group?.kindId)
  const members = group?.members ?? []
  const parts = {}
  if (members.length < 2) {
    // A single card is not a group. Scoring it would let a one-card "line"
    // collect a ladder score of 0 and a size score of 0.5 and come out non-zero.
    for (const r of kind.requirements) parts[r.id] = 0
    return { score: 0, parts }
  }
  const ctx = { kind, ancestry: ancestryIndex(characters) }
  let sum = 0
  let weight = 0
  for (const req of kind.requirements) {
    const scorer = SCORERS[req.id]
    const v = scorer ? clamp(scorer(members, ctx), 0, 1) : 0
    parts[req.id] = Math.round(v * 100) / 100
    sum += v * req.weight
    weight += req.weight
  }
  return { score: weight > 0 ? clamp(sum / weight, 0, 1) : 0, parts }
}

// ---- Group construction ---------------------------------------------------

// One member entry. Everything the scorer needs is FROZEN here rather than
// looked up later, and `briefMatch` is the reason that is not just an
// optimisation: artNotes is not on the card record at all (buildCard returns
// twenty-one fields and that is not one of them), so a brief match cannot be
// recomputed from state afterwards. It is scored once, at release, or never.
export function makeMember(card, { setId, week, valueTier, briefMatch }) {
  return {
    cardId: card.id,
    setId,
    week,
    artistId: card.artistId ?? null,
    characterId: card.characterId ?? null, // the LEAD, kept for every older reader
    castIds: castIdsOf(card),
    valueTier,
    briefMatch: !!briefMatch,
  }
}

// Does a card's art-direction brief answer the group's? Same shape as sets.js's
// artNotesMatchTheme — a shared word is the whole test. Deliberately loose: this
// is a flavour cue the player types, not a parser.
export function briefMatches(notes, artBrief) {
  if (!notes?.trim() || !artBrief?.trim()) return false
  const want = new Set(artBrief.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  if (!want.size) return false
  return notes
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.length > 2 && want.has(w))
}

// The next free group id. Derived from the highest suffix in use, NOT from the
// array length, and the difference is load-bearing here in a way it is not for
// `set_${n+1}` or `block_${n+1}`.
//
// Sets and blocks are never removed, so their length only ever grows. Groups
// ARE removed: normalizeIllustrationSet drops any group left with fewer than two
// live members when a save loads. Three groups minus a dropped middle one leaves
// a length of 2, and the next release then mints `ilset_3` on top of the
// `ilset_3` that is still sitting there — two groups sharing an id, which makes
// a `continue` resolve to whichever `.find()` reaches first and collides the
// React keys in the browser.
function nextGroupId(groups) {
  let max = 0
  for (const g of groups ?? []) {
    const m = /^ilset_(\d+)$/.exec(g?.id ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `ilset_${max + 1}`
}

// Mint a group. Sequential ids in the style of `set_${n+1}` and
// `block_${n+1}` — not rarities.js's rid() timestamp scheme, which exists
// specifically for ids minted inside the set builder before any state write,
// where a reload can collide two counters. A group is only ever created by a
// release or by discovery, so a scan of what exists is authoritative.
export function openGroup(state, spec, setId, week) {
  const kind = getIllustrationKind(spec?.kindId)
  const existing = state.illustrationSets ?? []
  return {
    id: nextGroupId(existing),
    kindId: kind.id,
    name: (spec?.name ?? '').trim() || `Untitled ${kind.noun}`,
    artBrief: (spec?.artBrief ?? '').trim(),
    plannedSize: clamp(Math.round(spec?.plannedSize ?? kind.defaultPlannedSize), kind.minSize, kind.maxSize),
    openedWeek: week,
    openedSetId: setId,
    status: 'open',
    lastMemberWeek: week,
    discovered: false,
    members: [],
    cohesion: 0,
    cohesionParts: {},
    completedWeek: null,
    abandonedWeek: null,
  }
}

// Append members and rescore. Returns a NEW group; never mutates.
export function addMembers(group, entries, { characters = [], week } = {}) {
  // An OPEN or STALE group takes new cards; a complete or abandoned one does
  // not. Stale has to be included or the 26-week grace period between "nobody
  // has seen a new card in a while" and "this is written off" is dead code: the
  // feed asks the room's question ("is the rest coming?") and the game then
  // gives the player no way at all to answer it, so every group that ticks past
  // STALE_WEEKS is mathematically guaranteed to be abandoned.
  //
  // Abandoned stays closed: reopening one is what would let a player farm the
  // announcement buzz forever.
  if (group.status && group.status !== 'open' && group.status !== 'stale') return group
  const fresh = (entries ?? []).filter(
    (e) => e && !(group.members ?? []).some((m) => m.cardId === e.cardId),
  )
  if (!fresh.length) return group
  const members = [...(group.members ?? []), ...fresh]
  // A late delivery revives a stale run: the clock restarts from this week, and
  // the group is open again rather than sitting one tick from being written off.
  const next = {
    ...group,
    members,
    lastMemberWeek: week ?? group.lastMemberWeek,
    status: group.status === 'stale' ? 'open' : group.status,
  }
  const { score, parts } = scoreCohesion(next, { characters })
  next.cohesion = Math.round(score * 1000) / 1000
  next.cohesionParts = parts
  if (members.length >= next.plannedSize && next.status === 'open') {
    next.status = 'complete'
    next.completedWeek = week ?? group.lastMemberWeek
  }
  return next
}

// ---- The per-week lookup --------------------------------------------------

// A group's capstone: the highest-tier member, ties broken by the LATEST
// printing. Derived here rather than cached on the record, because a cached
// derived id in a save is exactly how stale data happens — a later member at a
// higher tier has to be able to take the crown.
function capstoneIdOf(members) {
  let best = null
  for (const m of members) {
    if (
      !best
      || (m.valueTier ?? 0) > (best.valueTier ?? 0)
      || ((m.valueTier ?? 0) === (best.valueTier ?? 0) && (m.week ?? 0) > (best.week ?? 0))
    ) best = m
  }
  return best?.cardId ?? null
}

// How far out of reach a group's earlier members have become: the share of its
// member sets that are out of print or sold through. See OUT_OF_REACH_PREMIUM.
function outOfReachOf(members, setById) {
  if (!members.length) return 0
  let gone = 0
  const seen = new Set()
  for (const m of members) {
    if (seen.has(m.setId)) continue
    seen.add(m.setId)
    const set = setById.get(m.setId)
    if (!set) continue
    const soldThrough = set.supply > 0 ? (set.sold ?? 0) / set.supply >= 0.95 : false
    if (set.outOfPrint || soldThrough) gone++
  }
  return seen.size > 0 ? gone / seen.size : 0
}

// Map every card that benefits from a group to what it benefits from. Built and
// handed to its readers the way personas.js's variantContext already is —
// nothing does a `.find()` over groups inside a per-card loop, which on a late
// run would be O(6000 cards x groups) every tick.
//
// Three callers build it independently: resolveMarket, reactPersonas, and the
// card browser's memo. That is a handful of linear passes over the card list per
// week rather than the single one an earlier version of this comment claimed —
// fine at this scale, and worth knowing before anyone adds a fourth.
//
// VARIANTS INHERIT. generateCards mints a variant printing as a second card with
// the SAME name, artist and character — literally the same illustration. An alt
// art of a member is therefore part of the group as far as a collector is
// concerned, and it would be strange for it to be the one printing that gets
// nothing. It is resolved HERE rather than added to `members`, so it cannot
// inflate plannedSize or distort the cohesion scorers. It never inherits capstone
// status: it is already carrying variantScarcityPremium (up to 12x) and stacking
// the capstone multiplier on top of that is the one combination that could
// actually mint an absurd card.
export function illustrationContext(state) {
  const out = new Map()
  const groups = state.illustrationSets ?? []
  if (!groups.length) return out
  const setById = new Map((state.sets ?? []).map((s) => [s.id, s]))

  for (const group of groups) {
    const members = group.members ?? []
    // An abandoned run pays nothing. That is the entire risk: the premium is not
    // merely reduced, it is withdrawn, and the cards are left as ordinary cards.
    if (group.status === 'abandoned' || members.length < 2) continue
    const capstoneId = capstoneIdOf(members)
    const outOfReach = outOfReachOf(members, setById)
    for (const m of members) {
      out.set(m.cardId, {
        group,
        memberCount: members.length,
        isCapstone: m.cardId === capstoneId,
        outOfReach,
      })
    }
  }

  if (!out.size) return out
  for (const card of state.cards ?? []) {
    if (!card.variantOf || out.has(card.id)) continue
    const base = out.get(card.variantOf)
    if (base) out.set(card.id, { ...base, isCapstone: false, inherited: true })
  }
  return out
}

// ---- What the readers ask for ---------------------------------------------

// 0 for a fully-spread kind, 1 for the most concentrated one in the roster.
function concentrationOf(kind) {
  const span = MAX_CAPSTONE_WEIGHT - 1
  if (span <= 0) return 0
  return clamp((kind.capstoneWeight - 1) / span, 0, 1)
}

// How much of the group's payoff is actually earned: how coherent it is, times
// how much of what was promised has been delivered. A trilogy shipped two-thirds
// of the way through pays two-thirds. Both terms are needed — cohesion alone
// would let a player announce ten cards, ship two perfect ones and collect in
// full; completion alone would pay a thrown-together trio the same as a designed
// one.
function strengthOf(group) {
  const delivered = clamp((group.members?.length ?? 0) / Math.max(1, group.plannedSize ?? 1), 0, 1)
  return clamp((group.cohesion ?? 0) * delivered, 0, 1)
}

// The fairValue multiplier. Returns exactly 1 for a card in no group, which is
// what makes this safe to fold into the existing collectorLift unconditionally.
export function completionPremium(entry) {
  if (!entry) return 1
  const kind = getIllustrationKind(entry.group.kindId)
  const conc = concentrationOf(kind)
  const strength = strengthOf(entry.group)
  const band = entry.isCapstone
    ? CAPSTONE_PREMIUM_BASE + CAPSTONE_PREMIUM_CONC * conc
    : MEMBER_PREMIUM_BASE - MEMBER_PREMIUM_CONC * conc
  return (1 + strength * band) * (1 + (entry.outOfReach ?? 0) * OUT_OF_REACH_PREMIUM)
}

// The print-time lift, for sets.js. `cohesion` and `isCapstone` are passed
// directly rather than as a context entry, because at release time the cards do
// not exist yet and there is nothing to look up — see the note on the two-phase
// scoring in releaseSet.
export function groupLift(cohesion, isCapstone, kindId) {
  const kind = getIllustrationKind(kindId)
  const c = clamp(cohesion ?? 0, 0, 1)
  if (c <= 0) return { pop: 0, hypeMul: 1 }
  const weight = isCapstone ? kind.capstoneWeight : 1
  return {
    pop: Math.round(POP_LIFT * c * weight),
    hypeMul: Math.min(HYPE_SEED_MAX, 1 + HYPE_SEED_LIFT * c * weight),
  }
}

// Sealed-demand lift for one set, written onto the set record at release and
// refreshed weekly. It is a SET-LEVEL field because revenue.js's setAppeal
// receives only (set, cards) and reads spotlightAppeal, treatmentBuzz and
// reprintBuzz the same way.
//
// Refreshing it weekly buys something real for free: completing a cross-set run
// lifts the OLDER set's sales again, exactly as a long-awaited capstone revives
// interest in the product its predecessors came in.
export function illustrationAppealFor(setId, groups) {
  let sum = 0
  for (const g of groups ?? []) {
    if (g.status === 'abandoned') continue
    if (!(g.members ?? []).some((m) => m.setId === setId)) continue
    sum += strengthOf(g) * APPEAL_PER_GROUP
  }
  return Math.round(Math.min(APPEAL_MAX, sum) * 1000) / 1000
}

// Buzz for announcing a run this release does not finish. Scales with how much
// is still owed, so teasing one more card is a whisper and teasing four is a
// campaign.
// How much the room still believes an announcement, from the studio's actual
// record of finishing what it starts. 1 until there is a record to read.
//
// THIS EXISTS BECAUSE THE FIRST VERSION WAS EXPLOITABLE, and the harness caught
// it: a strategy that opened a four-card run every release and finished none of
// them was the BEST performing of the illustration strategies, +0.98% on the
// control against +0.22% for one that actually completed its runs. Announcing
// bought more launch buzz than delivering, the commission was identical, and the
// one-off sentiment hit for walking away was too small to notice. The optimal
// play was to promise constantly and deliver nothing.
//
// Scaling the PROMISED half by the studio's track record fixes it at the source
// rather than by inflating the punishment: the first broken promise is free (a
// studio with no record gets the benefit of the doubt), and a serial abandoner
// bottoms out at 0.15x — the room simply stops listening. That is also just what
// happens.
export function promiseCredibility(groups) {
  let done = 0
  let broken = 0
  for (const g of groups ?? []) {
    // A run the COMMUNITY found is not a promise the studio kept, and counting
    // it as one launders a serial abandoner's record: discovery mints a group
    // already `complete` about eight times over a long run, which was enough to
    // drag a studio that finishes nothing from 0.15 credibility up to 0.72 —
    // undoing the exact anti-exploit this function exists to be. The milestones
    // and the overuse grievance already exclude discovered groups; this was the
    // third reader and it was missed.
    if (g.discovered) continue
    if (g.status === 'complete') done++
    else if (g.status === 'abandoned' || g.status === 'stale') broken++
  }
  if (done + broken === 0) return 1
  return clamp(0.15 + 0.85 * (done / (done + broken)), 0.15, 1)
}

export function announcementBuzz(group, credibility = 1) {
  if (!group || group.status === 'abandoned') return 0
  const cohesion = clamp(group.cohesion ?? 0, 0, 1)
  if (cohesion <= 0) return 0
  const owed = Math.max(0, (group.plannedSize ?? 0) - (group.members?.length ?? 0))
  const share = group.status === 'open'
    ? clamp(owed / Math.max(1, group.plannedSize ?? 1), 0, 1)
    : 0
  const promised = ILLUSTRATION_BUZZ_PROMISED * share * clamp(credibility, 0, 1)
  return Math.round(cohesion * (ILLUSTRATION_BUZZ_PRESENT + promised) * 10) / 10
}

// How much the room has to object to. Reads the WHOLE state rather than the
// latest set, which setGrievances cannot do — it is handed one set and would
// therefore never notice a studio that opens a perfectly coherent trio on every
// single release forever. Passed INTO setGrievances so personas.js never has to
// import this module.
export function illustrationOverusePressure(state) {
  const groups = state.illustrationSets ?? []
  if (!groups.length) return 0
  const live = (state.cards ?? []).filter((c) => !c.rotated && !c.outOfPrint && !c.promo)
  const chase = live.filter((c) => c.treatment || c.secret || c.signature)
  if (chase.length < 8) return 0 // too small a catalogue to read anything into
  const grouped = new Set()
  let broken = 0
  for (const g of groups) {
    // A group the community named is not the studio packaging anything, so it
    // cannot be evidence that the studio over-packages. Blaming a player for
    // curation they did not do is the wrong way round.
    if (g.discovered) continue
    if (g.status === 'abandoned' || g.status === 'stale') broken++
    // An abandoned run's cards are "just cards" again — the design says so and
    // completionPremium enforces it. Counting them in the packaging share too
    // made an abandoned group generate grievance twice: once as a broken
    // promise, and again forever as catalogue the studio supposedly packaged.
    if (g.status === 'abandoned') continue
    for (const m of g.members ?? []) grouped.add(m.cardId)
  }
  const share = chase.filter((c) => grouped.has(c.id)).length / chase.length
  // Half the chase cards in the catalogue belonging to a group is where it stops
  // reading as curation and starts reading as a spreadsheet. Broken promises
  // count on top, because a shelf of half-finished runs is its own complaint.
  return clamp(clamp((share - 0.25) / 0.35, 0, 1) + broken * 0.12, 0, 1)
}

// ---- The weekly pass ------------------------------------------------------

// Move a group's status on. Returns { group, feed } — feed is null when nothing
// happened, so the caller can skip writing an events entry.
function advanceStatus(group, week) {
  if (group.status !== 'open' && group.status !== 'stale') return { group, feed: null }
  const idle = week - (group.lastMemberWeek ?? group.openedWeek ?? week)
  const owed = Math.max(0, (group.plannedSize ?? 0) - (group.members?.length ?? 0))
  if (owed <= 0) return { group, feed: null }

  if (group.status === 'open' && idle >= STALE_WEEKS) {
    return {
      group: { ...group, status: 'stale' },
      feed: `Nobody has seen a new card from ${group.name} in ${idle} weeks. Collectors sitting on ${group.members.length} of ${group.plannedSize} are asking whether the rest is coming.`,
    }
  }
  if (group.status === 'stale' && idle >= STALE_WEEKS + ABANDON_WEEKS) {
    return {
      group: { ...group, status: 'abandoned', abandonedWeek: week },
      feed: `${group.name} is being written off as abandoned — ${owed} card${owed === 1 ? '' : 's'} promised and never printed. The ones that did ship are now just cards.`,
    }
  }
  return { group, feed: null }
}

// The weekly lifecycle pass. Advances status, refreshes each set's
// illustrationAppeal, and voices anything that changed.
//
// Returns a patch, in the shape merch.js and distributors.js already use:
//   { illustrationSets, sets, feed: [...], personaSentimentBumps: [...] }
//
// The sentiment bump is described here rather than applied, and it is spelled out
// inline rather than imported: simulation.js cannot import from reducer.js
// (reducer imports simulation), which is the same corner events.js:430 already
// works around by duplicating the bump shape with a comment saying so.
export function applyIllustrationSets(state) {
  const groups = state.illustrationSets ?? []
  const week = state.week
  const feed = []
  const bumps = []

  let changed = false
  const nextGroups = groups.map((g) => {
    const { group, feed: line } = advanceStatus(g, week)
    if (line) {
      changed = true
      feed.push(line)
      if (group.status === 'abandoned') {
        // Scaled by how big the broken promise was: walking away from one card
        // of four is a disappointment, walking away from three of four is a
        // different thing entirely, and a flat hit priced them the same.
        const owedShare = clamp(
          Math.max(0, (group.plannedSize ?? 0) - (group.members?.length ?? 0))
          / Math.max(1, group.plannedSize ?? 1),
          0, 1,
        )
        const scale = 0.5 + owedShare
        bumps.push({
          tasteKey: 'art',
          floor: 0.4,
          amount: ABANDON_SENTIMENT * scale,
          ambientAmount: ABANDON_AMBIENT_SENTIMENT * scale,
        })
      }
    }
    return group
  })

  // Community discovery. Its own rng stream, so it cannot shift any other
  // system's draws (personas.js documents why that matters).
  //
  // Salted with the company and game name, the way initialState seeds the rival.
  // Keyed on the week ALONE, discovery fired on exactly weeks 11, 35, 42, 80,
  // 199, 215, 293 and 298 of every run anyone ever played — a fixed calendar a
  // returning player would simply learn. The other week-keyed streams
  // (`market:`, `artists:`) share that property harmlessly because they only
  // move numbers; this one mints permanent state.
  const salt = `${state.config?.companyName ?? ''}:${state.config?.gameName ?? ''}`
  const rng = makeRng(hashSeed(`illustration-discovery:${salt}:${week}`))
  if (rng() < DISCOVERY_CHANCE) {
    const loudest = (state.personas ?? []).reduce(
      (best, p) => (!best || (p.reach ?? 0) > (best.reach ?? 0) ? p : best),
      null,
    )
    if (loudest && (loudest.reach ?? 0) >= DISCOVERY_MIN_REACH) {
      const found = findAccidentalGroup({ ...state, illustrationSets: nextGroups }, rng)
      if (found) {
        nextGroups.push(found)
        changed = true
        feed.push(`Nobody at the studio planned it, but collectors have started calling ${found.members.length} of ${(state.sets ?? []).find((x) => x.id === found.openedSetId)?.name ?? 'an old set'}'s cards "${found.name}" — and pricing them as a set.`)
      }
    }
  }

  // Refresh every set's sealed-demand lift. Cheap (sets are tens, not
  // thousands) and it is what lets a late capstone revive an old set.
  let setsChanged = false
  const nextSets = (state.sets ?? []).map((s) => {
    const appeal = illustrationAppealFor(s.id, nextGroups)
    if ((s.illustrationAppeal ?? 0) === appeal) return s
    setsChanged = true
    return { ...s, illustrationAppeal: appeal }
  })

  return {
    illustrationSets: changed ? nextGroups : groups,
    sets: setsChanged ? nextSets : state.sets,
    feed,
    personaSentimentBumps: bumps,
  }
}

// ---- Community-discovered groups ------------------------------------------

// Collectors name things the publisher never planned. A set ships, and three
// cards in it by the same hand — never designed as a run, never marketed as
// one — end up in every binder together because somebody on the internet
// noticed and the name stuck.
//
// This is the counterpart to the authored path, and it is deliberately RARE:
// roughly one every forty weeks. It is a delight, not a mechanic to farm — the
// player cannot cause it, cannot pay for it, and would not want a feed full of
// them. Discovered groups are capped at a lower cohesion than an authored one
// can reach (DISCOVERED_COHESION_CAP), because nobody designed them: the cards
// genuinely do go together less well than a commissioned run.
const DISCOVERY_CHANCE = 1 / 40
const DISCOVERED_COHESION_CAP = 0.7
// Somebody has to be around to notice and be believed. Below this the room has
// no voice with enough standing for a name to stick.
const DISCOVERY_MIN_REACH = 55

// Names the community gives a run it found. Deliberately plainer than anything a
// marketing department would write — that is the tell that a player did not
// author it.
const DISCOVERED_NAMES = [
  (artist) => `the ${artist} three`,
  (artist) => `the ${artist} run`,
  (artist) => `the unofficial ${artist} set`,
]

// Look for an accidental run: cards in ONE set, by ONE illustrator, none of them
// already in a group. Returns a group or null.
function findAccidentalGroup(state, rng) {
  const claimed = new Set()
  for (const g of state.illustrationSets ?? []) {
    for (const m of g.members ?? []) claimed.add(m.cardId)
  }
  const bySetArtist = new Map()
  for (const card of state.cards ?? []) {
    if (!card.artistId || card.promo || card.rotated || card.outOfPrint) continue
    if (claimed.has(card.id) || card.variantOf) continue
    const key = `${card.setId}:${card.artistId}`
    const list = bySetArtist.get(key) ?? []
    list.push(card)
    bySetArtist.set(key, list)
  }
  const candidates = [...bySetArtist.entries()].filter(([, list]) => list.length >= 3)
  if (!candidates.length) return null
  const [key, list] = candidates[Math.floor(rng() * candidates.length)]
  const [setId, artistId] = key.split(':')
  const set = (state.sets ?? []).find((x) => x.id === setId)
  if (!set) return null

  // The three best of them, by collector tier — which is what a community
  // actually fixates on.
  const picked = [...list]
    .sort((a, b) => (b.popFactors?.rarity ?? 0) - (a.popFactors?.rarity ?? 0))
    .slice(0, 3)
  const artistName = getArtist(artistId)?.name ?? 'that artist'
  // Just the surname or nickname — a room does not say the full credited name.
  const shortName = artistName.replace(/"[^"]*"/g, '').trim().split(/\s+/).pop()

  const group = {
    id: nextGroupId(state.illustrationSets),
    kindId: 'suite', // one hand, one set — that is what was actually found
    name: DISCOVERED_NAMES[Math.floor(rng() * DISCOVERED_NAMES.length)](shortName),
    artBrief: '',
    plannedSize: picked.length,
    openedWeek: state.week,
    openedSetId: setId,
    status: 'complete', // it was found finished; there is nothing owed
    lastMemberWeek: state.week,
    discovered: true,
    members: picked.map((c) => makeMember(c, {
      setId,
      week: set.releasedWeek ?? state.week,
      valueTier: valueTierOf(set, c),
      briefMatch: false,
    })),
    cohesion: 0,
    cohesionParts: {},
    completedWeek: state.week,
    abandonedWeek: null,
  }
  const { score, parts } = scoreCohesion(group, { characters: state.characters ?? [] })
  group.cohesion = Math.min(DISCOVERED_COHESION_CAP, Math.round(score * 1000) / 1000)
  group.cohesionParts = parts
  return group
}

// ---- Persistence ----------------------------------------------------------

// hydrate()'s normaliser, shaped exactly like characters.js's
// normalizeCharacter — including returning null for a falsy record so the caller
// can .filter(Boolean). Everything here is additive: a save written before this
// feature simply has no illustrationSets array, lands on [], and every reader
// resolves to an identity. The save VERSION deliberately does not move.
//
// Two defensive filters earn their place. Members whose card no longer exists
// are dropped (a card can leave the world through an import of a partial save),
// and a group left under two members is dropped entirely — a one-card group has
// no meaning and would otherwise sit in the browser forever.
export function normalizeIllustrationSet(g, liveCardIds = null) {
  if (!g) return null
  const kind = getIllustrationKind(g.kindId)
  const members = (g.members ?? []).filter(
    (m) => m?.cardId && (!liveCardIds || liveCardIds.has(m.cardId)),
  )
  if (members.length < 2) return null
  const status = ['open', 'complete', 'stale', 'abandoned'].includes(g.status) ? g.status : 'open'
  return {
    ...g,
    kindId: kind.id,
    name: g.name ?? `Untitled ${kind.noun}`,
    artBrief: g.artBrief ?? '',
    plannedSize: clamp(Math.round(g.plannedSize ?? kind.defaultPlannedSize), kind.minSize, kind.maxSize),
    status,
    members,
    cohesion: clamp(g.cohesion ?? 0, 0, 1),
    cohesionParts: g.cohesionParts ?? {},
    discovered: !!g.discovered,
    lastMemberWeek: g.lastMemberWeek ?? g.openedWeek ?? 1,
    completedWeek: g.completedWeek ?? null,
    abandonedWeek: g.abandonedWeek ?? null,
  }
}

// Exported for the market's halo pass and for the harness.
export { HALO_MAX, STALE_WEEKS, ABANDON_WEEKS }

// Resolve a card's rarity value tier against its set's sheet — the one thing
// makeMember needs that the card record does not carry. Module-local: only the
// discovery pass needs it, since releaseSet already has the sheet in hand.
function valueTierOf(set, card) {
  return getRarity(set?.rarities, card?.rarity).valueTier ?? 0
}
