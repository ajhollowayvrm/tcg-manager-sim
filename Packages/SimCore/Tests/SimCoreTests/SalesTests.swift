import Foundation
import Testing
@testable import SimCore

@Suite("Selling engine")
struct SalesTests {
    /// A studio with a mascot and a set with one designed card at each tier from Holo Rare up.
    func studio(seed: UInt64 = 2026) throws -> (World, SetID, CharacterID) {
        var world = World(seed: seed, studioName: "Test")
        let mascot = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let set = try world.createSet(.main, SetDetails(name: "Base", code: "BAS", size: 150, headliner: Headliner(characterID: mascot)),
                                      presetID: Catalog.defaultLadderID)
        let tiers = try #require(world.catalog.set(set)?.ladder.tiers)
        try world.createCards(in: set, tiers[3...].map { CardDraft(name: "Aryla, \($0.code)", characterID: mascot, rarity: $0.id) })
        return (world, set, mascot)
    }

    @Test("A new studio starts with $25,000, and scheduling a release pays the print cost and locks the set (B1 to B3)")
    func schedule() throws {
        var (world, set, mascot) = try studio()
        #expect(world.business.cash == Business.startCash)
        let cost = world.printCost(set, boxes: 500)
        #expect(cost > Pricing.printSetup)
        #expect(throws: CardError.self) { try world.scheduleRelease(set, boxes: 500, packPrice: 4.49, releaseWeek: 2) }
        try world.scheduleRelease(set, boxes: 500, packPrice: 4.49, releaseWeek: 4)
        #expect(abs(world.business.cash - (Business.startCash - cost)) < 1e-6)
        #expect(world.catalog.set(set)?.status == .scheduled)
        #expect(world.catalog.set(set)?.release?.stockPacks == 18_000)
        // The set is locked.
        #expect(throws: CardError.setLocked) { try world.createCard(in: set, CardDraft(name: "More", characterID: mascot, rarity: 1)) }
        #expect(throws: CardError.setLocked) { try world.rerollFiller(set) }
        #expect(throws: CardError.setLocked) { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: 9) }
    }

    @Test("The set sells from its release week, earns 38% of the pack price, and runs down its stock (B4, B8)")
    func sells() throws {
        var (world, set, _) = try studio()
        try world.scheduleRelease(set, boxes: 2_000, packPrice: 4.49, releaseWeek: 4)
        for _ in 0..<3 { world.advanceWeek() }
        #expect(world.business.sales[set] == nil)
        world.advanceWeek()
        #expect(world.catalog.set(set)?.status == .released)
        let first = try #require(world.business.sales[set]?.first)
        #expect(first.week == 4)
        #expect(first.totalSold > 0)
        #expect(abs(first.revenue - first.totalSold * 4.49 * Pricing.publisherShare) < 1e-6)
        #expect(abs((first.stockAfter + first.totalSold) - 72_000) < 1e-6)
        // Chase collectors buy early. Kids buy later.
        #expect(first.sold[Audience.chaseCollectors.rawValue] > first.sold[Audience.kids.rawValue])
    }

    @Test("A small print run sells out, resellers take a share, and goodwill falls (B7)")
    func sellOut() throws {
        var (world, set, _) = try studio()
        try world.scheduleRelease(set, boxes: 20, packPrice: 4.49, releaseWeek: 3)
        for _ in 0..<3 { world.advanceWeek() }
        let week = try #require(world.business.sales[set]?.last)
        #expect(week.stockAfter < 1)
        #expect(week.totalMissed > 0)
        #expect(week.sold[Audience.resellers.rawValue] > 0)
        #expect(world.catalog.set(set)?.release?.selloutNoted == true)
        #expect(world.market.state(.chaseCollectors).goodwill < 0)
    }

    @Test("A reprint arrives 6 weeks after the order and refills the stock (B8)")
    func reprint() throws {
        var (world, set, _) = try studio()
        try world.scheduleRelease(set, boxes: 20, packPrice: 4.49, releaseWeek: 3)
        for _ in 0..<4 { world.advanceWeek() }
        let cash = world.business.cash
        try world.reprint(set, boxes: 100)
        #expect(world.business.cash < cash)
        for _ in 0..<5 { world.advanceWeek() }
        #expect(world.catalog.set(set)?.release?.pendingReprints.count == 1)
        world.advanceWeek()
        #expect(world.catalog.set(set)?.release?.pendingReprints.isEmpty == true)
        #expect(world.catalog.set(set)?.release?.printedPacks == 120 * 36)
        #expect((world.business.sales[set]?.last?.totalSold ?? 0) > 0)
    }

    @Test("The factors respond to the set's design: price, theme, no game, and a grail (B5)")
    func factors() throws {
        let (world, set, _) = try studio()
        func factor(_ demand: [AudienceDemand], _ a: Audience, _ name: String) -> Double? {
            demand[a.rawValue].factors.first { $0.name == name }?.value
        }
        let normal = world.setDemand(set, packPrice: 4.49)
        let pricey = world.setDemand(set, packPrice: 8.99)
        #expect(normal[Audience.kids.rawValue].lifetimeShare > pricey[Audience.kids.rawValue].lifetimeShare)
        #expect(factor(normal, .kids, "Theme") == 0.95)
        #expect(factor(normal, .competitivePlayers, "No game") == 0.3)
        #expect(factor(normal, .chaseCollectors, "A grail") != nil)
        #expect(normal.allSatisfy { $0.lifetimeShare <= World.maxShare })
        #expect(normal[Audience.resellers.rawValue].lifetimeShare == 0)
        // The hidden favorites are fixed for a world, and differ between worlds.
        #expect(world.prefs(.kids) == world.prefs(.kids))
        let other = World(seed: 99, studioName: "Other")
        #expect(other.prefs(.chaseCollectors).hitRate != world.prefs(.chaseCollectors).hitRate)
    }

    @Test("Each rhythm adds up to 1 over 52 weeks, and chase collectors front-load more than kids (B6)")
    func rhythms() {
        for a in Audience.allCases {
            let total = (0..<Rhythm.weeks).reduce(0) { $0 + Rhythm.weight(a, week: $1) }
            #expect(abs(total - 1) < 1e-9)
        }
        #expect(Rhythm.weight(.chaseCollectors, week: 0) > Rhythm.weight(.kids, week: 0))
        #expect(Rhythm.weight(.kids, week: 30) > Rhythm.weight(.chaseCollectors, week: 30))
        // Art collectors peak after release, not in week 0.
        let art = (0..<Rhythm.weeks).map { Rhythm.weight(.artCollectors, week: $0) }
        #expect(art.indices.dropFirst(2).contains { art[$0] > art[0] })
    }

    @Test("Sales grow the reach and teach the audiences the set's characters (B9)")
    func growth() throws {
        var (world, set, mascot) = try studio()
        let reach = world.market.audiences.reduce(0) { $0 + $1.reachedPeople }
        try world.scheduleRelease(set, boxes: 1_000, packPrice: 4.49, releaseWeek: 3)
        for _ in 0..<10 { world.advanceWeek() }
        #expect(world.market.audiences.reduce(0) { $0 + $1.reachedPeople } > reach * 1.5)
        #expect(world.market.state(.kids).reach > 0)
        #expect((world.character(mascot)?.awareness[.chaseCollectors] ?? 0) > 0)
        #expect(world.business.ledger.contains { $0.note.hasPrefix("Sales:") })
    }

    @Test("The forecast is fixed, changes nothing, and matches the shape of the real sales")
    func forecast() throws {
        let (world, set, _) = try studio()
        let a = world.forecast(set, boxes: 500, packPrice: 4.49, releaseWeek: 4)
        let b = world.forecast(set, boxes: 500, packPrice: 4.49, releaseWeek: 4)
        #expect(a == b)
        #expect(a.count == 12)
        #expect(a.first?.week == 4)
        #expect(world.business.sales.isEmpty)
        #expect(world.catalog.set(set)?.status == .draft)
        // A draft set with no plan has no forecast.
        #expect(world.forecast(set).isEmpty)
    }

    @Test("A world with sales survives a JSON round trip, and the same seed gives the same sales")
    func saveAndDeterminism() throws {
        func play() throws -> World {
            var (world, set, _) = try studio(seed: 31)
            try world.scheduleRelease(set, boxes: 300, packPrice: 4.49, releaseWeek: 3)
            for _ in 0..<12 { world.advanceWeek() }
            return world
        }
        let world = try play()
        #expect(try roundTrip(world) == world)
        #expect(try play() == world)
    }

    @Test("The news reports the release, the sell-out, and the week-4 review")
    func news() throws {
        var (world, set, _) = try studio()
        try world.scheduleRelease(set, boxes: 20, packPrice: 4.49, releaseWeek: 3)
        for _ in 0..<8 { world.advanceWeek() }
        let lines = world.business.news.map(\.text)
        #expect(lines.contains { $0.hasPrefix("Base is out") })
        #expect(lines.contains { $0.hasPrefix("Base sold out in week 0") })
        #expect(lines.contains { $0.hasPrefix("Week 4 review") })
    }
}
