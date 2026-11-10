import Foundation
import Testing
@testable import SimCore

@Suite("Roster")
struct RosterTests {
    func draft(_ name: String, role: Role = .companion, type: ElementType = .fire) -> CharacterDraft {
        CharacterDraft(name: name, role: role, primaryType: type, archetype: .cute, palette: [.ember, .gold])
    }

    @Test("A new character starts unknown: zero awareness, zero buzz (R5)")
    func newCharacterIsUnknown() throws {
        var world = World(seed: 1, studioName: "Test")
        let id = try world.createCharacter(draft("Ember"))
        let c = try #require(world.character(id))
        for audience in Audience.allCases {
            #expect(c.awareness[audience] == 0)
            #expect(c.popularity(audience, fits: world.fits) == 0)
        }
        #expect(c.buzz == 0)
        #expect(c.origin == .created)
    }

    @Test("True appeal stays in -50...100 for every character and audience")
    func appealBounds() {
        let world = World.sample(seed: 3)
        for c in world.characters {
            for audience in Audience.allCases {
                let value = c.trueAppeal(audience, fits: world.fits)
                #expect(Character.appealRange.contains(value))
            }
        }
    }

    @Test("A reading is pure, and it always contains the truth")
    func readingIsPureAndHonest() {
        let world = World.sample(seed: 5)
        for c in world.characters {
            for audience in Audience.allCases {
                let first = c.reading(audience, fits: world.fits)
                let second = c.reading(audience, fits: world.fits)
                #expect(first == second)
                let truth = c.trueAppeal(audience, fits: world.fits)
                #expect(first.low <= truth + 1e-9 && truth <= first.high + 1e-9)
            }
        }
    }

    @Test("Reading a character does not change the world")
    func readingDoesNotMoveTheWorld() throws {
        var world = World(seed: 9, studioName: "Test")
        try world.createCharacter(draft("A"))
        let before = world
        for c in world.characters {
            for audience in Audience.allCases { _ = c.reading(audience, fits: world.fits) }
        }
        #expect(world == before)
    }

    @Test("More knowledge gives a narrower reading")
    func knowledgeNarrows() throws {
        var world = World(seed: 11, studioName: "Test")
        let id = try world.createCharacter(draft("A"))
        let i = try #require(world.index(of: id))
        let wide = world.characters[i].reading(.kids, fits: world.fits)
        world.characters[i].knowledge[.kids] = 0.9
        let narrow = world.characters[i].reading(.kids, fits: world.fits)
        #expect(narrow.high - narrow.low < wide.high - wide.low)
    }

    @Test("The same seed and decisions give the same world")
    func worldDeterminism() throws {
        func build() throws -> World {
            var world = World(seed: 77, studioName: "Test")
            let a = try world.createCharacter(draft("A"))
            try world.generateCharacters(count: 15)
            try world.createForm(of: a, draft("Mega A"))
            world.advanceWeek()
            return world
        }
        #expect(try build() == build())
    }

    @Test("Generated characters have unique names and the generated origin (R13)")
    func generated() throws {
        var world = World(seed: 21, studioName: "Test")
        let ids = try world.generateCharacters(count: 60)
        #expect(ids.count == 60)
        let names = world.characters.map { $0.name.lowercased() }
        #expect(Set(names).count == names.count)
        #expect(world.characters.allSatisfy { $0.origin == .generated })
        #expect(world.characters.allSatisfy { (2...3).contains($0.palette.count) })
    }

    @Test("A form shares its character's popularity (R23)")
    func formSharesPopularity() throws {
        var world = World(seed: 31, studioName: "Test")
        let base = try world.createCharacter(draft("Base"))
        let formID = try world.createForm(of: base, draft("Mega Base"))
        #expect(world.characters.count == 1)
        let i = try #require(world.index(of: base))
        let form = try #require(world.characters[i].form(formID))
        #expect(world.forms(of: base).map(\.id) == [formID])

        // Same feel: the form's appeal is the character's appeal plus the form's own shift.
        let c = world.characters[i]
        let before = c.formAppeal(form, .kids, fits: world.fits)
        #expect(abs(before - (c.trueAppeal(.kids, fits: world.fits) + form.appealShift[.kids])) < 1e-9)

        // Affection that the character earns also reaches the form.
        world.characters[i].truth.affection[.kids] += 5
        let after = world.characters[i].formAppeal(form, .kids, fits: world.fits)
        #expect(abs(after - before - 5) < 1e-9)
    }

    @Test("A form's buzz lifts its character's buzz (R23)")
    func formBuzzLiftsCharacter() throws {
        var world = World(seed: 32, studioName: "Test")
        let base = try world.createCharacter(draft("Base"))
        let formID = try world.createForm(of: base, draft("Mega Base"))
        let i = try #require(world.index(of: base))
        let f = try #require(world.characters[i].forms.firstIndex { $0.id == formID })
        world.characters[i].forms[f].buzz = 80
        world.advanceWeek()
        #expect(abs(world.characters[i].buzz - 80 * World.formBuzzLift * 0.85) < 1e-9)
        #expect(abs(world.characters[i].forms[f].buzz - 80 * 0.85) < 1e-9)
    }

    @Test("A form name must be unique across characters and forms")
    func formNamesUnique() throws {
        var world = World(seed: 33, studioName: "Test")
        let base = try world.createCharacter(draft("Base"))
        try world.createForm(of: base, draft("Mega Base"))
        #expect(throws: RosterError.duplicateName("Base")) { try world.createForm(of: base, draft("Base")) }
        #expect(throws: RosterError.duplicateName("mega base")) { try world.createCharacter(draft("mega base")) }
        #expect(throws: RosterError.unknownCharacter(99)) { try world.createForm(of: 99, draft("Ghost")) }
    }

    @Test("A form redesign costs half of a character redesign (R9, R23)")
    func formRedesignCost() throws {
        var world = World(seed: 34, studioName: "Test")
        let base = try world.createCharacter(draft("Base"))
        let formID = try world.createForm(of: base, draft("Mega Base"))
        var change = CharacterDraft(from: try #require(world.forms(of: base).first))
        change.primaryType = .water
        change.archetype = .creepy
        try world.redesignForm(formID, of: base, change)
        let c = try #require(world.character(base))
        #expect(c.form(formID)?.primaryType == .water)
        #expect(abs(c.truth.affection[.kids] - (-World.redesignCost * World.formRedesignShare * 0.6)) < 1e-9)
    }

    @Test("A redesign costs affection in proportion to the change (R9)")
    func redesignCost() throws {
        var world = World(seed: 41, studioName: "Test")
        let id = try world.createCharacter(draft("A"))

        var rename = CharacterDraft(from: try #require(world.character(id)))
        rename.name = "A Prime"
        try world.redesign(id, rename)
        #expect(try #require(world.character(id)).truth.affection[.kids] == 0)

        var bigChange = rename
        bigChange.primaryType = .water
        bigChange.archetype = .creepy
        try world.redesign(id, bigChange)
        let affection = try #require(world.character(id)).truth.affection[.kids]
        #expect(abs(affection - (-World.redesignCost * 0.6)) < 1e-9)
    }

    @Test("Counterparts, rivals and companions are symmetric")
    func symmetricLinks() throws {
        var world = World(seed: 51, studioName: "Test")
        let a = try world.createCharacter(draft("A"))
        let b = try world.createCharacter(draft("B"))
        let c = try world.createCharacter(CharacterDraft(
            name: "C", palette: [.ember, .gold], counterpart: a, rivals: [b], companions: [a]
        ))
        #expect(world.character(a)?.counterpart == c)
        #expect(world.character(b)?.rivals == [c])
        #expect(world.character(a)?.companions == [c])

        // Move the counterpart from A to B. A must lose its link.
        var change = CharacterDraft(from: try #require(world.character(c)))
        change.counterpart = b
        change.rivals = []
        try world.redesign(c, change)
        #expect(world.character(a)?.counterpart == nil)
        #expect(world.character(b)?.counterpart == c)
        #expect(world.character(b)?.rivals == [])
    }

    @Test("An evolution line has a maximum of three stages")
    func lineLimit() throws {
        var world = World(seed: 61, studioName: "Test")
        let s1 = try world.createCharacter(draft("S1"))
        var d2 = draft("S2"); d2.evolvesFrom = s1
        let s2 = try world.createCharacter(d2)
        var d3 = draft("S3"); d3.evolvesFrom = s2
        let s3 = try world.createCharacter(d3)
        #expect(world.stage(of: s3) == 3)
        var d4 = draft("S4"); d4.evolvesFrom = s3
        #expect(throws: RosterError.lineTooLong) { try world.createCharacter(d4) }

        // Making S1 evolve from S3 would make a loop.
        var loop = CharacterDraft(from: try #require(world.character(s1)))
        loop.evolvesFrom = s3
        #expect(throws: RosterError.lineLoop) { try world.redesign(s1, loop) }
    }

    @Test("Validation rejects bad drafts")
    func validation() throws {
        var world = World(seed: 71, studioName: "Test")
        try world.createCharacter(draft("Ember"))
        #expect(throws: RosterError.emptyName) { try world.createCharacter(draft("   ")) }
        #expect(throws: RosterError.duplicateName("ember")) { try world.createCharacter(draft("ember")) }
        var oneColor = draft("Solo"); oneColor.palette = [.ember]
        #expect(throws: RosterError.paletteSize) { try world.createCharacter(oneColor) }
        var twice = draft("Twice"); twice.secondaryType = .fire
        #expect(throws: RosterError.sameTypeTwice) { try world.createCharacter(twice) }
    }

    @Test("Retire and restore change only the status (R10)")
    func retireRestore() throws {
        var world = World(seed: 81, studioName: "Test")
        let id = try world.createCharacter(draft("A"))
        try world.retire(id)
        #expect(world.character(id)?.status == .retired)
        try world.restore(id)
        #expect(world.character(id)?.status == .active)
    }

    @Test("A world survives a JSON round trip unchanged")
    func codableRoundTrip() throws {
        let world = World.sample(seed: 13)
        let data = try JSONEncoder().encode(world)
        let decoded = try JSONDecoder().decode(World.self, from: data)
        #expect(decoded == world)
    }

    @Test("Each world perturbs the fit tables differently, but keeps resellers at zero")
    func fitTables() {
        let a = FitTables(seed: 1)
        let b = FitTables(seed: 2)
        #expect(a != b)
        for archetype in Archetype.allCases {
            #expect(a.archetypeFit(archetype, .resellers) == 0)
        }
    }

    @Test("A person keeps its look, and a creature stores no person look (R14)")
    func personKind() throws {
        var world = World(seed: 61, studioName: "Test")
        var personDraft = draft("Mara", role: .mascot)
        personDraft.kind = .person
        personDraft.person = PersonParts(skin: .deep, hair: .bun, eyes: .big, outfit: .coat, accessory: .glasses)
        let person = try world.createCharacter(personDraft)
        let creature = try world.createCharacter(draft("Ember"))

        let p = try #require(world.character(person))
        #expect(p.kind == .person)
        #expect(p.role == .mascot)
        #expect(p.person == personDraft.person)
        #expect(CharacterDraft(from: p).kind == .person)

        let c = try #require(world.character(creature))
        #expect(c.kind == .creature)
        #expect(c.person == nil)
    }

    @Test("A switch between creature and person costs the same as a look change (R14)")
    func kindSwitchCost() throws {
        var world = World(seed: 71, studioName: "Test")
        let id = try world.createCharacter(draft("A"))
        var toPerson = CharacterDraft(from: try #require(world.character(id)))
        toPerson.kind = .person
        try world.redesign(id, toPerson)
        let c = try #require(world.character(id))
        #expect(c.kind == .person)
        #expect(abs(c.truth.affection[.kids] - (-World.redesignCost * 0.1)) < 1e-9)
    }

    @Test("A save from before R14 loads, and every character in it is a creature")
    func oldSaveLoads() throws {
        var world = World(seed: 81, studioName: "Test")
        try world.createCharacter(draft("A"))
        try world.createCharacter(draft("B"))
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var characters = try #require(json["characters"] as? [[String: Any]])
        for i in characters.indices { characters[i].removeValue(forKey: "person") }
        json["characters"] = characters
        let decoded = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(decoded == world)
        #expect(decoded.characters.allSatisfy { $0.kind == .creature })
    }

    @Test("A suggested person name comes from the person list")
    func personName() {
        var rng = SplitMix64(seed: 5)
        let name = NameGenerator.uniqueName(for: .fire, kind: .person, taken: [], using: &rng)
        #expect(NameGenerator.personNames.contains(name))
    }

    @Test("A version 1 save moves each old form entry into its character (R23)")
    func migrateVersion1Forms() throws {
        // Build the JSON of a version 1 world: two characters, the second is a form of the first.
        var world = World(seed: 91, studioName: "Test")
        let base = try world.createCharacter(draft("Aryla", role: .mascot))
        let other = try world.createCharacter(draft("Destined", role: .legendary))
        let friend = try world.createCharacter(draft("Friend"))
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        var characters = try #require(json["characters"] as? [[String: Any]])
        for i in characters.indices { characters[i].removeValue(forKey: "forms") }
        characters[1]["formOf"] = base
        characters[2]["rivals"] = [other]
        json["characters"] = characters
        json.removeValue(forKey: "catalog")
        json["version"] = 1

        try World.migrate(&json)
        let migrated = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))

        #expect(migrated.version == World.currentVersion)
        #expect(migrated.catalog == Catalog(seed: World.streamSeed(91, stream: 4), themeSeed: World.streamSeed(91, stream: 5)))
        #expect(migrated.characters.map(\.id) == [base, friend])
        let form = try #require(migrated.character(base)?.forms.first)
        #expect(form.id == other)
        #expect(form.name == "Destined")
        #expect(form.role == .legendary)
        #expect(migrated.character(friend)?.rivals == [])
        // A new ID does not reuse the old form's ID.
        var next = migrated
        let newID = try next.createCharacter(draft("New"))
        #expect(newID > friend)
    }

    @Test("A current save is not changed by the migration")
    func migrateCurrentIsNoOp() throws {
        let world = World.sample(seed: 17)
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
        try World.migrate(&json)
        let decoded = try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(decoded == world)
    }
}
