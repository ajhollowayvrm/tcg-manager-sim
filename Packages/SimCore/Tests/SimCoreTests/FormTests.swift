import Testing
@testable import SimCore

fileprivate func roster(_ body: () throws -> Void) -> RosterError? {
    do { try body() } catch { return error as? RosterError }
    return nil
}

@Suite("Forms and generated characters")
struct FormTests {
    private func world() throws -> (world: World, id: CharacterID) {
        var world = World(seed: 12, studioName: "Test")
        let id = try world.createCharacter(CharacterDraft(name: "Base"))
        return (world, id)
    }

    @Test("A form lives inside its character, costs nothing, and starts with no buzz (R7, R11, R23)")
    func createForm() throws {
        var (world, id) = try world()
        let formID = try world.createForm(of: id, CharacterDraft(name: "Mega", role: .legendary))
        #expect(world.characters.count == 1)
        #expect(world.forms(of: id).map(\.id) == [formID])
        let form = try #require(world.forms(of: id).first)
        #expect(form.buzz == 0)
        #expect(form.role == .legendary)
        #expect(form.createdWeek == 0)
        #expect(form.appealShift[.resellers] == 0)
        #expect(world.business.cash == World(seed: 12, studioName: "Test").business.cash)
    }

    @Test("A form name must be unique across characters and forms, and the checks match a character's")
    func formChecks() throws {
        var (world, id) = try world()
        _ = try world.createForm(of: id, CharacterDraft(name: "Mega"))
        #expect(roster { try world.createForm(of: id, CharacterDraft(name: "base")) } == .duplicateName("base"))
        #expect(roster { try world.createForm(of: id, CharacterDraft(name: "MEGA")) } == .duplicateName("MEGA"))
        #expect(roster { try world.createForm(of: id, CharacterDraft(name: " ")) } == .emptyName)
        #expect(roster { try world.createForm(of: 99, CharacterDraft(name: "X")) } == .unknownCharacter(99))
        var bad = CharacterDraft(name: "Odd")
        bad.palette = [.ember]
        #expect(roster { try world.createForm(of: id, bad) } == .paletteSize)
    }

    @Test("A form's shift repeats for a seed and differs between forms (R23)")
    func formShift() throws {
        var (a, idA) = try world()
        var (b, idB) = try world()
        try a.createForm(of: idA, CharacterDraft(name: "One"))
        try b.createForm(of: idB, CharacterDraft(name: "One"))
        #expect(a == b)
        try a.createForm(of: idA, CharacterDraft(name: "Two"))
        let forms = a.forms(of: idA)
        #expect(forms[0].appealShift != forms[1].appealShift)
    }

    @Test("A form of a person character has a person look, and of a creature has none (R14)")
    func formKind() throws {
        var (world, mascot) = try Fixture.world()
        let formID = try world.createForm(of: mascot, CharacterDraft(name: "Aryla Dark", kind: .person))
        #expect(world.character(mascot)?.form(formID)?.kind == .person)
        var (other, id) = try self.world()
        let creatureForm = try other.createForm(of: id, CharacterDraft(name: "Mega", kind: .person))
        #expect(other.character(id)?.form(creatureForm)?.person == nil)
    }

    @Test("A form redesign costs half of the matching character redesign (R9, R23)")
    func formRedesign() throws {
        var (world, id) = try world()
        let formID = try world.createForm(of: id, CharacterDraft(name: "Mega"))
        var edit = CharacterDraft(from: try #require(world.forms(of: id).first))
        edit.primaryType = .water
        try world.redesignForm(formID, of: id, edit)
        let kids = try #require(world.character(id)).truth.affection[.kids]
        let expected = -(World.redesignCost * World.formRedesignShare * 0.3)
        #expect(abs(kids - expected) < 1e-9)
        #expect(world.forms(of: id).first?.primaryType == .water)
        #expect(world.character(id)?.truth.affection[.resellers] == 0)
    }

    @Test("A new form look adds 0.1 to the form change, and a rename is free (R9)")
    func formRedesignLook() throws {
        var (world, id) = try world()
        let formID = try world.createForm(of: id, CharacterDraft(name: "Mega"))
        var rename = CharacterDraft(from: try #require(world.forms(of: id).first))
        rename.name = "Mega 2"
        try world.redesignForm(formID, of: id, rename)
        #expect(world.character(id)?.truth.affection == AudienceValues())

        var look = rename
        look.body.shape = .tall
        try world.redesignForm(formID, of: id, look)
        let kids = try #require(world.character(id)).truth.affection[.kids]
        #expect(abs(kids + World.redesignCost * World.formRedesignShare * 0.1) < 1e-9)
    }

    @Test("A form redesign fails for an unknown form or character")
    func formRedesignErrors() throws {
        var (world, id) = try world()
        let draft = CharacterDraft(name: "Mega")
        #expect(roster { try world.redesignForm(50, of: id, draft) } == .unknownForm(50))
        #expect(roster { try world.redesignForm(50, of: 99, draft) } == .unknownCharacter(99))
    }

    @Test("Generated characters are creatures with unique names and valid feel (R6, R13)")
    func generated() throws {
        var world = World(seed: 90, studioName: "Test")
        let ids = try world.generateCharacters(count: 30)
        #expect(ids.count == 30)
        #expect(world.characters.allSatisfy { $0.origin == .generated && $0.kind == .creature })
        let names = Set(world.characters.map { $0.name.lowercased() })
        #expect(names.count == 30)
        let colorsOK = world.characters.allSatisfy { c in
            CharacterDraft.paletteRange.contains(c.palette.count) && Set(c.palette).count == c.palette.count
        }
        let typesOK = world.characters.allSatisfy { $0.secondaryType != $0.primaryType }
        #expect(colorsOK)
        #expect(typesOK)
    }

    @Test("Generated characters repeat for a seed and avoid names on the roster (R13)")
    func generatedSeed() throws {
        var a = World(seed: 91, studioName: "Test")
        var b = World(seed: 91, studioName: "Test")
        try a.generateCharacters(count: 5)
        try b.generateCharacters(count: 5)
        #expect(a == b)
        let taken = a.takenNames()
        try a.generateCharacters(count: 5)
        let fresh = a.characters.suffix(5).map { $0.name.lowercased() }
        #expect(fresh.allSatisfy { !taken.contains($0) })
    }

    @Test("Generating zero characters changes nothing, and generating draws only from the generator stream")
    func generatedStreams() throws {
        var world = World(seed: 92, studioName: "Test")
        let before = world
        let none = try world.generateCharacters(count: 0)
        #expect(none.isEmpty)
        #expect(world == before)
        let draft = world.generatedDraft(kind: .person, taken: [])
        #expect(draft.kind == .person)
        let roleOK = [Role.trainer, .rival, .villain, .companion].contains(draft.role)
        #expect(roleOK)
    }
}
