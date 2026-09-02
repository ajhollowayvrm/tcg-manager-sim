// Autosave layer. The entire game lives in one plain, JSON-serializable reducer
// state (see initialState.js — no functions, Maps, or class instances are ever
// stored), so persistence is just JSON.stringify into localStorage on every
// change and JSON.parse back on load. There is no manual save button: the run
// is always saved, and reloading the tab resumes exactly where you left off.

import { normalizeCharacter } from './characters.js'
import { derivePeople } from './people.js'
import { withCast } from './cast.js'
import { normalizeCardDesign } from './carddesigns.js'
import { normalizeIllustrationSet } from './illustrationsets.js'
import {
  normalizeRaritySheetStandard,
  normalizePackFormatStandard,
  normalizeBlueprint,
} from './standards.js'

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
// v18: the audit remediation pass. New persisted fields — state.goodwillSpend
// and state.lastOverhead (recurring costs, overhead.js), state.breakHistory
// (break saturation), state.legacy / state.retirement / state.prestige (the
// legacy score and cross-run prestige), gameOver.kind, set.printLevel and
// set.riderFatigue. Beyond the new fields, three stats changed MEANING under
// the same names: printIntensity now relaxes toward a shelf-derived resting
// level instead of decaying to zero, cadence unrest drives toward a floor
// instead of integrating without bound, and franchise.reputation grows ~2.6x
// faster. A v17 save's values for all three were produced under different
// rules and would read as nonsense, so invalidating is correct — as with v14
// and v17. This version also moves the run save from localStorage to
// IndexedDB; a v17 localStorage blob is discarded rather than migrated,
// because its numbers are stale under the new rules anyway.
//
// v18 HOLDS through the character-identity change (archetypes, traits, a hook,
// pronouns, story beats and a fame history on every character; see
// content/archetypes.js). Every one of those fields is ADDITIVE, and hydrate()
// below fills them through normalizeCharacter, so a v18 save loads and keeps
// playing. Its characters land on the 'unaligned' archetype, whose multipliers
// are all 1 and whose tag list is empty — their fame behaves exactly as it did.
// This breaks the habit set by v14 and v17, which bumped for hygiene alone. The
// habit is not worth a run in progress: a bump does not migrate a save, it
// DISCARDS it (see loadState below), and nothing here reads a stale number.
//
// v18 ALSO HOLDS through illustration sets (`state.illustrationSets`, and the
// one optional `set.illustrationAppeal` number; see illustrationsets.js). Both
// are ADDITIVE and hydrate() below fills the array through
// normalizeIllustrationSet. Every GROUP read site resolves to an identity on a
// save that has no groups: completionPremium returns exactly 1, groupLift
// returns { pop: 0, hypeMul: 1 }, illustrationAppeal reads as 0, the overuse
// pressure is 0, and the persona focus term adds 0 without drawing from the
// rng. Card records are untouched, so CARD_DEFAULTS and the save's size profile
// are unchanged. Same call as the character-identity change above.
//
// BUT DO NOT READ THAT AS "an old run plays identically". It loads, it keeps
// its cards and its money, and nothing crashes — that is the guarantee, and it
// is the one the no-migration rule actually needs. Two things in this feature
// deliberately DO change an old run's numbers, and an earlier version of this
// note wrongly claimed otherwise:
//
//   Artist collector heat starts at 0 and climbs from week one off cards the
//   save already holds, so fairValue's artistLift (up to 1.25x) is live
//   immediately, and once a hot artist crosses the chatter threshold a new
//   conditional rng draw shifts that persona's remaining stream.
//
//   Community discovery can mint a group in an old save that never had one.
//
// Both are the point of the feature rather than accidents, and neither
// invalidates the save the way a changed field's MEANING would.
//
// v18 HOLDS AGAIN through studio standards (`state.raritySheets`,
// `state.packFormats`, `state.blueprints`; see standards.js), and this one is
// the easiest call of the three. All three arrays are ADDITIVE, hydrate() below
// fills them through their normalisers, and every read site is a lookup into a
// library that is simply empty on an old save: seedFromStandards returns an
// empty patch, so createDraft seeds the built-in sheet and the Classic pack
// exactly as it always has, and the import controls render as "nothing saved
// yet". Unlike illustration sets there is no caveat to attach — a standard is
// COPIED into a draft and never linked, so nothing here can reach an existing
// set, an existing card, or the weekly tick at all. An old run does play
// identically, and that is a property of the design rather than luck: see rule 1
// in standards.js for why the copy is not optional.
//
// Nothing was added to a CARD, so CARD_DEFAULTS and the save's size profile are
// untouched — a handful of named config objects against a catalogue that is 92%
// of the save is invisible.
const VERSION = 18

// ---- Where the run save lives ----------------------------------------------
//
// IndexedDB, not localStorage. A measured week-312 run serialized to 4.07 MB
// against a ~5 MB localStorage quota, and `saveState` swallowed the resulting
// QuotaExceededError — so a long run silently stopped saving and the player
// lost it on the next reload with no warning at all. IndexedDB's quota is
// orders of magnitude larger. The state is also SHRUNK on the way out (see
// serialize below), which takes the same run to well under 1 MB, so the two
// fixes together leave a very large margin.
//
// The cost is that IndexedDB is asynchronous, so the app now boots through a
// loading state (see useGame.js's HYDRATE action) instead of initialising the
// reducer synchronously.
const DB_NAME = 'tcg-manager-sim'
const DB_STORE = 'runs'
const DB_KEY = 'current'

function hasIndexedDb() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
}

function dbGet(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  }))
}

function dbPut(key, value) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(value, key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

function dbDelete(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })).catch(() => false)
}

// ---- Shrinking the state ----------------------------------------------------
//
// The card catalogue is essentially the whole save: a week-312 run holds ~6,000
// cards, each carrying 26 full-precision price points. Three cheap measures cut
// that by roughly 4-5x with no visible loss.

// Measured on a week-200 run: cards are 92% of the whole save, and a single
// card serializes to ~650 bytes. Where those bytes go, and what each measure
// below reclaims:
//   priceHistory  154B — 26 full-precision floats
//   popFactors     96B — four unrounded floats
//   hype/momentum  37B — two more
//   ~200B          — the KEY NAMES of ten optional fields sitting at their
//                    default value on almost every card
const HOT_HISTORY = 26 // a fresh card keeps its full sparkline
const COLD_HISTORY = 8 // an old one keeps just enough to draw a trend
const HOT_AGE_WEEKS = 52 // how recent a set has to be for its cards to stay hot

const round = (n, dp) => (typeof n === 'number' ? Math.round(n * 10 ** dp) / 10 ** dp : n)

// Fields advanceWeek recomputes from scratch every tick. Persisting them costs
// space and buys nothing — they are stale the instant the next week resolves.
const DERIVED_KEYS = ['movers', 'scalperState', 'lastRip']

// Optional card fields and the value they hold on the overwhelming majority of
// cards. Dropped on write and restored on read, so this is lossless — it just
// stops paying for `"characterId":null` six thousand times.
const CARD_DEFAULTS = {
  secret: false, signature: false, promo: false, treatment: null,
  banned: false, rotated: false, outOfPrint: false,
  firstEdition: false, reprint: false,
  graded: false, gradedPopulation: 0,
  artistId: null, characterId: null,
  serialCap: null, serialIssued: 0,
  momentum: 0, controversy: 0, legacyValue: 0,
}

export function serialize(state) {
  const setAge = new Map(
    (state.sets ?? []).map((s) => [s.id, (state.week ?? 0) - (s.releasedWeek ?? 0)]),
  )
  const out = { ...state }
  for (const k of DERIVED_KEYS) delete out[k]

  out.cards = (state.cards ?? []).map((c) => {
    // Age, not print status, decides how much history to keep: a catalogue that
    // is never pruned has every set "live", so keying off `rotated` trimmed
    // almost nothing on exactly the runs that needed it most.
    const age = setAge.get(c.setId) ?? Infinity
    const keep = age <= HOT_AGE_WEEKS ? HOT_HISTORY : COLD_HISTORY
    const card = {
      ...c,
      singlePrice: round(c.singlePrice, 2),
      sealedPrice: round(c.sealedPrice, 2),
      hype: round(c.hype, 3),
      momentum: round(c.momentum, 3),
      priceHistory: (c.priceHistory ?? []).slice(-keep).map((p) => round(p, 2)),
    }
    if (c.popFactors) {
      const f = c.popFactors
      card.popFactors = {
        punch: round(f.punch, 1), rarity: round(f.rarity, 1),
        artAppeal: round(f.artAppeal, 1), hype: round(f.hype, 1),
      }
    }
    for (const [k, def] of Object.entries(CARD_DEFAULTS)) {
      if (card[k] === def || card[k] === undefined) delete card[k]
    }
    // castIds is an ARRAY, so the identity comparison above can never match a
    // fresh empty one and every card in the game would carry a `"castIds":[]`.
    // That is precisely the per-card bloat the move to IndexedDB at v18 was
    // fighting, so it is handled explicitly. A single-name cast is dropped too:
    // it is exactly `[characterId]`, which is already on the record, and
    // hydrate rebuilds it — so only a genuine multi-cast card costs anything.
    if (!card.castIds?.length || (card.castIds.length === 1 && card.castIds[0] === c.characterId)) {
      delete card.castIds
    }
    return card
  })

  // The person layer. STRUCTURE IS DERIVED AND IS NOT WRITTEN: `personId` on a
  // form, and `rootFormId`/`descendedFromIds` on a person, are all rebuilt by
  // derivePeople from the lineage links on the way back in. Only the AUTHORED
  // text and the EARNED numbers are persisted.
  //
  // That is a size decision, not a tidiness one. A week-312 run already
  // serialised to 4.07 MB against a ~5 MB quota and silently stopped saving,
  // which is why the run save moved to IndexedDB at v18; a new top-level array
  // carrying a 52-week history per record does not get to undo that work.
  if (state.people?.length) {
    out.people = state.people.map((p) => {
      const person = { ...p }
      delete person.rootFormId
      delete person.descendedFromIds
      person.recognition = round(p.recognition, 1)
      person.saturation = round(p.saturation, 1)
      person.recognitionHistory = (p.recognitionHistory ?? []).map((v) => Math.round(v))
      if (p.favor) {
        person.favor = Object.fromEntries(
          Object.entries(p.favor).map(([k, v]) => [k, round(v, 3)]),
        )
      }
      return person
    })
  }
  if (state.characters?.length) {
    out.characters = state.characters.map((c) => {
      if (c.personId == null) return c
      const form = { ...c }
      delete form.personId
      return form
    })
  }
  return out
}

// Restore what serialize dropped. Every omitted field is read with a
// `?? default` somewhere, so this is belt-and-braces rather than strictly
// required — but a card record that changes shape depending on whether it came
// from a save is exactly the kind of thing that bites six months later.
export function hydrate(state) {
  if (!state?.cards) return state
  // Hoisted out of the map below: built inside it, this would rebuild a
  // several-thousand-entry Set once per illustration set.
  const liveCardIds = new Set(state.cards.map((c) => c.id))
  // Hoisted for the same reason: the blueprint normaliser below needs the ids
  // that SURVIVED these two passes, not the ids that went into them.
  const sheets = onlyOneDefault((state.raritySheets ?? []).map(normalizeRaritySheetStandard).filter(Boolean))
  const formats = onlyOneDefault((state.packFormats ?? []).map(normalizePackFormatStandard).filter(Boolean))
  const next = {
    ...state,
    // withCast reconciles the two cast fields in both directions: a card saved
    // before multi-cast has only `characterId` and gains the matching list, and
    // a multi-cast card whose list serialize() shortened gets it back. Neither
    // needs a VERSION bump — the lead is unchanged and the list is derived.
    cards: state.cards.map((c) => withCast({ ...CARD_DEFAULTS, ...c })),
    // Characters gained an IDENTITY after they first entered the save at v8 —
    // an archetype, traits, a hook, pronouns, story beats and a fame history.
    // That change is purely ADDITIVE, so it deliberately does NOT bump VERSION
    // (see the note under v18 below): losing a run in progress would cost the
    // player far more than the tidier schema is worth. normalizeCharacter fills
    // the new fields instead, and an older character lands on the 'unaligned'
    // archetype, whose multipliers are all 1 — so its fame behaves exactly as it
    // did before. This is the character-shaped twin of the CARD_DEFAULTS restore
    // on the line above.
    // filter(Boolean) is load-bearing: normalizeCharacter returns null for a
    // falsy record, and importSave validates only the version and the presence
    // of a state object. Without the filter, one null inside an imported
    // `characters` array survives into state and throws in driftCharacters on
    // the very next tick — wedging every following week, not just one.
    characters: (state.characters ?? []).map(normalizeCharacter).filter(Boolean),
    // Illustration sets, on the same additive terms as characters above. The
    // live card-id set is passed in so a group cannot keep pointing at a card
    // that no longer exists (an imported partial save is the realistic way that
    // happens), and normalizeIllustrationSet returns null for a group left with
    // fewer than two members — hence the same load-bearing filter(Boolean).
    // Artists gained a collector-heat field on the same additive terms — an
    // older save simply has none, lands on 0, and prices exactly as it did.
    artists: (state.artists ?? []).map((a) => ({ ...a, heat: a.heat ?? 0 })),
    // The business and community systems that arrived with the five-tab
    // navigation, all on the same additive terms: an older save has none of
    // them and lands on the empty defaults createInitialState seeds.
    artistContracts: Array.isArray(state.artistContracts) ? state.artistContracts : [],
    partnerDeals: Array.isArray(state.partnerDeals) ? state.partnerDeals : [],
    grassroots: { level: Math.min(1, Math.max(0, Number(state.grassroots?.level) || 0)) },
    grassrootsGrants: Array.isArray(state.grassrootsGrants) ? state.grassrootsGrants : [],
    upgrades: state.upgrades && typeof state.upgrades === 'object' ? state.upgrades : {},
    // The card library (Studio > Cards). Additive on the same terms as
    // everything above: a save from before it has none and lands on an empty
    // shelf. filter(Boolean) is load-bearing for the same reason it is on
    // characters — normalizeCardDesign returns null for a record it cannot
    // make sound, and one null in the array throws in the panel that renders it.
    cardDesigns: (state.cardDesigns ?? []).map(normalizeCardDesign).filter(Boolean),
    illustrationSets: (state.illustrationSets ?? [])
      .map((g) => normalizeIllustrationSet(g, liveCardIds))
      .filter(Boolean),
    // Studio standards, on the same additive terms, and with the same
    // load-bearing filter(Boolean): each normaliser returns null for a record it
    // cannot make sound, which for a sheet or a format means one its own
    // validator would reject. A library entry the release button would refuse is
    // worse than no entry — it sits there looking importable.
    raritySheets: sheets,
    packFormats: formats,
    // Blueprints resolve LAST, against the two SURVIVING libraries rather than
    // the raw arrays, so one that pins a sheet the player deleted — or one the
    // normaliser above just dropped — loses that half instead of handing the
    // builder a dangling id.
    blueprints: (state.blueprints ?? [])
      .map((b) => normalizeBlueprint(b, {
        sheetIds: new Set(sheets.map((s) => s.id)),
        formatIds: new Set(formats.map((f) => f.id)),
      }))
      .filter(Boolean),
  }
  // The person layer LAST, because it reads the characters the pass above just
  // normalised and writes back to both arrays.
  //
  // This is what lets the whole feature ship without a VERSION bump. A save from
  // before the person layer arrives with no `people` at all; derivePeople walks
  // the same-being lineage links and rebuilds one person per character, so a
  // pre-lineage save lands on a roster of one-form people that behaves exactly as
  // it did. It also repairs `personId` on every form, which serialize() strips on
  // the way out — structure is derived, never stored. Same additive contract as
  // normalizeCharacter above, one level up.
  const { people, characters } = derivePeople(next)
  return { ...next, people, characters }
}

// SAVE_STANDARD holds "exactly one default per library" by clearing the flag on
// every other record as it writes, so it can only be violated by a save that did
// not come from this game — an imported or hand-edited one. defaultOf silently
// takes the first, which is a quiet lie about which standard a new set will use,
// so the extras are cleared on the way in instead.
function onlyOneDefault(list) {
  let seen = false
  return list.map((s) => {
    if (!s.isDefault) return s
    if (seen) return { ...s, isDefault: false }
    seen = true
    return s
  })
}

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
//
// ASYNC, because the run save now lives in IndexedDB. Also sweeps up any old
// localStorage blob it finds: pre-v18 saves are stale under the rebalanced
// rules and are discarded rather than migrated, but the key is removed so it
// stops occupying quota forever.
export async function loadState() {
  if (hasStorage()) {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }
  if (!hasIndexedDb()) return null
  try {
    const parsed = await dbGet(DB_KEY)
    if (!parsed || parsed.version !== VERSION || !parsed.state) return null
    return hydrate(parsed.state)
  } catch {
    return null
  }
}

// ---- Save failure reporting -------------------------------------------------
//
// A failed autosave used to be entirely silent — `catch {}` — which is how a
// long run could stop saving without the player ever finding out. Listeners get
// told, and SettingsPanel surfaces it.
let saveFailure = null
const saveListeners = new Set()

export function onSaveStatus(fn) {
  saveListeners.add(fn)
  fn(saveFailure)
  return () => saveListeners.delete(fn)
}

function reportSaveStatus(failure) {
  if (saveFailure === failure) return
  saveFailure = failure
  for (const fn of saveListeners) {
    try { fn(failure) } catch { /* a listener must not break saving */ }
  }
}

// Persist the current state. Writes are QUEUED: IndexedDB is async and the
// caller (a debounced React effect) is not, so a burst of saves collapses into
// one in-flight write plus at most one pending follow-up.
let writing = false
let queued = null

export function saveState(state) {
  if (!hasIndexedDb() || !state) return
  queued = state
  if (writing) return
  flushQueue()
}

function flushQueue() {
  const state = queued
  queued = null
  if (!state) { writing = false; return }
  writing = true
  dbPut(DB_KEY, { version: VERSION, state: serialize(state) })
    .then(() => reportSaveStatus(null))
    .catch((err) => reportSaveStatus(err?.name === 'QuotaExceededError'
      ? 'Your browser is out of storage — this run is no longer being saved. Export it from Settings.'
      : 'This run could not be saved. Export it from Settings to be safe.'))
    .finally(() => { writing = false; if (queued) flushQueue() })
}

// ---- Export / import --------------------------------------------------------
//
// The manual escape hatch, and the fallback whenever a write fails.

export function exportSave(state) {
  return JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), state: serialize(state) })
}

// Returns the state, or null if the blob isn't a save this build can read.
export function importSave(text) {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || parsed.version !== VERSION || !parsed.state) return null
    return hydrate(parsed.state)
  } catch {
    return null
  }
}

// Drop the save. Called when the player starts a new game / resets, so the old
// run can't resurrect on the next reload.
//
// This deliberately touches ONLY the run key. Prestige and the hall of fame are
// account-level records that must outlive any single run — see below.
export function clearSave() {
  queued = null
  if (hasStorage()) {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }
  if (hasIndexedDb()) dbDelete(DB_KEY)
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
