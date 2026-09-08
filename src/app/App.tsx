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
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SimState, IpId, Rarity, SetType, ArtistId } from '../sim/types.ts';
import { api } from '../sim/engine.ts';
import { readAffection, displayTier } from '../sim/readings.ts';
import { REGION_US } from '../sim/world.ts';
import {
  subscribe, getState, getMeta, newGame, loadSaved, commit, advance,
  setCharacterMeta, abandonGame, type AdvanceResult,
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
        <div style={{ padding: '54px 26px 0 26px' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px 44px', gap: 8, padding: '9px 18px 6px', ...micro }}>
        <div>NAME · ARCHETYPE · READING</div>
        <div style={{ textAlign: 'right' }}>CARDS</div>
        <div style={{ textAlign: 'right' }}>SINCE</div>
      </div>
      {ips.length === 0 && <Empty>No characters yet. A set needs somebody on the cards.</Empty>}
      {ips.map(ip => {
        const m = meta.characters[ip.id as string];
        return (
          <div key={ip.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 46px 44px', gap: 8, alignItems: 'center',
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
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px' }}>
        <div style={{ fontSize: 11, lineHeight: 1.4, color: C.muted }}>
          {tier === 'prose' ? 'Readings are prose at research tier 0. Buy research for bands.' : `Reading sharpness: ${tier}.`}
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

function NewSet({ s, onDone, onBack }: { s: SimState; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState<SetType>('main');
  const [size, setSize] = useState(180);
  const [mix, setMix] = useState('Balanced');
  const [units, setUnits] = useState(8000);
  const [msrp] = useState(14000);

  const pub = s.publishers[s.playerId];
  const cash = pub ? pub.cash : 0;
  const cost = Math.round(units * UNIT_COST_PER_BOX);
  const short = Math.max(0, cost - cash);
  const ips = Object.values(s.ips).filter(ip => ip.publisherId === s.playerId);
  const artist = firstArtist(s);
  const steps = ['SHAPE', 'RARITY', 'CARDS', 'PRINT'];

  const doCommit = () => {
    commit(st => {
      const setId = api.createSet(st, name.trim() || 'Untitled', type, size);
      const a = firstArtist(st);
      if (a) {
        for (let i = 0; i < size; i++) {
          const subject = ips[i % Math.max(1, ips.length)];
          if (!subject) break;
          api.designCard(st, setId, subject.id, [], pickRarity(mix, i), a);
        }
      }
      const pid = api.defineProduct(st, setId, 'boosterBox', REGION_US, 24, msrp);
      api.commitPrintRun(st, setId, { [pid]: units }, 'standard');
    });
    onDone();
  };

  return (
    <Screen>
      <Header title={name.trim().toUpperCase() || 'NEW SET'} onBack={step === 0 ? onBack : () => setStep(step - 1)}
        right={<span style={{ ...micro }}>{step + 1} / 4</span>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 1, background: C.rule, borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        {steps.map((t, i) => (
          <div key={t} style={{
            padding: '7px 6px', textAlign: 'center', ...micro,
            background: i === step ? C.raised : C.ground,
            color: i === step ? C.ink : C.dim, fontWeight: i === step ? 600 : 400,
            borderBottom: i === step ? `2px solid ${C.go}` : 'none',
          }}>{t}</div>
        ))}
      </div>

      <Scroll>
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '15px 18px 0' }}>
            <Field label="Set name" value={name} onChange={setName} placeholder="Ashfall" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>TYPE</span>
              <div style={{ display: 'flex', background: C.raised, border: `1px solid ${C.rule}`, borderRadius: 2, overflow: 'hidden' }}>
                {(['main', 'specialty', 'subset', 'promo', 'collab'] as SetType[]).map(t => (
                  <button key={t} onClick={() => setType(t)} style={{
                    flexGrow: 1, height: 44, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: type === t ? C.ink : 'transparent',
                    color: type === t ? C.onAccent : C.muted,
                    fontSize: 11, fontWeight: type === t ? 600 : 400, textTransform: 'capitalize',
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={label}>HOW MANY CARDS</span>
              <Stepper value={size} onChange={setSize} step={10} min={20} max={400} />
              <div style={{ fontSize: 11.5, lineHeight: 1.4, color: C.muted }}>
                A pack still holds the same cardboard. A bigger set makes every card rarer — it does not put more in the box.
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 18px 0' }}>
            <span style={label}>WHERE THE PACK SLOTS GO</span>
            {Object.entries(MIXES).map(([k, v]) => (
              <button key={k} onClick={() => setMix(k)} style={{
                display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 12px', textAlign: 'left',
                background: C.panel, border: mix === k ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                borderRadius: 2, color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 11.5, lineHeight: 1.35, color: C.muted }}>{v.blurb}</span>
              </button>
            ))}
            <Note>
              A pack holds a fixed number of cards, so this divides them and never adds. Rarity buys a better story and a worse box.
            </Note>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 18px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.rule }}>
              <div style={{ padding: '9px 12px', background: C.ground }}>
                <div style={micro}>CHARACTERS</div>
                <div style={{ ...num, fontSize: 17, fontWeight: 600 }}>{ips.length}</div>
              </div>
              <div style={{ padding: '9px 12px', background: C.ground }}>
                <div style={micro}>CARDS IN SET</div>
                <div style={{ ...num, fontSize: 17, fontWeight: 600 }}>{size}</div>
              </div>
            </div>
            {ips.length === 0
              ? <Note tone="bad">You have no characters. Go back to the roster and make one — a set needs somebody on the cards.</Note>
              : <div style={{ fontSize: 12, lineHeight: 1.45, color: C.muted }}>
                  Your {ips.length} character{ips.length === 1 ? '' : 's'} are spread across all {size} cards, and the
                  studio fills the rest at house quality. Choosing which card is which character is not built yet.
                </div>}
            {!artist && <Note tone="bad">No artist is available to take the briefs.</Note>}
          </div>
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
            {short > 0 && <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim }}>
              The sim currently lends automatically when cash runs out. An explicit loan is
              specced but not wired — `api.borrow` exists and nothing calls it.
            </div>}
          </div>
        )}

        <div style={{ padding: '18px 18px 34px' }}>
          {step < 3
            ? <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !name.trim()}>
                {steps[step + 1] ? steps[step + 1]!.charAt(0) + steps[step + 1]!.slice(1).toLowerCase() : 'Next'}
              </Button>
            : <Button onClick={doCommit} disabled={ips.length === 0 || !artist}>
                {short > 0 ? `Borrow ${money(short)} and print` : 'Commit the print run'}
              </Button>}
        </div>
      </Scroll>
    </Screen>
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
const SUBTABS = ['Sets', 'Roster', 'Store', 'Growth', 'Ledger'] as const;

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
        <div style={{ display: 'flex', background: C.panel, borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
          {SUBTABS.map(t => (
            <button key={t} onClick={() => setSub(t)} style={{
              flexGrow: 1, height: 42, border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12,
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
        paddingBottom: 'env(safe-area-inset-bottom, 6px)', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flexGrow: 1, height: 58, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
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
