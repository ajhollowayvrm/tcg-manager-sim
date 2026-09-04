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
    if (!Number.isFinite(pr.truth.chase) || pr.truth.chase <= 0) {
      bad.push(`printing ${pr.id} bad chase: ${pr.truth.chase}`);
    }
  }

  for (const p of Object.values(s.products)) {
    if (p.unitsRemaining < 0 || p.unitsRemaining > p.unitsPrinted) {
      bad.push(`product ${p.id} unitsRemaining out of range: ${p.unitsRemaining}/${p.unitsPrinted}`);
    }
    if (!Number.isFinite(p.market.price) || p.market.price < 0) {
      bad.push(`product ${p.id} bad sealed price`);
    }

    let allocated = 0;
    let allocRemaining = 0;
    for (const [cid, a] of Object.entries(p.allocations)) {
      allocated += a.units;
      allocRemaining += a.unitsRemaining;
      if (a.unitsRemaining < 0 || a.unitsRemaining > a.units) {
        bad.push(`product ${p.id} allocation ${cid} remaining out of range: ${a.unitsRemaining}/${a.units}`);
      }
      if (!Number.isFinite(a.streetPrice) || a.streetPrice <= 0) {
        bad.push(`product ${p.id} allocation ${cid} bad street price: ${a.streetPrice}`);
      }
      const ch = s.channels[cid as keyof typeof s.channels];
      if (!ch) bad.push(`product ${p.id} allocated to unknown channel ${cid}`);
      else if (!ch.unlocked) bad.push(`product ${p.id} allocated to locked channel ${cid}`);
    }
    if (allocated > p.unitsPrinted) {
      bad.push(`product ${p.id} over-allocated: ${allocated}/${p.unitsPrinted}`);
    }
    // Allocated stock is a subset of unsold stock. Anything unallocated, or
    // stranded by a lost channel, still sits in the warehouse.
    if (allocRemaining > p.unitsRemaining) {
      bad.push(`product ${p.id} allocation remainder exceeds stock: ${allocRemaining}/${p.unitsRemaining}`);
    }
  }

  for (const ch of Object.values(s.channels)) {
    if (ch.relationship < -1e-6 || ch.relationship > 1.0001) {
      bad.push(`channel ${ch.id} relationship out of range: ${ch.relationship}`);
    }
  }

  for (const ip of Object.values(s.ips)) {
    if (!Number.isFinite(ip.affection)) bad.push(`ip ${ip.id} affection not finite`);
    if (!Number.isFinite(ip.resurgence)) bad.push(`ip ${ip.id} resurgence not finite`);
  }

  for (const [seg, st] of Object.entries(s.audience.segments)) {
    if (st.attention < -1e-6 || st.attention > 1.0001) bad.push(`segment ${seg} attention out of range: ${st.attention}`);
    if (st.fatigue < -1e-6 || st.fatigue > 1.0001) bad.push(`segment ${seg} fatigue out of range: ${st.fatigue}`);
    if (st.goodwill < -1e-6 || st.goodwill > 1.0001) bad.push(`segment ${seg} goodwill out of range: ${st.goodwill}`);
  }

  for (const set of Object.values(s.sets)) {
    const h = set.hype;
    if (!h) continue;
    if (!Number.isFinite(h.level) || h.level < 0) bad.push(`set ${set.id} bad hype level: ${h.level}`);
    if (h.level > s.config.hype.ceiling + 1e-6) {
      bad.push(`set ${set.id} hype past ceiling: ${h.level}/${s.config.hype.ceiling}`);
    }
    if (!Number.isFinite(h.signal) || h.signal < 0) bad.push(`set ${set.id} bad hype signal: ${h.signal}`);
    if (h.marketingSpend < 0) bad.push(`set ${set.id} negative marketing spend: ${h.marketingSpend}`);
    // Previews come out of the set. You cannot reveal a card you did not print.
    if (h.cardsRevealed > set.cardIds.length) {
      bad.push(`set ${set.id} revealed past its size: ${h.cardsRevealed}/${set.cardIds.length}`);
    }
    if (h.cadence < 1) bad.push(`set ${set.id} bad reveal cadence: ${h.cadence}`);
  }

  for (const d of Object.values(s.drops)) {
    if (d.offered < 0) bad.push(`drop ${d.id} negative offer: ${d.offered}`);
    if (d.status === 'complete' && d.result) {
      const r = d.result;
      const sold = r.soldToCollectors + r.soldToScalpers;
      if (sold > r.offered) bad.push(`drop ${d.id} sold past its offer: ${sold}/${r.offered}`);
      if (r.soldToCollectors < 0 || r.soldToScalpers < 0) bad.push(`drop ${d.id} negative fill`);
      if (!Number.isFinite(r.demand) || r.demand < 0) bad.push(`drop ${d.id} bad demand: ${r.demand}`);
    }
    if (!s.products[d.productId]) bad.push(`drop ${d.id} references unknown product ${d.productId}`);
  }

  const scalpers = s.audience.actors.scalpers;
  if (!Number.isFinite(scalpers) || scalpers < 0) bad.push(`scalper population invalid: ${scalpers}`);
  if (!Number.isFinite(s.audience.hidden.scalperProfitability)) {
    bad.push('scalper profitability not finite');
  }
  for (const [pid, pos] of Object.entries(s.audience.hidden.scalperInventory)) {
    if (!Number.isFinite(pos.units) || pos.units <= 0) {
      bad.push(`scalper position for ${pid} invalid: ${pos.units}`);
      continue;
    }
    if (!Number.isFinite(pos.basis) || pos.basis <= 0) {
      bad.push(`scalper position for ${pid} bad basis: ${pos.basis}`);
    }
    if ((pos.openedTick as number) > s.tick) {
      bad.push(`scalper position for ${pid} opened in the future: ${pos.openedTick}`);
    }
    // Scalpers can only be holding stock that was actually printed.
    const prod = s.products[pid as keyof typeof s.products];
    if (!prod) bad.push(`scalper position for unknown product ${pid}`);
    else if (pos.units > prod.unitsPrinted) {
      bad.push(`scalper position for ${pid} exceeds print run: ${pos.units}/${prod.unitsPrinted}`);
    }
  }

  if (!Number.isFinite(s.market.climate)) bad.push('market climate not finite');

  return bad;
}
