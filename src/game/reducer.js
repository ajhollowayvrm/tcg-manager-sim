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
import { createCharacter } from './characters.js'
import { clearSave } from './persistence.js'

// Time is MANUAL: the player clicks "Advance Week", which dispatches a single
// 'TICK' to run one simulation week. There's no auto-timer — each week is a
// deliberate step the player takes.

export function reducer(state, action) {
  switch (action.type) {
    case 'TICK': {
      if (state.gameOver) return state
      const next = advanceWeek(state)
      return applyClockDirective(next)
    }
    case 'RELEASE_SET': {
      const { set, existingSets, cards, cashDelta, printIntensity, softenedCards, releaseFeed, newPlayers, pendingWave, blocks, block, tier, characters, personaSentimentBump, scalperHeatDelta } = releaseSet(state, action.draft)
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
      const blockLine = block
        ? (tier === 'major'
            ? ` — opens the “${block.name}” block (${block.gimmickName}).`
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
      return {
        ...state,
        cash: state.cash + cashDelta,
        sets: [...(existingSets ?? state.sets), set],
        cards: [...baseCards, ...cards],
        blocks: blocks ?? state.blocks,
        characters: characters ?? state.characters,
        pendingWaves: pendingWave ? [...(state.pendingWaves ?? []), pendingWave] : state.pendingWaves,
        segments,
        playerBase,
        printIntensity,
        scalperHeat: scalperHeatDelta ? clamp((state.scalperHeat ?? 0) + scalperHeatDelta, 0, 100) : state.scalperHeat,
        personas: applySentimentBump(state.personas, personaSentimentBump),
        cadence: resetCadence(state.cadence, state.week), // shipping resets the pledge clock
        eventsFeed: feed,
        clock: { ...state.clock, reason: `${set.name} released — advance the week to watch the market react.` },
      }
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
        cash: state.cash + r.cashDelta,
        eventsFeed: [{ week: state.week, text: r.feed, kind: 'community' }, ...state.eventsFeed].slice(0, 60),
      }
    }
    case 'START_GAME':
      // Begin a run from the onboarding config (name/cadence applied).
      return createInitialState({ ...action.config, started: true })
    case 'RESET':
      clearSave() // don't let the finished run resurrect on the next reload
      return createInitialState()
    case 'ADD_CHARACTER': {
      // Pre-builds your cast ahead of a card, the same record a signature
      // card's "new character" request would mint at release (see sets.js's
      // releaseSet) — just created directly, with no card attached yet, so a
      // fresh company can staff a roster before its first release.
      if (!action.name?.trim()) return state
      return { ...state, characters: [...(state.characters ?? []), createCharacter(action.name, action.species)] }
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
