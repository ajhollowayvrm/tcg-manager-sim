// The weekly selling step and the forecast (docs/design/sales.md, sections 4 and 7
// to 10; decisions B4, B7 to B10).

import Foundation

extension World {
    // Growth constants (B9).
    /// New people that one sold pack tells, in the same audience.
    static let wordOfMouth = 0.05
    /// New people that 1,000 packs in stores reach each week, before the audience's affinity.
    static let shelfReach = 20.0
    /// Packs that one buyer buys on average, to turn packs into people.
    static let packsPerBuyer = 3.0
    /// Reach that the previews add each week before release, as people.
    static let previewReach = 60.0

    /// Runs one week of sales for every scheduled or released set. `noise` is off
    /// for the forecast.
    mutating func runSales(noise: Bool) {
        for i in catalog.sets.indices where catalog.sets[i].release != nil {
            runSales(setIndex: i, noise: noise)
        }
    }

    private mutating func runSales(setIndex i: Int, noise: Bool) {
        guard var release = catalog.sets[i].release else { return }
        let set = catalog.sets[i]
        let w = week - release.releaseWeek

        // Reprints that arrive this week (B8).
        let arrived = release.pendingReprints.filter { $0.arrivalWeek <= week }
        if !arrived.isEmpty {
            let packs = arrived.reduce(0) { $0 + $1.packs }
            release.stockPacks += Double(packs)
            release.printedPacks += packs
            release.pendingReprints.removeAll { $0.arrivalWeek <= week }
            news("A reprint of \(set.name) arrived: \(packs.formatted()) packs.")
            changeMarket { m in
                m.changeGoodwill(.kids, by: 5)
                m.changeGoodwill(.parents, by: 5)
                m.changeGoodwill(.completionists, by: 5)
                m.changeGoodwill(.investors, by: -5)
            }
        }

        // Previews in the weeks before release (B9).
        if w < 0 {
            if w >= -Pricing.previewWeeks {
                changeMarket { m in
                    for a in [Audience.chaseCollectors, .teens, .completionists, .competitivePlayers] {
                        m.addReach(a, people: Self.previewReach)
                    }
                }
            }
            catalog.sets[i].release = release
            return
        }
        guard w < Rhythm.weeks else {
            catalog.sets[i].release = release
            return
        }

        let demand = setDemand(set.id, packPrice: release.packPrice)

        // Release week (B10).
        if w == 0 {
            catalog.sets[i].status = .released
            news("\(set.name) is out: \(release.printedPacks.formatted()) packs at \(String(format: "$%.2f", release.packPrice)).")
            let chase = demand[Audience.chaseCollectors.rawValue].factors.first { $0.name == "Pull rates" }?.value ?? 1
            changeMarket { m in
                m.addReleaseFatigue(size: set.size, type: set.type)
                if chase < 0.85 { m.changeGoodwill(.chaseCollectors, by: -8) }
            }
        }

        // Demand from each audience, in packs (B4).
        var wanted = Array(repeating: 0.0, count: Audience.allCases.count)
        var b = business
        for d in demand where d.audience != .resellers {
            let a = d.audience
            let m = market
            var dollars = d.lifetimeDollars * Rhythm.weight(a, week: w)
                * m.season(a, week: week) * m.hobby(a) * m.fatigueMultiplier(a) * m.goodwillMultiplier(a)
            if noise { dollars *= exp(b.rng.gauss() * 0.15) }
            wanted[a.rawValue] = max(0, dollars / release.packPrice)
        }
        let others = wanted.reduce(0, +)

        // Resellers take a share of the stock first when demand is above it (B7).
        let stockBefore = release.stockPacks
        var resellerPacks = 0.0
        if w <= 1, others > stockBefore, stockBefore > 0 {
            let gap = others / stockBefore
            let share = min(0.5, 0.25 * (gap - 1)) * (w == 0 ? 1 : 0.5)
            resellerPacks = stockBefore * share
        }
        let left = stockBefore - resellerPacks
        let fill = others > 0 ? min(1, left / others) : 0
        var sold = wanted.map { $0 * fill }
        sold[Audience.resellers.rawValue] = resellerPacks
        let missed = wanted.map { $0 * (1 - fill) }
        let total = sold.reduce(0, +)
        release.stockPacks = max(0, stockBefore - total)

        // A sell-out where resellers took a quarter or more costs goodwill (B7).
        if w <= 1, !release.selloutNoted, release.stockPacks < 1, total > 0, resellerPacks / total >= 0.25 {
            release.selloutNoted = true
            changeMarket { m in
                for a in [Audience.kids, .parents, .chaseCollectors] { m.changeGoodwill(a, by: -15) }
            }
        }

        // Money (B3).
        let revenue = total * release.packPrice * Pricing.publisherShare
        b.sales[set.id, default: []].append(WeekSales(week: week, sold: sold, missed: missed, revenue: revenue, stockAfter: release.stockPacks))
        if revenue > 0 { b.record(week, revenue, "Sales: \(set.name)") }
        if stockBefore >= 1, release.stockPacks < 1 {
            b.report(week, "\(set.name) sold out in week \(w) of its life."
                + (resellerPacks >= 1 ? " Resellers took \(Int(resellerPacks.rounded()).formatted()) packs." : ""))
        }
        businessState = b

        // Growth: word of mouth, shelf discovery, and character awareness (B9).
        let characterFactor: [Double] = demand.map { d in d.factors.first { $0.name == "Characters" }?.value ?? 1 }
        let affinity = Audience.allCases.map { prefs($0).shelfAffinity }
        changeMarket { m in
            for a in Audience.allCases where a != .resellers {
                let spoken = sold[a.rawValue] * Self.wordOfMouth * min(2, characterFactor[a.rawValue])
                let shelf = stockBefore / 1_000 * Self.shelfReach * affinity[a.rawValue]
                m.addReach(a, people: spoken + shelf)
            }
        }
        learnCharacters(set: set, sold: sold, firstWeeks: w < 4)

        // The week-4 review (B10).
        if w == 4, !release.reviewed {
            release.reviewed = true
            review(demand)
        }
        catalog.sets[i].release = release
    }

    /// The buyers of each audience learn the set's characters. The headliner gains the most.
    private mutating func learnCharacters(set: CardSet, sold: [Double], firstWeeks: Bool) {
        let cards = catalog.allCards(in: set.id)
        var weights: [CharacterID: Double] = [:]
        for card in cards {
            let id = card.characterID
            let w = card.filler ? 0.3 : (set.headliner?.characterID == id ? 1.5 : 1)
            weights[id] = max(weights[id] ?? 0, w)
        }
        let total = sold.reduce(0, +)
        for (index, character) in characters.enumerated() {
            guard let w = weights[character.id] else { continue }
            var c = character
            for a in Audience.allCases {
                let buyers = sold[a.rawValue] / Self.packsPerBuyer
                let people = market.state(a).people
                c.awareness[a] = min(1, c.awareness[a] + buyers / people * w)
            }
            if firstWeeks, !(set.headliner == nil && w < 1) {
                c.buzz = min(100, c.buzz + min(15, total / 1_000) * w)
            }
            characters[index] = c
        }
    }

    /// Week 4: a strong set raises goodwill, a weak set lowers it. A large studio's
    /// result moves the hobby heat (B10, A6).
    private mutating func review(_ demand: [AudienceDemand]) {
        let weighted = demand.filter { $0.audience != .resellers }
        let weight = weighted.reduce(0) { $0 + $1.reachedPeople * $1.spend }
        guard weight > 0 else { return }
        let quality = weighted.reduce(0) { $0 + $1.product * $1.reachedPeople * $1.spend } / weight
        changeMarket { m in
            for d in weighted where d.reachedPeople > 0 {
                if quality > 1.3 { m.changeGoodwill(d.audience, by: 10) }
                if quality < 0.7 { m.changeGoodwill(d.audience, by: -5) }
            }
            m.studioResult((quality - 1) * 5)
        }
        news(quality > 1.3 ? "Week 4 review: a strong set. Its buyers like you more."
             : quality < 0.7 ? "Week 4 review: a weak set. Its buyers like you less."
             : "Week 4 review: a normal set.")
    }

    private mutating func news(_ text: String) {
        var b = business
        b.report(week, text)
        businessState = b
    }

    private mutating func changeMarket(_ change: (inout Market) -> Void) {
        var m = market
        change(&m)
        marketState = m
    }

    // MARK: - Forecast

    /// The weekly sales of a set from its release, with no noise (sales.md, section 11).
    /// For a draft set, pass a plan. The forecast runs on a copy of the world, so it
    /// changes nothing and draws no number from a stream of this world.
    public func forecast(_ setID: SetID, boxes: Int? = nil, packPrice: Double? = nil, releaseWeek: Int? = nil,
                         weeks: Int = 12) -> [WeekSales] {
        var copy = self
        guard let i = copy.catalog.sets.firstIndex(where: { $0.id == setID }) else { return [] }
        if copy.catalog.sets[i].release == nil {
            guard let boxes, let packPrice, let releaseWeek else { return [] }
            let packs = boxes * copy.catalog.sets[i].pack.boxSize
            copy.catalog.sets[i].release = SetRelease(releaseWeek: releaseWeek, packPrice: packPrice, printedPacks: packs,
                                                      stockPacks: Double(packs), pendingReprints: [], reviewed: false,
                                                      selloutNoted: false)
            copy.catalog.sets[i].status = .scheduled
        }
        guard let release = copy.catalog.sets[i].release else { return [] }
        let start = max(copy.week + 1, release.releaseWeek)
        let end = max(start, release.releaseWeek) + weeks - 1
        while copy.week < end { copy.advanceWeek(noise: false) }
        return (copy.business.sales[setID] ?? []).filter { $0.week >= start && $0.week <= end }
    }
}
