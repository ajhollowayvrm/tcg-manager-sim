import Foundation
import Testing
@testable import SimCore

@Suite("Sets")
struct SetTests {
    @Test("A new set has a type, a code, a symbol, a size, and a headliner (sets.md, section 3)")
    func createSet() throws {
        var world = World(seed: 3, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let details = SetDetails(
            name: "Ember Court", code: " ecr ", symbol: SetSymbol(shape: .flame, color: .ember),
            theme: "castles", size: 90, headliner: Headliner(characterID: aryla)
        )
        let id = try world.createSet(.mini, details, presetID: Catalog.defaultLadderID)
        let set = try #require(world.catalog.set(id))
        #expect(set.type == .mini)
        #expect(set.code == "ECR")
        #expect(set.symbol.shape == .flame)
        #expect(set.size == 90)
        #expect(set.headliner == Headliner(characterID: aryla))
        #expect(set.pairID == nil)
        #expect(set.fillerCount(designed: 16) == 74)
    }

    @Test("The set code is 2 to 4 letters and unique")
    func codes() throws {
        var world = World(seed: 3, studioName: "Test")
        try world.createSet(.main, SetDetails(name: "Storm Rising", code: "SRI"), presetID: Catalog.defaultLadderID)
        #expect(throws: CardError.duplicateSetCode("SRI")) {
            try world.createSet(.main, SetDetails(name: "Other", code: "sri"), presetID: Catalog.defaultLadderID)
        }
        for bad in ["S", "STORM", "S1", ""] {
            #expect(throws: CardError.badSetCode) {
                try world.createSet(.main, SetDetails(name: "Other", code: bad), presetID: Catalog.defaultLadderID)
            }
        }
        // The suggestion never repeats a code that is taken.
        #expect(world.catalog.suggestedCode(for: "Storm Rising") != "SRI")
        #expect(CardSet.suggestCode(for: "Storm Rising", taken: []) == "SRI")
        #expect(CardSet.suggestCode(for: "Base", taken: []) == "BAS")
        #expect(CardSet.codeRange.contains(CardSet.suggestCode(for: "!!", taken: []).count))
    }

    @Test("Any size from 10 to 400, but never below the designed cards (S8)")
    func sizes() throws {
        var world = World(seed: 3, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        #expect(throws: CardError.badSetSize) {
            try world.createSet(.main, SetDetails(name: "Tiny", code: "TNY", size: 9), presetID: Catalog.defaultLadderID)
        }
        #expect(throws: CardError.badSetSize) {
            try world.createSet(.main, SetDetails(name: "Huge", code: "HGE", size: 401), presetID: Catalog.defaultLadderID)
        }
        let id = try world.createSet(.mini, SetDetails(name: "Small", code: "SML", size: 10), presetID: Catalog.defaultLadderID)
        let common = try #require(world.catalog.set(id)?.ladder.tiers.first?.id)
        let drafts = (1...10).map { CardDraft(name: "Aryla \($0)", characterID: aryla, rarity: common) }
        try world.createCards(in: id, drafts)
        #expect(throws: CardError.setFull(10)) {
            try world.createCard(in: id, CardDraft(name: "Aryla", characterID: aryla, rarity: common))
        }
        var details = try SetDetails(from: #require(world.catalog.set(id)))
        details.size = 12
        try world.updateSet(id, details)
        #expect(throws: CardError.setFull(12)) {
            try world.createCards(in: id, (1...3).map { CardDraft(name: "Extra \($0)", characterID: aryla, rarity: common) })
        }
        details.size = 9
        #expect(throws: CardError.badSetSize) { try world.updateSet(id, details) }
        details.size = 11
        try world.updateSet(id, details)
        try world.createCard(in: id, CardDraft(name: "Aryla 11", characterID: aryla, rarity: common))
        details.size = 10
        #expect(throws: CardError.sizeBelowCards(11)) { try world.updateSet(id, details) }
    }

    @Test("A parallel pair is created together, and each set links to the other (D2, S9)")
    func parallelPair() throws {
        var world = World(seed: 3, studioName: "Test")
        #expect(throws: CardError.parallelNeedsPair) {
            try world.createSet(.parallel, SetDetails(name: "Black", code: "BLK"), presetID: Catalog.defaultLadderID)
        }
        #expect(throws: CardError.duplicateSetCode("BLK")) {
            try world.createParallelPair(
                SetDetails(name: "Black Bolt", code: "BLK"), SetDetails(name: "White Flare", code: "blk"),
                presetID: Catalog.defaultLadderID
            )
        }
        #expect(world.catalog.sets.isEmpty)
        let (black, white) = try world.createParallelPair(
            SetDetails(name: "Black Bolt", code: "BLK", size: 120), SetDetails(name: "White Flare", code: "WHT", size: 100),
            presetID: Catalog.defaultLadderID
        )
        #expect(world.catalog.set(black)?.type == .parallel)
        #expect(world.catalog.pair(of: black)?.id == white)
        #expect(world.catalog.pair(of: white)?.id == black)
        #expect(world.catalog.set(white)?.size == 100)
        #expect(throws: CardError.parallelTypeFixed) { try world.updateSetType(black, .main) }

        let main = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        try world.updateSetType(main, .mini)
        #expect(world.catalog.set(main)?.type == .mini)
        #expect(throws: CardError.parallelTypeFixed) { try world.updateSetType(main, .parallel) }
    }

    @Test("The headliner must exist, and the set warns when it has no card (sets.md, section 3.4)")
    func headliner() throws {
        var world = World(seed: 3, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let id = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        var details = try SetDetails(from: #require(world.catalog.set(id)))
        details.headliner = Headliner(characterID: 999)
        #expect(throws: CardError.unknownCharacter(999)) { try world.updateSet(id, details) }
        details.headliner = Headliner(characterID: aryla, formID: 999)
        #expect(throws: CardError.unknownForm(999)) { try world.updateSet(id, details) }
        details.headliner = Headliner(characterID: aryla)
        try world.updateSet(id, details)
        #expect(!world.catalog.headlinerHasCard(id))
        let common = try #require(world.catalog.set(id)?.ladder.tiers.first?.id)
        try world.createCard(in: id, CardDraft(name: "Aryla", characterID: aryla, rarity: common))
        #expect(world.catalog.headlinerHasCard(id))
    }

    @Test("A version 7 save gets a type, a unique code, a symbol, and a size for each set")
    func migrateVersion7() throws {
        var world = World(seed: 9, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let first = try world.createSet(name: "Storm Rising", theme: nil, presetID: Catalog.defaultLadderID)
        let second = try world.createSet(name: "Storm Risen", theme: nil, presetID: Catalog.defaultLadderID)
        let common = try #require(world.catalog.set(first)?.ladder.tiers.first?.id)
        try world.createCard(in: first, CardDraft(name: "Aryla", characterID: aryla, rarity: common))

        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var catalog = try #require(json["catalog"] as? [String: Any])
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map {
            var s = $0
            for key in ["type", "code", "symbol", "size", "pairID", "headliner"] { s.removeValue(forKey: key) }
            return s
        }
        json["catalog"] = catalog
        json["version"] = 7

        try World.migrate(&json)
        let migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(migrated.version == World.currentVersion)
        let a = try #require(migrated.catalog.set(first))
        let b = try #require(migrated.catalog.set(second))
        #expect(a.type == .main && b.type == .main)
        #expect(a.code != b.code)
        #expect(a.symbol == .standard)
        #expect(a.size == SetType.main.suggestedSize)
        #expect(a.headliner == nil && a.pairID == nil)
        #expect(migrated.catalog.cards(in: first).count == 1)
    }
}
