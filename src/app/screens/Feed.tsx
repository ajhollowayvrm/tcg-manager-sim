/**
 * What the world did while the clock ran.
 *
 * Two constraints shape this file.
 *
 * **Events store data, not prose.** That is a rule of the engine, so the
 * sentence is the UI's job. `SAY` below writes one per kind from the event's
 * own `data`, and every one of the 43 kinds is accounted for.
 *
 * **The feed cannot be "render the array".** A 50-year run holds 142,596
 * events. The list is virtualised and the query is windowed by kind — see
 * `docs/screens-audit.md` §7, which measured it.
 *
 * `interrupts` is the sim's own judgement about what deserves attention, and it
 * is doing real work: measured over 30 years it flags 0.8% of events, about
 * sixteen stops a year. Those get weight here; the rest scroll.
 */
import { useMemo, useState } from 'react';
import type { SimState, SimEvent } from '../../sim/types.ts';
import { C, MONO, micro, Tabs, Empty } from '../ui.tsx';
import { VirtualList } from '../list.tsx';
import { money, stamp } from '../format.ts';

type Group = 'All' | 'Stops' | 'Market' | 'Sets' | 'Art' | 'Business' | 'People';

const GROUPS: Record<Exclude<Group, 'All' | 'Stops'>, string[]> = {
  Market: ['priceSpike', 'priceCrash', 'newGrail', 'vintageSpike', 'setRediscovered',
    'characterResurgence', 'speculatorSwing', 'errorDiscovered', 'sealedSqueeze',
    'scalperCrash', 'graderEnteredMarket'],
  Sets: ['setReleased', 'setSoldOut', 'setUnsold', 'dropScheduled', 'dropSoldOut',
    'dropUndersold', 'preordersTaken', 'preordersFilled', 'eventHosted'],
  Art: ['artCommissioned', 'artDelivered', 'artMissedRelease', 'artistSigned',
    'artistRetired', 'artistArrived', 'artistBreakout', 'artistOffer'],
  Business: ['channelStrained', 'channelLost', 'channelUnlocked', 'unlockPurchased',
    'debtWarning', 'studioDead', 'regionUnlocked'],
  People: ['communitySentiment', 'fatigueWarning', 'creatorOpened', 'collabOffer',
    'collabOffered', 'collabSigned', 'collabExpired', 'collabGuaranteeCalled'],
};

const n = (v: unknown): string =>
  typeof v === 'number' ? Math.round(v).toLocaleString() : String(v ?? '');
const cash = (v: unknown): string => typeof v === 'number' ? money(v) : '—';

/** One sentence per kind, written from the event's own data. All 43. */
const SAY: Record<string, (d: Record<string, unknown>) => string> = {
  // market
  priceSpike: d => `A card jumped to ${cash(d.price)}.`,
  priceCrash: d => `A card fell back to ${cash(d.price)}.`,
  newGrail: d => `Somebody's card is worth ${cash(d.price)} now. That is a grail.`,
  vintageSpike: d => `An old printing is running — ${cash(d.price)} and climbing.`,
  setRediscovered: () => 'People have started going back through an old set.',
  characterResurgence: () => 'A character nobody had mentioned in years is being talked about again.',
  speculatorSwing: d => `The speculators moved, ${n(d.crowd)} of them.`,
  errorDiscovered: d => `Someone found a ${String(d.kind ?? 'misprint')}. It was always there.`,
  sealedSqueeze: () => 'Sealed product is getting hard to find.',
  scalperCrash: () => 'The scalpers dumped their stock and the price went with it.',
  graderEnteredMarket: () => 'A new grading company has opened its doors.',
  // sets
  setReleased: d => `${String(d.name ?? 'A set')} is out.`,
  setSoldOut: () => 'A set has sold through everything you printed.',
  setUnsold: d => `${n(d.units)} units are sitting in the warehouse.`,
  dropScheduled: d => `A drop of ${n(d.units)} is booked.`,
  dropSoldOut: d => `The drop went in one pass. ${n(d.toScalpers)} went to scalpers.`,
  dropUndersold: d => `The drop did not clear — ${n(d.unsold)} left over.`,
  preordersTaken: d => `${n(d.units)} preorders taken.`,
  preordersFilled: d => `Preorders filled${d.unfilled ? `, ${n(d.unfilled)} of them broken` : ''}.`,
  eventHosted: d => `You ran organised play at scale ${n(d.scale)}.`,
  // art
  artCommissioned: () => 'A brief went out to an artist.',
  artDelivered: () => 'Artwork came back.',
  artMissedRelease: d => `${n(d.cards)} cards missed their art and shipped as house work.`,
  artistSigned: d => `An artist signed on ${String(d.terms ?? 'terms')}.`,
  artistRetired: () => 'An artist has stopped taking work.',
  artistArrived: () => 'A new illustrator is looking for commissions.',
  artistBreakout: () => 'One of your artists is suddenly a name. Everything they touched is worth more.',
  artistOffer: () => 'An artist approached you.',
  // business
  channelStrained: () => 'A channel is unhappy with what you sent them.',
  channelLost: () => 'A channel has stopped carrying you.',
  channelUnlocked: d => `You are in with ${String(d.kind ?? 'a new channel')}.`,
  unlockPurchased: d => `Bought: ${String(d.note ?? 'an upgrade')}, ${cash(d.cost)}.`,
  debtWarning: d => `The bank covered you. Debt is ${cash(d.debt)}.`,
  studioDead: d => `The studio is finished. Cause: ${String(d.cause ?? 'unknown')}.`,
  regionUnlocked: () => 'A new market is open. It ships nothing for six months.',
  // people
  communitySentiment: () => 'The community has an opinion about you this week.',
  fatigueWarning: () => 'You are releasing faster than anyone can keep up with.',
  creatorOpened: () => 'A creator opened your product on camera.',
  collabOffer: () => 'A licensor is interested.',
  collabOffered: () => 'A licensing offer arrived.',
  collabSigned: () => 'You signed the licence.',
  collabExpired: () => 'A licensing offer expired unanswered.',
  collabGuaranteeCalled: d => `The licensor called in their guarantee: ${cash(d.amount)}.`,
};

/**
 * The sentence for one event, or its raw kind when no line is written for it.
 *
 * Exported because the feed is not the only screen that shows events. The stop
 * dialog in `App.tsx` renders the same objects, and it printed `e.kind` — so a
 * licensing offer reached the player as the string `collabOffered`. One reader
 * per table keeps that from happening again for the other 42 kinds.
 */
export function say(e: { kind: string; data: unknown }): string {
  const line = SAY[e.kind];
  return line ? line(e.data as Record<string, unknown>) : e.kind;
}

export function Feed({ s }: { s: SimState }) {
  const [group, setGroup] = useState<Group>('All');

  const rows = useMemo(() => {
    // Windowed by kind and bounded in length. The full log is not renderable.
    const kinds = group === 'All' || group === 'Stops' ? null : new Set(GROUPS[group]);
    const out: SimEvent[] = [];
    for (let i = s.events.length - 1; i >= 0 && out.length < 3000; i--) {
      const e = s.events[i]!;
      if (group === 'Stops' && !e.interrupts) continue;
      if (kinds && !kinds.has(e.kind)) continue;
      out.push(e);
    }
    return out;
  }, [s, s.tick, s.events.length, group]);

  return (
    <>
      <Tabs tabs={['All', 'Stops', 'Market', 'Sets', 'Art', 'Business', 'People'] as const}
        value={group} onChange={setGroup} />
      <VirtualList items={rows} rowHeight={54}
        empty="Nothing under this heading yet. Press Continue."
        render={e => {
          return (
            <div style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
              height: 54, padding: '0 16px', borderTop: `1px solid ${C.rule}`,
              background: e.interrupts ? C.raised : C.panel,
            }}>
              <div style={{
                fontSize: 12.5, lineHeight: 1.3, color: e.interrupts ? C.ink : C.ink2,
                fontWeight: e.interrupts ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {say(e)}
              </div>
              <div style={micro}>
                {stamp(s, e.t)}{e.interrupts ? ' · WORTH STOPPING FOR' : ''}
              </div>
            </div>
          );
        }} />
    </>
  );
}
