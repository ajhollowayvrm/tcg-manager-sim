// Headless playtest harness for tuning. The sim is pure functions over plain
// state (advanceWeek + the action helpers), so we can play full multi-year runs
// in milliseconds with no browser — and sweep many strategies to get the
// *distributions* the brief's open tuning notes ask about (release cadence,
// survival, catalog-buzz trajectory, market variance).
//
// Run:  node tools/playtest.mjs            (summary across all strategies)
//       node tools/playtest.mjs --trace    (week-by-week for one run)
//
// NOTE: the engine is deterministic and seeded off string keys (week, set name).
// Variation across runs therefore comes from STRATEGY and SET NAMES, not from
// reseeding — so each strategy below also perturbs its set names for entropy.

import { createInitialState } from '../src/game/initialState.js'
import { advanceWeek } from '../src/game/simulation.js'
import { createDraft, createSignatureCard, releaseSet, setCost } from '../src/game/sets.js'
import { pullFromPrint } from '../src/game/bans.js'
import { resetCadence } from '../src/game/cadence.js'
import { getTier } from '../src/game/blocks.js'
import { distributeNewPlayers } from '../src/game/segments.js'

const HORIZON = 312 // ~6 years of weeks — a long run, per the brief's "year 6"

// ---- Reducer mirror (headless) -------------------------------------------
// Mirrors the transitions in useGame.js so a strategy can act on the state.

function applyRelease(state, draft) {
  const { set, existingSets, cards, cashDelta, printIntensity, softenedCards, newPlayers, blocks } = releaseSet(state, draft)
  // Mirror the reducer: a release brings a discovery wave of new players.
  const segments = { ...state.segments }
  distributeNewPlayers(segments, state.segmentLean, newPlayers ?? 0)
  return {
    ...state,
    cash: state.cash + cashDelta,
    sets: [...(existingSets ?? state.sets), set],
    // A card reprint may have softened existing originals (softenedCards).
    cards: [...(softenedCards ?? state.cards), ...cards],
    blocks: blocks ?? state.blocks, // major opens / rider refreshes a block
    segments,
    playerBase: segments.casual + segments.collectors,
    printIntensity,
    // Mirror the reducer: shipping a set resets the cadence pledge clock.
    cadence: state.cadence ? resetCadence(state.cadence, state.week) : state.cadence,
  }
}
function applyPull(state, setId) {
  const r = pullFromPrint(state, setId)
  if (!r) return state
  return { ...state, sets: r.sets, cards: r.cards, printIntensity: r.printIntensity, segments: r.segments, playerBase: r.playerBase, personas: r.personas }
}

// ---- Draft builder --------------------------------------------------------
// Build a releasable draft (>=5 signature cards) from a strategy's knobs.

function buildDraft(setNumber, knobs, nameSalt, tier = 'major', blocks = []) {
  const d = createDraft(setNumber, tier, blocks)
  d.name = `${knobs.namePool[(setNumber + nameSalt) % knobs.namePool.length]} ${setNumber}`
  // A major picks a theme; a rider inherits its block's theme (createDraft set it).
  if (tier === 'major') d.themeId = knobs.themes[(setNumber + nameSalt) % knobs.themes.length]
  d.designLoudness = knobs.designLoudness
  d.printRun = knobs.printRun
  d.pricePoint = knobs.pricePoint
  // Set size, as a position in the tier's band: 'tight' | 'default' | 'landmark'.
  // Defaults to the tier's own default length (balance-neutral — see sets.js's
  // sizeProfile), so only strategies that opt in exercise the size math.
  if (knobs.size && knobs.size !== 'default') {
    const [lo, hi] = getTier(tier).lengthRange
    const def = getTier(tier).defaultLength
    d.setLength = knobs.size === 'tight' ? lo
      : knobs.size === 'large' ? Math.round(def + (hi - def) * 0.5) // upper-middle of the band
      : hi
  }
  // Gimmicks are OPTIONAL now (createDraft seeds null = a plain themed era).
  // A strategy opts in with a `gimmicks` pool; we cycle it per major so runs
  // differ. IMPORTANT for baselining: strategies that want the pre-v17 balance
  // must name a gimmick explicitly, since the default is now no gimmick at all.
  if (tier === 'major' && knobs.gimmicks) {
    d.block = { ...d.block, gimmickId: knobs.gimmicks[(setNumber + nameSalt) % knobs.gimmicks.length] }
  }
  const n = 6
  d.signatureCards = Array.from({ length: n }, (_, i) => {
    const c = createSignatureCard(i + 1)
    c.name = `${d.name} Chase ${i + 1}`
    c.rarity = i < 2 ? 'mythic' : 'rare'
    // A strategy's "chase appeal" sets how loud its signature cards are.
    c.appeal = Math.min(100, knobs.chaseAppeal + (i === 0 ? 15 : 0))
    return c
  })
  return d
}

// ---- Strategies -----------------------------------------------------------
// Each decides what to do at the start of a week given the live state.

const NAME_POOL = ['Ember', 'Frost', 'Tempest', 'Verdant', 'Obsidian', 'Radiant', 'Abyssal', 'Gilded']
const THEMES = ['dragons', 'undead', 'cyber', 'nature', 'arcane'] // real theme ids from content/themes.js

// `minorEvery` (optional): drop a smaller rider set every N weeks BETWEEN majors,
// cycling minor→micro. This is how we model the major/minor cadence: majors are
// the format beats, riders are the in-between collector drops.
function makeStrategy({ name, cadence, knobs, rotateEvery, ignoreCash = false, minorEvery = null }) {
  return {
    name,
    // Called each week BEFORE advanceWeek. Returns the (possibly) acted-on state.
    act(state, ctx) {
      let s = state
      // Release on cadence if we can afford it (real setCost on the actual draft,
      // with a thin safety buffer so a strategy doesn't bankrupt itself printing).
      // The MAJOR beat tracks weeks since the last MAJOR (riders don't reset it);
      // the rider beat tracks weeks since ANY set (so they pace between majors).
      const lastSet = s.sets[s.sets.length - 1]
      const weeksSinceAny = lastSet ? s.week - lastSet.releasedWeek : Infinity
      const lastMajor = [...s.sets].reverse().find((x) => (x.tier ?? 'major') === 'major')
      const weeksSinceMajor = lastMajor ? s.week - lastMajor.releasedWeek : Infinity
      const isMajorDue = s.sets.length === 0 || weeksSinceMajor >= cadence
      if (isMajorDue) {
        const draft = buildDraft(s.sets.length + 1, knobs, ctx.salt, 'major')
        if (ignoreCash || s.cash > setCost(draft).total * 1.15) {
          s = applyRelease(s, draft)
          ctx.releases++
        }
      } else if (minorEvery && s.blocks?.length && weeksSinceAny >= minorEvery) {
        // Between majors: a rider riding the newest block. Alternate minor/micro.
        const tier = (ctx.riders % 2 === 0) ? 'minor' : 'micro'
        const draft = buildDraft(s.sets.length + 1, knobs, ctx.salt, tier, s.blocks)
        if (ignoreCash || s.cash > setCost(draft).total * 1.15) {
          s = applyRelease(s, draft)
          ctx.releases++
          ctx.riders++
        }
      }
      // Periodically pull the oldest in-print set to relieve design loudness
      // (the collector-native lever — picks any set; here we pick the oldest).
      if (rotateEvery && s.week > 0 && s.week % rotateEvery === 0) {
        const inPrint = s.sets.filter((x) => !x.rotated && !x.outOfPrint)
          .sort((a, b) => a.releasedWeek - b.releasedWeek)
        if (inPrint.length >= 2) {
          const before = s.sets.filter((x) => x.outOfPrint).length
          s = applyPull(s, inPrint[0].id)
          if (s.sets.filter((x) => x.outOfPrint).length > before) ctx.pulls++
        }
      }
      return s
    },
  }
}

const STRATEGIES = [
  makeStrategy({ name: 'Conservative', cadence: 16, rotateEvery: 104,
    knobs: { designLoudness: 45, printRun: 45, pricePoint: 4.5, chaseAppeal: 60, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Balanced', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 70, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Aggressive creep', cadence: 8, rotateEvery: 60,
    knobs: { designLoudness: 80, printRun: 65, pricePoint: 5.0, chaseAppeal: 88, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Overprint greed', cadence: 5, rotateEvery: null,
    knobs: { designLoudness: 70, printRun: 78, pricePoint: 8.0, chaseAppeal: 80, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Underprint scarcity', cadence: 14, rotateEvery: 104,
    knobs: { designLoudness: 50, printRun: 12, pricePoint: 5.5, chaseAppeal: 72, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Idle (never release)', cadence: Infinity, rotateEvery: null,
    knobs: { designLoudness: 50, printRun: 50, pricePoint: 4.5, chaseAppeal: 60, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  // Reckless: release as fast as possible at a punishing price regardless of
  // cash — should bankrupt itself. Confirms the loss condition is reachable.
  makeStrategy({ name: 'Reckless spender', cadence: 4, rotateEvery: null, ignoreCash: true,
    knobs: { designLoudness: 75, printRun: 80, pricePoint: 9.0, chaseAppeal: 82, namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  // Loud/splashy: only releases splashy, high-punch themes at high power and
  // never pulls a set to relieve design loudness. Should run printIntensity hot
  // and test whether collectors bleed under sustained loud design.
  makeStrategy({ name: 'Loud design spam', cadence: 10, rotateEvery: null,
    knobs: { designLoudness: 75, printRun: 50, pricePoint: 4.5, chaseAppeal: 75,
      namePool: NAME_POOL, themes: ['cute', 'racing', 'pirates', 'kaiju'], gimmicks: ['mega'] } }),

  // ---- Major/minor tier strategies ----------------------------------------
  // Block-builder: a major every 16 wk that OPENS a block, plus a minor/micro
  // rider every 6 wk between majors riding it. The "real TCG calendar" play.
  // Should survive and run a healthy release count with rich collector drops.
  makeStrategy({ name: 'Block builder (maj+min)', cadence: 16, minorEvery: 6, rotateEvery: 90,
    knobs: { designLoudness: 52, printRun: 50, pricePoint: 4.5, chaseAppeal: 72,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega', 'ascended', 'tera'] } }),
  // Rider spam: a major rarely (every 24 wk) but cheap riders constantly (every
  // 4 wk). Tests whether minors paper over a missing major — they reset cadence
  // (any set does) but DON'T recruit (small discovery) much, so the base should
  // grow slower than the block builder despite more releases. The interesting
  // "minors can't substitute for majors" tension.
  makeStrategy({ name: 'Rider spam (few majors)', cadence: 24, minorEvery: 4, rotateEvery: 90,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 75,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['phantasmal', 'tera'] } }),
  // Collector-gimmick blocks: Phantasmal (treatment-first) majors + chase-dense
  // riders. A collector-led studio — should lean on the secondary market and
  // survive on collector demand.
  makeStrategy({ name: 'Collector blocks', cadence: 18, minorEvery: 7, rotateEvery: 104,
    knobs: { designLoudness: 48, printRun: 40, pricePoint: 5.0, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['phantasmal'] } }),

  // ---- Set-size strategies -------------------------------------------------
  // Both mirror 'Balanced' exactly except for set SIZE, so the pair isolates
  // the size math: 'Landmark' ships at the top of each tier's band (a bigger
  // launch event, but bloat drags on collectors and draws reviewer pans),
  // 'Tight' at the bottom (a weaker growth event, denser and completable).
  makeStrategy({ name: 'Landmark sets (big)', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 70, size: 'landmark',
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Large sets (upper-mid)', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 70, size: 'large',
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Tight sets (small)', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 70, size: 'tight',
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  // Plain-era studio: opens every block with NO gimmick. Cheaper to develop and
  // no nostalgia creep, but no chase subtype and a smaller launch spike —
  // exercises the whole gimmickless path end to end.
  makeStrategy({ name: 'Plain eras (no gimmick)', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES } }),
]

// ---- Run a single game ----------------------------------------------------

function playOne(strategy, salt, trace = false) {
  let state = createInitialState()
  const ctx = { salt, releases: 0, pulls: 0, riders: 0 }
  const samples = [] // periodic snapshots for trajectory stats
  let bigMoves = 0, weeksWithMover = 0
  let minCash = Infinity, minPlayers = Infinity // closest anyone came to losing

  for (let i = 0; i < HORIZON; i++) {
    if (state.gameOver) break
    state = strategy.act(state, ctx)
    if (state.gameOver) break
    state = advanceWeek(state)

    if (state.movers?.length) {
      weeksWithMover++
      bigMoves += state.movers.filter((m) => Math.abs(m.pct) >= 0.25).length
    }
    if (state.cash < minCash) minCash = state.cash
    if (state.playerBase < minPlayers) minPlayers = state.playerBase
    if (i % 26 === 0) {
      samples.push({ week: state.week, cash: state.cash, players: state.playerBase, printIntensity: state.printIntensity })
    }
    if (trace) {
      console.log(
        `w${String(state.week).padStart(3)} cash=${fmt(state.cash).padStart(9)} ppl=${fmt(state.playerBase).padStart(7)} ` +
        `buzz=${avgBuzz(state.sets).toFixed(0).padStart(3)} pInt=${(state.printIntensity ?? 0).toFixed(0).padStart(3)} ` +
        `sets=${state.sets.length} movers=${state.movers?.length ?? 0}`,
      )
    }
  }

  return {
    survived: !state.gameOver,
    endWeek: state.week,
    reason: state.gameOver?.reason ?? 'survived horizon',
    cash: state.cash,
    players: state.playerBase,
    printIntensity: state.printIntensity ?? 0,
    avgBuzz: avgBuzz(state.sets),
    releases: ctx.releases,
    riders: ctx.riders, // minor/micro releases (subset of releases)
    blocks: state.blocks?.length ?? 0,
    treatmentCards: state.cards.filter((c) => c.treatment).length,
    pulls: ctx.pulls,
    moverRate: weeksWithMover / Math.max(1, state.week - 1),
    bigMoves,
    minCash,
    minPlayers,
    samples,
  }
}

// ---- Sweep & report -------------------------------------------------------

function fmt(n) {
  const r = Math.round(n)
  return Math.abs(r) >= 1000 ? (r / 1000).toFixed(0) + 'k' : String(r)
}

// Average buzz across live (in-print) sets, 0–100.
function avgBuzz(sets) {
  const live = (sets ?? []).filter((s) => !s.rotated)
  if (!live.length) return 0
  return live.reduce((s, x) => s + (x.buzz ?? 0), 0) / live.length
}

function summarize() {
  console.log(`Headless playtest — horizon ${HORIZON} weeks (~${(HORIZON / 52).toFixed(0)}y), 3 set-name salts each\n`)
  console.log(
    'strategy'.padEnd(22) + 'survive'.padEnd(9) + 'endWk'.padEnd(7) +
    'cash'.padEnd(8) + 'minCash'.padEnd(9) + 'players'.padEnd(9) + 'minPpl'.padEnd(8) +
    'pInt'.padEnd(6) + 'buzz'.padEnd(6) +
    'rel'.padEnd(5) + 'rid'.padEnd(5) + 'blk'.padEnd(5) + 'pull'.padEnd(6) + 'reason',
  )
  console.log('-'.repeat(125))

  for (const strat of STRATEGIES) {
    const runs = [0, 1, 2].map((salt) => playOne(strat, salt))
    const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length
    const survived = runs.filter((r) => r.survived).length
    const cadence = avg((r) => (r.releases > 1 ? (r.endWeek - 1) / r.releases : 0))
    const reasons = [...new Set(runs.map((r) => short(r.reason)))].join(' / ')

    console.log(
      strat.name.padEnd(22) +
      `${survived}/3`.padEnd(9) +
      avg((r) => r.endWeek).toFixed(0).padEnd(7) +
      fmt(avg((r) => r.cash)).padEnd(8) +
      fmt(avg((r) => r.minCash)).padEnd(9) +
      fmt(avg((r) => r.players)).padEnd(9) +
      fmt(avg((r) => r.minPlayers)).padEnd(8) +
      avg((r) => r.printIntensity).toFixed(0).padEnd(6) +
      avg((r) => r.avgBuzz).toFixed(0).padEnd(6) +
      avg((r) => r.releases).toFixed(0).padEnd(5) +
      avg((r) => r.riders).toFixed(0).padEnd(5) +
      avg((r) => r.blocks).toFixed(0).padEnd(5) +
      avg((r) => r.pulls).toFixed(0).padEnd(6) +
      reasons,
    )
  }

  console.log('\nRelease cadence target (brief): a set every few months ≈ every 12–20 weeks.')
  console.log('Survival read: a skilled strategy should survive; greed/idle should fail.')
}

function short(reason) {
  if (reason.includes('Insolvent') || reason.includes('debt')) return 'debt'
  if (reason.includes('revolted')) return 'sentiment'
  return 'survived'
}

if (process.argv.includes('--trace')) {
  const strat = STRATEGIES.find((s) => s.name === 'Balanced')
  console.log(`Trace — ${strat.name}\n`)
  playOne(strat, 0, true)
} else {
  summarize()
}
