// Demeanours — how a FORM of a character carries itself, and the only part of a
// personality the sim can actually measure.
//
// WHY THIS EXISTS, AND WHY IT IS NOT content/traits.js. A character is one
// person printed in many forms (see people.js): Aryla, Destined Trainee is
// cheerful and charming, and Royal Commander Aryla is focused and loyal. Both
// are Aryla. The design goal is that fans recognise her in every form and still
// keep a favourite — so the sim has to answer one question numerically: has this
// form drifted so far from the person that it stopped reading as her?
//
// Traits cannot answer it. A trait is FLAVOR ONLY by an explicit design decision
// recorded in content/traits.js — no multiplier, no gate, no drift bias — and it
// carries no axes to measure a distance along. Giving traits axes would quietly
// make every existing character record mechanical, which is the exact line that
// file draws. So the measurable half lives here instead, on its own field, and
// traits stay what they are: the part that gets SAID.
//
// The three axes are the whole mechanism:
//
//   warmth  — open and generous (1) against closed and cold (0)
//   resolve — hard, focused, unmoving (1) against soft, yielding, adrift (0)
//   shadow  — how much darkness the form carries (1) against how much light (0)
//
// people.js's continuityDrift takes the distance between a form's demeanour
// centroid and the person's core demeanour, and continuityVerdict compares that
// distance against what the LINEAGE KIND expects (content/lineages.js's
// expectedDrift). That comparison is the point. A promotion that reinvents the
// person reads as "that isn't Aryla". A fall that stays cheerful reads as
// toothless. Neither is a penalty for drifting; both are a penalty for drifting
// the wrong amount for the story being told.
//
// The axes are deliberately coarse. They are not a personality model and cannot
// tell a wry character from a sly one — the trait table and the player's own hook
// do that. They exist to make one distance computable and nothing else.
//
// The player picks up to MAX_DEMEANORS per form. Two reads as a mood; four reads
// as a horoscope.
//
// IDS ARE LOAD-BEARING. A character record stores demeanour ids and that record
// is persisted. Renaming one orphans every saved form onto the fallback — the
// same hazard content/traits.js and content/archetypes.js both refuse to take.

export const MAX_DEMEANORS = 2

export const DEMEANORS = [
  // ---- Bright --------------------------------------------------------------
  { id: 'cheerful', name: 'Cheerful', warmth: 0.95, resolve: 0.35, shadow: 0.05,
    blurb: 'Delighted to be here, and it is catching.' },
  { id: 'charming', name: 'Charming', warmth: 0.9, resolve: 0.4, shadow: 0.15,
    blurb: 'Wins the room before saying anything worth hearing.' },
  { id: 'radiant', name: 'Radiant', warmth: 0.85, resolve: 0.75, shadow: 0.05,
    blurb: 'Lights the panel. Everyone else is drawn slightly darker.' },
  { id: 'earnest', name: 'Earnest', warmth: 0.85, resolve: 0.6, shadow: 0.1,
    blurb: 'Means it. Has never once been performing.' },

  // ---- Steady --------------------------------------------------------------
  { id: 'focused', name: 'Focused', warmth: 0.45, resolve: 0.95, shadow: 0.25,
    blurb: 'Looking at one thing. Has stopped noticing the rest.' },
  { id: 'dutiful', name: 'Dutiful', warmth: 0.6, resolve: 0.9, shadow: 0.2,
    blurb: 'Still at the post. The post may no longer exist.' },
  { id: 'resolute', name: 'Resolute', warmth: 0.5, resolve: 1, shadow: 0.3,
    blurb: 'Decided a long time ago and has not revisited it.' },
  { id: 'serene', name: 'Serene', warmth: 0.7, resolve: 0.7, shadow: 0.15,
    blurb: 'Unhurried in a way that unsettles people who are not.' },

  // ---- Wry -----------------------------------------------------------------
  { id: 'wry', name: 'Wry', warmth: 0.6, resolve: 0.5, shadow: 0.35,
    blurb: 'Finds the situation funny, which is not the same as liking it.' },
  { id: 'brash', name: 'Brash', warmth: 0.55, resolve: 0.8, shadow: 0.35,
    blurb: 'Arrives loud and stays loud. Occasionally earns it.' },
  { id: 'guarded', name: 'Guarded', warmth: 0.3, resolve: 0.7, shadow: 0.45,
    blurb: 'Answers the question that was asked and nothing near it.' },

  // ---- Worn ----------------------------------------------------------------
  { id: 'weary', name: 'Weary', warmth: 0.5, resolve: 0.35, shadow: 0.6,
    blurb: 'Has done this before. Would rather not again.' },
  { id: 'wounded', name: 'Wounded', warmth: 0.55, resolve: 0.3, shadow: 0.7,
    blurb: 'Something happened between printings and it shows.' },
  { id: 'solemn', name: 'Solemn', warmth: 0.4, resolve: 0.75, shadow: 0.55,
    blurb: 'Treats every moment as the important one. Usually right.' },

  // ---- Dark ----------------------------------------------------------------
  { id: 'cold', name: 'Cold', warmth: 0.05, resolve: 0.85, shadow: 0.8,
    blurb: 'Nothing reaches them, and nothing is meant to.' },
  { id: 'hollow', name: 'Hollow', warmth: 0.1, resolve: 0.25, shadow: 0.95,
    blurb: 'Whoever they were is not in the art any more.' },
  { id: 'ferocious', name: 'Ferocious', warmth: 0.2, resolve: 0.95, shadow: 0.85,
    blurb: 'All the old warmth, pointed the wrong way.' },
]

export function getDemeanor(id) {
  return DEMEANORS.find((d) => d.id === id) ?? null
}

// The demeanour NAMES a form carries, lowercased for use mid-sentence in a
// chatter line. Mirrors traitNames: unknown ids are dropped rather than rendered
// raw, so an id retired from the table above can never leak into the feed.
export function demeanorNames(ids) {
  return (ids ?? []).map((id) => getDemeanor(id)?.name.toLowerCase()).filter(Boolean)
}

// The centroid of a set of demeanour ids, as a point on the three axes.
//
// An EMPTY or wholly unknown list returns null rather than a default point.
// That distinction is load-bearing: the neutral centre (0.5, 0.5, 0.5) is a real
// place a demeanour could sit, so returning it for "nothing was picked" would
// make an unset form look like a deliberately middling one, and continuityDrift
// would score a confident number from no information at all. Callers must treat
// null as "no reading available" and skip the comparison.
export function demeanorCentroid(ids) {
  const picked = (ids ?? []).map(getDemeanor).filter(Boolean)
  if (!picked.length) return null
  const n = picked.length
  return {
    warmth: picked.reduce((s, d) => s + d.warmth, 0) / n,
    resolve: picked.reduce((s, d) => s + d.resolve, 0) / n,
    shadow: picked.reduce((s, d) => s + d.shadow, 0) / n,
  }
}

// Distance between two centroids, normalised to 0..1.
//
// Euclidean over three axes each bounded 0..1, so the raw maximum is sqrt(3) —
// the corner-to-corner diagonal. Dividing by it puts a full reinvention at 1 and
// an identical demeanour at 0, which is the range content/lineages.js's
// expectedDrift is written against.
const MAX_AXIS_DISTANCE = Math.sqrt(3)

export function centroidDistance(a, b) {
  if (!a || !b) return null
  const dw = a.warmth - b.warmth
  const dr = a.resolve - b.resolve
  const ds = a.shadow - b.shadow
  return Math.sqrt(dw * dw + dr * dr + ds * ds) / MAX_AXIS_DISTANCE
}
