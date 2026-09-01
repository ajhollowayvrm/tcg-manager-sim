// Milestones — the interesting half of a run's legacy score (see legacy.js).
//
// Each is awarded ONCE, the first week its `test` passes, and stamped with the
// week it fired. `test` is pure and reads only state, so the whole table can be
// re-evaluated cheaply every tick.
//
// Design rule: every entry is POSITIVE. There are deliberately no anti-
// milestones for bad play — scoring mistakes negatively turns the retrospective
// into a scold and pushes players toward safe, boring runs. The hard entries are
// hard because they ask for something difficult, not because failure is taxed.
//
// Several exist specifically to reward the disciplines the economy rebalance
// demands: `lean_studio` for pruning the shelf, `redeemed` for spending real
// money digging a soured community back out, and `no_gouge` for leaving money
// on the table.

import { communitySentiment } from '../simulation.js'

const liveSets = (s) => (s.sets ?? []).filter((x) => !x.rotated && !x.outOfPrint)
const priciest = (s) => (s.cards ?? []).reduce((m, c) => Math.max(m, c.singlePrice ?? 0), 0)
const mediaHits = (s) => (s.mediaDeals ?? []).filter((d) => d.outcome === 'hit')

export const MILESTONES = [
  // ---- Getting started ----------------------------------------------------
  { id: 'first_set', name: 'Ink on cardboard', points: 25,
    blurb: 'Shipped your first set.',
    test: (s) => (s.sets?.length ?? 0) >= 1 },
  { id: 'first_block', name: 'An era begins', points: 25,
    blurb: 'Opened your first block.',
    test: (s) => (s.blocks?.length ?? 0) >= 1 },

  // ---- Early proof --------------------------------------------------------
  { id: 'ten_thousand', name: 'A real audience', points: 40,
    blurb: 'Reached 10,000 players.',
    test: (s) => (s.playerBase ?? 0) >= 10_000 },
  { id: 'first_million', name: 'First million', points: 40,
    blurb: 'Took $1,000,000 in lifetime revenue.',
    test: (s) => (s.legacy?.totals.grossRevenue ?? 0) >= 1_000_000 },
  { id: 'sold_out', name: 'Sold out', points: 35,
    blurb: 'Sold a set’s entire print run.',
    test: (s) => (s.sets ?? []).some((x) => (x.supply ?? 0) > 0 && (x.sold ?? 0) >= x.supply) },
  { id: 'god_pack', name: 'The one they talk about', points: 30,
    blurb: 'A god pack was pulled from your product.',
    test: (s) => (s.legacy?.totals.godPacks ?? 0) >= 1 },

  // ---- Craft --------------------------------------------------------------
  { id: 'grail', name: 'Grail', points: 70,
    blurb: 'A single crossed $1,000.',
    test: (s) => priciest(s) >= 1_000 },
  { id: 'icon', name: 'Household face', points: 80,
    blurb: 'A character reached icon status.',
    test: (s) => (s.characters ?? []).some((c) => c.trajectory === 'icon') },
  { id: 'honest_broker', name: 'Honest broker', points: 70,
    blurb: 'Published the pull rates on ten consecutive sets.',
    test: (s) => {
      const ordered = [...(s.sets ?? [])].sort((a, b) => a.releasedWeek - b.releasedWeek)
      let run = 0
      for (const x of ordered) run = x.oddsPublished ? run + 1 : 0
      return run >= 10
    } },
  { id: 'vintage', name: 'Vintage', points: 80,
    blurb: 'Kept a set in the catalogue for five years.',
    test: (s) => (s.sets ?? []).some((x) => s.week - x.releasedWeek >= 260) },
  // Illustration sets are, by measurement, close to cash-neutral: what they buy
  // is collection value, community goodwill and a catalogue worth remembering,
  // not margin. Legacy is exactly the axis the game already keeps for that, so
  // this is where the reward for finishing one is legible.
  // `!g.discovered` is load-bearing on all three: a group the COMMUNITY named
  // out of cards that happened to sit together is not something the player did,
  // and awarding "Completed your first illustration set" for one is simply
  // false. It fired that way in testing — a discovered run tripped the milestone
  // in week 11 of a run that had authored nothing.
  { id: 'first_illustration_set', name: 'It goes together', points: 40,
    blurb: 'Completed your first illustration set.',
    test: (s) => (s.illustrationSets ?? []).some((g) => g.status === 'complete' && !g.discovered) },
  { id: 'long_run', name: 'Worth the wait', points: 90,
    blurb: 'Completed an illustration set that spanned three or more releases.',
    test: (s) => (s.illustrationSets ?? []).some(
      (g) => g.status === 'complete' && !g.discovered
        && new Set((g.members ?? []).map((m) => m.setId)).size >= 3,
    ) },
  { id: 'curator', name: 'Curator', points: 120,
    blurb: 'Completed eight illustration sets, and abandoned none.',
    test: (s) => {
      const groups = (s.illustrationSets ?? []).filter((g) => !g.discovered)
      if (groups.some((g) => g.status === 'abandoned')) return false
      return groups.filter((g) => g.status === 'complete').length >= 8
    } },

  // ---- Discipline ---------------------------------------------------------
  { id: 'debt_free', name: 'Solvent', points: 60,
    blurb: 'Three straight years in the black.',
    test: (s) => (s.legacy?.streaks.solvent ?? 0) >= 156 },
  { id: 'no_gouge', name: 'Fair price', points: 90,
    blurb: 'Six years without ever charging more than $6 a pack.',
    test: (s) => s.week >= 312 && (s.sets?.length ?? 0) > 0 && s.sets.every((x) => (x.price ?? 0) <= 6) },
  { id: 'lean_studio', name: 'Curated', points: 150,
    blurb: 'Five years never running more than six sets in print.',
    test: (s) => (s.legacy?.streaks.leanShelf ?? 0) >= 260 },

  // ---- Standing -----------------------------------------------------------
  { id: 'hundred_thousand', name: 'Phenomenon', points: 100,
    blurb: 'Reached 100,000 players.',
    test: (s) => (s.playerBase ?? 0) >= 100_000 },
  { id: 'beloved', name: 'Beloved', points: 120,
    blurb: 'Held the community above +40 for half a year.',
    test: (s) => (s.legacy?.streaks.beloved ?? 0) >= 26 },
  { id: 'redeemed', name: 'Redemption arc', points: 140,
    blurb: 'Brought the community from open hostility back to warmth.',
    test: (s) => (s.legacy?.flags?.redeemed ?? false) },
  { id: 'anniversary_shipped', name: 'Worth celebrating', points: 110,
    blurb: 'Shipped an anniversary set.',
    test: (s) => (s.sets ?? []).some((x) => x.tier === 'anniversary') },
  { id: 'mythic_grail', name: 'Mythic grail', points: 130,
    blurb: 'A single crossed $5,000.',
    test: (s) => priciest(s) >= 5_000 },

  // ---- Legend -------------------------------------------------------------
  { id: 'half_million', name: 'Half a million', points: 220,
    blurb: 'Reached 500,000 players.',
    test: (s) => (s.playerBase ?? 0) >= 500_000 },
  { id: 'phoenix', name: 'Phoenix', points: 240,
    blurb: 'Fell past half a million in debt and traded your way back to solvency.',
    test: (s) => (s.legacy?.flags?.phoenix ?? false) },
  { id: 'pantheon', name: 'Pantheon', points: 280,
    blurb: 'Three characters reached icon status.',
    test: (s) => (s.characters ?? []).filter((c) => c.trajectory === 'icon').length >= 3 },
  { id: 'hundred_million', name: 'An institution', points: 300,
    blurb: 'Took $100,000,000 in lifetime revenue.',
    test: (s) => (s.legacy?.totals.grossRevenue ?? 0) >= 100_000_000 },

  // ---- Cross-media --------------------------------------------------------
  { id: 'cross_media_small', name: 'Off the table', points: 70,
    blurb: 'Landed your first cross-media hit.',
    test: (s) => mediaHits(s).length >= 1 },
  { id: 'cross_media_big', name: 'On every screen', points: 260,
    blurb: 'Landed a theatrical release.',
    test: (s) => mediaHits(s).some((d) => d.dealId === 'm_theatrical') },
  { id: 'merch_empire', name: 'Merch empire', points: 80,
    blurb: 'Ran three merchandise lines at once for a full year.',
    test: (s) => (s.legacy?.streaks.merchEmpire ?? 0) >= 52 },
]

export function milestoneById(id) {
  return MILESTONES.find((m) => m.id === id) ?? null
}

// Sanity helper for the retrospective UI: total points on the board.
export const MAX_MILESTONE_POINTS = MILESTONES.reduce((sum, m) => sum + m.points, 0)

// Re-exported so legacy.js and the panel agree on how sentiment is read.
export { communitySentiment }
