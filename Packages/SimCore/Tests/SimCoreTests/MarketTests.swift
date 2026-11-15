import Testing
@testable import SimCore

private func edit(_ world: inout World, _ change: (inout Market) -> Void) {
    var m = world.market
    change(&m)
    world.marketState = m
}

@Suite("Market")
struct MarketTests {
    @Test("The calendar has 12 months in 52 weeks, and the game starts in January (A2)")
    func calendar() {
        #expect(Market.month(of: 0) == 0)
        #expect(Market.month(of: 51) == 11)
        #expect(Market.month(of: 52) == 0)
        #expect(Market.calendar(week: 0) == "January, year 1")
        #expect(Market.calendar(week: 78) == "July, year 2")
    }

    @Test("Each audience starts with its own reach, and the hidden facts fit the design (A7)")
    func startValues() {
        let m = Market(seed: 1)
        #expect(m.audiences.count == Audience.allCases.count)
        #expect(m.hobbyHeat == Market.startHeat)
        let teens = m.state(.teens).reachedPeople
        let casual = m.state(.casualPlayers).reachedPeople
        #expect(abs(teens - 100) < 0.001)
        #expect(abs(casual - 600) < 0.001)
        #expect(m.state(.kids).reach == 0)
        #expect(m.insights.isEmpty)
    }

    @Test("The season multiplier follows the month (A3)")
    func season() {
        let m = Market(seed: 1)
        #expect(m.season(.kids, week: 51) == 2.6)
        #expect(m.season(.kids, week: 10) == 0.67)
        #expect(m.season(.nostalgiaAdults, week: 51) == 1)
        #expect(Market.seasonPhrase(week: 40) == "The holidays are coming")
        #expect(Market.seasonPhrase(week: 5) == "A normal season")
    }

    @Test("Hobby heat moves the demand between the audience's low and high multiplier (A4)")
    func hobby() {
        var m = Market(seed: 1)
        m.hobbyHeat = 0
        #expect(m.hobby(.investors) == 0.3)
        m.hobbyHeat = 100
        #expect(m.hobby(.investors) == 2.0)
        #expect(m.hobby(.kids) == 1.1)
    }

    @Test("Fatigue lowers demand by up to 30%, and goodwill moves it from 70% to 120% (A3)")
    func conditions() {
        var m = Market(seed: 1)
        #expect(m.fatigueMultiplier(.competitivePlayers) == 1)
        m.audiences[Audience.competitivePlayers.rawValue].fatigue = 1
        let tired = m.fatigueMultiplier(.competitivePlayers)
        #expect(abs(tired - 0.7) < 1e-9)
        m.changeGoodwill(.kids, by: -500)
        #expect(m.state(.kids).goodwill == -100)
        let angry = m.goodwillMultiplier(.kids)
        #expect(abs(angry - 0.7) < 1e-9)
        m.changeGoodwill(.kids, by: 500)
        let loved = m.goodwillMultiplier(.kids)
        #expect(abs(loved - 1.2) < 1e-9)
    }

    @Test("A release adds fatigue by set size, a promo adds little, and fatigue stops at 1 (A3)")
    func releaseFatigue() {
        var m = Market(seed: 1)
        m.addReleaseFatigue(size: 100, type: .main)
        let half = m.state(.kids).fatigue
        #expect(abs(half - 0.3) < 1e-9)
        m.addReleaseFatigue(size: 500, type: .main)
        let high = m.state(.kids).fatigue
        #expect(abs(high - 0.9) < 1e-9)
        m.addReleaseFatigue(size: 500, type: .main)
        #expect(m.state(.kids).fatigue == 1)
        var promo = Market(seed: 1)
        promo.addReleaseFatigue(size: 500, type: .promo)
        #expect(promo.state(.kids).fatigue == 0.05)
    }

    @Test("Reach grows by people, never passes the audience, and never goes below zero (A7)")
    func reach() {
        var m = Market(seed: 1)
        m.addReach(.kids, people: 1_000)
        let reached = m.state(.kids).reachedPeople
        #expect(abs(reached - 1_000) < 0.001)
        m.addReach(.kids, people: 1e12)
        #expect(m.state(.kids).reach == 1)
        m.addReach(.kids, people: -1e15)
        #expect(m.state(.kids).reach == 0)
    }

    @Test("Each week fatigue halves in 6 weeks, goodwill fades, and the heat stays from 0 to 100 (A3)")
    func weeklyDecay() {
        var m = Market(seed: 1)
        m.audiences[0].fatigue = 0.8
        m.audiences[0].goodwill = 60
        for _ in 0..<6 { m.advance() }
        let fatigue = m.state(.kids).fatigue
        #expect(abs(fatigue - 0.4) < 1e-9)
        #expect(m.state(.kids).goodwill < 60)
        #expect(m.state(.kids).goodwill > 0)
        for _ in 0..<150 {
            m.advance()
            #expect(m.hobbyHeat >= 0 && m.hobbyHeat <= 100)
        }
    }

    @Test("A small studio moves the hobby heat little, and a studio with 5% of the market moves it fully (A6)")
    func studioResult() {
        var small = Market(seed: 1)
        small.hobbyHeat = 50
        small.studioResult(10)
        #expect(small.hobbyHeat < 51)
        var big = Market(seed: 1)
        big.hobbyHeat = 50
        for a in Audience.allCases { big.addReach(a, people: 1e12) }
        big.studioResult(10)
        #expect(big.hobbyHeat == 60)
        big.studioResult(500)
        #expect(big.hobbyHeat == 100)
    }

    @Test("Weekly potential is reach times spend, with all four conditions (A3)")
    func weeklyPotential() {
        var m = Market(seed: 1)
        m.addReach(.teens, people: 5_000)
        m.hobbyHeat = 50
        m.audiences[Audience.teens.rawValue].fatigue = 0.5
        m.changeGoodwill(.teens, by: 50)
        let s = m.state(.teens)
        let base = s.reachedPeople * s.spend / 52
        let conditions = m.season(.teens, week: 20) * m.hobby(.teens) * m.fatigueMultiplier(.teens) * m.goodwillMultiplier(.teens)
        let expected = base * conditions
        let actual = m.weeklyPotential(.teens, week: 20)
        #expect(abs(actual - expected) < 1e-6)
    }

    @Test("A reading holds the true value, is the same each time, draws no number, and is half as wide with Data science (A5)")
    func readings() throws {
        var world = try Fixture.world().world
        let m = world.market
        let wide = m.reading(1_000, .teens, field: 1)
        #expect(wide.contains(1_000))
        #expect(m.reading(1_000, .teens, field: 1) == wide)
        #expect(world.market == m)
        world.setMarketInsight(.sharp, on: true)
        let sharp = world.market.reading(1_000, .teens, field: 1)
        #expect(sharp.contains(1_000))
        let wideWidth = wide.upperBound - wide.lowerBound
        let sharpWidth = sharp.upperBound - sharp.lowerBound
        #expect(sharpWidth < wideWidth * 0.55)
    }

    @Test("Insights switch on and off, and only the market research hires show the Market tab (A5, K11)")
    func insights() throws {
        var world = try Fixture.world().world
        world.setMarketInsight(.fatigue, on: true)
        #expect(world.market.insights.contains(.fatigue))
        world.setMarketInsight(.fatigue, on: false)
        #expect(world.market.insights.isEmpty)
        let marketView = Set(MarketInsight.allCases.filter { $0.isMarketView })
        let expected: Set<MarketInsight> = [.sizes, .reach, .goodwill, .fatigue, .rhythms, .sharp]
        #expect(marketView == expected)
    }

    @Test("Phrases change at their thresholds")
    func phrases() {
        #expect(Market.goodwillPhrase(-80) == "Angry with you")
        #expect(Market.goodwillPhrase(0) == "Neutral about you")
        #expect(Market.goodwillPhrase(60) == "Trusts you")
        #expect(Market.fatiguePhrase(0.1) == "Fresh")
        #expect(Market.fatiguePhrase(0.9) == "Worn out by releases")
        var m = Market(seed: 1)
        m.hobbyHeat = 10
        #expect(m.hobbyPhrase == "The hobby is in a slump")
        m.hobbyHeat = 90
        #expect(m.hobbyPhrase == "The hobby is booming")
    }

    @Test("The market is the same for the same seed, and a world with no market state starts from its seed (A1)")
    func determinism() throws {
        var a = Market(seed: 7)
        var b = Market(seed: 7)
        for _ in 0..<20 {
            a.advance()
            b.advance()
        }
        #expect(a == b)
        var world = try Fixture.world().world
        world.marketState = nil
        #expect(world.market == Market(seed: World.streamSeed(world.seed, stream: 6)))
    }
}
