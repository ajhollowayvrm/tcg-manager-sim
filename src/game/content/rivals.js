// Flavor roster for the rival TCG (see rival.js). No stat differentiation in
// v1 — one is picked once at game start, purely for narrative texture in the
// events feed and the TopBar meter's tooltip.

export const RIVALS = [
  { id: 'r_mythrealm', name: 'MythRealm TCG', blurb: 'A flashy, power-creep-chasing upstart that never met a chase rarity it didn\'t like.' },
  { id: 'r_starforge', name: 'StarForge Duel', blurb: 'A collector-hype machine — slower releases, but each one is an event.' },
  { id: 'r_dustbowl', name: 'Dustbowl Draft', blurb: 'A scrappy indie darling picking off your casual base one viral moment at a time.' },
]

export function getRival(id) {
  return RIVALS.find((r) => r.id === id) ?? null
}
