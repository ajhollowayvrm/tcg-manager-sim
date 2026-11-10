import Foundation
import Testing
@testable import SimCore

@Suite("Cards")
struct CardTests {
    /// A world with two characters and one set on the default ladder.
    func setup() throws -> (World, SetID, CharacterID, CharacterID) {
        var world = World(seed: 7, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let ember = try world.createCharacter(CharacterDraft(name: "Ember", role: .starter))
        let set = try world.createSet(name: "Base Set", theme: "feudalism", presetID: Catalog.defaultLadderID)
        return (world, set, aryla, ember)
    }

    func tier(_ world: World, _ set: SetID, _ index: Int) throws -> TierID {
        try #require(world.catalog.set(set)?.ladder.tiers[index].id)
    }

    @Test("A new world has the default ladder, and its tiers set the card looks (C14, C15)")
    func defaults() {
        let world = World(seed: 1, studioName: "Test")
        let ladder = world.catalog.preset(Catalog.defaultLadderID)
        #expect(ladder?.tiers.count == 9)
        #expect(ladder?.tiers.first?.name == "Common")
        #expect(ladder?.tiers.last?.name == "Gold")
        #expect(ladder?.tiers.first { $0.code == "SIR" }?.frameStyle == .rainbow)
        #expect(ladder?.tiers.last?.frameStyle == .gold)
        #expect(ladder?.tiers.first?.look == .plain)
        #expect(ladder?.tiers.first?.costPerCopy == 0)
        #expect(ladder?.tiers.last?.look.foil == .gold)
        #expect(ladder?.tiers.last?.costPerCopy ?? 0 > ladder?.tiers[3].costPerCopy ?? 0)
    }

    @Test("A card keeps its five decisions and gets a hidden shift (C2, R24)")
    func createCard() throws {
        var (world, set, aryla, ember) = try setup()
        let rare = try tier(world, set, 2)
        let id = try world.createCard(in: set, CardDraft(
            name: "  Aryla, Destined Trainee ", characterID: aryla, rarity: rare, featured: [ember]
        ))
        let card = try #require(world.catalog.card(id))
        #expect(card.name == "Aryla, Destined Trainee")
        #expect(card.setID == set)
        #expect(card.rarity == rare)
        #expect(card.featured == [ember])
        #expect(card.cardShift.values.contains { $0 != 0 })
        #expect(card.cardShift[.resellers] == 0)
    }

    @Test("Two cards of one character have different shifts, and an edit keeps the shift (R24)")
    func cardsHaveTheirOwnLife() throws {
        var (world, set, aryla, _) = try setup()
        let common = try tier(world, set, 0)
        let a = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: common))
        let b = try world.createCard(in: set, CardDraft(name: "Aryla, Again", characterID: aryla, rarity: common))
        let shiftA = try #require(world.catalog.card(a)?.cardShift)
        #expect(shiftA != world.catalog.card(b)?.cardShift)

        try world.updateCard(a, CardDraft(name: "Aryla, Renamed", characterID: aryla, rarity: try tier(world, set, 8)))
        #expect(world.catalog.card(a)?.cardShift == shiftA)
        #expect(world.catalog.card(a)?.name == "Aryla, Renamed")
    }

    @Test("One character at many rarities makes separate cards, each with its own shift and versions (D1)")
    func oneCharacterAtManyRarities() throws {
        var (world, set, aryla, _) = try setup()
        let rarityIndexes = [0, 2, 5, 7]
        var drafts = try rarityIndexes.map { index in
            CardDraft(name: "Aryla, Destined Trainee", characterID: aryla, rarity: try tier(world, set, index))
        }
        drafts[3].ownVersions = [CardVersion.altArt(id: 1)]
        let ids = try world.createCards(in: set, drafts)
        #expect(ids.count == 4)
        let cards = try ids.map { try #require(world.catalog.card($0)) }
        #expect(cards.map(\.rarity) == drafts.map(\.rarity))
        #expect(Set(cards.map(\.name)) == ["Aryla, Destined Trainee"])
        for (i, a) in cards.enumerated() {
            for b in cards[(i + 1)...] { #expect(a.cardShift != b.cardShift) }
        }
        #expect(cards[3].ownVersions.map(\.name) == ["Alt art"])
        #expect(cards[0].ownVersions.isEmpty)
    }

    @Test("If one draft fails, no card is added")
    func manyRaritiesAllOrNothing() throws {
        var (world, set, aryla, _) = try setup()
        let good = CardDraft(name: "Aryla", characterID: aryla, rarity: try tier(world, set, 0))
        let bad = CardDraft(name: "Aryla", characterID: aryla, rarity: 999)
        let before = world
        #expect(throws: CardError.unknownTier(999)) { try world.createCards(in: set, [good, bad]) }
        #expect(throws: CardError.noRarity) { try world.createCards(in: set, []) }
        #expect(world == before)
    }

    @Test("Card appeal: the subject, plus featured IP, plus the card's own shift (R22, R24)")
    func cardAppeal() throws {
        var (world, set, aryla, ember) = try setup()
        let common = try tier(world, set, 0)
        let id = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: common, featured: [ember]))
        let card = try #require(world.catalog.card(id))
        let a = try #require(world.character(aryla))
        let e = try #require(world.character(ember))
        let expected = a.trueAppeal(.kids, fits: world.fits)
            + World.featuredWeight * e.trueAppeal(.kids, fits: world.fits)
            + card.cardShift[.kids]
        #expect(abs(try #require(world.cardAppeal(card, .kids)) - Character.clampAppeal(expected)) < 1e-9)
    }

    @Test("A card that shows a form uses the form's appeal (R23)")
    func formCard() throws {
        var (world, set, aryla, _) = try setup()
        let formID = try world.createForm(of: aryla, CharacterDraft(name: "Captain Aryla", role: .legendary, kind: .person))
        let id = try world.createCard(in: set, CardDraft(name: "Captain Aryla, Fleet Commander", characterID: aryla, formID: formID, rarity: try tier(world, set, 5)))
        let card = try #require(world.catalog.card(id))
        let c = try #require(world.character(aryla))
        let form = try #require(c.form(formID))
        let expected = Character.clampAppeal(c.formAppeal(form, .kids, fits: world.fits) + card.cardShift[.kids])
        #expect(abs(try #require(world.cardAppeal(card, .kids)) - expected) < 1e-9)
    }

    @Test("Card validation rejects bad drafts")
    func cardValidation() throws {
        var (world, set, aryla, ember) = try setup()
        let common = try tier(world, set, 0)
        #expect(throws: CardError.emptyName) { try world.createCard(in: set, CardDraft(name: " ", characterID: aryla, rarity: common)) }
        #expect(throws: CardError.noSubject) { try world.createCard(in: set, CardDraft(name: "X", rarity: common)) }
        #expect(throws: CardError.noRarity) { try world.createCard(in: set, CardDraft(name: "X", characterID: aryla)) }
        #expect(throws: CardError.unknownTier(999)) { try world.createCard(in: set, CardDraft(name: "X", characterID: aryla, rarity: 999)) }
        #expect(throws: CardError.unknownForm(999)) { try world.createCard(in: set, CardDraft(name: "X", characterID: aryla, formID: 999, rarity: common)) }
        #expect(throws: CardError.featuredSubject) { try world.createCard(in: set, CardDraft(name: "X", characterID: aryla, rarity: common, featured: [aryla])) }
        #expect(throws: CardError.duplicateFeatured) { try world.createCard(in: set, CardDraft(name: "X", characterID: aryla, rarity: common, featured: [ember, ember])) }
        let third = try world.createCharacter(CharacterDraft(name: "Third"))
        let fourth = try world.createCharacter(CharacterDraft(name: "Fourth"))
        #expect(throws: CardError.tooManyFeatured) { try world.createCard(in: set, CardDraft(name: "X", characterID: aryla, rarity: common, featured: [ember, third, fourth])) }
    }

    @Test("A set copies its ladder, so a later preset change does not reach it (C10)")
    func setKeepsItsLadder() throws {
        var (world, set, _, _) = try setup()
        let preset = try world.createPreset(copying: Catalog.defaultLadderID, name: "Short")
        var ladder = try #require(world.catalog.preset(preset))
        ladder.tiers = Array(ladder.tiers.prefix(3))
        try world.updatePreset(ladder)
        #expect(world.catalog.preset(preset)?.tiers.count == 3)
        #expect(world.catalog.set(set)?.ladder.tiers.count == 9)

        let short = try world.createSet(name: "Short Set", theme: nil, presetID: preset)
        #expect(world.catalog.set(short)?.ladder.tiers.count == 3)
        try world.deletePreset(preset)
        #expect(world.catalog.set(short)?.ladder.tiers.count == 3)
    }

    @Test("The default preset cannot change, and a ladder must be valid (C4)")
    func ladderRules() throws {
        var (world, set, aryla, _) = try setup()
        var ladder = try #require(world.catalog.preset(Catalog.defaultLadderID))
        #expect(throws: CardError.defaultPresetLocked) { try world.updatePreset(ladder) }
        #expect(throws: CardError.defaultPresetLocked) { try world.deletePreset(Catalog.defaultLadderID) }

        ladder.tiers = [ladder.tiers[0]]
        #expect(throws: CardError.ladderSize) { try world.updateSetLadder(set, ladder) }

        var renamed = try #require(world.catalog.set(set)?.ladder)
        renamed.tiers[1].name = "common"
        #expect(throws: CardError.duplicateTierName("common")) { try world.updateSetLadder(set, renamed) }

        var badCode = try #require(world.catalog.set(set)?.ladder)
        badCode.tiers[0].code = "TOOLONG"
        #expect(throws: CardError.badTierCode("Common")) { try world.updateSetLadder(set, badCode) }

        // A tier that a card uses cannot be removed.
        let gold = try tier(world, set, 8)
        try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: gold))
        var noGold = try #require(world.catalog.set(set)?.ladder)
        noGold.tiers.removeLast()
        #expect(throws: CardError.tierInUse("Gold")) { try world.updateSetLadder(set, noGold) }

        // A new tier, and a new order.
        var custom = try #require(world.catalog.set(set)?.ladder)
        custom.tiers.append(RarityTier(id: custom.nextTierID, name: "Mythic", code: "M", symbol: .flame, color: .ember))
        custom.tiers.swapAt(0, 1)
        try world.updateSetLadder(set, custom)
        #expect(world.catalog.set(set)?.ladder.tiers.count == 10)
        #expect(world.catalog.set(set)?.ladder.rank(of: 2) == 1)
    }

    @Test("A tier's look is part of the ladder, and the game sets its cost from the look (C15, C17)")
    func tierLooks() throws {
        var (world, set, _, _) = try setup()
        var ladder = try #require(world.catalog.set(set)?.ladder)
        ladder.tiers[0].look = CardLook(layout: .frameBreak, foil: .etched, textured: true, stamp: .signature)
        ladder.tiers[0].frameStyle = .gold
        try world.updateSetLadder(set, ladder)
        let common = try #require(world.catalog.set(set)?.ladder.tiers[0])
        #expect(common.look.foil == .etched)
        let expected = PrintCost.layout(.frameBreak) + PrintCost.foil(.etched) + PrintCost.textured
            + PrintCost.stamp(.signature) + PrintCost.frame(.gold)
        #expect(abs(common.costPerCopy - expected) < 1e-12)
        #expect(CardVersion(id: 1, name: "Plain", look: .plain).costPerCopy == 0)
    }

    @Test("The theme library has the element types and concept themes (C13)")
    func themes() throws {
        var (world, set, _, _) = try setup()
        let library = world.catalog.themes
        #expect(Set(library.map(\.id)).count == library.count)
        #expect(library.filter { $0.group == .elements }.count == ElementType.allCases.count)
        #expect(world.catalog.theme("fire")?.element == .fire)
        #expect(world.catalog.theme("castles")?.group == .history)
        #expect(world.catalog.set(set)?.theme == "feudalism")
        #expect(throws: CardError.unknownTheme("atlantis")) { try world.updateSet(set, name: "Base Set", theme: "atlantis") }
        // Each world rolls its own hidden fits.
        #expect(World(seed: 1, studioName: "A").catalog.themes != World(seed: 2, studioName: "B").catalog.themes)
    }

    @Test("A version 3 save gets the theme library, and an element theme keeps its ID")
    func migrateVersion3() throws {
        var world = World(seed: 9, studioName: "Test")
        try world.createSet(name: "Old", theme: "storm", presetID: Catalog.defaultLadderID)
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var catalog = try #require(json["catalog"] as? [String: Any])
        catalog.removeValue(forKey: "themes")
        json["catalog"] = catalog
        json["version"] = 3
        try World.migrate(&json)
        let migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(migrated == world)
        #expect(migrated.catalog.theme("storm")?.element == .storm)
    }

    @Test("A version 4 save keeps its look: solid frames, plain tiers, and no treatments (C14, C15)")
    func migrateVersion4() throws {
        var (world, set, aryla, _) = try setup()
        let custom = try world.createPreset(copying: Catalog.defaultLadderID, name: "Mine")
        let card = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: try tier(world, set, 8)))

        // Turn the JSON back into version 4: no frame styles, no tier looks, and a treatment list.
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var catalog = try #require(json["catalog"] as? [String: Any])
        func strip(_ ladder: Any?) -> [String: Any] {
            var l = ladder as? [String: Any] ?? [:]
            l["tiers"] = (l["tiers"] as? [[String: Any]] ?? []).map {
                var t = $0
                for key in ["frameStyle", "look"] { t.removeValue(forKey: key) }
                return t
            }
            return l
        }
        catalog["ladderPresets"] = (catalog["ladderPresets"] as? [Any] ?? []).map(strip)
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map { var s = $0; s["ladder"] = strip(s["ladder"]); return s }
        catalog["treatments"] = [["id": 40, "name": "Holo", "finish": "holo", "costPerCopy": 0.02]]
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).map { var c = $0; c["treatment"] = 40; return c }
        json["catalog"] = catalog
        json["version"] = 4

        try World.migrate(&json)
        let migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(migrated.version == World.currentVersion)
        for ladder in [migrated.catalog.set(set)?.ladder, migrated.catalog.preset(custom)] {
            #expect(ladder?.tiers.allSatisfy { $0.frameStyle == .solid && $0.look == .plain && $0.costPerCopy == 0 } == true)
        }
        #expect(migrated.catalog.preset(Catalog.defaultLadderID) == RarityLadder.defaultLadder(id: Catalog.defaultLadderID))
        #expect(migrated.catalog.card(card)?.name == "Aryla")
    }

    @Test("A card has its tier's versions, can turn one off, and can add its own alt art (C16)")
    func versions() throws {
        var (world, set, aryla, _) = try setup()
        let rare = try tier(world, set, 2)
        let tierInfo = try #require(world.catalog.set(set)?.ladder.tier(rare))
        #expect(tierInfo.versions.map(\.name) == ["Reverse holo"])

        // By default the card has the base version and the tier's reverse holo.
        let plain = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: rare))
        let card = try #require(world.catalog.card(plain))
        #expect(tierInfo.versions(excluding: card.excludedVersions, own: card.ownVersions).map(\.key) == [.base, .tier(1)])

        // A card can turn off the reverse holo and add a true alt art.
        var draft = CardDraft(from: card)
        draft.excludedVersions = [1]
        draft.ownVersions = [CardVersion.altArt(id: draft.nextOwnVersionID)]
        try world.updateCard(plain, draft)
        let changed = try #require(world.catalog.card(plain))
        let entries = tierInfo.versions(excluding: changed.excludedVersions, own: changed.ownVersions)
        #expect(entries.map(\.key) == [.base, .own(1)])
        #expect(entries.last?.version.name == "Alt art")
    }

    @Test("Version rules: names are unique next to the tier's versions, and the count is limited (C16)")
    func versionRules() throws {
        var (world, set, aryla, _) = try setup()
        let rare = try tier(world, set, 2)
        var clash = CardDraft(name: "Aryla", characterID: aryla, rarity: rare)
        clash.ownVersions = [CardVersion(id: 1, name: "reverse holo", look: .plain)]
        #expect(throws: CardError.duplicateVersionName("reverse holo")) { try world.createCard(in: set, clash) }

        var unnamed = CardDraft(name: "Aryla", characterID: aryla, rarity: rare)
        unnamed.ownVersions = [CardVersion(id: 1, name: " ", look: .plain)]
        #expect(throws: CardError.emptyVersionName) { try world.createCard(in: set, unnamed) }

        var many = CardDraft(name: "Aryla", characterID: aryla, rarity: rare)
        many.ownVersions = (1...(CardVersion.ownLimit + 1)).map { CardVersion(id: $0, name: "V\($0)", look: .plain) }
        #expect(throws: CardError.tooManyVersions) { try world.createCard(in: set, many) }

        // A stale excluded version is dropped when the card saves.
        var stale = CardDraft(name: "Aryla", characterID: aryla, rarity: try tier(world, set, 8))
        stale.excludedVersions = [1]
        let id = try world.createCard(in: set, stale)
        #expect(world.catalog.card(id)?.excludedVersions == [])
    }

    @Test("A version 6 save gets no extra versions, so its cards do not change (C16)")
    func migrateVersion6() throws {
        var (world, set, aryla, _) = try setup()
        let card = try world.createCard(in: set, CardDraft(name: "Aryla", characterID: aryla, rarity: try tier(world, set, 0)))
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var catalog = try #require(json["catalog"] as? [String: Any])
        func strip(_ ladder: Any?) -> [String: Any] {
            var l = ladder as? [String: Any] ?? [:]
            l["tiers"] = (l["tiers"] as? [[String: Any]] ?? []).map { var t = $0; t.removeValue(forKey: "versions"); return t }
            return l
        }
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map { var s = $0; s["ladder"] = strip(s["ladder"]); return s }
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).map {
            var c = $0
            c.removeValue(forKey: "excludedVersions")
            c.removeValue(forKey: "ownVersions")
            return c
        }
        json["catalog"] = catalog
        json["version"] = 6
        try World.migrate(&json)
        let migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(migrated.catalog.set(set)?.ladder.tiers.allSatisfy { $0.versions.isEmpty } == true)
        #expect(migrated.catalog.card(card)?.ownVersions == [])
        #expect(migrated.catalog.preset(Catalog.defaultLadderID) == RarityLadder.defaultLadder(id: Catalog.defaultLadderID))
    }

    @Test("Set names are unique")
    func setNames() throws {
        var (world, _, _, _) = try setup()
        #expect(throws: CardError.duplicateSetName("base set")) { try world.createSet(name: "base set", theme: nil, presetID: Catalog.defaultLadderID) }
    }

    @Test("A version 2 save gets the default catalog")
    func migrateVersion2() throws {
        var world = World(seed: 5, studioName: "Test")
        try world.createCharacter(CharacterDraft(name: "Aryla"))
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        json.removeValue(forKey: "catalog")
        json["version"] = 2
        try World.migrate(&json)
        let migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(migrated == world)
    }
}
