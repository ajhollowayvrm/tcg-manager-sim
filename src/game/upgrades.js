// Studio upgrades — the mechanics behind content/upgrades.js. State is
// `upgrades: { [id]: level }`. Every consumer reads its multiplier through one
// of the helpers below, so the numbers live in one place.
//
// Pricing: each level costs more than the last, and a bigger studio pays more
// for everything (the same prestige scaling overhead.js applies), so the store
// never becomes trivial late in a run.

import { getUpgrade } from './content/upgrades.js'

const PRESTIGE_REFERENCE = 160 // mirrors overhead.js

export function upgradeLevel(source, id) {
  // `source` is a state OR the bare upgrades map (setCost receives the map
  // through its ctx and never sees state).
  const map = source?.upgrades ?? source ?? {}
  const n = Number(map?.[id]) || 0
  const u = getUpgrade(id)
  return u?.max ? Math.min(u.max, Math.max(0, n)) : Math.max(0, n)
}

export function upgradeCost(state, id) {
  const u = getUpgrade(id)
  if (!u || !u.base) return 0
  const level = upgradeLevel(state, id)
  const prestigeMul = 1 + (state.franchise?.reputation ?? 0) / PRESTIGE_REFERENCE
  return Math.round(u.base * (1 + level) * prestigeMul / 100) * 100
}

// Returns { upgrades, cashDelta, feed } or null.
export function purchaseUpgrade(state, id) {
  const u = getUpgrade(id)
  if (!u || u.special) return null
  const level = upgradeLevel(state, id)
  if (level >= u.max) return null
  const cost = upgradeCost(state, id)
  const upgrades = { ...(state.upgrades ?? {}), [id]: level + 1 }
  return {
    upgrades,
    cashDelta: -cost,
    feed: `${u.name} — level ${level + 1}. ${u.effect(level + 1)}.`,
  }
}

// ---- The multipliers the sim reads ----------------------------------------

export function warehouseMul(state) {
  return 1 - 0.15 * upgradeLevel(state, 'warehouse_automation')
}

export function staffPerPlayerMul(state) {
  return 1 - 0.10 * upgradeLevel(state, 'community_team')
}

export function printBillMul(upgrades) {
  return 1 - 0.06 * upgradeLevel(upgrades, 'print_partner')
}

export function scandalRiskMul(state) {
  return 1 - 0.30 * upgradeLevel(state, 'authentication_lab')
}

export function artDirectorRate(upgrades) {
  return [2, 1.7, 1.5][upgradeLevel(upgrades, 'art_department')] ?? 2
}
