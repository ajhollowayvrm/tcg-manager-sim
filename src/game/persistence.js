// Autosave layer. The entire game lives in one plain, JSON-serializable reducer
// state (see initialState.js — no functions, Maps, or class instances are ever
// stored), so persistence is just JSON.stringify into localStorage on every
// change and JSON.parse back on load. There is no manual save button: the run
// is always saved, and reloading the tab resumes exactly where you left off.

const KEY = 'tcg-manager-sim/save'

// Bump when the state shape changes incompatibly. A loaded save whose version
// doesn't match is discarded rather than fed to a sim that expects new fields —
// better a fresh start than a crash on a half-migrated old run.
//
// v2: added booster formats (set.packFormat), counter directives
// (signatureCard.counter), and distributors + scalper heat (state.distributors,
// state.scalperHeat).
// v3: replaced rotate with pull-from-print (set.outOfPrint, card appreciation),
// and added reprints (set.reprintOf/firstEdition/reprintBuzz, card
// reprintOfCardId, draft.reprintedCards).
// v4: the clock went MANUAL — its shape changed (paused/speed/pauseReason →
// reason). A v3 save's clock is stale; invalidating avoids a half-migrated run.
// v5: product SKUs — a set carries a `products` lineup (booster + optional
// bundle/spc/tin, each with its own supply/sold). A v4 set lacks it (revenue has
// a legacy fallback, but invalidating keeps the per-SKU UI consistent).
// v6: promo cards (card.promo, unpullable) + organized play. New card flag;
// invalidate so the promo/pull filters and OP panel start consistent.
const VERSION = 6

// True only where a real localStorage exists. Guards SSR / the headless
// playtest harness (tools/playtest.mjs runs the sim in plain Node), and the
// rare browser that throws on localStorage access (privacy mode, etc.).
function hasStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
}

// Read the saved run, or null if there's nothing valid to resume. Any parse
// error, version mismatch, or storage fault falls through to null so a corrupt
// save can never wedge startup — the caller just begins a new game.
export function loadState() {
  if (!hasStorage()) return null
  let raw
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== VERSION || !parsed.state) return null
    return parsed.state
  } catch {
    // Corrupt blob — clear it so we don't keep trying to parse garbage.
    clearSave()
    return null
  }
}

// Persist the current state. Wrapped in the version envelope. Swallows quota /
// access errors: a failed autosave should never break the running game.
export function saveState(state) {
  if (!hasStorage()) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, state }))
  } catch {
    // Quota exceeded or storage disabled mid-session — nothing actionable to do.
  }
}

// Drop the save. Called when the player starts a new game / resets, so the old
// run can't resurrect on the next reload.
export function clearSave() {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
