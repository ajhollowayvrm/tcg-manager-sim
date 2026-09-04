/**
 * Dev-time sanity checks. Cheap on purpose — the harness runs this every
 * `--check` ticks across every seed, so it must never dominate run time.
 * Returns a list of human-readable violations; empty means clean.
 */
import type { SimState } from './types.ts';

export function checkInvariants(s: SimState): string[] {
  const bad: string[] = [];

  const pub = s.publishers[s.playerId];
  if (!pub) {
    bad.push('player publisher missing');
    return bad;
  }
  if (!Number.isFinite(pub.cash)) bad.push(`cash not finite: ${pub.cash}`);
  if (!Number.isFinite(pub.debt) || pub.debt < 0) bad.push(`debt invalid: ${pub.debt}`);
  if (pub.credit < 0 || pub.credit > 1) bad.push(`credit out of range: ${pub.credit}`);
  if (pub.brandStanding < 0 || pub.brandStanding > 1.05) bad.push(`brandStanding out of range: ${pub.brandStanding}`);

  for (const pr of Object.values(s.printings)) {
    if (!Number.isFinite(pr.market.rawPrice) || pr.market.rawPrice < 0) {
      bad.push(`printing ${pr.id} bad price: ${pr.market.rawPrice}`);
    }
    if (pr.population.sealed < 0 || pr.population.opened < 0 || pr.population.destroyed < 0) {
      bad.push(`printing ${pr.id} negative population`);
    }
  }

  for (const p of Object.values(s.products)) {
    if (p.unitsRemaining < 0 || p.unitsRemaining > p.unitsPrinted) {
      bad.push(`product ${p.id} unitsRemaining out of range: ${p.unitsRemaining}/${p.unitsPrinted}`);
    }
    if (!Number.isFinite(p.market.price) || p.market.price < 0) {
      bad.push(`product ${p.id} bad sealed price`);
    }
  }

  for (const ip of Object.values(s.ips)) {
    if (!Number.isFinite(ip.affection)) bad.push(`ip ${ip.id} affection not finite`);
    if (!Number.isFinite(ip.resurgence)) bad.push(`ip ${ip.id} resurgence not finite`);
  }

  for (const [seg, st] of Object.entries(s.audience.segments)) {
    if (st.attention < -1e-6 || st.attention > 1.0001) bad.push(`segment ${seg} attention out of range: ${st.attention}`);
    if (st.fatigue < -1e-6 || st.fatigue > 1.0001) bad.push(`segment ${seg} fatigue out of range: ${st.fatigue}`);
  }

  if (!Number.isFinite(s.market.climate)) bad.push('market climate not finite');

  return bad;
}
