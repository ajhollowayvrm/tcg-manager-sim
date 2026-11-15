import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

fileprivate func details(_ name: String, _ code: String, size: Int = 10) -> SetDetails {
    SetDetails(name: name, code: code, size: size)
}

@Suite("Sets")
struct SetTests {
    @Test("A new set is a draft with its own ladder and pack copy, the current era, and a full card list (C10, S3, S6, S7)")
    func createSet() throws {
        let (world, id, mascot) = try Fixture.studio()
        let set = try #require(world.catalog.set(id))
        let preset = try #require(world.catalog.preset(Catalog.defaultLadderID))
        let pack = try #require(world.catalog.packPreset(Catalog.defaultPackID))
        #expect(set.status == .draft)
        #expect(set.type == .main)
        #expect(set.code == "BAS")
        #expect(set.ladder.tiers == preset.tiers)
        #expect(set.pack.slots == pack.slots)
        #expect(set.eraID == world.catalog.currentEra.id)
        #expect(set.createdWeek == 0)
        #expect(set.pairID == nil)
        #expect(set.headliner?.characterID == mascot)
        #expect(set.release == nil)
        #expect(world.catalog.allCards(in: id).count == 10)
        #expect(set.fillerCount(designed: 4) == 6)
        #expect(set.fillerCount(designed: 40) == 0)
    }

    @Test("A set must pass the name, code, theme, size, and headliner rules (S3, S8)")
    func setDetailsErrors() throws {
        var (world, _, mascot) = try Fixture.studio()
        let long = String(repeating: "n", count: CardSet.nameLimit + 1)
        let ladder = Catalog.defaultLadderID
        func make(_ d: SetDetails) throws(CardError) { _ = try world.createSet(.main, d, presetID: ladder) }
        expectFailure(.parallelNeedsPair) { _ = try world.createSet(.parallel, details("P", "PPP"), presetID: ladder) }
        expectFailure(.unknownPreset(99)) { _ = try world.createSet(.main, details("N", "NNN"), presetID: 99) }
        expectFailure(.unknownPack(99)) { _ = try world.createSet(.main, details("N", "NNN"), presetID: ladder, packID: 99) }
        expectFailure(.emptyName) { try make(details("  ", "NNN")) }
        expectFailure(.nameTooLong(CardSet.nameLimit)) { try make(details(long, "NNN")) }
        expectFailure(.duplicateSetName("base")) { try make(details("base", "NNN")) }
        expectFailure(.badSetCode) { try make(details("N", "N")) }
        expectFailure(.badSetCode) { try make(details("N", "NNNNN")) }
        expectFailure(.badSetCode) { try make(details("N", "N1N")) }
        expectFailure(.badSetCode) { try make(details("N", "ÄBC")) }
        expectFailure(.duplicateSetCode("BAS")) { try make(details("N", "bas")) }
        var themed = details("N", "NNN")
        themed.theme = "nope"
        expectFailure(.unknownTheme("nope")) { try make(themed) }
        expectFailure(.badSetSize) { try make(details("N", "NNN", size: 9)) }
        expectFailure(.badSetSize) { try make(details("N", "NNN", size: 401)) }
        var lost = details("N", "NNN")
        lost.headliner = Headliner(characterID: 999)
        expectFailure(.unknownCharacter(999)) { try make(lost) }
        lost.headliner = Headliner(characterID: mascot, formID: 999)
        expectFailure(.unknownForm(999)) { try make(lost) }
        #expect(world.catalog.sets.count == 1)
        let spaced = try world.createSet(.main, details("  Spaced  ", " nnn "), presetID: ladder)
        #expect(world.catalog.set(spaced)?.name == "Spaced")
        #expect(world.catalog.set(spaced)?.code == "NNN")
    }

    @Test("A suggested code has 2 to 4 letters, is free, and never uses a random number (S1)")
    func suggestedCode() throws {
        #expect(CardSet.suggestCode(for: "Storm Rising", taken: []) == "SRI")
        let names = ["Storm Rising", "Base", "A", "123", "Sword and Shield", "Ünï Cödé"]
        for name in names {
            let first = CardSet.suggestCode(for: name, taken: [])
            let second = CardSet.suggestCode(for: name, taken: [first])
            #expect(CardSet.codeRange.contains(first.count))
            #expect(CardSet.codeRange.contains(second.count))
            #expect(second != first)
            #expect(second.allSatisfy { $0.isASCII && $0.isUppercase })
        }
        var (world, _, _) = try Fixture.studio()
        let id = try world.createSet(name: "Storm Rising", theme: "fire", presetID: Catalog.defaultLadderID)
        #expect(world.catalog.set(id)?.code == "SRI")
        #expect(world.catalog.set(id)?.theme == "fire")
        let next = world.catalog.suggestedCode(for: "Storm Rising")
        #expect(next != "SRI")
    }

    @Test("A draft set changes its details, and the filler follows the size (S3)")
    func updateSet() throws {
        var (world, id, _) = try Fixture.studio()
        let other = try world.createSet(.main, details("Other", "OTH"), presetID: Catalog.defaultLadderID)
        var d = try #require(world.catalog.set(id)).details
        d.name = "Base"
        d.code = "bas"
        d.size = 30
        d.symbol = SetSymbol(shape: .moon, color: .teal)
        try world.updateSet(id, d)
        let set = try #require(world.catalog.set(id))
        #expect(set.size == 30)
        #expect(set.code == "BAS")
        #expect(set.symbol.shape == .moon)
        #expect(world.catalog.allCards(in: id).count == 30)
        d.size = 12
        try world.updateSet(id, d)
        #expect(world.catalog.allCards(in: id).count == 12)

        d.name = "OTHER"
        expectFailure(.duplicateSetName("OTHER")) { try world.updateSet(id, d) }
        d.name = "Base"
        d.code = "OTH"
        expectFailure(.duplicateSetCode("OTH")) { try world.updateSet(id, d) }
        expectFailure(.unknownSet(999)) { try world.updateSet(999, d) }
        try world.updateSet(other, name: "Renamed", theme: "water")
        #expect(world.catalog.set(other)?.name == "Renamed")
        #expect(world.catalog.set(other)?.theme == "water")
        expectFailure(.unknownSet(999)) { try world.updateSet(999, name: "X", theme: nil) }
    }

    @Test("A main set becomes a special set and back, and a parallel set stays parallel (E9, S9)")
    func updateSetType() throws {
        var (world, id, _) = try Fixture.studio()
        try world.updateSetType(id, .mini)
        #expect(world.catalog.set(id)?.type == .mini)
        try world.updateSetType(id, .main)
        #expect(world.catalog.set(id)?.type == .main)
        expectFailure(.parallelTypeFixed) { try world.updateSetType(id, .parallel) }
        expectFailure(.unknownSet(999)) { try world.updateSetType(999, .mini) }
        let (a, _) = try world.createParallelPair(details("Left", "LFT"), details("Right", "RGT"),
                                                  presetID: Catalog.defaultLadderID)
        expectFailure(.parallelTypeFixed) { try world.updateSetType(a, .main) }
        try world.updateSetType(a, .parallel)
        #expect(world.catalog.set(a)?.type == .parallel)
    }

    @Test("A parallel pair makes two linked sets, and a bad half adds none (D2, S9)")
    func parallelPair() throws {
        var (world, _, _) = try Fixture.studio()
        let ladder = Catalog.defaultLadderID
        let (a, b) = try world.createParallelPair(details("Left", "LFT"), details("Right", "RGT"), presetID: ladder)
        let left = try #require(world.catalog.set(a))
        let right = try #require(world.catalog.set(b))
        #expect(left.type == .parallel)
        #expect(right.type == .parallel)
        #expect(left.pairID == b)
        #expect(right.pairID == a)
        #expect(world.catalog.pair(of: a)?.id == b)
        #expect(world.catalog.pair(of: b)?.id == a)
        #expect(left.ladder.tiers == right.ladder.tiers)
        #expect(world.catalog.allCards(in: a).count == 10)
        #expect(world.catalog.allCards(in: b).count == 10)

        let before = world.catalog
        expectFailure(.duplicateSetName("Left")) { _ = try world.createParallelPair(details("Up", "UPP"), details("Left", "XXX"), presetID: ladder) }
        expectFailure(.duplicateSetName("down")) { _ = try world.createParallelPair(details("Down", "DWN"), details("down", "DDD"), presetID: ladder) }
        expectFailure(.duplicateSetCode("SAM")) { _ = try world.createParallelPair(details("One", "SAM"), details("Two", "sam"), presetID: ladder) }
        expectFailure(.badSetSize) { _ = try world.createParallelPair(details("One", "ONE"), details("Two", "TWO", size: 5), presetID: ladder) }
        expectFailure(.unknownPreset(99)) { _ = try world.createParallelPair(details("One", "ONE"), details("Two", "TWO"), presetID: 99) }
        #expect(world.catalog == before)
    }

    @Test("A deleted draft set takes its cards and generated characters, and its partner becomes a main set (S16)")
    func deleteSet() throws {
        var (world, id, mascot) = try Fixture.studio()
        try world.createCard(in: id, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 1))
        let generated = try #require(world.catalog.set(id)).generated.map(\.id)
        #expect(!generated.isEmpty)
        try world.deleteSet(id)
        #expect(world.catalog.set(id) == nil)
        #expect(world.catalog.cards.isEmpty)
        for gone in generated { #expect(world.character(gone) == nil) }
        expectFailure(.unknownSet(id)) { try world.deleteSet(id) }

        let (a, b) = try world.createParallelPair(details("Left", "LFT"), details("Right", "RGT"),
                                                  presetID: Catalog.defaultLadderID)
        try world.deleteSet(a)
        let partner = try #require(world.catalog.set(b))
        #expect(partner.type == .main)
        #expect(partner.pairID == nil)
        #expect(world.catalog.allCards(in: b).count == 10)
    }

    @Test("A scheduled or released set cannot change (B2)")
    func lockedSet() throws {
        var (world, id, mascot) = try Fixture.scheduled()
        let card = try #require(world.catalog.cards(in: id).first)
        let ladder = try #require(world.catalog.set(id)).ladder
        let pack = try #require(world.catalog.set(id)).pack
        let d = try #require(world.catalog.set(id)).details
        let draft = CardDraft(name: "Late", characterID: mascot, rarity: 1)
        let subset = Subset(id: 0, name: "Gallery", prefix: "GA")
        let art = ArtSet(id: 0, name: "Art", cards: [card.id, card.id + 1])
        #expect(world.catalog.set(id)?.status == .scheduled)
        expectFailure(.setLocked) { _ = try world.createCard(in: id, draft) }
        expectFailure(.setLocked) { try world.updateCard(card.id, draft) }
        expectFailure(.setLocked) { try world.deleteCard(card.id) }
        expectFailure(.setLocked) { try world.updateSet(id, d) }
        expectFailure(.setLocked) { try world.updateSetType(id, .mini) }
        expectFailure(.setLocked) { try world.updateSetLadder(id, ladder) }
        expectFailure(.setLocked) { try world.updateSetPack(id, pack) }
        expectFailure(.setLocked) { try world.rerollFiller(id) }
        expectFailure(.setLocked) { try world.deleteSet(id) }
        expectFailure(.setLocked) { _ = try world.saveSubset(id, subset, cards: []) }
        expectFailure(.setLocked) { try world.deleteSubset(id, 1) }
        expectFailure(.setLocked) { _ = try world.saveArtSet(id, art) }
        expectFailure(.setLocked) { try world.deleteArtSet(id, 1) }
        expectFailure(.setLocked) { try world.scheduleRelease(id, boxes: 1, packPrice: 4, releaseWeek: 9) }

        var (released, releasedID, _) = try Fixture.released()
        #expect(released.catalog.set(releasedID)?.status == .released)
        let releasedDetails = try #require(released.catalog.set(releasedID)).details
        expectFailure(.setLocked) { try released.updateSet(releasedID, releasedDetails) }
    }

    @Test("The theme library has a stable id for each theme, one element theme for each type, and seeded fits (C13)")
    func themeLibrary() throws {
        let themes = SetTheme.library(seed: 7)
        #expect(Set(themes.map(\.id)).count == themes.count)
        let elementThemes = themes.filter { $0.group == .elements }
        #expect(elementThemes.compactMap(\.element).count == ElementType.allCases.count)
        #expect(Set(elementThemes.compactMap(\.element)).count == ElementType.allCases.count)
        #expect(themes.filter { $0.group != .elements }.allSatisfy { $0.element == nil })
        #expect(Set(themes.map(\.group)) == Set(SetTheme.Group.allCases))
        #expect(SetTheme.library(seed: 7) == themes)
        #expect(SetTheme.library(seed: 8) != themes)
        #expect(themes[0].fit[.resellers] == 0)
        let (world, _, _) = try Fixture.studio()
        #expect(world.catalog.theme("feudalism")?.group == .history)
        #expect(world.catalog.theme("nope") == nil)
        #expect(world.catalog.themes.count == themes.count)
    }

    @Test("The headliner needs a designed card, and the set screen warns until it has one (R7, R18)")
    func headlinerCard() throws {
        var (world, id, mascot) = try Fixture.studio()
        #expect(world.catalog.headlinerHasCard(id) == false)
        try world.createCard(in: id, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 1))
        #expect(world.catalog.headlinerHasCard(id))
        let none = try world.createSet(.main, details("None", "NON"), presetID: Catalog.defaultLadderID)
        #expect(world.catalog.set(none)?.headliner == nil)
        #expect(world.catalog.headlinerHasCard(none))
        #expect(world.catalog.headlinerHasCard(999))
    }
}

extension CardSet {
    fileprivate var details: SetDetails { SetDetails(from: self) }
}
