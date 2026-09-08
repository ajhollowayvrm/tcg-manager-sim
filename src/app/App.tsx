/**
 * The shell: the clock, the tab bar, and which screen is on.
 *
 * What is REAL: the world, the clock, characters, sets, print runs, borrowing,
 * every price and every event. All of it runs the same `src/sim` the balance
 * harness runs, through `api.*` decisions.
 *
 * What is NOT in the sim yet, and is held app-side so the screens can be honest
 * about it: a character's archetype, base age and affiliation (see
 * `docs/design/characters.md`), eras, and per-rarity finishes. Those are marked
 * in the UI where they appear.
 *
 * Every screen lives in `screens/`. This file holds no screen of its own — it
 * was 1,258 lines when it did, which is why they moved.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribe, getState, getMeta, loadSaved, advance, abandonGame, type AdvanceResult } from './store.ts';
import { C, num, label, micro, Screen, Scroll, Header, Button, Note, Empty } from './ui.tsx';
import { money, yearOf } from './format.ts';
import { Onboarding } from './screens/Onboarding.tsx';
import { Roster, NewCharacter } from './screens/Roster.tsx';
import { Sets } from './screens/Sets.tsx';
import { NewSet } from './screens/NewSet.tsx';
import { Formats } from './screens/Formats.tsx';
import { Ledger } from './screens/Ledger.tsx';
import { Growth } from './screens/Growth.tsx';
import { Feed } from './screens/Feed.tsx';

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