// The community personas — ~18 named, specific, quirky voices that put faces on
// the community. See docs/BRIEF.md "Community personas".
//
// The signal-vs-noise mechanic lives in two fields that the brief insists are
// SEPARATE:
//   reach       — how many players they move (loudness / prominence)
//   credibility — how accurate their reads are (hidden from the player; learned)
//
// A high-reach, low-credibility rage-baiter is loud and wrong; a quiet, sharp
// competitor is soft-spoken and right. Telling them apart over a run is the game.
//
// taste — weights (0..1) over what the persona actually cares about:
//   power     — raw card strength / power creep
//   value     — secondary-market price & investment
//   art       — art appeal & collectibility
//   fairness  — format health, diversity, "is this oppressive"
//   fun       — fresh mechanics, new toys
//
// type — streamer | competitor | collector | reviewer | theorycrafter
// sentiment — mutable mood toward the game, -100..100 (seeded near neutral)

export const PERSONAS = [
  { id: 'p01', name: 'BlastZoneBecca', type: 'streamer', reach: 92, credibility: 38,
    taste: { power: 0.5, value: 0.2, art: 0.1, fairness: 0.05, fun: 0.4 },
    blurb: 'Loud pack-opening streamer. Huge audience, hot takes, rarely right.' },

  { id: 'p02', name: 'Quietman Quan', type: 'competitor', reach: 31, credibility: 94,
    taste: { power: 0.6, value: 0.05, art: 0, fairness: 0.7, fun: 0.2 },
    blurb: 'Soft-spoken grinder. Small following, but when he calls a card broken, it is.' },

  { id: 'p03', name: 'VaultKeeper Vee', type: 'collector', reach: 64, credibility: 71,
    taste: { power: 0.1, value: 0.8, art: 0.6, fairness: 0.1, fun: 0.05 },
    blurb: 'Investor influencer. Calls tops and bottoms — mostly right, sometimes pumps a bag.' },

  { id: 'p04', name: 'The Refined Palate', type: 'reviewer', reach: 58, credibility: 80,
    taste: { power: 0.3, value: 0.2, art: 0.4, fairness: 0.5, fun: 0.5 },
    blurb: 'Set reviewer with taste. Early sales sentiment lives and dies on his verdict.' },

  { id: 'p05', name: 'NetdeckNorm', type: 'theorycrafter', reach: 47, credibility: 66,
    taste: { power: 0.7, value: 0.1, art: 0, fairness: 0.4, fun: 0.3 },
    blurb: 'Spreadsheet theorycrafter. Solves formats fast and shares the lists.' },

  { id: 'p06', name: 'RageQuit Rocco', type: 'streamer', reach: 78, credibility: 22,
    taste: { power: 0.6, value: 0.1, art: 0, fairness: 0.6, fun: 0.2 },
    blurb: 'Professional outrage. Everything is broken, everything is dead. Numbers say otherwise.' },

  { id: 'p07', name: 'Dr. Meta', type: 'theorycrafter', reach: 55, credibility: 88,
    taste: { power: 0.5, value: 0.05, art: 0, fairness: 0.8, fun: 0.3 },
    blurb: 'Academic format analyst. Dry, data-driven, almost never wrong on diversity.' },

  { id: 'p08', name: 'Glimmer', type: 'collector', reach: 83, credibility: 44,
    taste: { power: 0.05, value: 0.7, art: 0.85, fairness: 0, fun: 0.2 },
    blurb: 'Aesthetic-first collector with a big feed. Hypes art; her price calls are a coin flip.' },

  { id: 'p09', name: 'Topdeck Tariq', type: 'competitor', reach: 69, credibility: 76,
    taste: { power: 0.7, value: 0.2, art: 0, fairness: 0.5, fun: 0.4 },
    blurb: 'Tournament regular with a channel. Reliable competitive read, decent reach.' },

  { id: 'p10', name: 'CardboardCathy', type: 'reviewer', reach: 41, credibility: 59,
    taste: { power: 0.3, value: 0.3, art: 0.3, fairness: 0.3, fun: 0.6 },
    blurb: 'Cozy reviewer for the casual crowd. Cares most whether a set is fun to crack.' },

  { id: 'p10b', name: 'HypeBeast Hollis', type: 'streamer', reach: 88, credibility: 30,
    taste: { power: 0.4, value: 0.5, art: 0.3, fairness: 0, fun: 0.5 },
    blurb: 'Whatever is trending, louder. Manufactures bubbles; some of them even pop off.' },

  { id: 'p12', name: 'Ledger Liu', type: 'collector', reach: 52, credibility: 85,
    taste: { power: 0.1, value: 0.9, art: 0.3, fairness: 0.1, fun: 0 },
    blurb: 'Cold-eyed market analyst. Boring, accurate, allergic to hype.' },

  { id: 'p13', name: 'Spike Sorensen', type: 'competitor', reach: 44, credibility: 81,
    taste: { power: 0.8, value: 0.1, art: 0, fairness: 0.6, fun: 0.2 },
    blurb: 'Win-at-all-costs pro. First to find the broken thing, loudest to demand the ban.' },

  { id: 'p14', name: 'Pixiebloom', type: 'streamer', reach: 75, credibility: 49,
    taste: { power: 0.3, value: 0.2, art: 0.5, fairness: 0.2, fun: 0.8 },
    blurb: 'Wholesome variety streamer. Plays for fun; sentiment swings the casual base hard.' },

  { id: 'p15', name: 'The Archivist', type: 'reviewer', reach: 36, credibility: 90,
    taste: { power: 0.4, value: 0.4, art: 0.5, fairness: 0.6, fun: 0.4 },
    blurb: 'Long-game historian. Low reach, gold-standard credibility on power creep.' },

  { id: 'p16', name: 'FlipFlop Phil', type: 'collector', reach: 61, credibility: 33,
    taste: { power: 0.1, value: 0.8, art: 0.4, fairness: 0, fun: 0.1 },
    blurb: 'Day-trader energy. Calls every card a moonshot, then a dump, then a moonshot.' },

  { id: 'p17', name: 'GrindstoneGail', type: 'theorycrafter', reach: 50, credibility: 72,
    taste: { power: 0.6, value: 0.15, art: 0, fairness: 0.55, fun: 0.35 },
    blurb: 'Ladder-obsessed list-builder. Solid reads, posts the win rates to back them.' },

  { id: 'p18', name: 'Captain Combo', type: 'theorycrafter', reach: 67, credibility: 57,
    taste: { power: 0.75, value: 0.1, art: 0, fairness: 0.3, fun: 0.7 },
    blurb: 'Lives for the broken combo. Overrates jank, but occasionally finds the real deal.' },
]
