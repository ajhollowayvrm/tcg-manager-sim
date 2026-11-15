import Foundation
import Testing
@testable import SimCore

private let bigRun = 2_000

/// A draft set with one card and a lead artist, ready to schedule.
private func ready() throws -> (world: World, set: SetID) {
    var (world, set, mascot) = try Fixture.studio()
    try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
    try world.setLeadArtist(set, Artist.founderID)
    return (world, set)
}

private func schedule(_ world: inout World, _ set: SetID, boxes: Int = 50, holdBack: Double = 0) throws {
    try world.scheduleRelease(set, boxes: boxes, packPrice: Pricing.defaultPackPrice,
                              releaseWeek: world.week + Pricing.previewWeeks, holdBack: holdBack)
}

private func isBadRelease(_ body: () throws -> Void) -> Bool {
    do { try body() } catch let error as CardError {
        if case .badRelease = error { return true }
    } catch {}
    return false
}

private func channels(_ world: World) -> SetChannels? { world.catalog.sets[0].release?.channels }

private func advanceToRelease(_ world: inout World) {
    while world.catalog.sets[0].status != .released { world.advanceWeek() }
}

@Suite("Channels")
struct ChannelTests {
    @Test("The shares of an audience add up to 1 with a distributor (N2)")
    func sharesAddUp() {
        for a in Audience.allCases where a != .resellers {
            let sum = Channel.shares(a, distributor: true).reduce(0, +)
            #expect(abs(sum - 1) < 1e-9)
        }
        #expect(Channel.shares(.resellers, distributor: true) == [0, 0, 0])
    }

    @Test("Without a distributor, big-box has no share and hobby stores reach 40% (N2)")
    func sharesWithoutDistributor() {
        let with = Channel.shares(.kids, distributor: true)
        let without = Channel.shares(.kids, distributor: false)
        #expect(without[Channel.bigBox.rawValue] == 0)
        #expect(abs(without[Channel.hobby.rawValue] - 0.4 * with[Channel.hobby.rawValue]) < 1e-12)
        #expect(without[Channel.web.rawValue] == with[Channel.web.rawValue])
        #expect(with[Channel.bigBox.rawValue] > with[Channel.hobby.rawValue])
        let competitive = Channel.shares(.competitivePlayers, distributor: true)
        #expect(competitive[Channel.hobby.rawValue] > competitive[Channel.bigBox.rawValue])
    }

    @Test("The studio's share is 45% direct, 38% with a distributor, and 70% on the web (N2)")
    func studioShares() {
        #expect(Channel.studioShare(.hobby, distributor: false) == 0.45)
        #expect(Channel.studioShare(.hobby, distributor: true) == 0.38)
        #expect(Channel.studioShare(.bigBox, distributor: true) == 0.38)
        #expect(Channel.studioShare(.web, distributor: false) == 0.70)
    }

    @Test("A shortage gives each channel the same share, in whole boxes (N1)")
    func allocation() {
        #expect(World.allocate([100, 300], available: 200, box: 10) == [50, 150])
        #expect(World.allocate([100, 300], available: 1_000, box: 10) == [100, 300])
        #expect(World.allocate([105, 0], available: 1_000, box: 10) == [100, 0])
        #expect(World.allocate([100, 300], available: 0, box: 10) == [0, 0])
    }

    @Test("The orders are whole boxes, within the print run, and big-box needs a distributor (N1, N2)")
    func orderPlanRules() throws {
        var (world, set) = try ready()
        let box = try #require(world.catalog.set(set)?.pack.boxSize)
        let direct = try #require(world.orderPlan(set, boxes: bigRun, packPrice: 4.49))
        #expect(direct.orders(.hobby) > 0)
        #expect(direct.orders(.hobby) % box == 0)
        #expect(direct.orders(.bigBox) == 0)
        #expect(direct.orders(.hobby) <= direct.available)
        world.signDistributor()
        let signed = try #require(world.orderPlan(set, boxes: bigRun, packPrice: 4.49))
        #expect(signed.orders(.bigBox) > 0)
        #expect(signed.orders(.bigBox) % box == 0)
        #expect(signed.orders(.hobby) > direct.orders(.hobby))
        let money = Double(signed.orders(.hobby) + signed.orders(.bigBox)) * 4.49 * 0.38
        #expect(abs(signed.shipmentMoney - money) < 1e-6)
    }

    @Test("A small print run is a shortage, and the orders stay inside it (N1)")
    func shortage() throws {
        var (world, set) = try ready()
        world.signDistributor()
        let plan = try #require(world.orderPlan(set, boxes: 1, packPrice: 4.49))
        #expect(plan.shortage)
        #expect(plan.orders(.hobby) + plan.orders(.bigBox) <= plan.available)
    }

    @Test("A channel with trust below 0.25 orders nothing (N3)")
    func lowTrust() throws {
        var (world, set) = try ready()
        var book = world.channels
        book.hobbyTrust = 0.2
        world.channelState = book
        let plan = try #require(world.orderPlan(set, boxes: bigRun, packPrice: 4.49))
        #expect(plan.orders(.hobby) == 0)
    }

    @Test("Holding back keeps packs out of the orders, and the limit is 50% (N1)")
    func holdBack() throws {
        var (world, set) = try ready()
        let boxSize = try #require(world.catalog.set(set)?.pack.boxSize)
        #expect(isBadRelease { try schedule(&world, set, holdBack: 0.6) })
        #expect(world.catalog.sets[0].status == .draft)
        try schedule(&world, set, boxes: bigRun, holdBack: 0.2)
        let held = channels(world)?.heldBack ?? 0
        #expect(held == Int(Double(bigRun * boxSize) * 0.2))
        let release = try #require(world.catalog.sets[0].release)
        #expect(release.stockPacks == Double(release.printedPacks))
        let shipped = (channels(world)?.hobbyOrder ?? 0) + (channels(world)?.bigBoxOrder ?? 0)
        #expect(shipped + held <= release.printedPacks)
    }

    @Test("Backer packs leave the print run, and a smaller print run is refused (F3)")
    func backers() throws {
        var (world, set) = try ready()
        let boxSize = try #require(world.catalog.set(set)?.pack.boxSize)
        var finance = world.finance
        finance.backed[set] = Backing(backers: 3, endWeek: 0, served: false, angry: false)
        world.financeState = finance
        #expect(isBadRelease { try schedule(&world, set, boxes: 2) })
        #expect(world.catalog.sets[0].status == .draft)
        try schedule(&world, set, boxes: 5)
        let release = try #require(world.catalog.sets[0].release)
        #expect(release.stockPacks == Double(2 * boxSize))
        #expect(release.printedPacks == 5 * boxSize)
        #expect(channels(world)?.backerPacks == 3 * boxSize)
        let orders = (channels(world)?.hobbyOrder ?? 0) + (channels(world)?.bigBoxOrder ?? 0)
        #expect(orders <= 2 * boxSize)
        #expect(world.packsInWorld(release) == Double(release.printedPacks))
    }

    @Test("The orders ship in the release week, and the studio is paid at shipment (N1)")
    func shipment() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: bigRun)
        let order = try #require(channels(world)?.hobbyOrder)
        #expect(order > 0)
        advanceToRelease(&world)
        let line = world.business.ledger.first { $0.note == "Shipment: Base, Hobby stores" }
        #expect(abs((line?.amount ?? 0) - Double(order) * 4.49 * 0.45) < 1e-6)
        #expect(line?.kind == .sales)
        #expect(channels(world)?.hobbyReceived == Double(order))
        let sales = try #require(world.business.sales[set]?.last)
        #expect(sales.revenue >= line?.amount ?? 0)
    }

    @Test("The web store sells from the warehouse and pays 70% at the sale (N1)")
    func webStore() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: bigRun, holdBack: 0.5)
        advanceToRelease(&world)
        let ch = try #require(channels(world))
        #expect(ch.webSold > 0)
        let line = world.business.ledger.first { $0.note == "Web store: Base" }
        #expect(abs((line?.amount ?? 0) - ch.webSold * 4.49 * 0.70) < 1e-6)
        #expect(line?.kind == .sales)
    }

    @Test("A store that runs low reorders from the warehouse, and the studio is paid at once (N1)")
    func reorder() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: bigRun)
        advanceToRelease(&world)
        var release = try #require(world.catalog.sets[0].release)
        var ch = try #require(release.channels)
        ch.hobbyStock = 0
        let received = ch.hobbyReceived
        release.channels = ch
        world.catalog.sets[0].release = release
        let cash = world.business.cash
        world.advanceWeek()
        let after = try #require(channels(world))
        #expect(after.hobbyReceived > received)
        let line = world.business.ledger.last { $0.note == "Reorder: Base, Hobby stores" }
        #expect(abs((line?.amount ?? 0) - (after.hobbyReceived - received) * 4.49 * 0.45) < 1e-6)
        #expect(world.business.cash > cash)
    }

    @Test("Resellers do not buy from hobby stores (N1)")
    func resellersSkipHobby() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: 1)
        var release = try #require(world.catalog.sets[0].release)
        release.channels = SetChannels()
        release.channels?.hobbyStock = 10
        release.stockPacks = 10
        world.catalog.sets[0].release = release
        advanceToRelease(&world)
        let sales = try #require(world.business.sales[set]?.last)
        #expect(sales.sold[Audience.resellers.rawValue] == 0)
    }

    @Test("Big-box sets store limits when resellers take a quarter of its drop (N4)")
    func storeLimits() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: bigRun)
        var book = world.channels
        book.hasDistributor = true
        world.channelState = book
        var release = try #require(world.catalog.sets[0].release)
        release.channels = SetChannels()
        release.channels?.bigBoxStock = 10
        release.stockPacks = 10
        world.catalog.sets[0].release = release
        advanceToRelease(&world)
        #expect(channels(world)?.limited == true)
        #expect(world.business.news.contains { $0.text == "Big-box stores limit Base to 2 packs a person." })
    }

    @Test("In week 12 a strong sell-through raises trust by 0.15 (N3)")
    func trustUp() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: bigRun)
        advanceToRelease(&world)
        var release = try #require(world.catalog.sets[0].release)
        release.channels?.hobbyReceived = 1_000
        release.channels?.hobbySold = 990
        world.catalog.sets[0].release = release
        world.week = release.releaseWeek + Channel.reviewWeek - 1
        world.advanceWeek()
        #expect(abs(world.channels.hobbyTrust - 0.75) < 1e-9)
        #expect(world.business.news.contains { $0.text == "Hobby stores sold out of Base and will order more next time." })
        #expect(channels(world)?.trustReviewed == true)
    }

    @Test("In week 12 a weak sell-through lowers trust, and big-box cuts the studio (N3)")
    func trustDown() throws {
        var (world, set) = try ready()
        try schedule(&world, set, boxes: bigRun)
        advanceToRelease(&world)
        var release = try #require(world.catalog.sets[0].release)
        release.channels?.hobbyReceived = 1_000_000
        release.channels?.bigBoxReceived = 1_000_000
        world.catalog.sets[0].release = release
        world.week = release.releaseWeek + Channel.reviewWeek - 1
        world.advanceWeek()
        #expect(abs(world.channels.hobbyTrust - 0.45) < 1e-9)
        #expect(world.channels.bigBoxTrust == 0.2)
        #expect(world.business.news.contains { $0.text.hasPrefix("Big-box retail cut the studio") })
        #expect(world.channels.orders(.bigBox) == false)
    }

    @Test("A release from an old save puts its stock into the stores, half and half (N1)")
    func oldSave() throws {
        var (world, set) = try ready()
        try schedule(&world, set)
        world.catalog.sets[0].release?.channels = nil
        let stock = try #require(world.catalog.sets[0].release?.stockPacks)
        world.advanceWeek()
        let ch = try #require(channels(world))
        #expect(ch.hobbyStock == stock / 2)
        #expect(ch.bigBoxStock == stock / 2)
        #expect(world.warehousePacks(set) == 0)
    }

    @Test("The warehouse costs $20 a month for each pallet, paid each week (N1)")
    func storage() throws {
        var (world, set) = try ready()
        try schedule(&world, set)
        world.advanceWeek()
        let line = world.business.ledger.first { $0.note.hasPrefix("Storage") }
        #expect(abs((line?.amount ?? 0) + 20.0 * 12 / 52) < 1e-9)
        #expect(line?.kind == nil)
    }

    @Test("The forecast of a draft set includes the shipment money (N1)")
    func forecastShipment() throws {
        let (world, set) = try ready()
        let plan = try #require(world.orderPlan(set, boxes: bigRun, packPrice: 4.49))
        #expect(plan.shipmentMoney > 0)
        let forecast = world.forecast(set, boxes: bigRun, packPrice: 4.49, releaseWeek: 3, weeks: 1)
        let first = try #require(forecast.first)
        #expect(first.revenue >= plan.shipmentMoney - 1e-6)
    }

    @Test("Signing and ending the distributor contract is free and leaves shipped stock alone (N2)")
    func contract() throws {
        var (world, set) = try ready()
        try schedule(&world, set)
        let cash = world.business.cash
        world.signDistributor()
        #expect(world.channels.hasDistributor)
        world.endDistributor()
        #expect(!world.channels.hasDistributor)
        #expect(world.business.cash == cash)
        #expect(channels(world)?.hobbyStock == 0)
    }

    @Test("The channel data survives a save and load (N1)")
    func saveRoundTrip() throws {
        var (world, set) = try ready()
        world.signDistributor()
        try schedule(&world, set, boxes: bigRun, holdBack: 0.1)
        let data = try JSONEncoder().encode(world)
        let back = try JSONDecoder().decode(World.self, from: data)
        #expect(back == world)
    }
}
