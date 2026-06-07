import { useCallback, useEffect, useReducer, useRef } from 'react'
import { createInitialState } from './initialState.js'
import { advanceWeek } from './simulation.js'
import { releaseSet, reprintSet } from './sets.js'
import { banCard, pullFromPrint } from './bans.js'
import { ripPack } from './packs.js'
import { resetCadence } from './cadence.js'
import { compProduct, sponsorCreator, dropSponsor } from './relationships.js'
import { signDistributor, dropDistributor, cultivateDistributor } from './distributors.js'
import { loadState, saveState, clearSave } from './persistence.js'

// Reducer-driven game state. Time is MANUAL: the player clicks "Advance Week",
// which dispatches a single 'TICK' to run one simulation week. There's no
// auto-timer — each week is a deliberate step the player takes.

function reducer(state, action) {
  switch (action.type) {
    case 'TICK': {
      if (state.gameOver) return state
      const next = advanceWeek(state)
      return applyClockDirective(next)
    }
    case 'RELEASE_SET': {
      const { set, cards, cashDelta, metagame, counteredCards, counterFeed } = releaseSet(state, action.draft)
      // If silver-bullet counters mutated existing cards, build from that patched
      // array; otherwise from the current one. Then append the new set's cards.
      const baseCards = counteredCards ?? state.cards
      const feed = [
        { week: state.week, text: `${set.name} (${set.theme}) hits shelves — the metagame refreshes.` },
        ...(counterFeed ? [{ week: state.week, text: `Counter tech: ${counterFeed}` }] : []),
        ...state.eventsFeed,
      ]
      return {
        ...state,
        cash: state.cash + cashDelta,
        sets: [...state.sets, set],
        cards: [...baseCards, ...cards],
        metagame,
        cadence: resetCadence(state.cadence, state.week), // shipping resets the pledge clock
        eventsFeed: feed,
        clock: { ...state.clock, reason: `${set.name} released — advance the week to watch the market react.` },
      }
    }
    case 'BAN_CARD': {
      const result = banCard(state, action.cardId)
      if (!result) return state
      return {
        ...state,
        cards: result.cards,
        metagame: result.metagame,
        segments: result.segments,
        playerBase: result.playerBase,
        personas: result.personas,
        eventsFeed: [{ week: state.week, text: result.feed }, ...state.eventsFeed],
        clock: { ...state.clock, reason: result.banReason },
      }
    }
    case 'PULL_FROM_PRINT': {
      const result = pullFromPrint(state, action.setId)
      if (!result) return state
      return {
        ...state,
        sets: result.sets,
        cards: result.cards,
        metagame: result.metagame,
        segments: result.segments,
        playerBase: result.playerBase,
        personas: result.personas,
        eventsFeed: [{ week: state.week, text: result.feed }, ...state.eventsFeed],
        clock: { ...state.clock, reason: `Pulled ${result.pulledName} from print` },
      }
    }
    case 'REPRINT_SET': {
      const result = reprintSet(state, action.setId, action.printRun)
      if (!result) return state
      // Flag the original set as a first edition AND as already reprinted (one
      // Unlimited run per set). firstEditionCards already carries the card patch.
      const sets = state.sets.map((s) => (s.id === action.setId ? { ...s, firstEdition: true, reprinted: true } : s))
      return {
        ...state,
        sets: [...sets, result.set],
        cards: [...result.firstEditionCards, ...result.cards],
        cash: state.cash + result.cashDelta,
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
      return {
        ...state,
        sets,
        lastRip: { setId: action.setId, week: state.week, pullIds: result.pulls.map((c) => c.id), bestId: result.bestPull?.id ?? null },
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
    case 'START_GAME':
      // Begin a run from the onboarding config (name/archetype/cadence applied).
      return createInitialState({ ...action.config, started: true })
    case 'RESET':
      clearSave() // don't let the finished run resurrect on the next reload
      return createInitialState()
    default:
      return state
  }
}

// Surface the just-resolved week's attention note. With a manual clock there's
// nothing to pause or slow — but the directive still tells the player what
// changed this week (a ban threshold crossed, a market spike, a player swing),
// which we keep as the header's reason line. An uneventful week clears it.
function applyClockDirective(next) {
  const d = next.clock.autoEvent
  const reason = d?.reason ?? null
  return { ...next, clock: { ...next.clock, autoEvent: null, reason } }
}

// Lazy reducer init: resume a saved run if one exists, otherwise a fresh state.
// loadState() returns null in the harness / first visit / on any corrupt blob,
// so this is always safe.
function initState() {
  return loadState() ?? createInitialState()
}

export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const stateRef = useRef(state)
  stateRef.current = state

  // Autosave: persist on every state change, debounced so a burst of actions in
  // one week doesn't hammer localStorage. The trailing write always lands, so the
  // latest state is never lost; on unmount we flush immediately so a reload right
  // after an action is safe.
  useEffect(() => {
    const id = setTimeout(() => saveState(stateRef.current), 400)
    return () => clearTimeout(id)
  }, [state])

  useEffect(() => {
    // Flush the freshest state when the tab is hidden/closed — covers the case
    // where the user navigates away inside the debounce window.
    const flush = () => saveState(stateRef.current)
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  // Manual time: advance one week per click. No timer, no play/pause/speed.
  const advanceWeekAction = useCallback(() => dispatch({ type: 'TICK' }), [])
  const release = useCallback((draft) => dispatch({ type: 'RELEASE_SET', draft }), [])
  const banCardAction = useCallback((cardId) => dispatch({ type: 'BAN_CARD', cardId }), [])
  const pull = useCallback((setId) => dispatch({ type: 'PULL_FROM_PRINT', setId }), [])
  const reprint = useCallback((setId, printRun) => dispatch({ type: 'REPRINT_SET', setId, printRun }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  // A nonce so consecutive rips of the same set in the same week differ.
  const ripNonce = useRef(0)
  const rip = useCallback((setId) => dispatch({ type: 'RIP_PACK', setId, nonce: ripNonce.current++ }), [])
  const startGame = useCallback((config) => dispatch({ type: 'START_GAME', config }), [])
  const comp = useCallback((personaId) => dispatch({ type: 'COMP_PERSONA', personaId }), [])
  const sponsor = useCallback((personaId) => dispatch({ type: 'SPONSOR_PERSONA', personaId }), [])
  const unsponsor = useCallback((personaId) => dispatch({ type: 'DROP_SPONSOR', personaId }), [])
  const signDist = useCallback((distId, setId) => dispatch({ type: 'SIGN_DISTRIBUTOR', distId, setId }), [])
  const dropDist = useCallback((distId) => dispatch({ type: 'DROP_DISTRIBUTOR', distId }), [])
  const cultivateDist = useCallback((distId) => dispatch({ type: 'CULTIVATE_DISTRIBUTOR', distId }), [])

  return { state, advanceWeek: advanceWeekAction, release, ban: banCardAction, pull, reprint, reset, rip, startGame, comp, sponsor, unsponsor, signDist, dropDist, cultivateDist }
}
