// The grading-partner roster — third-party authentication services you can
// license, like a distributor deal but for certifying singles instead of
// buying stock. See grading.js. `gradeRate` is the fraction of eligible
// high-value live singles a signed partner certifies per week; `scandalRisk`
// is its weekly chance of a mis-grade/counterfeit scare. The two trade off:
// a fast, cheap service grades more but is shakier.

export const GRADING_PARTNERS = [
  {
    id: 'prestige-house', name: 'Prestige House Authentication', cost: 40_000,
    gradeRate: 0.03, scandalRisk: 0.01,
    blurb: 'Slow, meticulous, and trusted. Grades a small slice of the market each week — but a scandal here would be a real shock.',
  },
  {
    id: 'guild-cert', name: "Collector's Guild Certification", cost: 25_000,
    gradeRate: 0.06, scandalRisk: 0.025,
    blurb: 'A reputable mid-market service — a solid balance of volume and trust.',
  },
  {
    id: 'quickgrade', name: 'QuickGrade Express', cost: 15_000,
    gradeRate: 0.10, scandalRisk: 0.05,
    blurb: 'Fast and cheap — floods the market with graded copies, but corners get cut.',
  },
]

export function getGradingPartner(id) {
  return GRADING_PARTNERS.find((p) => p.id === id) ?? null
}
