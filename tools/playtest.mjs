// Headless playtest harness for tuning. The sim is pure functions over plain
// state (advanceWeek + the action helpers), so we can play full multi-year runs
// in milliseconds with no browser — and sweep many strategies to get the
// *distributions* the brief's open tuning notes ask about (release cadence,
// survival, power-creep trajectory, market variance).
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
import { banCard, rotateFormat } from '../src/game/bans.js'

const HORIZON = 312 // ~6 years of weeks — a long run, per the brief's "year 6"

// ---- Reducer mirror (headless) -------------------------------------------
// Mirrors the transitions in useGame.js so a strategy can act on the state.

function applyRelease(state, draft) {
  const { set, cards, cashDelta, metagame } = releaseSet(state, draft)
  return {
    ...state,
    cash: state.cash + cashDelta,
    sets: [...state.sets, set],
    cards: [...state.cards, ...cards],
    metagame,
  }
}
function applyBan(state, cardId) {
  const r = banCard(state, cardId)
  if (!r) return state
  return { ...state, cards: r.cards, metagame: r.metagame, segments: r.segments, playerBase: r.playerBase, personas: r.personas }
}
function applyRotate(state, count) {
  const r = rotateFormat(state, count)
  if (!r) return state
  return { ...state, sets: r.sets, cards: r.cards, metagame: r.metagame, segments: r.segments, playerBase: r.playerBase, personas: r.personas }
}

// ---- Draft builder --------------------------------------------------------
// Build a releasable draft (>=5 signature cards) from a strategy's knobs.

function buildDraft(setNumber, knobs, nameSalt) {
  const d = createDraft(setNumber)
  d.name = `${knobs.namePool[(setNumber + nameSalt) % knobs.namePool.length]} ${setNumber}`
  d.themeId = knobs.themes[(setNumber + nameSalt) % knobs.themes.length]
  d.powerBudget = knobs.powerBudget
  d.printRun = knobs.printRun
  d.pricePoint = knobs.pricePoint
  const n = 6
  d.signatureCards = Array.from({ length: n }, (_, i) => {
    const c = createSignatureCard(i + 1)
    c.name = `${d.name} Chase ${i + 1}`
    c.rarity = i < 2 ? 'mythic' : 'rare'
    // A strategy's "chase power" sets how spiky its signature cards are.
    c.power = Math.min(100, knobs.chasePower + (i === 0 ? 15 : 0))
    return c
  })
  return d
}

// ---- Strategies -----------------------------------------------------------
// Each decides what to do at the start of a week given the live state.

const NAME_POOL = ['Ember', 'Frost', 'Tempest', 'Verdant', 'Obsidian', 'Radiant', 'Abyssal', 'Gilded']
const THEMES = ['dragons', 'undead', 'cyber', 'nature', 'arcane'] // real theme ids from content/themes.js

function makeStrategy({ name, cadence, knobs, banAt, rotateEvery, ignoreCash = false }) {
  return {
    name,
    // Called each week BEFORE advanceWeek. Returns the (possibly) acted-on state.
    act(state, ctx) {
      let s = state
      // Release on cadence if we can afford it (real setCost on the actual draft,
      // with a thin safety buffer so a strategy doesn't bankrupt itself printing).
      const lastSet = s.sets[s.sets.length - 1]
      const weeksSince = lastSet ? s.week - lastSet.releasedWeek : Infinity
      if (s.sets.length === 0 || weeksSince >= cadence) {
        const draft = buildDraft(s.sets.length + 1, knobs, ctx.salt)
        if (ignoreCash || s.cash > setCost(draft).total * 1.15) {
          s = applyRelease(s, draft)
          ctx.releases++
        }
      }
      // Ban the highest-pressure live card once it crosses the threshold.
      if (banAt != null) {
        const live = s.cards.filter((c) => !c.banned && !c.rotated)
        const worst = live.reduce((a, c) => ((c.banPressure ?? 0) > (a?.banPressure ?? 0) ? c : a), null)
        if (worst && (worst.banPressure ?? 0) >= banAt) {
          s = applyBan(s, worst.id)
          ctx.bans++
        }
      }
      // Rotate periodically to reset creep.
      if (rotateEvery && s.week > 0 && s.week % rotateEvery === 0) {
        const before = s.sets.filter((x) => x.rotated).length
        s = applyRotate(s, 1)
        if (s.sets.filter((x) => x.rotated).length > before) ctx.rotations++
      }
      return s
    },
  }
}

const STRATEGIES = [
  makeStrategy({ name: 'Conservative', cadence: 16, banAt: 60, rotateEvery: 104,
    knobs: { powerBudget: 45, printRun: 45, pricePoint: 4.5, chasePower: 60, namePool: NAME_POOL, themes: THEMES } }),
  makeStrategy({ name: 'Balanced', cadence: 12, banAt: 65, rotateEvery: 78,
    knobs: { powerBudget: 55, printRun: 55, pricePoint: 4.5, chasePower: 70, namePool: NAME_POOL, themes: THEMES } }),
  makeStrategy({ name: 'Aggressive creep', cadence: 8, banAt: 75, rotateEvery: 60,
    knobs: { powerBudget: 80, printRun: 65, pricePoint: 5.0, chasePower: 88, namePool: NAME_POOL, themes: THEMES } }),
  makeStrategy({ name: 'Overprint greed', cadence: 5, banAt: null, rotateEvery: null,
    knobs: { powerBudget: 70, printRun: 78, pricePoint: 8.0, chasePower: 80, namePool: NAME_POOL, themes: THEMES } }),
  makeStrategy({ name: 'Underprint scarcity', cadence: 14, banAt: 60, rotateEvery: 104,
    knobs: { powerBudget: 50, printRun: 12, pricePoint: 5.5, chasePower: 72, namePool: NAME_POOL, themes: THEMES } }),
  makeStrategy({ name: 'Idle (never release)', cadence: Infinity, banAt: null, rotateEvery: null,
    knobs: { powerBudget: 50, printRun: 50, pricePoint: 4.5, chasePower: 60, namePool: NAME_POOL, themes: THEMES } }),
  // Reckless: release as fast as possible at a punishing price regardless of
  // cash — should bankrupt itself. Confirms the loss condition is reachable.
  makeStrategy({ name: 'Reckless spender', cadence: 4, banAt: null, rotateEvery: null, ignoreCash: true,
    knobs: { powerBudget: 75, printRun: 80, pricePoint: 9.0, chasePower: 82, namePool: NAME_POOL, themes: THEMES } }),
]

// ---- Run a single game ----------------------------------------------------

function playOne(strategy, salt, trace = false) {
  let state = createInitialState()
  const ctx = { salt, releases: 0, bans: 0, rotations: 0 }
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
      samples.push({ week: state.week, cash: state.cash, players: state.playerBase, power: state.metagame.powerLevel })
    }
    if (trace) {
      const m = state.metagame
      console.log(
        `w${String(state.week).padStart(3)} cash=${fmt(state.cash).padStart(9)} ppl=${fmt(state.playerBase).padStart(7)} ` +
        `div=${m.diversity.toFixed(0).padStart(3)} pow=${m.powerLevel.toFixed(0).padStart(3)} solve=${m.solveLevel.toFixed(0).padStart(3)} ` +
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
    power: state.metagame.powerLevel,
    diversity: state.metagame.diversity,
    releases: ctx.releases,
    bans: ctx.bans,
    rotations: ctx.rotations,
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

function summarize() {
  console.log(`Headless playtest — horizon ${HORIZON} weeks (~${(HORIZON / 52).toFixed(0)}y), 3 set-name salts each\n`)
  console.log(
    'strategy'.padEnd(22) + 'survive'.padEnd(9) + 'endWk'.padEnd(7) +
    'cash'.padEnd(8) + 'minCash'.padEnd(9) + 'players'.padEnd(9) + 'minPpl'.padEnd(8) +
    'pow'.padEnd(5) + 'div'.padEnd(5) +
    'rel'.padEnd(5) + 'ban'.padEnd(5) + 'rot'.padEnd(5) + 'movers/wk'.padEnd(11) + 'reason',
  )
  console.log('-'.repeat(120))

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
      avg((r) => r.power).toFixed(0).padEnd(5) +
      avg((r) => r.diversity).toFixed(0).padEnd(5) +
      avg((r) => r.releases).toFixed(0).padEnd(5) +
      avg((r) => r.bans).toFixed(0).padEnd(5) +
      avg((r) => r.rotations).toFixed(0).padEnd(5) +
      avg((r) => r.moverRate).toFixed(2).padEnd(11) +
      reasons,
    )
  }

  console.log('\nRelease cadence target (brief): a set every few months ≈ every 12–20 weeks.')
  console.log('Survival read: a skilled strategy should survive; greed/idle should fail.')
}

function short(reason) {
  if (reason.startsWith('Bankrupt')) return 'bankrupt'
  if (reason.startsWith('The community')) return 'players→0'
  return 'survived'
}

if (process.argv.includes('--trace')) {
  const strat = STRATEGIES.find((s) => s.name === 'Balanced')
  console.log(`Trace — ${strat.name}\n`)
  playOne(strat, 0, true)
} else {
  summarize()
}
