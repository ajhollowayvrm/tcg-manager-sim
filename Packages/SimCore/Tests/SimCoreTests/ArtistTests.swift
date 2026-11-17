import Testing
@testable import SimCore

private func failure(_ body: () throws -> Void) -> CardError? {
    do { try body() } catch { return error as? CardError }
    return nil
}

private func edit(_ world: inout World, _ id: ArtistID, _ change: (inout Artist) -> Void) {
    var t = world.talent
    t.change(id, change)
    world.talentState = t
}

private func wave(riseWeek: Int = 0, newsWeek: Int, peak: Double = 100, weeks: Int = 20, keep: Double = 10) -> Breakout {
    Breakout(riseWeek: riseWeek, newsWeek: newsWeek, peak: peak, weeks: weeks, keep: keep)
}

/// A first set led by an artist, scheduled at the earliest week, and advanced to its release.
private func releasedLed(by artist: ArtistID) throws -> (world: World, set: SetID, mascot: CharacterID) {
    var (world, set, mascot) = try Fixture.studio()
    try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
    try world.setLeadArtist(set, artist)
    let week = max(world.week + Pricing.previewWeeks, world.setArtReadyWeek(set))
    try world.scheduleRelease(set, boxes: 50, packPrice: Pricing.defaultPackPrice, releaseWeek: week)
    while world.catalog.set(set)?.status != .released { world.advanceWeek() }
    return (world, set, mascot)
}

/// A draft second set, led by an artist.
private func secondSet(_ world: inout World, mascot: CharacterID, lead: ArtistID) throws -> SetID {
    let second = try world.createSet(.main, SetDetails(name: "Two", code: "TWO", size: 10,
                                                       headliner: Headliner(characterID: mascot)),
                                     presetID: Catalog.defaultLadderID)
    try world.createCard(in: second, CardDraft(name: "Aryla, Two", characterID: mascot, rarity: 3))
    try world.setLeadArtist(second, lead)
    return second
}

@Suite("Artists")
struct ArtistTests {
    // MARK: - The artist

    @Test("Legacy raises the fee: legacy 100 triples it. Fame is the higher of popularity and legacy (K9, K10)")
    func feeAndFame() {
        var artist = Artist(id: 5, name: "Test", style: nil, fee: 1_000, weeks: 3, popularity: 40, outsideQueue: 0)
        #expect(artist.fee == 1_000)
        #expect(artist.fame == 40)
        artist.legacy = 100
        #expect(artist.fee == 3_000)
        #expect(artist.fame == 100)
        artist.legacy = 29.9
        #expect(!artist.isLegend)
        artist.legacy = Artist.legendLegacy
        #expect(artist.isLegend)
        #expect(!artist.isFounder)
    }

    @Test("The founder draws free and at once, with no style and popularity 20 (K8)")
    func founder() throws {
        let (world, _) = try Fixture.world()
        let founder = world.talent.founder
        #expect(founder.isFounder)
        #expect(founder.baseFee == 0)
        #expect(founder.fee == 0)
        #expect(founder.weeks == 0)
        #expect(founder.style == nil)
        #expect(founder.popularity == World.founderPopularity)
        #expect(world.artReadyWeek(for: founder) == world.week)
        #expect(world.talent.artist(Artist.founderID) == founder)
        #expect(world.talent.artist(nil) == nil)
        #expect(world.talent.artist(9_999) == nil)
    }

    @Test("A breakout rises quietly, peaks at the news, then cools to nothing (K11)")
    func breakoutCurve() {
        let b = wave(riseWeek: 10, newsWeek: 16, peak: 80, weeks: 10, keep: 40)
        #expect(b.heat(at: 9) == 0)
        let first = b.heat(at: 10)
        let last = b.heat(at: 15)
        #expect(abs(first - 80 * Breakout.riseShare / 6) < 1e-9)
        #expect(abs(last - 80 * Breakout.riseShare) < 1e-9)
        #expect(b.heat(at: 16) == 80)
        #expect(b.heat(at: 21) == 40)
        #expect(b.heat(at: 26) == 0)
        #expect(!b.isPublic(at: 15))
        #expect(b.isPublic(at: 16))
        #expect(b.endWeek == 26)
        #expect(b.lasts)
        #expect(!wave(newsWeek: 5, keep: 34).lasts)
    }

    // MARK: - The talent board

    @Test("The board has 12 different artists inside the design's ranges, the same for the same seed (K1)")
    func board() throws {
        let (world, _) = try Fixture.world()
        let artists = world.talent.artists
        #expect(artists.count == TalentBoard.size)
        #expect(Set(artists.map(\.id)).count == 12)
        #expect(Set(artists.map(\.name)).count == 12)
        for a in artists {
            #expect(a.baseFee >= 400 && a.baseFee <= 2_500)
            #expect(a.baseFee.truncatingRemainder(dividingBy: 50) == 0)
            #expect(a.weeks >= 2 && a.weeks <= 8)
            #expect(a.popularity >= 0 && a.popularity <= 100)
            #expect(a.legacy == 0)
            #expect(a.breakout == nil)
        }
        let everyone = world.talent.everyone
        #expect(everyone.count == 13)
        #expect(everyone.first?.isFounder == true)
        let same = try Fixture.world().world
        #expect(same.talent == world.talent)
        let other = try Fixture.world(seed: 5).world
        #expect(other.talent != world.talent)
    }

    // MARK: - Commissions and art weeks

    @Test("A commission pays the artist's fee and waits weeks, outside queue, and cards in progress (K2)")
    func commission() throws {
        var (world, set, mascot) = try Fixture.studio()
        let artist = world.talent.artists[0]
        let ready = world.artReadyWeek(for: artist)
        #expect(ready == world.week + artist.weeks + artist.outsideQueue)
        let cash = world.business.cash
        let id = try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3, artistID: artist.id))
        let card = try #require(world.catalog.card(id))
        #expect(card.artistID == artist.id)
        #expect(card.artReadyWeek == ready)
        #expect(world.business.cash == cash - artist.fee)
        #expect(world.business.ledger.last?.note.hasPrefix("Art: One by") == true)
        #expect(world.cardsInProgress(artist.id) == 1)
        // An artist draws 3 cards at the same time (W1): the 2nd and 3rd card do not wait.
        #expect(world.artReadyWeek(for: artist) == ready)
        try world.createCard(in: set, CardDraft(name: "Two", characterID: mascot, rarity: 3, artistID: artist.id))
        try world.createCard(in: set, CardDraft(name: "Three", characterID: mascot, rarity: 3, artistID: artist.id))
        #expect(world.artReadyWeek(for: artist) == ready + 1)
        #expect(world.setArtReadyWeek(set) == ready)
    }

    @Test("The founder's card is free and done at once, and an unknown artist is refused (K2, K8)")
    func commissionFounderAndUnknown() throws {
        var (world, set, mascot) = try Fixture.studio()
        let cash = world.business.cash
        let id = try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3, artistID: Artist.founderID))
        #expect(world.catalog.card(id)?.artReadyWeek == world.week)
        #expect(world.business.cash == cash)
        let ghost = failure { try world.createCard(in: set, CardDraft(name: "Two", characterID: mascot, rarity: 3, artistID: 9_999)) }
        #expect(ghost == .unknownArtist)
        #expect(world.catalog.cards(in: set).count == 1)
    }

    // MARK: - Lead artists (K7)

    @Test("A lead artist is a new commission: it starts now, and the delay and fee are fixed then (K7)")
    func leadArtist() throws {
        var (world, set, _) = try Fixture.studio()
        #expect(world.leadReadyWeek(set) == nil)
        let artist = world.talent.artists[0]
        try world.setLeadArtist(set, artist.id)
        let lead = try #require(world.catalog.set(set)?.leadArt)
        #expect(lead.artistID == artist.id)
        #expect(lead.startWeek == world.week)
        #expect(lead.delay == artist.weeks + artist.outsideQueue)
        #expect(lead.cardFee == artist.fee)
        #expect(abs(lead.fillerFee - artist.fee * LeadArt.fillerShare) < 1e-9)
        world.advanceWeek()
        try world.setLeadArtist(set, artist.id)
        #expect(world.catalog.set(set)?.leadArt?.startWeek == 0)
        try world.setLeadArtist(set, Artist.founderID)
        let founder = try #require(world.catalog.set(set)?.leadArt)
        #expect(founder.startWeek == world.week)
        #expect(founder.delay == 0)
        #expect(world.leadReadyWeek(set) == world.week)
        try world.setLeadArtist(set, nil)
        #expect(world.catalog.set(set)?.leadArt == nil)
    }

    @Test("A lead artist must exist, the set must be known, and a locked set cannot change (K7)")
    func leadArtistErrors() throws {
        var (world, set, _) = try Fixture.studio()
        #expect(failure { try world.setLeadArtist(set, 9_999) } == .unknownArtist)
        #expect(failure { try world.setLeadArtist(SetID(9_999), Artist.founderID) } == .unknownSet(9_999))
        var (scheduled, lockedSet, _) = try Fixture.scheduled()
        #expect(failure { try scheduled.setLeadArtist(lockedSet, nil) } == .setLocked)
        #expect(scheduled.catalog.set(lockedSet)?.leadArt != nil)
    }

    @Test("The lead draws the filler and the cards with no own artist, and is paid per card and per filler card (K7)")
    func leadTimeAndPay() throws {
        var (world, set, mascot) = try Fixture.studio()
        let artist = world.talent.artists[0]
        let other = world.talent.artists[1]
        try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3))
        try world.createCard(in: set, CardDraft(name: "Two", characterID: mascot, rarity: 3, artistID: other.id))
        try world.setLeadArtist(set, artist.id)
        #expect(world.leadDesigned(set) == 1)
        #expect(world.plannedFiller(set) == 8)
        let lead = try #require(world.catalog.set(set)?.leadArt)
        let expected = lead.cardFee * 1 + lead.fillerFee * 8
        let pay = world.leadArtCost(set)
        #expect(abs(pay - expected) < 1e-9)
        let fillerWeeks = 1
        #expect(world.leadReadyWeek(set) == lead.startWeek + lead.delay + fillerWeeks + 1)
        #expect(world.cardsInProgress(artist.id) == 1 + fillerWeeks)
        #expect(world.setArtReadyWeek(set) >= world.leadReadyWeek(set) ?? 0)
    }

    @Test("A card is drawn by its own artist, else the lead, else the founder. Shares count a card as 3 filler (K7, K9)")
    func shares() throws {
        var (world, set, mascot) = try Fixture.studio()
        let artist = world.talent.artists[0]
        let a = try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3, artistID: artist.id))
        let b = try world.createCard(in: set, CardDraft(name: "Two", characterID: mascot, rarity: 3))
        let cardB = try #require(world.catalog.card(b))
        #expect(world.artistID(of: try #require(world.catalog.card(a))) == artist.id)
        #expect(world.artistID(of: cardB) == Artist.founderID)
        try world.setLeadArtist(set, world.talent.artists[1].id)
        let lead = world.talent.artists[1].id
        let cardB2 = try #require(world.catalog.card(b))
        #expect(world.artistID(of: cardB2) == lead)
        #expect(abs(world.artShare(artist.id, in: set) - 3.0 / 14) < 1e-9)
        #expect(abs(world.artShare(lead, in: set) - 11.0 / 14) < 1e-9)
        let total = world.artShares(in: set).values.reduce(0, +)
        #expect(abs(total - 1) < 1e-9)
    }

    @Test("An artist is known only after a released set has their art (K9)")
    func known() throws {
        let (world, _, _) = try Fixture.released()
        let board = world.talent.artists[0].id
        #expect(world.isKnown(Artist.founderID))
        #expect(!world.isKnown(board))
        #expect(world.releasedSets.count == 1)
        #expect(world.setsDrawn(by: Artist.founderID).count == 1)
        #expect(world.setsDrawn(by: board).isEmpty)
    }

    // MARK: - Legacy, legends, returns (K9, K10)

    @Test("Legacy grows with the fan base after a release, makes a legend, and raises the fee (K9, K10)")
    func legacyGrows() throws {
        let artist = try Fixture.world().world.talent.artists[0].id
        var (world, set, _) = try releasedLed(by: artist)
        let start = try #require(world.catalog.set(set)?.release?.fansAtRelease)
        let before = try #require(world.talent.artist(artist))
        #expect(!before.isLegend)
        var m = world.market
        m.addReach(.kids, people: start * 7)
        world.marketState = m
        world.growLegacy()
        let after = try #require(world.talent.artist(artist))
        #expect(after.legacy > 30)
        #expect(after.legacy <= 100)
        #expect(after.isLegend)
        #expect(after.fee > before.fee)
        #expect(world.business.news.contains { $0.text.contains("is now a legend") })
    }

    @Test("Legacy never falls, even when the fan base falls (K9)")
    func legacyNeverFalls() throws {
        let artist = try Fixture.world().world.talent.artists[0].id
        var (world, set, _) = try releasedLed(by: artist)
        let start = try #require(world.catalog.set(set)?.release?.fansAtRelease)
        var m = world.market
        m.addReach(.kids, people: start * 3)
        world.marketState = m
        world.growLegacy()
        let high = try #require(world.talent.artist(artist)).legacy
        #expect(high > 0)
        var empty = world.market
        for i in empty.audiences.indices { empty.audiences[i].reach = 0 }
        world.marketState = empty
        world.growLegacy()
        #expect(world.talent.artist(artist)?.legacy == high)
        var last = high
        for _ in 0..<5 {
            world.advanceWeek()
            let now = try #require(world.talent.artist(artist)).legacy
            #expect(now >= last)
            last = now
        }
    }

    @Test("A legend returns when they draw a set after a set with no art by them (K10)")
    func returningLegend() throws {
        var (world, _, mascot) = try Fixture.released()
        let legend = world.talent.artists[0].id
        let second = try secondSet(&world, mascot: mascot, lead: legend)
        edit(&world, legend) { $0.legacy = 10 }
        #expect(world.returningLegends(second).isEmpty)
        edit(&world, legend) { $0.legacy = 50 }
        #expect(world.returningLegends(second).map(\.id) == [legend])
        let first = try #require(world.releasedSets.first).id
        #expect(world.returningLegends(first).isEmpty)
    }

    @Test("A legend does not return when they drew the last set, or when there is no earlier set (K10)")
    func noReturn() throws {
        let legend = try Fixture.world().world.talent.artists[0].id
        var (world, _, mascot) = try releasedLed(by: legend)
        edit(&world, legend) { $0.legacy = 50 }
        let second = try secondSet(&world, mascot: mascot, lead: legend)
        #expect(world.returningLegends(second).isEmpty)
        var (fresh, set, _) = try Fixture.studio()
        let artist = fresh.talent.artists[0].id
        edit(&fresh, artist) { $0.legacy = 50 }
        try fresh.setLeadArtist(set, artist)
        #expect(fresh.returningLegends(set).isEmpty)
    }

    @Test("Scheduling a set with a returning legend makes news (K10)")
    func returnNews() throws {
        var (world, _, mascot) = try Fixture.released()
        let legend = world.talent.artists[0]
        edit(&world, legend.id) { $0.legacy = 50 }
        let second = try secondSet(&world, mascot: mascot, lead: legend.id)
        let week = max(world.week + Pricing.previewWeeks, world.setArtReadyWeek(second))
        try world.scheduleRelease(second, boxes: 1, packPrice: 4.49, releaseWeek: week)
        let news = world.business.news.last { $0.text.contains("returns to draw") }
        #expect(news?.text.hasPrefix("\(legend.name) returns to draw Two") == true)
    }

    @Test("Alumni can be hired, stay busy by their fame, and do not move the board's random stream (K10)")
    func alumni() throws {
        var (world, set, mascot) = try Fixture.studio()
        var control = world
        var t = world.talent
        let alum = Artist(id: 900, name: "Old Hand", style: nil, fee: 800, weeks: 3, popularity: 90, outsideQueue: 0)
        t.alumniState = [alum]
        world.talentState = t
        #expect(world.talent.alumni.map(\.id) == [900])
        #expect(world.talent.everyone.contains { $0.id == 900 })
        try world.setLeadArtist(set, 900)
        #expect(world.catalog.set(set)?.leadArt?.artistID == 900)
        try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3, artistID: 900))
        for _ in 0..<10 {
            world.week += 1
            control.week += 1
            world.advanceTalent()
            control.advanceTalent()
        }
        #expect(world.talent.artists == control.talent.artists)
        #expect(world.talent.alumni.first?.outsideQueue == 3)
    }

    @Test("An artist who drew for the studio joins the alumni when they leave the board (K10)")
    func leavesToAlumni() throws {
        var (world, set, mascot) = try Fixture.studio()
        let worked = world.talent.artists[0].id
        try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3, artistID: worked))
        world.week = 50
        var weeks = 0
        while world.talent.artists.contains(where: { $0.id == worked }), weeks < 1_500 {
            world.week += 1
            weeks += 1
            world.advanceTalent()
        }
        #expect(!world.talent.artists.contains { $0.id == worked })
        #expect(world.talent.alumni.map(\.id) == [worked])
        #expect(world.talent.artists.count == TalentBoard.size)
        #expect(world.talent.artist(worked) != nil)
        #expect(world.business.news.contains { $0.text.contains("You can still hire them from your alumni.") })
    }

    // MARK: - Breakouts and scouts (K11)

    @Test("Random breakouts follow the design: a 6-week rise, a peak of 60 to 100, a wave of 8 to 20 weeks (K11)")
    func randomBreakouts() throws {
        var (world, _) = try Fixture.world()
        var seen = 0
        for _ in 0..<60 {
            world.week += 1
            world.advanceTalent()
            #expect(world.talent.artists.count == TalentBoard.size)
            for a in world.talent.artists {
                guard let b = a.breakout else { continue }
                seen += 1
                #expect(b.newsWeek - b.riseWeek == Breakout.riseWeeks)
                #expect(b.peak >= 60 && b.peak <= 100)
                #expect(b.weeks >= 8 && b.weeks <= 20)
                let keepsLittle = b.keep >= 8 && b.keep <= 20
                let keepsMuch = b.keep >= 40 && b.keep <= 60
                #expect(keepsLittle || keepsMuch)
                let heat = a.heat(at: world.week)
                #expect(heat >= 0 && heat <= 100)
            }
        }
        #expect(seen > 0)
    }

    @Test("The news breaks on the news week, and when the wave ends the artist keeps part of the fame (K11)")
    func breakoutLifecycle() throws {
        var (world, _) = try Fixture.world()
        let star = world.talent.artists[0]
        let fad = world.talent.artists[1]
        edit(&world, star.id) { $0.popularity = 30; $0.breakout = wave(newsWeek: 6, peak: 80, weeks: 8, keep: 40) }
        edit(&world, fad.id) { $0.popularity = 30; $0.breakout = wave(newsWeek: 6, peak: 80, weeks: 8, keep: 10) }
        world.week = 6
        world.advanceTalent()
        #expect(world.business.news.contains { $0.text == "\(star.name)'s art went viral. Studios rush to book them." })
        world.week = 13
        world.advanceTalent()
        #expect(world.talent.artist(star.id)?.breakout != nil)
        world.week = 14
        world.advanceTalent()
        #expect(world.talent.artist(star.id)?.breakout == nil)
        #expect(world.talent.artist(star.id)?.popularity == 70)
        #expect(world.talent.artist(fad.id)?.popularity == 40)
        #expect(world.business.news.contains { $0.text.contains("The wave around \(star.name) is over. They stay a star.") })
        #expect(world.business.news.contains { $0.text.contains("The wave around \(fad.name) is over. Most of the fame faded.") })
    }

    @Test("Other studios book a hot artist, so the outside queue grows with the public heat (K11)")
    func hotQueue() throws {
        var (world, _) = try Fixture.world()
        let hot = world.talent.artists[0].id
        let calm = world.talent.artists[1].id
        edit(&world, hot) { $0.popularity = 0; $0.breakout = wave(riseWeek: 14, newsWeek: 20) }
        edit(&world, calm) { $0.popularity = 0 }
        world.week = 20
        world.advanceTalent()
        let hotQueue = try #require(world.talent.artist(hot)).outsideQueue
        let calmQueue = try #require(world.talent.artist(calm)).outsideQueue
        #expect(hotQueue >= 2)
        #expect(calmQueue <= 1)
    }

    @Test("Scouts see a rising artist 3 weeks early, and a scouting network 6 weeks early (K11)")
    func scouts() throws {
        var (world, _) = try Fixture.world()
        let id = world.talent.artists[0].id
        edit(&world, id) { $0.breakout = wave(riseWeek: 4, newsWeek: 10, keep: 50) }
        func artist() -> Artist { world.talent.artist(id)! }
        world.week = 7
        #expect(world.scoutLead == 0)
        #expect(!world.isRisingSeen(artist()))
        world.setMarketInsight(.scout, on: true)
        #expect(world.scoutLead == 3)
        #expect(world.isRisingSeen(artist()))
        world.week = 6
        #expect(!world.isRisingSeen(artist()))
        world.setMarketInsight(.scoutNetwork, on: true)
        #expect(world.scoutLead == 6)
        world.week = 4
        #expect(world.isRisingSeen(artist()))
        world.advanceTalent()
        let name = artist().name
        let report = world.business.news.first { $0.text.hasPrefix("Your scouts see \(name)") }
        #expect(report?.text.contains("The fame looks set to last.") == true)
        world.week = 10
        #expect(!world.isRisingSeen(artist()))
    }

    @Test("An artist is hot from the news week until the wave ends (K11)")
    func hot() throws {
        var (world, _) = try Fixture.world()
        let id = world.talent.artists[0].id
        edit(&world, id) { $0.breakout = wave(riseWeek: 4, newsWeek: 10, weeks: 10) }
        let artist = try #require(world.talent.artist(id))
        world.week = 9
        #expect(!world.isHot(artist))
        world.week = 10
        #expect(world.isHot(artist))
        world.week = 19
        #expect(world.isHot(artist))
        world.week = 20
        #expect(!world.isHot(artist))
        let plain = world.talent.artists[1]
        #expect(!world.isHot(plain))
    }

    // MARK: - Hot cards (K12)

    @Test("A card's heat is half the heat when it was commissioned and half the heat now (K12)")
    func cardHeat() throws {
        var (world, set, mascot) = try Fixture.studio()
        let id = world.talent.artists[0].id
        let early = try world.createCard(in: set, CardDraft(name: "Early", characterID: mascot, rarity: 3, artistID: id))
        edit(&world, id) { $0.breakout = wave(newsWeek: 0) }
        let late = try world.createCard(in: set, CardDraft(name: "Late", characterID: mascot, rarity: 3, artistID: id))
        let earlyCard = try #require(world.catalog.card(early))
        let lateCard = try #require(world.catalog.card(late))
        #expect(earlyCard.heatAtCommission == 0)
        #expect(lateCard.heatAtCommission == 100)
        #expect(world.cardHeat(earlyCard) == 50)
        #expect(world.cardHeat(lateCard) == 100)
        let founderCard = try world.createCard(in: set, CardDraft(name: "Founder", characterID: mascot, rarity: 3))
        let plain = try #require(world.catalog.card(founderCard))
        #expect(world.cardHeat(plain) == 0)
    }

    @Test("A lead artist's heat counts for every card with no own artist (K12)")
    func leadHeat() throws {
        var (world, set, mascot) = try Fixture.studio()
        let id = world.talent.artists[0].id
        edit(&world, id) { $0.breakout = wave(newsWeek: 0) }
        let card = try world.createCard(in: set, CardDraft(name: "One", characterID: mascot, rarity: 3))
        try world.setLeadArtist(set, id)
        let lead = try #require(world.catalog.set(set)?.leadArt)
        #expect(lead.heat == 100)
        let drawn = try #require(world.catalog.card(card))
        #expect(world.cardHeat(drawn) == 100)
    }

    // MARK: - Reviews

    @Test("A set's artists gain popularity when it does well, and lose some when it does badly (B10)")
    func reviewArtists() throws {
        let (world, set, _) = try Fixture.scheduled()
        var strong = world
        strong.reviewArtists(of: set, quality: 2)
        #expect(strong.talent.founder.popularity == 38)
        var normal = world
        normal.reviewArtists(of: set, quality: 1)
        #expect(normal.talent.founder.popularity == 23)
        var weak = world
        weak.reviewArtists(of: set, quality: 0.1)
        #expect(weak.talent.founder.popularity == 18)
    }
}
