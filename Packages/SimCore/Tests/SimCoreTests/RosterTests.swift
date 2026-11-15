import Testing
@testable import SimCore

fileprivate func roster(_ body: () throws -> Void) -> RosterError? {
    do { try body() } catch { return error as? RosterError }
    return nil
}

fileprivate func named(_ name: String) -> CharacterDraft {
    CharacterDraft(name: name)
}

@Suite("Roster")
struct RosterTests {
    private func base() -> World { World(seed: 5, studioName: "Test") }

    @Test("Creating a character costs no week and no money (R5, R11)")
    func creationIsFree() throws {
        var world = base()
        let cash = world.business.cash
        let id = try world.createCharacter(named("Ash"))
        #expect(world.week == 0)
        #expect(world.business.cash == cash)
        #expect(world.character(id)?.createdWeek == 0)
        #expect(world.characters.count == 1)
    }

    @Test("A name is trimmed, required, at most 24 characters, and unique without case (R2)")
    func nameRules() throws {
        var world = base()
        let id = try world.createCharacter(named("  Pip  "))
        #expect(world.character(id)?.name == "Pip")
        #expect(roster { try world.createCharacter(named("   ")) } == .emptyName)
        #expect(roster { try world.createCharacter(named(String(repeating: "a", count: 25))) } == .nameTooLong)
        #expect(roster { try world.createCharacter(named(String(repeating: "b", count: 24))) } == nil)
        #expect(roster { try world.createCharacter(named("PIP")) } == .duplicateName("PIP"))
    }

    @Test("The palette has two or three different colors, and the second type differs (R1)")
    func feelRules() {
        var world = base()
        var draft = named("Rule")
        draft.palette = [.crimson]
        #expect(roster { try world.createCharacter(draft) } == .paletteSize)
        draft.palette = [.crimson, .gold, .lime, .teal]
        #expect(roster { try world.createCharacter(draft) } == .paletteSize)
        draft.palette = [.crimson, .crimson]
        #expect(roster { try world.createCharacter(draft) } == .duplicateColor)
        draft.palette = [.crimson, .gold, .lime]
        #expect(roster { try world.createCharacter(draft) } == nil)
        draft.name = "Rule2"
        draft.secondaryType = draft.primaryType
        #expect(roster { try world.createCharacter(draft) } == .sameTypeTwice)
    }

    @Test("A failed creation changes nothing")
    func failureKeepsWorld() {
        var world = base()
        let before = world
        _ = roster { try world.createCharacter(named("")) }
        #expect(world == before)
    }

    @Test("Every roster error has a message")
    func messages() {
        let errors: [RosterError] = [.emptyName, .nameTooLong, .duplicateName("X"), .paletteSize, .duplicateColor,
                                     .sameTypeTwice, .unknownCharacter(1), .linkToSelf, .lineTooLong, .lineLoop, .unknownForm(1)]
        #expect(errors.allSatisfy { !$0.message.isEmpty })
    }

    @Test("A link to an unknown character is an error, and a link to self is an error")
    func linkErrors() throws {
        var world = base()
        let a = try world.createCharacter(named("A"))
        var draft = named("B")
        draft.rivals = [99]
        #expect(roster { try world.createCharacter(draft) } == .unknownCharacter(99))
        var edit = CharacterDraft(from: try #require(world.character(a)))
        edit.companions = [a]
        #expect(roster { try world.redesign(a, edit) } == .linkToSelf)
        #expect(roster { try world.redesign(99, edit) } == .unknownCharacter(99))
    }

    @Test("A counterpart is one partner on both sides, and a new partner frees the old one")
    func counterpart() throws {
        var world = base()
        let a = try world.createCharacter(named("A"))
        var draftB = named("B")
        draftB.counterpart = a
        let b = try world.createCharacter(draftB)
        #expect(world.character(a)?.counterpart == b)
        #expect(world.character(b)?.counterpart == a)

        var draftC = named("C")
        draftC.counterpart = a
        let c = try world.createCharacter(draftC)
        #expect(world.character(a)?.counterpart == c)
        #expect(world.character(c)?.counterpart == a)
        #expect(world.character(b)?.counterpart == nil)

        var clear = CharacterDraft(from: try #require(world.character(c)))
        clear.counterpart = nil
        try world.redesign(c, clear)
        #expect(world.character(a)?.counterpart == nil)
    }

    @Test("Rivals and companions stay symmetric, and removing a link removes both sides")
    func symmetricLinks() throws {
        var world = base()
        let a = try world.createCharacter(named("A"))
        var draftB = named("B")
        draftB.rivals = [a, a]
        draftB.companions = [a]
        let b = try world.createCharacter(draftB)
        #expect(world.character(b)?.rivals == [a])
        #expect(world.character(a)?.rivals == [b])
        #expect(world.character(a)?.companions == [b])

        var edit = CharacterDraft(from: try #require(world.character(b)))
        edit.rivals = []
        try world.redesign(b, edit)
        #expect(world.character(a)?.rivals == [])
        #expect(world.character(a)?.companions == [b])
        let linksHold = world.characters.allSatisfy { c in
            c.rivals.allSatisfy { world.character($0)?.rivals.contains(c.id) == true }
        }
        #expect(linksHold)
    }

    private func line(_ world: inout World, _ count: Int) throws -> [CharacterID] {
        var ids: [CharacterID] = []
        for i in 0..<count {
            var d = named("Stage\(i)")
            d.evolvesFrom = ids.last
            ids.append(try world.createCharacter(d))
        }
        return ids
    }

    @Test("An evolution line has at most three stages")
    func lineLength() throws {
        var world = base()
        let ids = try line(&world, 3)
        #expect(world.stage(of: ids[0]) == 1)
        #expect(world.stage(of: ids[2]) == 3)
        #expect(world.nextStages(of: ids[0]).map(\.id) == [ids[1]])
        var fourth = named("Stage3")
        fourth.evolvesFrom = ids[2]
        #expect(roster { try world.createCharacter(fourth) } == .lineTooLong)
    }

    @Test("A branch counts, and a move that makes a long line is an error")
    func lineMoves() throws {
        var world = base()
        let ids = try line(&world, 3)
        let loose = try world.createCharacter(named("Loose"))
        var edit = CharacterDraft(from: try #require(world.character(ids[0])))
        edit.evolvesFrom = loose
        #expect(roster { try world.redesign(ids[0], edit) } == .lineTooLong)
        var sibling = named("Sibling")
        sibling.evolvesFrom = ids[0]
        #expect(roster { try world.createCharacter(sibling) } == nil)
        #expect(world.nextStages(of: ids[0]).count == 2)
    }

    @Test("An evolution loop is an error, and a loop in bad data still ends")
    func lineLoops() throws {
        var world = base()
        let ids = try line(&world, 2)
        var edit = CharacterDraft(from: try #require(world.character(ids[0])))
        edit.evolvesFrom = ids[1]
        #expect(roster { try world.redesign(ids[0], edit) } == .lineLoop)

        world.characters[0].evolvesFrom = ids[1]
        #expect(world.stage(of: ids[0]) >= 1)
        #expect(world.descendantDepth(of: ids[0]) >= 0)
    }

    @Test("Feel change counts type, archetype, role, and palette, and stops at 1")
    func feelChange() {
        let old = CharacterDraft(name: "A", role: .companion, primaryType: .fire, archetype: .cute, palette: [.ember, .sunflower])
        var new = old
        #expect(World.feelChange(from: old, to: new) == 0)
        new.primaryType = .water
        #expect(abs(World.feelChange(from: old, to: new) - 0.3) < 1e-9)
        new.secondaryType = .ice
        #expect(abs(World.feelChange(from: old, to: new) - 0.4) < 1e-9)
        new.archetype = .cool
        new.role = .mascot
        new.palette = [.lime, .forest]
        let full = World.feelChange(from: old, to: new)
        #expect(abs(full - 1.0) < 1e-9)
        new.palette = [.ember, .lime]
        let half = World.feelChange(from: old, to: new)
        #expect(half < full)
    }

    @Test("A redesign costs affection in proportion to the change (R9)")
    func redesignCost() throws {
        var world = base()
        let id = try world.createCharacter(CharacterDraft(name: "A", palette: [.ember, .sunflower]))
        let old = try #require(world.character(id))

        var rename = CharacterDraft(from: old)
        rename.name = "A2"
        try world.redesign(id, rename)
        #expect(world.character(id)?.truth.affection == AudienceValues())

        var small = CharacterDraft(from: try #require(world.character(id)))
        small.primaryType = .water
        try world.redesign(id, small)
        let kids = try #require(world.character(id)).truth.affection[.kids]
        #expect(abs(kids + World.redesignCost * 0.3) < 1e-9)
        #expect(world.character(id)?.truth.affection[.resellers] == 0)
    }

    @Test("A new look adds 0.1 to the change, and the cost is capped at the full cost (R9)")
    func redesignLook() throws {
        var world = base()
        let id = try world.createCharacter(named("A"))
        var look = CharacterDraft(from: try #require(world.character(id)))
        look.body.shape = .tall
        try world.redesign(id, look)
        let kids = try #require(world.character(id)).truth.affection[.kids]
        #expect(abs(kids + World.redesignCost * 0.1) < 1e-9)

        var all = CharacterDraft(from: try #require(world.character(id)))
        all.primaryType = .light
        all.archetype = .elegant
        all.role = .legendary
        all.palette = [.violet, .plum, .rose]
        all.body.tail = .fin
        try world.redesign(id, all)
        let after = try #require(world.character(id)).truth.affection[.kids]
        #expect(abs(after - kids + World.redesignCost) < 1e-9)
    }

    @Test("A redesign keeps the character's own name free, and a failed redesign costs nothing")
    func redesignChecks() throws {
        var world = base()
        let a = try world.createCharacter(named("A"))
        _ = try world.createCharacter(named("B"))
        var same = CharacterDraft(from: try #require(world.character(a)))
        #expect(roster { try world.redesign(a, same) } == nil)
        same.name = "b"
        let before = world
        #expect(roster { try world.redesign(a, same) } == .duplicateName("b"))
        #expect(world == before)
    }

    @Test("A switch between creature and person keeps the old look, and forms follow the kind (R14)")
    func kindSwitch() throws {
        var world = base()
        let id = try world.createCharacter(named("A"))
        let formID = try world.createForm(of: id, named("A Form"))
        #expect(world.character(id)?.forms.first?.person == nil)
        let body = try #require(world.character(id)).body

        var person = CharacterDraft(from: try #require(world.character(id)))
        person.kind = .person
        try world.redesign(id, person)
        #expect(world.character(id)?.kind == .person)
        #expect(world.character(id)?.forms.first?.person != nil)

        var back = CharacterDraft(from: try #require(world.character(id)))
        back.kind = .creature
        try world.redesign(id, back)
        #expect(world.character(id)?.kind == .creature)
        #expect(world.character(id)?.body == body)
        #expect(world.character(id)?.form(formID)?.person == nil)
    }

    @Test("A retired character keeps its status until restore, and its appeal stays (R10)")
    func retireRestore() throws {
        var (world, id) = try Fixture.world()
        let appeal = world.character(id)?.trueAppeal(.kids, fits: world.fits)
        try world.retire(id)
        #expect(world.character(id)?.status == .retired)
        world.advanceWeek()
        #expect(world.character(id)?.status == .retired)
        #expect(world.character(id)?.trueAppeal(.kids, fits: world.fits) == appeal)
        try world.restore(id)
        #expect(world.character(id)?.status == .active)
        #expect(roster { try world.retire(99) } == .unknownCharacter(99))
        #expect(roster { try world.restore(99) } == .unknownCharacter(99))
    }

    @Test("Characters and forms share one ID counter (R23)")
    func sharedIDs() throws {
        var world = base()
        let a = try world.createCharacter(named("A"))
        let form = try world.createForm(of: a, named("A Form"))
        let b = try world.createCharacter(named("B"))
        #expect(Set([a, form, b]).count == 3)
        #expect(form == a + 1)
        #expect(b == form + 1)
    }
}
