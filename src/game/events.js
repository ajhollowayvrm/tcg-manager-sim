// The events feed — random curveballs that give an endless run texture and keep
// year 6 different from year 2. See docs/BRIEF.md "Events feed".
//
// Each event has a base weight and a condition gate (some only fire when the
// game state makes them relevant — a "dominant card" event needs a real
// high-pressure card; a "beloved artist" spike needs cards by a popular artist).
// resolve() returns { text, tone, effects } where effects is a patch applied to
// the world: cash, per-card price/hype/banPressure bumps, segment & player-base
// deltas, and metagame nudges. Effects make events matter, not just flavor.

import { makeRng, hashSeed, range } from './rng.js'
import { getArtist } from './content/artists.js'
import { clamp } from './simulation.js'

// Roughly how often something happens. ~0.28/week ≈ an event every 3–4 weeks,
// so quiet stretches still exist (the clock can fast-forward through them).
const EVENT_CHANCE = 0.28

// ---- Helpers for picking targets from live state ----

function liveCards(state) {
  return state.cards.filter((c) => !c.banned && !c.rotated)
}

function pickCard(cards, rng) {
  if (!cards.length) return null
  return cards[Math.floor(rng() * cards.length) % cards.length]
}

// The most "dominant" live card = highest playability (what the meta warps around).
function dominantCard(state) {
  const live = liveCards(state)
  if (!live.length) return null
  return live.reduce((a, b) => (b.popFactors.playability > a.popFactors.playability ? b : a))
}

// A card whose artist is a high-reach name (for "beloved artist" events).
function cardByHotArtist(state, rng) {
  const live = liveCards(state).filter((c) => {
    const a = c.artistId ? getArtist(c.artistId) : null
    return a && a.reach >= 70
  })
  return pickCard(live, rng)
}

// ---- Effect application helpers ----

// Multiply a single card's price/hype by factors; returns a cards array patch.
function bumpCard(cards, cardId, { priceMul = 1, hype = 0, banPressure = 0 }) {
  return cards.map((c) =>
    c.id === cardId
      ? {
          ...c,
          singlePrice: Math.round(c.singlePrice * priceMul * 100) / 100,
          priceHistory: [...c.priceHistory, Math.round(c.singlePrice * priceMul * 100) / 100].slice(-26),
          hype: clamp((c.hype ?? 0) + hype, 0, 3),
          banPressure: clamp((c.banPressure ?? 0) + banPressure, 0, 100),
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
    id: 'cheating_scandal',
    kind: 'scandal',
    tone: 'bad',
    weight: 1,
    condition: (s) => s.sets.some((x) => !x.rotated),
    resolve: (s, rng) => ({
      text: `Tournament-cheating story breaks at a major event. The competitive scene is rattled.`,
      effects: {
        competitiveDelta: -Math.round(s.segments.competitive * range(rng, 0.02, 0.05)),
        metagame: { archetypeBalance: -range(rng, 1, 4) },
      },
    }),
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
    id: 'supply_chain',
    kind: 'supply',
    tone: 'bad',
    weight: 0.9,
    condition: (s) => s.sets.some((x) => !x.rotated && (x.sold ?? 0) < (x.supply ?? 0)),
    resolve: (s, rng) => {
      const cost = Math.round(range(rng, 8_000, 25_000))
      return {
        text: `Print/supply-chain snag: a distribution delay and emergency reprint run costs you $${cost.toLocaleString()}.`,
        effects: { cash: -cost },
      }
    },
  },
  {
    id: 'dominant_card_ban_demand',
    kind: 'meta',
    tone: 'bad',
    weight: 1.4,
    condition: (s) => {
      const d = dominantCard(s)
      // Fires for a genuinely strong card, or one already drawing ban pressure —
      // reachable without maxing the power slider, but not for a fine format.
      return d && (d.popFactors.playability > 68 || (d.banPressure ?? 0) > 35)
    },
    resolve: (s, rng) => {
      const card = dominantCard(s)
      return {
        text: `${card.name} is so dominant the community is openly demanding a ban. Pressure is mounting.`,
        effects: {
          cards: bumpCard(s.cards, card.id, { banPressure: range(rng, 12, 22) }),
          metagame: { diversity: -range(rng, 2, 5) },
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
    id: 'influencer_feud',
    kind: 'community',
    tone: 'neutral',
    weight: 0.8,
    condition: () => true,
    resolve: (s, rng) => ({
      text: `Two big community figures are publicly feuding over your game. Drama is engagement — eyeballs are up, vibes are mixed.`,
      effects: {
        casualDelta: Math.round(range(rng, -120, 300)),
      },
    }),
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
    id: 'rival_release',
    kind: 'community',
    tone: 'bad',
    weight: 0.7,
    condition: () => true,
    resolve: (s, rng) => ({
      text: `A rival card game drops a hyped set this week, pulling attention and wallets away from yours.`,
      effects: {
        casualDelta: -Math.round(s.segments.casual * range(rng, 0.01, 0.03)),
        competitiveDelta: -Math.round(s.segments.competitive * range(rng, 0.005, 0.02)),
      },
    }),
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
        casualDelta: Math.round(range(rng, 80, 250)),
        competitiveDelta: Math.round(range(rng, 30, 120)),
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

  // Weighted pick.
  const total = eligible.reduce((s, e) => s + e.weight, 0)
  let r = rng() * total
  let chosen = eligible[eligible.length - 1]
  for (const e of eligible) {
    if (r < e.weight) { chosen = e; break }
    r -= e.weight
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
  if (effects.competitiveDelta) seg.competitive = Math.max(0, seg.competitive + effects.competitiveDelta)
  if (effects.collectorsDelta) seg.collectors = Math.max(0, seg.collectors + effects.collectorsDelta)
  if (effects.casualDelta || effects.competitiveDelta || effects.collectorsDelta) {
    next.playerBase = Math.max(0, seg.casual + seg.competitive + seg.collectors)
  }

  if (effects.metagame) {
    for (const [k, d] of Object.entries(effects.metagame)) {
      next.metagame[k] = clamp(next.metagame[k] + d, 0, 100)
    }
  }
}
