import { useCallback, useEffect, useReducer, useRef } from 'react'
import { createInitialState } from './initialState.js'
import { advanceWeek } from './simulation.js'
import { releaseSet } from './sets.js'
import { banCard, rotateFormat } from './bans.js'

// Reducer-driven game state. The clock ticks via setInterval while playing;
// each tick dispatches a 'TICK' that runs one simulation week.

function reducer(state, action) {
  switch (action.type) {
    case 'TICK':
      return advanceWeek(state)
    case 'PLAY':
      return { ...state, clock: { ...state.clock, paused: false, pauseReason: null } }
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
    case 'RESET':
      return createInitialState()
    default:
      return state
  }
}

const TICK_MS = 800 // wall-clock ms per simulated week at speed 1

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

  return { state, play, pause, setSpeed, release, ban: banCardAction, rotate, reset }
}
