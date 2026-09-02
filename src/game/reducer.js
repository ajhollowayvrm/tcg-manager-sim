// The game reducer — every state transition the player can cause, in one place.
//
// This lives OUTSIDE useGame.js on purpose. It used to be a module-private
// function inside the hook, which meant the headless playtest harness
// (tools/playtest.mjs) could not call it and re-implemented three transitions
// by hand instead. That mirror silently drifted: it dropped `characters`,
// `pendingWaves`, `scalperHeat` and the odds-transparency sentiment bump, so
// any strategy that touched regionalStagger, releaseEvent, oddsPublished or a
// character-attached signature card would have been measured against a
// different game than the one that ships.
//
// Nothing here touches a browser global at module scope, and persistence.js
// self-guards with hasStorage(), so this module imports and runs cleanly in
// plain Node.

import { createInitialState } from './initialState.js'
import { advanceWeek, clamp } from './simulation.js'
import { releaseSet, reprintAsUnlimited, adjustPendingWave } from './sets.js'
import { pullFromPrint } from './bans.js'
import { ripPack } from './packs.js'
import { resetCadence } from './cadence.js'
import { distributeNewPlayers } from './segments.js'
import { compProduct, sponsorCreator, dropSponsor, invitePrerelease, sponsorTournament } from './relationships.js'
import { signDistributor, dropDistributor, cultivateDistributor, upgradeSupplyChain } from './distributors.js'
import { signGradingPartner, dropGradingPartner, cultivateGradingPartner } from './grading.js'
import { launchMerchLine, refreshMerchLine, retireMerchLine } from './merch.js'
import { pitchMediaDeal } from './media.js'
import { runBreak } from './breaks.js'
import { signArtistContract, endArtistContract } from './artists.js'
import { signPartnerPromo } from './partners.js'
import { fundGrant } from './grassroots.js'
import { purchaseUpgrade } from './upgrades.js'
import { createCharacter, createLineageCharacter, normalizeCharacter, recordAppearance, getTreatment } from './characters.js'
import { derivePeople, normalizePerson, recordPersonPrinting } from './people.js'
import { castIdsOf, castMembers, castPopBonus } from './cast.js'
import { createCardDesign, applyDesignPatch, standaloneCost, recordPrinting } from './carddesigns.js'
import { makePromoCard } from './promos.js'
import { currentArtist } from './artists.js'
import { getLineageKind } from './content/lineages.js'
import {
  STANDARD_KINDS,
  normalizeRaritySheetStandard,
  normalizePackFormatStandard,
  normalizeBlueprint,
} from './standards.js'
import { scoreRun, unlockedPerks } from './legacy.js'
import { clearSave, loadPrestige, bankPrestige, recordHallOfFame } from './persistence.js'

// The account-level prestige record, resolved into the perks it unlocks. Reads
// localStorage, which no-ops in the harness (persistence.js self-guards), so a
// headless sweep always starts from a clean slate — otherwise every result
// would shift with whatever the developer's browser happened to have banked.
function currentPrestige() {
  const p = loadPrestige()
  return { ...p, perks: unlockedPerks(p.banked) }
}

// Time is MANUAL: the player clicks "Advance Week", which dispatches a single
// 'TICK' to run one simulation week. There's no auto-timer — each week is a
// deliberate step the player takes.

// Re-derive the person layer after anything that adds or relinks a FORM.
//
// A character is one person printed in many forms (people.js), and which forms
// belong to which person is DERIVED from the lineage links rather than stored —
// the same contract hydrate() relies on to rebuild the layer with no save
// migration. So every action that mints a form has to re-run the derivation, or
// the new form carries a null personId and is invisible to recognition, favour
// and every cast signal until the next reload.
//
// Cheap by construction: it is a walk over the roster, not the card pool, and a
// roster is tens of records where the cards are thousands.
function withPeople(state) {
  const { people, characters } = derivePeople(state)
  return { ...state, people, characters }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'TICK': {
      if (state.gameOver) return state
      const next = advanceWeek(state)
      return applyClockDirective(next)
    }
    case 'RELEASE_SET': {
      const { set, existingSets, cards, cashDelta, printIntensity, softenedCards, releaseFeed, newPlayers, pendingWave, blocks, block, tier, characters, people, personaSentimentBump, scalperHeatDelta, illustrationSets, cardDesigns } = releaseSet(state, action.draft)
      // If a card reprint softened existing originals, build from that patched
      // array; otherwise from the current one. Then append the new set's cards.
      const baseCards = softenedCards ?? state.cards
      // Release discovery wave: distribute the new players into segments by lean.
      const segments = { ...state.segments }
      distributeNewPlayers(segments, state.segmentLean, newPlayers ?? 0)
      const playerBase = segments.casual + segments.collectors
      // A tier-aware launch line: a major opens a block (names the gimmick); a
      // rider rides one. Falls back to the classic line for a blockless release.
      const tierLabel = tier === 'minor' ? 'Minor set' : tier === 'micro' ? 'Micro set' : 'Major set'
      // A block opened WITHOUT a gimmick is a plain themed era — a first-class,
      // cheaper choice, not a missing value. blocks.js stores `gimmickName: null`
      // for one, and this line interpolated it straight into the launch feed, so
      // every plain era announced itself as `opens the "Dragons Block" block
      // (null)`. Named eras are unchanged.
      const blockLine = block
        ? (tier === 'major'
            ? (block.gimmickName
                ? ` — opens the “${block.name}” block (${block.gimmickName}).`
                : ` — opens the “${block.name}” block.`)
            : ` — a ${tier} set in the “${block.name}” block.`)
        : ' — fresh chase pulls hit the shelves.'
      // Regional stagger: the lead region gets its own (cosmetic) name in the
      // launch line, and the wide release lands separately — see pendingWaves.
      const regionLine = pendingWave ? ` It launches in the lead region as “${pendingWave.leadRegionName}.”` : ''
      const launch = `${tierLabel}: ${set.name} (${set.theme}) hits shelves${blockLine}${regionLine}${newPlayers ? ` ${newPlayers.toLocaleString()} new players discover the game.` : ''}`
      const feed = [
        { week: state.week, text: launch },
        ...(releaseFeed ? [{ week: state.week, text: releaseFeed }] : []),
        ...state.eventsFeed,
      ].slice(0, 60)
      // withPeople because a release can MINT a form: a signature card's "new
      // character" request resolves at release time (sets.js), and a form with no
      // person is invisible to recognition and every cast signal.
      return withPeople({
        ...state,
        cash: state.cash + cashDelta,
        sets: [...(existingSets ?? state.sets), set],
        cards: [...baseCards, ...cards],
        blocks: blocks ?? state.blocks,
        characters: characters ?? state.characters,
        people: people ?? state.people,
        illustrationSets: illustrationSets ?? state.illustrationSets,
        cardDesigns: cardDesigns ?? state.cardDesigns,
        pendingWaves: pendingWave ? [...(state.pendingWaves ?? []), pendingWave] : state.pendingWaves,
        segments,
        playerBase,
        printIntensity,
        scalperHeat: scalperHeatDelta ? clamp((state.scalperHeat ?? 0) + scalperHeatDelta, 0, 100) : state.scalperHeat,
        personas: applySentimentBump(state.personas, personaSentimentBump),
        cadence: resetCadence(state.cadence, state.week), // shipping resets the pledge clock
        eventsFeed: feed,
        clock: { ...state.clock, reason: `${set.name} released — advance the week to watch the market react.` },
      })
    }
    case 'TOGGLE_ODDS_PUBLISHED': {
      // One-directional: obscured → published only (mirrors a real "we started
      // disclosing" move — you don't un-ring that bell). Re-applies the same
      // trust bump a published release gets, since this set's cards weren't
      // hyped for the trade-off at release time.
      const sets = state.sets.map((s) => (s.id === action.setId && !s.oddsPublished
        ? { ...s, oddsPublished: true, oddsPublishedWeek: state.week }
        : s))
      if (sets === state.sets || !sets.some((s, i) => s !== state.sets[i])) return state
      const target = sets.find((s) => s.id === action.setId)
      return {
        ...state,
        sets,
        personas: applySentimentBump(state.personas, { tasteKey: 'fairness', floor: 0.4, amount: 3, ambientAmount: 1 }),
        eventsFeed: [{ week: state.week, text: `${target.name}'s pull rates are now published — the community's watching.`, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'ADJUST_PENDING_WAVE': {
      const r = adjustPendingWave(state, action.setId, action.direction)
      if (!r) return state
      return {
        ...state,
        pendingWaves: r.pendingWaves,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'PULL_FROM_PRINT': {
      const result = pullFromPrint(state, action.setId)
      if (!result) return state
      return {
        ...state,
        sets: result.sets,
        cards: result.cards,
        printIntensity: result.printIntensity,
        segments: result.segments,
        playerBase: result.playerBase,
        personas: result.personas,
        eventsFeed: [{ week: state.week, text: result.feed }, ...state.eventsFeed].slice(0, 60),
        clock: { ...state.clock, reason: `Pulled ${result.pulledName} from print` },
      }
    }
    case 'REPRINT_SET': {
      const result = reprintAsUnlimited(state, action.setId, action.printRun)
      if (!result) return state
      // Flag the original set as a first edition AND as already reprinted (one
      // Unlimited run per set). firstEditionCards already carries the card patch.
      const sets = state.sets.map((s) => (s.id === action.setId ? { ...s, firstEdition: true, reprinted: true } : s))
      return {
        ...state,
        sets: [...sets, result.set],
        cards: [...result.firstEditionCards, ...result.cards],
        cash: state.cash + result.cashDelta,
        // Re-issuing a set people already own is a real trade: accessible for
        // newcomers, but a heavy Unlimited run devalues collectors' shelves.
        personas: applySentimentBump(state.personas, result.personaSentimentBump),
        eventsFeed: [{ week: state.week, text: result.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
        clock: { ...state.clock, reason: result.feed },
      }
    }
    case 'RIP_PACK': {
      const result = ripPack(state, action.setId, action.nonce ?? 0)
      if (!result) return state
      // Cracking your own stock consumes one printed unit from the set.
      const sets = state.sets.map((s) =>
        s.id === action.setId ? { ...s, sold: Math.min((s.supply ?? 0), (s.sold ?? 0) + 1) } : s,
      )
      // A serialized card pulled this rip bumps its live serialIssued count —
      // sum how many times each id was pulled (a rip can draw the same card
      // more than once) so the catalog record's count stays accurate.
      const serialBumps = new Map()
      for (const p of result.pulls) {
        if (p._serialPulled) serialBumps.set(p.id, (serialBumps.get(p.id) ?? 0) + 1)
      }
      let cards = serialBumps.size
        ? state.cards.map((c) => serialBumps.has(c.id) ? { ...c, serialIssued: c.serialIssued + serialBumps.get(c.id) } : c)
        : state.cards
      // A god pack — every slot hit — is a real marketing moment: it lifts
      // hype across the rest of that set's live cards too, not just the
      // pulled copies.
      const godPackFeed = []
      if (result.isGodPack) {
        cards = cards.map((c) =>
          c.setId === action.setId && !c.banned && !c.rotated
            ? { ...c, hype: Math.min(3, (c.hype ?? 0) + 0.15) }
            : c,
        )
        godPackFeed.push({ week: state.week, kind: 'market', text: '🌟 GOD PACK! Every card in this pack hit — the community is losing it.' })
      }
      return {
        ...state,
        sets,
        cards,
        lastRip: {
          setId: action.setId, week: state.week,
          pullIds: result.pulls.map((c) => c.id), bestId: result.bestPull?.id ?? null,
          serials: result.pulls.map((c) => c._serialPulled ?? null),
          isGodPack: !!result.isGodPack,
        },
        eventsFeed: godPackFeed.length ? [...godPackFeed, ...state.eventsFeed].slice(0, 60) : state.eventsFeed,
      }
    }
    case 'COMP_PERSONA':
    case 'SPONSOR_PERSONA':
    case 'DROP_SPONSOR': {
      const fn = action.type === 'COMP_PERSONA' ? compProduct
        : action.type === 'SPONSOR_PERSONA' ? sponsorCreator : dropSponsor
      const r = fn(state, action.personaId)
      if (!r) return state
      return {
        ...state,
        personas: r.personas,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'community' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'INVITE_PRERELEASE': {
      const r = invitePrerelease(state, action.personaId, action.setId)
      if (!r) return state
      return {
        ...state,
        personas: r.personas,
        sets: r.sets,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'community' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SPONSOR_TOURNAMENT': {
      const r = sponsorTournament(state, action.personaId)
      if (!r) return state
      return {
        ...state,
        personas: r.personas,
        sets: r.sets,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'community' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SIGN_DISTRIBUTOR': {
      const r = signDistributor(state, action.distId, action.setId)
      if (!r) return state
      return {
        ...state,
        distributors: r.distributors,
        sets: r.sets,
        cash: state.cash + r.cashDelta,
        scalperHeat: r.scalperHeat,
        // A distributor deal posts to the feed but doesn't set the header note.
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'DROP_DISTRIBUTOR': {
      const r = dropDistributor(state, action.distId)
      if (!r) return state
      return {
        ...state,
        distributors: r.distributors,
        scalperHeat: r.scalperHeat,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'CULTIVATE_DISTRIBUTOR': {
      const r = cultivateDistributor(state, action.distId)
      if (!r) return state
      return {
        ...state,
        distributors: r.distributors,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SIGN_GRADING_PARTNER':
    case 'DROP_GRADING_PARTNER':
    case 'CULTIVATE_GRADING_PARTNER': {
      const fn = action.type === 'SIGN_GRADING_PARTNER' ? signGradingPartner
        : action.type === 'DROP_GRADING_PARTNER' ? dropGradingPartner : cultivateGradingPartner
      const r = fn(state, action.partnerId)
      if (!r) return state
      return {
        ...state,
        gradingPartners: r.gradingPartners,
        cash: state.cash + (r.cashDelta ?? 0),
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'LAUNCH_MERCH_LINE':
    case 'REFRESH_MERCH_LINE':
    case 'RETIRE_MERCH_LINE': {
      const fn = action.type === 'LAUNCH_MERCH_LINE' ? launchMerchLine
        : action.type === 'REFRESH_MERCH_LINE' ? refreshMerchLine : retireMerchLine
      const r = fn(state, action.kind)
      if (!r) return state
      return {
        ...state,
        merchLines: r.merchLines,
        cash: state.cash + (r.cashDelta ?? 0),
        // Merch is no longer community-invisible: a line fronted by a beloved
        // character delights, a shelf full of tie-ins reads as a cash grab.
        personas: applySentimentBump(state.personas, r.personaSentimentBump),
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'merch' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'PITCH_MEDIA_DEAL': {
      const r = pitchMediaDeal(state, action.dealId)
      if (!r) return state
      return {
        ...state,
        mediaDeals: r.mediaDeals,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'media' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SIGN_ARTIST_CONTRACT':
    case 'END_ARTIST_CONTRACT': {
      const r = action.type === 'SIGN_ARTIST_CONTRACT'
        ? signArtistContract(state, action.artistId, action.termWeeks)
        : endArtistContract(state, action.artistId)
      if (!r) return state
      return {
        ...state,
        artistContracts: r.artistContracts,
        cash: state.cash + (r.cashDelta ?? 0),
        personas: applySentimentBump(state.personas, r.personaSentimentBump),
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'artist' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SIGN_PARTNER_PROMO': {
      const r = signPartnerPromo(state, action.partnerId, action.options)
      if (!r) return state
      return withPeople({
        ...state,
        cards: r.cards,
        characters: r.characters,
        people: r.people ?? state.people,
        partnerDeals: r.partnerDeals,
        segments: r.segments,
        playerBase: r.playerBase,
        scalperHeat: r.scalperHeat,
        franchise: r.franchise,
        personas: r.personas,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
        clock: { ...state.clock, reason: r.feed },
      })
    }
    case 'PURCHASE_UPGRADE': {
      const r = purchaseUpgrade(state, action.id)
      if (!r) return state
      return {
        ...state,
        upgrades: r.upgrades,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'UPGRADE_SUPPLY_CHAIN': {
      const r = upgradeSupplyChain(state)
      if (!r) return state
      return {
        ...state,
        supplyChainCapacity: r.supplyChainCapacity,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'market' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'TOGGLE_PURCHASE_LIMITS': {
      // Per-customer purchase limits are a consumer-friendly stance: they cost
      // you distributor appetite and bulk-buy cash, and until now nobody
      // thanked you for it. Fairness-minded voices notice and approve.
      const on = !state.purchaseLimitPolicy
      return {
        ...state,
        purchaseLimitPolicy: on,
        personas: applySentimentBump(state.personas, {
          tasteKey: 'fairness', floor: 0.4,
          amount: on ? 4 : -4, ambientAmount: on ? 1.5 : -1.5,
        }),
        eventsFeed: [{
          week: state.week,
          text: on
            ? 'Per-customer purchase limits are now in force at retail — bots and bulk flippers get squeezed, and the community notices.'
            : 'Purchase limits lifted — bulk buyers can clear a shelf again.',
          kind: 'community',
        }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'TOGGLE_PHANTOM_STOCK': {
      // Showing "sold out" while stock remains deters bots — but it is a lie
      // told to your own customers, and the risk is that it gets found out
      // (see events.js's phantom_stock_exposed). Turning it ON is quiet; the
      // cost arrives later, as a story.
      const on = !state.phantomStockPolicy
      return {
        ...state,
        phantomStockPolicy: on,
        eventsFeed: [{
          week: state.week,
          text: on
            ? 'Phantom stock is live — listings show "sold out" before they truly are. It deters the bots. It is also not quite true.'
            : 'Phantom stock switched off — what the site says is in stock is what is in stock.',
          kind: 'market',
        }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'RUN_BREAK': {
      const r = runBreak(state, action.kind, action.setId, action.nonce ?? 0)
      if (!r) return state
      return {
        ...state,
        cards: r.cards,
        segments: r.segments,
        playerBase: r.playerBase,
        personas: r.personas,
        // Saturation tracking: repeated breaks in a short window read as
        // astroturf and flop more often (see breaks.js).
        breakHistory: r.breakHistory,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'community' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SET_GRASSROOTS': {
      // The grassroots programme (overhead.js sink F): a standing weekly
      // commitment, 0..1, like goodwill — but it buys word of mouth, not
      // forgiveness. See grassroots.js.
      const level = clamp(Number(action.level) || 0, 0, 1)
      if (level === (state.grassroots?.level ?? 0)) return state
      return { ...state, grassroots: { ...(state.grassroots ?? {}), level } }
    }
    case 'FUND_GRANT': {
      const r = fundGrant(state, action.kindId)
      if (!r) return state
      return {
        ...state,
        grassrootsGrants: r.grassrootsGrants,
        segments: r.segments,
        playerBase: r.playerBase,
        personas: r.personas,
        sets: r.sets,
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'community' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'SET_GOODWILL': {
      // The community-goodwill programme (overhead.js sink D): a standing
      // weekly commitment, 0..1, not a one-off purchase. This is where surplus
      // cash is meant to go, and the main lever for digging a soured community
      // back out — damped by whatever they are actually angry about.
      const level = clamp(Number(action.level) || 0, 0, 1)
      if (level === (state.goodwillSpend ?? 0)) return state
      return { ...state, goodwillSpend: level }
    }
    case 'HYDRATE':
      // The saved run finished loading from IndexedDB (or an import landed).
      // Boot is asynchronous now — see persistence.js and useGame.js.
      return action.state ?? state
    case 'RETIRE_STUDIO': {
      // A voluntary EXIT, never a win condition. It reuses the existing
      // `gameOver` field, so advanceWeek's `if (!next.gameOver)` guard and this
      // reducer's own TICK guard already stop the sim — no new stop machinery
      // exists, and therefore nothing new can trigger one by accident. It is
      // dispatched from exactly one place: a button the player presses. Nothing
      // in the sim ever proposes it, deliberately — the moment the game
      // suggests retiring, the run has a ceiling and stops being open-ended.
      if (state.gameOver) return state
      const score = scoreRun(state)
      const company = state.config?.companyName || 'the studio'
      bankPrestige(score.total)
      recordHallOfFame({
        company, game: state.config?.gameName || 'their game',
        weeks: state.week, total: score.total, grade: score.grade,
        endedBy: 'retired', at: Date.now(),
      })
      return {
        ...state,
        retirement: { week: state.week, ...score },
        gameOver: {
          kind: 'retired',
          reason: `You retired ${company} after ${state.week} weeks — ${score.grade}.`,
        },
        eventsFeed: [{
          week: state.week, kind: 'legacy', tone: 'good',
          text: `After ${(state.week / 52).toFixed(1)} years, ${company} closes its doors on its own terms. Final legacy: ${score.total.toLocaleString()} points — ${score.grade}.`,
        }, ...state.eventsFeed].slice(0, 60),
        clock: { ...state.clock, reason: 'Studio retired — see the retrospective.' },
      }
    }
    case 'START_GAME':
      // Begin a run from the onboarding config (name/cadence applied), with
      // whatever the player's career has already unlocked.
      return createInitialState({ ...action.config, started: true, prestige: currentPrestige() })
    case 'RESET':
      // Wipes the RUN only. Banked prestige and the hall of fame live under
      // their own keys and survive this deliberately — see persistence.js.
      clearSave()
      return createInitialState({ prestige: currentPrestige() })
    case 'ADD_CARD_DESIGN': {
      // Studio > Cards. A card the studio has designed and not yet placed — see
      // carddesigns.js for why a design is deliberately not owned by a release.
      return {
        ...state,
        cardDesigns: [...(state.cardDesigns ?? []), createCardDesign(state.week, action.design ?? {})],
      }
    }
    case 'UPDATE_CARD_DESIGN': {
      // applyDesignPatch takes an explicit field allow-list, the same technique
      // UPDATE_CHARACTER uses: a malformed patch can never reach the record's
      // own bookkeeping (its id, when it was authored, where it has printed).
      return {
        ...state,
        cardDesigns: (state.cardDesigns ?? []).map((d) => (
          d.id === action.id ? applyDesignPatch(d, action.patch ?? {}) : d
        )),
      }
    }
    case 'REMOVE_CARD_DESIGN': {
      // Removing a design cannot un-print anything. A pull COPIES (see
      // carddesigns.js), so every card this design already became is untouched
      // and keeps selling — only the shelf entry goes.
      return { ...state, cardDesigns: (state.cardDesigns ?? []).filter((d) => d.id !== action.id) }
    }
    case 'PRINT_CARD_DESIGN': {
      // Print one on its own: a promo, so it belongs to no set and can never be
      // pulled from a booster (packs.js excludes it). Refused if the studio
      // cannot pay — a design is free to author and only costs at the press.
      const design = (state.cardDesigns ?? []).find((d) => d.id === action.id)
      if (!design) return state
      const cost = standaloneCost(design, (id) => currentArtist(state, id), getTreatment(design.treatment).costMul)
      if (state.cash < cost) return state

      const card = makePromoCard(state, {
        label: 'Studio',
        // Below the 0.7 an SPC exclusive carries: a promo the studio simply
        // decided to print is not the prize for buying a collector box.
        prestige: 0.55,
        themeId: [...(state.sets ?? [])].reverse().find((s) => !s.rotated)?.themeId ?? null,
        nonce: `design_${design.id}`,
        name: design.name,
        castIds: castIdsOf(design),
        artistId: design.artistId,
        appeal: design.appeal,
        flavorText: design.flavorText,
        artNotes: design.artNotes,
        serialCap: design.serialCap,
        treatment: design.treatment,
        fameBonus: castPopBonus(castMembers(design, state.characters ?? [], state.people ?? []), design.treatment),
      })

      // A printing is a printing: it bumps every named character's fame and
      // charges their saturation exactly as a card in a set would.
      let characters = state.characters ?? []
      let people = state.people ?? []
      const printedFor = new Set()
      for (const formId of castIdsOf(design)) {
        characters = recordAppearance(characters, formId, {
          cardId: card.id, setId: null, treatment: design.treatment, popFactors: card.popFactors,
          week: state.week, setName: 'a studio promo',
        })
        const pid = characters.find((c) => c.id === formId)?.personId
        if (pid && !printedFor.has(pid)) {
          printedFor.add(pid)
          people = recordPersonPrinting(people, pid, { week: state.week })
        }
      }

      return withPeople({
        ...state,
        cash: Math.round((state.cash - cost) * 100) / 100,
        cards: [...state.cards, card],
        characters,
        people,
        cardDesigns: recordPrinting(state.cardDesigns, design.id, {
          cardId: card.id, setId: null, week: state.week, how: 'standalone',
        }),
        eventsFeed: [{
          week: state.week, kind: 'community',
          text: `${design.name} goes to press as a studio promo — a small run, no set, straight to the collectors.`,
        }, ...state.eventsFeed].slice(0, 60),
      })
    }
    case 'ADD_CHARACTER': {
      // Pre-builds your cast ahead of a card, the same record a signature
      // card's "new character" request would mint at release (see sets.js's
      // releaseSet) — just created directly, with no card attached yet, so a
      // fresh company can staff a roster before its first release.
      if (!action.name?.trim()) return state
      const roster = state.characters ?? []
      // A lineage from the Lineages panel: the same link a signature card's
      // "grows out of" pick makes at release, made directly. Refused links
      // (validateLineage) leave the state untouched — the panel shows why.
      if (action.lineage?.kindId) {
        const r = createLineageCharacter(roster, {
          name: action.name, identity: action.identity,
          kindId: action.lineage.kindId, parentIds: action.lineage.parentIds ?? [], week: state.week,
          // Passed so a new form can debut off the CHARACTER's recognition rather
          // than only its parent form's fame — see createLineageCharacter.
          people: state.people,
        })
        if (!r) return state
        const kind = getLineageKind(action.lineage.kindId)
        const parents = (action.lineage.parentIds ?? []).map((id) => roster.find((c) => c.id === id)?.name).filter(Boolean).join(' and ')
        return withPeople({
          ...state,
          characters: r.characters,
          eventsFeed: [{
            week: state.week, kind: 'community',
            text: `${r.child.name} joins the cast — a ${kind.name.toLowerCase()} of ${parents}.`,
          }, ...state.eventsFeed].slice(0, 60),
        })
      }
      return withPeople({
        ...state,
        characters: [...roster, createCharacter(action.name, action.identity)],
      })
    }
    case 'UPDATE_CHARACTER': {
      // A character is the player's own IP, so its identity is not a one-shot
      // taken at creation — the detail view can revise the hook, the traits, the
      // pronouns and the name later, the way a real cast gets rewritten between
      // eras. Fame, trajectory, appearances and beats are EARNED and are never
      // editable here.
      //
      // THE ARCHETYPE LOCKS ON DEBUT, and that is a balance rule, not flavor. It
      // is the one identity field the sim reads: it decides the theme-cohesion
      // bonus in sets.js's popFactors and the cover buzz, and it biases fame
      // drift every week in characters.js. Left freely editable it was a free,
      // repeatable exploit — set Guardian to collect a frost set's bonus, flip to
      // Villain so fame barely decays and controversy FEEDS it, flip again for
      // the next set's theme, all at no cost in cash, weeks or reputation.
      //
      // Before a character is printed they are still a sketch, so the archetype
      // is free to change. Once they have a printing they are established in the
      // world, and the choice is locked — which is also the honest reading: you
      // cannot quietly retcon what a character IS after the cards are out. The
      // lock reads appearances rather than debutSetId because a partner promo
      // (partners.js) is a printing with no set.
      const { id, patch } = action
      if (!id || !patch) return state
      // `formName`, `demeanorIds` and `carriesName` join the editable list.
      // None is an exploit surface the way archetypeId is: the archetype locks on
      // debut because it feeds the theme-cohesion bonus and the fame drift, so
      // flipping it per set was free money. A demeanour feeds only continuity,
      // which is scored against the LINEAGE KIND's expectation — and drifting to
      // chase a better verdict is the player writing a more coherent character,
      // which is the behaviour this whole feature is trying to buy.
      const allowed = ['name', 'traits', 'hook', 'pronouns', 'species', 'formName', 'demeanorIds', 'carriesName']
      return {
        ...state,
        characters: (state.characters ?? []).map((c) => {
          if (c.id !== id) return c
          const next = { ...c }
          for (const k of allowed) if (k in patch) next[k] = patch[k]
          if ('archetypeId' in patch && !(c.appearances?.length)) next.archetypeId = patch.archetypeId
          // Run it through the same normaliser a loaded save uses, so an unknown
          // archetype or an over-long trait list can never reach the record.
          return normalizeCharacter({ ...next, name: next.name?.trim() || c.name })
        }),
      }
    }
    case 'UPDATE_PERSON': {
      // The CHARACTER's own identity, as opposed to one form's. The name every
      // form is recognised by, the pronouns, the throughline, and the core traits
      // and demeanour that each form is read against for continuity.
      //
      // Everything here is authored, so all of it stays editable — a cast gets
      // rewritten between eras and that is the point of the field. What is NOT
      // here is everything EARNED: recognition, favour, saturation and beats are
      // never patchable, exactly as a form's fame and trajectory are not.
      //
      // Structure is absent for a different reason: rootFormId and
      // descendedFromIds are derived from the lineage links on every load, so
      // writing them here would be overwritten by the next hydrate.
      const { id, patch } = action
      if (!id || !patch) return state
      const allowed = ['name', 'pronouns', 'throughline', 'coreTraits', 'coreDemeanor']
      return {
        ...state,
        people: (state.people ?? []).map((p) => {
          if (p.id !== id) return p
          const next = { ...p }
          for (const k of allowed) if (k in patch) next[k] = patch[k]
          // Through the same normaliser a loaded save uses, so an over-long trait
          // list can never reach the record — the technique UPDATE_CHARACTER
          // already relies on.
          return normalizePerson({ ...next, name: next.name?.trim() || p.name })
        }),
      }
    }
    case 'SAVE_STANDARD':
    case 'DELETE_STANDARD': {
      // One shared body over the three libraries rather than six near-identical
      // cases, the way the grading-partner actions above already are. `kind` is
      // 'raritySheet' | 'packFormat' | 'blueprint'; STANDARD_KINDS maps it to the
      // state array it lives in.
      const key = STANDARD_KINDS[action.kind]
      if (!key) return state
      const list = state[key] ?? []
      if (action.type === 'DELETE_STANDARD') {
        if (!action.id || !list.some((s) => s.id === action.id)) return state
        const next = { ...state, [key]: list.filter((s) => s.id !== action.id) }
        // A blueprint pins a sheet and a format by id, so deleting either half
        // has to reach the blueprints too — otherwise one keeps a dangling id
        // until the next reload, and applying it would seed a draft from
        // nothing. normalizeBlueprint drops a blueprint left pinning neither.
        return action.kind === 'blueprint' ? next : renormalizeBlueprints(next)
      }
      // SAVE is an UPSERT: the panel edits a record in place and hands the whole
      // thing back, and "save as standard" from the builder hands over a brand
      // new one. Both are the same write.
      //
      // Every write goes through the same normaliser a loaded save uses — the
      // technique UPDATE_CHARACTER already relies on, and the reason a malformed
      // sheet can never reach the record no matter which surface authored it. A
      // record the normaliser refuses is dropped rather than stored, because a
      // library entry the release button would reject is worse than no entry.
      const normalize = action.kind === 'raritySheet'
        ? normalizeRaritySheetStandard
        : action.kind === 'packFormat'
          ? normalizePackFormatStandard
          : (b) => normalizeBlueprint(b, {
            sheetIds: new Set((state.raritySheets ?? []).map((s) => s.id)),
            formatIds: new Set((state.packFormats ?? []).map((f) => f.id)),
          })
      const record = normalize(action.record)
      if (!record) return state
      // Exactly one default per library — the one a fresh draft seeds from. Set
      // on this record, cleared everywhere else, so the invariant holds by
      // construction rather than by the panel remembering to clear the old one.
      const cleared = record.isDefault ? list.map((s) => ({ ...s, isDefault: false })) : list
      const exists = cleared.some((s) => s.id === record.id)
      return {
        ...state,
        [key]: exists
          ? cleared.map((s) => (s.id === record.id ? record : s))
          : [...cleared, record],
      }
    }
    default:
      return state
  }
}

// Apply a small persona-wide sentiment bump. Voices who CARE about the axis in
// question (taste[tasteKey] >= floor) get the full amount; everyone else gets a
// smaller ambient tick. Amounts may be negative — this carries bad news too.
//
// `tasteKey` picks which axis decides who notices: 'fairness' for the
// odds-transparency trade-off, 'value' for an Unlimited reprint devaluing what
// collectors own, and so on. `bump` is null for a no-op.
export function applySentimentBump(personas, bump) {
  if (!bump) return personas
  const key = bump.tasteKey ?? 'fairness'
  const floor = bump.floor ?? 0.4
  return personas.map((p) => {
    const amt = (p.taste?.[key] ?? 0) >= floor ? bump.amount : bump.ambientAmount
    return { ...p, sentiment: clamp(p.sentiment + amt, -100, 100) }
  })
}

// Surface the just-resolved week's attention note. With a manual clock there's
// nothing to pause or slow — but the directive still tells the player what
// changed this week (a ban threshold crossed, a market spike, a player swing),
// which we keep as the header's reason line. An uneventful week clears it.
export function applyClockDirective(next) {
  const d = next.clock.autoEvent
  const reason = d?.reason ?? null
  return { ...next, clock: { ...next.clock, autoEvent: null, reason } }
}

// Re-resolve every blueprint against the libraries as they now stand. Called
// after a sheet or a format is deleted, so a blueprint that pinned it loses that
// half immediately instead of carrying a dangling id until the next reload.
function renormalizeBlueprints(state) {
  const sheetIds = new Set((state.raritySheets ?? []).map((s) => s.id))
  const formatIds = new Set((state.packFormats ?? []).map((f) => f.id))
  return {
    ...state,
    blueprints: (state.blueprints ?? [])
      .map((b) => normalizeBlueprint(b, { sheetIds, formatIds }))
      .filter(Boolean),
  }
}
