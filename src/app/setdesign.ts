/**
 * The vocabulary a set is designed in.
 *
 * Archetypes, finishes, the rarity ladder and the pull arithmetic. Shared by
 * the set wizard, the format editor and the character screen, so none of them
 * carries a private copy of a table the others also read.
 *
 * `MIXES` and the module-level `pickRarity` used to sit here. They were the
 * first version of the rarity screen — three preset weightings the player chose
 * between — and the editable ladder replaced them. Both had been unreachable
 * since, and `pickRarity` read as live only because a local `useState` variable
 * in `CardsStep` shares its name. `FINISHES` was declared and never read. All
 * three are cut.
 */
import type { Rarity, SimState, Treatment } from '../sim/types.ts';

export const ARCHETYPES: Array<{ name: string; lore: string; sells: string }> = [
  { name: 'Mascot', lore: 'The face on the box. Safe, kind, unthreatening.', sells: 'A little to everyone, for decades.' },
  { name: 'Rival', lore: 'The one who beats your hero first.', sells: 'Spikes at launch, gone in three sets.' },
  { name: 'Mentor', lore: 'Older, patient, already respected.', sells: 'Steady with adults. Never carries a launch.' },
  { name: 'Trickster', lore: 'Nobody agrees what they are.', sells: 'A grail or unsellable. No middle.' },
  { name: 'Legend', lore: 'Half-remembered. Rarely shown at all.', sells: 'Collectors and investors, not children.' },
  { name: 'Upstart', lore: 'New, loud, everywhere for one year.', sells: 'Cheap reach with kids. Gone in a decade.' },
];
export type Finish = Treatment;

/** Grouped so the picker reads like a print shop's menu, not a flat list. */
export const FINISH_GROUPS: Array<[string, Finish[]]> = [
  ['Surface', ['holo', 'reverseHolo', 'rainbowFoil', 'goldFoil', 'coldFoil']],
  ['Texture', ['textured', 'etched', 'embossed']],
  ['Frame', ['fullArt', 'extendedArt', 'borderless', 'alternateArt']],
  ['Extra', ['jumbo', 'signed']],
];

/** Every tier the sim has, with the studio's opening name for it. */
export const ALL_RARITIES: Array<[Rarity, string]> = [
  ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['doubleRare', 'Double rare'],
  ['ultraRare', 'Ultra rare'], ['illustrationRare', 'Illustration rare'],
  ['specialIllustrationRare', 'Special illustration'], ['hyperRare', 'Hyper rare'],
  ['promo', 'Promo'],
];
export const FINISH_LABEL: Record<Finish, string> = {
  holo: 'Holo', reverseHolo: 'Reverse holo', rainbowFoil: 'Rainbow foil',
  goldFoil: 'Gold foil', coldFoil: 'Cold foil', textured: 'Textured',
  etched: 'Etched', embossed: 'Embossed', fullArt: 'Full art',
  extendedArt: 'Extended art', borderless: 'Borderless', alternateArt: 'Alternate art',
  jumbo: 'Jumbo', signed: 'Signed',
};

export const finishText = (f: Finish[]): string =>
  f.length === 0 ? '\u2014' : f.map(x => FINISH_LABEL[x]).join(' + ');

/**
 * One rung of the studio's rarity ladder.
 *
 * `rarity` is the sim's enum and decides the pull odds. `label` is whatever the
 * studio calls it — the sim has no opinion about the word, and every real TCG
 * invents its own.
 */
export interface RarityRow { id: string; label: string; count: number; advertised: boolean; finishes: Finish[] }

/** The common rung is not in the list — it fills whatever the others leave. */
export const COMMON_ROW_ID = 'row_common';

let rowSeq = 0;
export const newRowId = (): string => `row_${Date.now().toString(36)}_${rowSeq++}`;

export const DEFAULT_ROWS: RarityRow[] = [
  { id: 'row_d1', label: 'Uncommon', count: 45, advertised: true, finishes: [] },
  { id: 'row_d2', label: 'Rare', count: 25, advertised: true, finishes: ['holo'] },
  { id: 'row_d3', label: 'Double rare', count: 13, advertised: true, finishes: ['holo'] },
  { id: 'row_d4', label: 'Ultra rare', count: 7, advertised: true, finishes: ['fullArt', 'holo'] },
  { id: 'row_d5', label: 'Illustration rare', count: 5, advertised: true, finishes: ['extendedArt', 'textured'] },
  { id: 'row_d6', label: 'Special illustration', count: 3, advertised: true, finishes: ['fullArt', 'etched', 'textured'] },
  { id: 'row_d7', label: 'Hyper rare', count: 2, advertised: false, finishes: ['borderless', 'rainbowFoil', 'embossed'] },
];

/**
 * One slot in the pack, and what it can draw.
 *
 * This is the object the studio actually authors. A real pack is not a table of
 * odds per rarity — it is a fixed number of slots, and each slot draws from its
 * own pool. Four commons, three uncommons, one slot that is usually a rare and
 * occasionally something better. The per-card pull rate is what FALLS OUT of
 * that (`derivePulls`), which is the opposite of how `config.rarity.pull`
 * works, and it is the right way round: the studio decides the pack, and the
 * odds are a consequence.
 *
 * `odds` maps a rung id to a relative weight. Weights are normalised, so they
 * can be typed as percentages, as 1-in-N, or as any numbers at all — a slot
 * whose weights sum to 50 behaves exactly like one that sums to 100.
 */
export interface PackSlot { id: string; label: string; odds: Record<string, number> }

let slotSeq = 0;
export const newSlotId = (): string => `slot_${Date.now().toString(36)}_${slotSeq++}`;

/** A plain modern pack, as a starting point the studio can tear up. */
export const DEFAULT_SLOTS: PackSlot[] = [
  { id: 'slot_d1', label: 'Commons', odds: { [COMMON_ROW_ID]: 100 } },
  { id: 'slot_d2', label: 'Commons', odds: { [COMMON_ROW_ID]: 100 } },
  { id: 'slot_d3', label: 'Commons', odds: { [COMMON_ROW_ID]: 100 } },
  { id: 'slot_d4', label: 'Commons', odds: { [COMMON_ROW_ID]: 100 } },
  { id: 'slot_d5', label: 'Uncommons', odds: { row_d1: 100 } },
  { id: 'slot_d6', label: 'Uncommons', odds: { row_d1: 100 } },
  { id: 'slot_d7', label: 'Uncommons', odds: { row_d1: 100 } },
  { id: 'slot_d8', label: 'Reverse slot', odds: { [COMMON_ROW_ID]: 65, row_d1: 25, row_d2: 10 } },
  { id: 'slot_d9', label: 'The hit', odds: { row_d2: 62, row_d3: 22, row_d4: 10, row_d5: 4, row_d6: 1.6, row_d7: 0.4 } },
];

/**
 * Expected draws of each rung per pack, from the slots alone.
 *
 * Each slot contributes its normalised share to whichever rungs it can draw. A
 * slot with no weights contributes nothing rather than throwing — a half-built
 * pack must still render.
 */
export function slotDraws(slots: PackSlot[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of slots) {
    const total = Object.values(slot.odds).reduce((n, w) => n + Math.max(0, w), 0);
    if (total <= 0) continue;
    for (const [rowId, w] of Object.entries(slot.odds)) {
      if (w <= 0) continue;
      out[rowId] = (out[rowId] ?? 0) + w / total;
    }
  }
  return out;
}

/**
 * Copies of ONE card per pack, per rung — the number `Card.pullRate` wants.
 *
 * A rung drawn 0.4 times a pack and holding 8 cards puts each of those cards in
 * one pack in twenty. Spreading the rung's draws across its own cards is the
 * whole reason set size changes rarity: `config.rarity.referenceSetSize` exists
 * to fake this, and a real slot table does not need it.
 *
 * A rung with no cards returns nothing rather than dividing by zero.
 */
export function derivePulls(slots: PackSlot[], rows: RarityRow[], commons: number): Record<string, number> {
  const draws = slotDraws(slots);
  const counts: Record<string, number> = { [COMMON_ROW_ID]: commons };
  for (const r of rows) counts[r.id] = r.count;
  const out: Record<string, number> = {};
  for (const [rowId, drawn] of Object.entries(draws)) {
    const n = counts[rowId] ?? 0;
    if (n > 0) out[rowId] = drawn / n;
  }
  return out;
}

/**
 * A slot share, with enough places to still say something when it is tiny.
 *
 * A chase rung at one in ten thousand is a 0.01% share. Fixed to whole percent
 * that renders as `0%`, which tells the studio its number did not take — so the
 * places have to follow the magnitude.
 */
export function shareText(share: number): string {
  if (share <= 0) return '—';
  const places = share >= 0.1 ? 0 : share >= 0.01 ? 1 : share >= 0.001 ? 2 : 3;
  return `${(share * 100).toFixed(places)}%`;
}

/**
 * The chance a pack holds AT LEAST ONE of each rung.
 *
 * **Not the sum of the draws, and the difference is a wrong answer rather than
 * a rounding one.** Expected draws add; probabilities do not. A rung sitting in
 * three slots at 80/67/30 sums to 1.77 draws, which reads as a guarantee — but
 * all three slots miss 4.7% of the time, so one pack in 21 contains none of it.
 *
 * Slots are independent, so the chance of missing everywhere is the product of
 * the per-slot misses, and this is one minus that.
 *
 * `slotDraws` is still the right measure for the pull rate, which is expected
 * COPIES per pack. These two answer different questions and both are needed.
 */
export function packOdds(slots: PackSlot[]): Record<string, number> {
  const miss: Record<string, number> = {};
  for (const slot of slots) {
    const total = Object.values(slot.odds).reduce((n, w) => n + Math.max(0, w), 0);
    if (total <= 0) continue;
    for (const [rowId, w] of Object.entries(slot.odds)) {
      if (w <= 0) continue;
      miss[rowId] = (miss[rowId] ?? 1) * (1 - w / total);
    }
  }
  const out: Record<string, number> = {};
  for (const [rowId, m] of Object.entries(miss)) out[rowId] = 1 - m;
  return out;
}

/**
 * How often a pack holds one of a rung, in words.
 *
 * Three bands, because one phrasing cannot carry the whole range. A near-
 * certainty is not usefully "1 pack in 1.0" — that rounds a 95% rung and a
 * guaranteed one onto the same string, which is the bug this replaced. A rare
 * one is not usefully "5% of packs" either; the interval is how a pull rate is
 * read and quoted.
 */
export function packFrequency(p: number): string {
  if (p <= 0) return 'Never';
  if (p >= 0.999) return 'Every pack';
  if (p >= 0.5) return `${Math.round(p * 100)}% of packs`;
  const every = 1 / p;
  return every < 10 ? `1 pack in ${every.toFixed(1)}` : `1 pack in ${Math.round(every)}`;
}

/**
 * The tier ladder, commonest first. `promo` is deliberately absent: it is a
 * product route, not a step on a rarity ladder, and its pull sits between
 * `rare` and `doubleRare` where it would corrupt any ordering.
 */
const TIER_LADDER: Rarity[] = [
  'common', 'uncommon', 'rare', 'doubleRare', 'ultraRare',
  'illustrationRare', 'specialIllustrationRare', 'hyperRare',
];

/**
 * A sim tier for every rung, assigned by RANK rather than by absolute pull.
 *
 * The studio never picks a tier — it builds a pack, and the pack implies one.
 * A tier is still needed because `config.rarity.weight` is a demand-side signal
 * keyed by it (`engine.ts` `castDesire` and the reveal term), and it is the
 * ONLY thing `Card.rarity` is read for once `pullRate` is carried directly.
 *
 * **Matching on absolute pull is wrong, and it was measured wrong.** The config
 * table is written for a pack of about 17.5 cards; a studio that builds a
 * 9-card pack halves every rate, so a nearest-value match shifted the whole
 * ladder up and called an 80-card common rung `rare` — which would have
 * inflated demand for the commonest cards in the set.
 *
 * Rank has neither problem. The rarest rung gets the rarest weight whatever
 * size the pack is, which is what the studio actually meant. With more rungs
 * than tiers the top ones share `hyperRare`; a ladder that deep has no finer
 * distinction for the weight table to express anyway.
 */
export function tiersForLadder(rows: RarityRow[], pulls: Record<string, number>): Record<string, Rarity> {
  // Commonest first. A rung no slot draws sorts to the rare end, where a rung
  // nobody can pull belongs.
  const ordered = [...rows].sort((a, b) => (pulls[b.id] ?? 0) - (pulls[a.id] ?? 0));
  const out: Record<string, Rarity> = {};
  ordered.forEach((r, i) => {
    out[r.id] = TIER_LADDER[Math.min(i, TIER_LADDER.length - 1)]!;
  });
  return out;
}

/**
 * Copies through the same arithmetic `rarityPull` uses in the engine, reading
 * the same config: copies of ONE card per pack, scaled so a pack holds the same
 * cardboard whatever the set size.
 */
export function perCardPull(s: SimState, r: Rarity, size: number): number {
  const cfg = s.config.rarity;
  return (cfg.pull[r] / cfg.pullDivisor) * (cfg.referenceSetSize / Math.max(1, size));
}
