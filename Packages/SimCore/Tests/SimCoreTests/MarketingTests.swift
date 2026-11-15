import Testing
@testable import SimCore

private func failure(_ body: () throws -> Void) -> CardError? {
    do { try body() } catch { return error as? CardError }
    return nil
}

private func fullCampaign() -> Campaign {
    Campaign(previewBudget: 1_500, creators: [1, 2], storeKits: 20, adBudget: 800)
}

@Suite("Marketing")
struct MarketingTests {
    @Test("The creator list comes from the world seed, and each creator's audience mix adds up to 1 (K5)")
    func creators() throws {
        let (world, _) = try Fixture.world()
        let again = try Fixture.world().world
        #expect(world.creators.count == 10)
        #expect(world.creators.map(\.id) == Array(1...10))
        #expect(world.creators == again.creators)
        #expect(world.creators[0].subscribers == 3_000_000)
        for creator in world.creators {
            let mix = creator.mix.values.reduce(0, +)
            #expect(abs(mix - 1) < 1e-9)
            #expect(creator.price > 0)
            #expect(creator.price.truncatingRemainder(dividingBy: 50) == 0)
            #expect(abs(creator.newPeople - creator.views * Marketing.viewToFan) < 1e-9)
        }
        #expect(world.creator(3)?.id == 3)
        #expect(world.creator(99) == nil)
    }

    @Test("A campaign costs the sum of its parts, and the empty campaign costs nothing (K5)")
    func cost() throws {
        let (world, _) = try Fixture.world()
        #expect(world.cost(of: .none) == 0)
        #expect(world.reach(of: .none) == 0)
        let campaign = fullCampaign()
        let creators = campaign.creators.compactMap { world.creator($0)?.price }.reduce(0, +)
        let expected = 1_500 + 800 + 20 * Marketing.kitCost + creators
        let actual = world.cost(of: campaign)
        #expect(abs(actual - expected) < 1e-9)
    }

    @Test("The reach of a campaign is the people from each channel (K5)")
    func reach() throws {
        let (world, _) = try Fixture.world()
        let previews = world.reach(of: Campaign(previewBudget: 1_000))
        #expect(abs(previews - 200) < 1e-9)
        let ads = world.reach(of: Campaign(adBudget: 800))
        #expect(abs(ads - 2_000) < 1e-9)
        #expect(world.reach(of: Campaign(storeKits: 30)) == 30)
        let creator = try #require(world.creator(1))
        let sponsored = world.reach(of: Campaign(creators: [1]))
        #expect(abs(sponsored - creator.newPeople) < 1e-9)
    }

    @Test("Previews spread over 3 weeks, ads and creators land the week before, and kits land in release week (K5)")
    func campaignTiming() throws {
        var (world, _) = try Fixture.world()
        let campaign = fullCampaign()
        var byWeek: [Int: Double] = [:]
        for w in -4...1 { byWeek[w] = world.runCampaign(campaign, weekOfLife: w) }
        #expect(byWeek[-4] == 0)
        #expect(byWeek[1] == 0)
        let preview = 1_500 / Marketing.previewCostPerPerson / 3
        #expect(abs((byWeek[-3] ?? 0) - preview) < 1e-9)
        #expect(abs((byWeek[-2] ?? 0) - preview) < 1e-9)
        #expect(byWeek[0] == 20)
        let landing = byWeek[-1] ?? 0
        #expect(landing > preview + 2_000)
        let total = byWeek.values.reduce(0, +)
        let planned = world.reach(of: campaign)
        #expect(abs(total - planned) < 1e-6)
    }

    @Test("A campaign adds reach to the audiences it targets (K5)")
    func campaignAddsReach() throws {
        var (world, _) = try Fixture.world()
        let before = world.market.state(.kids).reachedPeople
        _ = world.runCampaign(Campaign(adBudget: 800), weekOfLife: -1)
        let after = world.market.state(.kids).reachedPeople
        #expect(abs(after - before - 800) < 1e-6)
        #expect(world.market.state(.competitivePlayers).reachedPeople == 200)
    }

    @Test("Scheduling pays for the campaign, keeps it, and the release counts its reach (K5)")
    func scheduleWithCampaign() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        try world.setLeadArtist(set, Artist.founderID)
        let campaign = Campaign(storeKits: 20, adBudget: 800)
        let cash = world.business.cash
        let print = world.printCost(set, boxes: 5)
        let marketing = world.cost(of: campaign)
        try world.scheduleRelease(set, boxes: 5, packPrice: 4.49, releaseWeek: world.week + 3, campaign: campaign)
        #expect(abs(world.business.cash - (cash - print - marketing)) < 1e-6)
        #expect(world.business.ledger.last?.note == "Marketing: Base")
        #expect(world.catalog.set(set)?.release?.campaign == campaign)
        while world.catalog.set(set)?.status != .released { world.advanceWeek() }
        let reached = world.catalog.set(set)?.release?.campaignReached ?? 0
        #expect(abs(reached - 2_020) < 1e-6)
    }

    @Test("A campaign with an unknown creator or a negative amount is refused, and no money moves (K5)")
    func campaignErrors() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        try world.setLeadArtist(set, Artist.founderID)
        let soon = world.week + 3
        let ghost = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: soon, campaign: Campaign(creators: [99])) }
        let debt = failure { try world.scheduleRelease(set, boxes: 1, packPrice: 4.49, releaseWeek: soon, campaign: Campaign(adBudget: -1)) }
        for error in [ghost, debt] {
            guard case .badRelease = error else {
                Issue.record("Expected a badRelease error")
                return
            }
        }
        #expect(world.catalog.set(set)?.status == .draft)
        #expect(world.business.ledger.count == 1)
    }

    @Test("The brand budget spends every week, spreads reach by the ad share, and a zero budget spends nothing (K6)")
    func brandBudget() throws {
        var (world, _) = try Fixture.world()
        world.setBrandBudget(-50, adShare: 3)
        #expect(world.business.brandBudget == 0)
        #expect(world.business.brandAdShare == 1)
        world.setBrandBudget(0, adShare: 0.5)
        var idle = world
        idle.advanceWeek()
        #expect(idle.business.cash == Business.startCash)

        world.setBrandBudget(800, adShare: 0.5)
        var plain = world
        plain.setBrandBudget(0, adShare: 0.5)
        world.advanceWeek()
        plain.advanceWeek()
        #expect(world.business.cash == Business.startCash - 800)
        #expect(world.business.ledger.last?.note == "Brand marketing")
        let ads = 800 * 0.5 / Marketing.adCPM * 1_000 * Marketing.viewToFan
        let creators = 800 * 0.5 / Marketing.creatorCPM * 1_000 * Marketing.viewToFan
        var gained = 0.0
        for a in Audience.allCases {
            gained += world.market.state(a).reachedPeople - plain.market.state(a).reachedPeople
        }
        #expect(abs(gained - (ads + creators)) < 1e-6)
        let kids = world.market.state(.kids).reachedPeople
        #expect(kids > 0)
    }
}
