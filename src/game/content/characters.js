// The character roster seed. Unlike artists (a fixed cast the player commissions
// from), characters are entirely player-made — there's no static identity list to
// ship with. The roster starts EMPTY; every character in a run is one the player
// created in the set builder. This file exists so characters.js has a seed
// function to call (mirroring artists.js's shape) and a place to grow a starter
// roster later if flavor ever calls for one.

export const CHARACTERS = []

export function getCharacterSeed(id) {
  return CHARACTERS.find((c) => c.id === id) ?? null
}
