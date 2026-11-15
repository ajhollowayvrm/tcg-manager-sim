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
    /// Unsold packs: the stores and the warehouse.
    public internal(set) var stockPacks: Double
    /// Reprints on the way: the week each one arrives, and its packs.
    public internal(set) var pendingReprints: [Reprint]
    /// True after the week-4 review (B10).
    public internal(set) var reviewed: Bool
    /// True after a sell-out to resellers cost goodwill (B7). It happens once.
    public internal(set) var selloutNoted: Bool
    /// The release's campaigns (K5, K6). Nil for no campaign.
    public internal(set) var campaign: Campaign? = nil
    /// The new people that the campaigns reached so far.
    public internal(set) var campaignReached: Double? = nil
    /// The studio's fan base in the release week. Reader: legacy (K9).
    public internal(set) var fansAtRelease: Double? = nil
    /// The week when the last reprint arrived. Reader: singles survival (M2).
    public internal(set) var lastPrintWeek: Int? = nil
    /// The stock in each channel, and the orders (N1). Nil in a save from before distribution.
    public internal(set) var channels: SetChannels? = nil

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
    /// The studio's money of the week from this set: shipments, reorders, and the web store.
    public let revenue: Double
    public let stockAfter: Double

    public var totalSold: Double { sold.reduce(0, +) }
    public var totalMissed: Double { missed.reduce(0, +) }
}

/// One line of the market news.
public struct NewsItem: Codable, Sendable, Equatable {
    public let week: Int
    public let text: String
}

/// One line of the ledger (B3).
public struct LedgerEntry: Codable, Sendable, Equatable {
    public let week: Int
    /// Positive for money in, negative for money out.
    public let amount: Double
    public let note: String
    /// What the money is. Nil in a save from before the kinds, and for other money.
    public let kind: LedgerKind?

    init(week: Int, amount: Double, note: String, kind: LedgerKind? = nil) {
        self.week = week
        self.amount = amount
        self.note = note
        self.kind = kind
    }
}

/// The kind of a ledger line. Funding reads the sales revenue (F1, F2, F4).
public enum LedgerKind: String, Codable, Sendable {
    /// Money from the sets: shipments, reorders, the web store, and the old fan sales.
    case sales
    /// Money from lenders, backers, and investors, and payments to them.
    case funding
}

/// The studio's money and its sales record.
public struct Business: Codable, Sendable, Equatable {
    public internal(set) var cash: Double
    public internal(set) var ledger: [LedgerEntry]
    /// The weekly sales of each released set.
    public internal(set) var sales: [SetID: [WeekSales]]
    /// Stream: the weekly noise of the sales (B4).
    var rng: Xoshiro256
    /// Notable events for the Market tab's news: releases, sell-outs, reprints, and reviews.
    public internal(set) var news: [NewsItem] = []
    /// The fans' dollars spent on the studio's sets, for each audience, in a ring of
    /// 52 weekly slots (B13). Nil in a save from before the fan wallet.
    var walletRing: [[Double]]?
    /// Where the studio works (K3). Nil in a save from before costs: the garage.
    var spaceState: Space?
    /// Weeks in a row with cash below zero (K4).
    public internal(set) var weeksBelowZero: Int?
    /// The week the studio closed (K4). Nil while it runs.
    public internal(set) var closedWeek: Int?
    /// The weekly brand budget, and the share of it for ads (K6). Nil means none.
    public internal(set) var brandBudget: Double?
    public internal(set) var brandAdShare: Double?

    /// B3: a new studio starts with $25,000.
    public static let startCash = 25_000.0

    static func start(seed: UInt64) -> Business {
        Business(cash: startCash, ledger: [LedgerEntry(week: 0, amount: startCash, note: "Starting cash")], sales: [:],
                 rng: Xoshiro256(seed: seed), news: [])
    }

    /// Dollars that an audience spent on the studio's sets in the last 52 weeks (B13).
    public func walletSpent(_ audience: Audience) -> Double {
        walletRing?[audience.rawValue].reduce(0, +) ?? 0
    }

    /// Empties this week's slot of the ring, which holds the spend of 52 weeks ago.
    mutating func startWalletWeek(_ week: Int) {
        if walletRing == nil { walletRing = Array(repeating: Array(repeating: 0, count: 52), count: Audience.allCases.count) }
        for a in walletRing!.indices { walletRing![a][week % 52] = 0 }
    }

    mutating func addWalletSpend(_ audience: Audience, week: Int, dollars: Double) {
        if walletRing == nil { startWalletWeek(week) }
        walletRing![audience.rawValue][week % 52] += dollars
    }

    mutating func report(_ week: Int, _ text: String) {
        news.append(NewsItem(week: week, text: text))
    }

    mutating func record(_ week: Int, _ amount: Double, _ note: String, kind: LedgerKind? = nil) {
        cash += amount
        ledger.append(LedgerEntry(week: week, amount: amount, note: note, kind: kind))
    }

    /// The sales revenue from `fromWeek` to `toWeek`, both included (F1, F2, F4).
    public func salesRevenue(from fromWeek: Int, to toWeek: Int) -> Double {
        ledger.reduce(0) { sum, e in
            e.kind == .sales && e.week >= fromWeek && e.week <= toWeek ? sum + e.amount : sum
        }
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
        return (Double(set.pack.cardCount) * Pricing.cardCost + Pricing.wrapperCost + extra) * printCostShare
    }

    /// The cost of a first print run: the setup, the lead artist's pay (K7), and the packs.
    public func printCost(_ setID: SetID, boxes: Int) -> Double {
        guard let set = catalog.set(setID) else { return 0 }
        return printSetupCost + leadArtCost(setID)
            + Double(boxes * set.pack.boxSize) * printCostPerPack(setID)
    }

    /// Plans the release, pays the print cost, and locks the set (B1, B2).
    public mutating func scheduleRelease(_ setID: SetID, boxes: Int, packPrice: Double, releaseWeek: Int,
                                         campaign: Campaign = .none, holdBack: Double = 0) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        let set = catalog.sets[i]
        guard set.status == .draft else { throw .setLocked }
        guard Pricing.boxRange.contains(boxes) else { throw .badRelease("Print 1 to \(Pricing.boxRange.upperBound.formatted()) boxes.") }
        guard Pricing.packPriceRange.contains(packPrice) else { throw .badRelease("Set a pack price from $1 to $20.") }
        guard releaseWeek >= week + Pricing.previewWeeks else {
            throw .badRelease("The release must be at least \(Pricing.previewWeeks) weeks away, for the previews.")
        }
        guard (0...0.5).contains(holdBack) else { throw .badRelease("Hold back 0% to 50% of the print run for the web store.") }
        let backers = backerPacks(setID)
        guard boxes * set.pack.boxSize >= backers else {
            throw .badRelease("The print run must cover the \(backers.formatted()) packs that the backers are owed.")
        }
        guard !catalog.cards(in: setID).isEmpty else { throw .badRelease("Design at least one card first.") }
        guard let lead = set.leadArt, let leadArtist = talent.artist(lead.artistID) else {
            throw .badRelease("Pick a lead artist first. Every print run needs an artist.")
        }
        let art = setArtReadyWeek(setID)
        guard releaseWeek >= art else {
            throw .badRelease("The art is done in \(Market.calendar(week: art)). Release in that week or later.")
        }
        if packWarnings(setID).contains(where: \.blocksPrint) { throw .badRelease("Fix the pack warnings first.") }
        let cost = printCost(setID, boxes: boxes)
        let packs = boxes * set.pack.boxSize
        guard campaign.creators.allSatisfy({ creator($0) != nil }) else { throw .badRelease("Pick creators from the list.") }
        guard campaign.previewBudget >= 0, campaign.adBudget >= 0, campaign.storeKits >= 0 else {
            throw .badRelease("A marketing amount cannot be below zero.")
        }
        guard let plan = orderPlan(setID, boxes: boxes, packPrice: packPrice, holdBack: holdBack) else { throw .unknownSet(setID) }
        catalog.sets[i].release = SetRelease(releaseWeek: releaseWeek, packPrice: packPrice, printedPacks: packs,
                                             stockPacks: Double(packs - plan.backerPacks), pendingReprints: [], reviewed: false,
                                             selloutNoted: false, campaign: campaign == .none ? nil : campaign,
                                             channels: Self.channels(for: plan))
        catalog.sets[i].status = .scheduled
        var b = business
        let leadPay = leadArtCost(setID)
        b.record(week, -(cost - leadPay), "Print run: \(set.name), \(boxes.formatted()) boxes")
        if leadPay > 0 { b.record(week, -leadPay, "Lead art: \(set.name) by \(leadArtist.name)") }
        for legend in returningLegends(setID) {
            b.report(week, "\(legend.name) returns to draw \(set.name). Fans of \(setsDrawn(by: legend.id).first?.name ?? "the first set") take notice.")
        }
        b.report(week, "\(set.name) orders: \(plan.orders(.hobby).formatted()) packs from hobby stores, \(plan.orders(.bigBox).formatted()) from big-box."
            + (plan.shortage ? " The print run is smaller than the orders. Each store gets less." : ""))
        let marketing = self.cost(of: campaign)
        if marketing > 0 { b.record(week, -marketing, "Marketing: \(set.name)") }
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
        release.pendingReprints.append(.init(arrivalWeek: week + reprintDelay, packs: packs))
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
