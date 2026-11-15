import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

/// A draft set with designed cards at the given tiers.
fileprivate func studio(tiers: [TierID]) throws -> (world: World, set: SetID, cards: [CardID]) {
    var (world, set, mascot) = try Fixture.studio()
    var ids: [CardID] = []
    for (index, tier) in tiers.enumerated() {
        ids.append(try world.createCard(in: set, CardDraft(name: "Card \(index + 1)", characterID: mascot, rarity: tier)))
    }
    return (world, set, ids)
}

fileprivate func subset(_ name: String, _ prefix: String, own: Bool = false) -> Subset {
    Subset(id: 0, name: name, prefix: prefix, ownOutcome: own)
}

@Suite("Subsets and art sets")
struct SubsetTests {
    @Test("A subset needs a name, a prefix of 1 to 3 letters, a free name and prefix, and designed cards of the set (S11)")
    func subsetRules() throws {
        var (world, set, cards) = try studio(tiers: [1, 3])
        let long = String(repeating: "s", count: Subset.nameLimit + 1)
        expectFailure(.unknownSet(999)) { _ = try world.saveSubset(999, subset("A", "AA"), cards: []) }
        expectFailure(.emptyName) { _ = try world.saveSubset(set, subset("  ", "AA"), cards: []) }
        expectFailure(.nameTooLong(Subset.nameLimit)) { _ = try world.saveSubset(set, subset(long, "AA"), cards: []) }
        for prefix in ["", "  ", "ABCD", "T1", "É"] {
            expectFailure(.badSubsetPrefix) { _ = try world.saveSubset(set, subset("Name", prefix), cards: []) }
        }
        let filler = try #require(world.catalog.fillerCards(in: set).first)
        expectFailure(.subsetCard) { _ = try world.saveSubset(set, subset("Name", "NM"), cards: [filler.id]) }
        expectFailure(.subsetCard) { _ = try world.saveSubset(set, subset("Name", "NM"), cards: [999]) }
        let other = try world.createSet(.main, SetDetails(name: "Other", code: "OTH", size: 10), presetID: 1)
        let mascot = world.characters[0].id
        let foreign = try world.createCard(in: other, CardDraft(name: "Far", characterID: mascot, rarity: 1))
        expectFailure(.subsetCard) { _ = try world.saveSubset(set, subset("Name", "NM"), cards: [foreign]) }
        #expect(world.catalog.set(set)?.subsets.isEmpty == true)

        try world.saveSubset(set, subset("Gallery", "TG"), cards: [cards[0]])
        expectFailure(.duplicateSubset("gallery")) { _ = try world.saveSubset(set, subset("gallery", "XX"), cards: []) }
        expectFailure(.duplicateSubset("TG")) { _ = try world.saveSubset(set, subset("Other", "tg"), cards: []) }
        try world.saveSubset(set, subset("Two", "TW"), cards: [])
        try world.saveSubset(set, subset("Three", "TH"), cards: [])
        #expect(Subset.limit == 3)
        expectFailure(.tooManySubsets) { _ = try world.saveSubset(set, subset("Four", "FO"), cards: []) }
        let again = try #require(world.catalog.set(set)).subsets[0]
        try world.saveSubset(set, again, cards: [])
        #expect(world.catalog.set(set)?.subsets.count == 3)
    }

    @Test("A subset keeps its cards, a card leaves its old subset, and a deleted subset returns its cards (S11, S14)")
    func subsetCards() throws {
        var (world, set, cards) = try studio(tiers: [1, 3, 7])
        let gallery = try world.saveSubset(set, subset("Gallery", " tg "), cards: [cards[1], cards[2]])
        let saved = try #require(world.catalog.set(set)).subsets[0]
        #expect(saved.prefix == "TG")
        #expect(world.catalog.card(cards[1])?.subsetID == gallery)
        #expect(world.catalog.card(cards[2])?.subsetID == gallery)
        #expect(world.catalog.card(cards[0])?.subsetID == nil)

        let promos = try world.saveSubset(set, subset("Promos", "PR"), cards: [cards[2]])
        #expect(promos != gallery)
        #expect(world.catalog.card(cards[2])?.subsetID == promos)
        #expect(world.catalog.card(cards[1])?.subsetID == gallery)

        let edited = Subset(id: gallery, name: "Gallery 2", prefix: "ga", ownOutcome: true)
        let same = try world.saveSubset(set, edited, cards: [cards[0]])
        #expect(same == gallery)
        let list = try #require(world.catalog.set(set)).subsets
        #expect(list.count == 2)
        #expect(list.first { $0.id == gallery }?.name == "Gallery 2")
        #expect(list.first { $0.id == gallery }?.prefix == "GA")
        #expect(list.first { $0.id == gallery }?.ownOutcome == true)
        #expect(world.catalog.card(cards[0])?.subsetID == gallery)
        #expect(world.catalog.card(cards[1])?.subsetID == nil)

        try world.deleteSubset(set, gallery)
        #expect(world.catalog.card(cards[0])?.subsetID == nil)
        #expect(world.catalog.set(set)?.subsets.map(\.id) == [promos])
        expectFailure(.unknownSubset(gallery)) { try world.deleteSubset(set, gallery) }
        expectFailure(.unknownSet(999)) { try world.deleteSubset(999, 1) }
    }

    @Test("An art set joins 2 to 5 designed cards in order, and a card is in one art set only (S10)")
    func artSetRules() throws {
        var (world, set, cards) = try studio(tiers: [1, 2, 3, 4])
        let filler = try #require(world.catalog.fillerCards(in: set).first)
        expectFailure(.unknownSet(999)) { _ = try world.saveArtSet(999, ArtSet(id: 0, name: "A", cards: cards)) }
        expectFailure(.emptyName) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: " ", cards: cards)) }
        expectFailure(.artSetSize) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: "A", cards: [])) }
        expectFailure(.artSetSize) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: "A", cards: [cards[0]])) }
        expectFailure(.artSetSize) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: "A", cards: [cards[0], cards[0]])) }
        expectFailure(.artSetSize) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: "A", cards: Array(1...6))) }
        expectFailure(.artSetCard) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: "A", cards: [cards[0], 999])) }
        expectFailure(.artSetCard) { _ = try world.saveArtSet(set, ArtSet(id: 0, name: "A", cards: [cards[0], filler.id])) }
        #expect(world.catalog.set(set)?.artSets.isEmpty == true)

        let id = try world.saveArtSet(set, ArtSet(id: 0, name: "  Trio  ", cards: [cards[2], cards[0]]))
        let saved = try #require(world.catalog.set(set)).artSets[0]
        #expect(saved.name == "Trio")
        #expect(saved.cards == [cards[2], cards[0]])
        #expect(saved.id == id)

        expectFailure(.cardInTwoArtSets("Card 1")) {
            _ = try world.saveArtSet(set, ArtSet(id: 0, name: "Other", cards: [cards[0], cards[1]]))
        }
        let again = try world.saveArtSet(set, ArtSet(id: id, name: "Renamed", cards: [cards[0], cards[1], cards[2]]))
        #expect(again == id)
        let list = try #require(world.catalog.set(set)).artSets
        #expect(list.count == 1)
        #expect(list[0].name == "Renamed")
        #expect(list[0].cards.count == 3)
    }

    @Test("An art set loses a deleted card, and it ends when fewer than 2 cards stay (S10)")
    func artSetCleanup() throws {
        var (world, set, cards) = try studio(tiers: [1, 2, 3, 4, 5])
        let trio = try world.saveArtSet(set, ArtSet(id: 0, name: "Trio", cards: [cards[0], cards[1], cards[2]]))
        let pair = try world.saveArtSet(set, ArtSet(id: 0, name: "Pair", cards: [cards[3], cards[4]]))
        #expect(trio != pair)
        try world.deleteCard(cards[0])
        let afterTrio = try #require(world.catalog.set(set)).artSets
        #expect(afterTrio.map(\.id) == [trio, pair])
        #expect(afterTrio[0].cards == [cards[1], cards[2]])
        try world.deleteCard(cards[3])
        let afterPair = try #require(world.catalog.set(set)).artSets
        #expect(afterPair.map(\.id) == [trio])
        try world.deleteArtSet(set, trio)
        #expect(world.catalog.set(set)?.artSets.isEmpty == true)
        expectFailure(.unknownSet(999)) { try world.deleteArtSet(999, 1) }
    }

    @Test("Part IDs are unique across the subsets and art sets of a set (S10, S11)")
    func partIDs() throws {
        var (world, set, cards) = try studio(tiers: [1, 2, 3])
        let art = try world.saveArtSet(set, ArtSet(id: 0, name: "Pair", cards: [cards[0], cards[1]]))
        let sub = try world.saveSubset(set, subset("Gallery", "TG"), cards: [cards[2]])
        #expect(art != sub)
        let state = try #require(world.catalog.set(set))
        #expect(state.nextPartID == max(art, sub) + 1)
    }

    @Test("A secret card numbers above the printed total, and a subset numbers on its own (S11)")
    func cardNumbers() throws {
        var (world, set, cards) = try studio(tiers: [1, 3, 7])
        let numbers = world.catalog.cardNumbers(in: set)
        #expect(numbers.count == 10)
        #expect(Set(numbers.values).count == 10)
        #expect(numbers[cards[2]] == "010/009")
        let main = cards.prefix(2).compactMap { numbers[$0] }
        #expect(main.count == 2)
        for number in main {
            let parts = number.split(separator: "/")
            let place = Int(parts[0]) ?? 0
            #expect(parts[1] == "009")
            #expect(place >= 1)
            #expect(place <= 9)
        }
        let low = try #require(numbers[cards[0]])
        let high = try #require(numbers[cards[1]])
        #expect(low < high)
        #expect(world.catalog.cardNumbers(in: 999).isEmpty)

        try world.saveSubset(set, subset("Gallery", "TG"), cards: [cards[1], cards[2]])
        let split = world.catalog.cardNumbers(in: set)
        #expect(split[cards[1]] == "TG01/TG02")
        #expect(split[cards[2]] == "TG02/TG02")
        #expect(split.count == 10)
        let rest = split.filter { $0.key != cards[1] && $0.key != cards[2] }
        #expect(rest.count == 8)
        #expect(rest.values.allSatisfy { $0.hasSuffix("/008") })
        #expect(Set(rest.values).count == 8)
    }
}
