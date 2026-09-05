/**
 * Channel traits, capacity, and the default allocation split.
 *
 * The per-kind numbers live in `config.channels.traits` rather than on
 * `Channel`, so `SimState` stays small and serializable. Anything a player can
 * tune or sour — relationship, capacity, margin — stays on the entity.
 *
 * Shapes follow CONCEPT.md §6.5: the LGS is small and loyal and marks up hot
 * product freely, the distributor is volume at a thin margin and sours fastest,
 * the big box has reach and holds the line at MSRP, online floats both ways,
 * and the direct store keeps the whole margin.
 */
import type {
  SimState, Channel, ChannelId, ChannelKind, Product, PublisherId, Cents,
} from './types.ts';
import { audienceScale } from './audience.ts';

export interface ChannelKindTraits {
  /** Demand weight per allocated unit. Reach, not capacity. */
  reach: number;
  /** How far street price floats above MSRP as stock gets tight. */
  markupSensitivity: number;
  /** How far street price floats below MSRP as stock goes stale. */
  discountFloor: number;
  /** Demand response to `streetPrice / msrp`. Higher = shoppers walk sooner. */
  priceElasticity: number;
  /** Goodwill earned per unit of sell-through. The LGS is the goodwill engine. */
  goodwillPerSellThrough: number;
  /** How hard unsold allocation sours the relationship. */
  strainSensitivity: number;
}

export function traitsFor(s: SimState, ch: Channel): ChannelKindTraits {
  return s.config.channels.traits[ch.kind];
}

/** Channels this publisher can ship to right now. */
export function unlockedChannels(s: SimState, publisherId: PublisherId): Channel[] {
  const pub = s.publishers[publisherId];
  if (!pub) return [];
  const out: Channel[] = [];
  for (const id of pub.unlocks.channels) {
    const ch = s.channels[id];
    if (ch && ch.unlocked) out.push(ch);
  }
  return out;
}

/**
 * How much this channel will actually take of one product. A soured
 * relationship costs allocation capacity, which is the mechanism behind the
 * "collapsing back to LGS-only volume" failure state in CONCEPT.md §7.
 */
export function effectiveCapacity(s: SimState, ch: Channel): number {
  const floor = s.config.channels.capacityFloor;
  // Scale-coupled. A shelf holds what the market in front of it will buy, so a
  // market that has grown thirty times over is thirty times the shelf. Without
  // this the whole channel tree is a hard wall the growth arc hits around year
  // 30, and everything printed past it goes straight to the warehouse.
  return Math.floor(
    ch.capacityUnits * audienceScale(s) * (floor + (1 - floor) * ch.relationship));
}

export function allocatedUnits(p: Product): number {
  let n = 0;
  for (const a of Object.values(p.allocations)) n += a.units;
  return n;
}

export function remainingUnits(p: Product): number {
  let n = 0;
  for (const a of Object.values(p.allocations)) n += a.unitsRemaining;
  return n;
}

/**
 * Release-time fallback for a product the player never allocated: split it
 * across the unlocked channels by effective capacity, at MSRP. Anything that
 * does not fit stays in the warehouse — printing past your channel reach is
 * supposed to hurt.
 */
export function autoAllocate(s: SimState, p: Product, publisherId: PublisherId): void {
  const channels = unlockedChannels(s, publisherId).filter(ch => ch.regionId === p.regionId);
  if (channels.length === 0) return;

  const caps = channels.map(ch => effectiveCapacity(s, ch));
  const totalCap = caps.reduce((a, b) => a + b, 0);
  if (totalCap <= 0) return;

  let left = p.unitsPrinted;
  for (let i = 0; i < channels.length && left > 0; i++) {
    const ch = channels[i]!;
    const share = Math.floor(p.unitsPrinted * (caps[i]! / totalCap));
    const units = Math.min(left, caps[i]!, share);
    if (units < ch.minimumOrder) continue;
    p.allocations[ch.id] = {
      units, unitsRemaining: units, streetPrice: p.msrp, soldOutTick: null,
    };
    ch.lastAllocatedTick = s.tick;
    left -= units;
  }
  p.unitsRemaining = remainingUnits(p);
}

/** Cash cost to unlock a channel, from config. */
export function unlockCost(s: SimState, ch: Channel): Cents {
  return s.config.channels.unlockCost[ch.kind];
}

export const CHANNEL_IDS = {
  lgs: 'ch_lgs' as ChannelId,
  distributor: 'ch_dist' as ChannelId,
  bigbox: 'ch_bigbox' as ChannelId,
  online: 'ch_online' as ChannelId,
  direct: 'ch_direct' as ChannelId,
};
