import Testing
@testable import SimCore

@Suite("The week step for characters")
struct WeekTests {
    private func world() throws -> (world: World, id: CharacterID) {
        var world = World(seed: 33, studioName: "Test")
        let id = try world.createCharacter(CharacterDraft(name: "Hero"))
        return (world, id)
    }

    @Test("Buzz, fatigue, and awareness fade each week (D9)")
    func decay() throws {
        var (world, id) = try world()
        world.characters[0].buzz = 80
        world.characters[0].fatigue = 50
        world.characters[0].awareness[.kids] = 0.5
        world.advanceWeek()
        let c = try #require(world.character(id))
        #expect(world.week == 1)
        #expect(abs(c.buzz - 68) < 1e-9)
        #expect(abs(c.fatigue - 46.5) < 1e-9)
        #expect(abs(c.awareness[.kids] - 0.499) < 1e-9)
    }

    @Test("A form's buzz lifts its character's buzz to half of it, then both fade (R23)")
    func formLift() throws {
        var (world, id) = try world()
        try world.createForm(of: id, CharacterDraft(name: "Mega"))
        world.characters[0].forms[0].buzz = 80
        world.advanceWeek()
        let c = try #require(world.character(id))
        let expectedBuzz = World.formBuzzLift * 80 * 0.85
        #expect(abs(c.buzz - expectedBuzz) < 1e-9)
        #expect(abs(c.forms[0].buzz - 68) < 1e-9)
    }

    @Test("A form's buzz never lowers a higher character buzz")
    func liftIsFloor() throws {
        var (world, id) = try world()
        try world.createForm(of: id, CharacterDraft(name: "Mega"))
        world.characters[0].buzz = 90
        world.characters[0].forms[0].buzz = 10
        world.advanceWeek()
        let c = try #require(world.character(id))
        #expect(abs(c.buzz - 76.5) < 1e-9)
    }

    @Test("Fade keeps a retired character's data, and weeks repeat for a seed")
    func determinism() throws {
        var (a, idA) = try world()
        var (b, _) = try world()
        try a.retire(idA)
        try b.retire(idA)
        for _ in 0..<5 {
            a.advanceWeek()
            b.advanceWeek()
        }
        #expect(a == b)
        #expect(a.week == 5)
        #expect(a.character(idA)?.status == .retired)
    }

    @Test("A closed studio does not move on (K4)")
    func closedStudio() throws {
        var (world, id) = try world()
        world.characters[0].buzz = 80
        world.businessState?.closedWeek = 0
        #expect(world.isClosed)
        let before = world
        world.advanceWeek()
        #expect(world == before)
        #expect(world.character(id)?.buzz == 80)
    }

    @Test("A different seed gives a different world")
    func seedChanges() throws {
        let a = try Fixture.world(seed: 1)
        let b = try Fixture.world(seed: 2)
        #expect(a.world != b.world)
        let hidden = a.world.characters[0].truth.randomPart != b.world.characters[0].truth.randomPart
        #expect(hidden)
    }
}
