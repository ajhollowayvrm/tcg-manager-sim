import Foundation
import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

fileprivate func slot(_ id: Int, count: Int = 1, _ outcomes: [(PackOutcomeKind, Double)]) -> PackSlot {
    let list = outcomes.enumerated().map { PackOutcome(id: $0.offset + 1, kind: $0.element.0, odds: $0.element.1) }
    return PackSlot(id: id, count: count, outcomes: list)
}

fileprivate func pack(_ slots: [PackSlot]) -> PackLayout {
    PackLayout(id: 9, name: "Test", ladderID: Catalog.defaultLadderID, slots: slots)
}

fileprivate func editPack(_ world: inout World, _ set: SetID, _ body: (inout PackLayout) -> Void) {
    guard let i = world.catalog.sets.firstIndex(where: { $0.id == set }) else { return }
    body(&world.catalog.sets[i].pack)
}

fileprivate func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-9 }

@Suite("Packs")
struct PackTests {
    @Test("The default pack has 10 cards, slots that add up to 100%, and tiers of the default ladder (S2, S6)")
    func defaultPack() throws {
        let (world, _, _) = try Fixture.studio()
        let layout = PackLayout.defaultPack(id: Catalog.defaultPackID)
        let ladder = RarityLadder.defaultLadder(id: 1)
        #expect(layout.cardCount == 10)
        #expect(layout.boxSize == 36)
        #expect(layout.nextSlotID == 6)
        #expect(layout.slots[3].nextOutcomeID == 5)
        for slot in layout.slots { #expect(close(slot.oddsSum, 100)) }
        let tiers = layout.slots.flatMap(\.outcomes).compactMap(\.kind.tierID)
        #expect(tiers.allSatisfy { ladder.tier($0) != nil })
        let valid = try world.validPack(layout)
        #expect(valid == layout)
        #expect(layout.label(.tier(8), ladder: ladder) == "Special Illustration Rare")
        #expect(layout.label(.tier(99), ladder: ladder) == "Pick a tier")
        #expect(layout.label(.version("Reverse holo"), ladder: ladder) == "Reverse holo")
        #expect(layout.label(.subset(5), ladder: ladder) == "A removed subset")
    }

    @Test("A pack needs 1 to 20 cards, a box of 1 to 100, and slots with odds that add up to 100% (S2)")
    func packRules() throws {
        let (world, _, _) = try Fixture.studio()
        var layout = PackLayout.defaultPack(id: 9)
        layout.slots = []
        expectFailure(.packCardCount) { _ = try world.validPack(layout) }
        layout.slots = (1...21).map { slot($0, [(.tier(1), 100)]) }
        expectFailure(.packCardCount) { _ = try world.validPack(layout) }
        layout.slots = (1...20).map { slot($0, [(.tier(1), 100)]) }
        _ = try world.validPack(layout)
        layout.slots = [slot(1, count: 0, [(.tier(1), 100)])]
        expectFailure(.packCardCount) { _ = try world.validPack(layout) }

        layout = PackLayout.defaultPack(id: 9)
        layout.boxSize = 0
        expectFailure(.badBoxSize) { _ = try world.validPack(layout) }
        layout.boxSize = 101
        expectFailure(.badBoxSize) { _ = try world.validPack(layout) }

        layout.boxSize = 36
        layout.slots[1].outcomes = []
        expectFailure(.emptySlot(2)) { _ = try world.validPack(layout) }
        layout = PackLayout.defaultPack(id: 9)
        layout.slots[4].outcomes[0].odds = 101
        expectFailure(.badOdds(5)) { _ = try world.validPack(layout) }
        layout.slots[4].outcomes[0].odds = -1
        expectFailure(.badOdds(5)) { _ = try world.validPack(layout) }
        layout = PackLayout.defaultPack(id: 9)
        layout.slots[4].outcomes[1].kind = .tier(3)
        expectFailure(.duplicateOutcome(5)) { _ = try world.validPack(layout) }
        layout = PackLayout.defaultPack(id: 9)
        layout.slots[4].outcomes[3].odds = 6
        expectFailure(.slotOddsSum(slot: 5, sum: 99)) { _ = try world.validPack(layout) }
        layout = pack([slot(1, [(.tier(1), 33.33), (.tier(2), 33.33), (.tier(3), 33.34)])])
        _ = try world.validPack(layout)
    }

    @Test("A pack preset is a copy that the player edits, and the default pack never changes (S6)")
    func presetLifecycle() throws {
        var (world, _, _) = try Fixture.studio()
        let id = try world.createPackPreset(copying: Catalog.defaultPackID, name: "  Mine  ")
        let copy = try #require(world.catalog.packPreset(id))
        let source = try #require(world.catalog.packPreset(Catalog.defaultPackID))
        #expect(copy.name == "Mine")
        #expect(copy.slots == source.slots)
        #expect(copy.boxSize == source.boxSize)
        #expect(id != Catalog.defaultPackID)
        expectFailure(.duplicatePackName("MINE")) { _ = try world.createPackPreset(copying: 1, name: "MINE") }
        expectFailure(.emptyName) { _ = try world.createPackPreset(copying: 1, name: " ") }
        expectFailure(.unknownPack(99)) { _ = try world.createPackPreset(copying: 99, name: "X") }
        let long = String(repeating: "p", count: PackLayout.nameLimit + 1)
        expectFailure(.nameTooLong(PackLayout.nameLimit)) { _ = try world.createPackPreset(copying: 1, name: long) }

        var changed = copy
        changed.name = "Mine, two"
        changed.boxSize = 24
        try world.updatePackPreset(changed)
        #expect(world.catalog.packPreset(id)?.boxSize == 24)
        #expect(world.catalog.packPreset(id)?.name == "Mine, two")
        var broken = changed
        broken.slots[0].outcomes[0].odds = 50
        expectFailure(.slotOddsSum(slot: 1, sum: 50)) { try world.updatePackPreset(broken) }
        var lost = changed
        lost.ladderID = 99
        expectFailure(.unknownPreset(99)) { try world.updatePackPreset(lost) }
        #expect(world.catalog.packPreset(id)?.boxSize == 24)
        expectFailure(.unknownPack(99)) { try world.updatePackPreset(pack([slot(1, [(.tier(1), 100)])]).with(id: 99)) }
        expectFailure(.defaultPackLocked) { try world.updatePackPreset(source) }
        expectFailure(.defaultPackLocked) { try world.deletePackPreset(Catalog.defaultPackID) }
        expectFailure(.unknownPack(99)) { try world.deletePackPreset(99) }
    }

    @Test("A deleted pack preset sends its eras to the default pack, and a set keeps its own copy (S6, C10)")
    func presetDelete() throws {
        var (world, set, _) = try Fixture.studio()
        let id = try world.createPackPreset(copying: Catalog.defaultPackID, name: "Mine")
        let era = try world.startEra(EraDraft(name: "New", code: "NW", packPresetID: id))
        let own = try world.createSet(.main, SetDetails(name: "Own", code: "OWN", size: 10), presetID: 1, packID: id)
        var changed = try #require(world.catalog.packPreset(id))
        changed.boxSize = 12
        try world.updatePackPreset(changed)
        #expect(world.catalog.set(own)?.pack.boxSize == 36)
        try world.deletePackPreset(id)
        #expect(world.catalog.packPreset(id) == nil)
        #expect(world.catalog.era(era)?.packPresetID == Catalog.defaultPackID)
        #expect(world.catalog.set(own)?.pack.slots.count == 5)
        #expect(world.catalog.set(set)?.pack.boxSize == 36)
    }

    @Test("A set's pack changes in place, keeps its id and name, and must be valid (S6)")
    func updateSetPack() throws {
        var (world, set, _) = try Fixture.studio()
        var layout = try #require(world.catalog.set(set)).pack
        layout.boxSize = 20
        layout.name = "Ignored"
        layout.slots.removeLast()
        try world.updateSetPack(set, layout)
        let saved = try #require(world.catalog.set(set)).pack
        #expect(saved.boxSize == 20)
        #expect(saved.slots.count == 4)
        #expect(saved.name == "Modern 10-card pack")
        #expect(saved.id == Catalog.defaultPackID)
        layout.boxSize = 0
        expectFailure(.badBoxSize) { try world.updateSetPack(set, layout) }
        expectFailure(.unknownSet(999)) { try world.updateSetPack(999, layout) }
        #expect(world.catalog.set(set)?.pack.boxSize == 20)
    }

    @Test("A moved slider rebalances the others by their ratio, and the slot stays at 100% (S15)")
    func setOdds() {
        let start = slot(1, [(.tier(1), 50), (.tier(2), 30), (.tier(3), 20)])
        for value in [0.0, 10, 33.33, 57.77, 99.99, 100] {
            for index in 0..<3 {
                var moved = start
                moved.setOdds(value, at: index)
                #expect(abs(moved.oddsSum - 100) < 0.001)
                #expect(abs(moved.outcomes[index].odds - value) < 0.006)
                #expect(moved.outcomes.allSatisfy { $0.odds >= 0 })
            }
        }
        var half = start
        half.setOdds(50, at: 0)
        #expect(half.outcomes.map(\.odds) == [50, 30, 20])
        half.setOdds(20, at: 2)
        #expect(close(half.outcomes[2].odds, 20))
        #expect(close(half.outcomes[0].odds + half.outcomes[1].odds, 80))
        let ratio = half.outcomes[0].odds / half.outcomes[1].odds
        #expect(abs(ratio - 50.0 / 30.0) < 0.01)

        var drag = start
        let base = start.outcomes
        drag.setOdds(100, at: 0, base: base)
        #expect(drag.outcomes.map(\.odds) == [100, 0, 0])
        drag.setOdds(50, at: 0, base: base)
        #expect(drag.outcomes.map(\.odds) == [50, 30, 20])

        var zeros = slot(1, [(.tier(1), 100), (.tier(2), 0), (.tier(3), 0)])
        zeros.setOdds(40, at: 0)
        #expect(zeros.outcomes.map(\.odds) == [40, 30, 30])

        var single = slot(1, [(.tier(1), 100)])
        single.setOdds(30, at: 0)
        #expect(single.outcomes[0].odds == 100)
        var out = start
        out.setOdds(10, at: 7)
        #expect(out == start)
        out.setOdds(250, at: 0)
        #expect(out.outcomes[0].odds == 100)
    }

    @Test("A removed outcome gives its odds to the others by their ratio (S15)")
    func removeOutcomes() {
        var s = slot(1, [(.tier(1), 50), (.tier(2), 30), (.tier(3), 20)])
        s.removeOutcomes(atOffsets: [2])
        #expect(s.outcomes.count == 2)
        #expect(s.outcomes.map(\.odds) == [62.5, 37.5])
        s.removeOutcomes(atOffsets: [0])
        #expect(s.outcomes.map(\.odds) == [100])
        s.removeOutcomes(atOffsets: [0])
        #expect(s.outcomes.isEmpty)
        var zero = slot(1, [(.tier(1), 100), (.tier(2), 0), (.tier(3), 0)])
        zero.removeOutcomes(atOffsets: [0])
        #expect(zero.outcomes.map(\.odds) == [50, 50])
    }

    @Test("A resolved pack points to the new ladder: by the tier ID first, then by the tier name (S6)")
    func resolved() {
        let source = RarityLadder.defaultLadder(id: 1)
        let target = RarityLadder(id: 2, name: "Other", tiers: [
            RarityTier(id: 1, name: "Basic", code: "B", symbol: .circle, color: .slate, fillerShare: 100),
            RarityTier(id: 20, name: "rare", code: "R", symbol: .star, color: .ocean),
        ])
        let layout = pack([slot(1, [(.tier(1), 40), (.tier(3), 40), (.tier(9), 20)])])
        let result = layout.resolved(against: target, source: source)
        let kinds = result.slots[0].outcomes.map(\.kind)
        #expect(kinds == [.tier(1), .tier(20), .tier(9)])
        #expect(layout.slots[0].outcomes[1].kind == .tier(3))
        let none = layout.resolved(against: target, source: nil)
        #expect(none.slots[0].outcomes.map(\.kind) == [.tier(1), .tier(3), .tier(9)])
    }

    @Test("Pull rates come from the slots: each slot adds its card count, and each outcome has a chance (S2, C9)")
    func pullRates() throws {
        let ladder = RarityLadder.defaultLadder(id: 1)
        let layout = PackLayout.defaultPack(id: 1)
        let stats = PackStats(pack: layout, ladder: ladder, cards: nil)
        let kinds = stats.lines.map(\.kind)
        let expected: [PackOutcomeKind] = (1...9).map { .tier($0) } + [.version("Reverse holo")]
        #expect(kinds == expected)
        let total = stats.lines.map(\.perPack).reduce(0, +)
        #expect(close(total, 10))
        #expect(stats.boxSize == 36)
        let common = try #require(stats.line(.tier(1)))
        #expect(close(common.perPack, 4))
        #expect(close(common.chance, 1))
        #expect(common.pool == nil)
        #expect(common.singleOneIn == nil)
        let reverse = try #require(stats.line(.version("Reverse holo")))
        #expect(close(reverse.perPack, 1.9))
        let sir = try #require(stats.line(.tier(8)))
        #expect(close(sir.perPack, 0.013))
        #expect(close(sir.chance, 0.013))
        let oneIn = try #require(sir.oneIn)
        #expect(abs(oneIn - 1 / 0.013) < 1e-6)

        let counted = pack([slot(1, count: 4, [(.tier(1), 50), (.tier(2), 50)]), slot(2, [(.tier(1), 100), (.tier(3), 0)])])
        let more = PackStats(pack: counted, ladder: ladder, cards: nil)
        let first = try #require(more.line(.tier(1)))
        #expect(close(first.perPack, 3))
        #expect(close(first.chance, 1))
        let second = try #require(more.line(.tier(2)))
        #expect(close(second.chance, 1 - 0.0625))
        let never = try #require(more.line(.tier(3)))
        #expect(never.chance == 0)
        #expect(never.oneIn == nil)
    }

    @Test("A set's pull rates add the pool of each outcome, and the single card odds follow (S2)")
    func setStats() throws {
        let (world, set, _) = try Fixture.studio()
        let stats = try #require(world.packStats(set))
        let common = try #require(stats.line(.tier(1)))
        #expect(common.pool == 5)
        let single = try #require(common.singleOneIn)
        #expect(close(single, 1.25))
        let sir = try #require(stats.line(.tier(8)))
        #expect(sir.pool == 0)
        #expect(sir.singleOneIn == nil)
        let reverse = try #require(stats.line(.version("Reverse holo")))
        #expect(reverse.pool == 10)
        #expect(world.packStats(999) == nil)
        #expect(world.packWarnings(999).isEmpty)
    }

    @Test("A pool drops a card that turned a version off, and a subset with its own outcome keeps its cards to itself (C16, S14)")
    func pools() throws {
        var (world, set, mascot) = try Fixture.studio()
        let off = try world.createCard(in: set, CardDraft(name: "Off", characterID: mascot, rarity: 3, excludedVersions: [1]))
        let gallery = try world.createCard(in: set, CardDraft(name: "Gallery", characterID: mascot, rarity: 7))
        let state = try #require(world.catalog.set(set))
        let ladder = state.ladder
        let cards = world.catalog.allCards(in: set)
        let reverse = PackStats.pool(.version("Reverse holo"), ladder: ladder, cards: cards).map(\.id)
        #expect(!reverse.contains(off))
        #expect(reverse.count == 8)
        let loose = PackStats.pool(.version("REVERSE holo"), ladder: ladder, cards: cards)
        #expect(loose.count == 8)
        #expect(PackStats.pool(.version("Nothing"), ladder: ladder, cards: cards).isEmpty)

        let id = try world.saveSubset(set, Subset(id: 0, name: "Gallery", prefix: "GA", ownOutcome: false), cards: [gallery])
        var subsets = try #require(world.catalog.set(set)).subsets
        let cardsNow = world.catalog.allCards(in: set)
        #expect(PackStats.pool(.tier(7), ladder: ladder, cards: cardsNow, subsets: subsets).map(\.id) == [gallery])
        #expect(PackStats.pool(.subset(id), ladder: ladder, cards: cardsNow, subsets: subsets).isEmpty)
        subsets[0].ownOutcome = true
        #expect(PackStats.pool(.tier(7), ladder: ladder, cards: cardsNow, subsets: subsets).isEmpty)
        #expect(PackStats.pool(.subset(id), ladder: ladder, cards: cardsNow, subsets: subsets).map(\.id) == [gallery])
    }

    @Test("The pack warnings flag a missing tier, an unreachable tier, and an empty outcome (sets.md, section 5.4)")
    func warnings() throws {
        var (world, set, mascot) = try Fixture.studio()
        let fresh = world.packWarnings(set)
        #expect(fresh.contains(.emptyOutcome(slot: 4, label: "Illustration Rare")))
        #expect(fresh.contains(.emptyOutcome(slot: 5, label: "Double Rare")))
        #expect(!fresh.contains { $0.blocksPrint })
        let hasUnreachable = fresh.contains { if case .unreachable = $0 { true } else { false } }
        #expect(!hasUnreachable)

        try world.createCard(in: set, CardDraft(name: "Gold", characterID: mascot, rarity: 9))
        editPack(&world, set) { $0.slots[3].removeOutcomes(atOffsets: [3]) }
        let unreachable = world.packWarnings(set)
        #expect(unreachable.contains(.unreachable(name: "Gold")))
        #expect(!unreachable.contains { $0.blocksPrint })
        editPack(&world, set) { $0.slots[3].outcomes.append(PackOutcome(id: 9, kind: .tier(9), odds: 0)) }
        #expect(world.packWarnings(set).contains(.unreachable(name: "Gold")))

        editPack(&world, set) { $0.slots[0].outcomes[0].kind = .tier(99) }
        let missing = world.packWarnings(set)
        #expect(missing.contains(.missingTier(slot: 1)))
        #expect(missing.contains { $0.blocksPrint })
        #expect(PackWarning.missingTier(slot: 1).blocksPrint)
        #expect(PackWarning.missingSubset(slot: 1).blocksPrint)
        #expect(!PackWarning.unreachable(name: "X").blocksPrint)
        #expect(!PackWarning.emptyOutcome(slot: 1, label: "X").blocksPrint)
        #expect(!PackWarning.subsetOnly(slot: 1, label: "X", subset: "Y").blocksPrint)
    }

    @Test("The warnings follow a subset: its cards come only through its own outcome (S14)")
    func subsetWarnings() throws {
        var (world, set, mascot) = try Fixture.studio()
        let card = try world.createCard(in: set, CardDraft(name: "Gallery", characterID: mascot, rarity: 7))
        let id = try world.saveSubset(set, Subset(id: 0, name: "Gallery", prefix: "GA", ownOutcome: true), cards: [card])
        let only = world.packWarnings(set)
        #expect(only.contains(.subsetOnly(slot: 4, label: "Illustration Rare", subset: "Gallery")))
        #expect(only.contains(.unreachable(name: "Gallery")))

        editPack(&world, set) { $0.slots[3].outcomes[1].kind = .subset(id) }
        let reached = world.packWarnings(set)
        #expect(!reached.contains(.unreachable(name: "Gallery")))
        #expect(!reached.contains { $0.blocksPrint })

        var other = try #require(world.catalog.set(set)).subsets[0]
        other.ownOutcome = false
        try world.saveSubset(set, other, cards: [card])
        let missing = world.packWarnings(set)
        #expect(missing.contains(.missingSubset(slot: 4)))
        #expect(missing.contains { $0.blocksPrint })
        editPack(&world, set) { $0.slots[3].outcomes[1].kind = .subset(999) }
        #expect(world.packWarnings(set).contains(.missingSubset(slot: 4)))
    }
}

extension PackLayout {
    fileprivate func with(id: PackID) -> PackLayout {
        PackLayout(id: id, name: name, ladderID: ladderID, boxSize: boxSize, slots: slots)
    }
}
