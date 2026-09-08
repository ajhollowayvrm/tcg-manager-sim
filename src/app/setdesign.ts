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
export interface RarityRow { rarity: Rarity; label: string; count: number; advertised: boolean; finishes: Finish[] }

export const DEFAULT_ROWS: RarityRow[] = [
  { rarity: 'uncommon', label: 'Uncommon', count: 45, advertised: true, finishes: [] },
  { rarity: 'rare', label: 'Rare', count: 25, advertised: true, finishes: ['holo'] },
  { rarity: 'doubleRare', label: 'Double rare', count: 13, advertised: true, finishes: ['holo'] },
  { rarity: 'ultraRare', label: 'Ultra rare', count: 7, advertised: true, finishes: ['fullArt', 'holo'] },
  { rarity: 'illustrationRare', label: 'Illustration rare', count: 5, advertised: true, finishes: ['extendedArt', 'textured'] },
  { rarity: 'specialIllustrationRare', label: 'Special illustration', count: 3, advertised: true, finishes: ['fullArt', 'etched', 'textured'] },
  { rarity: 'hyperRare', label: 'Hyper rare', count: 2, advertised: false, finishes: ['borderless', 'rainbowFoil', 'embossed'] },
];

/**
 * Copies through the same arithmetic `rarityPull` uses in the engine, reading
 * the same config: copies of ONE card per pack, scaled so a pack holds the same
 * cardboard whatever the set size.
 */
export function perCardPull(s: SimState, r: Rarity, size: number): number {
  const cfg = s.config.rarity;
  return (cfg.pull[r] / cfg.pullDivisor) * (cfg.referenceSetSize / Math.max(1, size));
}
