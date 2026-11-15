import Testing
@testable import SimCore

@Suite("Upgrades")
struct UpgradeTests {
    func hire(_ world: inout World, _ insight: MarketInsight) {
        world.setMarketInsight(insight, on: true)
    }

    @Test("Every hire has a group, a name, a salary, and room. Only the print plant takes 6 people (U5 to U16)")
    func catalog() {
        for insight in MarketInsight.allCases {
            #expect(insight.salary > 0)
            #expect(!insight.hireName.isEmpty)
            #expect(!insight.unlocks.isEmpty)
        }
        #expect(MarketInsight.printPlant.heads == 6)
        let groups = Set(MarketInsight.allCases.map(\.group))
        #expect(groups.count == MarketInsight.Group.allCases.count)
    }

    @Test("A release teaches the audiences a character's appeal up to 0.7. Focus groups reach 0.95 (U5)")
    func knowledge() throws {
        var (world, _, mascot) = try Fixture.released()
        let i = try #require(world.index(of: mascot))
        #expect(world.characters[i].knowledge[.chaseCollectors] > 0)
        #expect(world.characters[i].knowledge[.chaseCollectors] <= World.releaseKnowledgeCap)
        var focus = try Fixture.world().world
        hire(&focus, .focusGroups)
        for _ in 0..<30 { focus.advanceWeek() }
        #expect(focus.characters[0].knowledge[.kids] == World.focusKnowledgeCap)
    }

    @Test("A character designer gives each created character 5 more appeal, and the seed stays the same (U6)")
    func characterDesigner() throws {
        var plain = World(seed: 7, studioName: "T")
        var designed = World(seed: 7, studioName: "T")
        hire(&designed, .characterDesigner)
        let draft = CharacterDraft(name: "Aryla", role: .mascot, kind: .person)
        let a = try plain.createCharacter(draft)
        let b = try designed.createCharacter(draft)
        let pa = try #require(plain.character(a)).truth.randomPart[.kids]
        let pb = try #require(designed.character(b)).truth.randomPart[.kids]
        #expect(abs(pb - pa - 5) < 1e-9)
    }

    @Test("An art director takes 1 week off each card, to 1 week at least, and a lead draws 15 filler cards a week (U9)")
    func artDirector() throws {
        var (world, _, _) = try Fixture.studio()
        let artist = try #require(world.talent.artists.first)
        let before = world.artReadyWeek(for: artist)
        hire(&world, .artDirector)
        let after = world.artReadyWeek(for: artist)
        #expect(after == before - (artist.weeks > 1 ? 1 : 0))
        #expect(world.fillerPerWeek == 15)
    }

    @Test("A staff illustrator makes founder art count as popularity 45 (U10)")
    func staffIllustrator() throws {
        var (world, _, _) = try Fixture.studio()
        let founder = world.talent.founder
        #expect(world.fame(of: founder) == World.founderPopularity)
        hire(&world, .staffIllustrator)
        #expect(world.fame(of: founder) == 45)
    }

    @Test("Print deals cut the pack cost by 15% and reprints take 4 weeks. A plant cuts 35%, has no setup, and takes 2 weeks (U11, U12)")
    func printing() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        let base = world.printCostPerPack(set)
        #expect(world.printSetupCost == Pricing.printSetup)
        hire(&world, .printBuyer)
        #expect(abs(world.printCostPerPack(set) - base * 0.85) < 1e-9)
        #expect(world.reprintDelay == 4)
        hire(&world, .printPlant)
        #expect(abs(world.printCostPerPack(set) - base * 0.65) < 1e-9)
        #expect(world.printSetupCost == 0)
        #expect(world.reprintDelay == 2)
    }

    @Test("A marketing lead reaches 30% more people with the same campaign (U13)")
    func marketingLead() throws {
        var (world, _, _) = try Fixture.studio()
        var campaign = Campaign()
        campaign.previewBudget = 1_000
        let base = world.reach(of: campaign)
        hire(&world, .marketingLead)
        #expect(abs(world.reach(of: campaign) - base * 1.3) < 1e-6)
    }

    @Test("Store relations raise the shelf reach and keep the shelf longer (U14)")
    func storeRelations() throws {
        var (world, _, _) = try Fixture.studio()
        #expect(world.shelfBoost == 1)
        hire(&world, .storeRelations)
        #expect(world.shelfBoost == 1.25)
        #expect(world.shelfHalfLifeWeeks > World.shelfHalfLife)
    }

    @Test("Collector relations halve the goodwill loss of a sell-out to resellers (U15)")
    func collectorRelations() throws {
        let (plain, _, _) = try Fixture.released()
        var (calm, set, _) = try Fixture.scheduled()
        hire(&calm, .collectorRelations)
        while calm.catalog.set(set)?.status != .released { calm.advanceWeek() }
        let lossPlain = 50 - plain.market.state(.kids).goodwill
        let lossCalm = 50 - calm.market.state(.kids).goodwill
        #expect(calm.goodwillLoss(-10) == -5)
        #expect(lossCalm <= lossPlain)
    }

    @Test("A story writer makes story beats move relations 50% more (U7)")
    func storyWriter() throws {
        var world = try Fixture.world().world
        #expect(world.storyStrength == 1)
        hire(&world, .storyWriter)
        #expect(world.storyStrength == 1.5)
    }
}
