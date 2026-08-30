import { useCallback, useEffect, useReducer, useRef } from 'react'
import { createInitialState } from './initialState.js'
import { reducer } from './reducer.js'
import { loadState, saveState, loadPrestige } from './persistence.js'
import { unlockedPerks } from './legacy.js'

// The React binding over the game reducer. Every state transition lives in
// reducer.js so the headless playtest harness can drive the real game rather
// than a hand-written mirror of it; this file owns only the React wiring —
// the hook, the autosave effects, and the action callbacks.
//
// Time is MANUAL: the player clicks "Advance Week", which dispatches a single
// 'TICK' to run one simulation week. There's no auto-timer.

// Lazy reducer init: resume a saved run if one exists, otherwise a fresh state.
// loadState() returns null in the harness / first visit / on any corrupt blob,
// so this is always safe.
function initState() {
  const saved = loadState()
  if (saved) return saved
  // A brand-new run still carries the player's career: banked legacy from
  // previous retirements unlocks perks (see legacy.js's PRESTIGE_PERKS).
  const p = loadPrestige()
  return createInitialState({ prestige: { ...p, perks: unlockedPerks(p.banked) } })
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
  const pull = useCallback((setId) => dispatch({ type: 'PULL_FROM_PRINT', setId }), [])
  const reprint = useCallback((setId, printRun) => dispatch({ type: 'REPRINT_SET', setId, printRun }), [])
  const toggleOddsPublished = useCallback((setId) => dispatch({ type: 'TOGGLE_ODDS_PUBLISHED', setId }), [])
  const adjustWave = useCallback((setId, direction) => dispatch({ type: 'ADJUST_PENDING_WAVE', setId, direction }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  const addCharacter = useCallback((name, species) => dispatch({ type: 'ADD_CHARACTER', name, species }), [])
  // A nonce so consecutive rips of the same set in the same week differ.
  const ripNonce = useRef(0)
  const rip = useCallback((setId) => dispatch({ type: 'RIP_PACK', setId, nonce: ripNonce.current++ }), [])
  const startGame = useCallback((config) => dispatch({ type: 'START_GAME', config }), [])
  const comp = useCallback((personaId) => dispatch({ type: 'COMP_PERSONA', personaId }), [])
  const sponsor = useCallback((personaId) => dispatch({ type: 'SPONSOR_PERSONA', personaId }), [])
  const unsponsor = useCallback((personaId) => dispatch({ type: 'DROP_SPONSOR', personaId }), [])
  const invitePrereleaseAction = useCallback((personaId, setId) => dispatch({ type: 'INVITE_PRERELEASE', personaId, setId }), [])
  const sponsorTournamentAction = useCallback((personaId) => dispatch({ type: 'SPONSOR_TOURNAMENT', personaId }), [])
  const signDist = useCallback((distId, setId) => dispatch({ type: 'SIGN_DISTRIBUTOR', distId, setId }), [])
  const dropDist = useCallback((distId) => dispatch({ type: 'DROP_DISTRIBUTOR', distId }), [])
  const cultivateDist = useCallback((distId) => dispatch({ type: 'CULTIVATE_DISTRIBUTOR', distId }), [])
  const upgradeSupplyChainAction = useCallback(() => dispatch({ type: 'UPGRADE_SUPPLY_CHAIN' }), [])
  const signGrading = useCallback((partnerId) => dispatch({ type: 'SIGN_GRADING_PARTNER', partnerId }), [])
  const dropGrading = useCallback((partnerId) => dispatch({ type: 'DROP_GRADING_PARTNER', partnerId }), [])
  const cultivateGrading = useCallback((partnerId) => dispatch({ type: 'CULTIVATE_GRADING_PARTNER', partnerId }), [])
  const breakNonce = useRef(0)
  const runBreakAction = useCallback((kind, setId) => dispatch({ type: 'RUN_BREAK', kind, setId, nonce: breakNonce.current++ }), [])
  const togglePurchaseLimits = useCallback(() => dispatch({ type: 'TOGGLE_PURCHASE_LIMITS' }), [])
  const togglePhantomStock = useCallback(() => dispatch({ type: 'TOGGLE_PHANTOM_STOCK' }), [])
  const launchMerch = useCallback((kind) => dispatch({ type: 'LAUNCH_MERCH_LINE', kind }), [])
  const refreshMerch = useCallback((kind) => dispatch({ type: 'REFRESH_MERCH_LINE', kind }), [])
  const retireMerch = useCallback((kind) => dispatch({ type: 'RETIRE_MERCH_LINE', kind }), [])
  const pitchMedia = useCallback((dealId) => dispatch({ type: 'PITCH_MEDIA_DEAL', dealId }), [])
  const setGoodwill = useCallback((level) => dispatch({ type: 'SET_GOODWILL', level }), [])
  const retire = useCallback(() => dispatch({ type: 'RETIRE_STUDIO' }), [])

  return { state, advanceWeek: advanceWeekAction, release, pull, reprint, adjustWave, reset, addCharacter, rip, startGame, comp, sponsor, unsponsor, invitePrerelease: invitePrereleaseAction, sponsorTournament: sponsorTournamentAction, signDist, dropDist, cultivateDist, upgradeSupplyChain: upgradeSupplyChainAction, signGrading, dropGrading, cultivateGrading, runBreak: runBreakAction, togglePurchaseLimits, togglePhantomStock, toggleOddsPublished, launchMerch, refreshMerch, retireMerch, pitchMedia, setGoodwill, retire }
}
