/**
 * Four scripted strategies to probe for degenerate optima (CONCEPT.md §10).
 *
 * Every `api.*` call here submits a `Decision` onto the queue and hands back
 * the id it minted, so a run is fully reconstructable from its seed plus its
 * decision log — the same path a UI would drive.
 */
import type {
  SimState, IpId, ArtistId, Rarity, PrintQualityTier, ProductKind, SetType, ProductId, IpKind,
} from '../src/sim/types.ts';
import { api } from '../src/sim/engine.ts';
import { rand, pick, chance } from '../src/sim/rng.ts';
import { REGION_US, IP_KINDS } from '../src/sim/world.ts';

export interface Bot {
  step(s: SimState): void;
}

const RARITY_DISTRIBUTION: Array<{ rarity: Rarity; weight: number }> = [
  { rarity: 'common', weight: 45 },
  { rarity: 'uncommon', weight: 25 },
  { rarity: 'rare', weight: 14 },
  { rarity: 'doubleRare', weight: 7 },
  { rarity: 'ultraRare', weight: 4 },
  { rarity: 'illustrationRare', weight: 2.5 },
  { rarity: 'specialIllustrationRare', weight: 1.5 },
  { rarity: 'hyperRare', weight: 0.7 },
  { rarity: 'promo', weight: 0.3 },
];

function pickRarity(s: SimState): Rarity {
  const total = RARITY_DISTRIBUTION.reduce((n, r) => n + r.weight, 0);
  let x = rand(s.rng) * total;
  for (const r of RARITY_DISTRIBUTION) {
    x -= r.weight;
    if (x <= 0) return r.rarity;
  }
  return 'common';
}

/** Reuses an existing IP most of the time; only occasionally invents a new one. */
function ensureIp(s: SimState, label: string): IpId {
  const existing = Object.keys(s.ips) as IpId[];
  if (existing.length > 0 && chance(s.rng, 0.7)) return pick(s.rng, existing);
  const kind = pick(s.rng, IP_KINDS) as IpKind;
  return api.createIp(s, `${label} ${existing.length + 1}`, kind);
}

interface SetBotOptions {
  label: string;
  cadenceWeeks: number;
  cardsPerSet: number;
  setType: SetType;
  quality: PrintQualityTier;
  units: number;
  packsPerUnit: number;
  msrp: number;
  productKind: ProductKind;
}

function makeSetBot(opts: SetBotOptions): Bot {
  let nextRelease = 8; // small startup delay so world init settles first
  return {
    step(s: SimState) {
      if (s.tick < nextRelease) return;
      const pub = s.publishers[s.playerId]!;
      if (pub.deadTick !== null) return;
      nextRelease = s.tick + opts.cadenceWeeks;

      const ipId = ensureIp(s, opts.label);
      const setId = api.createSet(s, `${opts.label} Set W${s.tick}`, opts.setType, opts.cardsPerSet);

      const artistIds = Object.keys(s.artists) as ArtistId[];
      for (let i = 0; i < opts.cardsPerSet; i++) {
        const rarity = pickRarity(s);
        const artistId = artistIds.length ? pick(s.rng, artistIds) : undefined;
        if (!artistId) break;
        api.designCard(s, setId, ipId, [], rarity, artistId);
      }

      const productId = api.defineProduct(s, setId, opts.productKind, REGION_US, opts.packsPerUnit, opts.msrp);
      api.commitPrintRun(
        s,
        setId,
        { [productId]: opts.units } as Record<ProductId, number>,
        opts.quality,
      );
    },
  };
}

export const BOTS: Record<string, () => Bot> = {
  // Few, well-supported sets. The steady baseline.
  conservative: () => makeSetBot({
    label: 'Conservative', cadenceWeeks: 52, cardsPerSet: 70, setType: 'main',
    quality: 'standard', units: 8000, packsPerUnit: 24, msrp: 14000, productKind: 'boosterBox',
  }),

  // Fewer, smaller cards-per-set skewed toward chase rarities, premium quality.
  chaseMaxxer: () => makeSetBot({
    label: 'ChaseMaxxer', cadenceWeeks: 34, cardsPerSet: 45, setType: 'main',
    quality: 'premium', units: 5000, packsPerUnit: 24, msrp: 15500, productKind: 'boosterBox',
  }),

  // Releases constantly, cheap quality, large runs. Per CONCEPT.md §6.2 this
  // must lose — HANDOFF.md flags that it currently wins instead (bug, not spec).
  flooder: () => makeSetBot({
    label: 'Flooder', cadenceWeeks: 6, cardsPerSet: 40, setType: 'main',
    quality: 'budget', units: 15000, packsPerUnit: 24, msrp: 11000, productKind: 'boosterBox',
  }),

  // Small, expensive, high-margin specialty sets only.
  specialtyOnly: () => makeSetBot({
    label: 'Specialty', cadenceWeeks: 20, cardsPerSet: 20, setType: 'specialty',
    quality: 'premium', units: 1200, packsPerUnit: 10, msrp: 6000, productKind: 'premiumCollection',
  }),
};
