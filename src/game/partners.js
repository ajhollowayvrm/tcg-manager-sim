// Brand partners — a co-branded promo card with an outside business. See
// content/partners.js for the roster. The same shape as a distributor or
// grading deal: a one-off action that returns a reducer patch.
//
// What a deal does, all at once:
//   - mints one promo card (promos.js) with the partner's label and prestige,
//     optionally fronted by a cast character (who logs a printing and lends
//     their fame to the card) and drawn by a chosen artist
//   - brings in the partner's casual reach as new players, skewed casual
//   - draws scalper heat — a mass promo is a bot magnet
//   - lifts franchise reputation a notch
//   - moves the room: value-minded voices like a free card; the art crowd
//     thinks a fast-food promo cheapens the brand
// A partner will not sign under its reputation gate, and not again inside its
// cooldown.

import { getBrandPartner } from './content/partners.js'
import { makePromoCard } from './promos.js'
import { famePopBonus, recordAppearance } from './characters.js'
import { distributeNewPlayers } from './segments.js'
import { clamp } from './simulation.js'

// A tie-in audience is overwhelmingly casual — nobody buys a kids' meal for
// the collector premium.
const PARTNER_LEAN = { casual: 0.85, collectors: 0.15 }
const CHEAP_PRESTIGE = 0.3

// Why a partner cannot sign right now, or null.
export function partnerBlock(state, partnerId) {
  const partner = getBrandPartner(partnerId)
  if (!partner) return 'Unknown partner.'
  const reputation = state.franchise?.reputation ?? 0
  if (reputation < partner.repGate) return `Needs ${Math.ceil(partner.repGate - reputation)} more reputation.`
  const last = [...(state.partnerDeals ?? [])].reverse().find((d) => d.partnerId === partnerId)
  if (last && state.week - last.week < partner.cooldownWeeks) {
    return `Available again in ${partner.cooldownWeeks - (state.week - last.week)} weeks.`
  }
  return null
}

// Returns the reducer patch or null.
export function signPartnerPromo(state, partnerId, { characterId = null, artistId = null } = {}) {
  const partner = getBrandPartner(partnerId)
  if (!partner || partnerBlock(state, partnerId)) return null

  const character = characterId ? (state.characters ?? []).find((c) => c.id === characterId && !c.retiredWeek) : null
  const themeId = [...(state.sets ?? [])].reverse().find((s) => !s.rotated)?.themeId ?? null
  const nonce = `${partnerId}_${state.week}`
  const card = makePromoCard(state, {
    label: partner.promoLabel,
    prestige: partner.prestige,
    themeId,
    nonce,
    characterId: character?.id ?? null,
    artistId,
    fameBonus: character ? famePopBonus(character.fame, 'standard') : 0,
  })
  if (character) card.name = `${character.name} (${partner.promoLabel} Promo)`

  let characters = state.characters ?? []
  if (character) {
    characters = recordAppearance(characters, character.id, {
      cardId: card.id, setId: null, treatment: 'standard', popFactors: card.popFactors,
      week: state.week, setName: `the ${partner.name} tie-in`,
    })
  }

  const segments = { ...state.segments }
  distributeNewPlayers(segments, PARTNER_LEAN, partner.casualReach)
  const playerBase = segments.casual + segments.collectors

  // Two constituencies, two reactions. Ambient ticks are small so a partner
  // deal is not a free way to buy the whole room.
  const cheap = partner.prestige < CHEAP_PRESTIGE
  const personas = (state.personas ?? []).map((p) => {
    let amt = (p.taste?.value ?? 0) >= 0.4 ? 3 : 0.5
    if (cheap && (p.taste?.art ?? 0) >= 0.4) amt -= 2.5
    return { ...p, sentiment: clamp(p.sentiment + amt, -100, 100) }
  })

  const franchise = state.franchise
    ? { ...state.franchise, reputation: Math.round((state.franchise.reputation + partner.repBump) * 100) / 100 }
    : state.franchise

  const deal = { partnerId, week: state.week, cardId: card.id, characterId: character?.id ?? null }
  const who = character ? ` fronted by ${character.name}` : ''
  const feed = `${partner.name} tie-in: a ${partner.promoLabel} promo${who} lands in ${partner.tag} outlets — `
    + `${partner.casualReach.toLocaleString('en-US')} new players find the game${cheap ? ', and the art crowd sniffs' : ''}.`

  return {
    cards: [...state.cards, card],
    characters,
    partnerDeals: [...(state.partnerDeals ?? []), deal],
    segments,
    playerBase,
    scalperHeat: clamp((state.scalperHeat ?? 0) + partner.heatDelta, 0, 100),
    franchise,
    personas,
    cashDelta: -partner.cost,
    feed,
  }
}
