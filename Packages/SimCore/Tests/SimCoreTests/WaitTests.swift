import Testing
@testable import SimCore

@Suite("The wait for the first set")
struct WaitTests {
    @Test("A lead draws 25 filler cards a week and 3 designed cards at the same time (W1)")
    func fasterLead() throws {
        var (world, set, mascot) = try Fixture.studio(size: 60)
        for i in 0..<10 {
            try world.createCard(in: set, CardDraft(name: "Aryla, C\(i)", characterID: mascot, rarity: 3))
        }
        let lead = try #require(world.talent.artists.first)
        let delay = lead.weeks + lead.outsideQueue + world.cardsInProgress(lead.id) / LeadArt.parallelCards
        try world.setLeadArtist(set, lead.id)
        // 50 filler cards: 2 weeks. 10 designed cards, 3 at a time: 4 weeks.
        #expect(world.leadReadyWeek(set) == world.week + delay + 2 + 4)
    }

    @Test("A finished card can be revealed once, one card for each set each week, and it adds hype and reach (W2)")
    func reveal() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.setLeadArtist(set, Artist.founderID)
        let a = try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 8))
        let b = try world.createCard(in: set, CardDraft(name: "Aryla, Dawn", characterID: mascot, rarity: 1))
        #expect(world.revealState(a) == .ready)
        let reach = world.market.state(.chaseCollectors).reachedPeople
        let buzz = try #require(world.character(mascot)).buzz
        try world.revealCard(a)
        #expect(world.revealState(a) == .revealed(week: world.week))
        #expect(world.revealState(b) == .oneAWeek)
        #expect(try #require(world.character(mascot)).buzz > buzz)
        #expect(world.market.state(.chaseCollectors).reachedPeople > reach)
        world.advanceWeek()
        #expect(world.revealState(b) == .ready)
    }

    @Test("A card waits for its art, and a released set has no spoilers (W2)")
    func revealLimits() throws {
        var (world, set, mascot) = try Fixture.studio()
        let artist = try #require(world.talent.artists.first)
        let card = try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3, artistID: artist.id))
        let done = try #require(world.catalog.card(card)?.artReadyWeek)
        #expect(world.revealState(card) == .artNotDone(week: done))
        let released = try Fixture.released()
        let first = try #require(released.world.catalog.cards(in: released.set).first)
        #expect(released.world.revealState(first.id) == .notInSeason)
    }

    @Test("A studio action costs money, has its effect, and waits for its cooldown (W3)")
    func actions() throws {
        var (world, set, mascot) = try Fixture.studio()
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        let cash = world.business.cash
        let trust = world.channels.trust(.hobby)
        try world.runAction(.demoDay)
        #expect(world.business.cash == cash - StudioAction.demoDay.cost)
        #expect(world.channels.trust(.hobby) > trust)
        #expect(world.actionReadyWeek(.demoDay) == world.week + 4)
        #expect(throws: CardError.self) { try world.runAction(.demoDay) }
        let known = try #require(world.character(mascot)).knowledge[.kids]
        try world.runAction(.playtest)
        #expect(try #require(world.character(mascot)).knowledge[.kids] > known)
        let reach = world.market.state(.artCollectors).reachedPeople
        try world.runAction(.convention)
        #expect(world.market.state(.artCollectors).reachedPeople > reach)
    }
}
