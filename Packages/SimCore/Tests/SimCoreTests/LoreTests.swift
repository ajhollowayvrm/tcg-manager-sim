import Testing
@testable import SimCore

fileprivate func lore(_ body: () throws -> Void) -> CardError? {
    do { try body() } catch { return error as? CardError }
    return nil
}

fileprivate func isBadLore(_ error: CardError?) -> Bool {
    if case .badLore = error { return true }
    return false
}

fileprivate func newWorld() -> World { World(seed: 61, studioName: "Test") }

fileprivate func addGroup(_ world: inout World, _ name: String, parent: FactionID? = nil, tone: FactionTone = .heroic) throws -> FactionID {
    try world.createFaction(name: name, kind: .kingdom, parent: parent, tone: tone, emblem: .bolt, color: .gold)
}

@Suite("Lore: races, groups, and relations")
struct LoreTests {
    @Test("A race has a trimmed, unique name of at most 30 characters (L1)")
    func raceRules() throws {
        var world = newWorld()
        let id = try world.createRace(name: "  Orcs ", emblem: .bolt, color: .forest)
        #expect(world.lore.race(id)?.name == "Orcs")
        #expect(lore { try world.createRace(name: " ", emblem: .bolt, color: .forest) } == .emptyName)
        #expect(lore { try world.createRace(name: String(repeating: "x", count: 31), emblem: .bolt, color: .forest) } == .nameTooLong(30))
        let dup = lore { try world.createRace(name: "ORCS", emblem: .bolt, color: .forest) }
        #expect(isBadLore(dup))
        #expect(world.lore.races.count == 1)
    }

    @Test("A group has a kind, a tone, no start fame, and a hidden fan shift that repeats for a seed (L4, L8)")
    func groupCreate() throws {
        var a = newWorld()
        var b = newWorld()
        let idA = try addGroup(&a, "Crown", tone: .noble)
        _ = try addGroup(&b, "Crown", tone: .noble)
        #expect(a.lore == b.lore)
        let group = try #require(a.lore.faction(idA))
        #expect(group.kind == .kingdom)
        #expect(group.tone == .noble)
        #expect(group.fame == AudienceValues())
        #expect(group.fansShift[.resellers] == 0)
        let dup = lore { _ = try addGroup(&a, "crown") }
        #expect(isBadLore(dup))
    }

    @Test("Races and groups use one ID counter")
    func sharedLoreIDs() throws {
        var world = newWorld()
        let race = try world.createRace(name: "Elves", emblem: .bolt, color: .lime)
        let group = try addGroup(&world, "Crown")
        #expect(group == race + 1)
    }

    @Test("A group's fans are its tone plus its shift, kept in -50...100 (L4)")
    func fans() throws {
        var world = newWorld()
        let id = try addGroup(&world, "Crown", tone: .heroic)
        world.loreState?.factions[0].fansShift = AudienceValues()
        let group = try #require(world.lore.faction(id))
        #expect(group.fans(.kids) == 40)
        #expect(group.fans(.resellers) == 0)

        world.loreState?.factions[0].fansShift[.kids] = 500
        #expect(world.lore.faction(id)?.fans(.kids) == 100)
        world.loreState?.factions[0].fansShift[.kids] = -500
        #expect(world.lore.faction(id)?.fans(.kids) == -50)
    }

    @Test("Each tone has fans for all audiences, and tones differ (L4)")
    func tones() {
        let counts = FactionTone.allCases.map { $0.baseFans.count }
        #expect(counts.allSatisfy { $0 == Audience.allCases.count })
        let teens = Audience.teens.rawValue
        #expect(FactionTone.dark.baseFans[teens] > FactionTone.heroic.baseFans[teens])
        let resellers = Audience.resellers.rawValue
        #expect(FactionTone.allCases.allSatisfy { $0.baseFans[resellers] == 0 })
    }

    @Test("A group sits one level deep at most (L9)")
    func nesting() throws {
        var world = newWorld()
        let realm = try addGroup(&world, "Realm")
        let order = try addGroup(&world, "Order", parent: realm)
        #expect(world.lore.faction(order)?.parentID == realm)
        let deep = lore { _ = try addGroup(&world, "Deep", parent: order) }
        #expect(isBadLore(deep))
        let missing = lore { _ = try addGroup(&world, "Lost", parent: 99) }
        #expect(isBadLore(missing))
        let loose = try addGroup(&world, "Loose")
        #expect(isBadLore(lore { try world.setParent(realm, to: loose) }))
        #expect(isBadLore(lore { try world.setParent(loose, to: loose) }))
        #expect(isBadLore(lore { try world.setParent(loose, to: order) }))
        #expect(isBadLore(lore { try world.setParent(99, to: nil) }))
        try world.setParent(loose, to: realm)
        #expect(world.lore.faction(loose)?.parentID == realm)
        try world.setParent(loose, to: nil)
        #expect(world.lore.faction(loose)?.parentID == nil)
    }

    @Test("A relation is one value for a pair, in either order, clamped to -100...100 (L2)")
    func relations() throws {
        var world = newWorld()
        let a = try addGroup(&world, "A")
        let b = try addGroup(&world, "B")
        #expect(world.lore.relation(a, b) == 0)
        try world.setRelation(b, a, to: -30)
        #expect(world.lore.relation(a, b) == -30)
        try world.setRelation(a, b, to: 500)
        #expect(world.lore.relation(b, a) == 100)
        try world.setRelation(a, b, to: -500)
        #expect(world.lore.relation(a, b) == -100)
        #expect(world.lore.relations.count == 1)
        #expect(isBadLore(lore { try world.setRelation(a, a, to: 10) }))
        #expect(isBadLore(lore { try world.setRelation(a, 99, to: 10) }))
    }

    @Test("The relation phrase follows the five bands")
    func phrases() {
        #expect(Lore.relationPhrase(-100) == "Sworn enemies")
        #expect(Lore.relationPhrase(-61) == "Sworn enemies")
        #expect(Lore.relationPhrase(-60) == "Rivals")
        #expect(Lore.relationPhrase(-20) == "Uneasy")
        #expect(Lore.relationPhrase(19.9) == "Uneasy")
        #expect(Lore.relationPhrase(20) == "Friendly")
        #expect(Lore.relationPhrase(60) == "Allies")
    }

    @Test("A character has a race and a group that are separate, and nil clears them (L8)")
    func characterLore() throws {
        var (world, id) = try Fixture.world()
        let race = try world.createRace(name: "Elves", emblem: .bolt, color: .lime)
        let group = try addGroup(&world, "Crown")
        try world.setLore(id, race: race, faction: nil)
        #expect(world.character(id)?.raceID == race)
        #expect(world.character(id)?.factionID == nil)
        try world.setLore(id, race: nil, faction: group)
        #expect(world.character(id)?.raceID == nil)
        #expect(world.character(id)?.factionID == group)
        #expect(isBadLore(lore { try world.setLore(id, race: 99, faction: nil) }))
        #expect(isBadLore(lore { try world.setLore(id, race: nil, faction: 99) }))
        #expect(isBadLore(lore { try world.setLore(99, race: nil, faction: nil) }))
    }

    @Test("Deleting a race removes it from its characters (L10)")
    func deleteRace() throws {
        var (world, id) = try Fixture.world()
        let race = try world.createRace(name: "Elves", emblem: .bolt, color: .lime)
        try world.setLore(id, race: race, faction: nil)
        try world.deleteRace(race)
        #expect(world.lore.races.isEmpty)
        #expect(world.character(id)?.raceID == nil)
        #expect(isBadLore(lore { try world.deleteRace(race) }))
    }

    @Test("Deleting a group clears characters, forms, relations, and inner groups (L10)")
    func deleteGroup() throws {
        var (world, id) = try Fixture.world()
        let realm = try addGroup(&world, "Realm")
        let order = try addGroup(&world, "Order", parent: realm)
        let other = try addGroup(&world, "Other")
        let formID = try world.createForm(of: id, CharacterDraft(name: "Aryla Dark"))
        try world.setLore(id, race: nil, faction: realm)
        try world.setFormFaction(id, form: formID, faction: realm)
        try world.setRelation(realm, other, to: -40)
        try world.setRelation(order, other, to: 40)

        try world.deleteFaction(realm)
        #expect(world.lore.faction(realm) == nil)
        #expect(world.lore.faction(order)?.parentID == nil)
        #expect(world.character(id)?.factionID == nil)
        #expect(world.character(id)?.form(formID)?.factionID == nil)
        #expect(world.lore.relation(realm, other) == 0)
        #expect(world.lore.relation(order, other) == 40)
        #expect(isBadLore(lore { try world.deleteFaction(realm) }))
    }

    @Test("Deleting group 1 keeps the relation of groups 11 and 12 (L10)")
    func deleteMatchesWholeID() throws {
        var world = newWorld()
        let first = try addGroup(&world, "First")
        for i in 0..<9 { try world.createRace(name: "Race\(i)", emblem: .bolt, color: .lime) }
        let eleven = try addGroup(&world, "Eleven")
        let twelve = try addGroup(&world, "Twelve")
        #expect(first == 1)
        #expect(eleven == 11)
        try world.setRelation(eleven, twelve, to: 50)
        try world.setRelation(first, twelve, to: 50)
        try world.deleteFaction(first)
        #expect(world.lore.relation(eleven, twelve) == 50)
        #expect(world.lore.relations.count == 1)
    }

    @Test("Deleting a group removes it from a draft story, and the story ends if it breaks (L10)")
    func deleteInStory() throws {
        var (world, set, _) = try Fixture.studio()
        let a = try addGroup(&world, "A")
        let b = try addGroup(&world, "B")
        try world.setStory(set, SetStory(beat: .war, factions: [a, b]))
        try world.deleteFaction(a)
        #expect(world.catalog.set(set)?.story == nil)

        try world.setStory(set, SetStory(beat: .discovery, factions: [b]))
        try world.deleteFaction(b)
        #expect(world.catalog.set(set)?.story == SetStory(beat: .discovery, factions: []))
    }

    @Test("A save from before the lore reads as an empty lore")
    func noLoreState() throws {
        var world = newWorld()
        world.loreState = nil
        #expect(world.lore.races.isEmpty)
        #expect(world.lore.factions.isEmpty)
        let id = try world.createRace(name: "Elves", emblem: .bolt, color: .lime)
        #expect(world.lore.race(id) != nil)
    }
}
