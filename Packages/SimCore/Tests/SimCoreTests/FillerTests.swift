import Foundation
import Testing
@testable import SimCore

@Suite("Filler")
struct FillerTests {
    func world(withRoster: Bool = true) throws -> World {
        var world = World(seed: 11, studioName: "Test")
        if withRoster {
            try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
            try world.createCharacter(CharacterDraft(name: "Ember", role: .starter))
        }
        return world
    }

    func counts(_ world: World, _ set: SetID) -> [TierID: Int] {
        world.catalog.fillerCards(in: set).reduce(into: [:]) { $0[$1.rarity, default: 0] += 1 }
    }

    @Test("The filler shares split the filler with the largest-remainder method (S4)")
    func targets() {
        let ladder = RarityLadder.defaultLadder(id: 1)
        #expect(World.fillerTargets(count: 134, ladder: ladder) == [1: 67, 2: 44, 3: 23])
        // 150 gives 75, 49.5, and 25.5. On a tie, the more common tier gets the card.
        #expect(World.fillerTargets(count: 150, ladder: ladder) == [1: 75, 2: 50, 3: 25])
        #expect(World.fillerTargets(count: 0, ladder: ladder).isEmpty)
        #expect(World.fillerTargets(count: 1, ladder: ladder) == [1: 1, 2: 0, 3: 0])
    }

    @Test("A new set gets its filler and its generated characters, outside the roster (R6, R13)")
    func newSet() throws {
        var world = try world()
        let rosterCount = world.characters.count
        let set = try world.createSet(name: "Base", theme: "fire", presetID: Catalog.defaultLadderID)
        #expect(world.catalog.fillerCards(in: set).count == 150)
        #expect(counts(world, set) == [1: 75, 2: 50, 3: 25])
        let generated = try #require(world.catalog.set(set)?.generated)
        #expect(SetType.main.generatedRange.contains(generated.count))
        #expect(generated.allSatisfy { $0.origin == .generated })
        // The generated characters wait on the set. They are not in the roster yet.
        #expect(world.characters.count == rosterCount)
        let fillerCharacters = Set(world.catalog.fillerCards(in: set).map(\.characterID))
        for c in generated {
            #expect(fillerCharacters.contains(c.id))
            #expect(world.character(c.id)?.name == c.name)
        }
        // Filler cards also reuse roster characters.
        #expect(world.characters.contains { fillerCharacters.contains($0.id) })
        // A filler card is named after its character.
        #expect(world.catalog.fillerCards(in: set).allSatisfy { $0.name == world.character($0.characterID)?.name })
    }

    @Test("A mini set gets fewer generated characters")
    func miniSet() throws {
        var world = try world()
        let set = try world.createSet(.mini, SetDetails(name: "Mini", code: "MIN", size: 40), presetID: Catalog.defaultLadderID)
        let generated = try #require(world.catalog.set(set)?.generated)
        #expect(SetType.mini.generatedRange.contains(generated.count))
        #expect(world.catalog.fillerCards(in: set).count == 40)
    }

    @Test("A set with no roster still fills every slot with generated characters")
    func emptyRoster() throws {
        var world = try world(withRoster: false)
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        #expect(world.catalog.fillerCards(in: set).count == 150)
        let ids = Set(try #require(world.catalog.set(set)?.generated).map(\.id))
        #expect(world.catalog.fillerCards(in: set).allSatisfy { ids.contains($0.characterID) })
    }

    @Test("A change keeps the filler that fits, and adds or removes only the difference")
    func keepsFiller() throws {
        var world = try world()
        let aryla = try #require(world.characters.first?.id)
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        let before = Set(world.catalog.fillerCards(in: set).map(\.id))

        // One designed card takes one filler slot.
        let common = try #require(world.catalog.set(set)?.ladder.tiers.first?.id)
        let card = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: common))
        let afterAdd = Set(world.catalog.fillerCards(in: set).map(\.id))
        #expect(afterAdd.count == 149)
        #expect(afterAdd.isSubset(of: before))

        // A larger set keeps every filler card and adds new ones.
        var details = try SetDetails(from: #require(world.catalog.set(set)))
        details.size = 200
        try world.updateSet(set, details)
        let afterGrow = Set(world.catalog.fillerCards(in: set).map(\.id))
        #expect(afterGrow.count == 199)
        #expect(afterAdd.isSubset(of: afterGrow))

        // A deleted designed card gives its slot back to the filler.
        try world.deleteCard(card)
        #expect(world.catalog.fillerCards(in: set).count == 200)
    }

    @Test("The player cannot change or delete a filler card")
    func fillerLocked() throws {
        var world = try world()
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        let filler = try #require(world.catalog.fillerCards(in: set).first)
        #expect(throws: CardError.fillerLocked) { try world.deleteCard(filler.id) }
        #expect(throws: CardError.fillerLocked) { try world.updateCard(filler.id, CardDraft(from: filler)) }
        // The designed-card list does not include filler.
        #expect(world.catalog.cards(in: set).isEmpty)
    }

    @Test("A reroll makes new filler and new generated characters (S5)")
    func reroll() throws {
        var world = try world()
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        let oldGenerated = Set(try #require(world.catalog.set(set)?.generated).map(\.id))
        let oldCards = Set(world.catalog.fillerCards(in: set).map(\.id))
        try world.rerollFiller(set)
        let newGenerated = Set(try #require(world.catalog.set(set)?.generated).map(\.id))
        #expect(newGenerated.isDisjoint(with: oldGenerated))
        #expect(Set(world.catalog.fillerCards(in: set).map(\.id)).isDisjoint(with: oldCards))
        #expect(counts(world, set) == [1: 75, 2: 50, 3: 25])
        #expect(oldGenerated.allSatisfy { world.character($0) == nil })
    }

    @Test("The shares of a ladder must add up to 100, and a change moves the filler")
    func shares() throws {
        var world = try world()
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        var ladder = try #require(world.catalog.set(set)?.ladder)
        ladder.tiers[0].fillerShare = 40
        #expect(throws: CardError.fillerShares(90)) { try world.updateSetLadder(set, ladder) }
        ladder.tiers[0].fillerShare = 101
        #expect(throws: CardError.badFillerShare("Common")) { try world.updateSetLadder(set, ladder) }
        ladder.tiers[0].fillerShare = 0
        ladder.tiers[1].fillerShare = 0
        ladder.tiers[2].fillerShare = 0
        ladder.tiers[3].fillerShare = 100
        try world.updateSetLadder(set, ladder)
        #expect(counts(world, set) == [ladder.tiers[3].id: 150])
    }

    @Test("The theme sets the kind mix of generated characters (R17)")
    func kindMix() throws {
        var world = try world()
        let history = try world.createSet(.main, SetDetails(name: "Court", code: "CRT", theme: "feudalism", size: 300), presetID: Catalog.defaultLadderID)
        let people = try #require(world.catalog.set(history)?.generated).filter { $0.kind == .person }
        #expect(!people.isEmpty)
        #expect(people.allSatisfy { NameGenerator.personNames.contains($0.name.split(separator: " ").first.map(String.init) ?? "") })
    }

    @Test("A generated name is reserved, so the player cannot take it")
    func reservedNames() throws {
        var world = try world()
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        let name = try #require(world.catalog.set(set)?.generated.first?.name)
        #expect(throws: RosterError.duplicateName(name)) { try world.createCharacter(CharacterDraft(name: name)) }
    }

    @Test("The same seed and decisions give the same filler")
    func deterministic() throws {
        var a = try world()
        var b = try world()
        try a.createSet(name: "Base", theme: "pirates", presetID: Catalog.defaultLadderID)
        try b.createSet(name: "Base", theme: "pirates", presetID: Catalog.defaultLadderID)
        #expect(a == b)
    }

    @Test("A version 8 save gets filler shares and no filler. Making the filler fills the set")
    func migrateVersion8() throws {
        var world = try world()
        let aryla = try #require(world.characters.first?.id)
        let set = try world.createSet(name: "Old", theme: nil, presetID: Catalog.defaultLadderID)
        let common = try #require(world.catalog.set(set)?.ladder.tiers.first?.id)
        try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: common))

        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var catalog = try #require(json["catalog"] as? [String: Any])
        func strip(_ ladder: Any?) -> [String: Any] {
            var l = ladder as? [String: Any] ?? [:]
            l["tiers"] = (l["tiers"] as? [[String: Any]] ?? []).map { var t = $0; t.removeValue(forKey: "fillerShare"); return t }
            return l
        }
        catalog["ladderPresets"] = (catalog["ladderPresets"] as? [Any] ?? []).map(strip)
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map {
            var s = $0
            s["ladder"] = strip(s["ladder"])
            s.removeValue(forKey: "generated")
            return s
        }
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).compactMap { card -> [String: Any]? in
            var c = card
            if c["filler"] as? Bool == true { return nil }
            c.removeValue(forKey: "filler")
            return c
        }
        json["catalog"] = catalog
        json["version"] = 8

        try World.migrate(&json)
        var migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(migrated.version == World.currentVersion)
        #expect(migrated.catalog.set(set)?.ladder.tiers.prefix(4).map(\.fillerShare) == [50, 33, 17, 0])
        #expect(migrated.catalog.cards(in: set).count == 1)
        #expect(migrated.catalog.fillerCards(in: set).isEmpty)
        try migrated.rerollFiller(set)
        #expect(migrated.catalog.fillerCards(in: set).count == 149)
    }
}
