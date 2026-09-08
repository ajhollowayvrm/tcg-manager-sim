/** The unlock tree, as the studio has bought it so far. */
import type { SimState } from '../../sim/types.ts';
import { C, num } from '../ui.tsx';

// --- studio: growth --------------------------------------------------------

export function Growth({ s }: { s: SimState }) {
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