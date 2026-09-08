/**
 * The bridge between the headless sim and the UI.
 *
 * Two rules from `docs/screens-audit.md` are enforced here rather than trusted
 * to every screen:
 *
 *   1. The UI drives the sim through `api.*` only, never by mutating state, so
 *      a run stays reconstructable from its seed plus its decision log.
 *   2. Reading the world must not change it. Nothing in this file draws RNG.
 *
 * Decisions land in `s.inbox` and are applied at the START of the next tick, so
 * `commit` submits and then advances one week. Founding a character costing a
 * week is honest; the sim measures fifty years of them.
 */
import type { SimState, IpId } from '../sim/types.ts';
import { createWorld } from '../sim/world.ts';
import { defaultConfig, withOverrides } from '../sim/config.ts';
import { tick } from '../sim/engine.ts';
import { serialize, deserialize } from '../sim/save.ts';

const SAVE_KEY = 'tcg.save.v1';
const META_KEY = 'tcg.meta.v1';

/**
 * What the player authored that the sim has no field for yet.
 *
 * `characters.md` specifies archetype, base age and affiliation; none of them
 * exist in `IpEntity` at HEAD. They are kept here so the screens can be real
 * without pretending the sim reads them. **Nothing in this record reaches the
 * simulation.** When the sim gains the fields, this map is the migration.
 */
export interface Meta {
  studioName: string;
  gameName: string;
  characters: Record<string, { archetype: string; baseAge: number; affiliation?: string }>;
  /**
   * Eras, and which set belongs to which.
   *
   * `docs/design/eras.md` specifies an era as a named arc spanning several
   * sets. Nothing in the model spans sets — `nostalgia` and `resurgence` attach
   * to printings and characters — so an era is recorded here until the sim
   * gains one. Only a MAIN set may open an era; any set type may join one.
   */
  eras: Array<{ id: string; name: string; openedBy: string }>;
  setEra: Record<string, string>;
  /**
   * Saved rarity tables and pack configurations, reusable across sets.
   *
   * A real studio settles its rarity ladder once and reprints it for years,
   * so this is authored on its own screen and imported when a set is designed.
   * The `rarity` field is the sim's enum and decides the pull odds; `name` is
   * what the studio calls it, which the sim has no opinion about.
   */
  formats: Array<{
    id: string;
    name: string;
    packsPerUnit: number;
    msrp: number;
    rows: Array<{ rarity: string; name: string; count: number; advertised: boolean; finishes: string[] }>;
  }>;
}

let state: SimState | null = null;
let meta: Meta = { studioName: '', gameName: '', characters: {}, eras: [], setEra: {}, formats: [] };
const listeners = new Set<() => void>();

function notify(): void { for (const fn of listeners) fn(); }

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getState(): SimState | null { return state; }
export function getMeta(): Meta { return meta; }
export function hasGame(): boolean { return state !== null; }

/**
 * How much event history a SAVE keeps, in weeks.
 *
 * The game trims; the harness must not. `docs/design/running-forever.md`
 * measured the cost of not trimming: 142,596 events at year 50 are 36% of a
 * 63.7 MB save, and by year 150 the log alone is roughly 300 MB — and the rate
 * is still accelerating, because the event rate rises with the number of
 * printings. `localStorage` gives us a few megabytes, so untrimmed the game
 * stops being able to save itself somewhere around year 20.
 *
 * `serialize` keeps every interrupting event whatever this says, so the trim
 * loses the scrolling feed's deep history and never loses a stop. Ten years is
 * far more than any screen reads.
 *
 * The harness reads drop and creator coverage off the FULL log, which is why
 * this lives here rather than becoming a default in `save.ts`.
 */
const KEEP_EVENT_WEEKS = 52 * 10;

function persist(): void {
  if (!state) return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(state, {
      trimEventsBefore: Math.max(0, state.tick - KEEP_EVENT_WEEKS) as SimState['tick'],
    }));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // A full or blocked store must never take the run down. The in-memory
    // state is still authoritative for this session.
  }
}

export function loadSaved(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    state = deserialize(raw);
    const m = localStorage.getItem(META_KEY);
    if (m) {
      const parsed = JSON.parse(m) as Partial<Meta>;
      meta = {
        studioName: parsed.studioName ?? '',
        gameName: parsed.gameName ?? '',
        characters: parsed.characters ?? {},
        eras: parsed.eras ?? [],
        setEra: parsed.setEra ?? {},
        formats: parsed.formats ?? [],
      };
    }
    notify();
    return true;
  } catch {
    return false;
  }
}

/**
 * The game's opening is harder than the balance harness's default, on purpose.
 *
 * `finance.startingCash` is $500,000 in `config.ts` and the whole gate suite is
 * calibrated to it, so this overrides it for PLAY rather than editing the
 * constant. Measured with a bot that insists on a proper first print run, 24
 * seeds x 20 years: at $500k every studio lives and the median never borrows a
 * cent, so the borrowing ceiling — the only death route — never engages. At
 * $100k, 18 of 24 live and the median peak debt is $328,842.
 *
 * A first run of 8,000 boxes costs $147,840, so you cannot open without a loan.
 */
const PLAY_OVERRIDES = { 'finance.startingCash': 100_000_00 };

export function newGame(studioName: string, gameName: string): void {
  const seed = `${studioName}-${Date.now()}`;
  const s = createWorld(seed, withOverrides(defaultConfig, PLAY_OVERRIDES));
  // The publisher's name is the one piece of onboarding the model already has
  // a field for. Set before any tick, so it round-trips through `serialize`.
  const pub = s.publishers[s.playerId];
  if (pub) pub.name = studioName || pub.name;
  state = s;
  meta = { studioName, gameName, characters: {}, eras: [], setEra: {}, formats: [] };
  persist();
  notify();
}

export function abandonGame(): void {
  state = null;
  meta = { studioName: '', gameName: '', characters: {}, eras: [], setEra: {}, formats: [] };
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(META_KEY); } catch { /* ignore */ }
  notify();
}

/** Submits decisions, then advances one week so they are applied. */
export function commit(fn: (s: SimState) => void): void {
  if (!state) return;
  fn(state);
  tick(state);
  persist();
  notify();
}

export function setCharacterMeta(id: IpId, m: Meta['characters'][string]): void {
  meta.characters[id as string] = m;
  persist();
  notify();
}

export function saveFormat(f: Meta['formats'][number]): void {
  const i = meta.formats.findIndex(x => x.id === f.id);
  if (i >= 0) meta.formats[i] = f; else meta.formats.push(f);
  persist();
  notify();
}

export function deleteFormat(id: string): void {
  meta.formats = meta.formats.filter(f => f.id !== id);
  persist();
  notify();
}

export function forgetCharacter(id: string): void {
  delete meta.characters[id];
  persist();
  notify();
}

/** Records a set's era, opening a new one when `newEraName` is given. */
export function setSetEra(setId: string, eraId: string | null, newEraName?: string): void {
  if (newEraName) {
    const id = `era_${meta.eras.length + 1}_${Date.now().toString(36)}`;
    meta.eras.push({ id, name: newEraName, openedBy: setId });
    meta.setEra[setId] = id;
  } else if (eraId) {
    meta.setEra[setId] = eraId;
  }
  persist();
  notify();
}

export interface AdvanceResult {
  weeks: number;
  /** Interrupting events raised during the advance, newest last. */
  stops: Array<{ kind: string; t: number; data: Record<string, unknown> }>;
  died: boolean;
}

/**
 * Runs the clock until something interrupts, or `maxWeeks` passes.
 *
 * `SimEvent.interrupts` is the sim's own judgement about what deserves the
 * player's attention, and it is doing real work: measured over 30 years it
 * flags 0.8% of events, about sixteen stops a year.
 */
export function advance(maxWeeks = 260): AdvanceResult {
  const s = state;
  if (!s) return { weeks: 0, stops: [], died: false };
  const from = s.events.length;
  let weeks = 0;
  let died = false;
  while (weeks < maxWeeks) {
    tick(s);
    weeks++;
    if (s.publishers[s.playerId]?.deadTick !== null) { died = true; break; }
    if (s.events.slice(from).some(e => e.interrupts)) break;
  }
  const stops = s.events.slice(from)
    .filter(e => e.interrupts)
    .map(e => ({ kind: e.kind as string, t: e.t as number, data: e.data as Record<string, unknown> }));
  persist();
  notify();
  return { weeks, stops, died };
}
