import { useCallback, useEffect, useReducer, useRef } from 'react'
import { createInitialState } from './initialState.js'
import { advanceWeek } from './simulation.js'
import { releaseSet } from './sets.js'
import { banCard, rotateFormat } from './bans.js'
import { ripPack } from './packs.js'
import { resetCadence } from './cadence.js'
import { compProduct, sponsorCreator, dropSponsor } from './relationships.js'

// Reducer-driven game state. The clock ticks via setInterval while playing;
// each tick dispatches a 'TICK' that runs one simulation week.

function reducer(state, action) {
  switch (action.type) {
    case 'TICK': {
      if (state.gameOver) return state
      const next = advanceWeek(state)
      return applyClockDirective(next)
    }
    case 'PLAY':
      if (state.gameOver) return state // can't un-pause a finished run
      return { ...state, clock: { ...state.clock, paused: false, pauseReason: null, autoEvent: null } }
    case 'PAUSE':
      return {
        ...state,
        clock: { ...state.clock, paused: true, pauseReason: action.reason ?? state.clock.pauseReason },
      }
    case 'SET_SPEED':
      return { ...state, clock: { ...state.clock, speed: action.speed } }
    case 'RELEASE_SET': {
      const { set, cards, cashDelta, metagame } = releaseSet(state, action.draft)
      return {
        ...state,
        cash: state.cash + cashDelta,
        sets: [...state.sets, set],
        cards: [...state.cards, ...cards],
        metagame,
        cadence: resetCadence(state.cadence, state.week), // shipping resets the pledge clock
        eventsFeed: [
          { week: state.week, text: `${set.name} (${set.theme}) hits shelves — the metagame refreshes.` },
          ...state.eventsFeed,
        ],
        clock: { ...state.clock, paused: true, pauseReason: `${set.name} released! Watch the market react.` },
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
        clock: { ...state.clock, paused: true, pauseReason: result.banReason },
      }
    }
    case 'ROTATE_FORMAT': {
      const result = rotateFormat(state, action.count ?? 1)
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
        clock: { ...state.clock, paused: true, pauseReason: `Rotated: ${result.rotatedNames}` },
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
    case 'START_GAME':
      // Begin a run from the onboarding config (name/archetype/cadence applied).
      return createInitialState({ ...action.config, started: true })
    case 'RESET':
      return createInitialState()
    default:
      return state
  }
}

// Apply the clock-attention directive advanceWeek attached to the resolved week.
// Interesting moments pause (hard stop) or surface a "watch this" note; an
// uneventful week leaves the clock running unchanged at the player's speed.
function applyClockDirective(next) {
  const d = next.clock.autoEvent
  const clock = { ...next.clock, autoEvent: null }

  if (!d) return { ...next, clock }

  if (d.pause) {
    return { ...next, clock: { ...clock, paused: true, pauseReason: d.reason } }
  }
  if (d.slow) {
    // Surface what to watch, but keep playing at the player's speed.
    return { ...next, clock: { ...clock, pauseReason: d.reason } }
  }
  return { ...next, clock }
}

const TICK_MS = 2000 // wall-clock ms per simulated week at speed 1 (1× = a calm
// ~2s/week; 2× ~1s, 4× ~0.5s). Every week is simulated — no quiet-week skipping.

export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (state.clock.paused) return
    const id = setInterval(() => dispatch({ type: 'TICK' }), TICK_MS / state.clock.speed)
    return () => clearInterval(id)
  }, [state.clock.paused, state.clock.speed])

  const play = useCallback(() => dispatch({ type: 'PLAY' }), [])
  const pause = useCallback((reason) => dispatch({ type: 'PAUSE', reason }), [])
  const setSpeed = useCallback((speed) => dispatch({ type: 'SET_SPEED', speed }), [])
  const release = useCallback((draft) => dispatch({ type: 'RELEASE_SET', draft }), [])
  const banCardAction = useCallback((cardId) => dispatch({ type: 'BAN_CARD', cardId }), [])
  const rotate = useCallback((count) => dispatch({ type: 'ROTATE_FORMAT', count }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  // A nonce so consecutive rips of the same set in the same week differ.
  const ripNonce = useRef(0)
  const rip = useCallback((setId) => dispatch({ type: 'RIP_PACK', setId, nonce: ripNonce.current++ }), [])
  const startGame = useCallback((config) => dispatch({ type: 'START_GAME', config }), [])
  const comp = useCallback((personaId) => dispatch({ type: 'COMP_PERSONA', personaId }), [])
  const sponsor = useCallback((personaId) => dispatch({ type: 'SPONSOR_PERSONA', personaId }), [])
  const unsponsor = useCallback((personaId) => dispatch({ type: 'DROP_SPONSOR', personaId }), [])

  return { state, play, pause, setSpeed, release, ban: banCardAction, rotate, reset, rip, startGame, comp, sponsor, unsponsor }
}
