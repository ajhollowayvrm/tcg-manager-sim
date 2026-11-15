// The test rip: open packs of a set to test it (docs/design/test-rip.md; decisions P1 to P5).
//
// A test rip is a design tool. It is pure: a set and a random generator in,
// pulls out. The caller passes its own generator, so a rip never moves the
// world's random streams and changes nothing in the world (P4).

import Foundation

/// One card, in one version, that a pack gives.
public struct Pull: Sendable, Equatable {
    public let cardID: CardID
    /// The base version, or the tier version that a version outcome gives (C16).
    public let version: VersionKey
    /// The outcome that gave the card.
    public let kind: PackOutcomeKind
    /// True when the outcome comes in fewer than 1 pack in 10 (test-rip.md, section 2).
    public let hit: Bool
}

/// One card position of a pack.
public struct RipPosition: Sendable, Equatable {
    /// The slot number, from 1.
    public let slot: Int
    /// Nil when no outcome of the slot has cards.
    public let pull: Pull?
}

/// One opened pack. The positions are in slot order (P1).
public struct RippedPack: Sendable, Equatable {
    public let positions: [RipPosition]
    public var pulls: [Pull] { positions.compactMap(\.pull) }
    public var hits: [Pull] { pulls.filter(\.hit) }
}

/// One opened box (P3).
public struct RippedBox: Sendable, Equatable {
    public struct Count: Sendable, Equatable {
        public let kind: PackOutcomeKind
        public let pulled: Int
        /// The mean count in a box: the mean count in a pack, times the box size.
        public let expected: Double
    }

    public let packs: [RippedPack]
    /// One count for each outcome that can give a card, in the pack screen's order.
    public let counts: [Count]
    /// All hits of the box, rarest outcome first, then in pack order.
    public let hits: [Pull]
}

public struct TestRip: Sendable {
    /// An outcome that comes in fewer than 1 pack in this many is a hit (test-rip.md, section 2).
    public static let hitPacks = 10.0

    /// The set's pack after the empty outcomes give their odds to the other
    /// outcomes in their slot (test-rip.md, section 3). A slot with no cards at all has no outcomes.
    public let pack: PackLayout
    /// The pull rates of `pack`. The box counts and the hit rule read them, so they agree with the draw.
    public let stats: PackStats
    private let pools: [PackOutcomeKind: [(CardID, VersionKey)]]

    public init(pack source: PackLayout, ladder: RarityLadder, cards: [Card], subsets: [Subset] = []) {
        var pools: [PackOutcomeKind: [(CardID, VersionKey)]] = [:]
        for slot in source.slots {
            for outcome in slot.outcomes where pools[outcome.kind] == nil {
                pools[outcome.kind] = Self.pool(outcome.kind, ladder: ladder, cards: cards, subsets: subsets)
            }
        }
        var pack = source
        for s in pack.slots.indices {
            let live = pack.slots[s].outcomes.filter { $0.odds > 0 && !(pools[$0.kind] ?? []).isEmpty }
            let sum = live.reduce(0) { $0 + $1.odds }
            pack.slots[s].outcomes = live.map { PackOutcome(id: $0.id, kind: $0.kind, odds: $0.odds / sum * 100) }
        }
        self.pack = pack
        self.pools = pools
        stats = PackStats(pack: pack, ladder: ladder, cards: cards, subsets: subsets)
    }

    /// True when the outcome comes in fewer than 1 pack in 10.
    public func isHit(_ kind: PackOutcomeKind) -> Bool {
        guard let chance = stats.line(kind)?.chance else { return false }
        // The tolerance keeps exactly 1 pack in 10 out: 1 - 0.9 is 0.09999999999999998.
        return chance < 1 / Self.hitPacks - 1e-9
    }

    /// Opens one pack. The cards come in slot order (P1). A pack does not give
    /// the same card in the same version twice while the pool has an unused card.
    public func openPack<R: RandomNumberGenerator>(using rng: inout R) -> RippedPack {
        var positions: [RipPosition] = []
        var used: Set<PullKey> = []
        for (index, slot) in pack.slots.enumerated() {
            for _ in 0..<slot.count {
                guard !slot.outcomes.isEmpty else {
                    positions.append(RipPosition(slot: index + 1, pull: nil))
                    continue
                }
                let kind = Self.pickOutcome(slot.outcomes, using: &rng)
                let pool = pools[kind] ?? []
                let unused = pool.filter { !used.contains(PullKey(card: $0.0, version: $0.1)) }
                let (card, version) = rng.pick(unused.isEmpty ? pool : unused)
                used.insert(PullKey(card: card, version: version))
                positions.append(RipPosition(slot: index + 1, pull: Pull(cardID: card, version: version, kind: kind, hit: isHit(kind))))
            }
        }
        return RippedPack(positions: positions)
    }

    /// Opens one box: the pack's box size, in packs (P3).
    public func openBox<R: RandomNumberGenerator>(using rng: inout R) -> RippedBox {
        let packs = (0..<pack.boxSize).map { _ in openPack(using: &rng) }
        let pulls = packs.flatMap(\.pulls)
        let counts = stats.lines.map { line in
            RippedBox.Count(
                kind: line.kind,
                pulled: pulls.filter { $0.kind == line.kind }.count,
                expected: line.perPack * Double(pack.boxSize)
            )
        }
        let rarity = Dictionary(uniqueKeysWithValues: stats.lines.map { ($0.kind, $0.chance) })
        let hits = pulls.enumerated().filter(\.element.hit)
            .sorted { a, b in
                let ra = rarity[a.element.kind] ?? 0, rb = rarity[b.element.kind] ?? 0
                return ra != rb ? ra < rb : a.offset < b.offset
            }
            .map(\.element)
        return RippedBox(packs: packs, counts: counts, hits: hits)
    }

    // MARK: - Parts

    private struct PullKey: Hashable {
        let card: CardID
        let version: VersionKey
    }

    /// The cards and versions that one outcome gives. The same cards as `PackStats.pool`.
    static func pool(_ kind: PackOutcomeKind, ladder: RarityLadder, cards: [Card], subsets: [Subset]) -> [(CardID, VersionKey)] {
        let cards = PackStats.pool(kind, ladder: ladder, cards: cards, subsets: subsets)
        guard case .version(let name) = kind else { return cards.map { ($0.id, .base) } }
        let key = name.lowercased()
        return cards.compactMap { card in
            guard let version = ladder.tier(card.rarity)?.versions.first(where: { $0.name.lowercased() == key }) else { return nil }
            return (card.id, .tier(version.id))
        }
    }

    private static func pickOutcome<R: RandomNumberGenerator>(_ outcomes: [PackOutcome], using rng: inout R) -> PackOutcomeKind {
        var roll = rng.unit() * outcomes.reduce(0) { $0 + $1.odds }
        for outcome in outcomes {
            if roll < outcome.odds { return outcome.kind }
            roll -= outcome.odds
        }
        return outcomes[outcomes.count - 1].kind
    }
}

extension World {
    /// The test rip of a set. Nil when the set is gone, or when a blocking
    /// warning stops the rip (test-rip.md, section 4).
    public func testRip(_ setID: SetID) -> TestRip? {
        guard let set = catalog.set(setID), !packWarnings(setID).contains(where: \.blocksPrint) else { return nil }
        return TestRip(pack: set.pack, ladder: set.ladder, cards: catalog.allCards(in: setID), subsets: set.subsets)
    }
}
