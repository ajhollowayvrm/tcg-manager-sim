// Packs and pull rates (docs/design/sets.md, section 5; decisions S2, S6, C9).
//
// A pack is a list of slots. Each slot has a list of outcomes, and each outcome
// has odds. The odds in a slot add up to 100%. A rarer chase takes odds from
// another outcome in the same slot: the slots are the lever, not free sliders.

import Foundation

public typealias PackID = Int

/// What one slot can give.
public enum PackOutcomeKind: Codable, Sendable, Hashable {
    /// The base version of a random card at this tier.
    case tier(TierID)
    /// This version (for example "Reverse holo") of a random card at any tier
    /// that has a version with this name. A card that turned the version off is not in the pool.
    case version(String)
    /// A random card of this subset (S14). Only a subset with "Own pack outcome" on.
    case subset(SubsetID)
}

public struct PackOutcome: Codable, Sendable, Hashable, Identifiable {
    /// Unique in its slot.
    public let id: Int
    public var kind: PackOutcomeKind
    /// Percent, 0 to 100.
    public var odds: Double

    public init(id: Int, kind: PackOutcomeKind, odds: Double) {
        self.id = id
        self.kind = kind
        self.odds = odds
    }
}

/// One or more card positions that draw from the same outcomes.
public struct PackSlot: Codable, Sendable, Hashable, Identifiable {
    /// Unique in its pack.
    public let id: Int
    /// The card positions that use this slot, for example 4 commons.
    public var count: Int
    public var outcomes: [PackOutcome]

    public init(id: Int, count: Int = 1, outcomes: [PackOutcome]) {
        self.id = id
        self.count = count
        self.outcomes = outcomes
    }

    public var oddsSum: Double { outcomes.reduce(0) { $0 + $1.odds } }

    /// An ID for a new outcome in this slot.
    public var nextOutcomeID: Int { (outcomes.map(\.id).max() ?? 0) + 1 }
}

/// A pack: a pack preset in the studio, or a set's own copy (S6, C10).
public struct PackLayout: Codable, Sendable, Equatable, Identifiable {
    public let id: PackID
    /// FLAVOR.
    public var name: String
    /// The ladder preset that the editor uses for its list of tiers (S12).
    public var ladderID: LadderID
    /// Packs in one booster box. Reader: hits per box, the box product (print system, not built yet).
    public var boxSize: Int
    public var slots: [PackSlot]

    public static let cardRange = 1...20
    public static let boxRange = 1...100
    public static let nameLimit = 30

    public init(id: PackID, name: String, ladderID: LadderID, boxSize: Int = 36, slots: [PackSlot]) {
        self.id = id
        self.name = name
        self.ladderID = ladderID
        self.boxSize = boxSize
        self.slots = slots
    }

    /// The cards in one pack.
    public var cardCount: Int { slots.reduce(0) { $0 + $1.count } }

    /// An ID for a new slot in this pack.
    public var nextSlotID: Int { (slots.map(\.id).max() ?? 0) + 1 }

    /// The default pack preset for the default ladder (sets.md, section 5.2).
    /// The odds follow community numbers for a modern era. They are start values.
    public static func defaultPack(id: PackID) -> PackLayout {
        let reverse = PackOutcomeKind.version(CardVersion.reverseHolo.name)
        return PackLayout(id: id, name: "Modern 10-card pack", ladderID: Catalog.defaultLadderID, slots: [
            PackSlot(id: 1, count: 4, outcomes: [PackOutcome(id: 1, kind: .tier(1), odds: 100)]),
            PackSlot(id: 2, count: 3, outcomes: [PackOutcome(id: 1, kind: .tier(2), odds: 100)]),
            PackSlot(id: 3, count: 1, outcomes: [PackOutcome(id: 1, kind: reverse, odds: 100)]),
            PackSlot(id: 4, count: 1, outcomes: [
                PackOutcome(id: 1, kind: reverse, odds: 90),
                PackOutcome(id: 2, kind: .tier(7), odds: 8),
                PackOutcome(id: 3, kind: .tier(8), odds: 1.3),
                PackOutcome(id: 4, kind: .tier(9), odds: 0.7),
            ]),
            PackSlot(id: 5, count: 1, outcomes: [
                PackOutcome(id: 1, kind: .tier(3), odds: 55),
                PackOutcome(id: 2, kind: .tier(4), odds: 22),
                PackOutcome(id: 3, kind: .tier(5), odds: 16),
                PackOutcome(id: 4, kind: .tier(6), odds: 7),
            ]),
        ])
    }

    /// A copy whose tier outcomes point to `ladder`. Each outcome matches first by
    /// the tier ID, then by the name of the tier in `source` (S6). An outcome with no
    /// match keeps its old ID, and the pack warnings ask the player to pick a tier.
    public func resolved(against ladder: RarityLadder, source: RarityLadder?) -> PackLayout {
        var copy = self
        for s in copy.slots.indices {
            for o in copy.slots[s].outcomes.indices {
                guard case .tier(let id) = copy.slots[s].outcomes[o].kind, ladder.tier(id) == nil,
                      let name = source?.tier(id)?.name,
                      let match = ladder.tiers.first(where: { $0.name.lowercased() == name.lowercased() })
                else { continue }
                copy.slots[s].outcomes[o].kind = .tier(match.id)
            }
        }
        return copy
    }
}

// MARK: - Pull rates

/// The numbers that the pack screen shows (sets.md, section 5.3). Pure: a read.
public struct PackStats: Sendable, Equatable {
    public struct Line: Sendable, Equatable {
        public let kind: PackOutcomeKind
        /// The mean count in one pack.
        public let perPack: Double
        /// The chance of at least one in one pack.
        public let chance: Double
        /// The cards that this outcome can give. Nil for a pack preset, which has no cards.
        public let pool: Int?

        /// About 1 in this many packs has at least one. Nil when it never comes.
        public var oneIn: Double? { chance > 0 ? 1 / chance : nil }
        /// About 1 in this many packs has one specific card from the pool.
        public var singleOneIn: Double? {
            guard let pool, pool > 0, perPack > 0 else { return nil }
            return Double(pool) / perPack
        }
    }

    /// One line for each outcome kind in the pack, in the ladder's tier order, then versions.
    public let lines: [Line]
    public let boxSize: Int

    public func line(_ kind: PackOutcomeKind) -> Line? { lines.first { $0.kind == kind } }

    /// - Parameters:
    ///   - cards: all cards of a set, designed and filler. Nil for a pack preset.
    ///   - subsets: the set's subsets. A subset with its own outcome takes its cards
    ///     out of the tier and version pools (S14).
    public init(pack: PackLayout, ladder: RarityLadder, cards: [Card]?, subsets: [Subset] = []) {
        boxSize = pack.boxSize
        var kinds: [PackOutcomeKind] = []
        for slot in pack.slots {
            for outcome in slot.outcomes where !kinds.contains(outcome.kind) { kinds.append(outcome.kind) }
        }
        kinds.sort { a, b in Self.order(a, ladder) < Self.order(b, ladder) }
        lines = kinds.map { kind in
            var perPack = 0.0
            var none = 1.0
            for slot in pack.slots {
                let p = min(1, max(0, slot.outcomes.filter { $0.kind == kind }.reduce(0) { $0 + $1.odds } / 100))
                perPack += Double(slot.count) * p
                none *= pow(1 - p, Double(slot.count))
            }
            let pool = cards.map { Self.pool(kind, ladder: ladder, cards: $0, subsets: subsets).count }
            return Line(kind: kind, perPack: perPack, chance: 1 - none, pool: pool)
        }
    }

    /// The cards that one outcome can give.
    public static func pool(_ kind: PackOutcomeKind, ladder: RarityLadder, cards: [Card], subsets: [Subset] = []) -> [Card] {
        let own = Set(subsets.filter(\.ownOutcome).map(\.id))
        if case .subset(let id) = kind {
            return own.contains(id) ? cards.filter { $0.subsetID == id } : []
        }
        // A card of a subset with its own outcome comes only through that outcome.
        let cards = cards.filter { card in card.subsetID.map { !own.contains($0) } ?? true }
        switch kind {
        case .subset:
            return []
        case .tier(let id):
            return cards.filter { $0.rarity == id }
        case .version(let name):
            let key = name.lowercased()
            return cards.filter { card in
                guard let version = ladder.tier(card.rarity)?.versions.first(where: { $0.name.lowercased() == key }) else { return false }
                return !card.excludedVersions.contains(version.id)
            }
        }
    }

    private static func order(_ kind: PackOutcomeKind, _ ladder: RarityLadder) -> Int {
        switch kind {
        case .tier(let id): ladder.rank(of: id) ?? 100
        case .subset: 150
        case .version: 200
        }
    }
}

// MARK: - Warnings

/// A problem with a set's pack that the set screen shows (sets.md, section 5.4).
public enum PackWarning: Sendable, Equatable {
    /// A slot outcome points to a tier that is not in the set's ladder. It blocks the print.
    case missingTier(slot: Int)
    /// A slot outcome points to a subset that is gone, or that has no outcome of its own. It blocks the print.
    case missingSubset(slot: Int)
    /// A tier has cards, but no outcome can give them.
    case unreachable(name: String)
    /// An outcome can give no card: its tier or its version has no cards.
    case emptyOutcome(slot: Int, label: String)

    public var message: String {
        switch self {
        case .missingTier(let slot): "Slot \(slot) points to a tier that is not in the ladder. Pick a tier."
        case .missingSubset(let slot): "Slot \(slot) gives a subset that is gone or has no pack outcome of its own. Pick another outcome."
        case .unreachable(let name): "Nobody can pull your \(name) cards. Add \(name) to a slot."
        case .emptyOutcome(let slot, let label): "Slot \(slot) gives \(label), but the set has no such cards yet."
        }
    }

    /// Only a missing tier blocks the print. The other warnings are advice.
    public var blocksPrint: Bool {
        switch self {
        case .missingTier, .missingSubset: true
        default: false
        }
    }
}

extension PackLayout {
    /// The display name of an outcome kind.
    public func label(_ kind: PackOutcomeKind, ladder: RarityLadder, subsets: [Subset] = []) -> String {
        switch kind {
        case .tier(let id): ladder.tier(id)?.name ?? "Pick a tier"
        case .version(let name): name
        case .subset(let id): subsets.first { $0.id == id }?.name ?? "A removed subset"
        }
    }

    /// The warnings for a set's pack.
    public func warnings(ladder: RarityLadder, cards: [Card], subsets: [Subset] = []) -> [PackWarning] {
        var result: [PackWarning] = []
        var reachedTiers: Set<TierID> = []
        var reachedSubsets: Set<SubsetID> = []
        let own = subsets.filter(\.ownOutcome)
        func add(_ warning: PackWarning) { if !result.contains(warning) { result.append(warning) } }
        for (index, slot) in slots.enumerated() {
            for outcome in slot.outcomes where outcome.odds > 0 {
                switch outcome.kind {
                case .tier(let id):
                    guard ladder.tier(id) != nil else {
                        add(.missingTier(slot: index + 1))
                        continue
                    }
                    reachedTiers.insert(id)
                case .version(let name):
                    for tier in ladder.tiers where tier.versions.contains(where: { $0.name.lowercased() == name.lowercased() }) {
                        reachedTiers.insert(tier.id)
                    }
                case .subset(let id):
                    guard own.contains(where: { $0.id == id }) else {
                        add(.missingSubset(slot: index + 1))
                        continue
                    }
                    reachedSubsets.insert(id)
                }
                if PackStats.pool(outcome.kind, ladder: ladder, cards: cards, subsets: subsets).isEmpty {
                    add(.emptyOutcome(slot: index + 1, label: label(outcome.kind, ladder: ladder, subsets: subsets)))
                }
            }
        }
        let ownIDs = Set(own.map(\.id))
        let tierCards = cards.filter { card in card.subsetID.map { !ownIDs.contains($0) } ?? true }
        for tier in ladder.tiers where !reachedTiers.contains(tier.id) && tierCards.contains(where: { $0.rarity == tier.id }) {
            add(.unreachable(name: tier.name))
        }
        for subset in own where !reachedSubsets.contains(subset.id) && cards.contains(where: { $0.subsetID == subset.id }) {
            add(.unreachable(name: subset.name))
        }
        return result
    }
}

extension PackOutcomeKind {
    public var tierID: TierID? {
        if case .tier(let id) = self { return id }
        return nil
    }
}
