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
import { personOfForm, recordPersonPrinting } from './people.js'
import { castStanding } from './cast.js'
import { getArchetype } from './content/archetypes.js'
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

// How far a perfect or terrible pairing can move a tie-in's pull.
const PARTNER_FIT_STRENGTH = 0.4

// How well a character suits a partner, 0.8 to 1.2.
//
// A partner's `prestige` runs 0.15 (fast food) to ~0.9 (film studio), and an
// archetype's `segmentLean` runs -1 (pure casual) to +1 (pure collector). The
// fit is simply how close those two agree once both are on the same scale, so a
// mascot at a burger chain and a legendary at a premiere both read as right, and
// swapping them costs about a fifth of the character's pull. Exactly 1 for a
// neutral archetype and for `unaligned`, so nothing in an older save moves.
export function partnerFit(partner, character) {
  const lean = getArchetype(character?.archetypeId).segmentLean ?? 0
  const wanted = ((partner?.prestige ?? 0.5) - 0.5) * 2 // -1 mass market .. +1 prestige
  // A PRODUCT, not a distance: an archetype with no opinion (lean 0, which is
  // `unaligned` and every pre-archetype character) multiplies by exactly 1 and
  // is untouched. Agreement in sign rewards, disagreement penalises, and both
  // scale with how opinionated the archetype actually is.
  return clamp(1 + lean * wanted * PARTNER_FIT_STRENGTH, 0.8, 1.2)
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
    // Read through castStanding for the same reason every other printing does:
    // a fresh form of a household-name character fronts a tie-in on the
    // character's recognition, not on the form's own thin fame. See cast.js.
    //
    // Scaled by whether this character SUITS this partner. A burger chain wants
    // the face off the box; a film studio wants something with weight. Fronting
    // a tie-in used to read fame alone, so putting a legendary in a Happy Meal
    // and a mascot on a prestige premiere were identical decisions.
    fameBonus: character
      ? famePopBonus(castStanding(character, personOfForm(state, character.id)), 'standard') * partnerFit(partner, character)
      : 0,
  })
  if (character) card.name = `${character.name} (${partner.promoLabel} Promo)`

  let characters = state.characters ?? []
  let people = state.people ?? []
  if (character) {
    characters = recordAppearance(characters, character.id, {
      cardId: card.id, setId: null, treatment: 'standard', popFactors: card.popFactors,
      week: state.week, setName: `the ${partner.name} tie-in`,
    })
    // AND charge the saturation. A tie-in is a printing: it bumps the form's
    // fame and collects the character's standing, so the room has to notice it
    // too. This was the last path that took the reward without the cost — sign a
    // partner every week and your icon was printed forever with saturation
    // decaying 1/wk and never once charged. Same hole that was closed for the
    // collector-box exclusive.
    if (character.personId) people = recordPersonPrinting(people, character.personId, { week: state.week })
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
    people,
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
