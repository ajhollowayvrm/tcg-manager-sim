import Foundation
import Testing
@testable import SimCore

@Suite("Eras, numbers, subsets, and art sets")
struct SetExtrasTests {
    func setup(size: Int = 20) throws -> (World, SetID, CharacterID) {
        var world = World(seed: 31, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let set = try world.createSet(.mini, SetDetails(name: "Base", code: "BAS", size: size), presetID: Catalog.defaultLadderID)
        return (world, set, aryla)
    }

    func tier(_ world: World, _ set: SetID, _ code: String) throws -> TierID {
        try #require(world.catalog.set(set)?.ladder.tiers.first { $0.code == code }?.id)
    }

    @Test("A save starts in the Base era, and a new set joins the current era (S7, S13)")
    func eras() throws {
        var (world, first, _) = try setup()
        #expect(world.catalog.currentEra.name == "Base")
        #expect(world.catalog.currentEra.gimmick == nil)
        #expect(world.catalog.set(first)?.eraID == Era.first.id)

        world.advanceWeek()
        let ex = try world.startEra(name: " The Ember Age ", gimmick: Gimmick(name: "ex", color: .ember))
        #expect(world.catalog.era(Era.first.id)?.endWeek == 1)
        #expect(world.catalog.currentEra.id == ex)
        #expect(world.catalog.currentEra.name == "The Ember Age")
        let second = try world.createSet(.main, SetDetails(name: "Embers", code: "EMB"), presetID: Catalog.defaultLadderID)
        #expect(world.catalog.set(second)?.eraID == ex)
        #expect(world.catalog.gimmick(of: second)?.name == "ex")
        #expect(world.catalog.gimmick(of: first) == nil)

        #expect(throws: CardError.badGimmickName) { try world.startEra(name: "Next", gimmick: Gimmick(name: "a very long gimmick")) }
        #expect(throws: CardError.emptyEraName) { try world.updateEra(ex, name: " ", gimmick: nil) }
        try world.updateEra(Era.first.id, name: "Origins", gimmick: nil)
        #expect(world.catalog.era(Era.first.id)?.name == "Origins")
    }

    @Test("A card that carries the gimmick shows it after the character part (S7)")
    func gimmickName() throws {
        var (world, set, aryla) = try setup()
        let rare = try tier(world, set, "R")
        let plain = try world.createCard(in: set, CardDraft(name: "Aryla, Destined Trainee", characterID: aryla, rarity: rare, gimmick: true))
        // The Base era has no gimmick, so the name stays.
        #expect(world.catalog.displayName(try #require(world.catalog.card(plain))) == "Aryla, Destined Trainee")

        try world.updateEra(Era.first.id, name: "Base", gimmick: Gimmick(name: "ex"))
        #expect(world.catalog.displayName(try #require(world.catalog.card(plain))) == "Aryla ex, Destined Trainee")
        let short = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: rare, gimmick: true))
        #expect(world.catalog.displayName(try #require(world.catalog.card(short))) == "Aryla ex")
        let without = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: rare))
        #expect(world.catalog.displayName(try #require(world.catalog.card(without))) == "Aryla")
    }

    @Test("Secret tiers number above the printed total (S11)")
    func secretNumbers() throws {
        var (world, set, aryla) = try setup()
        let sir = try tier(world, set, "SIR")
        let first = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: sir))
        let second = try world.createCard(in: set, CardDraft(name: "Aryla, Two", characterID: aryla, rarity: sir))
        let numbers = world.catalog.cardNumbers(in: set)
        #expect(numbers.count == 20)
        // 18 filler cards are not secret. The 2 SIR cards come after them.
        #expect(numbers[first] == "019/018")
        #expect(numbers[second] == "020/018")
        let common = try #require(world.catalog.fillerCards(in: set).first { $0.rarity == world.catalog.set(set)?.ladder.tiers[0].id })
        #expect(numbers[common.id]?.hasSuffix("/018") == true)
        #expect(Set(numbers.values).count == 20)
    }

    @Test("A subset numbers on its own, and only designed cards join it (S11)")
    func subsets() throws {
        var (world, set, aryla) = try setup()
        let rare = try tier(world, set, "R")
        let a = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: rare))
        let b = try world.createCard(in: set, CardDraft(name: "Aryla, Two", characterID: aryla, rarity: rare))
        let gallery = try world.saveSubset(set, Subset(id: 0, name: "Trainer Gallery", prefix: "tg"), cards: [a, b])
        let numbers = world.catalog.cardNumbers(in: set)
        #expect(numbers[a] == "TG01/TG02")
        #expect(numbers[b] == "TG02/TG02")
        #expect(world.catalog.set(set)?.subset(gallery)?.prefix == "TG")

        let filler = try #require(world.catalog.fillerCards(in: set).first)
        #expect(throws: CardError.subsetCard) {
            try world.saveSubset(set, Subset(id: 0, name: "Other", prefix: "OT"), cards: [filler.id])
        }
        #expect(throws: CardError.badSubsetPrefix) { try world.saveSubset(set, Subset(id: 0, name: "Other", prefix: "LONG"), cards: []) }
        #expect(throws: CardError.duplicateSubset("TG")) { try world.saveSubset(set, Subset(id: 0, name: "Other", prefix: "TG"), cards: []) }
        try world.saveSubset(set, Subset(id: 0, name: "Two", prefix: "B"), cards: [])
        try world.saveSubset(set, Subset(id: 0, name: "Three", prefix: "C"), cards: [])
        #expect(throws: CardError.tooManySubsets) { try world.saveSubset(set, Subset(id: 0, name: "Four", prefix: "D"), cards: []) }

        // Moving a card out of the subset returns it to the main numbers.
        try world.saveSubset(set, Subset(id: gallery, name: "Trainer Gallery", prefix: "TG"), cards: [a])
        #expect(world.catalog.card(b)?.subsetID == nil)
        try world.deleteSubset(set, gallery)
        #expect(world.catalog.card(a)?.subsetID == nil)
        #expect(world.catalog.cardNumbers(in: set)[a]?.contains("/") == true)
    }

    @Test("A subset with its own outcome leaves the tier pools and gets its own slot outcome (S14)")
    func subsetOutcome() throws {
        var (world, set, aryla) = try setup()
        let rare = try tier(world, set, "R")
        let a = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: rare))
        let rarePool = try #require(world.packStats(set)?.line(.tier(rare))?.pool)

        let gallery = try world.saveSubset(set, Subset(id: 0, name: "Trainer Gallery", prefix: "TG", ownOutcome: true), cards: [a])
        #expect(world.packStats(set)?.line(.tier(rare))?.pool == rarePool - 1)
        #expect(world.packWarnings(set).contains(.unreachable(name: "Trainer Gallery")))

        var pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[3].outcomes[0].odds -= 10
        pack.slots[3].outcomes.append(PackOutcome(id: 9, kind: .subset(gallery), odds: 10))
        try world.updateSetPack(set, pack)
        let line = try #require(world.packStats(set)?.line(.subset(gallery)))
        #expect(line.pool == 1)
        #expect(abs(try #require(line.oneIn) - 10) < 1e-9)
        #expect(!world.packWarnings(set).contains(.unreachable(name: "Trainer Gallery")))

        // With the switch off, the subset's cards come through their tiers again,
        // and the subset outcome points nowhere.
        try world.saveSubset(set, Subset(id: gallery, name: "Trainer Gallery", prefix: "TG", ownOutcome: false), cards: [a])
        #expect(world.packStats(set)?.line(.tier(rare))?.pool == rarePool)
        #expect(world.packWarnings(set).contains(.missingSubset(slot: 4)))
    }

    @Test("An art set has 2 to 5 designed cards, each in one art set only (S10)")
    func artSets() throws {
        var (world, set, aryla) = try setup()
        let rare = try tier(world, set, "R")
        let ids = try world.createCards(in: set, (1...4).map { CardDraft(name: "Aryla \($0)", characterID: aryla, rarity: rare) })
        let line = try world.saveArtSet(set, ArtSet(id: 0, name: "Rising line", cards: [ids[0], ids[1], ids[2]]))
        #expect(world.catalog.set(set)?.artSets.first?.cards == [ids[0], ids[1], ids[2]])

        #expect(throws: CardError.artSetSize) { try world.saveArtSet(set, ArtSet(id: 0, name: "One", cards: [ids[3]])) }
        #expect(throws: CardError.cardInTwoArtSets("Aryla 3")) {
            try world.saveArtSet(set, ArtSet(id: 0, name: "Other", cards: [ids[2], ids[3]]))
        }
        let filler = try #require(world.catalog.fillerCards(in: set).first)
        #expect(throws: CardError.artSetCard) {
            try world.saveArtSet(set, ArtSet(id: 0, name: "Other", cards: [ids[3], filler.id]))
        }
        // A deleted card leaves the art set. Below 2 cards, the art set ends.
        try world.deleteCard(ids[0])
        #expect(world.catalog.set(set)?.artSets.first?.cards == [ids[1], ids[2]])
        try world.deleteCard(ids[1])
        #expect(world.catalog.set(set)?.artSets.isEmpty == true)
        _ = line
    }

}
