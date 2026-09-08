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
import type { SetId } from '../sim/types.ts';
import { subscribe, getState, getMeta, loadSaved, advance, abandonGame, type AdvanceResult } from './store.ts';
import { C, num, label, micro, Screen, Scroll, Header, Button, Note, Empty, Tabs } from './ui.tsx';
import { money, yearOf } from './format.ts';
import { Onboarding } from './screens/Onboarding.tsx';
import { Roster, NewCharacter } from './screens/Roster.tsx';
import { Sets } from './screens/Sets.tsx';
import { NewSet } from './screens/NewSet.tsx';
import { Formats } from './screens/Formats.tsx';
import { Ledger } from './screens/Ledger.tsx';
import { Growth } from './screens/Growth.tsx';
import { Feed } from './screens/Feed.tsx';
import { SetDetail } from './screens/SetDetail.tsx';
import { Store } from './screens/Store.tsx';
import { Market } from './screens/Market.tsx';
import { Regions, Channels } from './screens/World.tsx';
import { Artists, Licensing, Creators } from './screens/Partners.tsx';

// --- shell -----------------------------------------------------------------

const TABS = ['Studio', 'Partners', 'World', 'Market', 'Community'] as const;

/**
 * The second row, per tab. Every entry is a real screen — a tab that cannot
 * fill its sub-navigation does not get one.
 */
const SUBTABS: Record<string, readonly string[]> = {
  Studio: ['Roster', 'Sets', 'Formats', 'Store', 'Growth', 'Ledger'],
  Partners: ['Artists', 'Licensing', 'Creators'],
  World: ['Regions', 'Channels'],
  Market: [],
  Community: [],
};

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
  const [openSet, setOpenSet] = useState<SetId | null>(null);
  const [stop, setStop] = useState<AdvanceResult | null>(null);

  useEffect(() => { loadSaved(); }, []);

  const s = getState();
  if (!s) return <Onboarding />;
  void version;

  const pub = s.publishers[s.playerId];
  const dead = pub?.deadTick != null;

  if (route === 'newChar') return <NewCharacter s={s} onBack={() => setRoute('main')} onDone={() => setRoute('main')} />;
  if (route === 'newSet') return <NewSet s={s} onBack={() => setRoute('main')} onDone={() => { setRoute('main'); setSub('Sets'); }} />;
  if (openSet && s.sets[openSet]) return <SetDetail s={s} setId={openSet} onBack={() => setOpenSet(null)} />;

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

      {SUBTABS[tab]!.length > 0 && (
        <Tabs tabs={SUBTABS[tab]!} value={sub}
          onChange={t => setSub(t)} />
      )}

      {tab === 'Market' ? <Market s={s} />
        : tab === 'Community' ? <Feed s={s} />
        : (
        <Scroll>
          {dead && <Note tone="bad">
            The studio is gone. It ran out of cash in {yearOf(s, pub!.deadTick as number)} and the bank
            would not cover it. Cause on record: {pub!.deathCause}.
          </Note>}
          {tab === 'Studio' && sub === 'Roster' && <Roster s={s} onNew={() => setRoute('newChar')} />}
          {tab === 'Studio' && sub === 'Sets' && <Sets s={s} onNew={() => setRoute('newSet')} onOpen={setOpenSet} />}
          {tab === 'Studio' && sub === 'Formats' && <Formats />}
          {tab === 'Studio' && sub === 'Store' && <Store s={s} />}
          {tab === 'Studio' && sub === 'Growth' && <Growth s={s} />}
          {tab === 'Studio' && sub === 'Ledger' && <>
            <Ledger s={s} />
            <div style={{ padding: '0 18px 24px' }}>
              <Button tone="quiet" onClick={() => { if (confirm('Abandon this studio and start again?')) abandonGame(); }}>
                Abandon the studio
              </Button>
            </div>
          </>}
          {tab === 'Partners' && sub === 'Artists' && <Artists s={s} />}
          {tab === 'Partners' && sub === 'Licensing' && <Licensing s={s} />}
          {tab === 'Partners' && sub === 'Creators' && <Creators s={s} />}
          {tab === 'World' && sub === 'Regions' && <Regions s={s} />}
          {tab === 'World' && sub === 'Channels' && <Channels s={s} />}
        </Scroll>
      )}

      {stop && stop.stops.length > 0 && (
        // A dialog, not a button. It used to be a <button> backdrop wrapping the
        // panel, which nested the "Carry on" button inside another button —
        // invalid HTML that React warns about, and a real hit-target bug on
        // iOS, where the inner tap can be swallowed by the outer control.
        <div role="dialog" aria-label="What happened" style={{
          position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end',
        }}>
          <button type="button" aria-label="Dismiss" onClick={() => setStop(null)} style={{
            position: 'absolute', inset: 0, background: 'oklch(0.12 0.01 250 / 0.72)',
            border: 'none', padding: 0, cursor: 'pointer',
          }} />
          <div style={{
            position: 'relative', width: '100%', background: C.panel,
            borderTop: `1px solid ${C.rule}`, textAlign: 'left',
          }}>
            <div style={{ ...label, padding: '13px 18px 8px' }}>
              {stop.weeks} WEEK{stop.weeks === 1 ? '' : 'S'} LATER
            </div>
            {stop.stops.slice(0, 6).map((e, i) => (
              <div key={i} style={{ padding: '9px 18px', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                {e.kind}
              </div>
            ))}
            <div style={{ padding: '14px 18px 30px' }}>
              <Button onClick={() => setStop(null)}>Carry on</Button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', background: C.panel, borderTop: `1px solid ${C.rule}`,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t} type="button" onClick={() => {
            setTab(t);
            // Each tab owns its own second row, so carrying the old selection
            // across would land on a sub-tab this tab does not have and render
            // an empty screen.
            const first = SUBTABS[t]![0];
            if (first) setSub(first);
          }} style={{
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