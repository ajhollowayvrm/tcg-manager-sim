// Legacy, retirement and the run score.
//
// docs/BRIEF.md is explicit that this game has NO WIN CONDITION — it is an
// open-ended run you play until you're bored or you lose. Everything here
// respects that. `updateLegacy` is a pure OBSERVER: it records peaks, counts
// lifetime totals, tracks streaks and awards milestones, and it writes nothing
// but `next.legacy`. It must never influence the simulation, or the score turns
// into a hidden difficulty modifier.
//
// Retirement is an EXIT, not a victory. It is dispatched from exactly one place
// (a button), nothing in the sim ever triggers it, and there is deliberately no
// prompt suggesting it — the moment the game proposes retiring, the run acquires
// a ceiling and stops being open-ended.

import { clamp, communitySentiment } from './simulation.js'
import { MILESTONES } from './content/milestones.js'

// Sentiment at or above this counts as the community being genuinely warm.
const BELOVED_AT = 40
// …and at or below this, openly hostile. Climbing from one to the other inside a
// year is the `redeemed` milestone.
const HOSTILE_AT = -50
const REDEMPTION_WINDOW_WEEKS = 52
// Debt deep enough that trading back out of it is a real story (`phoenix`).
const PHOENIX_DEBT = -500_000
// A shelf at or under this many in-print sets counts as curated (`lean_studio`).
const LEAN_SHELF = 6

export function freshLegacy() {
  return {
    points: 0,
    earned: [], // { id, week, points }
    peak: { players: 0, cash: 0, sentiment: -100, reputation: 0, weeklyRevenue: 0, cardPrice: 0, setsInPrint: 0 },
    totals: {
      setsShipped: 0, majorsShipped: 0, blocksOpened: 0,
      unitsSold: 0, grossRevenue: 0, recurringSpend: 0,
      godPacks: 0, weeksSolvent: 0, weeksPositiveSentiment: 0,
    },
    streaks: { solvent: 0, beloved: 0, leanShelf: 0, merchEmpire: 0 },
    flags: { redeemed: false, phoenix: false },
    // Bookkeeping for the two "arc" milestones, which need to remember a low
    // point rather than just a current value.
    marks: { hostileSinceWeek: null, deepDebt: false },
  }
}

// Advance the legacy record one week. Mutates next.legacy in place.
//
// ORDERING: called from advanceWeek AFTER updateFranchiseReputation, so
// reputation milestones fire on the right week, and BEFORE the loss check, so a
// run's final week is still recorded.
export function updateLegacy(next) {
  const L = next.legacy ?? freshLegacy()
  const sentiment = communitySentiment(next.personas) ?? 0
  const inPrint = (next.sets ?? []).filter((s) => !s.rotated && !s.outOfPrint).length
  const revenue = (next.lastRevenue?.total ?? 0) + (next.lastMerchRevenue?.total ?? 0)

  // ---- Peaks (high-water marks, so a later decline never erases an
  // achievement the run genuinely reached) ----
  const p = L.peak
  p.players = Math.max(p.players, next.playerBase ?? 0)
  p.cash = Math.max(p.cash, next.cash ?? 0)
  p.sentiment = Math.max(p.sentiment, sentiment)
  p.reputation = Math.max(p.reputation, next.franchise?.reputation ?? 0)
  p.weeklyRevenue = Math.max(p.weeklyRevenue, revenue)
  p.setsInPrint = Math.max(p.setsInPrint, inPrint)
  for (const c of next.cards ?? []) p.cardPrice = Math.max(p.cardPrice, c.singlePrice ?? 0)

  // ---- Lifetime totals ----
  const t = L.totals
  t.setsShipped = (next.sets ?? []).length
  t.majorsShipped = (next.sets ?? []).filter((s) => (s.tier ?? 'major') === 'major').length
  t.blocksOpened = (next.blocks ?? []).length
  t.unitsSold += next.lastRevenue?.units ?? 0
  t.grossRevenue += revenue
  t.recurringSpend += next.lastOverhead?.total ?? 0
  if ((next.cash ?? 0) >= 0) t.weeksSolvent++
  if (sentiment > 0) t.weeksPositiveSentiment++
  // A god pack posts a distinctive line to the events feed the week it happens.
  if ((next.eventsFeed ?? []).some((e) => e.week === next.week && e.text?.includes('GOD PACK'))) {
    t.godPacks++
  }

  // ---- Streaks ----
  const s = L.streaks
  s.solvent = (next.cash ?? 0) >= 0 ? s.solvent + 1 : 0
  s.beloved = sentiment >= BELOVED_AT ? s.beloved + 1 : 0
  // Only counts once there is actually a shelf to keep lean.
  s.leanShelf = inPrint > 0 && inPrint <= LEAN_SHELF ? s.leanShelf + 1 : 0
  s.merchEmpire = (next.merchLines ?? []).filter((m) => m.active).length >= 3 ? s.merchEmpire + 1 : 0

  // ---- Arc flags (these need memory, not just a current reading) ----
  const m = L.marks
  if (sentiment <= HOSTILE_AT) m.hostileSinceWeek = m.hostileSinceWeek ?? next.week
  else if (sentiment >= 10 && m.hostileSinceWeek != null) {
    if (next.week - m.hostileSinceWeek <= REDEMPTION_WINDOW_WEEKS) L.flags.redeemed = true
    m.hostileSinceWeek = null
  }
  if ((next.cash ?? 0) <= PHOENIX_DEBT) m.deepDebt = true
  else if (m.deepDebt && (next.cash ?? 0) >= 0) L.flags.phoenix = true

  // ---- Milestones: award any whose test now passes, once each ----
  const already = new Set(L.earned.map((e) => e.id))
  for (const ms of MILESTONES) {
    if (already.has(ms.id)) continue
    let passed = false
    try {
      passed = !!ms.test({ ...next, legacy: L })
    } catch {
      passed = false // a milestone must never be able to break a tick
    }
    if (!passed) continue
    L.earned.push({ id: ms.id, week: next.week, points: ms.points })
    L.points += ms.points
    next.eventsFeed = [
      { week: next.week, kind: 'legacy', tone: 'good', text: `🏆 ${ms.name} — ${ms.blurb} (+${ms.points} legacy)` },
      ...(next.eventsFeed ?? []),
    ].slice(0, 60)
  }

  next.legacy = L
}

// ---- Scoring ---------------------------------------------------------------

export function gradeFor(total) {
  if (total >= 5500) return 'Legendary'
  if (total >= 3500) return 'Industry Pillar'
  if (total >= 2000) return 'Household Name'
  if (total >= 1000) return 'Cult Classic'
  return 'Footnote'
}

// Score a run. Pure — safe to call for a live preview as well as at the end.
export function scoreRun(state) {
  const L = state.legacy ?? freshLegacy()
  const weeks = Math.max(1, state.week)
  const parts = {
    // Longevity with diminishing returns, so a decade of idling cannot
    // out-score a brilliant four years.
    endurance: Math.round(320 * Math.sqrt(weeks / 52)),
    audience: Math.round(160 * Math.log10(1 + L.peak.players / 1000)),
    prestige: Math.round(L.peak.reputation * 9),
    // How much of the run the community actually liked you — a rate, not a
    // total, so it cannot be farmed by simply lasting longer.
    goodwill: Math.round(600 * (L.totals.weeksPositiveSentiment / weeks)),
    milestones: L.points,
    business: Math.round(120 * Math.log10(1 + L.totals.grossRevenue / 1_000_000)),
    // Cash left in the bank, deliberately the SMALLEST term. Hoarding is not
    // the game, and after the money sinks it must not become one.
    treasury: Math.round(40 * Math.log10(1 + Math.max(0, state.cash ?? 0) / 1_000_000)),
  }
  const raw = Object.values(parts).reduce((a, b) => a + b, 0)
  // A run that ended in RUIN keeps its score but takes a real haircut. The
  // studio folded; that is part of the story, not an erasure of it.
  const total = Math.round(raw * (state.gameOver && state.gameOver.kind !== 'retired' ? 0.6 : 1))
  return { parts, raw, total, grade: gradeFor(total) }
}

// ---- Prestige --------------------------------------------------------------

// What banked legacy unlocks for FUTURE runs. Thresholds are cumulative across
// every run the player has retired, so this is a long arc rather than a
// per-run reward.
export const PRESTIGE_PERKS = [
  { id: 'seed_artist', at: 2_000, name: 'A name on speed dial',
    blurb: 'Start with one established artist already at the top of their game.' },
  { id: 'anniversary_early', at: 5_000, name: 'A history to celebrate',
    blurb: 'Anniversary sets unlock without the reputation gate.' },
  { id: 'cash_floor', at: 9_000, name: 'Patient backers',
    blurb: 'Start with $250,000 more in the bank.' },
  { id: 'veteran_staff', at: 14_000, name: 'Veteran operation',
    blurb: 'Studio overhead runs 15% cheaper for the whole run.' },
]

export function unlockedPerks(bankedPoints) {
  return PRESTIGE_PERKS.filter((p) => (bankedPoints ?? 0) >= p.at).map((p) => p.id)
}

export function hasPerk(state, id) {
  return (state?.prestige?.perks ?? []).includes(id)
}
