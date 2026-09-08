/**
 * UI coverage: is every decision reachable, and is every knob accounted for?
 *
 * The brief this answers is "every single variable that goes into the game is
 * somehow touched by something in the UI, so that every decision matters". That
 * cannot mean a slider per config knob — `config.ts` holds hundreds of them and
 * eleven tuning rounds fitted them — so it means three things, and this file
 * checks all three:
 *
 * 1. **Every `api.*` decision has a control.** Verified, not asserted: it greps
 *    `src/app` for a call to each one. A manifest could lie; a grep cannot.
 * 2. **Every `Decision` kind has an `api` wrapper**, or it is unreachable except
 *    through raw `submit`. `borrow` and `repay` sat in that gap for months.
 * 3. **Every config leaf is classified exactly once** — TRAVERSED, naming the
 *    decision that moves the game through it, or CONSTANT, naming why the player
 *    must not touch it. A leaf that is neither is a finding: it gets a consumer
 *    or it gets cut, which is how C12 removed ten dead fields.
 *
 * `docs/ui-coverage.md` is generated from this, and `static.uiCoverage` fails
 * when a new knob, decision or api call appears with no entry — the same shape
 * as `static.bandsInSync`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '../src/sim/config.ts';
import { api } from '../src/sim/engine.ts';

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

export type Classification =
  /** A player DECISION selects among these values. */
  | { how: 'decision'; by: string }
  /** The player SEES it and it informs a decision, but never selects it. */
  | { how: 'readout'; by: string }
  /** Fitted model. The designer owns it; the player never sees it. */
  | { how: 'constant'; why: string };

/**
 * Config blocks and leaves, classified. Longest matching prefix wins, so a
 * block is classified in one line and a leaf overrides it.
 *
 * **`decision` is strict: a player decision parameter must SELECT among these
 * values.** Reading a number is not deciding it, which is what `readout` is
 * for. The first pass of this file called a block "traversed" if a decision
 * touched the block at all, and scored 436 leaves — including
 * `world.startingScalpers`, which no player has ever chosen. The split below is
 * the honest one.
 */
export const MANIFEST: Record<string, Classification> = {
  // --- decisions: the player picks among these ---------------------------
  'printing.unitCost': { how: 'decision', by: 'commitPrintRun(quality) — the tier menu' },
  'printing.errorRate': { how: 'decision', by: 'commitPrintRun(quality)' },
  'printing.qualityGradeShift': { how: 'decision', by: 'commitPrintRun(quality)' },
  'rarity.pull': { how: 'decision', by: 'designCard(rarity) + createSet(targetSize) — the rarity ladder' },
  'rarity.weight': { how: 'decision', by: 'designCard(rarity)' },
  'unlocks': { how: 'decision', by: 'purchaseUnlock — the growth shop' },
  'unlocks.enforcePrintQuality': { how: 'constant', why: 'Feature flag on the restriction, not the restriction.' },
  'unlocks.enforceSpecialtySlots': { how: 'constant', why: 'Feature flag on the restriction, not the restriction.' },
  'readings': { how: 'decision', by: 'purchaseUnlock — research, community, analytics' },
  'readings.rereadWeeks': { how: 'constant', why: 'A reading holds a quarter: shorter flickers, longer lets a player wait out the error.' },
  'readings.forecastDriftWindowWeeks': { how: 'constant', why: 'How a forecast measures its trend.' },
  'readings.forecastMaxDriftPerYear': { how: 'constant', why: 'Bound on extrapolation. Nothing in the value engine reads it.' },
  'readings.forecastHorizonWeeks': { how: 'constant', why: 'How fast a forecast widens with distance.' },
  'collabs.advanceMin': { how: 'decision', by: 'signCollab — money now against a share of the set' },
  'collabs.advanceMax': { how: 'decision', by: 'signCollab' },
  'collabs.royaltyShareMin': { how: 'decision', by: 'signCollab' },
  'collabs.royaltyShareMax': { how: 'decision', by: 'signCollab' },
  'collabs.minimumGuaranteeMultiple': { how: 'decision', by: 'signCollab — what a flop still owes' },
  'collabs.reachBonusMin': { how: 'decision', by: 'signCollab' },
  'collabs.reachBonusMax': { how: 'decision', by: 'signCollab' },
  'collabs.gateMin': { how: 'decision', by: 'signCollab — the standing an offer demands' },
  'collabs.gateMax': { how: 'decision', by: 'signCollab' },
  'collabs.segmentsReachedMin': { how: 'decision', by: 'signCollab — which offer reaches whom' },
  'collabs.segmentsReachedMax': { how: 'decision', by: 'signCollab' },
  'collabs.offerWindowWeeks': { how: 'decision', by: 'signCollab — how long you may think about it' },
  'collabs.exposureShare': { how: 'decision', by: 'signCollab — the rent a licensor charges your own IP' },
  'events': { how: 'decision', by: 'hostEvent(scale, budget)' },
  'chains': { how: 'decision', by: 'designCard(progressionLink, illustrationLink)' },
  'chains.subjectReference': { how: 'constant', why: 'Normaliser for the weak-subject hedge.' },
  'preorders': { how: 'decision', by: 'openPreorders(unitsCap)' },
  'preorders.goodwillPerUnfilled': { how: 'decision', by: 'openPreorders — the cost of a broken promise' },
  'channels.traits': { how: 'decision', by: 'allocate — the terms you pick a channel for' },
  'channels.seeds': { how: 'decision', by: 'allocate + purchaseUnlock(channels)' },
  'channels.unlockCost': { how: 'decision', by: 'purchaseUnlock(channels)' },
  'world.regions': { how: 'decision', by: 'unlockRegion — the region menu' },
  'world.productPreference': { how: 'decision', by: 'defineProduct(kind) — the nine template forms; a studio-invented one rolls its own' },
  // Classified explicitly. Longest-prefix matching would otherwise file these
  // under the block-level `world: constant` and the gate would pass on a false
  // clean — they are read by an authored decision, not by the bootstrap.
  'world.customLinePreferenceMin': { how: 'decision', by: 'defineProduct(kind) — the span a studio-invented form is rolled from' },
  'world.customLinePreferenceMax': { how: 'decision', by: 'defineProduct(kind) — the span a studio-invented form is rolled from' },
  'hype.defaultLeadWeeks': { how: 'decision', by: 'scheduleReveal(startTick)' },
  'hype.defaultCadenceWeeks': { how: 'decision', by: 'scheduleReveal(cadence)' },
  'hype.marketingReference': { how: 'decision', by: 'marketingSpend — where the log curve bends' },
  'hype.marketingHypeGain': { how: 'decision', by: 'marketingSpend' },
  'hype.prereleaseCostPerScale': { how: 'decision', by: 'hostPrerelease(scale, budget)' },
  'hype.prereleaseHypeGain': { how: 'decision', by: 'hostPrerelease' },
  'hype.prereleaseGoodwillGain': { how: 'decision', by: 'hostPrerelease' },
  'hype.prereleaseRelationshipGain': { how: 'decision', by: 'hostPrerelease' },
  'drops.cadenceWeeks': { how: 'decision', by: 'scheduleDrop(atTick)' },
  'drops.holdLimitWeeks': { how: 'decision', by: 'scheduleDrop — how long a scalper holds' },
  'art.openingRateMin': { how: 'decision', by: 'commissionArt — the rate you pay' },
  'art.openingRateMax': { how: 'decision', by: 'commissionArt' },
  'art.newcomerRateMin': { how: 'decision', by: 'commissionArt' },
  'art.newcomerRateMax': { how: 'decision', by: 'commissionArt' },
  'art.retainerWeeklyMultiple': { how: 'decision', by: 'hireArtist(retainer)' },
  'art.exclusiveWeeklyMultiple': { how: 'decision', by: 'hireArtist(exclusive)' },
  'art.retainerFeeDiscount': { how: 'decision', by: 'hireArtist(retainer)' },
  'art.exclusiveFeeDiscount': { how: 'decision', by: 'hireArtist(exclusive)' },
  'art.budgetQualityGain': { how: 'decision', by: 'commissionArt(brief.budget) — the return on paying over' },
  'art.minRelationshipToAccept': { how: 'decision', by: 'commissionArt — whether they take the call' },
  'art.brandStandingOffsetsRelationship': { how: 'decision', by: 'commissionArt' },
  'finance.startingCash': { how: 'decision', by: 'the opening position, overridden for play in store.ts' },
  'finance.interestBase': { how: 'decision', by: 'borrow — the rate' },
  'finance.creditToRate': { how: 'decision', by: 'borrow / repay — what credit buys off the rate' },
  'finance.borrowCeilingBase': { how: 'decision', by: 'borrow — the ceiling' },
  'finance.borrowCeilingMultiple': { how: 'decision', by: 'borrow' },
  'finance.weeklyOverheadPerChannel': { how: 'decision', by: 'purchaseUnlock(channels) — reach costs money to run' },
  'finance.weeklyOverheadPerRegion': { how: 'decision', by: 'unlockRegion — an office abroad is a standing cost' },
  'finance.storagePerUnitPerTick': { how: 'decision', by: 'commitPrintRun(quantities) — what unsold stock costs' },
  'finance.storageSurchargeAfterTicks': { how: 'decision', by: 'commitPrintRun — the overprint cliff' },
  'finance.storageSurchargeMultiple': { how: 'decision', by: 'commitPrintRun' },
  'region.entryLeadWeeks': { how: 'decision', by: 'unlockRegion — 26 weeks before it ships anything' },
  'region.mismatchPenalty': { how: 'decision', by: 'defineProduct(region) — the cost of being wrong' },
  'region.knowledgeGainPerResearch': { how: 'decision', by: 'purchaseUnlock(marketResearch)' },
  'region.researchCreditShare': { how: 'decision', by: 'purchaseUnlock(marketResearch)' },
  'treatments': { how: 'decision', by: 'designCard(treatments) — the finish picker' },
  'desire': { how: 'decision', by: 'designCard — how a card connects' },
  'archetypes': { how: 'decision', by: 'createIp(archetype) — the prior a character is rolled from' },

  // --- readouts: seen, never selected ------------------------------------
  'graders': { how: 'readout', by: 'the pop report. Grading is the market acting, not a decision the studio makes — the studio reaches it through print quality.' },
  'grading.tierMultiplier': { how: 'readout', by: 'the pop report — the payoff ladder' },
  'attention': { how: 'readout', by: 'the ruler print size and release cadence are measured against. Shown, never set.' },
  'finance.brandBase': { how: 'readout', by: 'brand standing, which gates channels, collabs and artists' },
  'finance.brandFromAffection': { how: 'readout', by: 'brand standing' },
  'finance.brandFromGoodwill': { how: 'readout', by: 'brand standing' },

  // --- the fitted model --------------------------------------------------
  'value': { how: 'constant', why: 'The price stack, tuned as ONE unit over 30 seeds x 25 years. Moving one knob and re-measuring one metric looks fine and is wrong.' },
  'affection': { how: 'constant', why: 'How an audience bonds. The player chooses WHO is on the card, never how bonding works.' },
  'sealed': { how: 'constant', why: 'The sealed price stack, coupled to singles but not derived from them.' },
  'actors': { how: 'constant', why: 'Populations, not choices.' },
  'creators': { how: 'constant', why: 'You cannot pay a creator or brief one. That IS the mechanism.' },
  'audience': { how: 'constant', why: 'Demography. Never swept.' },
  'market': { how: 'constant', why: 'The market climate walk.' },
  'history': { how: 'constant', why: 'Retention and compaction. A storage decision, not a game one.' },
  'grading': { how: 'constant', why: 'The latent condition scale and its cuts.' },
  'strides': { how: 'constant', why: 'How often each subsystem runs. Moving one renumbers every later RNG draw and invalidates every banked gate.' },
  'startYear': { how: 'constant', why: 'Where the calendar starts.' },
  'printing': { how: 'constant', why: 'Cost and misprint incidence outside the tier menu.' },
  'rarity': { how: 'constant', why: 'Divisors and the set-size reference that scale the pull table.' },
  'channels': { how: 'constant', why: 'Souring, capacity drift and the evaluation window — how a relationship decays, which the player causes but does not set.' },
  'world': { how: 'constant', why: 'World bootstrap: segment sizes and opening actor populations.' },
  'hype': { how: 'constant', why: 'How hype decays and how noisy the signal is.' },
  'drops': { how: 'constant', why: 'The scalper population loop.' },
  'art': { how: 'constant', why: 'Artist stats, growth (hidden on purpose), turnaround and the roster churn.' },
  'finance': { how: 'constant', why: 'Credit drift, the brand target and the overhead scaling.' },
  'region': { how: 'constant', why: 'Region fit weights and the reading noise model.' },
  'collabs': { how: 'constant', why: 'How often offers arrive and how their reach converts.' },
};

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

export function configLeaves(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [prefix];
  if (Array.isArray(node)) return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out.push(...configLeaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

/** Longest matching prefix in the manifest. */
export function classify(path: string): Classification | null {
  let best: string | null = null;
  for (const key of Object.keys(MANIFEST)) {
    if (path === key || path.startsWith(`${key}.`)) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  return best === null ? null : MANIFEST[best]!;
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Every `api.*` call the app actually makes. Grepped, not declared. */
export function apiCallsInApp(): Set<string> {
  const found = new Set<string>();
  for (const file of walkFiles('src/app')) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bapi\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      found.add(m[1]!);
    }
  }
  return found;
}

/** Every `Decision` kind, read off the union in types.ts. */
export function decisionKinds(): string[] {
  const src = readFileSync('src/sim/types.ts', 'utf8');
  const m = src.match(/export type Decision =[\s\S]*?\n\n/);
  if (!m) return [];
  return [...m[0].matchAll(/\{\s*type:\s*'([a-zA-Z]+)'/g)].map(x => x[1]!);
}

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

export interface Coverage {
  /** api methods with no call anywhere in `src/app`. */
  unreachableDecisions: string[];
  /** Decision kinds with no `api` wrapper. */
  wrapperlessKinds: string[];
  /** Config leaves the manifest does not classify. */
  unclassified: string[];
  decision: number;
  readout: number;
  constant: number;
  apiCount: number;
}

export function coverage(): Coverage {
  const called = apiCallsInApp();
  const apiNames = Object.keys(api);
  const kinds = decisionKinds();

  const leaves = configLeaves(defaultConfig);
  const unclassified: string[] = [];
  let decision = 0, readout = 0, constant = 0;
  for (const leaf of leaves) {
    const c = classify(leaf);
    if (!c) unclassified.push(leaf);
    else if (c.how === 'decision') decision++;
    else if (c.how === 'readout') readout++;
    else constant++;
  }

  return {
    unreachableDecisions: apiNames.filter(n => !called.has(n)),
    // `advance` is the clock, not a decision a screen submits.
    wrapperlessKinds: kinds.filter(k => k !== 'advance' && !apiNames.includes(k)),
    unclassified,
    decision,
    readout,
    constant,
    apiCount: apiNames.length,
  };
}

export function report(c: Coverage): string {
  const L: string[] = [];
  L.push('# UI coverage');
  L.push('');
  L.push('Generated by `harness/coverage.ts`. Do not edit by hand.');
  L.push('');
  L.push('| Check | Result |');
  L.push('|---|---|');
  L.push(`| \`api.*\` decisions | ${c.apiCount} |`);
  L.push(`| ...with a control in \`src/app\` | ${c.apiCount - c.unreachableDecisions.length} |`);
  L.push(`| \`Decision\` kinds with no wrapper | ${c.wrapperlessKinds.length} |`);
  L.push(`| Config leaves a decision selects among | ${c.decision} |`);
  L.push(`| Config leaves shown as a readout | ${c.readout} |`);
  L.push(`| Config leaves that are balance constants | ${c.constant} |`);
  L.push(`| Config leaves unclassified | ${c.unclassified.length} |`);
  L.push('');
  if (c.unreachableDecisions.length > 0) {
    L.push('## Decisions with no control');
    L.push('');
    for (const d of c.unreachableDecisions) L.push(`- \`api.${d}\``);
    L.push('');
  }
  if (c.wrapperlessKinds.length > 0) {
    L.push('## Decision kinds with no api wrapper');
    L.push('');
    for (const d of c.wrapperlessKinds) L.push(`- \`${d}\``);
    L.push('');
  }
  if (c.unclassified.length > 0) {
    L.push('## Unclassified config leaves');
    L.push('');
    L.push('Each of these is a finding. It gets a consumer, or it gets a line in');
    L.push('`MANIFEST` saying why the player must not touch it, or it gets cut.');
    L.push('');
    for (const p of c.unclassified) L.push(`- \`${p}\``);
    L.push('');
  }
  L.push('## How each config block is reached');
  L.push('');
  L.push('| Block or leaf | How | By |');
  L.push('|---|---|---|');
  for (const [k, v] of Object.entries(MANIFEST)) {
    L.push(`| \`${k}\` | ${v.how} | ${v.how === 'constant' ? v.why : v.by} |`);
  }
  L.push('');
  return L.join('\n');
}
