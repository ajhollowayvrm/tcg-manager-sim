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

private func ledgerTotal(_ world: World) -> Double {
    world.business.ledger.reduce(0) { $0 + $1.amount }
}

@Suite("Business")
struct BusinessTests {
    @Test("A new studio has $25,000 and one ledger line (B3)")
    func startingCash() throws {
        let (world, _) = try Fixture.world()
        #expect(world.business.cash == Business.startCash)
        #expect(world.business.cash == 25_000)
        #expect(world.business.ledger.count == 1)
        #expect(world.business.ledger[0].note == "Starting cash")
    }

    @Test("Scheduling pays the print cost with the lead artist's pay, and locks the set (B1, B2, K7)")
    func scheduleHappyPath() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        let artist = world.talent.artists[0]
        try world.setLeadArtist(set, artist.id)
        let cost = world.printCost(set, boxes: 5)
        let pay = world.leadArtCost(set)
        #expect(pay > 0)
        let week = max(world.week + Pricing.previewWeeks, world.setArtReadyWeek(set))
        try world.scheduleRelease(set, boxes: 5, packPrice: 4.49, releaseWeek: week)
        let cash = Business.startCash - cost
        #expect(abs(world.business.cash - cash) < 1e-6)
        #expect(world.catalog.set(set)?.status == .scheduled)
        let packs = world.catalog.set(set)?.release?.printedPacks
        let boxSize = world.catalog.set(set)?.pack.boxSize ?? 0
        #expect(packs == 5 * boxSize)
        let notes = world.business.ledger.map(\.note)
        #expect(notes.contains { $0.hasPrefix("Print run:") })
        #expect(notes.contains { $0.hasPrefix("Lead art:") })
        #expect(failure { try world.setLeadArtist(set, nil) } == .setLocked)
        #expect(failure { try world.scheduleRelease(set, boxes: 5, packPrice: 4.49, releaseWeek: week) } == .setLocked)
    }

    @Test("The print cost is the setup, the lead's pay, and the packs (B1, C17)")
    func printCost() throws {
        let (world, set, _) = try Fixture.scheduled(boxes: 10)
        let perPack = world.printCostPerPack(set)
        let pack = try #require(world.catalog.set(set)?.pack)
        let minimum = Double(pack.cardCount) * Pricing.cardCost + Pricing.wrapperCost
        #expect(perPack >= minimum)
        let packs = Double(10 * pack.boxSize)
        let expected = Pricing.printSetup + world.leadArtCost(set) + packs * perPack
        let actual = world.printCost(set, boxes: 10)
        #expect(abs(actual - expected) < 1e-6)
        #expect(world.printCost(SetID(9_999), boxes: 1) == 0)
        #expect(world.printCostPerPack(SetID(9_999)) == 0)
    }

    @Test("A release needs a known set, a free set, cards, and boxes and a price in range (B1)")
    func scheduleErrors() throws {
        var (world, set, mascot) = try Fixture.studio()
        let soon = world.week + Pricing.previewWeeks
        #expect(failure { try world.scheduleRelease(SetID(9_999), boxes: 1, packPrice: 4.49, releaseWeek: soon) } == .unknownSet(9_999))
        let noCards = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: soon) }
        #expect(isBadRelease(noCards))
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        try world.setLeadArtist(set, Artist.founderID)
        let noBoxes = failure { try world.scheduleRelease(set, boxes: 0, packPrice: 4.49, releaseWeek: soon) }
        let manyBoxes = failure { try world.scheduleRelease(set, boxes: 100_001, packPrice: 4.49, releaseWeek: soon) }
        let cheap = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 0.5, releaseWeek: soon) }
        let dear = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 21, releaseWeek: soon) }
        let early = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: soon - 1) }
        #expect(isBadRelease(noBoxes))
        #expect(isBadRelease(manyBoxes))
        #expect(isBadRelease(cheap))
        #expect(isBadRelease(dear))
        #expect(isBadRelease(early))
        #expect(world.catalog.set(set)?.status == .draft)
        #expect(world.business.ledger.count == 1)
    }

    @Test("A print run needs a lead artist (K7)")
    func needsLead() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        let error = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: world.week + 3) }
        guard case .badRelease(let reason) = error else {
            Issue.record("Expected a badRelease error")
            return
        }
        #expect(reason.contains("lead artist"))
        #expect(world.catalog.set(set)?.status == .draft)
    }

    @Test("The art must be done before the release week (K2, K7)")
    func artBeforeRelease() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        try world.setLeadArtist(set, world.talent.artists[0].id)
        let ready = world.setArtReadyWeek(set)
        #expect(ready > world.week + Pricing.previewWeeks)
        let early = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: ready - 1) }
        #expect(isBadRelease(early))
        try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: ready)
        #expect(world.catalog.set(set)?.status == .scheduled)
    }

    @Test("A reprint pays now, arrives 6 weeks later, and needs a release and 1 or more boxes (B8)")
    func reprintOrder() throws {
        var (world, set, _) = try Fixture.scheduled()
        let before = world.business.cash
        let stock = world.catalog.set(set)?.release?.stockPacks
        let perPack = world.printCostPerPack(set)
        let boxSize = try #require(world.catalog.set(set)?.pack.boxSize)
        try world.reprint(set, boxes: 2)
        let cost = Double(2 * boxSize) * perPack
        #expect(abs(world.business.cash - (before - cost)) < 1e-6)
        let release = try #require(world.catalog.set(set)?.release)
        #expect(release.stockPacks == stock)
        #expect(release.pendingReprints == [.init(arrivalWeek: world.week + Pricing.reprintWeeks, packs: 2 * boxSize)])
        #expect(world.business.ledger.last?.note.hasPrefix("Reprint:") == true)
        #expect(isBadRelease(failure { try world.reprint(set, boxes: 0) }))
        #expect(failure { try world.reprint(SetID(9_999), boxes: 1) } == .unknownSet(9_999))
        var (draft, draftSet, _) = try Fixture.studio()
        #expect(failure { try draft.reprint(draftSet, boxes: 1) } == .unknownSet(draftSet))
    }

    @Test("The ledger always sums to the cash (B3)")
    func ledgerSumsToCash() throws {
        var (world, set, _) = try Fixture.released()
        try world.reprint(set, boxes: 1)
        world.addCash(1_234.5, note: "Test grant")
        for _ in 0..<5 { world.advanceWeek() }
        let diff = abs(ledgerTotal(world) - world.business.cash)
        #expect(diff < 1e-6)
        #expect(world.business.ledger.contains { $0.note == "Test grant" && $0.amount == 1_234.5 })
    }
}
