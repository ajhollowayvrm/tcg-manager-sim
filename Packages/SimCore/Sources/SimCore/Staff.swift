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
        }
    }

    public var weeklySalary: Double { salary / 52 }

    /// The places of room that the hire takes.
    public var heads: Int {
        switch self {
        case .forecast: 2
        case .curve: 3
        case .scoutNetwork: 2
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
