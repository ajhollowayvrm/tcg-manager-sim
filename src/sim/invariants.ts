/**
 * Dev-time sanity checks. Cheap on purpose — the harness runs this every
 * `--check` ticks across every seed, so it must never dominate run time.
 * Returns a list of human-readable violations; empty means clean.
 */
import type { SimState } from './types.ts';
import { checkRosterCache } from './engine.ts';

export function checkInvariants(s: SimState): string[] {
  const bad: string[] = checkRosterCache(s);

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
    // Opening a pack moves a copy from sealed to opened; it cannot mint one.
    // The population is fixed at release, so the two halves must always sum to
    // the print quantity. Round 3 broke this by opening packs at the unscaled
    // rarity rate while printing at the set-size-scaled one, and nothing caught
    // it for a whole round. The 1% tolerance is float drift, nothing else.
    const alive = pr.population.sealed + pr.population.opened;
    if (alive > pr.printQuantity * 1.01 + 1) {
      bad.push(`printing ${pr.id} population past its print run: ${Math.round(alive)}/${pr.printQuantity}`);
    }

    // Graded copies are a subset of the opened population, not an extra one:
    // grading moves a copy from the raw pool into a slab.
    let graded = 0;
    for (const [gid, byTier] of Object.entries(pr.population.graded)) {
      if (!s.graders[gid as keyof typeof s.graders]) {
        bad.push(`printing ${pr.id} pop report under unknown grader ${gid}`);
      }
      for (const [tier, count] of Object.entries(byTier)) {
        if (!Number.isFinite(count) || (count ?? 0) < 0) {
          bad.push(`printing ${pr.id} bad pop count ${gid}/${tier}: ${count}`);
        } else graded += count ?? 0;
      }
    }
    if (graded > pr.population.opened) {
      bad.push(`printing ${pr.id} graded past opened: ${graded}/${pr.population.opened}`);
    }
    for (const [gid, byTier] of Object.entries(pr.market.gradedPrices)) {
      for (const [tier, price] of Object.entries(byTier)) {
        if (!Number.isFinite(price) || (price ?? 0) <= 0) {
          bad.push(`printing ${pr.id} bad graded price ${gid}/${tier}: ${price}`);
        }
      }
    }
  }

  for (const sub of s.market.gradingQueue) {
    if (!s.printings[sub.printingId]) bad.push(`grading submission for unknown printing ${sub.printingId}`);
    if (!s.graders[sub.graderId]) bad.push(`grading submission to unknown grader ${sub.graderId}`);
    if (!Number.isFinite(sub.quantity) || sub.quantity < 1) {
      bad.push(`grading submission of ${sub.quantity} copies`);
    }
    if ((sub.returnsTick as number) < (sub.submittedTick as number)) {
      bad.push(`grading submission returns before it was sent: ${sub.returnsTick} < ${sub.submittedTick}`);
    }
    // A submission that is already due has not been resolved, which means the
    // return pass skipped it and the copies are stranded in the queue forever.
    if ((sub.returnsTick as number) <= s.tick) {
      bad.push(`grading submission overdue: due ${sub.returnsTick}, now ${s.tick}`);
    }
  }

  for (const g of Object.values(s.graders)) {
    if (g.reputation < 0 || g.reputation > 1) bad.push(`grader ${g.id} reputation out of range: ${g.reputation}`);
    if (g.marketShare < 0 || g.marketShare > 1) bad.push(`grader ${g.id} share out of range: ${g.marketShare}`);
    if (g.tiers.length === 0) bad.push(`grader ${g.id} has no service tiers`);
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

  for (const [rid, segs] of Object.entries(s.audience.regions)) {
    for (const [seg, st] of Object.entries(segs)) {
      const at = `${rid}/${seg}`;
      if (st.attention < -1e-6 || st.attention > 1.0001) bad.push(`segment ${at} attention out of range: ${st.attention}`);
      if (st.fatigue < -1e-6 || st.fatigue > 1.0001) bad.push(`segment ${at} fatigue out of range: ${st.fatigue}`);
      if (st.goodwill < -1e-6 || st.goodwill > 1.0001) bad.push(`segment ${at} goodwill out of range: ${st.goodwill}`);
      // The three layers are nested by definition. A breach means somebody
      // wrote one of them without the others, which silently inflates demand.
      if (!Number.isFinite(st.population) || st.population < -1e-6) bad.push(`segment ${at} bad population: ${st.population}`);
      if (!Number.isFinite(st.reached) || st.reached < -1e-6) bad.push(`segment ${at} bad reached: ${st.reached}`);
      if (!Number.isFinite(st.engaged) || st.engaged < -1e-6) bad.push(`segment ${at} bad engaged: ${st.engaged}`);
      if (st.reached > st.population * 1.0001 + 1) bad.push(`segment ${at} reached ${st.reached} exceeds population ${st.population}`);
      if (st.engaged > st.reached * 1.0001 + 1) bad.push(`segment ${at} engaged ${st.engaged} exceeds reached ${st.reached}`);
    }
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

  // The art pipeline. The failure modes worth catching are money leaving twice,
  // art arriving before it was ordered, and a released card still waiting.
  const seenCommissionCards = new Set<string>();
  for (const com of s.market.commissionQueue) {
    if ((com.returnsTick as number) < (com.placedTick as number)) {
      bad.push(`commission ${com.id} returns before it was placed`);
    }
    if ((com.placedTick as number) > s.tick) bad.push(`commission ${com.id} placed in the future`);
    // Art runs on a stride, so a commission may sit due for a tick or two. Any
    // longer and the return pass has skipped it and the money is stranded.
    if ((com.returnsTick as number) + 4 < s.tick) {
      bad.push(`commission ${com.id} overdue: due ${com.returnsTick}, now ${s.tick}`);
    }
    if (!Number.isFinite(com.fee) || com.fee < 0) bad.push(`commission ${com.id} bad fee: ${com.fee}`);
    if (seenCommissionCards.has(com.cardId)) {
      bad.push(`card ${com.cardId} has two live commissions`);
    }
    seenCommissionCards.add(com.cardId);
    if (!s.cards[com.cardId]) bad.push(`commission ${com.id} for unknown card ${com.cardId}`);
    const artist = s.artists[com.artistId];
    if (!artist) bad.push(`commission ${com.id} for unknown artist ${com.artistId}`);
    // An exclusive artist works for one studio. If that ever breaks, the
    // exclusivity fee is buying nothing.
    else if (artist.exclusiveTo !== null && artist.exclusiveTo !== com.publisherId) {
      bad.push(`commission ${com.id} placed with ${com.artistId}, exclusive to ${artist.exclusiveTo}`);
    }
  }

  for (const a of Object.values(s.artists)) {
    if (a.relationship < -1e-6 || a.relationship > 1.0001) {
      bad.push(`artist ${a.id} relationship out of range: ${a.relationship}`);
    }
    if (!Number.isFinite(a.rate) || a.rate < 0) bad.push(`artist ${a.id} bad rate: ${a.rate}`);
    if (a.turnaroundWeeks < 1) bad.push(`artist ${a.id} bad turnaround: ${a.turnaroundWeeks}`);
  }

  for (const pub of Object.values(s.publishers)) {
    for (const r of Object.values(pub.retainers)) {
      const artist = s.artists[r.artistId];
      if (!artist) { bad.push(`${pub.id} retains unknown artist ${r.artistId}`); continue; }
      if (r.terms === 'exclusive' && artist.exclusiveTo !== pub.id) {
        bad.push(`${pub.id} pays an exclusive fee for ${r.artistId}, who is not exclusive to them`);
      }
      if (!Number.isFinite(r.weeklyFee) || r.weeklyFee < 0) {
        bad.push(`${pub.id} bad retainer fee for ${r.artistId}: ${r.weeklyFee}`);
      }
    }
  }

  // A shipped card cannot still be waiting for its illustration.
  for (const set of Object.values(s.sets)) {
    if (set.status !== 'released') continue;
    for (const cardId of set.cardIds) {
      const card = s.cards[cardId];
      if (card && card.artSource === 'pending') {
        bad.push(`card ${cardId} released in ${set.id} with art still pending`);
      }
    }
  }

  if (!Number.isFinite(s.market.climate)) bad.push('market climate not finite');

  return bad;
}
