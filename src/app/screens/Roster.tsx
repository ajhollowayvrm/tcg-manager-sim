/**
 * The character roster, and the screen that adds to it.
 *
 * The roster shows a READING, never `ip.affection`. `readingText` below is the
 * pre-kit renderer and is due to be replaced by `ReadingValue`, which enforces
 * the same contract in one place for every screen.
 */
import { useState } from 'react';
import type { SimState, IpId, Archetype } from '../../sim/types.ts';
import { api } from '../../sim/engine.ts';
import { readAffection, displayTier } from '../../sim/readings.ts';
import {
  C, MONO, num, label, micro, Screen, Scroll, Header, Button, Field, Stepper, Note, Empty,
} from '../ui.tsx';
import { yearOf } from '../format.ts';
import { commit, forgetCharacter } from '../store.ts';
import { ARCHETYPES } from '../setdesign.ts';

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
// --- studio: roster --------------------------------------------------------

export function Roster({ s, onNew }: { s: SimState; onNew: () => void }) {
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
        // Archetype and age come off the entity now, not off the app-side map.
        const age = ip.baseAge > 0 ? ip.baseAge + Math.floor((s.tick - ip.createdTick) / 52) : 0;
        return (
          <div key={ip.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 42px 40px 30px', gap: 8, alignItems: 'center',
            padding: '9px 18px', borderTop: `1px solid ${C.rule}`, background: C.panel,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16, letterSpacing: '0.01em' }}>{ip.name}</div>
              <div style={{ ...micro, letterSpacing: '0.07em' }}>
                {(ip.archetype !== 'none' ? ip.archetype : ip.kind).toUpperCase()}{age > 0 ? ` · ${age}` : ''}
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
export function NewCharacter({ s, onDone, onBack }: { s: SimState; onDone: () => void; onBack: () => void }) {
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
              The archetype names the prior your character is rolled from — you choose the
              distribution, never the result. The six ranges are identical until the table is
              fitted, so today the bet is the same shape whichever you pick.
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 18px 34px' }}>
          <Button disabled={!name.trim()} onClick={() => {
            commit(st => {
              api.createIp(st, name.trim(), 'character', {
                archetype: arch.toLowerCase() as Archetype, baseAge: age,
              });
            });
            onDone();
          }}>Create {name.trim() || 'character'}</Button>
        </div>
      </Scroll>
    </Screen>
  );
}