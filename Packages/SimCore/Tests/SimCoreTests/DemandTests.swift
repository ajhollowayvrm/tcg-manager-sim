import Testing
@testable import SimCore

private func factor(_ name: String, _ audience: Audience, in demand: [AudienceDemand]) -> Double? {
    demand[audience.rawValue].factors.first { $0.name == name }?.value
}

private func setTalent(_ world: inout World, _ id: ArtistID, _ change: (inout Artist) -> Void) {
    var t = world.talent
    t.change(id, change)
    world.talentState = t
}

/// A released first set by the founder, and a draft second set led by a board artist.
private func secondSet(legacy: Double) throws -> (world: World, second: SetID) {
    var (world, _, mascot) = try Fixture.released()
    let second = try world.createSet(.main, SetDetails(name: "Two", code: "TWO", size: 10,
                                                       headliner: Headliner(characterID: mascot)),
                                     presetID: Catalog.defaultLadderID)
    try world.createCard(in: second, CardDraft(name: "Aryla, Two", characterID: mascot, rarity: 3))
    let artist = world.talent.artists[0].id
    setTalent(&world, artist) { $0.legacy = legacy }
    try world.setLeadArtist(second, artist)
    return (world, second)
}

@Suite("Demand")
struct DemandTests {
    @Test("Every audience has a demand, and the resellers come last with the stock gap (B7)")
    func shape() throws {
        let (world, set, _) = try Fixture.scheduled()
        let demand = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        #expect(demand.count == Audience.allCases.count)
        #expect(demand.map(\.audience) == Audience.allCases)
        #expect(demand.last?.audience == .resellers)
        #expect(demand.last?.factors.first?.name == "The stock gap")
        #expect(demand.last?.lifetimeShare == 0)
        #expect(world.setDemand(SetID(9_999), packPrice: 4.49).isEmpty)
    }

    @Test("A factor stays from 0.3 to 3, and the share is the base share times the factors, up to 90% (B4)")
    func shares() throws {
        let (world, set, _) = try Fixture.scheduled()
        let demand = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        for d in demand where d.audience != .resellers {
            for f in d.factors {
                #expect(f.value >= 0.3 && f.value <= 3)
                #expect(!f.note.isEmpty)
            }
            let raw = World.baseShare * d.product
            let expected = min(World.maxShare, raw)
            #expect(abs(d.lifetimeShare - expected) < 1e-9)
            let dollars = d.reachedPeople * d.spend * d.lifetimeShare
            #expect(abs(d.lifetimeDollars - dollars) < 1e-6)
        }
    }

    @Test("A read of the demand does not change the world (rule 3)")
    func readIsPure() throws {
        let (world, set, _) = try Fixture.released()
        let before = world
        _ = world.setDemand(set, packPrice: 6)
        #expect(world == before)
    }

    @Test("A higher pack price lowers the price factor, and the normal price has no effect (B4)")
    func price() throws {
        let (world, set, _) = try Fixture.scheduled()
        let normal = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        let dear = world.setDemand(set, packPrice: 9)
        let cheap = world.setDemand(set, packPrice: 2)
        let at = try #require(factor("Price", .kids, in: normal))
        let high = try #require(factor("Price", .kids, in: dear))
        let low = try #require(factor("Price", .kids, in: cheap))
        #expect(abs(at - 1) < 1e-9)
        #expect(high < at)
        #expect(low > at)
        #expect(factor("Price", .resellers, in: normal) == nil)
    }

    @Test("Casual and competitive players mark down a game with no rules, and a headliner helps kids (C3)")
    func fixedFactors() throws {
        let (world, set, _) = try Fixture.scheduled()
        let demand = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        #expect(factor("No game", .competitivePlayers, in: demand) == 0.3)
        #expect(factor("No game", .casualPlayers, in: demand) == 0.7)
        #expect(factor("No game", .kids, in: demand) == nil)
        #expect(factor("Headliner", .kids, in: demand) == 1.1)
        let (bare, bareSet, _) = try Fixture.studio()
        let none = bare.setDemand(bareSet, packPrice: Pricing.defaultPackPrice)
        #expect(factor("Headliner", .kids, in: none) == 0.9)
    }

    @Test("Founder art counts as popularity 20 in the Artists factor, by audience (costs.md 4.4)")
    func artistsFactor() throws {
        let (world, set, _) = try Fixture.scheduled()
        let demand = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        let art = try #require(factor("Artists", .artCollectors, in: demand))
        let chase = try #require(factor("Artists", .chaseCollectors, in: demand))
        let kids = try #require(factor("Artists", .kids, in: demand))
        #expect(abs(art - 0.84) < 1e-9)
        #expect(abs(chase - 0.94) < 1e-9)
        #expect(abs(kids - 0.98) < 1e-9)
        let note = demand[Audience.kids.rawValue].factors.first { $0.name == "Artists" }?.note ?? ""
        #expect(note.contains("founder art"))
    }

    @Test("A legend who returns after a gap lifts the Legend returns factor, and a lesser artist does not (K10)")
    func legendReturns() throws {
        let (legend, second) = try secondSet(legacy: 50)
        let demand = legend.setDemand(second, packPrice: Pricing.defaultPackPrice)
        let art = try #require(factor("Legend returns", .artCollectors, in: demand))
        let chase = try #require(factor("Legend returns", .chaseCollectors, in: demand))
        let kids = try #require(factor("Legend returns", .kids, in: demand))
        #expect(abs(art - 1.3) < 1e-9)
        #expect(abs(chase - 1.2) < 1e-9)
        #expect(abs(kids - 1.05) < 1e-9)
        let (plain, plainSecond) = try secondSet(legacy: 10)
        let none = plain.setDemand(plainSecond, packPrice: Pricing.defaultPackPrice)
        #expect(factor("Legend returns", .artCollectors, in: none) == nil)
    }

    @Test("One hot card lifts the Hot artist factor, and a set with no heat has none (K12)")
    func hotArtist() throws {
        var (world, set, mascot) = try Fixture.studio()
        let artist = world.talent.artists[0].id
        let none = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        #expect(factor("Hot artist", .artCollectors, in: none) == nil)
        setTalent(&world, artist) { $0.breakout = Breakout(riseWeek: 0, newsWeek: 0, peak: 100, weeks: 20, keep: 10) }
        try world.createCard(in: set, CardDraft(name: "Hot card", characterID: mascot, rarity: 3, artistID: artist))
        let demand = world.setDemand(set, packPrice: Pricing.defaultPackPrice)
        let art = try #require(factor("Hot artist", .artCollectors, in: demand))
        let chase = try #require(factor("Hot artist", .chaseCollectors, in: demand))
        let investors = try #require(factor("Hot artist", .investors, in: demand))
        let kids = try #require(factor("Hot artist", .kids, in: demand))
        #expect(abs(art - 1.3) < 1e-9)
        #expect(abs(chase - 1.25) < 1e-9)
        #expect(abs(investors - 1.15) < 1e-9)
        #expect(abs(kids - 1.05) < 1e-9)
    }

    @Test("Each rhythm adds up to 1, and has no weight outside the 52 weeks of the set's life (B6)")
    func rhythms() {
        for audience in Audience.allCases {
            var total = 0.0
            for w in 0..<Rhythm.weeks { total += Rhythm.weight(audience, week: w) }
            #expect(abs(total - 1) < 1e-9)
            #expect(Rhythm.weight(audience, week: -1) == 0)
            #expect(Rhythm.weight(audience, week: Rhythm.weeks) == 0)
        }
        let early = Rhythm.weight(.chaseCollectors, week: 0)
        let late = Rhythm.weight(.chaseCollectors, week: 20)
        #expect(early > late)
        let art1 = Rhythm.weight(.artCollectors, week: 1)
        let art0 = Rhythm.weight(.artCollectors, week: 0)
        #expect(art1 > art0)
    }

    @Test("The hidden favorites are fixed for a seed and differ in range by audience (B5)")
    func prefs() throws {
        let (a, _) = try Fixture.world(seed: 5)
        let (b, _) = try Fixture.world(seed: 5)
        for audience in Audience.allCases {
            #expect(a.prefs(audience) == b.prefs(audience))
            let fit = a.themeFit("mystic", audience)
            #expect(fit >= 0.8 && fit <= 1.2)
        }
        #expect(a.prefs(.chaseCollectors).hitSensitivity == 1.0)
    }
}
