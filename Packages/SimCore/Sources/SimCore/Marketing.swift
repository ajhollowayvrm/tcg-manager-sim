// Marketing: campaigns for a release and a weekly brand budget
// (docs/design/costs.md, section 5; decisions K5 and K6).

import Foundation

public typealias CreatorID = Int

/// A creator that the studio can sponsor (costs.md, section 5.2).
public struct Creator: Sendable, Equatable, Identifiable {
    public let id: CreatorID
    /// FLAVOR.
    public let name: String
    public let subscribers: Double
    /// The views of one sponsored video.
    public let views: Double
    /// The share of the viewers in each audience. The shares add up to 1.
    public let mix: [Audience: Double]

    /// $25 for each 1,000 views (research.md, section 5: $10 to $50) [community-estimated].
    public var price: Double { (views / 1_000 * Marketing.creatorCPM / 50).rounded() * 50 }
    /// People who get to know the studio from one video.
    public var newPeople: Double { views * Marketing.viewToFan }
}

/// One release's campaigns (K5, K6). The studio pays all of it when it schedules the release.
public struct Campaign: Codable, Sendable, Equatable {
    public var previewBudget: Double = 0
    public var creators: [CreatorID] = []
    public var storeKits: Int = 0
    public var adBudget: Double = 0

    public init(previewBudget: Double = 0, creators: [CreatorID] = [], storeKits: Int = 0, adBudget: Double = 0) {
        self.previewBudget = previewBudget
        self.creators = creators
        self.storeKits = storeKits
        self.adBudget = adBudget
    }

    public static let none = Campaign()
}

/// Start values (costs.md, section 5.1). Each one is [inferred] unless the design gives a source.
public enum Marketing {
    /// Dollars for each new person from a preview budget.
    public static let previewCostPerPerson = 5.0
    /// Dollars for each 1,000 views of a sponsored video.
    public static let creatorCPM = 25.0
    /// Dollars for each 1,000 ad views (YouTube: $5 to $10).
    public static let adCPM = 8.0
    /// The share of the viewers that get to know the studio.
    public static let viewToFan = 0.02
    /// The studio's cost for one prerelease kit. Stores pay the rest.
    public static let kitCost = 8.0

    static let previewAudiences: [Audience] = [.chaseCollectors, .teens, .completionists, .competitivePlayers]
    static let adMix: [Audience: Double] = [.kids: 0.4, .parents: 0.4, .teens: 0.2]
    static let kitMix: [Audience: Double] = [.casualPlayers: 0.4, .competitivePlayers: 0.3, .completionists: 0.3]

    /// The creators that the studio can sponsor. The list comes from the world seed.
    static func creators(seed: UInt64) -> [Creator] {
        var rng = Xoshiro256(seed: seed)
        let names = ["PackPeel", "BinderBros", "MintCondition", "RipCity", "ChaseHunter", "TableTopTess",
                     "SleeveUp", "TheCardVault", "GradeTen", "PocketPaladin"]
        let focus: [[Audience: Double]] = [
            [.chaseCollectors: 0.5, .teens: 0.3, .investors: 0.2],
            [.completionists: 0.5, .casualPlayers: 0.3, .teens: 0.2],
            [.investors: 0.5, .chaseCollectors: 0.3, .resellers: 0.2],
            [.chaseCollectors: 0.4, .teens: 0.4, .kids: 0.2],
            [.chaseCollectors: 0.7, .artCollectors: 0.3],
            [.casualPlayers: 0.5, .competitivePlayers: 0.3, .teens: 0.2],
            [.kids: 0.5, .parents: 0.3, .teens: 0.2],
            [.completionists: 0.4, .nostalgiaAdults: 0.4, .artCollectors: 0.2],
            [.investors: 0.6, .chaseCollectors: 0.4],
            [.competitivePlayers: 0.6, .casualPlayers: 0.4],
        ]
        return names.enumerated().map { i, name in
            // From small channels up to one near the largest real ones (about 3.3M) [reported].
            let subscribers = (i == 0 ? 3_000_000 : 10_000 * pow(10, rng.uniform(0, 2.3))).rounded()
            return Creator(id: i + 1, name: name, subscribers: subscribers,
                           views: (subscribers * rng.uniform(0.1, 0.3)).rounded(), mix: focus[i])
        }
    }
}

extension World {
    /// The creators that the studio can sponsor.
    public var creators: [Creator] { Marketing.creators(seed: Self.streamSeed(seed, stream: 10)) }

    public func creator(_ id: CreatorID) -> Creator? { creators.first { $0.id == id } }

    /// The cost of a campaign.
    public func cost(of campaign: Campaign) -> Double {
        campaign.previewBudget + campaign.adBudget + Double(campaign.storeKits) * Marketing.kitCost
            + campaign.creators.compactMap(creator).reduce(0) { $0 + $1.price }
    }

    /// The new people that a campaign reaches, in total.
    public func reach(of campaign: Campaign) -> Double {
        (campaign.previewBudget / Marketing.previewCostPerPerson
            + campaign.adBudget / Marketing.adCPM * 1_000 * Marketing.viewToFan
            + Double(campaign.storeKits)
            + campaign.creators.compactMap(creator).reduce(0) { $0 + $1.newPeople }) * marketingReach
    }

    /// The campaign's reach in one week of a release's life (costs.md, section 5.1).
    /// Previews spread over the 3 weeks before release. Creators and ads land in
    /// the week before release. Store events land in release week.
    mutating func runCampaign(_ campaign: Campaign, weekOfLife w: Int) -> Double {
        var people: [Audience: Double] = [:]
        if (-Pricing.previewWeeks)...(-1) ~= w {
            let each = campaign.previewBudget / Marketing.previewCostPerPerson / Double(Pricing.previewWeeks)
            for a in Marketing.previewAudiences { people[a, default: 0] += each / Double(Marketing.previewAudiences.count) }
        }
        if w == -1 {
            let adPeople = campaign.adBudget / Marketing.adCPM * 1_000 * Marketing.viewToFan
            for (a, share) in Marketing.adMix { people[a, default: 0] += adPeople * share }
            for creator in campaign.creators.compactMap(creator) {
                for (a, share) in creator.mix { people[a, default: 0] += creator.newPeople * share }
            }
        }
        if w == 0 {
            for (a, share) in Marketing.kitMix { people[a, default: 0] += Double(campaign.storeKits) * share }
        }
        let boost = marketingReach
        var m = market
        for (a, n) in people { m.addReach(a, people: n * boost) }
        marketState = m
        return people.values.reduce(0, +) * boost
    }

    /// The weekly brand budget: ads and creators every week, release or not (K6).
    mutating func runBrandBudget() {
        let budget = business.brandBudget ?? 0
        guard budget > 0 else { return }
        let adShare = business.brandAdShare ?? 0.5
        let adPeople = budget * adShare / Marketing.adCPM * 1_000 * Marketing.viewToFan * marketingReach
        let creatorPeople = budget * (1 - adShare) / Marketing.creatorCPM * 1_000 * Marketing.viewToFan * marketingReach
        var m = market
        for (a, share) in Marketing.adMix { m.addReach(a, people: adPeople * share) }
        // The creator part follows the average mix of all creators.
        let list = creators
        for a in Audience.allCases {
            let share = list.reduce(0) { $0 + ($1.mix[a] ?? 0) } / Double(list.count)
            m.addReach(a, people: creatorPeople * share)
        }
        marketState = m
        var b = business
        b.record(week, -budget, "Brand marketing")
        businessState = b
    }

    /// Sets the weekly brand budget and its split between ads and creators (K6).
    public mutating func setBrandBudget(_ amount: Double, adShare: Double) {
        var b = business
        b.brandBudget = max(0, amount)
        b.brandAdShare = min(1, max(0, adShare))
        businessState = b
    }
}
