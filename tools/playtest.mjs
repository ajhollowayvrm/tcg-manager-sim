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
import { communitySentiment } from '../src/game/simulation.js'
import { reducer } from '../src/game/reducer.js'
import { createDraft, createSignatureCard, setCost } from '../src/game/sets.js'
import { getTier } from '../src/game/blocks.js'

const DEFAULT_HORIZON = 312 // ~6 years of weeks — a long run, per the brief's "year 6"

// ---- Driving the REAL reducer ---------------------------------------------
// This file used to re-implement RELEASE_SET, PULL_FROM_PRINT and TICK by hand.
// That mirror drifted: it dropped `characters`, `pendingWaves`, `scalperHeat`
// and the odds-transparency sentiment bump, so any strategy touching
// regionalStagger, releaseEvent, oddsPublished or a character-attached
// signature card would have been measured against a different game than the one
// that ships. The reducer now lives in src/game/reducer.js and we call it
// directly — there is exactly one definition of what an action does.

const act = (state, action) => reducer(state, action)

const applyRelease = (state, draft) => act(state, { type: 'RELEASE_SET', draft })
const applyPull = (state, setId) => act(state, { type: 'PULL_FROM_PRINT', setId })
const applyTick = (state) => act(state, { type: 'TICK' })

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
  // A deliberately lean pack: drop the guaranteed hit slot and pad with commons.
  // This is the "stingy" grievance — packs that feel bad to open.
  if (knobs.leanPack) {
    d.packFormat = {
      ...d.packFormat,
      slots: [
        { count: 9, rarityIds: ['common'], escalate: false },
        { count: 1, rarityIds: ['uncommon'], escalate: false },
      ],
    }
  }
  const n = 6
  d.signatureCards = Array.from({ length: n }, (_, i) => {
    const c = createSignatureCard(i + 1)
    c.name = `${d.name} Chase ${i + 1}`
    c.rarity = i < 2 ? 'mythic' : 'rare'
    // A strategy's "chase appeal" sets how loud its signature cards are.
    c.appeal = Math.min(100, knobs.chaseAppeal + (i === 0 ? 15 : 0))
    // Serialized chase cards — a 15x singles multiplier that used to be free
    // and community-invisible.
    if (knobs.serialize && i < 3) c.serialCap = [1, 10, 25][i]
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
// `maxLiveSets` (optional): prune the shelf down to this many in-print sets,
// oldest first. This is the discipline the recurring costs in overhead.js exist
// to demand — line cost scales as liveSets ** 1.30, so a curated shelf is
// dramatically cheaper to run than a sprawling one. `goodwill` (optional, 0..1)
// sets the standing community-goodwill commitment (overhead.js sink D).
// How deep into debt a sensible strategy will go to get a set out. The real
// game does NOT block a release on affordability — cash goes negative as a loan
// (see SetBuilder's "this set puts you into debt" notice), so a harness that
// required `cash > cost * 1.15` was strictly more cautious than a player can be,
// and modelled studios that sat paralysed with a shelf going cold rather than
// borrowing to ship. This models a prudent borrower, not a reckless one.
const CREDIT_FLOOR = -250_000

function canFund(state, draft) {
  return state.cash - setCost(draft).total > CREDIT_FLOOR
}

function makeStrategy({ name, cadence, knobs, rotateEvery, ignoreCash = false, minorEvery = null, maxLiveSets = null, goodwill = 0 }) {
  return {
    name,
    // What this studio PLEDGES at onboarding, which is what cadence.js judges it
    // against. A strategy is now held to its own promise rather than to the
    // 14-week default every harness run silently inherited. Clamped to the
    // onboarding slider's real bounds (config.js MIN_CADENCE/MAX_CADENCE), so a
    // never-releasing strategy pledges the slowest rhythm a player could pick.
    pledge: Math.max(6, Math.min(26, Number.isFinite(cadence) ? cadence : 26)),
    // Called each week BEFORE advanceWeek. Returns the (possibly) acted-on state.
    act(state, ctx) {
      let s = state
      // Set the standing goodwill commitment once, on the first week.
      if (goodwill > 0 && (s.goodwillSpend ?? 0) !== goodwill) {
        s = act(s, { type: 'SET_GOODWILL', level: goodwill })
      }
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
        if (ignoreCash || canFund(s, draft)) {
          s = applyRelease(s, draft)
          ctx.releases++
        }
      } else if (minorEvery && s.blocks?.length && weeksSinceAny >= minorEvery) {
        // Between majors: a rider riding the newest block. Alternate minor/micro.
        const tier = (ctx.riders % 2 === 0) ? 'minor' : 'micro'
        const draft = buildDraft(s.sets.length + 1, knobs, ctx.salt, tier, s.blocks)
        if (ignoreCash || canFund(s, draft)) {
          s = applyRelease(s, draft)
          ctx.releases++
          ctx.riders++
        }
      }
      // Shelf discipline: prune down to a target in-print count, oldest first.
      // Line cost scales as liveSets ** 1.30 (overhead.js), so this is the
      // difference between a shelf that pays for itself and one that does not.
      if (maxLiveSets) {
        let guard = 0
        for (;;) {
          const inPrint = s.sets.filter((x) => !x.rotated && !x.outOfPrint)
            .sort((a, b) => a.releasedWeek - b.releasedWeek)
          if (inPrint.length <= maxLiveSets || inPrint.length < 2 || guard++ > 40) break
          const before = s.sets.filter((x) => x.outOfPrint).length
          s = applyPull(s, inPrint[0].id)
          if (s.sets.filter((x) => x.outOfPrint).length === before) break // refused; stop looping
          ctx.pulls++
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

  // ---- Greed strategies ----------------------------------------------------
  // Each isolates ONE way of squeezing the player base for money. Before the
  // systems-audit pass these were free: nothing in personas.js read price,
  // print run, pack richness or serialization, so greed was pure arithmetic.
  // Each should now show sentiment damage, and none should be strictly optimal.
  makeStrategy({ name: 'Price gouging ($11)', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 11, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Stingy packs', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 70, leanPack: true,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Scarcity farming', cadence: 12, rotateEvery: 78,
    knobs: { designLoudness: 55, printRun: 12, pricePoint: 4.5, chaseAppeal: 70, serialize: true,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),

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

  // ---- Shelf-discipline strategies ----------------------------------------
  // These exist to test the recurring costs in overhead.js. Line cost scales as
  // liveSets ** 1.30, so keeping a curated shelf is the central late-game
  // decision. 'Target cadence' is the reference play the whole rebalance is
  // tuned around: it MUST survive 3/3 and should rank at or near the top.
  makeStrategy({ name: 'Target cadence (prune 6)', cadence: 14, rotateEvery: null, maxLiveSets: 6,
    knobs: { designLoudness: 50, printRun: 50, pricePoint: 4.5, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  // Same pruning discipline, rider-spam release rhythm. Separates "riders are
  // bad" from "an enormous shelf is bad" — this should still lose to the
  // reference play once rider fatigue bites revenue.
  makeStrategy({ name: 'Rider spam + prune', cadence: 24, minorEvery: 4, rotateEvery: null, maxLiveSets: 6,
    knobs: { designLoudness: 55, printRun: 55, pricePoint: 4.5, chaseAppeal: 75,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['phantasmal', 'tera'] } }),
  // Bounds the cadence target from above and below. Both should be clearly
  // worse than the 14-week reference.
  makeStrategy({ name: 'Slow cadence (24wk)', cadence: 24, rotateEvery: null, maxLiveSets: 6,
    knobs: { designLoudness: 50, printRun: 50, pricePoint: 4.5, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  makeStrategy({ name: 'Fast cadence (8wk)', cadence: 8, rotateEvery: null, maxLiveSets: 6,
    knobs: { designLoudness: 50, printRun: 50, pricePoint: 4.5, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  // The goodwill programme (overhead.js sink D) as a real choice: this studio
  // spends a third to a half of gross income on the community. It should show
  // the best sentiment and reputation and far less cash than the reference —
  // proving the sink is a trade, not a tax.
  // Half-commitment. A FULL 1.0 commitment reliably bankrupts a studio around
  // week 230 (102% of gross income), which is the correct shape for a maximal
  // spend but tells you nothing about whether the sink is playable. 0.5 is the
  // real question: is buying community goodwill a trade worth making?
  makeStrategy({ name: 'Goodwill spender', cadence: 14, rotateEvery: null, maxLiveSets: 6, goodwill: 0.5,
    knobs: { designLoudness: 50, printRun: 50, pricePoint: 4.5, chaseAppeal: 70,
      namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'] } }),
  // A deliberately bad opening: go dark for ten weeks early, then recover. The
  // old quadratic cadence cliff killed this outright; it must now survive.
  {
    name: 'Early stumble',
    pledge: 14,
    act(state, ctx) {
      let s = state
      // Deliberately skip the week-20..34 window, then release on a 14wk beat.
      const stalled = s.week >= 20 && s.week <= 34
      const lastSet = s.sets[s.sets.length - 1]
      const since = lastSet ? s.week - lastSet.releasedWeek : Infinity
      if (!stalled && (s.sets.length === 0 || since >= 14)) {
        const draft = buildDraft(s.sets.length + 1, {
          designLoudness: 50, printRun: 50, pricePoint: 4.5, chaseAppeal: 70,
          namePool: NAME_POOL, themes: THEMES, gimmicks: ['mega'],
        }, ctx.salt, 'major', s.blocks)
        if (canFund(s, draft)) { s = applyRelease(s, draft); ctx.releases++ }
      }
      const inPrint = s.sets.filter((x) => !x.rotated && !x.outOfPrint)
        .sort((a, b) => a.releasedWeek - b.releasedWeek)
      if (inPrint.length > 6) { s = applyPull(s, inPrint[0].id); ctx.pulls++ }
      return s
    },
  },
]

// ---- Run a single game ----------------------------------------------------

function playOne(strategy, salt, trace = false, horizon = DEFAULT_HORIZON) {
  // Start from a REAL config, the way START_GAME does. The harness used to call
  // a bare createInitialState(), which left every strategy pledged to the
  // default 14-week cadence — so a studio on a deliberate 24-week rhythm was
  // being judged against a promise it never made.
  let state = createInitialState({
    companyName: 'Harness Studio',
    gameName: strategy.name,
    cadenceWeeks: strategy.pledge,
    started: true,
  })
  const ctx = { salt, releases: 0, pulls: 0, riders: 0 }
  const samples = [] // periodic snapshots for trajectory stats
  let bigMoves = 0, weeksWithMover = 0
  let minCash = Infinity, minPlayers = Infinity // closest anyone came to losing
  let minSentiment = Infinity
  // Lifetime money flow, so `spend%` can show what fraction of gross income the
  // recurring sinks actually take. Before overhead.js this was about 8%.
  let grossRevenue = 0, totalOverhead = 0
  const netTail = [] // trailing weekly net cash flow, for the end-of-run trend

  for (let i = 0; i < horizon; i++) {
    if (state.gameOver) break
    state = strategy.act(state, ctx)
    if (state.gameOver) break
    state = applyTick(state)

    if (state.movers?.length) {
      weeksWithMover++
      bigMoves += state.movers.filter((m) => Math.abs(m.pct) >= 0.25).length
    }
    const sentiment = communitySentiment(state.personas) ?? 0
    const income = (state.lastRevenue?.total ?? 0) + (state.lastMerchRevenue?.total ?? 0)
    const outgoing = (state.lastOverhead?.total ?? 0) + (state.lastUpkeep ?? 0) + (state.lastDebtInterest ?? 0)
    grossRevenue += income
    totalOverhead += state.lastOverhead?.total ?? 0
    netTail.push(income - outgoing)
    if (netTail.length > 13) netTail.shift()
    if (state.cash < minCash) minCash = state.cash
    if (state.playerBase < minPlayers) minPlayers = state.playerBase
    if (sentiment < minSentiment) minSentiment = sentiment
    if (i % 26 === 0) {
      samples.push({
        week: state.week, cash: state.cash, players: state.playerBase,
        printIntensity: state.printIntensity, sentiment,
        reputation: state.franchise?.reputation ?? 0, liveSets: liveSetCount(state),
      })
    }
    if (trace) {
      console.log(
        `w${String(state.week).padStart(3)} cash=${fmt(state.cash).padStart(9)} ppl=${fmt(state.playerBase).padStart(7)} ` +
        `sent=${sentiment.toFixed(0).padStart(4)} rep=${(state.franchise?.reputation ?? 0).toFixed(0).padStart(3)} ` +
        `buzz=${avgBuzz(state.sets).toFixed(0).padStart(3)} pInt=${(state.printIntensity ?? 0).toFixed(0).padStart(3)} ` +
        `live=${String(liveSetCount(state)).padStart(2)} sets=${state.sets.length} movers=${state.movers?.length ?? 0}`,
      )
    }
  }

  return {
    survived: !state.gameOver,
    endWeek: state.week,
    // Structured cause, not a substring match — see simulation.js's gameOver.kind.
    kind: state.gameOver?.kind ?? 'survived',
    reason: state.gameOver?.reason ?? 'survived horizon',
    cash: state.cash,
    players: state.playerBase,
    sentiment: communitySentiment(state.personas) ?? 0,
    minSentiment: minSentiment === Infinity ? 0 : minSentiment,
    reputation: state.franchise?.reputation ?? 0,
    printIntensity: state.printIntensity ?? 0,
    overhead: state.lastOverhead?.total ?? 0,
    // What share of lifetime gross income the recurring sinks took. Before
    // overhead.js existed this was ~8% and cash grew without bound.
    spendShare: grossRevenue > 0 ? totalOverhead / grossRevenue : 0,
    // Trailing 13-week mean net cash flow at the end of the run. A strategy
    // that never prunes its shelf should finish NEGATIVE here even if its bank
    // balance is still large — that is the late-game pressure working.
    netWeekly: netTail.length ? netTail.reduce((a, b) => a + b, 0) / netTail.length : 0,
    avgBuzz: avgBuzz(state.sets),
    releases: ctx.releases,
    riders: ctx.riders, // minor/micro releases (subset of releases)
    blocks: state.blocks?.length ?? 0,
    liveSets: liveSetCount(state),
    treatmentCards: state.cards.filter((c) => c.treatment).length,
    cards: state.cards.length,
    pulls: ctx.pulls,
    moverRate: weeksWithMover / Math.max(1, state.week - 1),
    bigMoves,
    minCash,
    minPlayers,
    samples,
  }
}

// Sets still being printed — distinct from `releases` (lifetime count). This is
// the number the recurring-cost work will price, so it needs its own column.
function liveSetCount(state) {
  return (state.sets ?? []).filter((s) => !s.rotated && !s.outOfPrint).length
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

function summarize(opts) {
  const { horizon, salts, only } = opts
  const chosen = only
    ? STRATEGIES.filter((s) => s.name.toLowerCase().includes(only.toLowerCase()))
    : STRATEGIES
  if (!chosen.length) {
    console.error(`No strategy matches "${only}". Available:\n  ${STRATEGIES.map((s) => s.name).join('\n  ')}`)
    process.exitCode = 1
    return
  }

  const rows = []
  for (const strat of chosen) {
    const runs = salts.map((salt) => playOne(strat, salt, false, horizon))
    const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length
    rows.push({
      name: strat.name,
      survived: runs.filter((r) => r.survived).length,
      of: runs.length,
      // A MEAN end-week hides the shape entirely: averaging 33 and 313 says
      // "173", which describes no run that happened. Show the actual weeks the
      // failures landed on instead.
      deaths: runs.filter((r) => !r.survived).map((r) => r.endWeek).sort((a, b) => a - b),
      endWeek: avg((r) => r.endWeek),
      cash: avg((r) => r.cash),
      minCash: avg((r) => r.minCash),
      players: avg((r) => r.players),
      minPlayers: avg((r) => r.minPlayers),
      sentiment: avg((r) => r.sentiment),
      minSentiment: avg((r) => r.minSentiment),
      reputation: avg((r) => r.reputation),
      printIntensity: avg((r) => r.printIntensity),
      overhead: avg((r) => r.overhead),
      spendShare: avg((r) => r.spendShare),
      netWeekly: avg((r) => r.netWeekly),
      avgBuzz: avg((r) => r.avgBuzz),
      releases: avg((r) => r.releases),
      riders: avg((r) => r.riders),
      liveSets: avg((r) => r.liveSets),
      cards: avg((r) => r.cards),
      pulls: avg((r) => r.pulls),
      moverRate: avg((r) => r.moverRate),
      bigMoves: avg((r) => r.bigMoves),
      treatmentCards: avg((r) => r.treatmentCards),
      // Weeks per release — the number the brief's 12–20 week target is about.
      cadence: avg((r) => (r.releases > 0 ? (r.endWeek - 1) / r.releases : 0)),
      kinds: [...new Set(runs.map((r) => r.kind))].join('/'),
    })
  }

  if (opts.json) {
    console.log(JSON.stringify({ horizon, salts, rows }, null, 2))
    return
  }

  console.log(`Headless playtest — horizon ${horizon} weeks (~${(horizon / 52).toFixed(0)}y), ${salts.length} set-name salt(s) each\n`)
  const H = [
    ['strategy', 23], ['survive', 9], ['deaths', 14], ['cash', 9], ['ovhd', 8],
    ['spend%', 8], ['netWk', 9], ['players', 9], ['sent', 7], ['rep', 6], ['pInt', 6],
    ['rel', 5], ['live', 6], ['cad', 6], ['outcome', 10],
  ]
  console.log(H.map(([h, w]) => h.padEnd(w)).join(''))
  console.log('-'.repeat(H.reduce((s, [, w]) => s + w, 0)))

  for (const r of rows) {
    const cells = [
      r.name,
      `${r.survived}/${r.of}`,
      r.deaths.length ? r.deaths.join(',') : '—',
      fmt(r.cash),
      fmt(r.overhead),
      (r.spendShare * 100).toFixed(0) + '%',
      fmt(r.netWeekly),
      fmt(r.players),
      r.sentiment.toFixed(0),
      r.reputation.toFixed(0),
      r.printIntensity.toFixed(0),
      r.releases.toFixed(0),
      r.liveSets.toFixed(0),
      r.cadence.toFixed(0),
      r.kinds,
    ]
    console.log(cells.map((c, i) => String(c).padEnd(H[i][1])).join(''))
  }

  console.log('\nColumns: deaths = the WEEKS failing runs ended (not a mean — averaging 33 and 313 describes no run).')
  console.log('  ovhd = last week\'s recurring costs. spend% = lifetime sinks / lifetime gross income (was ~8%).')
  console.log('  netWk = trailing 13wk mean net cash flow; a shelf you never prune should end NEGATIVE here.')
  console.log('  sent = reach-weighted community sentiment. rep = franchise reputation. pInt = nostalgia erosion (40 = neutral).')
  console.log('  live = sets still in print (vs rel = lifetime releases). cad = weeks per release.')
  console.log('\nRelease cadence target (brief): a set every few months ≈ every 12–20 weeks.')
  console.log('Survival read: a skilled strategy should survive; greed/idle should fail.')
  console.log('Curve read: failures should SPREAD across the horizon, not cluster in one narrow band.')
}

// ---- CLI ------------------------------------------------------------------

function parseArgs(argv) {
  const get = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : fallback
  }
  const fast = argv.includes('--fast')
  return {
    horizon: Number(get('horizon', fast ? 208 : DEFAULT_HORIZON)),
    salts: get('salt', null) !== null
      ? [Number(get('salt'))]
      : (fast ? [0] : [0, 1, 2]),
    only: get('strategy', null),
    json: argv.includes('--json'),
    trace: argv.includes('--trace'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

const USAGE = `Headless playtest harness.

  node tools/playtest.mjs                      full sweep, 312 weeks, 3 salts
  node tools/playtest.mjs --fast               1 salt, 208 weeks (quick iteration)
  node tools/playtest.mjs --strategy=Balanced  only strategies matching a substring
  node tools/playtest.mjs --horizon=520         run longer
  node tools/playtest.mjs --salt=2              a single salt
  node tools/playtest.mjs --json                machine-readable output
  node tools/playtest.mjs --trace               week-by-week for one strategy
                                               (pair with --strategy=)
`

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  console.log(USAGE)
} else if (opts.trace) {
  const strat = STRATEGIES.find((s) => !opts.only || s.name.toLowerCase().includes(opts.only.toLowerCase()))
    ?? STRATEGIES.find((s) => s.name === 'Balanced')
  console.log(`Trace — ${strat.name} (pledge ${strat.pledge}wk, salt ${opts.salts[0]})\n`)
  playOne(strat, opts.salts[0], true, opts.horizon)
} else {
  summarize(opts)
}
