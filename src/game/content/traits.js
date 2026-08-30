// Character traits — the small, human half of a character's identity, sitting
// under the archetype (content/archetypes.js).
//
// A trait is FLAVOR ONLY. Nothing in the sim reads one as a mechanic: no
// multiplier, no gate, no drift bias. That is a deliberate line, not an
// oversight. The archetype already carries this cast's mechanical weight, and the
// audit remediation pass measured the balance bands over 312 weeks — a second
// stacking dial on the same record would move them for no design gain.
//
// What traits actually do is get SAID. The community chatter pools in personas.js
// interpolate a trait's name, so a persona talks about a character the way a real
// fandom does — by their temperament, not their statistics. "Still the most
// patient villain in the game" is the entire point of this table.
//
// The player picks up to MAX_TRAITS per character. Two reads as a person; five
// reads as a character sheet.
//
// Each archetype names a few of these in its `traitHints`, which the creation form
// offers first. That is a suggestion and never a restriction — any trait fits any
// archetype, and a cheerful villain is a better character than the table's
// opinion of one.
//
// IDS ARE LOAD-BEARING: a character record stores trait ids and that record is
// persisted. See the same warning in content/archetypes.js.

export const MAX_TRAITS = 2

export const TRAITS = [
  // ---- Warmth --------------------------------------------------------------
  { id: 'cheerful', name: 'Cheerful', blurb: 'Relentlessly upbeat, in a way that reads as either charming or exhausting.' },
  { id: 'kind', name: 'Kind', blurb: 'Goes out of their way for people who cannot pay them back.' },
  { id: 'loyal', name: 'Loyal', blurb: 'Picks a side once and never revisits the decision.' },
  { id: 'earnest', name: 'Earnest', blurb: 'Means every word. Has never once been sarcastic.' },
  { id: 'charming', name: 'Charming', blurb: 'Gets away with a great deal, and knows exactly how much.' },

  // ---- Edge ---------------------------------------------------------------
  { id: 'arrogant', name: 'Arrogant', blurb: 'Correct often enough to be unbearable about it.' },
  { id: 'vain', name: 'Vain', blurb: 'Would rather lose beautifully than win in a bad outfit.' },
  { id: 'driven', name: 'Driven', blurb: 'Cannot stop. Has never seriously tried.' },
  { id: 'stubborn', name: 'Stubborn', blurb: 'Changes their mind roughly once per era.' },
  { id: 'territorial', name: 'Territorial', blurb: 'Draws a line early and defends it well past the point of reason.' },

  // ---- Cold ---------------------------------------------------------------
  { id: 'aloof', name: 'Aloof', blurb: 'Present at every important moment, involved in none of them.' },
  { id: 'precise', name: 'Precise', blurb: 'Has never rounded a number or missed a deadline.' },
  { id: 'relentless', name: 'Relentless', blurb: 'Does not hurry, and does not stop.' },
  { id: 'hollow', name: 'Hollow', blurb: 'Something is clearly missing. Nobody agrees on what.' },
  { id: 'silent', name: 'Silent', blurb: 'Has no lines at all, in any printing, ever.' },

  // ---- Old ----------------------------------------------------------------
  { id: 'ancient', name: 'Ancient', blurb: 'Older than the setting, and mildly bored by it.' },
  { id: 'patient', name: 'Patient', blurb: 'Perfectly willing to wait out everyone currently in the room.' },
  { id: 'dutiful', name: 'Dutiful', blurb: 'Still doing the job long after anyone was left to report to.' },
  { id: 'scarred', name: 'Scarred', blurb: 'Carries the evidence of a story the cards only hint at.' },
  { id: 'sealed', name: 'Sealed', blurb: 'Contained, restrained, or imprisoned — and not permanently.' },
  { id: 'secretive', name: 'Secretive', blurb: 'Knows the thing the plot is about, and will not be sharing it.' },

  // ---- Wild ---------------------------------------------------------------
  { id: 'feral', name: 'Feral', blurb: 'Never domesticated, and not a candidate for it.' },
  { id: 'wild', name: 'Wild', blurb: 'Behaves like weather. Cannot be reasoned with or predicted.' },
  { id: 'theatrical', name: 'Theatrical', blurb: 'Every entrance is staged. Every exit is worse.' },
  { id: 'sly', name: 'Sly', blurb: 'Already three steps ahead, and enjoying it far too much.' },
  { id: 'unreliable', name: 'Unreliable', blurb: 'Turns up when it suits them, which is somehow always the worst moment.' },
  { id: 'clumsy', name: 'Clumsy', blurb: 'Breaks something in most appearances. It is now part of the appeal.' },
]

export function getTrait(id) {
  return TRAITS.find((t) => t.id === id) ?? null
}

// The trait NAMES a character carries, lowercased for use mid-sentence in a
// chatter line. Unknown ids are dropped rather than rendered raw, so an id
// retired from the table above can never leak into the feed.
export function traitNames(ids) {
  return (ids ?? []).map((id) => getTrait(id)?.name.toLowerCase()).filter(Boolean)
}
