import Foundation
import Testing
@testable import SimCore

@Suite("Save round trip and sample world")
struct SaveTests {
    private func roundTrip(_ world: World) throws -> World {
        let data = try JSONEncoder().encode(world)
        return try JSONDecoder().decode(World.self, from: data)
    }

    @Test("A new world has the current version")
    func version() {
        let world = World(seed: 1, studioName: "Test")
        #expect(world.version == World.currentVersion)
        #expect(World.currentVersion == 11)
    }

    @Test("A new world survives an encode and decode")
    func newWorld() throws {
        let (world, _) = try Fixture.world()
        #expect(try roundTrip(world) == world)
    }

    @Test("A world with forms, links, and lore survives an encode and decode")
    func richWorld() throws {
        var (world, mascot) = try Fixture.world()
        let ally = try world.createCharacter(CharacterDraft(name: "Ally", companions: [mascot]))
        try world.createCharacter(CharacterDraft(name: "Evo", evolvesFrom: ally))
        try world.createForm(of: mascot, CharacterDraft(name: "Aryla Dark"))
        try world.generateCharacters(count: 3)
        let race = try world.createRace(name: "Elves", emblem: .bolt, color: .lime)
        let group = try world.createFaction(name: "Crown", kind: .kingdom, tone: .noble, emblem: .bolt, color: .gold)
        try world.setLore(mascot, race: race, faction: group)
        let rival = try world.createFaction(name: "Horde", kind: .tribe, tone: .wild, emblem: .bolt, color: .crimson)
        try world.setRelation(group, rival, to: -70)
        let loaded = try roundTrip(world)
        #expect(loaded == world)
        #expect(loaded.character(mascot)?.raceID == race)
    }

    @Test("A released world with sales survives an encode and decode")
    func releasedWorld() throws {
        let (world, _, _) = try Fixture.released()
        #expect(try roundTrip(world) == world)
    }

    @Test("A loaded world continues exactly like the saved world")
    func continues() throws {
        var (world, set, _) = try Fixture.released()
        var loaded = try roundTrip(world)
        for _ in 0..<3 {
            world.advanceWeek()
            loaded.advanceWeek()
        }
        #expect(loaded == world)
        #expect(loaded.catalog.set(set)?.status == .released)
    }

    @Test("A world without the optional parts reads as the start values")
    func missingParts() throws {
        var (world, _) = try Fixture.world()
        world.marketState = nil
        world.businessState = nil
        world.talentState = nil
        world.loreState = nil
        let loaded = try roundTrip(world)
        #expect(loaded == world)
        #expect(loaded.lore.races.isEmpty)
        #expect(loaded.business.closedWeek == nil)
    }

    @Test("Migration leaves a current world unchanged and rejects data with no version")
    func migrateCurrent() throws {
        let (world, _) = try Fixture.world()
        let data = try JSONEncoder().encode(world)
        var object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let before = object as NSDictionary
        try World.migrate(&object)
        #expect((object as NSDictionary).isEqual(before))

        var empty: [String: Any] = [:]
        #expect(throws: World.MigrationError.notAWorld) { try World.migrate(&empty) }
    }

    @Test("The sample world repeats for a seed and builds the documented cast")
    func sample() throws {
        let world = World.sample(seed: 42)
        #expect(world == World.sample(seed: 42))
        #expect(world != World.sample(seed: 43))
        #expect(world.characters.count == 20)
        let emberax = try #require(world.characters.first { $0.name == "Emberax" })
        #expect(world.stage(of: emberax.id) == 2)
        let pipkit = try #require(world.characters.first { $0.name == "Pipkit" })
        #expect(pipkit.forms.count == 1)
        let mara = try #require(world.characters.first { $0.name == "Mara" })
        #expect(mara.kind == .person)
        #expect(world.characters.filter { $0.origin == .generated }.count == 12)
        #expect(world.catalog.sets.count == 1)
    }

    @Test("Preview exposure stays in range and changes no truth")
    func exposure() throws {
        let (plain, _) = try Fixture.world()
        var world = plain
        world.applyPreviewExposure()
        let c = try #require(world.characters.first)
        #expect(c.buzz >= 0 && c.buzz <= 80)
        #expect(c.fatigue >= 0 && c.fatigue <= 40)
        #expect(c.awareness.values.allSatisfy { $0 >= 0 && $0 <= 1 })
        #expect(c.truth == plain.characters[0].truth)
        #expect(c.name == plain.characters[0].name)
    }

    @Test("A sample world survives an encode and decode")
    func sampleRoundTrip() throws {
        let world = World.sample(seed: 42)
        #expect(try roundTrip(world) == world)
    }
}
