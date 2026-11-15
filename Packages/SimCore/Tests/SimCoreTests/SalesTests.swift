import Testing
@testable import SimCore

/// A big print run, so the first weeks do not sell out.
private let bigRun = 2_000

private func lastSales(_ world: World, _ set: SetID) -> WeekSales? {
    world.business.sales[set]?.last
}

private func goodwill(_ world: World, _ audience: Audience) -> Double {
    world.market.state(audience).goodwill
}

@Suite("Sales")
struct SalesTests {
    @Test("Release week puts the set on sale, books revenue as the studio's share, and tires the audiences (B3, B10)")
    func releaseWeek() throws {
        let (world, set, mascot) = try Fixture.released(boxes: bigRun)
        let release = try #require(world.catalog.set(set)?.release)
        let sales = try #require(lastSales(world, set))
        #expect(world.business.sales[set]?.count == 1)
        #expect(sales.week == release.releaseWeek)
        #expect(sales.totalSold > 0)
        let revenue = sales.totalSold * release.packPrice * Pricing.publisherShare
        #expect(abs(sales.revenue - revenue) < 1e-6)
        let packs = Double(release.printedPacks)
        #expect(abs(sales.stockAfter - (packs - sales.totalSold)) < 1e-6)
        #expect(release.stockPacks == sales.stockAfter)
        #expect(sales.sold[Audience.resellers.rawValue] == 0)
        #expect(release.fansAtRelease ?? 0 > 0)
        let notes = world.business.ledger.map(\.note)
        #expect(notes.contains("Sales: Base"))
        #expect(world.business.news.contains { $0.text.hasPrefix("Base is out") })
        #expect(world.market.state(.competitivePlayers).fatigue > 0)
        #expect(world.market.state(.kids).reachedPeople > 0)
        let awareness = world.character(mascot)?.awareness[.competitivePlayers] ?? 0
        #expect(awareness > 0)
    }

    @Test("Before the release the previews add reach and the set does not sell (B9)")
    func previews() throws {
        var (world, set, _) = try Fixture.scheduled()
        let before = world.market.state(.chaseCollectors).reachedPeople
        world.advanceWeek()
        let after = world.market.state(.chaseCollectors).reachedPeople
        #expect(after > before + 50)
        #expect(world.catalog.set(set)?.status == .scheduled)
        #expect(world.business.sales[set] == nil)
    }

    @Test("A sell-out in release week gives resellers half the stock and costs goodwill, once (B7)")
    func selloutByResellers() throws {
        var (world, set, _) = try Fixture.released()
        let sales = try #require(lastSales(world, set))
        let resellers = sales.sold[Audience.resellers.rawValue]
        #expect(sales.stockAfter == 0)
        #expect(abs(resellers - sales.totalSold / 2) < 1e-6)
        #expect(world.catalog.set(set)?.release?.selloutNoted == true)
        #expect(abs(goodwill(world, .kids) + 15) < 1e-9)
        #expect(abs(goodwill(world, .parents) + 15) < 1e-9)
        #expect(world.business.news.contains { $0.text.contains("sold out in week 0") && $0.text.contains("Resellers took") })
        world.advanceWeek()
        let next = try #require(lastSales(world, set))
        #expect(next.totalSold == 0)
        #expect(next.totalMissed > 0)
        #expect(goodwill(world, .kids) > -15)
    }

    @Test("A reprint arrives on time, restocks the set, and moves goodwill (B8)")
    func reprintArrives() throws {
        var (world, set, _) = try Fixture.released()
        try world.reprint(set, boxes: 2)
        let boxSize = try #require(world.catalog.set(set)?.pack.boxSize)
        let packs = 2 * boxSize
        world.catalog.sets[0].release?.pendingReprints = [.init(arrivalWeek: world.week + 1, packs: packs)]
        let printed = try #require(world.catalog.set(set)?.release?.printedPacks)
        let kidsBefore = goodwill(world, .kids)
        world.advanceWeek()
        let release = try #require(world.catalog.set(set)?.release)
        #expect(release.pendingReprints.isEmpty)
        #expect(release.printedPacks == printed + packs)
        let sales = try #require(lastSales(world, set))
        #expect(sales.totalSold > 0)
        #expect(sales.totalSold <= Double(packs))
        #expect(world.business.news.contains { $0.text.hasPrefix("A reprint of Base arrived") })
        #expect(goodwill(world, .kids) > kidsBefore)
        #expect(abs(goodwill(world, .investors) + 5) < 1e-9)
    }

    @Test("The fan wallet has no limit for resellers, and an empty wallet stops a fan audience (B13)")
    func wallet() throws {
        let (fresh, _) = try Fixture.world()
        #expect(fresh.walletLeft(.resellers) == .infinity)
        let teens = fresh.market.state(.teens)
        let half = World.walletShare * teens.reachedPeople * teens.spend
        #expect(abs(fresh.walletLeft(.teens) - half) < 1e-9)

        var (world, set, _) = try Fixture.released(boxes: bigRun)
        var open = world
        open.advanceWeek()
        let free = try #require(lastSales(open, set))
        #expect(free.sold[Audience.teens.rawValue] > 0)

        var business = world.business
        business.walletRing?[Audience.teens.rawValue][(world.week + 10) % 52] = 1e12
        world.businessState = business
        #expect(world.walletLeft(.teens) == 0)
        world.advanceWeek()
        let capped = try #require(lastSales(world, set))
        #expect(capped.sold[Audience.teens.rawValue] == 0)
        #expect(capped.sold[Audience.casualPlayers.rawValue] > 0)
    }

    @Test("The week-4 review runs once, in week 4 of the set's life (B10)")
    func review() throws {
        var (world, set, _) = try Fixture.released(boxes: bigRun)
        #expect(world.catalog.set(set)?.release?.reviewed == false)
        for _ in 0..<3 { world.advanceWeek() }
        #expect(world.catalog.set(set)?.release?.reviewed == false)
        world.advanceWeek()
        #expect(world.catalog.set(set)?.release?.reviewed == true)
        for _ in 0..<2 { world.advanceWeek() }
        let reviews = world.business.news.filter { $0.text.hasPrefix("Week 4 review") }
        #expect(reviews.count == 1)
    }

    @Test("The forecast leaves the world unchanged and gives the same answer each time (sales.md 11)")
    func forecastIsPure() throws {
        let (world, set, _) = try Fixture.scheduled(boxes: bigRun)
        let before = world
        let first = world.forecast(set, weeks: 3)
        let second = world.forecast(set, weeks: 3)
        #expect(world == before)
        #expect(first == second)
        #expect(first.count == 3)
        #expect(first.first?.week == world.catalog.set(set)?.release?.releaseWeek)
        for week in first { #expect(week.totalSold > 0) }
    }

    @Test("The forecast of a draft set needs a plan, and a larger print run sells at least as much (sales.md 11)")
    func forecastDraft() throws {
        let (world, set, mascot) = try Fixture.studio()
        var planned = world
        try planned.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        let before = planned
        #expect(planned.forecast(set).isEmpty)
        #expect(planned.forecast(SetID(9_999), boxes: 1, packPrice: 4.49, releaseWeek: 3).isEmpty)
        let small = planned.forecast(set, boxes: 1, packPrice: 4.49, releaseWeek: 3, weeks: 1)
        let large = planned.forecast(set, boxes: bigRun, packPrice: 4.49, releaseWeek: 3, weeks: 1)
        #expect(planned == before)
        let smallSold = try #require(small.first).totalSold
        let largeSold = try #require(large.first).totalSold
        #expect(smallSold <= largeSold)
        #expect(planned.catalog.set(set)?.status == .draft)
    }

    @Test("The same seed gives the same sales (rule 1)")
    func determinism() throws {
        var (a, _, _) = try Fixture.released(boxes: bigRun)
        var (b, _, _) = try Fixture.released(boxes: bigRun)
        for _ in 0..<3 {
            a.advanceWeek()
            b.advanceWeek()
        }
        #expect(a == b)
        var (c, _, _) = try Fixture.released(seed: 99, boxes: bigRun)
        for _ in 0..<3 { c.advanceWeek() }
        #expect(c != a)
    }
}
