// Live box breaks — the collector-side sibling of organized play (see
// promos.js): you sponsor a live-streamed break of a specific set
// instead of a tournament. It costs cash, grows the COLLECTOR segment (not
// competitive), warms sentiment a touch, and lifts hype across that set's
// cards for a while — the real-hobby marketing channel where a shop or
// streamer sells spots in a box and cracks it live on camera.

export const BREAK_PROGRAMS = {
  lgs: {
    kind: 'lgs', name: 'LGS Community Break', cost: 12_000,
    collectorBoost: 0.015, sentiment: 3, hypeLift: 0.08,
    blurb: 'A local game store cracks a case live for its regulars. Modest reach, real community goodwill.',
  },
  twitch: {
    kind: 'twitch', name: 'Twitch Group Break', cost: 30_000,
    collectorBoost: 0.035, sentiment: 4, hypeLift: 0.18,
    blurb: 'Sell spots in a box and break it live on stream. Solid reach, a real jolt of collector buzz.',
  },
  celebrity: {
    kind: 'celebrity', name: 'Celebrity Break Sponsorship', cost: 70_000,
    collectorBoost: 0.06, sentiment: 5, hypeLift: 0.3,
    blurb: 'Pay a major personality to break your product on their channel. Expensive, but it can make a set a phenomenon.',
  },
}

export function getBreakProgram(kind) {
  return BREAK_PROGRAMS[kind] ?? null
}
