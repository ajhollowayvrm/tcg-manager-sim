import Testing
@testable import SimCore

@Suite("Timeline")
struct TimelineTests {
    @Test("The next event is the earliest of art done, a release, a reprint, or a crowdfund end (T2)")
    func nextEvent() throws {
        var (world, set, mascot) = try Fixture.studio()
        #expect(world.nextEvent == nil)
        let artist = try #require(world.talent.artists.first)
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3, artistID: artist.id))
        let art = world.setArtReadyWeek(set)
        #expect(world.nextEvent == UpcomingEvent(week: art, text: "Base art done"))
        let scheduled = try Fixture.scheduled().world
        #expect(scheduled.nextEvent?.text == "Base releases")
    }

    @Test("Skip to the next event stops at a news item or at the event, and never passes the limit (T3)")
    func skip() throws {
        var (world, set, _) = try Fixture.scheduled()
        let release = try #require(world.catalog.set(set)?.release?.releaseWeek)
        let passed = world.advanceToNextEvent()
        #expect(passed >= 1)
        #expect(world.week <= release)
        var empty = try Fixture.world().world
        #expect(empty.advanceToNextEvent(maxWeeks: 5) <= 5)
    }
}
