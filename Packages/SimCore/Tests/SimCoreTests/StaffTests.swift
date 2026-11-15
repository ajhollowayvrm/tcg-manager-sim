import Testing
@testable import SimCore

private func failure(_ body: () throws -> Void) -> CardError? {
    do { try body() } catch { return error as? CardError }
    return nil
}

private func isBadRelease(_ error: CardError?) -> Bool {
    if case .badRelease = error { return true }
    return false
}

@Suite("Staff")
struct StaffTests {
    @Test("A space has a rent and room, and the garage is free with room for one hire (K3)")
    func spaces() {
        #expect(Space.garage.monthlyRent == 0)
        #expect(Space.garage.room == 1)
        #expect(Space.office.monthlyRent == 3_000)
        #expect(abs(Space.office.weeklyRent - 3_000 * 12 / 52) < 1e-9)
        var last = -1
        for space in Space.allCases {
            #expect(space.room > last)
            last = space.room
        }
    }

    @Test("A hire has a yearly salary, a weekly cost, and the room it takes (K3)")
    func hires() {
        for insight in MarketInsight.allCases {
            #expect(insight.salary > 0)
            #expect(abs(insight.weeklySalary - insight.salary / 52) < 1e-9)
            #expect(!insight.hireName.isEmpty)
        }
        #expect(MarketInsight.sizes.heads == 1)
        #expect(MarketInsight.forecast.heads == 2)
        #expect(MarketInsight.curve.heads == 3)
        #expect(MarketInsight.scoutNetwork.heads == 2)
    }

    @Test("A hire needs room, and a dismissal frees it (K3)")
    func hiring() throws {
        var (world, _) = try Fixture.world()
        #expect(world.space == .garage)
        #expect(world.usedRoom == 0)
        try world.setHire(.sizes, hired: true)
        #expect(world.usedRoom == 1)
        #expect(world.market.insights.contains(.sizes))
        #expect(isBadRelease(failure { try world.setHire(.reach, hired: true) }))
        #expect(failure { try world.setHire(.sizes, hired: true) } == nil)
        #expect(world.usedRoom == 1)
        try world.setHire(.sizes, hired: false)
        #expect(world.usedRoom == 0)
        #expect(isBadRelease(failure { try world.setHire(.forecast, hired: true) }))
        #expect(world.market.insights.isEmpty)
    }

    @Test("A move costs one month of the new rent, and the hires must fit (K3)")
    func moving() throws {
        var (world, _) = try Fixture.world()
        let before = world.business.cash
        try world.move(to: .garage)
        #expect(world.business.cash == before)
        try world.move(to: .coworking)
        #expect(world.space == .coworking)
        #expect(world.business.cash == before - Space.coworking.monthlyRent)
        #expect(world.business.ledger.last?.note == "Move to Coworking desks")
        #expect(world.business.news.last?.text.contains("moved") == true)
        try world.setHire(.sizes, hired: true)
        try world.setHire(.reach, hired: true)
        #expect(world.usedRoom == 2)
        #expect(isBadRelease(failure { try world.move(to: .garage) }))
        #expect(world.space == .coworking)
    }

    @Test("Each week pays the rent and the salaries (K3)")
    func weeklyCosts() throws {
        var (world, _) = try Fixture.world()
        #expect(world.weeklyCosts == 0)
        try world.move(to: .office)
        try world.setHire(.sizes, hired: true)
        let expected = Space.office.weeklyRent + MarketInsight.sizes.weeklySalary
        #expect(abs(world.weeklyCosts - expected) < 1e-9)
        let before = world.business.cash
        world.advanceWeek()
        #expect(abs(world.business.cash - (before - expected)) < 1e-6)
        let notes = world.business.ledger.suffix(2).map(\.note)
        #expect(notes == ["Rent: Small office", "Salaries: 1 hire"])
    }

    @Test("The studio closes after 8 weeks in a row below zero, and then time stops (K4)")
    func closing() throws {
        var (world, _) = try Fixture.world()
        world.addCash(-Business.startCash - 1, note: "Test loss")
        #expect(world.business.cash < 0)
        for _ in 0..<7 { world.advanceWeek() }
        #expect(world.business.weeksBelowZero == 7)
        #expect(!world.isClosed)
        #expect(world.business.news.contains { $0.text.hasPrefix("Cash is below zero") })
        world.advanceWeek()
        #expect(world.isClosed)
        #expect(world.business.closedWeek == world.week)
        let week = world.week
        world.advanceWeek()
        #expect(world.week == week)
    }

    @Test("Money back above zero resets the count of weeks below zero (K4)")
    func recovery() throws {
        var (world, _) = try Fixture.world()
        world.addCash(-Business.startCash - 1, note: "Test loss")
        for _ in 0..<3 { world.advanceWeek() }
        #expect(world.business.weeksBelowZero == 3)
        world.addCash(100, note: "Test grant")
        world.advanceWeek()
        #expect(world.business.weeksBelowZero == 0)
        #expect(!world.isClosed)
    }

    @Test("The history counts the weeks, the sets, the packs sold, and the best set (K4)")
    func history() throws {
        var (world, set, _) = try Fixture.released()
        world.advanceWeek()
        let history = world.history
        #expect(history.weeks == world.week)
        #expect(history.sets == 1)
        #expect(history.bestSet == "Base")
        let sold = (world.business.sales[set] ?? []).reduce(0) { $0 + $1.totalSold }
        #expect(abs(history.packsSold - sold) < 1e-6)
        #expect(history.peakCash >= Business.startCash)
    }
}
