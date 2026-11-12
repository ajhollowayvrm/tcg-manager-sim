import Foundation
import Testing
@testable import SimCore

@Suite("Eras")
struct EraTests {
    let doubleRare: TierID = 5

    func tera(home: TierID? = 5) -> Gimmick {
        Gimmick(name: "Tera", color: .crimson, mark: .logo, nameBar: NameBarStyle(shape: .banner, color: .charcoal),
                frameColor: .crimson, homeTierID: home)
    }

    @Test("The Base era keeps the look of today's cards (eras.md, section 7)")
    func baseEra() {
        let world = World(seed: 1, studioName: "Test")
        let base = world.catalog.currentEra
        #expect(base.code == "BS")
        #expect(base.nameBar == .classic)
        #expect(base.ladderPresetID == Catalog.defaultLadderID)
        #expect(base.packPresetID == Catalog.defaultPackID)
    }

    @Test("The era designer starts an era with a code, a name bar, a gimmick, and presets (E1 to E5)")
    func startEra() throws {
        var world = World(seed: 2, studioName: "Test")
        let bar = NameBarStyle(shape: .square, color: .cream)
        let id = try world.startEra(EraDraft(name: "Scarlet Tide", code: "st", nameBar: bar, gimmick: tera()))
        let era = try #require(world.catalog.era(id))
        #expect(era.code == "ST")
        #expect(era.nameBar == bar)
        #expect(era.gimmick?.mark == .logo)
        #expect(era.gimmick?.homeTierID == doubleRare)
        #expect(world.catalog.era(1)?.endWeek != nil)
        #expect(world.catalog.currentEra.id == id)
        // The world survives a JSON round trip with the new fields.
        #expect(try roundTrip(world) == world)
    }

    @Test("Era rules: the code, a unique code, the presets, and the home tier")
    func rules() throws {
        var world = World(seed: 3, studioName: "Test")
        #expect(throws: CardError.badEraCode) { try world.startEra(EraDraft(name: "A", code: "S")) }
        #expect(throws: CardError.badEraCode) { try world.startEra(EraDraft(name: "A", code: "S1")) }
        #expect(throws: CardError.duplicateEraCode("BS")) { try world.startEra(EraDraft(name: "A", code: "bs")) }
        #expect(throws: CardError.unknownPack(999)) { try world.startEra(EraDraft(name: "A", code: "AA", packPresetID: 999)) }
        #expect(throws: CardError.badHomeTier) { try world.startEra(EraDraft(name: "A", code: "AA", gimmick: tera(home: 999))) }
        // A failed start changes nothing.
        #expect(world.catalog.eras.count == 1)
        // The code suggestion skips a taken code.
        #expect(world.catalog.suggestedEraCode(for: "Base Story") != "BS")
        #expect(world.catalog.suggestedEraCode(for: "Scarlet Violet") == "SV")
    }

    @Test("Series numbers: main sets count up, a mini set takes .5, and a pair takes one number with a letter (E6, E8)")
    func seriesNumbers() throws {
        var world = World(seed: 4, studioName: "Test")
        let era = try world.startEra(EraDraft(name: "Scarlet Violet", code: "SV"))
        func make(_ type: SetType, _ name: String, _ code: String) throws -> SetID {
            try world.createSet(type, SetDetails(name: name, code: code, size: 20), presetID: Catalog.defaultLadderID)
        }
        let early = try make(.mini, "Early", "EAR")
        let one = try make(.main, "One", "ONE")
        let two = try make(.main, "Two", "TWO")
        let mini = try make(.mini, "Fable", "FAB")
        let second = try make(.mini, "Fates", "FAT")
        let (a, b) = try world.createParallelPair(
            SetDetails(name: "Black", code: "BLK", size: 20), SetDetails(name: "White", code: "WHT", size: 20),
            presetID: Catalog.defaultLadderID
        )
        let numbers = world.catalog.seriesNumbers(in: era)
        #expect(numbers[early] == "SV0.5")
        #expect(numbers[one] == "SV1")
        #expect(numbers[two] == "SV2")
        #expect(numbers[mini] == "SV2.5")
        #expect(numbers[second] == "SV2.6")
        #expect(numbers[a] == "SV3a")
        #expect(numbers[b] == "SV3b")
        #expect(world.catalog.seriesNumber(of: two) == "SV2")
        // A set of the Base era numbers in the Base era.
        #expect(world.catalog.seriesNumbers(in: 1).isEmpty)
    }

    @Test("The home tier matches a set's ladder by ID, then by name (E5, S6)")
    func homeTier() throws {
        var world = World(seed: 5, studioName: "Test")
        try world.startEra(EraDraft(name: "Tera", code: "TE", gimmick: tera()))
        let set = try world.createSet(name: "First", theme: nil, presetID: Catalog.defaultLadderID)
        #expect(world.catalog.homeTier(of: set) == doubleRare)

        // A ladder preset without the Double Rare gives no home tier.
        let custom = try world.createPreset(copying: Catalog.defaultLadderID, name: "No DR")
        var ladder = try #require(world.catalog.preset(custom))
        ladder.tiers.removeAll { $0.id == doubleRare }
        try world.updatePreset(ladder)
        let other = try world.createSet(.main, SetDetails(name: "Second", code: "SEC"), presetID: custom)
        #expect(world.catalog.homeTier(of: other) == nil)
    }

    @Test("A deleted preset sends the era back to the default preset (eras.md, section 4)")
    func deletedPresets() throws {
        var world = World(seed: 6, studioName: "Test")
        let ladder = try world.createPreset(copying: Catalog.defaultLadderID, name: "Mine")
        let pack = try world.createPackPreset(copying: Catalog.defaultPackID, name: "Mine")
        let era = try world.startEra(EraDraft(name: "Mine", code: "MI", gimmick: tera(), ladderPresetID: ladder, packPresetID: pack))
        try world.deletePreset(ladder)
        try world.deletePackPreset(pack)
        let saved = try #require(world.catalog.era(era))
        #expect(saved.ladderPresetID == Catalog.defaultLadderID)
        #expect(saved.packPresetID == Catalog.defaultPackID)
        // The home tier matches the default ladder's Double Rare by name.
        #expect(saved.gimmick?.homeTierID == doubleRare)
    }
}
