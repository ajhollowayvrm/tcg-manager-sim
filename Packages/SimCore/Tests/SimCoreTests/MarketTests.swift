import Foundation
import Testing
@testable import SimCore

@Suite("Market")
struct MarketTests {
    @Test("The market starts at about $8.3B a year, with a reach of about 2,000 people (A1, A7)")
    func start() {
        let market = World(seed: 1, studioName: "Test").market
        #expect(abs(market.yearlySpend - 8.33e9) < 0.01e9)
        let reached = market.audiences.reduce(0) { $0 + $1.reachedPeople }
        #expect(abs(reached - 2_000) < 1)
        #expect(market.state(.kids).reach == 0)
        #expect(market.state(.parents).reach == 0)
        #expect(market.hobbyHeat == Market.startHeat)
        #expect(market.insights.isEmpty)
    }

    @Test("Seasons: the holidays lift kids and parents, and collectors stay flat (section 3.1)")
    func seasons() {
        let market = World(seed: 2, studioName: "Test").market
        let december = 50
        #expect(Market.month(of: 0) == 0)
        #expect(Market.month(of: december) == 11)
        #expect(market.season(.kids, week: december) == 2.6)
        #expect(market.season(.parents, week: december) == 3.2)
        #expect(market.season(.chaseCollectors, week: december) == 1)
        // About half of the kids' year falls in Q4.
        let year = (0..<12).map { AudienceProfile.of(.kids).season[$0] }
        let q4 = year[9...].reduce(0, +) / year.reduce(0, +)
        #expect(abs(q4 - 0.5) < 0.05)
        #expect(Market.seasonPhrase(week: 46) == "Holiday shoppers are out")
    }

    @Test("The hobby heat moves each week, stays in range, and moves investors more than kids (section 3.2)")
    func hobby() {
        var world = World(seed: 3, studioName: "Test")
        var heats: [Double] = []
        for _ in 0..<520 {
            world.advanceWeek()
            heats.append(world.market.hobbyHeat)
            #expect((0...100).contains(world.market.hobbyHeat))
        }
        #expect(Set(heats.map { Int($0 / 10) }).count >= 3)
        var market = world.market
        market.hobbyHeat = 0
        #expect(market.hobby(.investors) == 0.3)
        #expect(market.hobby(.kids) == 0.9)
        market.hobbyHeat = 100
        #expect(market.hobby(.resellers) == 2.0)
        #expect(abs(market.hobby(.chaseCollectors) - 1.4) < 1e-9)
    }

    @Test("Fatigue halves in about 6 weeks, goodwill fades, and both move demand (sections 3.3, 3.4)")
    func fatigueAndGoodwill() {
        var world = World(seed: 4, studioName: "Test")
        var market = world.market
        market.addReleaseFatigue(size: 200, type: .main)
        market.changeGoodwill(.chaseCollectors, by: -100)
        #expect(abs(market.state(.completionists).fatigue - 0.6) < 1e-9)
        #expect(abs(market.fatigueMultiplier(.completionists) - 0.82) < 1e-9)
        #expect(abs(market.goodwillMultiplier(.chaseCollectors) - 0.7) < 1e-9)
        world.marketState = market
        for _ in 0..<6 { world.advanceWeek() }
        #expect(abs(world.market.state(.completionists).fatigue - 0.3) < 1e-9)
        #expect(world.market.state(.chaseCollectors).goodwill > -100)
        #expect(Market.fatiguePhrase(0.3) == "A little tired of releases")
        // A promo set adds little fatigue.
        var promo = World(seed: 5, studioName: "Test").market
        promo.addReleaseFatigue(size: 15, type: .promo)
        #expect(promo.state(.kids).fatigue == 0.05)
    }

    @Test("A small studio barely moves the hobby heat. A big one moves it fully (A6)")
    func studioEffect() {
        var small = World(seed: 6, studioName: "Test").market
        small.studioResult(10)
        // The start studio has about 0.007% of the market, so a +10 result moves the heat by about 0.014.
        #expect(abs(small.hobbyHeat - Market.startHeat) < 0.05)
        var big = small
        for a in Audience.allCases { big.addReach(a, people: big.state(a).people * 0.06) }
        big.studioResult(10)
        #expect(abs(big.hobbyHeat - (small.hobbyHeat + 10)) < 1e-9)
    }

    @Test("A reading always holds the true value, never changes for the same value, and sharpens with an upgrade (A5)")
    func readings() {
        var world = World(seed: 7, studioName: "Test")
        let market = world.market
        for a in Audience.allCases {
            let value = market.state(a).people
            let range = market.reading(value, a, field: 1)
            #expect(range.contains(value))
            #expect(range == market.reading(value, a, field: 1))
        }
        let wide = market.reading(1_000, .kids, field: 1)
        world.setMarketInsight(.sharp, on: true)
        let narrow = world.market.reading(1_000, .kids, field: 1)
        #expect(narrow.upperBound - narrow.lowerBound < wide.upperBound - wide.lowerBound)
        #expect(world.market.insights == [.sharp])
    }

    @Test("Reach fades with no new product, and the market survives a JSON round trip")
    func reachAndSave() throws {
        var world = World(seed: 8, studioName: "Test")
        let before = world.market.state(.casualPlayers).reachedPeople
        for _ in 0..<104 { world.advanceWeek() }
        let after = world.market.state(.casualPlayers).reachedPeople
        #expect(abs(after / before - 0.5) < 0.01)
        #expect(try roundTrip(world) == world)
    }
}

@Suite("Market calendar")
struct MarketCalendarTests {
    @Test("The calendar names the month and the year")
    func calendar() {
        #expect(Market.calendar(week: 0) == "January, year 1")
        #expect(Market.calendar(week: 50) == "December, year 1")
        #expect(Market.calendar(week: 52) == "January, year 2")
    }
}
