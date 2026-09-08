/**
 * The people you pay: artists, licensors, and the creators who cover you.
 *
 * **`Artist.growth` is hidden and must stay hidden.** It is the whole scouting
 * gamble — reputation is the visible, priced half and growth is the free,
 * hidden half — and a visible growth number turns a bet into a sort. The
 * measured check is that scouting beats safe hands on top card in about half of
 * seeds; if it ever won them all, the gamble would have leaked.
 *
 * `Artist.specialty` is rolled and read by nothing, so this screen does not
 * filter on it. It gains a consumer when the art director lands.
 */
import { useState } from 'react';
import type { SimState, ArtistId, CardId, ArtistTerms, SetId } from '../../sim/types.ts';
import { api, collabOfferFactor } from '../../sim/engine.ts';
import {
  C, MONO, num, label, micro, Button, Note, Empty, Sheet, Slider, Stat, StatRow,
  Row, Tabs, selectStyle, pillBtn,
} from '../ui.tsx';
import { Sparkline } from '../chart.tsx';
import { money, stamp, untilText, pct } from '../format.ts';
import { commit } from '../store.ts';

// --- artists ---------------------------------------------------------------

const TERMS: Array<{ t: ArtistTerms; name: string; note: string }> = [
  { t: 'perCard', name: 'Per card', note: 'No standing bill. They can turn a brief down.' },
  { t: 'retainer', name: 'Retainer', note: 'A weekly fee. Cheaper briefs, and they always say yes.' },
  { t: 'exclusive', name: 'Exclusive', note: 'The most expensive week, the cheapest brief, nobody else gets them.' },
];

export function Artists({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  const [sort, setSort] = useState<'Reputation' | 'Rate' | 'Speed'>('Reputation');
  const [open, setOpen] = useState<ArtistId | null>(null);
  const [budget, setBudget] = useState(0);
  if (!pub) return null;

  const cfg = s.config.art;
  const roster = Object.values(s.artists)
    .filter(a => a.available && (a.exclusiveTo === null || a.exclusiveTo === s.playerId))
    .sort((a, b) => sort === 'Rate' ? a.rate - b.rate
      : sort === 'Speed' ? a.turnaroundWeeks - b.turnaroundWeeks
      : b.reputation - a.reputation)
    .slice(0, 60);

  const artist = open ? s.artists[open] : null;
  const held = artist ? pub.retainers[artist.id] : undefined;
  // Cards still waiting on art, in a set that has not shipped.
  const pending = Object.values(s.cards).filter(c => {
    if (c.artSource !== 'pending' || c.publisherId !== s.playerId) return false;
    const set = Object.values(s.sets).find(x => x.cardIds.includes(c.id));
    return set !== undefined && set.status !== 'released' && set.status !== 'archived';
  });
  const [card, setCard] = useState<CardId | ''>('');

  const standing = artist
    ? artist.relationship + pub.brandStanding * cfg.brandStandingOffsetsRelationship
    : 0;
  const willAccept = artist ? (!!held || standing >= cfg.minRelationshipToAccept) : false;
  const discount = held?.terms === 'exclusive' ? cfg.exclusiveFeeDiscount
    : held?.terms === 'retainer' ? cfg.retainerFeeDiscount : 0;
  const fee = Math.max(1, Math.round(budget * (1 - discount)));

  return (
    <>
      <Tabs tabs={['Reputation', 'Rate', 'Speed'] as const} value={sort} onChange={setSort} />
      {Object.keys(pub.retainers).length > 0 && (
        <div style={{ ...micro, padding: '9px 16px 0', color: C.note }}>
          {Object.values(pub.retainers).length} ON THE BOOKS ·{' '}
          {money(Object.values(pub.retainers).reduce((n, r) => n + r.weeklyFee, 0))} A WEEK
        </div>
      )}
      {roster.map(a => {
        const r = pub.retainers[a.id];
        return (
          <button key={a.id} onClick={() => { setOpen(a.id); setBudget(a.rate); setCard(''); }} style={{
            display: 'grid', width: '100%', gridTemplateColumns: '1fr 62px auto', gap: 9,
            alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${C.rule}`,
            background: C.panel, border: 'none', borderTopStyle: 'solid', color: C.ink,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{a.name}</div>
              <div style={micro}>
                {money(a.rate)} · {a.turnaroundWeeks}W
                {r ? ` · ${r.terms.toUpperCase()}` : ''}
                {a.exclusiveTo === s.playerId ? ' · YOURS' : ''}
              </div>
            </div>
            <Sparkline points={a.reputationHistory.points} color={C.note} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...num, fontSize: 13 }}>{a.reputation.toFixed(2)}</div>
              <div style={micro}>REP</div>
            </div>
          </button>
        );
      })}
      <div style={{ padding: '13px 16px 20px', fontSize: 11, lineHeight: 1.45, color: C.dim }}>
        Reputation is the half you can see and the half you pay for. Whether an artist gets
        better is not on this screen and never will be — that is the bet.
      </div>

      <Sheet open={artist !== null} onClose={() => setOpen(null)} title={artist?.name ?? ''}>
        {artist && (
          <div style={{ padding: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>
            <StatRow cols={3}>
              <Stat label="Rate" value={money(artist.rate)} />
              <Stat label="Turnaround" value={`${artist.turnaroundWeeks}w`} />
              <Stat label="Bond" value={artist.relationship.toFixed(2)}
                tone={willAccept ? 'go' : 'bad'} />
            </StatRow>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', ...micro }}>
              <span>LINE {artist.stats.linework.toFixed(2)}</span>
              <span>COLOUR {artist.stats.color.toFixed(2)}</span>
              <span>COMP {artist.stats.composition.toFixed(2)}</span>
              <span>SPEED {artist.stats.speed.toFixed(2)}</span>
              <span>RELIABLE {artist.stats.reliability.toFixed(2)}</span>
            </div>

            <div style={{ ...label }}>TERMS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {TERMS.map(t => {
                const on = (held?.terms ?? 'perCard') === t.t;
                const weekly = t.t === 'perCard' ? 0
                  : artist.rate * (t.t === 'exclusive' ? cfg.exclusiveWeeklyMultiple : cfg.retainerWeeklyMultiple);
                return (
                  <button key={t.t} onClick={() => commit(st => { api.hireArtist(st, artist.id, t.t); })}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 11px',
                      textAlign: 'left', background: C.panel, borderRadius: 2, cursor: 'pointer',
                      border: on ? `2px solid ${C.go}` : `1px solid ${C.rule}`,
                      color: C.ink, fontFamily: 'inherit',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                      {weekly > 0 && <span style={{ ...num, fontSize: 12, color: C.bad }}>{money(weekly)}/wk</span>}
                    </div>
                    <span style={{ fontSize: 11, lineHeight: 1.35, color: C.muted }}>{t.note}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ ...label, marginTop: 4 }}>COMMISSION A CARD</div>
            {pending.length === 0
              ? <Empty>No card is waiting on art. Design a set first.</Empty>
              : <>
                  <select value={card} onChange={e => setCard(e.target.value as CardId)} style={selectStyle}>
                    <option value="">Pick a card…</option>
                    {pending.slice(0, 200).map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.id} · {c.rarity}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', ...micro }}>
                      <span>BRIEF BUDGET</span>
                      <span>{budget >= artist.rate ? 'AT OR OVER THEIR RATE' : 'UNDER THEIR RATE'}</span>
                    </div>
                    <Slider value={budget} onChange={setBudget} min={0} max={artist.rate * 4}
                      step={Math.max(100, Math.round(artist.rate / 20))} format={v => money(v)} />
                  </div>
                  <div style={{ border: `1px solid ${C.rule}`, background: C.raised }}>
                    <Row left="You pay now" right={money(fee)} strong />
                    {discount > 0 && <>
                      <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
                      <Row left={`${held!.terms} discount`} right={`−${pct(discount)}`} />
                    </>}
                  </div>
                  <Note tone={willAccept ? 'note' : 'bad'}>
                    {willAccept
                      ? 'Paying over the rate buys a better result, with diminishing returns. Paying under is not a discount — it is a worse brief.'
                      : 'They will not take your call yet. An artist weighs their bond with you plus your brand standing; you have neither.'}
                  </Note>
                  <Button disabled={!card || !willAccept || pub.cash < fee}
                    onClick={() => {
                      commit(st => { api.commissionArt(st, card as CardId, artist.id, { budget: fee as never }); });
                      setOpen(null);
                    }}>
                    {pub.cash < fee ? 'Cannot afford' : `Commission for ${money(fee)}`}
                  </Button>
                  <div style={{ fontSize: 11, lineHeight: 1.4, color: C.dim }}>
                    The money leaves when the brief is placed, not when the art lands. A late
                    illustration is abandoned at release and the card ships as house work — that
                    is what missing the calendar costs.
                  </div>
                </>}
            <div style={{ height: 14 }} />
          </div>
        )}
      </Sheet>
    </>
  );
}

// --- licensing -------------------------------------------------------------

export function Licensing({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<SetId | ''>('');
  if (!pub) return null;

  const offers = Object.values(s.collabs).filter(
    c => !c.signedTick && c.expiresTick !== null && c.expiresTick > s.tick);
  const signed = Object.values(s.collabs).filter(c => c.signedTick);
  const designSets = Object.values(s.sets)
    .filter(x => x.publisherId === s.playerId && x.status === 'design' && !x.collabId);
  const collab = open ? s.collabs[open as never] : null;

  return (
    <>
      <Note>
        A licensor's audience came for the licensor, so a collab returns only part of the usual
        exposure to your own characters. That is the rent, and it is the only cost beyond the fee.
      </Note>
      <div style={{ ...label, padding: '13px 16px 4px' }}>ON THE TABLE</div>
      {offers.length === 0 && <Empty>Nobody is offering. Offers arrive on their own; brand standing decides which.</Empty>}
      {offers.map(c => {
        const met = pub.brandStanding >= c.requiredBrandStanding;
        return (
          <button key={c.id} onClick={() => { setOpen(c.id); setTarget(designSets[0]?.id ?? ''); }} style={{
            display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            padding: '11px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
            border: 'none', borderTopStyle: 'solid', color: C.ink, cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{c.name}</div>
              <div style={{ ...micro, color: met ? C.dim : C.bad }}>
                {met ? `EXPIRES IN ${untilText(s.tick, c.expiresTick!)}` : `NEEDS STANDING ${c.requiredBrandStanding.toFixed(2)}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...num, fontSize: 13, color: C.bad }}>{money(c.advance)}</div>
              <div style={micro}>{pct(c.royaltyShare)} ROYALTY</div>
            </div>
          </button>
        );
      })}

      {signed.length > 0 && <>
        <div style={{ ...label, padding: '18px 16px 4px' }}>SIGNED</div>
        {signed.map(c => (
          <div key={c.id} style={{ padding: '10px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel }}>
            <div style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
            <div style={micro}>SIGNED {stamp(s, c.signedTick!)} · REACH x{collabOfferFactor(s, c).toFixed(2)}</div>
          </div>
        ))}
      </>}
      <div style={{ height: 20 }} />

      <Sheet open={collab !== null} onClose={() => setOpen(null)} title={collab?.name ?? ''}>
        {collab && (() => {
          const met = pub.brandStanding >= collab.requiredBrandStanding;
          const afford = pub.cash >= collab.advance;
          return (
            <div style={{ padding: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ border: `1px solid ${C.rule}`, background: C.raised }}>
                <Row left="Advance, payable now" right={money(collab.advance)} strong />
                <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
                <Row left="Their share of the set" right={pct(collab.royaltyShare)} />
                <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
                <Row left="Minimum they are owed" right={money(collab.advance * s.config.collabs.minimumGuaranteeMultiple)} />
                <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
                <Row left="Segments it reaches" right={Object.values(collab.reachBonus).filter(x => x > 0).length} />
              </div>
              <Note tone="bad">
                One roll set the advance and the royalty, in opposite directions: a cheap advance
                is an expensive share. And the guarantee does not fall when nobody turns up — a
                flop still owes twice the advance.
              </Note>
              <div style={{ ...label }}>ATTACH TO</div>
              {designSets.length === 0
                ? <Empty>No set is still in design. A collab attaches before the print run locks — after that there is nothing left for the reach to change.</Empty>
                : <select value={target} onChange={e => setTarget(e.target.value as SetId)} style={selectStyle}>
                    {designSets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>}
              <Button disabled={!met || !afford || !target}
                onClick={() => {
                  commit(st => { api.signCollab(st, collab.id, target as SetId); });
                  setOpen(null);
                }}>
                {!met ? 'They have not heard of you' : !afford ? 'Cannot afford the advance' : `Sign for ${money(collab.advance)}`}
              </Button>
              <div style={{ height: 14 }} />
            </div>
          );
        })()}
      </Sheet>
    </>
  );
}

// --- creators --------------------------------------------------------------

export function Creators({ s }: { s: SimState }) {
  const creators = Object.values(s.creators).sort((a, b) => b.audienceSize - a.audienceSize);
  const covered = s.events.slice(-4000).filter(e => e.kind === 'creatorOpened');
  return (
    <>
      <Note>
        You cannot pay a creator and you cannot brief one. They cover what they find interesting,
        and how often depends on how much fresh product there is and how well they know you.
      </Note>
      {creators.length === 0 && <Empty>Nobody is covering this hobby yet.</Empty>}
      {creators.map(c => (
        <div key={c.id} style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
          padding: '10px 16px', borderTop: `1px solid ${C.rule}`, background: C.panel,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{c.name}</div>
            <div style={micro}>
              {c.audienceSize.toLocaleString()} VIEWERS · INFLUENCE {c.influence.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...num, fontSize: 13, color: c.relationship > 0.4 ? C.go : C.muted }}>
              {c.relationship.toFixed(2)}
            </div>
            <div style={micro}>BOND</div>
          </div>
        </div>
      ))}
      <div style={{ ...micro, padding: '12px 16px 24px', color: C.dim }}>
        {covered.length} OPENINGS COVERED IN RECENT MEMORY
      </div>
    </>
  );
}
