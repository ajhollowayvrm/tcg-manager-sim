import { useCallback, useEffect, useReducer, useRef } from 'react'
import { createInitialState } from './initialState.js'
import { advanceWeek } from './simulation.js'
import { releaseSet } from './sets.js'

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
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return { state, play, pause, setSpeed, release, reset }
}
