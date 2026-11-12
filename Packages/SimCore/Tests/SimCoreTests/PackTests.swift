import Foundation
import Testing
@testable import SimCore

@Suite("Packs")
struct PackTests {
    func setup() throws -> (World, SetID, CharacterID) {
        var world = World(seed: 21, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        return (world, set, aryla)
    }

    @Test("The default pack has 10 cards in 5 slots, and each slot adds up to 100% (sets.md, section 5.2)")
    func defaultPack() throws {
        let world = World(seed: 1, studioName: "Test")
        let pack = try #require(world.catalog.packPreset(Catalog.defaultPackID))
        #expect(pack.cardCount == 10)
        #expect(pack.boxSize == 36)
        #expect(pack.slots.allSatisfy { abs($0.oddsSum - 100) < 0.001 })
        #expect(throws: Never.self) { try world.validPack(pack) }
    }

    @Test("The pull rates come from the slots (sets.md, section 5.3)")
    func stats() throws {
        let pack = PackLayout.defaultPack(id: 1)
        let ladder = RarityLadder.defaultLadder(id: 1)
        let stats = PackStats(pack: pack, ladder: ladder, cards: nil)
        let common = try #require(stats.line(.tier(1)))
        #expect(common.perPack == 4)
        #expect(common.chance == 1)
        let sir = try #require(stats.line(.tier(8)))
        #expect(abs(try #require(sir.oneIn) - 1 / 0.013) < 1e-9)
        let ir = try #require(stats.line(.tier(7)))
        #expect(abs(ir.perPack * Double(stats.boxSize) - 2.88) < 1e-9)
        let reverse = try #require(stats.line(.version("Reverse holo")))
        #expect(abs(reverse.perPack - 1.9) < 1e-9)
        // A preset has no cards, so it has no single-card chance.
        #expect(sir.singleOneIn == nil)
        // The lines follow the ladder order, then the versions.
        #expect(stats.lines.first?.kind == .tier(1))
        #expect(stats.lines.last?.kind == .version("Reverse holo"))
    }

    @Test("The chance of one single card divides the tier's rate by its card count (S3)")
    func singleCard() throws {
        var (world, set, aryla) = try setup()
        let sir = try #require(world.catalog.set(set)?.ladder.tiers[7].id)
        try world.createCards(in: set, (1...6).map { CardDraft(name: "Aryla \($0)", characterID: aryla, rarity: sir) })
        let line = try #require(world.packStats(set)?.line(.tier(sir)))
        #expect(line.pool == 6)
        #expect(abs(try #require(line.singleOneIn) - 6 / 0.013) < 1e-9)
        // The reverse holo pool has every Common, Uncommon, Rare, and Holo Rare card.
        let reverse = try #require(world.packStats(set)?.line(.version("Reverse holo")))
        #expect(reverse.pool == world.catalog.fillerCards(in: set).count)
    }

    @Test("A card that turns the reverse holo off leaves the reverse holo pool (C16)")
    func versionPool() throws {
        var (world, set, aryla) = try setup()
        let common = try #require(world.catalog.set(set)?.ladder.tiers[0])
        let before = try #require(world.packStats(set)?.line(.version("Reverse holo"))?.pool)
        try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: common.id, excludedVersions: [common.versions[0].id]))
        // The designed card takes one filler slot, and it has no reverse holo.
        #expect(world.packStats(set)?.line(.version("Reverse holo"))?.pool == before - 1)
    }

    @Test("Pack rules: odds add up to 100, outcomes are unique, and the counts are in range")
    func rules() throws {
        var (world, set, _) = try setup()
        var pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[4].outcomes[0].odds = 45
        #expect(throws: CardError.slotOddsSum(slot: 5, sum: 90)) { try world.updateSetPack(set, pack) }
        pack.slots[4].outcomes[0].odds = 55
        pack.slots[4].outcomes[1].kind = .tier(3)
        #expect(throws: CardError.duplicateOutcome(5)) { try world.updateSetPack(set, pack) }
        pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[0].outcomes = []
        #expect(throws: CardError.emptySlot(1)) { try world.updateSetPack(set, pack) }
        pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[0].count = 15
        #expect(throws: CardError.packCardCount) { try world.updateSetPack(set, pack) }
        pack.slots[0].count = 4
        pack.boxSize = 0
        #expect(throws: CardError.badBoxSize) { try world.updateSetPack(set, pack) }

        // A rarer chase takes odds from another outcome in the same slot.
        pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[3].outcomes[2].odds = 0.5
        pack.slots[3].outcomes[0].odds = 90.8
        try world.updateSetPack(set, pack)
        let sir = try #require(world.catalog.set(set)?.ladder.tiers[7].id)
        #expect(abs(try #require(world.packStats(set)?.line(.tier(sir))?.oneIn) - 200) < 1e-9)
    }

    @Test("Pack presets: the default is locked, a copy can change, and a set keeps its own copy (S6, C10)")
    func presets() throws {
        var (world, set, _) = try setup()
        var locked = try #require(world.catalog.packPreset(Catalog.defaultPackID))
        locked.boxSize = 24
        #expect(throws: CardError.defaultPackLocked) { try world.updatePackPreset(locked) }
        #expect(throws: CardError.defaultPackLocked) { try world.deletePackPreset(Catalog.defaultPackID) }

        let mine = try world.createPackPreset(copying: Catalog.defaultPackID, name: "Small box")
        #expect(throws: CardError.duplicatePackName("small box")) {
            try world.createPackPreset(copying: Catalog.defaultPackID, name: "small box")
        }
        var copy = try #require(world.catalog.packPreset(mine))
        copy.boxSize = 24
        try world.updatePackPreset(copy)
        let second = try world.createSet(.main, SetDetails(name: "Second", code: "SEC"), presetID: Catalog.defaultLadderID, packID: mine)
        #expect(world.catalog.set(second)?.pack.boxSize == 24)
        copy.boxSize = 18
        try world.updatePackPreset(copy)
        #expect(world.catalog.set(second)?.pack.boxSize == 24)
        try world.deletePackPreset(mine)
        #expect(world.catalog.set(second)?.pack.boxSize == 24)
        #expect(world.catalog.set(set)?.pack.boxSize == 36)
    }

    @Test("A preset's tiers match a set's ladder by ID, then by name (S6)")
    func resolve() {
        let pack = PackLayout.defaultPack(id: 1)
        let source = RarityLadder.defaultLadder(id: 1)
        // A ladder with the same tier names and new IDs.
        let renumbered = RarityLadder(id: 2, name: "Other", tiers: source.tiers.map { tier in
            var t = RarityTier(id: tier.id + 100, name: tier.name, code: tier.code, symbol: tier.symbol, color: tier.color)
            t.versions = tier.versions
            return t
        })
        let resolved = pack.resolved(against: renumbered, source: source)
        #expect(resolved.slots[0].outcomes[0].kind == .tier(101))
        #expect(resolved.slots[3].outcomes[2].kind == .tier(108))
        // With no source ladder, an unmatched outcome keeps its ID, and a warning asks for a tier.
        let unresolved = pack.resolved(against: renumbered, source: nil)
        #expect(unresolved.slots[0].outcomes[0].kind == .tier(1))
        #expect(unresolved.warnings(ladder: renumbered, cards: []).contains(.missingTier(slot: 1)))
    }

    @Test("Warnings: a missing tier, an unreachable tier, and an empty outcome (sets.md, section 5.4)")
    func warnings() throws {
        var (world, set, aryla) = try setup()
        // A new set has filler only in C, U, and R, so the chase outcomes have no cards yet.
        let initial = world.packWarnings(set)
        #expect(initial.contains(.emptyOutcome(slot: 4, label: "Special Illustration Rare")))
        #expect(!initial.contains { $0.blocksPrint })

        // A Holo Rare card with no Holo Rare outcome cannot be pulled.
        let ladder = try #require(world.catalog.set(set)?.ladder)
        try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: ladder.tiers[3].id))
        var pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[4].outcomes.removeAll { $0.kind == .tier(ladder.tiers[3].id) }
        pack.slots[4].outcomes[0].odds += 22
        try world.updateSetPack(set, pack)
        // The Holo Rare card still comes as a reverse holo, so it is reachable by version.
        #expect(!world.packWarnings(set).contains(.unreachable(name: "Holo Rare")))
        var noReverse = ladder
        noReverse.tiers[3].versions = []
        try world.updateSetLadder(set, noReverse)
        #expect(world.packWarnings(set).contains(.unreachable(name: "Holo Rare")))

        // A removed tier leaves a slot that points nowhere. It blocks the print.
        var noGold = try #require(world.catalog.set(set)?.ladder)
        noGold.tiers.removeLast()
        try world.updateSetLadder(set, noGold)
        let missing = world.packWarnings(set)
        #expect(missing.contains(.missingTier(slot: 4)))
        #expect(missing.contains { $0.blocksPrint })
    }


    @Test("A slider change rebalances the other outcomes by their ratio, and the slot stays at 100% (S15)")
    func rebalance() throws {
        // Slot 9 of the default pack: reverse holo 90, IR 8, SIR 1.3, Gold 0.7.
        var slot = PackLayout.defaultPack(id: 1).slots[3]
        slot.setOdds(80, at: 0)
        #expect(slot.outcomes.map(\.odds) == [80, 16, 2.6, 1.4])

        // A drag keeps the ratio from the drag start, so 100% and back restores it.
        let base = slot.outcomes
        slot.setOdds(100, at: 0, base: base)
        #expect(slot.outcomes.map(\.odds) == [100, 0, 0, 0])
        slot.setOdds(80, at: 0, base: base)
        #expect(slot.outcomes.map(\.odds) == [80, 16, 2.6, 1.4])

        // Others that are all at 0% share the rest equally.
        slot.setOdds(100, at: 0)
        slot.setOdds(70, at: 0)
        #expect(slot.outcomes.map(\.odds) == [70, 10, 10, 10])

        // Rounding never breaks the sum, and no outcome goes below 0%.
        for value in stride(from: 0.0, through: 100, by: 3.33) {
            slot.setOdds(value, at: 2)
            #expect(abs(slot.oddsSum - 100) < 1e-9)
            #expect(slot.outcomes.allSatisfy { $0.odds >= 0 })
        }

        // A single outcome is always 100%.
        var single = PackSlot(id: 1, outcomes: [PackOutcome(id: 1, kind: .tier(1), odds: 100)])
        single.setOdds(40, at: 0)
        #expect(single.outcomes[0].odds == 100)
    }

    @Test("A removed outcome gives its odds to the others by their ratio (S15)")
    func removeRebalances() throws {
        var slot = PackLayout.defaultPack(id: 1).slots[4]
        // Rare 55, Holo Rare 22, Double Rare 16, Ultra Rare 7. Remove the Holo Rare.
        slot.removeOutcomes(atOffsets: [1])
        #expect(abs(slot.oddsSum - 100) < 1e-9)
        #expect(slot.outcomes.map(\.odds) == [70.52, 20.51, 8.97])
    }

    @Test("An outcome whose cards are all in an own-outcome subset names the subset (S14)")
    func subsetOnlyWarning() throws {
        var (world, set, aryla) = try setup()
        let sir = try #require(world.catalog.set(set)?.ladder.tiers[7].id)
        let card = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: sir))
        #expect(!world.packWarnings(set).contains { if case .emptyOutcome(4, "Special Illustration Rare") = $0 { true } else { false } })
        let collection = try world.saveSubset(set, Subset(id: 0, name: "Aryla Collection", prefix: "AC", ownOutcome: true), cards: [card])
        let warnings = world.packWarnings(set)
        #expect(warnings.contains(.subsetOnly(slot: 4, label: "Special Illustration Rare", subset: "Aryla Collection")))
        #expect(!warnings.contains(.emptyOutcome(slot: 4, label: "Special Illustration Rare")))
        // A tier with no cards anywhere keeps the plain warning.
        #expect(warnings.contains(.emptyOutcome(slot: 4, label: "Gold")))
        // With the switch off, the card comes through its tier again.
        try world.saveSubset(set, Subset(id: collection, name: "Aryla Collection", prefix: "AC", ownOutcome: false), cards: [card])
        #expect(!world.packWarnings(set).contains { if case .subsetOnly = $0 { true } else { false } })
    }
}
