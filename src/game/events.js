// The events feed — random curveballs that give an endless run texture and keep
// year 6 different from year 2. See docs/BRIEF.md "Events feed".
//
// Each event has a base weight and a condition gate (some only fire when the
// game state makes them relevant — a "dominant card" event needs a real
// high-pressure card; a "beloved artist" spike needs cards by a popular artist).
// resolve() returns { text, tone, effects } where effects is a patch applied to
// the world: cash, per-card price/hype/controversy bumps, and segment &
// player-base deltas. Effects make events matter, not just flavor.

import { makeRng, hashSeed, range } from './rng.js'
import { getArtist } from './content/artists.js'
import { clamp } from './simulation.js'
import { blowUpArtist, breakoutCandidate } from './artists.js'

// Roughly how often something happens. ~0.28/week ≈ an event every 3–4 weeks,
// so quiet stretches still exist (the clock can fast-forward through them).
const EVENT_CHANCE = 0.28

// ---- Helpers for picking targets from live state ----

function liveCards(state) {
  return state.cards.filter((c) => !c.banned && !c.rotated && !c.promo)
}

function pickCard(cards, rng) {
  if (!cards.length) return null
  return cards[Math.floor(rng() * cards.length) % cards.length]
}

// The most "dominant" live card = highest punch (what the meta warps around).
function dominantCard(state) {
  const live = liveCards(state)
  if (!live.length) return null
  return live.reduce((a, b) => (b.popFactors.punch > a.popFactors.punch ? b : a))
}

// A card whose artist is a high-reach name (for "beloved artist" events).
function cardByHotArtist(state, rng) {
  const live = liveCards(state).filter((c) => {
    const a = c.artistId ? getArtist(c.artistId) : null
    return a && a.reach >= 70
  })
  return pickCard(live, rng)
}

// The priciest live card in a set — the natural "hit" a god-pack story names.
function priciestCardInSet(state, setId) {
  const live = liveCards(state).filter((c) => c.setId === setId)
  if (!live.length) return null
  return live.reduce((a, b) => (b.singlePrice > a.singlePrice ? b : a))
}

// ---- Effect application helpers ----

// Multiply a single card's price/hype by factors; returns a cards array patch.
function bumpCard(cards, cardId, { priceMul = 1, hype = 0, controversy = 0 }) {
  return cards.map((c) =>
    c.id === cardId
      ? {
          ...c,
          singlePrice: Math.round(c.singlePrice * priceMul * 100) / 100,
          priceHistory: [...c.priceHistory, Math.round(c.singlePrice * priceMul * 100) / 100].slice(-26),
          hype: clamp((c.hype ?? 0) + hype, 0, 3),
          controversy: clamp((c.controversy ?? 0) + controversy, 0, 100),
        }
      : c,
  )
}

// ---- The event catalogue ----

export const EVENTS = [
  {
    id: 'counterfeit_scandal',
    kind: 'scandal',
    tone: 'bad',
    weight: 1,
    condition: (s) => liveCards(s).length > 0,
    resolve: (s, rng) => {
      const card = pickCard(liveCards(s), rng)
      return {
        text: `Counterfeiting scandal: fake ${card.name} are flooding the market. Trust takes a hit and the single's value slides.`,
        effects: {
          cards: bumpCard(s.cards, card.id, { priceMul: range(rng, 0.6, 0.8) }),
          collectorsDelta: -Math.round(s.segments.collectors * range(rng, 0.02, 0.05)),
        },
      }
    },
  },
  {
    id: 'shill_bidding_scandal',
    kind: 'scandal',
    tone: 'bad',
    weight: 1,
    condition: (s) => s.sets.some((x) => !x.rotated),
    resolve: (s, rng) => ({
      text: `A shill-bidding ring is exposed inflating auction prices on the secondary market. Trust in the market takes a hit.`,
      effects: {
        collectorsDelta: -Math.round(s.segments.collectors * range(rng, 0.02, 0.05)),
      },
    }),
  },
  {
    id: 'odds_transparency_backlash',
    kind: 'scandal',
    tone: 'bad',
    weight: 0.6,
    // Only a risk for an obscured, genuinely chase-heavy set — a published one
    // structurally can't draw this (see weightMul below).
    condition: (s) => s.sets.some((x) => !x.rotated && !x.oddsPublished && (x.rarityChase ?? 50) >= 60),
    weightMul: (s) => {
      const obscuredChaseSets = s.sets.filter((x) => !x.rotated && !x.oddsPublished && (x.rarityChase ?? 50) >= 60).length
      const anyPublished = s.sets.some((x) => x.oddsPublished)
      return clamp(1 + obscuredChaseSets * 0.35 - (anyPublished ? 0.4 : 0), 0.2, 3)
    },
    resolve: (s, rng) => {
      const candidates = s.sets.filter((x) => !x.rotated && !x.oddsPublished && (x.rarityChase ?? 50) >= 60)
      const target = candidates[Math.floor(rng() * candidates.length) % candidates.length]
      let cards = s.cards
      for (const c of liveCards(s).filter((c) => c.setId === target.id)) {
        cards = bumpCard(cards, c.id, { priceMul: range(rng, 0.85, 0.95) })
      }
      return {
        text: `Regulators and the community spotlight ${target.name}'s undisclosed pull rates — a gambling-mechanics story goes viral.`,
        effects: {
          cards,
          collectorsDelta: -Math.round(s.segments.collectors * range(rng, 0.01, 0.03)),
        },
      }
    },
  },
  {
    id: 'artist_spike',
    kind: 'artist',
    tone: 'good',
    weight: 1.1,
    condition: (s) => cardByHotArtist(s, makeRng(hashSeed('cond' + s.week))) != null,
    resolve: (s, rng) => {
      const card = cardByHotArtist(s, rng)
      const artist = getArtist(card.artistId)
      return {
        text: `${artist.name} just went viral in the art world — collectors are scrambling for ${card.name}. The single spikes.`,
        effects: {
          cards: bumpCard(s.cards, card.id, { priceMul: range(rng, 1.3, 1.8), hype: 0.4 }),
          collectorsDelta: Math.round(s.segments.collectors * range(rng, 0.01, 0.03)),
        },
      }
    },
  },
  {
    id: 'artist_breakout',
    kind: 'artist',
    tone: 'neutral',
    weight: 1,
    // Only fires when there's a rising/steady up-and-comer to break out.
    condition: (s) => breakoutCandidate(s, makeRng(hashSeed('bocond' + s.week))) != null,
    resolve: (s, rng) => {
      const live = breakoutCandidate(s, rng)
      const artist = getArtist(live.id)
      return {
        text: `${artist.name} just broke out — a gallery show and a viral cover have collectors clamoring. Their commission rate jumps.`,
        effects: { artistBreakoutId: live.id },
      }
    },
  },
  {
    id: 'supply_chain',
    kind: 'supply',
    tone: 'bad',
    weight: 0.9,
    condition: (s) => s.sets.some((x) => !x.rotated && (x.sold ?? 0) < (x.supply ?? 0)),
    // Investing in supply-chain capacity makes this event both rarer AND
    // cheaper when it does hit — see distributors.js's upgradeSupplyChain.
    weightMul: (s) => 1 - (s.supplyChainCapacity ?? 40) / 100 * 0.6,
    resolve: (s, rng) => {
      const capacityRelief = 1 - (s.supplyChainCapacity ?? 40) / 100 * 0.6
      const cost = Math.round(range(rng, 8_000, 25_000) * capacityRelief)
      return {
        text: `Print/supply-chain snag: a distribution delay and emergency reprint run costs you $${cost.toLocaleString()}.`,
        effects: { cash: -cost },
      }
    },
  },
  {
    id: 'manufactured_scarcity_backlash',
    kind: 'scandal',
    tone: 'bad',
    weight: 1.4,
    condition: (s) => {
      const d = dominantCard(s)
      // Fires for a genuinely splashy card, or one already drawing controversy —
      // reachable without a maxed-out chase design, but not for a quiet catalog.
      return d && (d.popFactors.punch > 68 || (d.controversy ?? 0) > 35)
    },
    resolve: (s, rng) => {
      const card = dominantCard(s)
      return {
        text: `Accusations fly that ${card.name}'s scarcity was manufactured to juice its price. The community is openly calling for you to pull it from print.`,
        effects: {
          cards: bumpCard(s.cards, card.id, { controversy: range(rng, 12, 22) }),
          collectorsDelta: -Math.round(s.segments.collectors * range(rng, 0.005, 0.015)),
        },
      }
    },
  },
  {
    id: 'viral_moment',
    kind: 'viral',
    tone: 'good',
    weight: 1,
    condition: (s) => liveCards(s).length > 0,
    resolve: (s, rng) => {
      const card = pickCard(liveCards(s), rng)
      const newPlayers = Math.round(range(rng, 150, 600))
      return {
        text: `A clip of an insane ${card.name} play goes viral. New players pour in and the card heats up.`,
        effects: {
          cards: bumpCard(s.cards, card.id, { priceMul: range(rng, 1.1, 1.35), hype: 0.5 }),
          casualDelta: newPlayers,
        },
      }
    },
  },
  {
    id: 'god_pack_pulled',
    kind: 'viral',
    tone: 'good',
    weight: 0.4, // rarer than most events — this is a real-hobby legend, not routine
    condition: (s) => s.sets.some((x) => !x.rotated) && liveCards(s).length > 0,
    resolve: (s, rng) => {
      const set = [...s.sets].filter((x) => !x.rotated)[Math.floor(rng() * s.sets.filter((x) => !x.rotated).length)]
      const card = priciestCardInSet(s, set.id) ?? pickCard(liveCards(s), rng)
      const others = liveCards(s).filter((c) => c.setId === set.id && c.id !== card.id)
      let cards = bumpCard(s.cards, card.id, { priceMul: range(rng, 1.3, 1.7), hype: 0.6 })
      // A couple of the set's other cards ride the wave too — that's the
      // marketing-moment effect, not just one card spiking in isolation.
      for (const c of others.slice(0, 2)) {
        cards = bumpCard(cards, c.id, { priceMul: range(rng, 1.05, 1.2), hype: 0.2 })
      }
      return {
        text: `A collector claims to have pulled a GOD PACK of ${set.name} — every card a hit, headlined by ${card.name}. The story is everywhere.`,
        effects: {
          cards,
          collectorsDelta: Math.round(s.segments.collectors * range(rng, 0.01, 0.03)),
        },
      }
    },
  },
  {
    id: 'influencer_feud',
    kind: 'community',
    tone: 'neutral',
    weight: 0.8,
    condition: (s) => (s.personas?.length ?? 0) >= 2,
    resolve: (s, rng) => {
      // Name two real high-reach voices and have them feud — the winner gains a
      // little reach, the loser loses some (a bandwagon outcome).
      const loud = [...s.personas].sort((a, b) => b.reach - a.reach).slice(0, 8)
      const i = Math.floor(rng() * loud.length) % loud.length
      let j = Math.floor(rng() * loud.length) % loud.length
      if (j === i) j = (j + 1) % loud.length
      const a = loud[i]
      const b = loud[j]
      const winner = rng() < 0.5 ? a : b
      const loser = winner === a ? b : a
      return {
        text: `${a.name} and ${b.name} are publicly feuding over ${s.config?.gameName || 'your game'}. Drama is engagement — and ${winner.name} is winning the room.`,
        effects: {
          casualDelta: Math.round(range(rng, -120, 300)),
          reachShift: { [winner.id]: range(rng, 3, 7), [loser.id]: -range(rng, 2, 5) },
        },
      }
    },
  },
  {
    id: 'market_correction',
    kind: 'market',
    tone: 'bad',
    weight: 0.9,
    condition: (s) => liveCards(s).some((c) => c.singlePrice > 60),
    resolve: (s, rng) => {
      const pricey = liveCards(s).filter((c) => c.singlePrice > 60)
      let cards = s.cards
      for (const c of pricey) cards = bumpCard(cards, c.id, { priceMul: range(rng, 0.7, 0.88) })
      return {
        text: `Market correction: a speculative bubble pops and the priciest singles all pull back sharply.`,
        effects: { cards, collectorsDelta: -Math.round(s.segments.collectors * range(rng, 0.01, 0.03)) },
      }
    },
  },
  {
    id: 'lgs_appreciation',
    kind: 'community',
    tone: 'good',
    weight: 0.8,
    condition: () => true,
    resolve: (s, rng) => ({
      text: `Local game stores report a great weekend of events around your game — grassroots goodwill ticks up.`,
      effects: {
        casualDelta: Math.round(range(rng, 100, 340)),
      },
    }),
  },
]

// ---- The weekly events pass ----

// Returns either null (quiet week) or { entry, effects } where entry is the
// feed item {week, text, kind, tone} and effects is the world patch to apply.
export function rollEvent(state) {
  const rng = makeRng(hashSeed(`events:${state.week}`))
  if (rng() > EVENT_CHANCE) return null

  const eligible = EVENTS.filter((e) => e.condition(state))
  if (!eligible.length) return null

  // Weighted pick. An optional `weightMul(state)` lets an event's own effective
  // weight react to world state (e.g. supply-chain capacity dampening the
  // supply_chain event) without touching every other event's static weight.
  const effectiveWeight = (e) => e.weight * (e.weightMul ? e.weightMul(state) : 1)
  const total = eligible.reduce((s, e) => s + effectiveWeight(e), 0)
  let r = rng() * total
  let chosen = eligible[eligible.length - 1]
  for (const e of eligible) {
    const w = effectiveWeight(e)
    if (r < w) { chosen = e; break }
    r -= w
  }

  const { text, effects } = chosen.resolve(state, rng)
  return {
    entry: { week: state.week, text, kind: chosen.kind, tone: chosen.tone },
    effects: effects ?? {},
  }
}

// Apply an event's effects to the next-state in place.
export function applyEventEffects(next, effects) {
  if (effects.cards) next.cards = effects.cards
  if (typeof effects.cash === 'number') next.cash = Math.max(0, next.cash + effects.cash)

  const seg = next.segments
  if (effects.casualDelta) seg.casual = Math.max(0, seg.casual + effects.casualDelta)
  if (effects.collectorsDelta) seg.collectors = Math.max(0, seg.collectors + effects.collectorsDelta)
  if (effects.casualDelta || effects.collectorsDelta) {
    next.playerBase = Math.max(0, seg.casual + seg.collectors)
  }

  // An artist breaking out: spike their commission cost/reach and graduate them.
  if (effects.artistBreakoutId && next.artists) {
    const rng = makeRng(hashSeed(`breakout:${effects.artistBreakoutId}:${next.week}`))
    next.artists = blowUpArtist(next.artists, effects.artistBreakoutId, rng)
  }

  // Persona reach shifts (e.g. a feud's winner/loser).
  if (effects.reachShift && next.personas) {
    next.personas = next.personas.map((p) => {
      const d = effects.reachShift[p.id]
      if (!d) return p
      return { ...p, reach: clamp(p.reach + d, 5, 100), reachSeed: p.reachSeed ?? p.reach }
    })
  }
}
