// Space, hires, weekly costs, and the close (docs/design/costs.md, sections 1 to 3;
// decisions K3 and K4).

import Foundation

/// Where the studio works (K3).
public enum Space: String, CaseIterable, Codable, Sendable, Identifiable {
    case garage, coworking, office, studio, headquarters

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .garage: "Garage"
        case .coworking: "Coworking desks"
        case .office: "Small office"
        case .studio: "Studio floor"
        case .headquarters: "Headquarters"
        }
    }

    /// Rent for each month (costs.md, section 1).
    public var monthlyRent: Double {
        switch self {
        case .garage: 0
        case .coworking: 600
        case .office: 3_000
        case .studio: 12_000
        case .headquarters: 40_000
        }
    }

    public var weeklyRent: Double { monthlyRent * 12 / 52 }

    /// The places for hires. The founder needs no place.
    public var room: Int {
        switch self {
        case .garage: 1
        case .coworking: 3
        case .office: 8
        case .studio: 20
        case .headquarters: 50
        }
    }
}

extension MarketInsight {
    /// The hire that unlocks this part of the market view (K3).
    public var hireName: String {
        switch self {
        case .sizes: "Market analyst"
        case .reach: "Survey contractor"
        case .goodwill: "Community manager"
        case .fatigue: "Release planner"
        case .rhythms: "Buyer researcher"
        case .forecast: "Analytics team"
        case .curve: "Data department"
        case .sharp: "Data scientist"
        case .scout: "Talent scout"
        case .scoutNetwork: "Scouting network"
        case .focusGroups: "Focus group lead"
        case .characterDesigner: "Character designer"
        case .storyWriter: "Story writer"
        case .loreResearcher: "Lore researcher"
        case .artDirector: "Art director"
        case .staffIllustrator: "Staff illustrator"
        case .printBuyer: "Print buyer"
        case .printPlant: "Print plant crew"
        case .marketingLead: "Marketing lead"
        case .storeRelations: "Store relations manager"
        case .collectorRelations: "Collector relations manager"
        case .priceTracker: "Price analyst"
        }
    }

    /// The yearly salary (costs.md, section 2).
    public var salary: Double {
        switch self {
        case .sizes: 79_000
        case .reach: 40_000
        case .goodwill: 65_000
        case .fatigue: 70_000
        case .rhythms: 79_000
        case .forecast: 160_000
        case .curve: 250_000
        case .sharp: 150_000
        case .scout: 55_000
        case .scoutNetwork: 140_000
        case .focusGroups: 60_000
        case .characterDesigner: 75_000
        case .storyWriter: 55_000
        case .loreResearcher: 40_000
        case .artDirector: 90_000
        case .staffIllustrator: 60_000
        case .printBuyer: 70_000
        case .printPlant: 420_000
        case .marketingLead: 85_000
        case .storeRelations: 65_000
        case .collectorRelations: 55_000
        case .priceTracker: 45_000
        }
    }

    public var weeklySalary: Double { salary / 52 }

    /// The places of room that the hire takes.
    public var heads: Int {
        switch self {
        case .forecast: 2
        case .curve: 3
        case .scoutNetwork: 2
        case .printPlant: 6
        default: 1
        }
    }
}

/// The studio's history, for the closing screen (K4).
public struct StudioHistory: Sendable, Equatable {
    public let weeks: Int
    public let sets: Int
    public let packsSold: Double
    public let bestSet: String?
    public let peakCash: Double
}

extension Business {
    /// K4: the studio closes after this many weeks in a row below zero.
    public static let weeksToClose = 8
}

extension World {
    /// Where the studio works. A save from before costs starts in the garage.
    public var space: Space { business.spaceState ?? .garage }

    /// The places that the hires take now.
    public var usedRoom: Int { market.insights.reduce(0) { $0 + $1.heads } }

    /// Rent plus salaries for one week.
    public var weeklyCosts: Double {
        space.weeklyRent + market.insights.reduce(0) { $0 + $1.weeklySalary }
    }

    /// True after the studio closed (K4).
    public var isClosed: Bool { business.closedWeek != nil }

    /// Hires a person for one part of the market view, or dismisses them (K3).
    public mutating func setHire(_ insight: MarketInsight, hired: Bool) throws(CardError) {
        if hired, !market.insights.contains(insight), usedRoom + insight.heads > space.room {
            throw .badRelease("\(space.name) has no room for the \(insight.hireName). Move to a bigger place first.")
        }
        setMarketInsight(insight, on: hired)
    }

    /// Moves the studio. A move costs one month of the new rent, and the hires must fit (K3).
    public mutating func move(to newSpace: Space) throws(CardError) {
        guard newSpace != space else { return }
        guard usedRoom <= newSpace.room else {
            throw .badRelease("\(newSpace.name) has room for \(newSpace.room). Your hires need \(usedRoom).")
        }
        var b = business
        b.spaceState = newSpace
        b.record(week, -newSpace.monthlyRent, "Move to \(newSpace.name)")
        b.report(week, "The studio moved to: \(newSpace.name).")
        businessState = b
    }

    /// Rent and salaries, then the close check (K3, K4).
    mutating func payWeeklyCosts() {
        var b = business
        let rent = space.weeklyRent
        let salaries = market.insights.reduce(0) { $0 + $1.weeklySalary }
        if rent > 0 { b.record(week, -rent, "Rent: \(space.name)") }
        if salaries > 0 { b.record(week, -salaries, "Salaries: \(market.insights.count) \(market.insights.count == 1 ? "hire" : "hires")") }
        if b.cash < 0 {
            let weeks = (b.weeksBelowZero ?? 0) + 1
            b.weeksBelowZero = weeks
            if weeks == 1 { b.report(week, "Cash is below zero. The studio closes after \(Business.weeksToClose) weeks below zero.") }
            if weeks >= Business.weeksToClose {
                b.closedWeek = week
                b.report(week, "The studio closed.")
            }
        } else {
            b.weeksBelowZero = 0
        }
        businessState = b
    }

    /// The studio's history, for the closing screen.
    public var history: StudioHistory {
        let sold = business.sales.mapValues { $0.reduce(0) { $0 + $1.totalSold } }
        let best = sold.max { $0.value < $1.value }.flatMap { catalog.set($0.key)?.name }
        var cash = 0.0, peak = 0.0
        for entry in business.ledger {
            cash += entry.amount
            peak = max(peak, cash)
        }
        return StudioHistory(weeks: week, sets: business.sales.count, packsSold: sold.values.reduce(0, +), bestSet: best, peakCash: peak)
    }
}

// The effects of the upgrade hires (U5 to U16).
extension World {
    func hired(_ insight: MarketInsight) -> Bool { market.insights.contains(insight) }

    /// The share of the print cost of each pack that the studio pays (U11, U12).
    public var printCostShare: Double { hired(.printPlant) ? 0.65 : hired(.printBuyer) ? 0.85 : 1 }
    /// The setup cost of a first print run. The plant has none (U12).
    public var printSetupCost: Double { hired(.printPlant) ? 0 : Pricing.printSetup }
    /// Weeks until a reprint arrives (U11, U12).
    public var reprintDelay: Int { hired(.printPlant) ? 2 : hired(.printBuyer) ? 4 : Pricing.reprintWeeks }
    /// The marketing reach multiplier (U13).
    public var marketingReach: Double { hired(.marketingLead) ? 1.3 : 1 }
    /// The shelf reach multiplier and half-life in weeks (U14).
    var shelfBoost: Double { hired(.storeRelations) ? 1.25 : 1 }
    var shelfHalfLifeWeeks: Double { hired(.storeRelations) ? 11 : Self.shelfHalfLife }
    /// A goodwill loss, halved with collector relations (U15). Pass a negative amount.
    func goodwillLoss(_ amount: Double) -> Double { hired(.collectorRelations) ? amount / 2 : amount }
    /// The story beat strength (U7).
    var storyStrength: Double { hired(.storyWriter) ? 1.5 : 1 }
    /// Weeks for each card of an artist. The art director takes 1 week off, to 1 at least (U9).
    public func artWeeks(_ artist: Artist) -> Int { hired(.artDirector) ? max(1, artist.weeks - 1) : artist.weeks }
    /// Filler cards that a lead draws in one week (U9).
    public var fillerPerWeek: Int { hired(.artDirector) ? 35 : LeadArt.fillerPerWeek }
    /// The fame that the "Artists" factor reads. A staff illustrator lifts founder art (U10).
    public func fame(of artist: Artist) -> Double {
        artist.isFounder && hired(.staffIllustrator) ? max(artist.fame, 45) : artist.fame
    }
    /// Release knowledge stops here. Focus groups reach higher (U5).
    static let releaseKnowledgeCap = 0.7
    static let focusKnowledgeCap = 0.95

    /// Focus groups narrow the appeal readings of the roster each week (U5).
    mutating func runFocusGroups() {
        guard hired(.focusGroups) else { return }
        for i in characters.indices where characters[i].status == .active {
            for a in Audience.allCases where !a.isDerived {
                characters[i].knowledge[a] = min(Self.focusKnowledgeCap, characters[i].knowledge[a] + 0.05)
            }
        }
    }
}
