/**
 * The growth shop.
 *
 * CONCEPT.md §9's progression tree, and the six unlocks in it were unreachable
 * until now: the screen listed what the studio already owned and said in its
 * own text that buying was "not wired into this build".
 *
 * Every gate shown here comes from `unlockOffers`, which computes them from the
 * same conditions `purchaseTier` enforces. The screen does not restate a single
 * one — three of them read a live distributor relationship or a count of sets
 * that made their cost back, and a screen-side copy would drift the first time
 * a gate moved.
 */
import type { SimState } from '../../sim/types.ts';
import { api, unlockOffers, type UnlockOffer } from '../../sim/engine.ts';
import { unlockedChannels, unlockCost } from '../../sim/channels.ts';
import { C, MONO, num, label, micro, Button, Note, Gate, Empty } from '../ui.tsx';
import { money } from '../format.ts';
import { commit } from '../store.ts';

function Offer({ offer, onBuy }: { offer: UnlockOffer; onBuy: () => void }) {
  const blocked = offer.gates.filter(g => !g.met);
  return (
    <div style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '11px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{offer.name}</span>
        <span style={{ ...micro, color: C.dim }}>
          {offer.maxLevel > 1 && offer.maxLevel < 99 ? `${offer.level} / ${offer.maxLevel}` : ''}
          {offer.maxLevel === 99 ? `${offer.level} OWNED` : ''}
        </span>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.4, color: C.muted, marginTop: 3 }}>{offer.blurb}</div>

      {offer.owned
        ? <div style={{ ...micro, color: C.go, marginTop: 8 }}>OWNED</div>
        : <>
            <div style={{ marginTop: 8, border: `1px solid ${C.rule}`, background: C.raised }}>
              {offer.gates.map(g => (
                <Gate key={g.label} label={g.label} met={g.met}
                  have={g.label === 'Cash' ? money(g.have) : g.have.toFixed(2)}
                  need={g.label === 'Cash' ? money(g.need) : g.need.toFixed(2)} />
              ))}
            </div>
            {offer.upkeepPerTick > 0 && (
              <div style={{ ...micro, color: C.note, marginTop: 6 }}>
                THEN {money(offer.upkeepPerTick)} EVERY WEEK, FOREVER
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Button tone="quiet" disabled={!offer.affordable} onClick={onBuy}>
                {offer.affordable
                  ? `Buy for ${money(offer.cost)}`
                  : blocked.length > 0 ? `Blocked: ${blocked[0]!.label.toLowerCase()}` : 'Cannot afford'}
              </Button>
            </div>
          </>}
    </div>
  );
}

export function Growth({ s }: { s: SimState }) {
  const pub = s.publishers[s.playerId];
  if (!pub) return null;
  const offers = unlockOffers(s, s.playerId);
  const open = new Set(unlockedChannels(s, s.playerId).map(ch => ch.id));
  // Home-region channels only. A region's own channel tree belongs on the
  // region screen, beside the market it sells into.
  const channels = Object.values(s.channels)
    .filter(ch => ch.regionId === s.homeRegionId)
    .sort((a, b) => a.requiredBrandStanding - b.requiredBrandStanding);

  return (
    <>
      <Note>
        Every tier here buys a sharper reading, never a better outcome. The measured warning
        stands: at a reserve of two print runs, a studio that buys them dies in four seeds of six.
      </Note>

      <div style={{ ...label, padding: '13px 16px 4px' }}>CAPABILITIES</div>
      {offers.map(o => (
        <Offer key={`${o.unlock}:${o.detail ?? ''}`} offer={o}
          onBuy={() => commit(st => { api.purchaseUnlock(st, o.unlock, o.detail); })} />
      ))}

      <div style={{ ...label, padding: '18px 16px 4px' }}>CHANNELS · {s.regions[s.homeRegionId]?.name}</div>
      {channels.length === 0 && <Empty>No channels in the home region.</Empty>}
      {channels.map(ch => {
        const cost = unlockCost(s, ch);
        const isOpen = open.has(ch.id);
        const brandMet = pub.brandStanding >= ch.requiredBrandStanding;
        const canBuy = !isOpen && brandMet && pub.cash >= cost;
        return (
          <div key={ch.id} style={{ borderTop: `1px solid ${C.rule}`, background: C.panel, padding: '11px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{ch.name}</span>
              <span style={{ ...micro, color: isOpen ? C.go : C.dim }}>{isOpen ? 'OPEN' : ch.kind.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, ...micro }}>
              <span>MARGIN {Math.round(ch.marginShare * 100)}%</span>
              <span>MIN ORDER {ch.minimumOrder.toLocaleString()}</span>
              {ch.queueCapacity ? <span>QUEUE {ch.queueCapacity.toLocaleString()}</span> : null}
            </div>
            {!isOpen && <>
              <div style={{ marginTop: 8, border: `1px solid ${C.rule}`, background: C.raised }}>
                <Gate label="Brand standing" met={brandMet}
                  have={pub.brandStanding.toFixed(2)} need={ch.requiredBrandStanding.toFixed(2)} />
                <Gate label="Cash" met={pub.cash >= cost} have={money(pub.cash)} need={money(cost)} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Button tone="quiet" disabled={!canBuy}
                  onClick={() => commit(st => { api.purchaseUnlock(st, 'channels', ch.id); })}>
                  {canBuy ? `Open for ${money(cost)}`
                    : !brandMet ? 'They have not heard of you' : 'Cannot afford'}
                </Button>
              </div>
            </>}
          </div>
        );
      })}
      <div style={{ padding: '14px 16px 8px', fontSize: 11, lineHeight: 1.45, color: C.dim }}>
        A channel's price is relationship money, not a licence fee. The direct store is the one
        you build rather than persuade, and it is the only shelf that keeps the whole margin.
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}
