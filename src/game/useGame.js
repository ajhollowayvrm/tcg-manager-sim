import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createInitialState } from './initialState.js'
import { reducer } from './reducer.js'
import { loadState, saveState, loadPrestige, onSaveStatus, exportSave, importSave } from './persistence.js'
import { unlockedPerks } from './legacy.js'

// The React binding over the game reducer. Every state transition lives in
// reducer.js so the headless playtest harness can drive the real game rather
// than a hand-written mirror of it; this file owns only the React wiring —
// the hook, the autosave effects, and the action callbacks.
//
// Time is MANUAL: the player clicks "Advance Week", which dispatches a single
// 'TICK' to run one simulation week. There's no auto-timer.

// A fresh run, carrying whatever the player's career has already unlocked.
// Prestige lives in localStorage and loads synchronously (see persistence.js),
// so this stays cheap; only the RUN save is asynchronous.
function freshState() {
  const p = loadPrestige()
  return createInitialState({ prestige: { ...p, perks: unlockedPerks(p.banked) } })
}

export function useGame() {
  // Boot is ASYNCHRONOUS now: the run save lives in IndexedDB (a week-312 run
  // serialized to 4.07 MB against localStorage's ~5 MB quota, and the failure
  // was silent). We start on a fresh state, then HYDRATE if a save comes back.
  // `booting` lets App render a loading state instead of flashing onboarding at
  // a returning player.
  const [state, dispatch] = useReducer(reducer, undefined, freshState)
  const [booting, setBooting] = useState(true)
  const [saveError, setSaveError] = useState(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    loadState()
      .then((saved) => { if (!cancelled && saved) dispatch({ type: 'HYDRATE', state: saved }) })
      .catch(() => { /* a corrupt save must never wedge startup */ })
      .finally(() => { if (!cancelled) setBooting(false) })
    return () => { cancelled = true }
  }, [])

  // A failed autosave used to be entirely silent. Now it surfaces.
  useEffect(() => onSaveStatus(setSaveError), [])

  // Autosave: persist on every state change, debounced so a burst of actions in
  // one week doesn't hammer localStorage. The trailing write always lands, so the
  // latest state is never lost; on unmount we flush immediately so a reload right
  // after an action is safe.
  useEffect(() => {
    // Never write while booting: the reducer starts on a FRESH state, so an
    // autosave firing before HYDRATE lands would overwrite the real save with
    // an empty run.
    if (booting) return
    const id = setTimeout(() => saveState(stateRef.current), 400)
    return () => clearTimeout(id)
  }, [state, booting])

  useEffect(() => {
    // Flush the freshest state when the tab is hidden/closed — covers the case
    // where the user navigates away inside the debounce window.
    const flush = () => { if (!booting) saveState(stateRef.current) }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [booting])

  // Manual time: advance one week per click. No timer, no play/pause/speed.
  const advanceWeekAction = useCallback(() => dispatch({ type: 'TICK' }), [])
  const release = useCallback((draft) => dispatch({ type: 'RELEASE_SET', draft }), [])
  const pull = useCallback((setId) => dispatch({ type: 'PULL_FROM_PRINT', setId }), [])
  const reprint = useCallback((setId, printRun) => dispatch({ type: 'REPRINT_SET', setId, printRun }), [])
  const toggleOddsPublished = useCallback((setId) => dispatch({ type: 'TOGGLE_ODDS_PUBLISHED', setId }), [])
  const adjustWave = useCallback((setId, direction) => dispatch({ type: 'ADJUST_PENDING_WAVE', setId, direction }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  // `identity` carries the archetype, traits, hook, pronouns and species epithet
  // — see createCharacter in characters.js.
  // `lineage` ({ kindId, parentIds }) makes the new character grow out of one
  // or two already on the roster — see characters.js's createLineageCharacter.
  const addCharacter = useCallback((name, identity, lineage) => dispatch({ type: 'ADD_CHARACTER', name, identity, lineage }), [])
  const updateCharacter = useCallback((id, patch) => dispatch({ type: 'UPDATE_CHARACTER', id, patch }), [])
  // The CHARACTER's own identity, as opposed to one form's — see people.js.
  const updatePerson = useCallback((id, patch) => dispatch({ type: 'UPDATE_PERSON', id, patch }), [])
  // The card library — Studio > Cards. See carddesigns.js.
  const addCardDesign = useCallback((design) => dispatch({ type: 'ADD_CARD_DESIGN', design }), [])
  const updateCardDesign = useCallback((id, patch) => dispatch({ type: 'UPDATE_CARD_DESIGN', id, patch }), [])
  const removeCardDesign = useCallback((id) => dispatch({ type: 'REMOVE_CARD_DESIGN', id }), [])
  const printCardDesign = useCallback((id) => dispatch({ type: 'PRINT_CARD_DESIGN', id }), [])
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
  const purchaseUpgradeAction = useCallback((id) => dispatch({ type: 'PURCHASE_UPGRADE', id }), [])
  // Illustrator exclusives (artists.js) and brand-partner promos (partners.js).
  const signArtist = useCallback((artistId, termWeeks) => dispatch({ type: 'SIGN_ARTIST_CONTRACT', artistId, termWeeks }), [])
  const endArtist = useCallback((artistId) => dispatch({ type: 'END_ARTIST_CONTRACT', artistId }), [])
  const signPartner = useCallback((partnerId, options) => dispatch({ type: 'SIGN_PARTNER_PROMO', partnerId, options }), [])
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
  // Grassroots: the standing programme level and one-off grants (grassroots.js).
  const setGrassroots = useCallback((level) => dispatch({ type: 'SET_GRASSROOTS', level }), [])
  const fundGrantAction = useCallback((kindId) => dispatch({ type: 'FUND_GRANT', kindId }), [])
  // Studio standards. `kind` is 'raritySheet' | 'packFormat' | 'blueprint';
  // saving is an upsert, so the panel's edits and the set builder's "save as
  // standard" are the same call. See standards.js.
  const saveStandard = useCallback((kind, record) => dispatch({ type: 'SAVE_STANDARD', kind, record }), [])
  const deleteStandard = useCallback((kind, id) => dispatch({ type: 'DELETE_STANDARD', kind, id }), [])
  const retire = useCallback(() => dispatch({ type: 'RETIRE_STUDIO' }), [])
  // Manual export/import — the escape hatch, and the fallback whenever a write
  // fails. Import replaces the live run wholesale.
  const exportRun = useCallback(() => exportSave(stateRef.current), [])
  const importRun = useCallback((text) => {
    const loaded = importSave(text)
    if (!loaded) return false
    dispatch({ type: 'HYDRATE', state: loaded })
    return true
  }, [])

  return { state, advanceWeek: advanceWeekAction, release, pull, reprint, adjustWave, reset, addCharacter, updateCharacter, updatePerson, addCardDesign, updateCardDesign, removeCardDesign, printCardDesign, rip, startGame, comp, sponsor, unsponsor, invitePrerelease: invitePrereleaseAction, sponsorTournament: sponsorTournamentAction, signDist, dropDist, cultivateDist, upgradeSupplyChain: upgradeSupplyChainAction, purchaseUpgrade: purchaseUpgradeAction, signArtist, endArtist, signPartner, signGrading, dropGrading, cultivateGrading, runBreak: runBreakAction, togglePurchaseLimits, togglePhantomStock, toggleOddsPublished, launchMerch, refreshMerch, retireMerch, pitchMedia, setGoodwill, setGrassroots, fundGrant: fundGrantAction, retire, saveStandard, deleteStandard, booting, saveError, exportRun, importRun }
}
