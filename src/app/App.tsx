/**
 * The playable slice.
 *
 * What is REAL: the world, the clock, characters, sets, print runs, borrowing,
 * every price and every event. All of it runs the same `src/sim` the balance
 * harness runs, through `api.*` decisions.
 *
 * What is NOT in the sim yet, and is held app-side so the screens can be honest
 * about it: a character's archetype, base age and affiliation (see
 * `docs/design/characters.md`), and per-rarity finishes. Those are marked in the
 * UI where they appear.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import type { SimState, IpId, IpEntity, Rarity, SetType, ArtistId, Treatment } from '../sim/types.ts';
import { api } from '../sim/engine.ts';
import { readAffection, displayTier } from '../sim/readings.ts';
import { REGION_US } from '../sim/world.ts';
import {
  subscribe, getState, getMeta, newGame, loadSaved, commit, advance,
  setCharacterMeta, setSetEra, saveFormat, deleteFormat, forgetCharacter,
  abandonGame, type AdvanceResult,
} from './store.ts';
import {
  C, MONO, num, label, micro, Screen, Scroll, Header, Button, Field,
  Stepper, Row, Note, Empty,
} from './ui.tsx';

// --- helpers ---------------------------------------------------------------

const money = (cents: number): string =>
  Math.round(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });

const yearOf = (s: SimState, t: number): number => s.config.startYear + Math.floor(t / 52);

/**
 * A reading turned into the sharpest words the studio has paid for.
 *
 * `displayTier` is a rendering CONTRACT, not a hint: prose at tier 0, then an
 * adjective, then a band, and only at tier 3 a bare number — and even then the
 * noisy one. Rendering `ip.affection` here would delete the progression tree.
 */
function readingText(s: SimState, id: IpId): string {
  const r = readAffection(s, id);
  if (!r) return '—';
  const v = r.value;
  const prose =
    v < 8 ? 'Nobody knows them yet.'
    : v < 18 ? 'A few people have noticed.'
    : v < 32 ? 'Quietly liked.'
    : v < 50 ? "Everyone's second favourite."
    : v < 70 ? 'People turn up for them.'
    : 'The reason they buy the box.';
  switch (r.display) {
    case 'prose': return prose;
    case 'adjective': return v < 25 ? 'Cold.' : v < 55 ? 'Warm.' : 'Hot.';
    case 'band': return `Somewhere between ${r.low.toFixed(0)} and ${r.high.toFixed(0)}.`;
    default: return `About ${v.toFixed(0)}.`;
  }
}

const ARCHETYPES: Array<{ name: string; lore: string; sells: string }> = [
  { name: 'Mascot', lore: 'The face on the box. Safe, kind, unthreatening.', sells: 'A little to everyone, for decades.' },
  { name: 'Rival', lore: 'The one who beats your hero first.', sells: 'Spikes at launch, gone in three sets.' },
  { name: 'Mentor', lore: 'Older, patient, already respected.', sells: 'Steady with adults. Never carries a launch.' },
  { name: 'Trickster', lore: 'Nobody agrees what they are.', sells: 'A grail or unsellable. No middle.' },
  { name: 'Legend', lore: 'Half-remembered. Rarely shown at all.', sells: 'Collectors and investors, not children.' },
  { name: 'Upstart', lore: 'New, loud, everywhere for one year.', sells: 'Cheap reach with kids. Gone in a decade.' },
];

/** Rarity mixes the player can skew a set toward. Weights, not counts. */
const MIXES: Record<string, { blurb: string; w: Array<[Rarity, number]> }> = {
  Balanced: {
    blurb: 'A box worth opening. Nothing to talk about.',
    w: [['common', 45], ['uncommon', 25], ['rare', 14], ['doubleRare', 7], ['ultraRare', 4],
        ['illustrationRare', 2.5], ['specialIllustrationRare', 1.5], ['hyperRare', 1]],
  },
  Chase: {
    blurb: 'A grail to chase. A thinner box for everyone else.',
    w: [['common', 35], ['uncommon', 20], ['rare', 14], ['doubleRare', 11], ['ultraRare', 8],
        ['illustrationRare', 6], ['specialIllustrationRare', 4], ['hyperRare', 2]],
  },
  Value: {
    blurb: 'Everybody pulls something. Nobody pulls a grail.',
    w: [['common', 52], ['uncommon', 30], ['rare', 12], ['doubleRare', 4], ['ultraRare', 1.4],
        ['illustrationRare', 0.4], ['specialIllustrationRare', 0.15], ['hyperRare', 0.05]],
  },
};

function pickRarity(mix: string, i: number): Rarity {
  const table = MIXES[mix]?.w ?? MIXES.Balanced!.w;
  const total = table.reduce((n, [, w]) => n + w, 0);
  // Deterministic sweep rather than a draw: the UI must not touch any RNG
  // stream, or a repaint would renumber the run.
  let x = ((i * 37) % 1000) / 1000 * total;
  for (const [r, w] of table) { x -= w; if (x <= 0) return r; }
  return 'common';
}

function firstArtist(s: SimState): ArtistId | null {
  for (const a of Object.values(s.artists)) if (a.available) return a.id;
  const any = Object.values(s.artists)[0];
  return any ? any.id : null;
}

// --- onboarding ------------------------------------------------------------

function Onboarding() {
  const [studio, setStudio] = useState('');
  const [game, setGame] = useState('');
  return (
    <Screen>
      <Scroll>
        <div style={{ padding: '30px 26px 0 26px' }}>
          <div style={{ ...micro, color: C.go, letterSpacing: '0.16em' }}>FOUNDED 2026</div>
          <div style={{ fontSize: 38, lineHeight: 1.05, marginTop: 10, fontWeight: 700, textWrap: 'pretty' }}>
            Every studio<br />starts with<br />a name.
          </div>
        </div>
        <div style={{ height: 1, background: C.rule, margin: '24px 26px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '22px 26px 0' }}>
          <Field label="The studio" value={studio} onChange={setStudio} placeholder="Halcyon Press" />
          <Field label="The game it makes" value={game} onChange={setGame} placeholder="Emberline" />
        </div>

        <div style={{ margin: '22px 26px 0', border: `1px solid ${C.rule}`, background: C.panel }}>
          <div style={{ ...label, padding: '8px 13px', background: C.raised, borderBottom: `1px solid ${C.rule}` }}>OPENING POSITION</div>
          <Row left="Cash on hand" right="100,000" strong />
          <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
          <Row left="A first run of 8,000 boxes" right="147,840" />
          <div style={{ height: 1, background: C.ink, margin: '0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '8px 12px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bad }}>Short by</span>
            <span style={{ ...num, fontSize: 17, fontWeight: 600, color: C.bad }}>47,840</span>
          </div>
          <div style={{ padding: '10px 13px', background: C.raised, borderTop: `1px solid ${C.rule}`, fontSize: 12, lineHeight: 1.42, color: C.ink2 }}>
            You cannot print your first set without borrowing. <strong>One studio in four never gets out from under it.</strong>
          </div>
        </div>

        <div style={{ padding: '20px 26px 34px' }}>
          <Button onClick={() => newGame(studio.trim() || 'Halcyon Press', game.trim() || 'Emberline')}>
            Open the doors
          </Button>
          <div style={{ textAlign: 'center', fontSize: 11, color: C.dim, marginTop: 11 }}>
            You will design your first characters inside.
          </div>
        </div>
      </Scroll>
    </Screen>
  );
}

// --- studio: roster --------------------------------------------------------

function Roster({ s, onNew }: { s: SimState; onNew: () => void }) {
  const meta = getMeta();
  const ips = Object.values(s.ips).filter(ip => ip.publisherId === s.playerId);
  const tier = displayTier(Math.max(
    s.publishers[s.playerId]?.unlocks.marketResearch ?? 0,
    s.publishers[s.playerId]?.unlocks.communityTeam ?? 0));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 42px 40px 30px', gap: 8, padding: '9px 18px 6px', ...micro }}>
        <div>NAME · ARCHETYPE · READING</div>
        <div style={{ textAlign: 'right' }}>CARDS</div>
        <div style={{ textAlign: 'right' }}>SINCE</div>
        <div />
      </div>
      {ips.length === 0 && <Empty>No characters yet. A set needs somebody on the cards.</Empty>}
      {ips.map(ip => {
        const m = meta.characters[ip.id as string];
        return (
          <div key={ip.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 42px 40px 30px', gap: 8, alignItems: 'center',
            padding: '9px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16, letterSpacing: '0.01em' }}>{ip.name}</div>
              <div style={{ ...micro, letterSpacing: '0.07em' }}>
                {(m?.archetype ?? ip.kind).toUpperCase()}{m ? ` · ${m.baseAge + Math.floor((s.tick - ip.createdTick) / 52)}` : ''}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.25, fontStyle: 'italic', color: C.ink2 }}>{readingText(s, ip.id)}</div>
            </div>
            <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{ip.appearanceCount}</div>
            <div style={{ textAlign: 'right', ...num, fontSize: 11, color: C.dim }}>{yearOf(s, ip.createdTick)}</div>
            {ip.appearanceCount === 0
              ? <button aria-label={`Delete ${ip.name}`} onClick={() => {
                  commit(st => { api.deleteIp(st, ip.id); });
                  forgetCharacter(ip.id as string);
                }} style={{
                  width: 30, height: 30, background: 'none', border: `1px solid ${C.rule}`,
                  color: C.bad, borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 15, padding: 0, justifySelf: 'end',
                }}>×</button>
              : <span aria-label="Printed" title="On a printed card — cannot be removed" style={{
                  ...micro, color: C.dimmer, justifySelf: 'end',
                }}>—</span>}
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px' }}>
        <div style={{ fontSize: 11, lineHeight: 1.4, color: C.muted }}>
          {tier === 'prose' ? 'Readings are prose at research tier 0. Buy research for bands.' : `Reading sharpness: ${tier}.`}
          {' '}A character on a printed card cannot be removed.
        </div>
        <button onClick={onNew} style={{
          display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 12px',
          border: `1px solid ${C.ink}`, background: 'none', color: C.ink, borderRadius: 2,
          fontSize: 12.5, fontWeight: 600, flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New
        </button>
      </div>
    </>
  );
}

function NewCharacter({ s, onDone, onBack }: { s: SimState; onDone: () => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState(17);
  const [arch, setArch] = useState('Rival');
  const willReach = age < 13 ? 'kids' : age < 20 ? 'teens' : 'adults';
  const adultYear = yearOf(s, s.tick) + Math.max(0, 20 - age);
  return (
    <Screen>
      <Header title="New character" onBack={onBack} right={<span style={{ ...micro }}>CHARACTER</span>} />
      <Scroll>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '15px 18px 0' }}>
          <Field label="Name" value={name} onChange={setName} placeholder="Bram Kestrel" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={label}>AGE AT DEBUT</span>
            <Stepper value={age} onChange={setAge} min={1} max={90} />
          </div>
          <Note>
            Reaches <strong>{willReach}</strong> now
            {age < 20 && <> · <strong>adults</strong> from <span style={{ ...num }}>{adultYear}</span></>}
          </Note>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={label}>ARCHETYPE</span>
              <span style={{ ...micro, color: C.dimmer }}>WHO THEY ARE / WHAT THEY SELL</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ARCHETYPES.map(a => (
                <button key={a.name} onClick={() => setArch(a.name)} style={{
                  display: 'grid', gridTemplateColumns: '78px 1fr', gap: 10, alignItems: 'center',
                  padding: '9px 10px', background: C.panel, textAlign: 'left', cursor: 'pointer',
                  border: arch === a.name ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                  borderRadius: 2, color: C.ink, fontFamily: 'inherit',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, lineHeight: 1.3, color: C.ink3 }}>{a.lore}</span>
                    <span style={{ fontSize: 11, lineHeight: 1.3, color: C.note }}>{a.sells}</span>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim }}>
              Archetype and age are recorded but do not reach the simulation yet — see
              docs/design/characters.md. The hidden roll behind this character is the same either way.
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 18px 34px' }}>
          <Button disabled={!name.trim()} onClick={() => {
            let created: IpId | null = null;
            commit(st => { created = api.createIp(st, name.trim(), 'character'); });
            if (created) setCharacterMeta(created, { archetype: arch, baseAge: age });
            onDone();
          }}>Create {name.trim() || 'character'}</Button>
        </div>
      </Scroll>
    </Screen>
  );
}

// --- studio: sets ----------------------------------------------------------

function Sets({ s, onNew }: { s: SimState; onNew: () => void }) {
  const sets = Object.values(s.sets).filter(x => x.publisherId === s.playerId)
    .sort((a, b) => b.designStartTick - a.designStartTick);
  const stages: Array<[string, string]> = [
    ['design', 'IN DESIGN'], ['committed', 'PRINTING'], ['revealing', 'REVEALING'],
    ['released', 'RELEASED'], ['archived', 'ARCHIVED'],
  ];
  return (
    <>
      {sets.length === 0 && <Empty>No sets yet. This is the bet the whole game is about.</Empty>}
      {stages.map(([status, title]) => {
        const group = sets.filter(x => x.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <div style={{ ...micro, padding: '11px 18px 5px' }}>{title}</div>
            {group.map(set => (
              <div key={set.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                padding: '10px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{set.name}</div>
                  <div style={{ ...micro, letterSpacing: '0.07em' }}>
                    {set.type.toUpperCase()} · {set.cardIds.length} CARDS · {yearOf(s, set.designStartTick)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {set.performance
                    ? <>
                        <div style={{ ...num, fontSize: 13, color: C.go }}>{money(set.performance.revenue)}</div>
                        <div style={{ ...micro }}>{Math.round(100 * set.performance.unitsSold /
                          Math.max(1, set.performance.unitsSold + set.performance.unitsUnsold))}% SOLD</div>
                      </>
                    : <div style={{ ...micro, color: C.dim }}>—</div>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <div style={{ padding: '14px 18px 20px' }}>
        <Button onClick={onNew} tone="quiet">Design a set</Button>
      </div>
    </>
  );
}

const UNIT_COST_PER_BOX = 140 * 24 * 0.55; // cents; printing.unitCost.standard

type Finish = Treatment;

/** Grouped so the picker reads like a print shop's menu, not a flat list. */
const FINISH_GROUPS: Array<[string, Finish[]]> = [
  ['Surface', ['holo', 'reverseHolo', 'rainbowFoil', 'goldFoil', 'coldFoil']],
  ['Texture', ['textured', 'etched', 'embossed']],
  ['Frame', ['fullArt', 'extendedArt', 'borderless', 'alternateArt']],
  ['Extra', ['jumbo', 'signed']],
];
const FINISHES: Finish[] = FINISH_GROUPS.flatMap(([, f]) => f);
const FINISH_LABEL: Record<Finish, string> = {
  holo: 'Holo', reverseHolo: 'Reverse holo', rainbowFoil: 'Rainbow foil',
  goldFoil: 'Gold foil', coldFoil: 'Cold foil', textured: 'Textured',
  etched: 'Etched', embossed: 'Embossed', fullArt: 'Full art',
  extendedArt: 'Extended art', borderless: 'Borderless', alternateArt: 'Alternate art',
  jumbo: 'Jumbo', signed: 'Signed',
};

const finishText = (f: Finish[]): string =>
  f.length === 0 ? '\u2014' : f.map(x => FINISH_LABEL[x]).join(' + ');

/** A chip row: tap to add or drop a finish. Finishes stack. */
function FinishPicker({ value, onChange }: { value: Finish[]; onChange: (f: Finish[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {FINISH_GROUPS.map(([group, list]) => (
        <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ ...micro, width: 46, flexShrink: 0 }}>{group.toUpperCase()}</span>
          {list.map(f => {
            const on = value.includes(f);
            return (
              <button key={f} type="button" onClick={() =>
                onChange(on ? value.filter(x => x !== f) : [...value, f])} style={{
                  height: 30, padding: '0 9px', borderRadius: 2, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11, touchAction: 'manipulation',
                  background: on ? C.go : 'transparent',
                  color: on ? C.onAccent : C.muted,
                  border: `1px solid ${on ? C.go : C.rule}`,
                  fontWeight: on ? 600 : 400,
                }}>{FINISH_LABEL[f]}</button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * One rung of the studio's rarity ladder.
 *
 * `rarity` is the sim's enum and decides the pull odds. `label` is whatever the
 * studio calls it — the sim has no opinion about the word, and every real TCG
 * invents its own.
 */
interface RarityRow { rarity: Rarity; label: string; count: number; advertised: boolean; finishes: Finish[] }

const DEFAULT_ROWS: RarityRow[] = [
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
function perCardPull(s: SimState, r: Rarity, size: number): number {
  const cfg = s.config.rarity;
  return (cfg.pull[r] / cfg.pullDivisor) * (cfg.referenceSetSize / Math.max(1, size));
}

function oddsText(perPack: number): string {
  if (perPack <= 0) return '—';
  if (perPack >= 1) return `${perPack.toFixed(1)}/pk`;
  return `1 in ${Math.round(1 / perPack).toLocaleString()}`;
}

interface Crafted { ipId: IpId; rarity: Rarity; finishes: Finish[] }

function NewSet({ s, onDone, onBack }: { s: SimState; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  // Which way the next pane should slide in from. Set before the step changes
  // so the incoming pane starts on the correct side.
  const [dir, setDir] = useState(1);
  const go = (next: number) => { setDir(next >= step ? 1 : -1); setStep(next); };
  const [name, setName] = useState('');
  const [type, setType] = useState<SetType>('main');
  const [size, setSize] = useState(180);
  const [eraChoice, setEraChoice] = useState<string>('none'); // 'none' | 'new' | era id
  const [newEra, setNewEra] = useState('');
  const [rows, setRows] = useState<RarityRow[]>(DEFAULT_ROWS);
  const [crafted, setCrafted] = useState<Crafted[]>([]);
  const [units, setUnits] = useState(8000);
  const msrp = 14000;

  const meta = getMeta();
  const pub = s.publishers[s.playerId];
  const cash = pub ? pub.cash : 0;
  const cost = Math.round(units * UNIT_COST_PER_BOX);
  const short = Math.max(0, cost - cash);
  const ips = Object.values(s.ips).filter(ip => ip.publisherId === s.playerId);
  const artist = firstArtist(s);
  const steps = ['SHAPE', 'RARITY', 'CARDS', 'PRINT'];

  const namedTotal = rows.reduce((n, r) => n + r.count, 0);
  const commons = Math.max(0, size - namedTotal);
  const allRows: RarityRow[] = [
    { rarity: 'common', label: 'Common', count: commons, advertised: true, finishes: [] },
    ...rows,
  ];
  const slots = allRows.reduce((n, r) => n + perCardPull(s, r.rarity, size) * r.count, 0);
  const finished = allRows.filter(r => r.finishes.length > 0).reduce((n, r) => n + r.count, 0);
  const finishShare = size > 0 ? finished / size : 0;

  const craftedAt = (r: Rarity) => crafted.filter(c => c.rarity === r).length;
  const setRow = (i: number, patch: Partial<RarityRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const doCommit = () => {
    let madeSetId = '';
    commit(st => {
      const setId = api.createSet(st, name.trim() || 'Untitled', type, size);
      madeSetId = setId as string;
      const a = firstArtist(st);
      if (!a) return;
      let subjectAt = 0;
      const nextSubject = (): IpId | null => {
        const list = Object.values(st.ips).filter(ip => ip.publisherId === st.playerId);
        const pick = list[subjectAt % Math.max(1, list.length)];
        subjectAt++;
        return pick ? pick.id : null;
      };
      // The cards the player actually made, at exactly the rarity and finish
      // they chose.
      for (const c of crafted) {
        api.designCard(st, setId, c.ipId, [], c.rarity, a, undefined, undefined, c.finishes);
      }
      // The rest of the list, filling each rarity to the count the player set.
      for (const row of allRows) {
        const remaining = row.count - craftedAt(row.rarity);
        for (let i = 0; i < remaining; i++) {
          const subj = nextSubject();
          if (!subj) break;
          api.designCard(st, setId, subj, [], row.rarity, a, undefined, undefined, row.finishes);
        }
      }
      const pid = api.defineProduct(st, setId, 'boosterBox', REGION_US, 24, msrp);
      api.commitPrintRun(st, setId, { [pid]: units }, 'standard');
    });
    if (madeSetId) {
      if (eraChoice === 'new' && newEra.trim()) setSetEra(madeSetId, null, newEra.trim());
      else if (eraChoice !== 'none' && eraChoice !== 'new') setSetEra(madeSetId, eraChoice);
    }
    onDone();
  };

  const canNext = step === 0 ? !!name.trim() && size > 0 && !(eraChoice === 'new' && !newEra.trim()) : true;

  return (
    <Screen>
      <Header title={name.trim().toUpperCase() || 'NEW SET'} onBack={step === 0 ? onBack : () => go(step - 1)}
        right={<span style={{ ...micro }}>{step + 1} / 4</span>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        {steps.map((t, i) => (
          <button key={t} onClick={() => go(i)} style={{
            padding: '9px 6px', textAlign: 'center', ...micro, border: 'none', cursor: 'pointer',
            fontFamily: MONO, background: i === step ? C.raised : C.ground,
            color: i === step ? C.ink : C.dim, fontWeight: i === step ? 600 : 400,
            borderBottom: i === step ? `2px solid ${C.go}` : '2px solid transparent',
            transition: 'color 180ms ease, background 180ms ease',
          }}>{t}</button>
        ))}
      </div>

      <Scroll>
        <Pane step={step} dir={dir}>
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '15px 18px 0' }}>
            <Field label="Set name" value={name} onChange={setName} placeholder="Ashfall" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>TYPE</span>
              <div style={{ display: 'flex', background: C.raised, border: `1px solid ${C.rule}`, borderRadius: 2, overflow: 'hidden' }}>
                {(['main', 'specialty', 'subset', 'promo', 'collab'] as SetType[]).map(t => (
                  <button key={t} onClick={() => {
                    setType(t);
                    if (t !== 'main' && eraChoice === 'new') setEraChoice('none');
                  }} style={{
                    flexGrow: 1, height: 44, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: type === t ? C.ink : 'transparent',
                    color: type === t ? C.onAccent : C.muted,
                    fontSize: 11, fontWeight: type === t ? 600 : 400, textTransform: 'capitalize',
                  }}>{t}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>ERA</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {type === 'main' && (
                  <button onClick={() => setEraChoice('new')} style={{
                    display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', textAlign: 'left',
                    background: C.panel, border: eraChoice === 'new' ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                    borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Open a new era</span>
                    <span style={{ fontSize: 11, lineHeight: 1.35, color: C.muted }}>
                      <span style={{ color: C.note }}>Reaches people who never played.</span>{' '}
                      <span style={{ color: C.bad }}>Costs you the ones who did.</span>
                    </span>
                  </button>
                )}
                {eraChoice === 'new' && (
                  <Field label="Era name" value={newEra} onChange={setNewEra} placeholder="First Light" />
                )}
                {meta.eras.map(e => (
                  <button key={e.id} onClick={() => setEraChoice(e.id)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    padding: '10px 12px', textAlign: 'left', background: C.panel,
                    border: eraChoice === e.id ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                    borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Part of {e.name}</span>
                    <span style={{ ...micro }}>
                      {Object.values(meta.setEra).filter(x => x === e.id).length} SETS
                    </span>
                  </button>
                ))}
                <button onClick={() => setEraChoice('none')} style={{
                  padding: '10px 12px', textAlign: 'left', background: C.panel,
                  border: eraChoice === 'none' ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                  borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                }}>Stands alone</button>
              </div>
              {type !== 'main' && (
                <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim }}>
                  Only a main set can open an era. A {type} set can join one, or stand alone.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>HOW MANY CARDS</span>
              <input inputMode="numeric" value={String(size)}
                onChange={e => setSize(Math.max(0, Math.min(999, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)))}
                style={{
                  height: 50, padding: '0 13px', background: C.panel, color: C.ink,
                  border: `1px solid ${C.ink}`, borderRadius: 2, ...num,
                  fontSize: 20, fontWeight: 600, outline: 'none', width: '100%',
                }} />
              <div style={{ fontSize: 11.5, lineHeight: 1.4, color: C.muted }}>
                A pack still holds the same cardboard. A bigger set makes every card rarer — it does not put more in the box.
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            {meta.formats.length > 0 && (
              <div style={{ padding: '12px 16px 4px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={label}>IMPORT A FORMAT</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {meta.formats.map(f => (
                    <button key={f.id} onClick={() => setRows(f.rows.map(r => ({
                      rarity: r.rarity as Rarity, label: r.name, count: r.count,
                      advertised: r.advertised, finishes: (r.finishes ?? []) as Finish[],
                    })))} style={{
                      padding: '8px 12px', background: C.raised, border: `1px solid ${C.rule}`,
                      borderRadius: 2, color: C.ink, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}>{f.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, marginTop: 10 }}>
              <div style={{ padding: '10px 14px', background: C.panel }}>
                <div style={micro}>PACK SLOTS</div>
                <div style={{ ...num, fontSize: 15, fontWeight: 600 }}>{slots.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>Fixed. You divide them.</div>
              </div>
              <div style={{ padding: '10px 14px', background: C.panel }}>
                <div style={micro}>FINISHED</div>
                <div style={{ ...num, fontSize: 15, fontWeight: 600, color: finishShare > 0.34 ? C.bad : C.note }}>
                  {Math.round(finishShare * 100)}%
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{finished} of {size}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 58px', gap: 7, padding: '9px 16px 5px', ...micro }}>
              <div>RARITY · FINISH</div>
              <div style={{ textAlign: 'right' }}>CARDS</div>
              <div style={{ textAlign: 'right' }}>PULL</div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 52px 58px', gap: 7, alignItems: 'center',
              padding: '9px 16px', borderTop: `1px solid ${C.rule}`, background: C.raised,
            }}>
              <div>
                <div style={{ fontSize: 12.5 }}>Common</div>
                <div style={{ ...micro, color: C.dim }}>FILLS THE REST</div>
              </div>
              <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{commons}</div>
              <div style={{ textAlign: 'right', ...num, fontSize: 10.5, color: C.muted }}>
                {oddsText(perCardPull(s, 'common', size) * commons)}
              </div>
            </div>

            {rows.map((r, i) => (
              <div key={r.rarity} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '9px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 58px', gap: 7, alignItems: 'center' }}>
                  <input value={r.label} onChange={e => setRow(i, { label: e.target.value })}
                    aria-label={`Name for ${r.rarity}`} style={{
                      fontSize: 12.5, background: 'none', border: 'none', borderBottom: `1px dashed ${C.rule}`,
                      color: C.ink, fontFamily: 'inherit', padding: '2px 0', width: '100%', outline: 'none',
                    }} />
                  <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{r.count}</div>
                  <div style={{ textAlign: 'right', ...num, fontSize: 10.5, color: C.muted }}>
                    {oddsText(perCardPull(s, r.rarity, size) * r.count)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => setRow(i, { count: Math.max(0, r.count - 1) })} style={pillBtn}>−</button>
                  <button onClick={() => setRow(i, { count: r.count + 1 })} style={pillBtn}>+</button>
                  <button type="button" onClick={() => setRow(i, { advertised: !r.advertised })} style={{
                    ...pillBtn, width: 'auto', padding: '0 10px',
                    color: r.advertised ? C.muted : C.bad,
                    borderColor: r.advertised ? C.rule : C.bad,
                  }}>{r.advertised ? 'Advertised' : 'Secret'}</button>
                  <span style={{ ...micro, color: r.finishes.length ? C.note : C.dimmer }}>
                    {finishText(r.finishes).toUpperCase()}
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <FinishPicker value={r.finishes} onChange={f => setRow(i, { finishes: f })} />
                </div>
              </div>
            ))}

            <div style={{ padding: '12px 16px 0' }}>
              <Button tone="quiet" onClick={() => {
                const n = prompt('Save this rarity ladder as a format called:');
                if (!n || !n.trim()) return;
                saveFormat({
                  id: `fmt_${Date.now().toString(36)}`, name: n.trim(), packsPerUnit: 24, msrp: 14000,
                  rows: rows.map(r => ({ rarity: r.rarity, name: r.label, count: r.count, advertised: r.advertised, finishes: r.finishes })),
                });
              }}>Save as a format</Button>
            </div>

            <div style={{ padding: '12px 16px 0', fontSize: 11, lineHeight: 1.42, color: C.muted }}>
              A finish only works while it is rare. Past a third of the set it stops reading as one,
              and the print bill climbs faster than the chase does. A secret rarity is on no rarity
              sheet — the market finds it after release or not at all.
            </div>
          </>
        )}

        {step === 2 && (
          <CardsStep s={s} rows={allRows} crafted={crafted} setCrafted={setCrafted} ips={ips} size={size} />
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '15px 18px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>HOW MANY BOXES</span>
              <Stepper value={units} onChange={setUnits} step={500} min={500} max={60000} />
            </div>
            <div style={{ border: `1px solid ${C.rule}`, background: C.panel }}>
              <Row left={`${units.toLocaleString()} boxes at 18.48`} right={money(cost)} strong />
              <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
              <Row left="Cash on hand" right={money(cash)} />
              {short > 0 && <>
                <div style={{ height: 1, background: C.ink, margin: '0 12px' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bad }}>You must borrow</span>
                  <span style={{ ...num, fontSize: 17, fontWeight: 600, color: C.bad }}>{money(short)}</span>
                </div>
              </>}
            </div>
            <Note tone="bad">
              The run cannot move once committed, and where it ships locks with it — eighteen weeks
              before a single box exists, and long before anyone tells you whether this is any good.
            </Note>
          </div>
        )}

        </Pane>
        <div style={{ padding: '18px 18px 34px' }}>
          {step < 3
            ? <Button onClick={() => go(step + 1)} disabled={!canNext}>
                {['Rarities', 'Cards', 'Print run'][step]}
              </Button>
            : <Button onClick={doCommit} disabled={ips.length === 0 || !artist}>
                {short > 0 ? `Borrow ${money(short)} and print` : 'Commit the print run'}
              </Button>}
        </div>
      </Scroll>
    </Screen>
  );
}

/** Slides a step in from the side it came from. CSS only, no library. */
function Pane({ step, dir, children }: { step: number; dir: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(false); const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, [step]);
  return (
    <div style={{
      transform: shown ? 'translateX(0)' : `translateX(${dir * 26}px)`,
      opacity: shown ? 1 : 0,
      transition: 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 180ms ease',
      willChange: 'transform, opacity',
    }}>{children}</div>
  );
}

const pillBtn = {
  width: 32, height: 32, background: C.raised, color: C.ink, border: `1px solid ${C.rule}`,
  borderRadius: 2, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', padding: 0,
} as const;

/** Craft individual cards: pick a character, a rarity, and a finish. */
function CardsStep({ s, rows, crafted, setCrafted, ips, size }: {
  s: SimState; rows: RarityRow[]; crafted: Crafted[];
  setCrafted: (c: Crafted[]) => void; ips: IpEntity[]; size: number;
}) {
  const [pickIp, setPickIp] = useState<string>(ips[0] ? String(ips[0]!.id) : '');
  const [pickRarity, setPickRarity] = useState<Rarity>('rare');
  const [pickFinish, setPickFinish] = useState<Finish[]>(['holo']);
  const nameOf = (id: string) => Object.values(s.ips).find(i => String(i.id) === id)?.name ?? id;
  const roomAt = (r: Rarity) =>
    (rows.find(x => x.rarity === r)?.count ?? 0) - crafted.filter(c => c.rarity === r).length;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ padding: '9px 16px', background: C.ground }}>
          <div style={micro}>YOU MADE</div>
          <div style={{ ...num, fontSize: 17, fontWeight: 600 }}>{crafted.length}</div>
        </div>
        <div style={{ padding: '9px 16px', background: C.ground }}>
          <div style={micro}>THE STUDIO FILLS</div>
          <div style={{ ...num, fontSize: 17, fontWeight: 600, color: C.dim }}>{Math.max(0, size - crafted.length)}</div>
        </div>
      </div>

      {crafted.length === 0 && <Empty>No cards of your own yet. The studio will fill every slot with house work.</Empty>}

      {crafted.map((c, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr auto 34px', gap: 8, alignItems: 'center',
          padding: '9px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{nameOf(String(c.ipId))}</div>
            <div style={{ ...micro, letterSpacing: '0.07em' }}>{finishText(c.finishes).toUpperCase()}</div>
          </div>
          <div style={{ fontSize: 11.5, color: C.ink3 }}>
            {rows.find(r => r.rarity === c.rarity)?.label ?? c.rarity}
          </div>
          <button onClick={() => setCrafted(crafted.filter((_, j) => j !== i))} style={{
            ...pillBtn, width: 30, height: 30, color: C.bad, borderColor: C.rule,
          }}>×</button>
        </div>
      ))}

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>ADD A CARD</span>
        <select value={pickIp} onChange={e => setPickIp(e.target.value)} style={selectStyle}>
          {ips.map(ip => <option key={String(ip.id)} value={String(ip.id)}>{ip.name}</option>)}
        </select>
        <select value={pickRarity} onChange={e => {
          const r = e.target.value as Rarity;
          setPickRarity(r);
          // Start from what that rung already prints; the card can then differ.
          setPickFinish(rows.find(x => x.rarity === r)?.finishes ?? []);
        }} style={selectStyle}>
          {rows.map(r => (
            <option key={r.rarity} value={r.rarity} disabled={roomAt(r.rarity) <= 0}>
              {r.label} ({roomAt(r.rarity)} left)
            </option>
          ))}
        </select>
        <FinishPicker value={pickFinish} onChange={setPickFinish} />
        <Button tone="quiet" disabled={!pickIp || roomAt(pickRarity) <= 0} onClick={() =>
          setCrafted([...crafted, { ipId: pickIp as IpId, rarity: pickRarity, finishes: pickFinish }])}>
          Add card
        </Button>
        <div style={{ fontSize: 11, lineHeight: 1.42, color: C.muted }}>
          Make the same character more than once. Four Arylas at four rarities is a variant run, and
          collectors chase the complete set of them.
        </div>
      </div>
    </>
  );
}

const selectStyle = {
  height: 44, background: C.panel, color: C.ink, border: `1px solid ${C.rule}`,
  borderRadius: 2, fontSize: 13, fontFamily: 'inherit', padding: '0 10px', width: '100%',
} as const;


// --- studio: formats -------------------------------------------------------

/**
 * The rarity ladders and pack configurations a studio reuses.
 *
 * Authored here, imported when a set is designed. A real studio settles this
 * once and reprints it for years, so it does not belong inside a set wizard.
 */
function Formats() {
  const meta = getMeta();
  const [editing, setEditing] = useState<string | null>(null);
  const f = meta.formats.find(x => x.id === editing);

  if (f) {
    const setRow = (i: number, patch: Partial<typeof f.rows[number]>) =>
      saveFormat({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px' }}>
          <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16 }}>{f.name}</span>
          <button onClick={() => setEditing(null)} style={{
            ...pillBtn, width: 'auto', padding: '0 12px', fontSize: 12,
          }}>Done</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px', gap: 7, padding: '4px 16px 6px', ...micro }}>
          <div>NAME · TIER · FINISH</div>
          <div style={{ textAlign: 'right' }}>CARDS</div>
        </div>
        {f.rows.map((r, i) => (
          <div key={i} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '9px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px', gap: 7, alignItems: 'center' }}>
              <input value={r.name} onChange={e => setRow(i, { name: e.target.value })}
                aria-label={`Name for ${r.rarity}`} style={{
                  fontSize: 13, background: 'none', border: 'none', borderBottom: `1px dashed ${C.rule}`,
                  color: C.ink, fontFamily: 'inherit', padding: '2px 0', width: '100%', outline: 'none',
                }} />
              <div style={{ textAlign: 'right', ...num, fontSize: 13 }}>{r.count}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              <button onClick={() => setRow(i, { count: Math.max(0, r.count - 1) })} style={pillBtn}>−</button>
              <button onClick={() => setRow(i, { count: r.count + 1 })} style={pillBtn}>+</button>
              <span style={{ ...micro, color: C.dimmer }}>{r.rarity}</span>
              <button type="button" onClick={() => setRow(i, { advertised: !r.advertised })} style={{
                ...pillBtn, width: 'auto', padding: '0 10px',
                color: r.advertised ? C.muted : C.bad, borderColor: r.advertised ? C.rule : C.bad,
              }}>{r.advertised ? 'Advertised' : 'Secret'}</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <FinishPicker value={(r.finishes ?? []) as Finish[]}
                onChange={f => setRow(i, { finishes: f })} />
            </div>
          </div>
        ))}
        <div style={{ padding: '14px 16px 6px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={label}>PACKS PER BOX</span>
          <Stepper value={f.packsPerUnit} onChange={v => saveFormat({ ...f, packsPerUnit: v })} min={1} max={60} />
          <span style={{ ...label, marginTop: 8 }}>BOX PRICE, IN CENTS</span>
          <Stepper value={f.msrp} onChange={v => saveFormat({ ...f, msrp: v })} step={500} min={500} max={100000} />
        </div>
        <div style={{ padding: '16px 16px 24px' }}>
          <Button tone="quiet" onClick={() => { deleteFormat(f.id); setEditing(null); }}>Delete this format</Button>
        </div>
      </>
    );
  }

  return (
    <>
      {meta.formats.length === 0 && (
        <Empty>No formats yet. A format is a rarity ladder and a pack configuration you reuse — settle it once, import it into every set.</Empty>
      )}
      {meta.formats.map(x => (
        <button key={x.id} onClick={() => setEditing(x.id)} style={{
          display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
          border: 'none', borderTopStyle: 'solid', color: C.ink, cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}>
          <div>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15 }}>{x.name}</div>
            <div style={{ ...micro, letterSpacing: '0.07em' }}>
              {x.rows.length} TIERS · {x.rows.reduce((n, r) => n + r.count, 0)} NAMED CARDS · {x.packsPerUnit} PACKS
            </div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      ))}
      <div style={{ padding: '14px 18px 24px' }}>
        <Button tone="quiet" onClick={() => {
          const n = prompt('Name this format:');
          if (!n || !n.trim()) return;
          const id = `fmt_${Date.now().toString(36)}`;
          saveFormat({
            id, name: n.trim(), packsPerUnit: 24, msrp: 14000,
            rows: DEFAULT_ROWS.map(r => ({
              rarity: r.rarity, name: r.label, count: r.count,
              advertised: r.advertised, finishes: r.finishes,
            })),
          });
          setEditing(id);
        }}>New format</Button>
      </div>
    </>
  );
}

// --- studio: ledger --------------------------------------------------------

function Ledger({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  if (!pub) return null;
  const spend = pub.ledger.slice(-14).reverse();
  return (
    <>
      <div style={{ border: `1px solid ${C.rule}`, background: C.panel, margin: '14px 18px' }}>
        <Row left="Cash" right={money(pub.cash)} strong />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Debt" right={money(pub.debt)} />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Widest debt so far" right={money(pub.peakDebt)} />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Brand standing" right={pub.brandStanding.toFixed(2)} />
        <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
        <Row left="Credit" right={pub.credit.toFixed(2)} />
      </div>
      <div style={{ ...micro, padding: '4px 18px 6px' }}>RECENT MOVEMENTS</div>
      {spend.length === 0 && <Empty>Nothing has moved yet.</Empty>}
      {spend.map((e, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 18px',
          borderTop: `1px solid ${C.rule}`, background: C.panel, alignItems: 'baseline',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note || e.category}</div>
            <div style={micro}>{e.category.toUpperCase()} · {yearOf(s, e.t)}</div>
          </div>
          <div style={{ ...num, fontSize: 13, color: e.amount < 0 ? C.bad : C.go }}>
            {e.amount < 0 ? '' : '+'}{money(e.amount)}
          </div>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </>
  );
}

// --- studio: growth --------------------------------------------------------

function Growth({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  if (!pub) return null;
  const u = pub.unlocks;
  const tiers: Array<[string, string]> = [
    ['Market research', `${u.marketResearch} / 3`],
    ['Community team', `${u.communityTeam} / 3`],
    ['Analytics', `${u.analytics} / 3`],
    ['Channels open', String(u.channels.length)],
    ['Regions open', String(u.regions.length)],
    ['Print tiers', u.printQualityTiers.join(', ') || 'standard'],
    ['Specialty slots', String(u.specialtySetSlots)],
    ['Self-hosted events', u.canHostEvents ? 'yes' : 'no'],
  ];
  return (
    <>
      {tiers.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
          padding: '11px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
        }}>
          <span style={{ fontSize: 13 }}>{k}</span>
          <span style={{ ...num, fontSize: 12.5, color: C.muted }}>{v}</span>
        </div>
      ))}
      <div style={{ padding: '14px 18px', fontSize: 11.5, lineHeight: 1.45, color: C.dim }}>
        Buying tiers is not wired into this build. Measured warning from the harness: at a
        reserve of two print runs a studio that buys them dies in four seeds of six.
      </div>
    </>
  );
}

// --- feed ------------------------------------------------------------------

function Feed({ s }: { s: SimState }) {
  const events = s.events.slice(-120).reverse();
  return (
    <>
      {events.length === 0 && <Empty>Nothing has happened yet. Press Continue.</Empty>}
      {events.map(e => (
        <div key={e.id} style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '9px 18px',
          borderTop: `1px solid ${C.rule}`, background: e.interrupts ? C.raised : C.panel,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: e.interrupts ? 600 : 400 }}>{e.kind}</div>
            <div style={micro}>W{String((e.t as number) % 52).padStart(2, '0')} · {yearOf(s, e.t)}</div>
          </div>
          {e.interrupts && <div style={{ ...micro, color: C.note, alignSelf: 'center' }}>STOP</div>}
        </div>
      ))}
      <div style={{ height: 20 }} />
    </>
  );
}

// --- shell -----------------------------------------------------------------

const TABS = ['Studio', 'Partners', 'World', 'Market', 'Community'] as const;
const SUBTABS = ['Roster', 'Sets', 'Formats', 'Store', 'Growth', 'Ledger'] as const;

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const col = active ? C.go : C.dim;
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: col, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'Studio') return <svg {...p}><path d="M3 21V9l6-4v16" /><path d="M9 21V11l7-3v13" /><path d="M16 21V10l5 2v9" /><path d="M2 21h20" /></svg>;
  if (name === 'Partners') return <svg {...p}><circle cx="8.5" cy="12" r="5" /><circle cx="15.5" cy="12" r="5" /></svg>;
  if (name === 'World') return <svg {...p}><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>;
  if (name === 'Market') return <svg {...p}><path d="M4 4v16h16" /><path d="M7 15l4-5 3 3 5-7" /></svg>;
  return <svg {...p}><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="10" r="2.6" /><path d="M15 19c0-2.4 1.6-4 4-4" /></svg>;
}

export default function App() {
  // A cheap fingerprint of everything a screen reads. The third argument keeps
  // the component renderable outside a browser, which is what lets the flow be
  // smoke-tested without a headless browser.
  const snapshot = () => {
    const st = getState();
    return st ? `${st.tick}:${st.events.length}:${Object.keys(st.ips).length}:${Object.keys(st.sets).length}` : 'none';
  };
  const version = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [tab, setTab] = useState<string>('Studio');
  const [sub, setSub] = useState<string>('Roster');
  const [route, setRoute] = useState<'main' | 'newChar' | 'newSet'>('main');
  const [stop, setStop] = useState<AdvanceResult | null>(null);

  useEffect(() => { loadSaved(); }, []);

  const s = getState();
  if (!s) return <Onboarding />;
  void version;

  const pub = s.publishers[s.playerId];
  const dead = pub?.deadTick != null;

  if (route === 'newChar') return <NewCharacter s={s} onBack={() => setRoute('main')} onDone={() => setRoute('main')} />;
  if (route === 'newSet') return <NewSet s={s} onBack={() => setRoute('main')} onDone={() => { setRoute('main'); setSub('Sets'); }} />;

  return (
    <Screen>
      <Header
        title={getMeta().studioName || pub?.name || 'Studio'}
        sub={(getMeta().gameName || '').toUpperCase()}
        right={
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...num, fontSize: 16, fontWeight: 600 }}>{money(pub?.cash ?? 0)}</div>
            {(pub?.debt ?? 0) > 0 && <div style={{ ...micro, color: C.bad }}>DEBT {money(pub!.debt)}</div>}
          </div>
        } />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '7px 10px 7px 18px', background: C.raised, borderBottom: `1px solid ${C.rule}`, flexShrink: 0,
      }}>
        <span style={{ ...num, fontSize: 12, fontWeight: 600 }}>
          W{String((s.tick as number) % 52).padStart(3, '0')} · {yearOf(s, s.tick)}
        </span>
        {dead
          ? <span style={{ ...micro, color: C.bad }}>{(pub?.deathCause ?? 'dead').toUpperCase()}</span>
          : <button onClick={() => setStop(advance())} style={{
              display: 'flex', alignItems: 'center', gap: 7, height: 44, padding: '0 16px',
              background: C.go, color: C.onAccent, border: 'none', borderRadius: 2,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Continue
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l10 8-10 8" /><path d="M19 4v16" /></svg>
            </button>}
      </div>

      {tab === 'Studio' && (
        <div style={{
          display: 'flex', background: C.panel, borderBottom: `1px solid ${C.rule}`,
          flexShrink: 0,
          // iOS reserves the left screen edge for the back gesture, which can
          // swallow a tap aimed at the first tab. Inset the row past it.
          paddingLeft: 6, paddingRight: 6,
        }}>
          {SUBTABS.map(t => (
            <button key={t} type="button" onClick={() => setSub(t)} style={{
              flex: '1 1 0', minWidth: 0, height: 46, border: 'none', background: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, padding: 0,
              whiteSpace: 'nowrap', touchAction: 'manipulation', WebkitUserSelect: 'none',
              transition: 'color 160ms ease',
              color: sub === t ? C.ink : C.dim, fontWeight: sub === t ? 600 : 400,
              borderBottom: sub === t ? `2px solid ${C.go}` : '2px solid transparent',
            }}>{t}</button>
          ))}
        </div>
      )}

      <Scroll>
        {dead && <Note tone="bad">
          The studio is gone. It ran out of cash in {yearOf(s, pub!.deadTick as number)} and the bank
          would not cover it. Cause on record: {pub!.deathCause}.
        </Note>}
        {tab === 'Studio' && sub === 'Roster' && <Roster s={s} onNew={() => setRoute('newChar')} />}
        {tab === 'Studio' && sub === 'Sets' && <Sets s={s} onNew={() => setRoute('newSet')} />}
        {tab === 'Studio' && sub === 'Formats' && <Formats />}
        {tab === 'Studio' && sub === 'Ledger' && <Ledger s={s} />}
        {tab === 'Studio' && sub === 'Growth' && <Growth s={s} />}
        {tab === 'Studio' && sub === 'Store' && <Empty>The direct store is not built yet. It is the one shelf you own.</Empty>}
        {tab === 'Community' && <Feed s={s} />}
        {(tab === 'Partners' || tab === 'World' || tab === 'Market') &&
          <Empty>{tab} is designed but not built. The sim behind it is running regardless.</Empty>}
        {tab === 'Studio' && sub === 'Ledger' && (
          <div style={{ padding: '0 18px 24px' }}>
            <Button tone="quiet" onClick={() => { if (confirm('Abandon this studio and start again?')) abandonGame(); }}>
              Abandon the studio
            </Button>
          </div>
        )}
      </Scroll>

      {stop && stop.stops.length > 0 && (
        <button onClick={() => setStop(null)} style={{
          position: 'fixed', inset: 0, background: 'oklch(0.12 0.01 250 / 0.72)', border: 'none',
          display: 'flex', alignItems: 'flex-end', padding: 0, cursor: 'pointer',
        }}>
          <div style={{ width: '100%', background: C.panel, borderTop: `1px solid ${C.rule}`, textAlign: 'left' }}>
            <div style={{ ...label, padding: '13px 18px 8px' }}>
              {stop.weeks} WEEK{stop.weeks === 1 ? '' : 'S'} LATER
            </div>
            {stop.stops.slice(0, 6).map((e, i) => (
              <div key={i} style={{ padding: '9px 18px', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                {e.kind}
              </div>
            ))}
            <div style={{ padding: '14px 18px 30px' }}><Button>Carry on</Button></div>
          </div>
        </button>
      )}

      <div style={{
        display: 'flex', background: C.panel, borderTop: `1px solid ${C.rule}`,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            flex: '1 1 0', minWidth: 0, height: 58, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            touchAction: 'manipulation', WebkitUserSelect: 'none',
            color: tab === t ? C.go : C.dim,
          }}>
            <TabIcon name={t} active={tab === t} />
            <span style={{ fontSize: 9, fontWeight: tab === t ? 600 : 400 }}>{t}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
