// Grading & authentication — a publisher-level business relationship, not a
// per-card personal action. You license a third-party grading service (see
// content/grading.js), the same shape as signing a bulk-buyer distributor:
// a flat cost, a relationship that decays if untended, and a weekly ambient
// effect on the wider market rather than something you click per card.
//
// While a partner is active, it certifies a slice of the market's highest-
// value eligible singles each week (a flat, permanent collector-value premium
// — see market.js's gradedLift) and carries its own weekly scandal risk: a
// mis-grade/counterfeit scare that strips one existing graded card's
// certification and craters its price. Cultivating the relationship tightens
// standards and halves that risk at max warmth — the real cost of courting a
// fast, cheap grader is the risk you manage, not a fee you pay once.

import { makeRng, hashSeed, range } from './rng.js'
import { clamp } from './simulation.js'
import { getGradingPartner } from './content/grading.js'
import { scandalRiskMul } from './upgrades.js'

// ---- Sign / drop / cultivate -----------------------------------------------

export function signGradingPartner(state, id) {
  const partner = getGradingPartner(id)
  if (!partner) return null
  if ((state.gradingPartners ?? []).some((p) => p.id === id && p.active)) return null

  const deal = { id, active: true, signedWeek: state.week, relationship: 30 }
  const gradingPartners = [...(state.gradingPartners ?? []).filter((p) => p.id !== id), deal]
  const feed = `Signed ${partner.name} as your grading partner — they'll begin certifying high-value singles across the market.`
  return { gradingPartners, cashDelta: -partner.cost, feed }
}

export function dropGradingPartner(state, id) {
  const partner = getGradingPartner(id)
  const deal = (state.gradingPartners ?? []).find((p) => p.id === id && p.active)
  if (!partner || !deal) return null

  const gradingPartners = state.gradingPartners.map((p) =>
    p.id === id ? { ...p, active: false, droppedWeek: state.week } : p,
  )
  return { gradingPartners, feed: `You ended your partnership with ${partner.name}.` }
}

export function cultivateGradingPartner(state, id) {
  const partner = getGradingPartner(id)
  const deal = (state.gradingPartners ?? []).find((p) => p.id === id && p.active)
  if (!partner || !deal) return null

  const cost = Math.round(5_000 + partner.cost * 0.15)
  const gradingPartners = state.gradingPartners.map((p) =>
    p.id === id ? { ...p, relationship: clamp((p.relationship ?? 0) + 18, 0, 100) } : p,
  )
  return { gradingPartners, cashDelta: -cost, feed: `You invested in your relationship with ${partner.name} — tighter standards, lower scandal risk.` }
}

// ---- Weekly tick (called from advanceWeek) -------------------------------

// Active partners each grade a slice of eligible live singles (ambient — no
// player pick involved) and roll their own scandal risk. Mutates `next` in
// place, mirroring applyDistributors.
export function applyGrading(next) {
  const active = (next.gradingPartners ?? []).filter((p) => p.active)
  if (!active.length) return

  const rng = makeRng(hashSeed(`grading:${next.week}`))
  // Eligible for grading THIS week — note an already-`graded` card stays
  // eligible: real submitters keep sending in more copies of a popular chase
  // card long after the first one gets certified, which is exactly what grows
  // its population report (see MarketTicker's "graded ×N" tag).
  const eligible = (next.cards ?? [])
    .filter((c) => !c.banned && !c.rotated && !c.promo)
    .sort((a, b) => b.singlePrice - a.singlePrice)
  const alreadyGraded = (next.cards ?? []).filter((c) => c.graded)

  const toGrade = new Set()
  let scandalCardId = null

  for (const deal of active) {
    const partner = getGradingPartner(deal.id)
    if (!partner) continue

    const pool = eligible.filter((c) => !toGrade.has(c.id))
    const n = Math.round(pool.length * partner.gradeRate)
    for (let i = 0; i < n; i++) toGrade.add(pool[i].id)

    // A cultivated relationship tightens standards, halving scandal risk at
    // max warmth.
    const warmth = 1 - (deal.relationship ?? 0) / 100 * 0.5
    // An authentication lab (upgrades.js) cuts the risk further.
    if (!scandalCardId && alreadyGraded.length && rng() < partner.scandalRisk * warmth * scandalRiskMul(next)) {
      scandalCardId = alreadyGraded[Math.floor(rng() * alreadyGraded.length) % alreadyGraded.length].id
    }
  }

  if (!toGrade.size && !scandalCardId) return

  let scandalName = null
  next.cards = next.cards.map((c) => {
    if (toGrade.has(c.id)) return { ...c, graded: true, gradedPopulation: (c.gradedPopulation ?? 0) + 1 }
    if (scandalCardId && c.id === scandalCardId) {
      scandalName = c.name
      const craterPrice = Math.round(c.singlePrice * (1 - range(rng, 0.25, 0.4)) * 100) / 100
      // A scandal strips certification but the population report doesn't
      // un-happen — those copies were graded at some point, real or not.
      return { ...c, graded: false, singlePrice: craterPrice, priceHistory: [...c.priceHistory, craterPrice].slice(-26) }
    }
    return c
  })

  if (scandalName) {
    // Same trust-breach shape as a distributor's scalper pop (see
    // applyDistributors) — a certification scandal should cost more than one
    // card's price. It sours the community (reviewers and fairness-minded
    // voices hardest) and bleeds a slice of collectors, who trusted the
    // certification most.
    if (next.personas) {
      next.personas = next.personas.map((p) => {
        const sens = 0.4 + (p.taste?.fairness ?? 0) * 0.8 + (p.type === 'reviewer' ? 0.4 : 0)
        return { ...p, sentiment: clamp(p.sentiment - 6 * sens, -100, 100) }
      })
    }
    if (next.segments) {
      const bleed = Math.round(next.segments.collectors * 0.012)
      next.segments.collectors = Math.max(0, next.segments.collectors - bleed)
      next.playerBase = Math.max(0, next.segments.casual + next.segments.collectors)
    }

    next.eventsFeed = [
      { week: next.week, kind: 'market', tone: 'bad',
        text: `Grading scandal: a mis-graded/counterfeit ${scandalName} surfaces, rattling confidence — its certified value craters and collectors sour on the certification.` },
      ...next.eventsFeed,
    ].slice(0, 60)
  }
}
