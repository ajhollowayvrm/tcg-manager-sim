/**
 * Saving and loading a run.
 *
 * `SimState` was built to survive this: every field on it is a plain object,
 * array, number or string, and the one derived lookup that could have been a
 * `Map` — `printingByCard` — is kept in state with a comment saying exactly why
 * (`types.ts`). So a save is `JSON.stringify` and a load is `JSON.parse`, with
 * no custom encoder and no revival pass.
 *
 * **The three caches are held OUTSIDE state on purpose, and must stay there.**
 * `contentsCache`, `tickCache` and `rosterVersion` in `engine.ts` are `WeakMap`s
 * keyed on the state object's identity, so a revived state simply gets fresh
 * ones on its first tick. Moving any of them onto `SimState` would put a
 * memoised value into the save file, where it would be restored as fact and
 * silently disagree with the state it was derived from.
 *
 * **What a save does NOT hold: the player's plan.** Measured, not assumed —
 * `static.saveRoundTrip` found it. A save restores the world exactly; it does
 * not restore anything the *caller* was holding. In the harness that caller is
 * `makeSetBot`, whose `nextRelease`, `campaigned`, `marketingSpent` and
 * `openChains` live in a closure, so handing a revived state a fresh bot makes
 * it commit a set the uninterrupted run did not — `nextRelease` resets to 8 and
 * fires immediately. That is correct behaviour for a world save and it is why
 * the gate continues the same bot across the save, the way a human resuming a
 * game is the same person. A UI that keeps scheduling state of its own must
 * save that itself, or put it in `SimState` where it will be saved for it.
 *
 * What a save is NOT: a replay. `seed` plus the decision log reconstructs a run
 * from the beginning; this is the state at a moment. Both are kept — `seed` is
 * on the state and `decisions` is the log — so a save can be replayed or
 * resumed.
 */
import { defaultConfig } from './config.ts';
import type { SimConfig, SimState, Tick } from './types.ts';

/**
 * Bumped only when an old save can no longer be loaded by the current engine.
 * This is what `SimState.schemaVersion` is for; it was written once at world
 * creation and read by nothing until this file existed.
 */
// 2: `Card.treatment: Treatment` became `Card.treatments: Treatment[]`,
//    because finishes stack. Older saves cannot be read.
export const SAVE_SCHEMA_VERSION = 2;

export interface SaveFile {
  schemaVersion: number;
  /**
   * The tick the save was taken at. Duplicated from the state for cheap listing.
   *
   * There is deliberately NO wall-clock timestamp here. The sim core is pure —
   * no `Date`, no I/O — and a `new Date()` in this file would both break that
   * rule and make `serialize` non-deterministic, so two saves of the same state
   * would stop being byte-comparable. A UI that wants "saved 3 minutes ago"
   * records that in its own save-slot list, where wall-clock time belongs.
   */
  savedAtTick: Tick;
  state: SimState;
  /**
   * The `--set` overrides this run was started with, if any.
   *
   * The full config is inside `state`, so a save is reproducible on its own.
   * The override map is kept beside it because the two answer different
   * questions: the config says what this run used, the overrides say what was
   * deliberately changed from the defaults. A later build with different
   * defaults can apply the second to its own baseline; it cannot recover that
   * intent from the first.
   */
  overrides?: Record<string, number>;
}

export interface SaveOptions {
  /** The `--set` overrides this run was started with. */
  overrides?: Record<string, number>;
  /**
   * Drop non-interrupting events older than this tick.
   *
   * Off by default, because a save is faithful by default. Measured on
   * `conservative`: a 50-year run saves at **63.7 MB**, of which the event log
   * is 36% (142,596 events). Trimming is therefore worth having and is nowhere
   * near sufficient on its own — the rest is the catalogue and its price
   * history, which is inherent to a 50-year run of 8,000-odd printings.
   *
   * It is an explicit option rather than the default because it is LOSSY in a
   * way that matters to this repo: `harness/metrics.ts` reads drops, creator
   * coverage and scalper crashes off the event log rather than off live state,
   * so a trimmed save reloads into a run whose metrics disagree with an
   * untrimmed one. Interrupting events are always kept — they are the ones the
   * feed surfaced to the player.
   */
  trimEventsBefore?: Tick;
}

/** Thrown rather than silently written, because JSON turns NaN into null. */
export class SaveError extends Error {}

/**
 * A path-aware non-finite check, run inside the single `JSON.stringify` walk
 * rather than as a second pass over the whole state.
 *
 * `JSON.stringify` writes `NaN` and `Infinity` as `null`, so without this a
 * save would succeed, a load would produce a `null` where a number belongs, and
 * the failure would surface hundreds of ticks later somewhere else entirely.
 * The price engine has several ratios that can produce one, so this is a real
 * risk rather than a theoretical one.
 *
 * `-0` is normalised to `0`, which is what `JSON.parse` would produce anyway.
 * It is numerically equal everywhere the model uses it.
 */
function guardNumbers(): (this: unknown, key: string, value: unknown) => unknown {
  const path: string[] = [];
  return function replacer(this: unknown, key: string, value: unknown): unknown {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new SaveError(`non-finite number at ${[...path, key].join('.')}: ${value}`);
      }
      return Object.is(value, -0) ? 0 : value;
    }
    if (key) path.push(key);
    return value;
  };
}

export function serialize(s: SimState, opts: SaveOptions = {}): string {
  const { overrides, trimEventsBefore } = opts;
  // Trimming builds a shallow copy rather than mutating: a save must never
  // change the run it was taken from.
  const state = trimEventsBefore === undefined ? s : {
    ...s,
    events: s.events.filter(e => e.interrupts || e.t >= trimEventsBefore),
  };
  const file: SaveFile = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAtTick: s.tick,
    state,
    ...(overrides && Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
  return JSON.stringify(file, guardNumbers());
}

export function deserialize(json: string): SimState {
  const file = JSON.parse(json) as Partial<SaveFile>;
  if (!file || typeof file !== 'object') throw new SaveError('save file is not an object');
  if (file.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new SaveError(
      `save schema ${String(file.schemaVersion)} is not ${SAVE_SCHEMA_VERSION}`);
  }
  const state = file.state;
  if (!state || typeof state !== 'object') throw new SaveError('save file has no state');
  // The two fields the engine cannot rebuild and cannot run without. Everything
  // else is either derived on the next tick or is plain data.
  if (typeof state.tick !== 'number') throw new SaveError('save state has no tick');
  if (!state.rng || !Array.isArray(state.rng.s)) throw new SaveError('save state has no rng');
  // A save carries its whole config, so a save written before a knob existed
  // comes back missing it — and a missing knob is `undefined`, which turns the
  // first arithmetic that touches it into NaN and then spreads. This was found
  // in the app: two knobs added to `readings` in one session turned a live
  // save's price forecast into "NaN to NaN".
  //
  // Backfilling only ADDS keys the save does not have. Every value the save
  // does carry wins, so a run stays reproducible and a deliberate override
  // survives a reload.
  backfill(state.config as unknown as Record<string, unknown>,
    defaultConfig as unknown as Record<string, unknown>);
  return state;
}

/** Recursively adds missing keys from `defaults`. Never overwrites. */
function backfill(target: Record<string, unknown>, defaults: Record<string, unknown>): void {
  if (!target || typeof target !== 'object') return;
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in target)) {
      target[k] = structuredClone(v);
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      backfill(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    }
  }
}

/** The overrides a save was taken with, if it recorded any. */
export function savedOverrides(json: string): Record<string, number> {
  const file = JSON.parse(json) as Partial<SaveFile>;
  return file.overrides ?? {};
}

/** The config a save was taken with. Read from the state, not from a copy. */
export function savedConfig(state: SimState): SimConfig {
  return state.config;
}
