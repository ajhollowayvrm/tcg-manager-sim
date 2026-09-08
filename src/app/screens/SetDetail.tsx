/**
 * One set, in whichever of its three lives it is currently living.
 *
 * `docs/screens-audit.md` §2: a set screen needs three states, not one —
 * design (a forecast), revealing (hype and preorders), released (performance).
 * `performance` is null until it ships.
 *
 * **`hype.signal` and `forecastSetDemand` are two different instruments and
 * they may disagree.** The signal measures the set's true chase and arrives
 * AFTER the print run is locked; the forecast reads demand before the commit
 * and sharpens with money. Showing them as one number destroys the decision
 * they exist to inform, so they sit in separate blocks and say so.
 *
 * The signal must also be able to LIE. Nothing in the value engine reads it; it
 * exists to be looked at.
 */
import { useState } from 'react';
import type { SimState, SetId, Cents } from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import { forecastSetDemand } from '../../sim/readings.ts';
import { aftermarketIndex } from '../../sim/actors.ts';
import { CHANNEL_IDS } from '../../sim/channels.ts';
import {
  C, MONO, num, label, micro, Screen, Scroll, Header, Button, Row, Note, Empty,
  Sheet, Slider, Stat, StatRow, AllocationBar, Legend, seriesColor,
} from '../ui.tsx';
import { ReadingValue, Confidence, DEMAND_PROSE } from '../reading.tsx';
import { money, stamp, untilText, pct, asCents } from '../format.ts';
import { commit } from '../store.ts';

type Lever = 'reveal' | 'marketing' | 'preorders' | 'prerelease' | 'event';

export function SetDetail({ s, setId, onBack }: { s: SimState; setId: SetId; onBack: () => void }) {
  const set = s.sets[setId];
  const pub = s.publishers[s.playerId];
  const [lever, setLever] = useState<Lever | null>(null);
  const [n, setN] = useState(0);
  const [cadence, setCadence] = useState(2);
  if (!set || !pub) return null;

  const cfg = s.config;
  const hype = set.hype;
  const perf = set.performance;
  const inWindow = set.status === 'committed' || set.status === 'revealing';
  const home = set.regionSchedule[0];
  const lgs = s.channels[CHANNEL_IDS.lgs];
  const canEvent = pub.unlocks.canHostEvents && set.status === 'released';

  const open = (l: Lever) => {
    if (l === 'marketing') setN(Math.min(pub.cash, 50_000_00));
    else if (l === 'preorders') setN(5000);
    else if (l === 'reveal') { setN(Math.max(0, (home?.releaseTick ?? s.tick) - s.tick - 8)); setCadence(2); }
    else setN(1);
    setLever(l);
  };

  const sold = perf ? perf.unitsSold : 0;
  const unsold = perf ? perf.unitsUnsold : 0;
  const sellThrough = sold + unsold > 0 ? sold / (sold + unsold) : 0;

  return (
    <Screen>
      <Header title={set.name} onBack={onBack}
        sub={`${set.type.toUpperCase()} · ${set.cardIds.length} CARDS · ${set.status.toUpperCase()}`} />
      <Scroll>
        {/* ---------- design: a forecast, and nothing else is known ---------- */}
        {set.status === 'design' && (() => {
          const f = forecastSetDemand(s, setId);
          return (
            <>
              <div style={{ padding: '14px 16px 4px' }}>
                <div style={label}>WHAT YOU THINK IT WILL DO</div>
                <div style={{ fontSize: 17, marginTop: 6 }}>
                  <ReadingValue reading={f} prose={DEMAND_PROSE} />
                </div>
                <div style={{ marginTop: 7 }}><Confidence reading={f} /></div>
              </div>
              <Note>
                This is a read of DEMAND, taken before the commit, and it sharpens with analytics.
                It is not the reveal signal — that one measures chase and does not arrive until
                the print run is already locked.
              </Note>
            </>
          );
        })()}

        {/* ---------- revealing: the levers ---------- */}
        {inWindow && hype && (
          <>
            <StatRow cols={3}>
              <Stat label="Hype" value={hype.level.toFixed(2)} tone="note"
                sub={`ceiling ${cfg.hype.ceiling}`} />
              <Stat label="Previews" value={hype.cardsRevealed} sub={`every ${hype.cadence}w`} />
              <Stat label="Ships" value={home ? untilText(s.tick, home.releaseTick) : '—'}
                sub={home ? stamp(s, home.releaseTick) : ''} />
            </StatRow>

            <div style={{ padding: '13px 16px 4px' }}>
              <div style={label}>THE SIGNAL</div>
              <div style={{ ...num, fontSize: 24, fontWeight: 600, marginTop: 4 }}>
                {hype.cardsRevealed > 0 ? hype.signal.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.muted, marginTop: 5 }}>
                A measurement of what this set's chase really is, and it can be wrong. Every
                preview sharpens it. Nothing you do now can change the print run — it locked at
                the commit, and that is the whole shape of the bet.
              </div>
            </div>

            <div style={{ ...label, padding: '16px 16px 6px' }}>WHAT YOU CAN STILL DO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.rule }}>
              <LeverRow name="Schedule the reveal" cost="Attention"
                note={`${hype.cardsRevealed} shown so far, every ${hype.cadence} weeks`}
                onClick={() => open('reveal')} />
              <LeverRow name="Spend on marketing" cost={money(hype.marketingSpend)}
                note="Logarithmic in the TOTAL spent on this set. The second million buys much less than the first."
                onClick={() => open('marketing')} />
              <LeverRow name="Open preorders"
                cost={set.preorders ? `${set.preorders.units.toLocaleString()} taken` : 'Not open'}
                note="A promise. Break it and the goodwill goes with it."
                onClick={() => open('preorders')} />
              <LeverRow name="Host a prerelease" cost={money(cfg.hype.prereleaseCostPerScale)}
                note={lgs?.unlocked
                  ? 'Goodwill paid for in cash — the exact counterweight to a direct-store drop.'
                  : 'Needs the LGS network.'}
                disabled={!lgs?.unlocked} onClick={() => open('prerelease')} />
            </div>

            {set.preorders && set.preorders.unfilled > 0 && (
              <Note tone="bad">
                {set.preorders.unfilled.toLocaleString()} preorders you could not fill. That is a
                promise the studio broke, and the audience remembers it.
              </Note>
            )}
          </>
        )}

        {/* ---------- released: what actually happened ---------- */}
        {perf && (
          <>
            <StatRow cols={2}>
              <Stat label="Revenue" value={money(perf.revenue)} tone="go"
                sub={`against ${money(set.actualCost)} of cost`} />
              <Stat label="Sell-through" value={pct(sellThrough)}
                tone={sellThrough > 0.6 ? 'go' : 'bad'}
                sub={`${unsold.toLocaleString()} still in the warehouse`} />
            </StatRow>
            <StatRow cols={3}>
              <Stat label="Chase" value={perf.chaseIndex.toFixed(2)} />
              <Stat label="Aftermarket" value={aftermarketIndex(s, set).toFixed(2)} />
              <Stat label="Goodwill" value={perf.goodwillDelta.toFixed(3)}
                tone={perf.goodwillDelta >= 0 ? 'go' : 'bad'} />
            </StatRow>

            {hype && hype.levelAtRelease !== null && (
              <div style={{ padding: '12px 16px 0' }}>
                <div style={label}>THE SIGNAL, SCORED</div>
                <div style={{ display: 'flex', gap: 18, marginTop: 5 }}>
                  <div><div style={micro}>IT SAID</div>
                    <div style={{ ...num, fontSize: 16 }}>{hype.signal.toFixed(2)}</div></div>
                  <div><div style={micro}>IT WAS</div>
                    <div style={{ ...num, fontSize: 16, color: C.note }}>{perf.chaseIndex.toFixed(2)}</div></div>
                  <div><div style={micro}>HYPE AT LAUNCH</div>
                    <div style={{ ...num, fontSize: 16 }}>{hype.levelAtRelease.toFixed(2)}</div></div>
                </div>
              </div>
            )}

            <div style={{ ...label, padding: '16px 16px 6px' }}>WHERE IT SOLD</div>
            {Object.entries(perf.sellThroughByChannel).length === 0
              ? <Empty>No channel has reported yet.</Empty>
              : <div style={{ padding: '0 16px' }}>
                  {Object.entries(perf.sellThroughByChannel).map(([cid, v], i) => (
                    <div key={cid} style={{ marginBottom: 9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', ...micro }}>
                        <span>{(s.channels[cid as never]?.name ?? cid).toUpperCase()}</span>
                        <span>{pct(v)}</span>
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <AllocationBar total={1} height={8}
                          segments={[{ label: cid, units: v, color: seriesColor(i) }]} />
                      </div>
                    </div>
                  ))}
                </div>}

            {canEvent && (
              <div style={{ padding: '14px 16px 0' }}>
                <Button tone="quiet" onClick={() => open('event')}>Host organised play</Button>
              </div>
            )}
          </>
        )}
        <div style={{ height: 28 }} />
      </Scroll>

      {/* ---------- the lever sheets ---------- */}
      <Sheet open={lever !== null} onClose={() => setLever(null)} title={
        lever === 'reveal' ? 'Schedule the reveal'
        : lever === 'marketing' ? 'Marketing spend'
        : lever === 'preorders' ? 'Open preorders'
        : lever === 'prerelease' ? 'Host a prerelease'
        : 'Organised play'}>
        <div style={{ padding: '13px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lever === 'reveal' && <>
            <div style={label}>START IN</div>
            <Slider value={n} onChange={setN} min={0}
              max={Math.max(1, (home?.releaseTick ?? s.tick + 18) - s.tick)}
              format={v => `${v} weeks`} />
            <div style={label}>A PREVIEW EVERY</div>
            <Slider value={cadence} onChange={setCadence} min={1} max={8} format={v => `${v} weeks`} />
            <Note>
              Each preview costs the audience's attention and buys hype with diminishing returns —
              and it sharpens the signal, which is the part worth paying for. The free window is
              one preview; a long campaign is sixteen.
            </Note>
            <Button onClick={() => {
              commit(st => { api.scheduleReveal(st, setId, (st.tick + n) as never, cadence); });
              setLever(null);
            }}>Set the schedule</Button>
          </>}

          {lever === 'marketing' && <>
            <Slider value={n} onChange={setN} min={0} max={Math.max(0, pub.cash)}
              step={10_000_00} format={v => money(v)} />
            <div style={{ border: `1px solid ${C.rule}`, background: C.raised }}>
              <Row left="Already spent on this set" right={money(hype?.marketingSpend ?? 0)} />
              <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
              <Row left="After this" right={money((hype?.marketingSpend ?? 0) + n)} strong />
            </div>
            <Note>
              Hype MULTIPLIES the demand a set would have had. It cannot conjure demand a set does
              not have — a campaign on a set nobody wants is still nearly nothing.
            </Note>
            <Button disabled={n <= 0} onClick={() => {
              commit(st => { api.marketingSpend(st, setId, asCents(n)); });
              setLever(null);
            }}>Spend {money(n)}</Button>
          </>}

          {lever === 'preorders' && <>
            <div style={label}>CAP</div>
            <Slider value={n} onChange={setN} min={500} max={200000} step={500}
              format={v => `${v.toLocaleString()} units`} />
            <Note tone="bad">
              A preorder you cannot fill is a promise you broke, and the goodwill cost lands on
              everyone who was waiting. Cap it at what you are certain will exist.
            </Note>
            <Button onClick={() => {
              commit(st => { api.openPreorders(st, setId, n); });
              setLever(null);
            }}>Open the book at {n.toLocaleString()}</Button>
          </>}

          {lever === 'prerelease' && <>
            <div style={label}>SCALE</div>
            <Slider value={n} onChange={setN} min={1} max={12}
              format={v => `${v} · ${money(v * cfg.hype.prereleaseCostPerScale)}`} />
            <Note>
              A drop through your own store is full margin paid for in goodwill. A prerelease is
              the mirror of it: goodwill paid for in cash, through the stores that earn it fastest.
            </Note>
            <Button disabled={pub.cash < n * cfg.hype.prereleaseCostPerScale} onClick={() => {
              commit(st => { api.hostPrerelease(st, setId, n, asCents(n * cfg.hype.prereleaseCostPerScale)); });
              setLever(null);
            }}>Run it for {money(n * cfg.hype.prereleaseCostPerScale)}</Button>
          </>}

          {lever === 'event' && <>
            <div style={label}>SCALE</div>
            <Slider value={n} onChange={setN} min={1} max={cfg.events.maxScale}
              format={v => `${v} · ${money(v * cfg.events.costPerScale)}`} />
            <Note>
              Organised play on a shipped set: goodwill, a warmer LGS, and a promo printing that
              exists nowhere else. {cfg.events.promoCopiesPerScale * n} copies at this scale.
            </Note>
            <Button disabled={pub.cash < n * cfg.events.costPerScale} onClick={() => {
              commit(st => { api.hostEvent(st, setId, n, asCents(n * cfg.events.costPerScale)); });
              setLever(null);
            }}>Host for {money(n * cfg.events.costPerScale)}</Button>
          </>}
          <div style={{ height: 16 }} />
        </div>
      </Sheet>
    </Screen>
  );
}

function LeverRow({ name, cost, note, onClick, disabled }: {
  name: string; cost: string; note: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button className="pressable" type="button" onClick={onClick} disabled={disabled} style={{
      display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left',
      padding: '11px 16px', background: C.panel, border: 'none', cursor: disabled ? 'default' : 'pointer',
      color: disabled ? C.dim : C.ink, fontFamily: 'inherit', opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</span>
        <span style={{ ...num, fontSize: 11.5, color: C.muted }}>{cost}</span>
      </div>
      <span style={{ fontSize: 11, lineHeight: 1.35, color: C.muted }}>{note}</span>
    </button>
  );
}
