// Promo cards. A promo is a card you can NEVER pull from a booster — it's
// awarded through a channel outside normal packs, so its supply is tiny and it
// becomes one of the scarcest, most prestigious singles in the game.
//
// Today the only mint path is a Collector-box (SPC) SKU flagged
// exclusivePromo — see sets.js, where releasing such a set calls
// makePromoCard() to mint the promo that ships with that box.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { getTheme } from './content/themes.js'

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
  const lead = theme?.motifs?.length ? theme.motifs[Math.floor(rng() * theme.motifs.length)] : 'Prize'
  const name = `${lead} ${NOUNS[Math.floor(rng() * NOUNS.length)]} (${label} Promo)`

  // Collector value scales with prestige; punch is a modest random (a promo
  // can be competitively relevant but is prized for scarcity above all).
  const artAppeal = clamp(60 + prestige * 35 + range(rng, -8, 8), 0, 100)
  const hype = clamp(55 + prestige * 40 + range(rng, -10, 10), 0, 100)
  const punch = clamp(40 + range(rng, -15, 25), 0, 100)
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
    popFactors: { punch, rarity: rarityTier, artAppeal, hype },
    sealedPrice: 0,
    singlePrice,
    priceHistory: [singlePrice],
    hype: hype / 100,
    momentum: 0,
    promoSupply: promoSupply(prestige),
    themeId: theme?.id ?? null,
  }
}
