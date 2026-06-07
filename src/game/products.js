// Product SKUs — the ways a set is sold. Boosters are the base product (always
// present), but a set can ALSO ship as bundles, collector boxes (SPCs), and
// tins. Each SKU is its own sealed product with its own price, print run, supply
// cap, and — crucially — a different BUYER appeal: bundles court casual value
// hunters, collector boxes court collectors, tins are impulse buys. More SKUs =
// more revenue channels, but each costs its own print run up front.
//
// A product on a released set: { kind, name, price, printRun, supply, sold,
// appeal:{casual,competitive,collectors}, demandMul, exclusivePromo? }.
// `appeal` weights how much each player segment buys this SKU; `demandMul` is a
// flat volume multiplier vs. boosters (a $90 box moves far fewer units than a
// $4.50 pack, before price elasticity).

import { printRunUnits } from './revenue.js'

// The SKU catalogue. `booster` is the base; the other three are opt-in. Defaults
// here seed the builder; the player can tune price/printRun per set.
export const SKU_TYPES = {
  booster: {
    kind: 'booster', name: 'Booster packs', defaultPrice: 4.5, defaultPrintRun: 50,
    // Boosters are the reference product: broad appeal, neutral multiplier. These
    // values reproduce the original single-product economy exactly.
    appeal: { casual: 0.26, competitive: 0.1, collectors: 0.16 }, demandMul: 1,
    blurb: 'The base product. Broad appeal, the secondary market flows from here.',
    priceRange: [2, 12], elasticityRef: 4.5,
  },
  bundle: {
    kind: 'bundle', name: 'Bundle box', defaultPrice: 25, defaultPrintRun: 40,
    // Casual value play: a box of packs + extras. Casual-heavy, decent volume.
    appeal: { casual: 0.34, competitive: 0.08, collectors: 0.12 }, demandMul: 0.22,
    blurb: 'A value box of packs + extras. Courts casual fans; lower margin, good volume.',
    priceRange: [12, 60], elasticityRef: 28,
  },
  spc: {
    kind: 'spc', name: 'Collector box (SPC)', defaultPrice: 90, defaultPrintRun: 25,
    // Premium collector product: low volume, high margin, collector-leaning. Can
    // carry an exclusive promo (set in the builder) that only ships in this SKU.
    appeal: { casual: 0.05, competitive: 0.08, collectors: 0.42 }, demandMul: 0.06,
    blurb: 'A premium collector box — low volume, high margin. Can include an exclusive promo.',
    priceRange: [40, 200], elasticityRef: 95,
  },
  tin: {
    kind: 'tin', name: 'Tins', defaultPrice: 18, defaultPrintRun: 45,
    // Impulse retail: small, broad, mid-margin. A blend of casual + competitive.
    appeal: { casual: 0.2, competitive: 0.12, collectors: 0.1 }, demandMul: 0.16,
    blurb: 'Impulse retail tins — small, broad reach, mid margin.',
    priceRange: [10, 40], elasticityRef: 18,
  },
}

// The default EXTRA product lineup for a new draft: empty. Boosters are implicit
// — the set's existing printRun/pricePoint sliders are the booster product, and
// release synthesizes the booster line from them (see boosterProduct). `products`
// holds only the opt-in extra SKUs (bundle/spc/tin), so a fresh set is
// boosters-only and the baseline economy is unchanged.
export function defaultProducts() {
  return []
}

// Synthesize the booster product from a draft's top-level booster knobs
// (printRun/pricePoint), so the booster line stays the single source of truth for
// pack scarcity and price.
export function boosterProduct(draft) {
  return finalizeProduct({
    kind: 'booster',
    name: SKU_TYPES.booster.name,
    price: draft.pricePoint,
    printRun: draft.printRun,
  })
}

// The full finalized product list for a released set: the booster line first,
// then the player's extra SKUs.
export function finalizeProducts(draft) {
  return [boosterProduct(draft), ...(draft.products ?? []).map(finalizeProduct)]
}

// Build a product entry of `kind` with default knobs (price + print run).
export function makeProduct(kind) {
  const t = SKU_TYPES[kind]
  if (!t) return null
  return { kind, name: t.name, price: t.defaultPrice, printRun: t.defaultPrintRun, exclusivePromo: false }
}

// The print/manufacturing cost of one product line, scaled by its print run and
// a per-SKU base (a collector box costs more per unit to make than a pack). The
// booster line matches the original print-cost curve so a boosters-only set
// costs exactly what it always did.
const SKU_PRINT_BASE = { booster: 20_000, bundle: 30_000, spc: 45_000, tin: 22_000 }
const SKU_PRINT_SCALE = { booster: 180_000, bundle: 120_000, spc: 90_000, tin: 110_000 }

export function productPrintCost(product) {
  const base = SKU_PRINT_BASE[product.kind] ?? 20_000
  const scale = SKU_PRINT_SCALE[product.kind] ?? 180_000
  return Math.round(base + (product.printRun / 100) * scale)
}

// Units printed for one product (its hard sales ceiling). Boosters reuse the
// canonical curve; other SKUs print fewer units (they're bigger, pricier boxes).
const SKU_UNIT_SCALE = { booster: 1, bundle: 0.35, spc: 0.12, tin: 0.3 }

export function productSupply(product) {
  const scale = SKU_UNIT_SCALE[product.kind] ?? 1
  return Math.round(printRunUnits(product.printRun) * scale)
}

// Finalize a draft product into a released-set product: stamp its supply/sold and
// copy the catalogue appeal/multiplier so revenue can read everything off the set
// (no catalogue lookups needed at resolve time).
export function finalizeProduct(product) {
  const t = SKU_TYPES[product.kind] ?? SKU_TYPES.booster
  return {
    kind: product.kind,
    name: product.name ?? t.name,
    price: product.price ?? t.defaultPrice,
    printRun: product.printRun ?? t.defaultPrintRun,
    appeal: t.appeal,
    demandMul: t.demandMul,
    elasticityRef: t.elasticityRef,
    exclusivePromo: !!product.exclusivePromo,
    supply: productSupply(product),
    sold: 0,
  }
}

// Validate a draft's EXTRA product lineup for the builder (boosters are implicit
// via the printRun/pricePoint sliders, validated elsewhere). One of each extra
// kind at most; price within the SKU's range.
export function validateProducts(products) {
  const errors = []
  const seen = new Set()
  for (const p of products ?? []) {
    const t = SKU_TYPES[p.kind]
    if (!t || p.kind === 'booster') { errors.push(`Invalid extra product: ${p.kind}.`); continue }
    if (seen.has(p.kind)) errors.push(`Only one ${t.name} per set.`)
    seen.add(p.kind)
    const [lo, hi] = t.priceRange
    if (p.price < lo || p.price > hi) errors.push(`${t.name} price must be $${lo}–$${hi}.`)
  }
  return errors
}
