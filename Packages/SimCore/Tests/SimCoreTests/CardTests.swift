import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

fileprivate func draft(_ character: CharacterID, rarity: TierID = 1, name: String = "Aryla, Star") -> CardDraft {
    CardDraft(name: name, characterID: character, rarity: rarity)
}

fileprivate func otherCharacter(_ world: inout World) throws -> CharacterID {
    try world.createCharacter(CharacterDraft(
        name: "Borin", role: .rival, primaryType: .stone, archetype: .fierce, palette: [.slate, .forest], kind: .creature
    ))
}

fileprivate func version(_ id: VersionID, _ name: String) -> CardVersion {
    CardVersion(id: id, name: name, look: .plain)
}

@Suite("Cards")
struct CardTests {
    @Test("A new card gets a trimmed name, a hidden shift, and the filler follows (C2, S3, R24)")
    func createCard() throws {
        var (world, set, mascot) = try Fixture.studio()
        let id = try world.createCard(in: set, draft(mascot, rarity: 3, name: "  Aryla, Star  "))
        let second = try world.createCard(in: set, draft(mascot, rarity: 3, name: "Aryla, Moon"))
        let card = try #require(world.catalog.card(id))
        let other = try #require(world.catalog.card(second))
        #expect(card.name == "Aryla, Star")
        #expect(card.filler == false)
        #expect(card.setID == set)
        #expect(card.rarity == 3)
        #expect(card.cardShift[.kids] != 0)
        #expect(card.cardShift[.resellers] == 0)
        #expect(card.cardShift != other.cardShift)
        #expect(world.catalog.cards(in: set).count == 2)
        #expect(world.catalog.allCards(in: set).count == 10)
        #expect(world.catalog.fillerCards(in: set).count == 8)
    }

    @Test("A card needs a name, a character, and a rarity from the set's ladder (C2)")
    func cardFieldErrors() throws {
        var (world, set, mascot) = try Fixture.studio()
        let long = String(repeating: "x", count: Card.nameLimit + 1)
        expectFailure(.unknownSet(999)) { _ = try world.createCard(in: 999, draft(mascot)) }
        expectFailure(.emptyName) { _ = try world.createCard(in: set, draft(mascot, name: "  ")) }
        expectFailure(.nameTooLong(Card.nameLimit)) { _ = try world.createCard(in: set, draft(mascot, name: long)) }
        expectFailure(.noSubject) { _ = try world.createCard(in: set, CardDraft(name: "A", rarity: 1)) }
        expectFailure(.unknownCharacter(999)) { _ = try world.createCard(in: set, draft(999)) }
        expectFailure(.noRarity) { _ = try world.createCard(in: set, CardDraft(name: "A", characterID: mascot)) }
        expectFailure(.unknownTier(99)) { _ = try world.createCard(in: set, draft(mascot, rarity: 99)) }
        expectFailure(.unknownForm(999)) {
            _ = try world.createCard(in: set, CardDraft(name: "A", characterID: mascot, formID: 999, rarity: 1))
        }
        expectFailure(.unknownArtist) {
            _ = try world.createCard(in: set, CardDraft(name: "A", characterID: mascot, rarity: 1, artistID: 9999))
        }
        #expect(world.catalog.cards(in: set).isEmpty)
    }

    @Test("Featured characters: up to 2, no repeat, not the subject, all known (R22)")
    func featuredRules() throws {
        var (world, set, mascot) = try Fixture.studio()
        let other = try otherCharacter(&world)
        var d = draft(mascot)
        d.featured = [other, other]
        expectFailure(.duplicateFeatured) { _ = try world.createCard(in: set, d) }
        d.featured = [mascot]
        expectFailure(.featuredSubject) { _ = try world.createCard(in: set, d) }
        d.featured = [999]
        expectFailure(.unknownCharacter(999)) { _ = try world.createCard(in: set, d) }
        d.featured = [other, 998, 999]
        expectFailure(.tooManyFeatured) { _ = try world.createCard(in: set, d) }
        d.featured = [other]
        let id = try world.createCard(in: set, d)
        #expect(world.catalog.card(id)?.featured == [other])
    }

    @Test("A card's own versions follow the version rules, and a tier's excluded versions are filtered (C16)")
    func versionRules() throws {
        var (world, set, mascot) = try Fixture.studio()
        var d = draft(mascot, rarity: 1)
        d.ownVersions = (1...7).map { version($0, "V\($0)") }
        expectFailure(.tooManyVersions) { _ = try world.createCard(in: set, d) }
        d.ownVersions = [version(1, "  ")]
        expectFailure(.emptyVersionName) { _ = try world.createCard(in: set, d) }
        d.ownVersions = [version(1, "Reverse holo")]
        expectFailure(.duplicateVersionName("Reverse holo")) { _ = try world.createCard(in: set, d) }
        d.ownVersions = [version(1, "Base")]
        expectFailure(.duplicateVersionName("Base")) { _ = try world.createCard(in: set, d) }
        d.ownVersions = [version(CardVersion.baseID, "Alt")]
        expectFailure(.duplicateTierID) { _ = try world.createCard(in: set, d) }
        d.ownVersions = [version(1, "Alt"), version(1, "Other")]
        expectFailure(.duplicateTierID) { _ = try world.createCard(in: set, d) }
        d.ownVersions = [version(1, String(repeating: "v", count: CardVersion.nameLimit + 1))]
        expectFailure(.nameTooLong(CardVersion.nameLimit)) { _ = try world.createCard(in: set, d) }

        d.ownVersions = [version(1, " Alt art ")]
        d.excludedVersions = [1, 99]
        let id = try world.createCard(in: set, d)
        let card = try #require(world.catalog.card(id))
        #expect(card.excludedVersions == [1])
        #expect(card.ownVersions.map(\.name) == ["Alt art"])

        var move = CardDraft(from: card)
        move.rarity = 5
        try world.updateCard(id, move)
        #expect(world.catalog.card(id)?.excludedVersions == [])
    }

    @Test("A set holds designed cards up to its size, and the total stays at the size (S3, S8)")
    func setFull() throws {
        var (world, set, mascot) = try Fixture.studio(size: 10)
        for n in 1...10 { try world.createCard(in: set, draft(mascot, name: "Aryla \(n)")) }
        #expect(world.catalog.allCards(in: set).count == 10)
        #expect(world.catalog.fillerCards(in: set).isEmpty)
        expectFailure(.setFull(10)) { _ = try world.createCard(in: set, draft(mascot)) }
        var details = SetDetails(from: try #require(world.catalog.set(set)))
        details.size = 12
        try world.updateSet(set, details)
        try world.createCard(in: set, draft(mascot, name: "Aryla 11"))
        details.size = 10
        expectFailure(.sizeBelowCards(11)) { try world.updateSet(set, details) }
        #expect(world.catalog.set(set)?.size == 12)
        #expect(world.catalog.allCards(in: set).count == 12)
    }

    @Test("Many cards at once: each is its own card, and one bad draft adds none (C18)")
    func createCards() throws {
        var (world, set, mascot) = try Fixture.studio()
        let ids = try world.createCards(in: set, [draft(mascot, rarity: 1), draft(mascot, rarity: 3), draft(mascot, rarity: 6)])
        #expect(ids.count == 3)
        let tiers = ids.compactMap { world.catalog.card($0)?.rarity }
        #expect(tiers == [1, 3, 6])
        let shifts = ids.compactMap { world.catalog.card($0)?.cardShift }
        #expect(shifts[0] != shifts[1])
        #expect(world.catalog.allCards(in: set).count == 10)

        let before = world.catalog
        expectFailure(.unknownTier(99)) { _ = try world.createCards(in: set, [draft(mascot), draft(mascot, rarity: 99)]) }
        expectFailure(.noRarity) { _ = try world.createCards(in: set, []) }
        let tooMany = (1...8).map { draft(mascot, name: "Many \($0)") }
        expectFailure(.setFull(10)) { _ = try world.createCards(in: set, tooMany) }
        #expect(world.catalog == before)
    }

    @Test("A changed card keeps its hidden shift, and a bad change leaves it as it was (C2)")
    func updateCard() throws {
        var (world, set, mascot) = try Fixture.studio()
        let id = try world.createCard(in: set, draft(mascot, rarity: 1))
        let shift = try #require(world.catalog.card(id)).cardShift
        var d = draft(mascot, rarity: 3, name: "Aryla, Rare")
        d.gimmick = true
        try world.updateCard(id, d)
        let card = try #require(world.catalog.card(id))
        #expect(card.name == "Aryla, Rare")
        #expect(card.rarity == 3)
        #expect(card.gimmick)
        #expect(card.cardShift == shift)

        let before = world.catalog
        expectFailure(.unknownTier(99)) { try world.updateCard(id, draft(mascot, rarity: 99)) }
        expectFailure(.unknownCard(999)) { try world.updateCard(999, draft(mascot)) }
        #expect(world.catalog == before)
        let filler = try #require(world.catalog.fillerCards(in: set).first)
        expectFailure(.fillerLocked) { try world.updateCard(filler.id, draft(mascot)) }
    }

    @Test("A change can add more cards, and it checks every draft first (C19)")
    func updateCardAdding() throws {
        var (world, set, mascot) = try Fixture.studio()
        let id = try world.createCard(in: set, draft(mascot, rarity: 1))
        let added = try world.updateCard(id, draft(mascot, rarity: 2), adding: [draft(mascot, rarity: 3), draft(mascot, rarity: 4)])
        #expect(added.count == 2)
        #expect(world.catalog.card(id)?.rarity == 2)
        #expect(world.catalog.cards(in: set).count == 3)
        #expect(world.catalog.allCards(in: set).count == 10)

        let before = world.catalog
        expectFailure(.unknownTier(99)) { _ = try world.updateCard(id, draft(mascot), adding: [draft(mascot, rarity: 99)]) }
        let tooMany = (1...8).map { draft(mascot, name: "More \($0)") }
        expectFailure(.setFull(10)) { _ = try world.updateCard(id, draft(mascot), adding: tooMany) }
        #expect(world.catalog == before)
    }

    @Test("A deleted card goes, its filler place returns, and the game makes no filler delete (S3)")
    func deleteCard() throws {
        var (world, set, mascot) = try Fixture.studio()
        let id = try world.createCard(in: set, draft(mascot))
        try world.deleteCard(id)
        #expect(world.catalog.card(id) == nil)
        #expect(world.catalog.cards(in: set).isEmpty)
        #expect(world.catalog.allCards(in: set).count == 10)
        expectFailure(.unknownCard(id)) { try world.deleteCard(id) }
        let filler = try #require(world.catalog.fillerCards(in: set).first)
        expectFailure(.fillerLocked) { try world.deleteCard(filler.id) }
    }

    @Test("Card appeal is the character's appeal, plus a quarter of each featured one, plus the card shift (R22 to R24)")
    func cardAppeal() throws {
        var (world, set, mascot) = try Fixture.studio()
        let other = try otherCharacter(&world)
        var d = draft(mascot)
        d.featured = [other]
        let id = try world.createCard(in: set, d)
        let card = try #require(world.catalog.card(id))
        let lead = try #require(world.character(mascot))
        let guest = try #require(world.character(other))
        let base = lead.trueAppeal(.kids, fits: world.fits)
        let guestAppeal = guest.trueAppeal(.kids, fits: world.fits)
        let shift = card.cardShift[.kids]
        let raw = base + World.featuredWeight * guestAppeal + shift
        let expected = Character.clampAppeal(raw)
        let appeal = try #require(world.cardAppeal(card, .kids))
        #expect(abs(appeal - expected) < 1e-9)
        #expect(appeal >= 0)

        var lost = card
        lost.characterID = 999
        #expect(world.cardAppeal(lost, .kids) == nil)
    }
}
