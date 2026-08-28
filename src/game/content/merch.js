// Merchandise catalogue — mirrors products.js's SKU_TYPES shape, but every
// line is produced-to-order (no print run / supply cap) and its demand keys
// off franchise reputation + cast fame instead of any set's hype. See
// merch.js. This is what makes it "decoupled from metagame health": a
// booster line runs out; a plush line doesn't.

export const MERCH_TYPES = {
  plush: {
    kind: 'plush', name: 'Plush toys', launchCost: 40_000, refreshCost: 12_000,
    defaultPrice: 18, priceRange: [10, 35], elasticityRef: 20,
    appeal: { casual: 0.55, collectors: 0.12 }, demandMul: 0.028,
    blurb: 'Cuddly, impulse-friendly, casual-first. The gateway merch item.',
  },
  apparel: {
    kind: 'apparel', name: 'Apparel', launchCost: 55_000, refreshCost: 16_000,
    defaultPrice: 32, priceRange: [18, 60], elasticityRef: 34,
    appeal: { casual: 0.48, collectors: 0.08 }, demandMul: 0.018,
    blurb: 'T-shirts, hoodies, hats. Broad casual reach, thin collector pull.',
  },
  accessories: {
    kind: 'accessories', name: 'Accessories', launchCost: 25_000, refreshCost: 8_000,
    defaultPrice: 14, priceRange: [6, 30], elasticityRef: 16,
    appeal: { casual: 0.38, collectors: 0.22 }, demandMul: 0.022,
    blurb: 'Pins, keychains, playmats, sleeves. Cheap, broad, decent collector crossover.',
  },
  artBooks: {
    kind: 'artBooks', name: 'Art books', launchCost: 70_000, refreshCost: 20_000,
    defaultPrice: 45, priceRange: [25, 90], elasticityRef: 55,
    appeal: { casual: 0.08, collectors: 0.42 }, demandMul: 0.006,
    blurb: 'Low-volume, high-margin, collector-and-prestige leaning. The art-book/artifact play.',
  },
}

export function getMerchType(kind) {
  return MERCH_TYPES[kind] ?? null
}
