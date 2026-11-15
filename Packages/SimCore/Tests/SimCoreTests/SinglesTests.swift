import Testing
@testable import SimCore

@Suite("Singles")
struct SinglesTests {
    /// A world with one set that has one designed card at a tier, scheduled with a print run.
    func scheduled(rarity: TierID, boxes: Int, seed: UInt64 = 2026) throws -> (World, SetID, CardID) {
        var (world, set, mascot) = try Fixture.studio(seed: seed)
        let card = try world.createCard(in: set, CardDraft(name: "Aryla, Shade", characterID: mascot, rarity: rarity))
        try world.setLeadArtist(set, Artist.founderID)
        try world.scheduleRelease(set, boxes: boxes, packPrice: Pricing.defaultPackPrice, releaseWeek: world.week + Pricing.previewWeeks)
        return (world, set, card)
    }

    func price(_ world: World, _ set: SetID, _ card: CardID) -> Double {
        world.singles(in: set).first { $0.key.cardID == card && $0.key.version == .base }?.price ?? 0
    }

    func growFans(_ world: inout World, by factor: Double) {
        var m = world.market
        for a in Audience.allCases where a != .resellers {
            m.addReach(a, people: m.state(a).reachedPeople * (factor - 1))
        }
        world.marketState = m
    }

    @Test("A set with no release plan has no singles, and a price is never below $0.10 (M1, M2)")
    func basics() throws {
        let (draft, set, _) = try Fixture.studio()
        #expect(draft.singles(in: set).isEmpty)
        let (world, scheduledSet, _) = try scheduled(rarity: 3, boxes: 50)
        let singles = world.singles(in: scheduledSet)
        #expect(!singles.isEmpty)
        #expect(singles.allSatisfy { $0.price >= World.singlesFloor })
        let sorted = zip(singles, singles.dropFirst()).allSatisfy { $0.price >= $1.price }
        #expect(sorted)
    }

    @Test("Scarcity: the same card is worth more from a smaller print run (M2)")
    func scarcity() throws {
        let (small, s1, c1) = try scheduled(rarity: 8, boxes: 20)
        let (big, s2, c2) = try scheduled(rarity: 8, boxes: 2_000)
        #expect(price(small, s1, c1) > price(big, s2, c2))
    }

    @Test("Character now: more fans of the character today lift its old cards (M2)")
    func characterNow() throws {
        var (world, set, card) = try scheduled(rarity: 8, boxes: 20)
        let before = price(world, set, card)
        let id = try #require(world.catalog.card(card)?.characterID)
        let i = try #require(world.index(of: id))
        world.characters[i].buzz = 100
        world.characters[i].awareness[.chaseCollectors] = 1
        world.characters[i].awareness[.artCollectors] = 1
        #expect(price(world, set, card) > before * 2)
    }

    @Test("Age and nostalgia: a card gains value as the years pass, more in the first era (M2)")
    func nostalgia() throws {
        var (world, set, _) = try scheduled(rarity: 8, boxes: 20)
        world.catalog.sets[0].release?.stockPacks = 0
        let start = try #require(world.catalog.set(set))
        world.week = (start.release?.releaseWeek ?? 0)
        let fresh = world.nostalgia(start)
        world.week += 260
        let old = world.nostalgia(try #require(world.catalog.set(set)))
        #expect(fresh == 1)
        // Five years: 0.3 × 5 = 1.5, times 1.5 for the first era.
        #expect(old == 1 + 1.5 * 1.5)
    }

    @Test("The Prime scenario: an old frame-break holo from a small print beats a modern gold card from a huge print (M2)")
    func primeBeatsModern() throws {
        // Year 1: a small first set. The card is at the frame-break holo tier (SIR, tier 8).
        var (world, prime, primeCard) = try scheduled(rarity: 8, boxes: 30)
        world.week += Pricing.previewWeeks
        world.catalog.sets[0].status = .released
        world.catalog.sets[0].release?.stockPacks = 0
        // Five years later, the hobby is big, and a modern set prints a huge run of a gold card.
        world.week += 260
        growFans(&world, by: 50)
        let modern = try world.createSet(.main, SetDetails(name: "Modern", code: "MOD", size: 10), presetID: Catalog.defaultLadderID)
        let mascot = try #require(world.catalog.card(primeCard)?.characterID)
        let modernCard = try world.createCard(in: modern, CardDraft(name: "Aryla, Gold", characterID: mascot, rarity: 9))
        try world.setLeadArtist(modern, Artist.founderID)
        try world.scheduleRelease(modern, boxes: 20_000, packPrice: Pricing.defaultPackPrice, releaseWeek: world.week + Pricing.previewWeeks)
        world.week += Pricing.previewWeeks
        let gold = try #require(world.catalog.set(modern)?.ladder.tier(9))
        let sir = try #require(world.catalog.set(prime)?.ladder.tier(8))
        // The modern card has the richer look.
        #expect(RarityFeel.score(gold) > RarityFeel.score(sir))
        // The old card is worth far more.
        let old = price(world, prime, primeCard)
        let new = price(world, modern, modernCard)
        #expect(old > new * 5)
    }

    @Test("A reprint adds copies, so the price falls, and a big fall upsets investors (M4)")
    func reprint() throws {
        var (world, set, card) = try scheduled(rarity: 8, boxes: 20)
        growFans(&world, by: 100)
        while world.catalog.set(set)?.status != .released { world.advanceWeek() }
        let before = price(world, set, card)
        let goodwill = world.market.state(.investors).goodwill
        try world.reprint(set, boxes: 2_000)
        for _ in 0..<Pricing.reprintWeeks { world.advanceWeek() }
        #expect(price(world, set, card) < before * 0.7)
        #expect(world.market.state(.investors).goodwill < goodwill)
        #expect(world.business.news.contains { $0.text.hasPrefix("The reprint of Base cut its top single") })
    }

    @Test("Newer cards of the same character take a small part of the demand, down to 70% (M4)")
    func competition() throws {
        var (world, set, card) = try scheduled(rarity: 8, boxes: 20)
        let c = try #require(world.catalog.card(card))
        let week = try #require(world.catalog.set(set)?.release?.releaseWeek)
        #expect(world.competition(c, after: week) == 1)
        #expect(world.competition(c, after: week - 1) == 1)
        let later = try world.createSet(.main, SetDetails(name: "Later", code: "LAT", size: 10), presetID: Catalog.defaultLadderID)
        try world.createCard(in: later, CardDraft(name: "Aryla, New", characterID: c.characterID, rarity: 3))
        try world.setLeadArtist(later, Artist.founderID)
        try world.scheduleRelease(later, boxes: 10, packPrice: Pricing.defaultPackPrice, releaseWeek: week + 10)
        #expect(abs(world.competition(c, after: week) - 1 / 1.05) < 1e-9)
    }

    @Test("A price is a read: it changes nothing and gives the same value twice (M2)")
    func pureRead() throws {
        let (world, set, _) = try scheduled(rarity: 8, boxes: 20)
        let copy = world
        let first = world.singles(in: set)
        let second = world.singles(in: set)
        #expect(first == second)
        #expect(world == copy)
    }

    @Test("Valuable pulls lift chase collectors and investors through the Singles factor (M1)")
    func packValueFactor() throws {
        var (world, set, _) = try scheduled(rarity: 8, boxes: 20)
        func factor(_ a: Audience) -> Double? {
            world.setDemand(set, packPrice: Pricing.defaultPackPrice)[a.rawValue].factors.first { $0.name == "Singles" }?.value
        }
        #expect(factor(.kids) == nil)
        let low = try #require(factor(.chaseCollectors))
        growFans(&world, by: 1_000)
        let high = try #require(factor(.chaseCollectors))
        #expect(high > low)
        #expect(high <= 1.6)
        #expect(try #require(factor(.investors)) == high)
    }

    @Test("The week step keeps 13 weeks of history for the top singles, and reports price milestones (M3)")
    func historyAndNews() throws {
        var (world, set, _) = try scheduled(rarity: 8, boxes: 20)
        growFans(&world, by: 2_000)
        for _ in 0..<8 { world.advanceWeek() }
        #expect(world.catalog.set(set)?.status == .released)
        let history = world.singlesMarket.history
        #expect(!history.isEmpty)
        #expect(history.count <= SinglesState.trackedPerSet)
        #expect(history.values.allSatisfy { $0.count <= SinglesState.historyWeeks })
        #expect(world.business.news.contains { $0.text.contains("now sells for") })
        let top = try #require(world.hallOfFame().first)
        #expect(world.priceTrend(top) != nil)
    }
}
