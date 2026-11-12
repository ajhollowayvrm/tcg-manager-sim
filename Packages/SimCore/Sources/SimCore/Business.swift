// Money, releases, and the sales record (docs/design/sales.md, sections 2, 3, and 8;
// decisions B1 to B3, B8).

import Foundation

/// A set's release plan and its stock (B1).
public struct SetRelease: Codable, Sendable, Equatable {
    /// The week that the set goes on sale.
    public let releaseWeek: Int
    public let packPrice: Double
    /// All packs printed so far, reprints included.
    public internal(set) var printedPacks: Int
    /// Packs in stores now.
    public internal(set) var stockPacks: Double
    /// Reprints on the way: the week each one arrives, and its packs.
    public internal(set) var pendingReprints: [Reprint]
    /// True after the week-4 review (B10).
    public internal(set) var reviewed: Bool
    /// True after a sell-out to resellers cost goodwill (B7). It happens once.
    public internal(set) var selloutNoted: Bool

    public struct Reprint: Codable, Sendable, Equatable {
        public let arrivalWeek: Int
        public let packs: Int
    }
}

/// One week of one set's sales (sales.md, section 11).
public struct WeekSales: Codable, Sendable, Equatable {
    public let week: Int
    /// Packs sold to each audience, by `Audience.rawValue`. Resellers included.
    public let sold: [Double]
    /// Demand that found no stock, for each audience.
    public let missed: [Double]
    /// The studio's revenue: its share of the pack price.
    public let revenue: Double
    public let stockAfter: Double

    public var totalSold: Double { sold.reduce(0, +) }
    public var totalMissed: Double { missed.reduce(0, +) }
}

/// One line of the ledger (B3).
public struct LedgerEntry: Codable, Sendable, Equatable {
    public let week: Int
    /// Positive for money in, negative for money out.
    public let amount: Double
    public let note: String
}

/// The studio's money and its sales record.
public struct Business: Codable, Sendable, Equatable {
    public internal(set) var cash: Double
    public internal(set) var ledger: [LedgerEntry]
    /// The weekly sales of each released set.
    public internal(set) var sales: [SetID: [WeekSales]]
    /// Stream: the weekly noise of the sales (B4).
    var rng: Xoshiro256

    /// B3: a new studio starts with $25,000.
    public static let startCash = 25_000.0

    static func start(seed: UInt64) -> Business {
        Business(cash: startCash, ledger: [LedgerEntry(week: 0, amount: startCash, note: "Starting cash")], sales: [:],
                 rng: Xoshiro256(seed: seed))
    }

    mutating func record(_ week: Int, _ amount: Double, _ note: String) {
        cash += amount
        ledger.append(LedgerEntry(week: week, amount: amount, note: note))
    }
}

/// Prices and costs (B1, sales.md section 2).
public enum Pricing {
    public static let defaultPackPrice = 4.49
    public static let packPriceRange = 1.0...20.0
    public static let boxRange = 1...100_000
    /// The studio's share of the pack price (research.md, section 5: 35% to 40%).
    public static let publisherShare = 0.38
    /// One plain printed card (research.md, section 5: $0.02 to $0.03).
    public static let cardCost = 0.025
    public static let wrapperCost = 0.05
    public static let printSetup = 2_000.0
    /// Previews run about 3 weeks before release (research.md, section 5).
    public static let previewWeeks = 3
    public static let reprintWeeks = 6
}

extension World {
    /// The studio's money and sales. A save from before the selling engine starts with $25,000.
    public var business: Business { businessState ?? .start(seed: Self.streamSeed(seed, stream: 8)) }

    /// A scheduled or released set cannot change (B2).
    func requireDraft(_ setID: SetID) throws(CardError) {
        if let set = catalog.set(setID), set.status != .draft { throw .setLocked }
    }

    /// The print cost of one pack: the cards, the wrapper, and the expected extra
    /// cost of the looks that the pack gives (C17).
    public func printCostPerPack(_ setID: SetID) -> Double {
        guard let set = catalog.set(setID) else { return 0 }
        let cards = catalog.allCards(in: setID)
        var extra = 0.0
        if let rip = testRip(setID) {
            for line in rip.stats.lines {
                let pool = TestRip.pool(line.kind, ladder: set.ladder, cards: cards, subsets: set.subsets)
                guard !pool.isEmpty else { continue }
                let costs = pool.map { cardID, key -> Double in
                    guard let card = catalog.card(cardID), let tier = set.ladder.tier(card.rarity) else { return 0 }
                    return tier.versions(excluding: [], own: card.ownVersions).first { $0.key == key }?.version.costPerCopy ?? 0
                }
                extra += line.perPack * costs.reduce(0, +) / Double(costs.count)
            }
        }
        return Double(set.pack.cardCount) * Pricing.cardCost + Pricing.wrapperCost + extra
    }

    /// The cost of a first print run: the setup plus the packs.
    public func printCost(_ setID: SetID, boxes: Int) -> Double {
        guard let set = catalog.set(setID) else { return 0 }
        return Pricing.printSetup + Double(boxes * set.pack.boxSize) * printCostPerPack(setID)
    }

    /// Plans the release, pays the print cost, and locks the set (B1, B2).
    public mutating func scheduleRelease(_ setID: SetID, boxes: Int, packPrice: Double, releaseWeek: Int) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        let set = catalog.sets[i]
        guard set.status == .draft else { throw .setLocked }
        guard Pricing.boxRange.contains(boxes) else { throw .badRelease("Print 1 to \(Pricing.boxRange.upperBound.formatted()) boxes.") }
        guard Pricing.packPriceRange.contains(packPrice) else { throw .badRelease("Set a pack price from $1 to $20.") }
        guard releaseWeek >= week + Pricing.previewWeeks else {
            throw .badRelease("The release must be at least \(Pricing.previewWeeks) weeks away, for the previews.")
        }
        guard !catalog.cards(in: setID).isEmpty else { throw .badRelease("Design at least one card first.") }
        if packWarnings(setID).contains(where: \.blocksPrint) { throw .badRelease("Fix the pack warnings first.") }
        let cost = printCost(setID, boxes: boxes)
        let packs = boxes * set.pack.boxSize
        catalog.sets[i].release = SetRelease(releaseWeek: releaseWeek, packPrice: packPrice, printedPacks: packs,
                                             stockPacks: Double(packs), pendingReprints: [], reviewed: false, selloutNoted: false)
        catalog.sets[i].status = .scheduled
        var b = business
        b.record(week, -cost, "Print run: \(set.name), \(boxes.formatted()) boxes")
        businessState = b
    }

    /// Orders more boxes. They arrive 6 weeks later. The studio pays now (B8).
    public mutating func reprint(_ setID: SetID, boxes: Int) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }), var release = catalog.sets[i].release else {
            throw .unknownSet(setID)
        }
        guard Pricing.boxRange.contains(boxes) else { throw .badRelease("Print 1 to \(Pricing.boxRange.upperBound.formatted()) boxes.") }
        let packs = boxes * catalog.sets[i].pack.boxSize
        let cost = Double(packs) * printCostPerPack(setID)
        release.pendingReprints.append(.init(arrivalWeek: week + Pricing.reprintWeeks, packs: packs))
        catalog.sets[i].release = release
        var b = business
        b.record(week, -cost, "Reprint: \(catalog.sets[i].name), \(boxes.formatted()) boxes")
        businessState = b
    }

    /// A developer tool until loans exist (B3).
    public mutating func addCash(_ amount: Double, note: String) {
        var b = business
        b.record(week, amount, note)
        businessState = b
    }
}
