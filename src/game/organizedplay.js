// Organized play & promo cards. Promos are cards you can NEVER pull from a
// booster — they're awarded through channels (tournament prizes, prerelease
// promos, league rewards), so their supply is tiny and they become the scarcest,
// most prestigious singles in the game (a championship promo is a grail).
//
// You ISSUE them by funding an organized-play program: it costs cash, mints a
// promo prize card, and supports the competitive scene — growing the competitive
// segment and warming community sentiment. The promo then trades as a high-value
// chase that's impossible to open in a pack.
//
// (Collector-box SKUs can also carry an SPC-exclusive promo — see sets.js; same
// promo:true mechanic, distributed via that product instead of an event.)

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { getTheme } from './content/themes.js'

// The organized-play programs you can run. Each: cost, the competitive/sentiment
// boost it gives, and the promo's prestige (drives its supply + value).
export const OP_PROGRAMS = {
  tournament: {
    kind: 'tournament', name: 'Championship circuit', cost: 60_000,
    compBoost: 0.05, sentiment: 6, prestige: 0.9, promoLabel: 'Champion',
    blurb: 'Sponsor a championship circuit. The winner takes home an ultra-rare promo — a true grail. Big boost to the competitive scene.',
  },
  league: {
    kind: 'league', name: 'League season', cost: 25_000,
    compBoost: 0.03, sentiment: 4, prestige: 0.55, promoLabel: 'League',
    blurb: 'Run a casual league season with participation promos. Broad goodwill, a modestly scarce reward.',
  },
  prerelease: {
    kind: 'prerelease', name: 'Prerelease promos', cost: 18_000,
    compBoost: 0.02, sentiment: 5, prestige: 0.4, promoLabel: 'Prerelease',
    blurb: 'Hand out prerelease promos at launch events. Builds hype and a scarce early collectible.',
  },
}

// Supply (units printed) of a promo, by prestige — scarcer = more prestigious and
// pricier. A championship promo is a few hundred; a league promo a few thousand.
function promoSupply(prestige) {
  return Math.round(5000 * (1 - prestige) + 150)
}

// Mint a promo card record. Promos carry promo:true (excluded from packs), a
// tiny supply, and high collector appeal; they seed at a high price and the
// market takes them from there. `theme` flavors the name/art; `nonce` keeps ids
// and resolution unique.
export function makePromoCard(state, { label, prestige, themeId, nonce }) {
  const rng = makeRng(hashSeed(`promo:${label}:${state.week}:${nonce}`))
  const theme = getTheme(themeId) ?? getTheme('dragons')
  const NOUNS = ['Champion', 'Sovereign', 'Avatar', 'Eidolon', 'Paragon', 'Warlord', 'Archon']
  const lead = theme?.mechanics?.length ? theme.mechanics[Math.floor(rng() * theme.mechanics.length)] : 'Prize'
  const name = `${lead} ${NOUNS[Math.floor(rng() * NOUNS.length)]} (${label} Promo)`

  // Collector value scales with prestige; playability is a modest random (a promo
  // can be competitively relevant but is prized for scarcity above all).
  const artAppeal = clamp(60 + prestige * 35 + range(rng, -8, 8), 0, 100)
  const hype = clamp(55 + prestige * 40 + range(rng, -10, 10), 0, 100)
  const playability = clamp(40 + range(rng, -15, 25), 0, 100)
  const rarityTier = clamp(80 + prestige * 18, 0, 100) // top-tier collectible

  // High seed price (scarce grail). The market moves it from here.
  const seed = (rarityTier * 0.4 + artAppeal * 0.4 + hype * 0.2) * (1 + prestige)
  const singlePrice = Math.round(Math.max(5, seed) * 100) / 100

  const id = `promo_${state.week}_${nonce}`
  return {
    id,
    setId: null, // promos belong to no set's pull pool
    name,
    rarity: 'promo',
    number: `${label} Promo`,
    secret: false,
    signature: false,
    promo: true, // THE flag: never appears in a booster (packs.js excludes it)
    artistId: null,
    popFactors: { playability, rarity: rarityTier, artAppeal, hype },
    sealedPrice: 0,
    singlePrice,
    priceHistory: [singlePrice],
    hype: hype / 100,
    momentum: 0,
    promoSupply: promoSupply(prestige),
    themeId: theme?.id ?? null,
  }
}

// ---- Run an organized-play program (player action) ------------------------

// Returns reducer patches { cards, segments, playerBase, personas, cashDelta,
// feed } or null if unaffordable / no program. Mints a promo and boosts the
// competitive scene + sentiment. `nonce` varies repeated runs in the same week.
export function runOrganizedPlay(state, kind, nonce = 0) {
  const prog = OP_PROGRAMS[kind]
  if (!prog) return null
  if (state.cash < prog.cost) return null

  // Flavor the promo with the most recent live set's theme (or a default).
  const liveSet = [...state.sets].reverse().find((s) => !s.rotated) ?? state.sets[state.sets.length - 1]
  const promo = makePromoCard(state, {
    label: prog.promoLabel, prestige: prog.prestige, themeId: liveSet?.themeId, nonce,
  })

  // Competitive scene grows; sentiment warms (you supported organized play).
  const compDelta = Math.round(state.segments.competitive * prog.compBoost)
  const segments = { ...state.segments, competitive: state.segments.competitive + compDelta }
  const playerBase = segments.competitive + segments.casual + segments.collectors
  const personas = state.personas.map((p) => {
    // Competitors and fairness-minded voices love organized-play support most.
    const d = prog.sentiment * (0.6 + (p.type === 'competitor' ? 0.6 : 0) + (p.taste?.fairness ?? 0) * 0.5)
    return { ...p, sentiment: clamp(p.sentiment + d, -100, 100) }
  })

  const feed = `You ran a ${prog.name} (-$${prog.cost.toLocaleString('en-US')}). The competitive scene grows, and "${promo.name}" — an unpullable promo — enters the wild as a scarce prize.`

  return { cards: [...state.cards, promo], segments, playerBase, personas, cashDelta: -prog.cost, feed }
}
