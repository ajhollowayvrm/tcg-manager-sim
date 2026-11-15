import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

fileprivate func shared(_ shares: [Int]) -> RarityLadder {
    let tiers = shares.enumerated().map { index, share in
        RarityTier(id: index + 1, name: "T\(index + 1)", code: "T", symbol: .circle, color: .slate, fillerShare: share)
    }
    return RarityLadder(id: 5, name: "Test", tiers: tiers)
}

fileprivate func fillerNames(_ world: World, _ set: SetID) -> [String] {
    world.catalog.fillerCards(in: set).map(\.name)
}

@Suite("Filler")
struct FillerTests {
    @Test("Filler targets add up to the count, by the largest remainder, and a tie goes to the more common tier (S4)")
    func fillerTargets() {
        let ladder = RarityLadder.defaultLadder(id: 1)
        for count in [1, 2, 7, 10, 33, 99, 150, 400] {
            let targets = World.fillerTargets(count: count, ladder: ladder)
            let total = targets.values.reduce(0, +)
            #expect(total == count)
            for tier in ladder.tiers where tier.fillerShare == 0 { #expect(targets[tier.id] == nil) }
            for tier in ladder.tiers where tier.fillerShare > 0 {
                let exact = Double(count) * Double(tier.fillerShare) / 100
                let got = Double(targets[tier.id] ?? 0)
                #expect(abs(got - exact) < 1)
            }
        }
        #expect(World.fillerTargets(count: 10, ladder: ladder) == [1: 5, 2: 3, 3: 2])
        #expect(World.fillerTargets(count: 150, ladder: ladder) == [1: 75, 2: 50, 3: 25])
        #expect(World.fillerTargets(count: 0, ladder: ladder).isEmpty)
        #expect(World.fillerTargets(count: 5, ladder: shared([0, 0, 0])).isEmpty)
        #expect(World.fillerTargets(count: 1, ladder: shared([50, 50])) == [1: 1, 2: 0])
        #expect(World.fillerTargets(count: 3, ladder: shared([0, 100, 0])) == [2: 3])
    }

    @Test("The designed and filler cards always add up to the set size, and a kept filler card stays (S3, S4)")
    func fillerCount() throws {
        var (world, id, mascot) = try Fixture.studio(size: 20)
        #expect(world.catalog.fillerCards(in: id).count == 20)
        let before = Set(world.catalog.fillerCards(in: id).map(\.id))
        for n in 1...3 { try world.createCard(in: id, CardDraft(name: "Aryla \(n)", characterID: mascot, rarity: 3)) }
        let after = world.catalog.fillerCards(in: id)
        #expect(after.count == 17)
        #expect(Set(after.map(\.id)).isSubset(of: before))
        #expect(world.catalog.allCards(in: id).count == 20)

        var d = SetDetails(from: try #require(world.catalog.set(id)))
        d.size = 40
        try world.updateSet(id, d)
        let grown = world.catalog.fillerCards(in: id)
        #expect(grown.count == 37)
        #expect(Set(after.map(\.id)).isSubset(of: Set(grown.map(\.id))))
        let targets = World.fillerTargets(count: 37, ladder: try #require(world.catalog.set(id)).ladder)
        for (tier, count) in targets { #expect(grown.filter { $0.rarity == tier }.count == count) }
    }

    @Test("A filler card is flagged, has a hidden shift, and stays out of the secret tiers (S4, R24)")
    func fillerCards() throws {
        let (world, id, _) = try Fixture.studio(size: 30)
        let filler = world.catalog.fillerCards(in: id)
        let ladder = try #require(world.catalog.set(id)).ladder
        #expect(filler.allSatisfy { $0.filler })
        #expect(world.catalog.cards(in: id).isEmpty)
        #expect(filler.allSatisfy { ladder.tier($0.rarity)?.secret == false })
        #expect(filler.allSatisfy { $0.cardShift[.resellers] == 0 })
        #expect(filler.allSatisfy { $0.formID == nil && $0.featured.isEmpty && !$0.gimmick })
        let known = filler.allSatisfy { world.character($0.characterID) != nil }
        #expect(known)
        let named = filler.allSatisfy { card in world.character(card.characterID)?.name == card.name }
        #expect(named)
    }

    @Test("A reroll makes all filler cards and generated characters again, in a draft set only (S5)")
    func reroll() throws {
        var (world, id, _) = try Fixture.studio()
        let cards = Set(world.catalog.fillerCards(in: id).map(\.id))
        let people = Set(try #require(world.catalog.set(id)).generated.map(\.id))
        try world.rerollFiller(id)
        let again = world.catalog.fillerCards(in: id)
        #expect(again.count == cards.count)
        #expect(Set(again.map(\.id)).isDisjoint(with: cards))
        let newPeople = Set(try #require(world.catalog.set(id)).generated.map(\.id))
        #expect(newPeople.isDisjoint(with: people))
        expectFailure(.unknownSet(999)) { try world.rerollFiller(999) }

        var (locked, lockedID, _) = try Fixture.scheduled()
        let lockedCards = locked.catalog.fillerCards(in: lockedID).map(\.id)
        expectFailure(.setLocked) { try locked.rerollFiller(lockedID) }
        #expect(locked.catalog.fillerCards(in: lockedID).map(\.id) == lockedCards)
    }

    @Test("A main set makes 10 to 20 generated characters, and each has a filler card (R13)")
    func generatedCharacters() throws {
        let (world, id, _) = try Fixture.studio(size: 150)
        let set = try #require(world.catalog.set(id))
        #expect(SetType.main.generatedRange.contains(set.generated.count))
        let used = Set(world.catalog.fillerCards(in: id).map(\.characterID))
        for person in set.generated { #expect(used.contains(person.id)) }
        #expect(set.generated.allSatisfy { $0.origin == .generated })
        let rosterIDs = Set(world.characters.map(\.id))
        #expect(set.generated.allSatisfy { !rosterIDs.contains($0.id) })
        let names = set.generated.map { $0.name.lowercased() }
        #expect(Set(names).count == names.count)
        let rosterNames = Set(world.characters.map { $0.name.lowercased() })
        #expect(Set(names).isDisjoint(with: rosterNames))

        let small = try Fixture.studio(size: 10)
        let count = small.world.catalog.fillerCards(in: small.set).count
        let generated = try #require(small.world.catalog.set(small.set)).generated.count
        #expect(generated <= count)
        #expect(generated >= 1)
    }

    @Test("A set with no roster still gets filler from new generated characters (R6)")
    func emptyRoster() throws {
        var world = World(seed: 5, studioName: "Test")
        let id = try world.createSet(.main, SetDetails(name: "Alone", code: "ALN", size: 10), presetID: 1)
        let filler = world.catalog.fillerCards(in: id)
        let set = try #require(world.catalog.set(id))
        #expect(filler.count == 10)
        #expect(world.characters.isEmpty)
        #expect(!set.generated.isEmpty)
        let ids = Set(set.generated.map(\.id))
        #expect(filler.allSatisfy { ids.contains($0.characterID) })
    }

    @Test("The same seed makes the same filler (RNG streams)")
    func fillerIsSeeded() throws {
        let a = try Fixture.studio(seed: 77, size: 20)
        let b = try Fixture.studio(seed: 77, size: 20)
        let c = try Fixture.studio(seed: 78, size: 20)
        #expect(fillerNames(a.world, a.set) == fillerNames(b.world, b.set))
        #expect(fillerNames(a.world, a.set) != fillerNames(c.world, c.set))
        let tiersA = a.world.catalog.fillerCards(in: a.set).map(\.rarity)
        let tiersB = b.world.catalog.fillerCards(in: b.set).map(\.rarity)
        #expect(tiersA == tiersB)
    }
}
