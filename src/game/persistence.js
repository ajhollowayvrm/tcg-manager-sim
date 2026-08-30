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
// v7: zero-player / zero-satisfaction start + reworked loss model (cash can go
// negative as a loan with weekly interest; debt-spiral / broke-and-abandoned /
// -100 revolt are the only ruins). New state.segmentLean; segments start at 0.
// v8: persistent character roster (state.characters), signature cards can carry
// characterId/treatment, cards can carry characterId. A v7 save predates the
// roster entirely.
// v9: the collector/reseller pivot — competitive UI hidden (bans/organized
// play/metagame panels removed, sim still runs headless); new state.franchise
// (Franchise Reputation), state.supplyChainCapacity, state.pendingWaves
// (staggered regional releases); products carry a `channels` split; pack
// format slots carry `iconOnly`. A v8 save predates all of these.
// v10: serialized chase cards (card.serialCap/serialIssued), grading partners
// (state.gradingPartners, card.graded), and regional-depth extras on
// pendingWaves entries (leadRegionName, adjusted). A v9 save predates all of
// these.
// v11: mimicking the live hobby — god packs (state.lastRip.isGodPack, no new
// persisted fields beyond that), live box breaks (no new state), the anti-
// scalping toolkit (state.purchaseLimitPolicy/phantomStockPolicy), and
// population reports (card.gradedPopulation). A v10 save predates these.
// v12: the counter directive is gone — competitive silver-bullet/archetype-
// suppression cards were the last competitive-only feature in the set builder
// (signatureCard.counter removed). A v11 save predates this.
// v13: the competitive engine is fully removed — no more state.metagame
// (archetypes/diversity/solveLevel/powerLevel/archetypeBalance), no more
// `competitive` player segment (state.segments/segmentLean are now
// {casual, collectors} only), new state.printIntensity (nostalgia-erosion
// dial) and per-set `buzz`. A v12 save predates all of these.
// v14: two new one-off persona actions (invitePrerelease, sponsorTournament —
// no new persisted fields, just personas/sets patches already covered by
// existing shapes) and special release events (set.releaseEvent on the
// draft/set, optional, defaults to 'none'). A v13 save degrades gracefully
// (all new fields read with ?./??), bumped for hygiene only.
// v15: a rival TCG (state.rival — a persistent competitor strength gauge, see
// rival.js), replacing the old one-shot rival_release flavor event. A v14
// save predates state.rival; applyRival no-ops on a missing rival, but
// invalidating keeps the new TopBar meter consistent from week 1.
// v16: merchandise (state.merchLines, state.lastMerchRevenue — see merch.js)
// and cross-media ventures (state.mediaDeals, state.mediaReputationFloor,
// state.mediaWomMultiplier — see media.js). A v15 save predates all of these;
// the new fields' ?./?? fallbacks would otherwise silently no-op them.
// v17: the set builder went collector-first. The draft/set `powerBudget` is now
// `designLoudness` (a presentation dial, not a strength ceiling); signature
// cards dropped the mechanical rules-text mode for `appeal`/`finish`/
// `flavorText`/`artNotes`; block gimmicks are OPTIONAL and the roster grew from
// 4 to 28 (carrying `category`/`devCostMul`), so blocks can now hold a null
// `gimmickId`/`gimmickName`/`treatmentLabel` and carry `gimmickCategory`; sets
// carry `bloat`/`sizeScore` (set size now drives buzz, the discovery wave, dev
// cost and chase density) and `spotlight`/`spotlightAppeal` (pre-launch
// reveals). A v16 save has the old field names throughout and predates every
// size/spotlight field — invalidating is far cleaner than migrating a whole
// card catalogue.
const VERSION = 17

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
//
// This deliberately touches ONLY the run key. Prestige and the hall of fame are
// account-level records that must outlive any single run — see below.
export function clearSave() {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// ---- Prestige & hall of fame (account-level, outlives every run) -----------
//
// Stored under their OWN keys with their own version, for three reasons:
// clearSave() must not wipe them when a player resets a run; they must survive
// every future bump of the run save's VERSION; and "wipe my run" and "wipe my
// whole history" should be genuinely different actions. They are also tiny and
// must load synchronously, before createInitialState applies unlocked perks.

const PRESTIGE_KEY = 'tcg-manager-sim/prestige'
const HOF_KEY = 'tcg-manager-sim/hall-of-fame'
const ACCOUNT_VERSION = 1
const HOF_MAX = 20

function readJson(key, fallback) {
  if (!hasStorage()) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== ACCOUNT_VERSION) return fallback
    return parsed.data ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, data) {
  if (!hasStorage()) return
  try {
    localStorage.setItem(key, JSON.stringify({ version: ACCOUNT_VERSION, data }))
  } catch {
    /* quota or storage disabled — nothing actionable */
  }
}

// Banked legacy points across every run the player has retired.
export function loadPrestige() {
  const p = readJson(PRESTIGE_KEY, null)
  return { banked: Number(p?.banked) || 0, runs: Number(p?.runs) || 0 }
}

export function bankPrestige(points) {
  const cur = loadPrestige()
  const next = { banked: cur.banked + Math.max(0, Math.round(points || 0)), runs: cur.runs + 1 }
  writeJson(PRESTIGE_KEY, next)
  return next
}

// Explicit, separate from clearSave() — wiping a run must never wipe a career.
export function clearPrestige() {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(PRESTIGE_KEY)
    localStorage.removeItem(HOF_KEY)
  } catch {
    /* ignore */
  }
}

export function loadHallOfFame() {
  const rows = readJson(HOF_KEY, [])
  return Array.isArray(rows) ? rows : []
}

export function recordHallOfFame(entry) {
  const rows = [...loadHallOfFame(), entry]
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, HOF_MAX)
  writeJson(HOF_KEY, rows)
  return rows
}
