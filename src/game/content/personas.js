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
// affinity — optional theme tags this voice is biased toward; a set in a theme
//   they love lands warmer, one they dislike colder. (Soft flavor weight.)
// sentiment — mutable mood toward the game, -100..100 (seeded near neutral)
//
// Roster is 50+ for a sprawling scene — see docs/COMMUNITY_PLAN.md. The
// Community panel filters/groups so a list this long stays scannable.

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

  // ---- Expansion roster (50+ total). New archetypes + affinity flavor. ----

  // Lapsed veterans — high credibility, low current reach, nostalgia + power-creep radar.
  { id: 'p19', name: 'Old Guard Odell', type: 'reviewer', reach: 29, credibility: 91,
    taste: { power: 0.5, value: 0.3, art: 0.4, fairness: 0.8, fun: 0.2 },
    affinity: ['kingdoms', 'knights'],
    blurb: 'Played since the first set. Quiet now, but power creep makes his blood boil.' },
  { id: 'p20', name: 'Retired Rin', type: 'competitor', reach: 34, credibility: 86,
    taste: { power: 0.6, value: 0.2, art: 0.1, fairness: 0.7, fun: 0.3 },
    blurb: 'Former national champ. Drops in to call out an oppressive format, then vanishes.' },

  // Drama channels / aggregators — huge reach, low credibility, amplify the loud.
  { id: 'p21', name: 'The Salt Mine', type: 'streamer', reach: 90, credibility: 18,
    taste: { power: 0.4, value: 0.3, art: 0.1, fairness: 0.5, fun: 0.2 },
    blurb: 'Drama channel. Whatever the community is mad about, but louder and with a thumbnail.' },
  { id: 'p22', name: 'MetaDailyMaya', type: 'reviewer', reach: 81, credibility: 41,
    taste: { power: 0.5, value: 0.4, art: 0.2, fairness: 0.4, fun: 0.3 },
    blurb: 'News aggregator. Reports the takes others have; rarely an original read.' },

  // Budget brewers — care about accessibility; love a playable common, hate chase-gating.
  { id: 'p23', name: 'Budget Benny', type: 'theorycrafter', reach: 58, credibility: 63,
    taste: { power: 0.6, value: 0.5, art: 0.05, fairness: 0.5, fun: 0.5 },
    blurb: 'Brews top decks on a shoestring. Champions the cheap card; resents the paywall meta.' },
  { id: 'p24', name: 'Kitchen Table Kim', type: 'reviewer', reach: 46, credibility: 55,
    taste: { power: 0.2, value: 0.2, art: 0.4, fairness: 0.4, fun: 0.9 },
    affinity: ['cute', 'nature'],
    blurb: 'Casual-first. Cares that the game is fun and affordable for the whole table.' },

  // Whale collectors — only move on the top tiers; their hype crowns a grail.
  { id: 'p25', name: 'Whale Wendell', type: 'collector', reach: 70, credibility: 60,
    taste: { power: 0, value: 0.9, art: 0.8, fairness: 0, fun: 0.05 },
    blurb: 'Buys the case, chases the 1-of. When he wants a secret rare, the price moves.' },
  { id: 'p26', name: 'Grail Hunter Gita', type: 'collector', reach: 55, credibility: 73,
    taste: { power: 0, value: 0.85, art: 0.9, fairness: 0, fun: 0.1 },
    affinity: ['cosmic', 'arcane'],
    blurb: 'Only the chase cards exist to her. Her wishlist is a price oracle for the top rarity.' },

  // Graders / authenticators — react to condition & counterfeit events.
  { id: 'p27', name: 'Slab City Sergei', type: 'collector', reach: 49, credibility: 78,
    taste: { power: 0, value: 0.8, art: 0.6, fairness: 0.2, fun: 0 },
    blurb: 'Grading-obsessed. A counterfeit scare or a gem-mint pull is all he talks about.' },

  // More streamers (the loud, swingy casual movers).
  { id: 'p28', name: 'CrackADay Cass', type: 'streamer', reach: 84, credibility: 35,
    taste: { power: 0.3, value: 0.5, art: 0.4, fairness: 0, fun: 0.6 },
    blurb: 'Opens product every single day. Pure hype engine; accuracy optional.' },
  { id: 'p29', name: 'TryhardTeo', type: 'streamer', reach: 72, credibility: 52,
    taste: { power: 0.7, value: 0.1, art: 0, fairness: 0.5, fun: 0.4 },
    blurb: 'Competitive streamer grinding ladder live. Decent reads between the rage.' },
  { id: 'p30', name: 'Cozy Coraline', type: 'streamer', reach: 63, credibility: 47,
    taste: { power: 0.2, value: 0.3, art: 0.6, fairness: 0.2, fun: 0.85 },
    affinity: ['cute', 'spirits'],
    blurb: 'Chill late-night opener. Her vibe swings the casual mood gently but widely.' },
  { id: 'p31', name: 'ClipFarm Kai', type: 'streamer', reach: 79, credibility: 26,
    taste: { power: 0.5, value: 0.3, art: 0.2, fairness: 0.3, fun: 0.5 },
    blurb: 'Lives for the viral clip. Will declare anything broken if it makes a good 30 seconds.' },

  // More competitors / pros.
  { id: 'p32', name: 'Meticulous Mei', type: 'competitor', reach: 40, credibility: 89,
    taste: { power: 0.7, value: 0.1, art: 0, fairness: 0.7, fun: 0.2 },
    blurb: 'Methodical pro. Her tier list is the one other pros quietly copy.' },
  { id: 'p33', name: 'AllIn Alvarez', type: 'competitor', reach: 57, credibility: 51,
    taste: { power: 0.85, value: 0.1, art: 0, fairness: 0.3, fun: 0.5 },
    blurb: 'High-variance gambler pro. Overhypes his pet deck; sometimes it’s actually busted.' },
  { id: 'p34', name: 'Coach Calloway', type: 'competitor', reach: 62, credibility: 70,
    taste: { power: 0.65, value: 0.15, art: 0, fairness: 0.6, fun: 0.35 },
    blurb: 'Team coach with a podcast. Measured, respected, moves the competitive base.' },
  { id: 'p35', name: 'Rookie Reyna', type: 'competitor', reach: 38, credibility: 45,
    taste: { power: 0.6, value: 0.2, art: 0.1, fairness: 0.5, fun: 0.5 },
    blurb: 'Rising talent, still learning. Reads improving; reach climbing fast.' },

  // More collectors / investors.
  { id: 'p36', name: 'PortfolioPaz', type: 'collector', reach: 66, credibility: 68,
    taste: { power: 0.1, value: 0.9, art: 0.4, fairness: 0.1, fun: 0 },
    blurb: 'Treats the game like a stock index. Diversified takes, steady reach.' },
  { id: 'p37', name: 'MoonshotMo', type: 'collector', reach: 59, credibility: 28,
    taste: { power: 0.1, value: 0.85, art: 0.5, fairness: 0, fun: 0.2 },
    blurb: 'Perma-bull. Every card is going to the moon. Occasionally one does.' },
  { id: 'p38', name: 'Sealed Sage Saanvi', type: 'collector', reach: 53, credibility: 82,
    taste: { power: 0.05, value: 0.9, art: 0.5, fairness: 0.1, fun: 0 },
    blurb: 'Sealed-product specialist. Knows exactly when print run will crater a box.' },

  // More reviewers / critics.
  { id: 'p39', name: 'The Honest Pull', type: 'reviewer', reach: 64, credibility: 74,
    taste: { power: 0.4, value: 0.4, art: 0.5, fairness: 0.5, fun: 0.5 },
    blurb: 'Trusted set-review channel. A fair, thorough verdict that sways early sales.' },
  { id: 'p40', name: 'Hot Take Hank', type: 'reviewer', reach: 71, credibility: 34,
    taste: { power: 0.5, value: 0.3, art: 0.2, fairness: 0.3, fun: 0.4 },
    blurb: 'Contrarian by trade. Pans the loved set, praises the flop — for the engagement.' },
  { id: 'p41', name: 'Lore Keeper Lux', type: 'reviewer', reach: 43, credibility: 67,
    taste: { power: 0.2, value: 0.3, art: 0.7, fairness: 0.3, fun: 0.6 },
    affinity: ['arcane', 'spirits', 'undead'],
    blurb: 'Reviews for story & art over power. The flavor crowd listens to her.' },

  // More theorycrafters.
  { id: 'p42', name: 'SolveItSeb', type: 'theorycrafter', reach: 51, credibility: 84,
    taste: { power: 0.7, value: 0.05, art: 0, fairness: 0.6, fun: 0.3 },
    blurb: 'Cracks the format the week it drops. When Seb says solved, it’s solved.' },
  { id: 'p43', name: 'JankLord Jude', type: 'theorycrafter', reach: 60, credibility: 39,
    taste: { power: 0.6, value: 0.1, art: 0.1, fairness: 0.2, fun: 0.9 },
    blurb: 'Brews beautiful nonsense. Mostly unplayable; every so often, a real sleeper.' },
  { id: 'p44', name: 'DataDiv Dana', type: 'theorycrafter', reach: 48, credibility: 87,
    taste: { power: 0.5, value: 0.2, art: 0, fairness: 0.85, fun: 0.25 },
    blurb: 'Publishes the diversity numbers. The one everyone cites in the ban debate.' },

  // A few more loud/quirky voices to round out the scene.
  { id: 'p45', name: 'Unboxing Ursula', type: 'streamer', reach: 86, credibility: 31,
    taste: { power: 0.2, value: 0.6, art: 0.5, fairness: 0, fun: 0.5 },
    blurb: 'Mega-channel unboxer. Her pulls set the collective FOMO for a week.' },
  { id: 'p46', name: 'Tournament Tess', type: 'competitor', reach: 54, credibility: 77,
    taste: { power: 0.7, value: 0.15, art: 0, fairness: 0.6, fun: 0.3 },
    blurb: 'Runs the biggest community events. Her metagame breakdowns are gospel.' },
  { id: 'p47', name: 'Penny Pincher Pat', type: 'theorycrafter', reach: 42, credibility: 58,
    taste: { power: 0.55, value: 0.6, art: 0.05, fairness: 0.5, fun: 0.5 },
    blurb: 'Budget theorycrafter. Finds the $2 common that quietly powers the best deck.' },
  { id: 'p48', name: 'Vintage Vera', type: 'collector', reach: 47, credibility: 75,
    taste: { power: 0, value: 0.8, art: 0.7, fairness: 0.1, fun: 0.1 },
    affinity: ['kingdoms', 'frost'],
    blurb: 'Old-set collector. Rotations and reprints are personal attacks on her shelf.' },
  { id: 'p49', name: 'StreamSnipe Sy', type: 'streamer', reach: 68, credibility: 29,
    taste: { power: 0.5, value: 0.2, art: 0.1, fairness: 0.4, fun: 0.5 },
    blurb: 'Reacts to whatever just popped off on a bigger stream. Pure echo, big reach.' },
  { id: 'p50', name: 'Fair Play Farah', type: 'reviewer', reach: 56, credibility: 83,
    taste: { power: 0.4, value: 0.2, art: 0.3, fairness: 0.9, fun: 0.4 },
    blurb: 'Format-health crusader. Celebrates a healthy meta; scathing about a solved one.' },
  { id: 'p51', name: 'WhaleWatch Wu', type: 'collector', reach: 44, credibility: 64,
    taste: { power: 0.05, value: 0.85, art: 0.6, fairness: 0.1, fun: 0 },
    blurb: 'Tracks what the whales buy and front-runs them. Right often enough to matter.' },
  { id: 'p52', name: 'Casual Carlos', type: 'streamer', reach: 61, credibility: 43,
    taste: { power: 0.25, value: 0.25, art: 0.4, fairness: 0.25, fun: 0.85 },
    affinity: ['cute', 'beasts'],
    blurb: 'Speaks for the kitchen-table crowd. Big swing on casual goodwill.' },
]
