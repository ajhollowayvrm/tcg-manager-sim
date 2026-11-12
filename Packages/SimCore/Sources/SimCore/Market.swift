// The market around the studio (docs/design/audiences.md; decisions A1 to A7).
//
// Each audience has a real-world size and spend, and the studio's reach in it.
// Four conditions move the audiences each week: the season, the hobby heat,
// release fatigue, and the studio's goodwill. The market has its own random
// stream, and a read never draws a random number.

import Foundation

/// A part of the market view that a studio upgrade unlocks (A5, audiences.md section 10.1).
public enum MarketInsight: String, CaseIterable, Codable, Sendable, Identifiable {
    case sizes, reach, goodwill, fatigue, rhythms, forecast, curve, sharp

    public var id: String { rawValue }

    /// FLAVOR. The name of the upgrade.
    public var upgradeName: String {
        switch self {
        case .sizes: "Market desk"
        case .reach: "Fan survey"
        case .goodwill: "Community manager"
        case .fatigue: "Release planner"
        case .rhythms: "Buyer research"
        case .forecast: "Analytics team"
        case .curve: "Data department"
        case .sharp: "Data science"
        }
    }

    public var unlocks: String {
        switch self {
        case .sizes: "The size of each audience, as a range"
        case .reach: "Your reach in each audience, as a range"
        case .goodwill: "How each audience feels about your studio"
        case .fatigue: "How tired each audience is of new releases"
        case .rhythms: "When each audience buys over a set's life"
        case .forecast: "A first-month forecast for each set"
        case .curve: "The forecast week by week"
        case .sharp: "Every range is half as wide"
        }
    }
}

/// The fixed facts of one audience (audiences.md, sections 2 to 4). Hidden.
public struct AudienceProfile: Sendable {
    /// People in the world at the start.
    public let people: Double
    /// Dollars per person per year.
    public let spend: Double
    /// The season multiplier for each month, January first (section 3.1).
    public let season: [Double]
    /// The demand multiplier at hobby heat 0 and at hobby heat 100 (section 3.2).
    public let hobbyLow: Double
    public let hobbyHigh: Double
    /// How much fatigue lowers this audience's demand, 0 to 1 (section 3.3).
    public let fatigueWeight: Double
    /// People who know the studio at the start (section 2.3; A7).
    public let startReach: Double
    /// The buying rhythm, for the market screen (section 4).
    public let rhythm: String

    static let flat = Array(repeating: 1.0, count: 12)

    public static func of(_ audience: Audience) -> AudienceProfile {
        switch audience {
        case .kids:
            AudienceProfile(people: 25_000_000, spend: 60,
                            season: [0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 1.2, 2.2, 2.6],
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 0.3, startReach: 0,
                            rhythm: "Even for months, with a big holiday lift.")
        case .parents:
            AudienceProfile(people: 30_000_000, spend: 40,
                            season: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1.2, 2.6, 3.2],
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 0.3, startReach: 0,
                            rhythm: "Small at release. Holidays and birthdays.")
        case .teens:
            AudienceProfile(people: 10_000_000, spend: 90,
                            season: [0.9, 0.9, 0.9, 0.9, 0.9, 1.2, 1.2, 1.2, 0.9, 1.0, 1.2, 1.4],
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 0.6, startReach: 100,
                            rhythm: "A peak in the first month, then a slow fall.")
        case .casualPlayers:
            AudienceProfile(people: 8_000_000, spend: 100,
                            season: [0.95, 0.95, 0.95, 0.95, 0.95, 1.1, 1.1, 1.1, 0.95, 1.0, 1.1, 1.2],
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 0.6, startReach: 600,
                            rhythm: "Even, for months.")
        case .competitivePlayers:
            AudienceProfile(people: 2_000_000, spend: 500,
                            season: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9],
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 1.0, startReach: 200,
                            rhythm: "A peak in release week for the playable cards.")
        case .nostalgiaAdults:
            AudienceProfile(people: 5_000_000, spend: 150, season: flat,
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 0.6, startReach: 0,
                            rhythm: "Small and slow. Reprints and anniversaries.")
        case .completionists:
            AudienceProfile(people: 2_000_000, spend: 300, season: flat,
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 1.0, startReach: 500,
                            rhythm: "Medium at release, then a long tail of 6 to 12 months.")
        case .chaseCollectors:
            AudienceProfile(people: 1_500_000, spend: 400, season: flat,
                            hobbyLow: 0.7, hobbyHigh: 1.4, fatigueWeight: 0.6, startReach: 500,
                            rhythm: "Preorders, then a peak in weeks 1 and 2. Then singles, not packs.")
        case .artCollectors:
            AudienceProfile(people: 300_000, spend: 600, season: flat,
                            hobbyLow: 0.9, hobbyHigh: 1.1, fatigueWeight: 0.6, startReach: 100,
                            rhythm: "Weeks 2 to 8, after the singles prices settle.")
        case .investors:
            AudienceProfile(people: 500_000, spend: 800, season: flat,
                            hobbyLow: 0.3, hobbyHigh: 2.0, fatigueWeight: 0.6, startReach: 0,
                            rhythm: "Preorders and some sealed product. A second peak when the set goes out of print.")
        case .resellers:
            AudienceProfile(people: 200_000, spend: 2_000, season: flat,
                            hobbyLow: 0.3, hobbyHigh: 2.0, fatigueWeight: 0.6, startReach: 0,
                            rhythm: "Preorders and release week. They come back only for a restock or a reprint.")
        }
    }

    /// True for the audiences whose size follows the hobby heat strongly.
    var followsHobby: Bool { hobbyHigh >= 2 }
}

/// The state of one audience. Indexed by `Audience.rawValue` in the market.
public struct AudienceState: Codable, Sendable, Equatable {
    /// People in the world now.
    public internal(set) var people: Double
    /// Dollars per person per year.
    public internal(set) var spend: Double
    /// The share of the audience that knows the studio, 0 to 1.
    public internal(set) var reach: Double
    /// -100 to 100 (section 3.4).
    public internal(set) var goodwill: Double
    /// 0 to 1 (section 3.3).
    public internal(set) var fatigue: Double

    /// The people who know the studio.
    public var reachedPeople: Double { people * reach }
}

public struct Market: Codable, Sendable, Equatable {
    public internal(set) var audiences: [AudienceState]
    /// 0 to 100, market-wide (section 3.2). Common knowledge, shown as a phrase.
    public internal(set) var hobbyHeat: Double
    /// Hidden. The heat moves toward it.
    var hobbyTarget: Double
    var targetWeeksLeft: Int
    /// The unlocked parts of the market view (A5).
    public internal(set) var insights: Set<MarketInsight>
    /// Fixes the offset of each reading, so a reading never draws a random number.
    let readingSeed: UInt64
    /// Stream: the hobby heat.
    var rng: Xoshiro256

    // Start values (audiences.md, sections 3.2 to 3.4).
    public static let startHeat = 75.0
    static let startTarget = 65.0
    static let startTargetWeeks = 78
    /// Weekly factors: fatigue halves in about 6 weeks, goodwill in about a year,
    /// and reach in about two years with no new product.
    static let fatigueDecay = pow(0.5, 1.0 / 6)
    static let goodwillDecay = pow(0.5, 1.0 / 52)
    static let reachDecay = pow(0.5, 1.0 / 104)
    /// The studio's share of the market's money at which its results move the
    /// hobby heat fully (A6).
    static let fullHobbyShare = 0.05

    public init(seed: UInt64) {
        audiences = Audience.allCases.map { a in
            let p = AudienceProfile.of(a)
            return AudienceState(people: p.people, spend: p.spend, reach: p.startReach / p.people, goodwill: 0, fatigue: 0)
        }
        hobbyHeat = Self.startHeat
        hobbyTarget = Self.startTarget
        targetWeeksLeft = Self.startTargetWeeks
        insights = []
        var mixer = SplitMix64(seed: seed)
        readingSeed = mixer.next()
        rng = Xoshiro256(seed: mixer.next())
    }

    public func state(_ audience: Audience) -> AudienceState { audiences[audience.rawValue] }

    // MARK: - The week

    /// One week passes: the hobby heat moves, sizes follow it, and fatigue,
    /// goodwill, and reach fade.
    mutating func advance() {
        targetWeeksLeft -= 1
        if targetWeeksLeft <= 0 {
            hobbyTarget = rng.uniform(15, 95)
            targetWeeksLeft = rng.int(52, 156)
        }
        hobbyHeat = min(100, max(0, hobbyHeat + (hobbyTarget - hobbyHeat) * 0.03 + rng.gauss() * 0.8))
        for a in Audience.allCases {
            let p = AudienceProfile.of(a)
            var s = audiences[a.rawValue]
            let reached = s.reachedPeople
            let goal = p.people * (p.followsHobby ? 0.5 + hobbyHeat / 100 : 0.95 + 0.1 * hobbyHeat / 100)
            s.people += (goal - s.people) * 0.01
            s.reach = min(1, reached * Self.reachDecay / s.people)
            s.fatigue *= Self.fatigueDecay
            s.goodwill *= Self.goodwillDecay
            audiences[a.rawValue] = s
        }
    }

    // MARK: - The conditions (audiences.md, section 3)

    /// The month of a week, 0 for January. The game starts in January of year 1.
    public static func month(of week: Int) -> Int { (week % 52) * 12 / 52 }

    static let monthNames = ["January", "February", "March", "April", "May", "June",
                             "July", "August", "September", "October", "November", "December"]

    /// "March, year 2".
    public static func calendar(week: Int) -> String { "\(monthNames[month(of: week)]), year \(week / 52 + 1)" }

    public func season(_ audience: Audience, week: Int) -> Double {
        AudienceProfile.of(audience).season[Self.month(of: week)]
    }

    public func hobby(_ audience: Audience) -> Double {
        let p = AudienceProfile.of(audience)
        return p.hobbyLow + (p.hobbyHigh - p.hobbyLow) * hobbyHeat / 100
    }

    /// Fatigue lowers demand by up to 30%, scaled by the audience's weight.
    public func fatigueMultiplier(_ audience: Audience) -> Double {
        1 - 0.3 * AudienceProfile.of(audience).fatigueWeight * state(audience).fatigue
    }

    /// About 70% at goodwill -100, and about 120% at +100.
    public func goodwillMultiplier(_ audience: Audience) -> Double {
        let g = state(audience).goodwill
        return g < 0 ? 1 + 0.3 * g / 100 : 1 + 0.2 * g / 100
    }

    /// The weekly money of the people who know the studio, with all four
    /// conditions. A set takes a share of it (section 5).
    public func weeklyPotential(_ audience: Audience, week: Int) -> Double {
        let s = state(audience)
        return s.reachedPeople * s.spend / 52 * season(audience, week: week) * hobby(audience)
            * fatigueMultiplier(audience) * goodwillMultiplier(audience)
    }

    /// The whole market's money in one year, with no conditions.
    public var yearlySpend: Double { audiences.reduce(0) { $0 + $1.people * $1.spend } }

    /// The studio's share of the market's money.
    public var studioShare: Double {
        audiences.reduce(0) { $0 + $1.reachedPeople * $1.spend } / yearlySpend
    }

    // MARK: - Events for later systems

    /// A release tires each audience. A larger set tires it more. A promo set adds little.
    public mutating func addReleaseFatigue(size: Int, type: SetType) {
        let amount = type == .promo ? 0.05 : 0.6 * min(1, Double(size) / 200)
        for i in audiences.indices { audiences[i].fatigue = min(1, audiences[i].fatigue + amount) }
    }

    public mutating func changeGoodwill(_ audience: Audience, by amount: Double) {
        audiences[audience.rawValue].goodwill = min(100, max(-100, audiences[audience.rawValue].goodwill + amount))
    }

    public mutating func addReach(_ audience: Audience, people: Double) {
        let s = audiences[audience.rawValue]
        audiences[audience.rawValue].reach = min(1, max(0, (s.reachedPeople + people) / s.people))
    }

    /// A hit (positive) or a flop (negative) moves the hobby heat. A small studio
    /// moves it very little. A studio with 5% of the market moves it fully (A6).
    public mutating func studioResult(_ result: Double) {
        let scale = min(1, studioShare / Self.fullHobbyShare)
        hobbyHeat = min(100, max(0, hobbyHeat + result * scale))
    }

    mutating func setInsight(_ insight: MarketInsight, on: Bool) {
        if on { insights.insert(insight) } else { insights.remove(insight) }
    }

    // MARK: - Readings

    /// A range around a hidden value. The offset is fixed for each audience and
    /// field, so the same value always gives the same range. The true value is
    /// always inside the range. "Data science" halves the width (A5).
    public func reading(_ value: Double, _ audience: Audience, field: UInt64) -> ClosedRange<Double> {
        let width = insights.contains(.sharp) ? 0.1 : 0.2
        var mixer = SplitMix64(seed: readingSeed ^ (UInt64(audience.rawValue + 1) &* 0x9E37_79B9) ^ (field &* 0xBF58_476D))
        let offset = (mixer.unit() - 0.5) * width
        return value * (1 + offset) * (1 - width)...value * (1 + offset) * (1 + width)
    }

    // MARK: - Phrases

    public var hobbyPhrase: String {
        switch hobbyHeat {
        case ..<20: "The hobby is in a slump"
        case ..<40: "The hobby is cool"
        case ..<60: "The hobby is steady"
        case ..<80: "The hobby is hot"
        default: "The hobby is booming"
        }
    }

    /// Rising, steady, or falling. Common knowledge, like the phrase.
    public var hobbyDirection: Int {
        hobbyTarget > hobbyHeat + 5 ? 1 : hobbyTarget < hobbyHeat - 5 ? -1 : 0
    }

    public static func seasonPhrase(week: Int) -> String {
        switch month(of: week) {
        case 9: "The holidays are coming"
        case 10, 11: "Holiday shoppers are out"
        case 5, 6, 7: "Summer break"
        default: "A normal season"
        }
    }

    public static func goodwillPhrase(_ goodwill: Double) -> String {
        switch goodwill {
        case ..<(-50): "Angry with you"
        case ..<(-15): "Unhappy with you"
        case ..<15: "Neutral about you"
        case ..<50: "Likes you"
        default: "Trusts you"
        }
    }

    public static func fatiguePhrase(_ fatigue: Double) -> String {
        switch fatigue {
        case ..<0.2: "Fresh"
        case ..<0.5: "A little tired of releases"
        case ..<0.8: "Tired of releases"
        default: "Worn out by releases"
        }
    }
}

extension World {
    /// The market (audiences.md). A save from before the market starts with the
    /// start values from the world seed.
    public var market: Market { marketState ?? Market(seed: Self.streamSeed(seed, stream: 6)) }

    /// Unlocks or locks one part of the market view. Until money exists, a
    /// developer tool calls this (audiences.md, section 6).
    public mutating func setMarketInsight(_ insight: MarketInsight, on: Bool) {
        var m = market
        m.setInsight(insight, on: on)
        marketState = m
    }

    mutating func advanceMarket() {
        var m = market
        m.advance()
        marketState = m
    }
}
