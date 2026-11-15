// Distribution: channels, the distributor, orders, the warehouse, and trust
// (docs/design/distribution-and-funding.md, part 1; decisions N1 to N4).

import Foundation

/// A place where the fans buy packs (N2).
public enum Channel: Int, Codable, CaseIterable, Sendable, Identifiable {
    case hobby, bigBox, web

    public var id: Int { rawValue }

    public var name: String {
        switch self {
        case .hobby: "Hobby stores"
        case .bigBox: "Big-box retail"
        case .web: "Web store"
        }
    }

    /// The channels that order from the studio.
    public static let stores: [Channel] = [.hobby, .bigBox]

    /// Without a distributor, the studio reaches this share of the hobby demand (N2).
    static let directReach = 0.4
    /// The studio's share of the pack price (N2).
    static let directHobbyShare = 0.45
    static let distributorShare = Pricing.publisherShare
    static let webShare = 0.70
    /// The share of the demand that a store cannot fill, which goes to the web store (N1).
    static let spill = 0.3
    /// A channel with less trust than this orders nothing (N3).
    static let minimumTrust = 0.25
    static let trustRange = 0.2...1.5
    /// A pallet holds this many packs. It costs this much each month (N1).
    static let palletPacks = 3_600.0
    static let palletMonthlyCost = 20.0
    /// The weeks of demand that the first order covers, and a reorder covers (N1).
    static let firstOrderWeeks = 0..<8
    static let reorderWeeks = 4
    /// The week of a set's life when each channel looks at its sell-through (N3).
    static let reviewWeek = 12

    /// The studio's share of the pack price in this channel.
    static func studioShare(_ channel: Channel, distributor: Bool) -> Double {
        switch channel {
        case .hobby: distributor ? distributorShare : directHobbyShare
        case .bigBox: distributorShare
        case .web: webShare
        }
    }

    /// The share of one audience's demand that goes to each channel (N2). The weights
    /// are normalized to 1. The result is indexed by `Channel.rawValue`. Nostalgia
    /// adults shop like casual players. Resellers have no share here.
    static func shares(_ audience: Audience, distributor: Bool) -> [Double] {
        let weights: [Double]
        switch audience {
        case .competitivePlayers: weights = [1.0, 0.2, 0.15]
        case .completionists: weights = [1.0, 0.3, 0.15]
        case .chaseCollectors: weights = [0.8, 0.4, 0.3]
        case .artCollectors: weights = [0.8, 0.2, 0.15]
        case .investors: weights = [0.5, 0.4, 0.3]
        case .teens: weights = [0.5, 0.7, 0.15]
        case .casualPlayers, .nostalgiaAdults: weights = [0.4, 0.9, 0.15]
        case .kids, .parents: weights = [0.1, 1.0, 0.15]
        case .resellers: return [0, 0, 0]
        }
        let sum = weights.reduce(0, +)
        var shares = weights.map { $0 / sum }
        if !distributor {
            shares[Channel.hobby.rawValue] *= directReach
            shares[Channel.bigBox.rawValue] = 0
        }
        return shares
    }
}

/// The distributor contract and each channel's trust. Nothing here is random.
public struct ChannelBook: Codable, Sendable, Equatable {
    public internal(set) var hasDistributor: Bool = false
    /// Hidden. How much the channel trusts the studio, 0.2 to 1.5 (N3).
    public internal(set) var hobbyTrust: Double = 0.6
    public internal(set) var bigBoxTrust: Double = 0.4

    public init() {}

    public func trust(_ channel: Channel) -> Double {
        switch channel {
        case .hobby: hobbyTrust
        case .bigBox: bigBoxTrust
        case .web: 1
        }
    }

    /// True when the channel orders from the studio now.
    public func orders(_ channel: Channel) -> Bool {
        switch channel {
        case .hobby: hobbyTrust >= Channel.minimumTrust
        case .bigBox: hasDistributor && bigBoxTrust >= Channel.minimumTrust
        case .web: false
        }
    }

    /// The studio's share of the pack price in this channel, with the contract of now.
    public func studioShare(_ channel: Channel) -> Double {
        Channel.studioShare(channel, distributor: hasDistributor)
    }

    mutating func changeTrust(_ channel: Channel, by amount: Double) {
        let value = min(Channel.trustRange.upperBound, max(Channel.trustRange.lowerBound, trust(channel) + amount))
        switch channel {
        case .hobby: hobbyTrust = value
        case .bigBox: bigBoxTrust = value
        case .web: break
        }
    }

    /// The trust of a channel as a phrase.
    public func phrase(_ channel: Channel) -> String {
        switch trust(channel) {
        case ..<Channel.minimumTrust: "Orders nothing"
        case ..<0.5: "Wary"
        case ..<0.8: "Steady"
        case ..<1.1: "Confident"
        default: "Eager"
        }
    }
}

/// One set's stock in the channels (N1). The warehouse holds the rest of the set's stock.
public struct SetChannels: Codable, Sendable, Equatable {
    /// Packs held back for the web store. They stay in the warehouse at the first order.
    public internal(set) var heldBack: Int = 0
    /// Packs that the set owes its crowdfund backers (F3). They left the print run.
    public internal(set) var backerPacks: Int = 0
    /// The contract when the studio scheduled the release. It sets the share at shipment.
    public internal(set) var viaDistributor: Bool = false
    /// The first orders, in packs, from the hobby stores and from big-box.
    public internal(set) var hobbyOrder: Int = 0
    public internal(set) var bigBoxOrder: Int = 0
    public internal(set) var hobbyStock: Double = 0
    public internal(set) var bigBoxStock: Double = 0
    /// Packs that each store channel got, shipments and reorders.
    public internal(set) var hobbyReceived: Double = 0
    public internal(set) var bigBoxReceived: Double = 0
    /// Packs that each channel sold, to fans and resellers.
    public internal(set) var hobbySold: Double = 0
    public internal(set) var bigBoxSold: Double = 0
    public internal(set) var webSold: Double = 0
    /// True after big-box set store limits (N4).
    public internal(set) var limited: Bool = false
    /// True after the channels looked at their sell-through (N3).
    public internal(set) var trustReviewed: Bool = false

    public init() {}

    /// A release from before distribution: half of its stock goes to each store channel.
    static func migrated(stock: Double) -> SetChannels {
        var c = SetChannels()
        c.hobbyStock = stock / 2
        c.bigBoxStock = stock / 2
        c.hobbyReceived = stock / 2
        c.bigBoxReceived = stock / 2
        return c
    }

    public func stock(_ channel: Channel) -> Double {
        switch channel {
        case .hobby: hobbyStock
        case .bigBox: bigBoxStock
        case .web: 0
        }
    }

    public func order(_ channel: Channel) -> Int {
        switch channel {
        case .hobby: hobbyOrder
        case .bigBox: bigBoxOrder
        case .web: 0
        }
    }

    public func received(_ channel: Channel) -> Double {
        switch channel {
        case .hobby: hobbyReceived
        case .bigBox: bigBoxReceived
        case .web: 0
        }
    }

    public func sold(_ channel: Channel) -> Double {
        switch channel {
        case .hobby: hobbySold
        case .bigBox: bigBoxSold
        case .web: webSold
        }
    }

    /// The packs in the warehouse, from the set's total stock.
    public func warehouse(total: Double) -> Double { max(0, total - hobbyStock - bigBoxStock) }

    /// Packs in the hobby and big-box stores.
    public var storePacks: Double { hobbyStock + bigBoxStock }

    mutating func ship(_ channel: Channel, _ packs: Double) {
        switch channel {
        case .hobby:
            hobbyStock += packs
            hobbyReceived += packs
        case .bigBox:
            bigBoxStock += packs
            bigBoxReceived += packs
        case .web: break
        }
    }

    mutating func addSold(_ channel: Channel, _ packs: Double) {
        switch channel {
        case .hobby:
            hobbySold += packs
            hobbyStock = max(0, hobbyStock - packs)
        case .bigBox:
            bigBoxSold += packs
            bigBoxStock = max(0, bigBoxStock - packs)
        case .web: webSold += packs
        }
    }

    /// The stores never hold more than the set's total stock.
    mutating func fit(total: Double) {
        let stores = hobbyStock + bigBoxStock
        guard stores > total, stores > 0 else { return }
        hobbyStock *= total / stores
        bigBoxStock *= total / stores
    }
}

/// What the stores order for a release plan, and what the studio is paid at shipment (N1).
public struct OrderPlan: Sendable, Equatable {
    public let printedPacks: Int
    public let heldBack: Int
    public let backerPacks: Int
    /// Packs that the stores can order: the print run minus the held-back and backer packs.
    public let available: Int
    /// The packs that each store channel expects to sell in 8 weeks, indexed by `Channel.rawValue`.
    public let expected: [Double]
    /// The packs that each channel orders, indexed by `Channel.rawValue`.
    public let orders: [Int]
    /// True when the stores wanted more than the print run gives.
    public let shortage: Bool
    public let viaDistributor: Bool
    public let shipmentMoney: Double

    public func orders(_ channel: Channel) -> Int { orders[channel.rawValue] }
}

extension World {
    /// The distributor contract and the channels. A save from before distribution starts fresh.
    public var channels: ChannelBook { channelState ?? ChannelBook() }

    /// Signs with a distributor. It is free. It changes future orders (N2).
    public mutating func signDistributor() {
        var book = channels
        guard !book.hasDistributor else { return }
        book.hasDistributor = true
        channelState = book
        var b = business
        b.report(week, "The studio signed with a distributor. Big-box stores can order now.")
        businessState = b
    }

    /// Ends the contract. It is free. Stock that is already shipped stays in the stores (N2).
    public mutating func endDistributor() {
        var book = channels
        guard book.hasDistributor else { return }
        book.hasDistributor = false
        channelState = book
        var b = business
        b.report(week, "The studio ended its distributor contract. Big-box stores order no more.")
        businessState = b
    }

    /// The packs that each channel expects to sell in a span of weeks of a set's life, indexed
    /// by `Channel.rawValue`. It uses the set's lifetime demand and the rhythm, and no noise (N1).
    func channelPacks(_ demand: [AudienceDemand], packPrice: Double, weeks: Range<Int>, distributor: Bool) -> [Double] {
        var result = [0.0, 0.0, 0.0]
        for d in demand where d.audience != .resellers {
            let curve = weeks.reduce(0) { $0 + Rhythm.weight(d.audience, week: $1) }
            let packs = d.lifetimeDollars * curve / packPrice
            let shares = Channel.shares(d.audience, distributor: distributor)
            for c in Channel.allCases { result[c.rawValue] += packs * shares[c.rawValue] }
        }
        return result
    }

    /// Shares packs between channels that want more than there is. Each channel gets the same
    /// share of what is there, in whole boxes (N1).
    static func allocate(_ wants: [Double], available: Double, box: Int) -> [Double] {
        let total = wants.reduce(0, +)
        let factor = total > available && total > 0 ? max(0, available) / total : 1
        let size = Double(max(1, box))
        return wants.map { ($0 * factor / size).rounded(.down) * size }
    }

    /// What the stores order for a print run, and the money at shipment (N1, N3).
    /// A read: it draws no number. The plan can be for a draft set.
    public func orderPlan(_ setID: SetID, boxes: Int, packPrice: Double, holdBack: Double = 0) -> OrderPlan? {
        guard let set = catalog.set(setID) else { return nil }
        let printed = boxes * set.pack.boxSize
        let held = Int((Double(printed) * min(0.5, max(0, holdBack))).rounded(.down))
        let backers = backerPacks(setID)
        let available = max(0, printed - held - backers)
        let book = channels
        let expected = channelPacks(setDemand(setID, packPrice: packPrice), packPrice: packPrice,
                                    weeks: Channel.firstOrderWeeks, distributor: book.hasDistributor)
        let wants = Channel.stores.map { c in book.orders(c) ? expected[c.rawValue] * book.trust(c) : 0 }
        let total = wants.reduce(0, +)
        let given = Self.allocate(wants, available: Double(available), box: set.pack.boxSize)
        var orders = [0, 0, 0]
        for c in Channel.stores { orders[c.rawValue] = Int(given[c.rawValue]) }
        let money = Channel.stores.reduce(0.0) { sum, c in
            sum + Double(orders[c.rawValue]) * packPrice * Channel.studioShare(c, distributor: book.hasDistributor)
        }
        return OrderPlan(printedPacks: printed, heldBack: held, backerPacks: backers, available: available,
                         expected: expected, orders: orders, shortage: total > Double(available) + 0.5,
                         viaDistributor: book.hasDistributor, shipmentMoney: money)
    }

    /// The channel stock of a new release from its order plan.
    static func channels(for plan: OrderPlan) -> SetChannels {
        var c = SetChannels()
        c.heldBack = plan.heldBack
        c.backerPacks = plan.backerPacks
        c.viaDistributor = plan.viaDistributor
        c.hobbyOrder = plan.orders(.hobby)
        c.bigBoxOrder = plan.orders(.bigBox)
        return c
    }

    /// Packs in the warehouse of one set. Nil when the set has no release.
    public func warehousePacks(_ setID: SetID) -> Double? {
        guard let release = catalog.set(setID)?.release else { return nil }
        guard let ch = release.channels else { return release.stockPacks }
        return ch.warehouse(total: release.stockPacks)
    }

    /// The weekly cost of the pallets that hold the warehouse packs (N1).
    mutating func chargeStorage() {
        var packs = 0.0
        for set in catalog.sets {
            if let release = set.release, let ch = release.channels { packs += ch.warehouse(total: release.stockPacks) }
        }
        guard packs > 0 else { return }
        let pallets = (packs / Channel.palletPacks).rounded(.up)
        let cost = pallets * Channel.palletMonthlyCost * 12 / 52
        var b = business
        b.record(week, -cost, "Storage: \(Int(pallets).formatted()) \(pallets == 1 ? "pallet" : "pallets")")
        businessState = b
    }

    /// In week 12 of a set's life, each store channel looks at its sell-through (N3).
    mutating func reviewChannels(_ ch: inout SetChannels, set: CardSet) {
        guard !ch.trustReviewed else { return }
        ch.trustReviewed = true
        var book = channels
        var lines: [String] = []
        for c in Channel.stores {
            let received = ch.received(c)
            guard received > 0 else { continue }
            let through = ch.sold(c) / received
            if through >= 0.85 {
                book.changeTrust(c, by: 0.15)
                lines.append("\(c.name) sold out of \(set.name) and will order more next time.")
            } else if c == .bigBox, through < 0.4 {
                book.changeTrust(c, by: -0.3)
                lines.append("Big-box retail cut the studio after \(set.name) sold too little.")
            } else if through < 0.5 {
                book.changeTrust(c, by: -0.15)
                lines.append("\(c.name) sold too little of \(set.name) and will order less next time.")
            }
        }
        channelState = book
        var b = business
        for line in lines { b.report(week, line) }
        businessState = b
    }
}
