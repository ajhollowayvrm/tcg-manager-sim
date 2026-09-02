// Recurring costs — the money sinks.
//
// WHY THIS MODULE EXISTS. Every cost in the game used to be a one-off attached
// to an action: a set's dev and print bill, a distributor sign-on, a merch
// launch, a media pitch. The only recurring lines were sponsor upkeep (opt-in)
// and debt interest (only when already negative). Revenue, meanwhile, scales
// with the player base. A 312-week trace measured lifetime revenue of $48M
// against $4M of total spend — the studio banked 92% of everything it earned,
// cash grew monotonically to $43M, and after about week 36 the run could not be
// lost by any means.
//
// The asymmetry the fix hangs on already existed and nothing was using it:
// REVENUE IS BOUNDED (word-of-mouth is additive, segment drift is capped, so the
// player base plateaus and weekly income peaks around $220k and then declines)
// while COSTS NEED NOT BE. Three of the four sinks below scale with what the
// studio owns, so an unpruned catalogue eventually outruns any income it can
// generate. Pruning is the perpetual decision the whole late game now turns on.
//
// Four sinks, one entry point (applyOverhead), one structured record on state
// (next.lastOverhead) so the UI has a single line item and the playtest harness
// has a single number to log.

import { clamp } from './simulation.js'
import { weeklyContractFees } from './artists.js'
import { warehouseMul, staffPerPlayerMul } from './upgrades.js'

// ---- Sink A: studio overhead (the scale sink) ------------------------------

const STAFF_BASE = 2_500 // two people and a kitchen table
const STAFF_PER_PLAYER = 0.05 // support and community scale with the audience
const LINE_COST = 1_600 // per set still in print…
// …superlinear, and this is the load-bearing term in the whole module. A
// sprawling shelf costs disproportionately more to keep supplied, restocked and
// merchandised than a curated one. It is what eventually makes an unpruned
// catalogue fatal, and what kills release-spam strategies: 6 sets in print cost
// ~$17k/wk, 23 cost ~$95k/wk — 5.6x the cost for 3.8x the count.
const LINE_EXPONENT = 1.30
const CATALOGUE_PER_CARD = 6 // errata, authentication, the digital catalogue
const RETIRED_CARD_DISCOUNT = 0.25 // an out-of-print card still costs you something

// Prestige multiplier: a bigger name pays more for everything — better offices,
// better people, more lawyers.
//
// TUNING NOTE: this divisor is calibrated against the reputation range a run
// actually reaches, and MUST be re-tuned whenever franchise.js's BASE_GROWTH
// changes or every late-run cost silently inflates by the same factor. It was
// 120 while reputation topped out near 60; raising growth so the upper media
// deals became reachable took reputation to ~117 by week 312, which nearly
// doubled the multiplier on its own.
const PRESTIGE_REFERENCE = 160

// ---- Sink B: warehousing (the behaviour sink) ------------------------------

// $/week per 1,000 unsold units. Tuned so the DEFAULT print run (~460k units)
// costs a manageable ~$1.8k/wk while a deliberate over-print (~900k) costs
// double that — the point is to price over-printing, not to tax shipping at all.
const WAREHOUSE_PER_1K_UNITS = 4
// Fresh stock is in transit and on shelves, not sitting in a warehouse. The ramp
// keeps a launch clean, which matters for the early game.
const WAREHOUSE_GRACE_WEEKS = 12

// ---- Sink C: block / era upkeep --------------------------------------------

const BLOCK_UPKEEP_BASE = 700 // a plain themed era
// A splashy era is a standing commitment: plates, art direction, era marketing.
const BLOCK_UPKEEP_PER_TREATMENT = 2_800

// ---- Sink D: the community goodwill programme (the voluntary drain) --------

// $/week per player at full commitment. Deliberately painful — roughly a third
// to a half of gross revenue — because this is where surplus cash is supposed to
// go, and because it scales with the player base it never becomes trivial.
const GOODWILL_MAX_PER_PLAYER = 0.55

// $/week per player at full commitment to the grassroots programme. A fraction
// of the goodwill rate: it buys word of mouth, not forgiveness.
const GRASSROOTS_MAX_PER_PLAYER = 0.12

// ---- Resolution -------------------------------------------------------------

// Compute every recurring cost for the week. Pure: returns the breakdown, and
// applyOverhead below is the only thing that touches state.
export function weeklyOverhead(state) {
  const sets = state.sets ?? []
  const cards = state.cards ?? []
  const liveSets = sets.filter((s) => !s.rotated && !s.outOfPrint)
  const liveSetIds = new Set(liveSets.map((s) => s.id))

  let liveCards = 0
  let retiredCards = 0
  for (const c of cards) {
    if (c.promo) continue // a promo has no print line to keep supplied
    if (liveSetIds.has(c.setId)) liveCards++
    else retiredCards++
  }

  const playerBase = state.playerBase ?? 0
  // Upgrades (upgrades.js): a community team trims the per-player staff line.
  const staff = STAFF_BASE + playerBase * STAFF_PER_PLAYER * staffPerPlayerMul(state)
  const lines = LINE_COST * Math.pow(liveSets.length, LINE_EXPONENT)
  const catalogue = CATALOGUE_PER_CARD * (liveCards + RETIRED_CARD_DISCOUNT * retiredCards)
  const prestigeMul = 1 + (state.franchise?.reputation ?? 0) / PRESTIGE_REFERENCE
  // Prestige perk: a veteran operation runs leaner (see legacy.js's
  // PRESTIGE_PERKS) — a career-long reward, not a per-run one.
  const veteranMul = (state.prestige?.perks ?? []).includes('veteran_staff') ? 0.85 : 1
  const studio = Math.round((staff + lines + catalogue) * prestigeMul * veteranMul)

  // Warehousing on every unsold unit across every SKU of every live set. This
  // is what finally gives over-printing an ONGOING cost — until now its only
  // cost was the one-off print bill, which is why the "Overprint greed"
  // strategy failed on community sentiment rather than on economics.
  let warehouse = 0
  for (const set of liveSets) {
    const ramp = clamp((state.week - set.releasedWeek) / WAREHOUSE_GRACE_WEEKS, 0, 1)
    if (ramp <= 0) continue
    const products = set.products?.length ? set.products : [{ supply: set.supply, sold: set.sold }]
    for (const p of products) {
      const unsold = Math.max(0, (p.supply ?? 0) - (p.sold ?? 0))
      warehouse += (unsold / 1000) * WAREHOUSE_PER_1K_UNITS * ramp
    }
  }
  // Warehouse automation (upgrades.js) trims every unit's carrying cost.
  warehouse = Math.round(warehouse * warehouseMul(state))

  // Era upkeep, charged only while a block still has product on the shelf.
  // Blocks coexist forever at zero cost today, which is part of why catalogue
  // sprawl is free.
  let blocks = 0
  for (const b of state.blocks ?? []) {
    const stillLive = liveSets.some((s) => s.blockId === b.id)
    if (!stillLive) continue
    blocks += BLOCK_UPKEEP_BASE + BLOCK_UPKEEP_PER_TREATMENT * (b.treatment ?? 0)
  }
  blocks = Math.round(blocks)

  // The voluntary drain. Its effect lands on community sentiment; see
  // personas.js's brandAnchor, which multiplies it by (1 - grievance) so a
  // studio charging $12 a pack cannot buy its way out of the reaction. You can
  // repair a soured community. You cannot purchase permission to gouge it.
  const goodwill = Math.round(clamp(state.goodwillSpend ?? 0, 0, 1) * playerBase * GOODWILL_MAX_PER_PLAYER)

  // ---- Sink E: illustrator retainers (artists.js) ----------------------------
  // A standing commitment for the term of each exclusive. Zero with none signed.
  const contracts = Math.round(weeklyContractFees(state))

  // ---- Sink F: the grassroots programme (grassroots.js) ----------------------
  // Grants to the people running events outside the game store: scales with
  // the player base like goodwill does, at a fraction of the rate.
  const grassroots = Math.round(clamp(state.grassroots?.level ?? 0, 0, 1) * playerBase * GRASSROOTS_MAX_PER_PLAYER)

  const total = studio + warehouse + blocks + goodwill + contracts + grassroots
  return { staff: Math.round(staff), lines: Math.round(lines), catalogue: Math.round(catalogue), studio, warehouse, blocks, goodwill, contracts, grassroots, total }
}

// Charge the week's recurring costs. Mutates `next` in place.
//
// ORDERING: this runs AFTER the week's income has landed (resolveRevenue,
// resolveMerchRevenue) and BEFORE the debt-interest check in simulation.js. A
// week the studio cannot cover therefore pushes it into a loan that starts
// accruing in the same tick, which is the correct causality.
export function applyOverhead(next) {
  const breakdown = weeklyOverhead(next)
  next.cash -= breakdown.total
  next.lastOverhead = { week: next.week, ...breakdown }
}
