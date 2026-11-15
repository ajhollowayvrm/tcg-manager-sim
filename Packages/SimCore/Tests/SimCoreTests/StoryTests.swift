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

/// A studio with two groups, a mascot in group A, and one card for the mascot.
fileprivate struct Stage {
    var world: World
    var set: SetID
    var mascot: CharacterID
    var a: FactionID
    var b: FactionID

    init() throws {
        var (world, set, mascot) = try Fixture.studio()
        let a = try world.createFaction(name: "A", kind: .kingdom, tone: .heroic, emblem: .bolt, color: .gold)
        let b = try world.createFaction(name: "B", kind: .clan, tone: .dark, emblem: .bolt, color: .violet)
        try world.setLore(mascot, race: nil, faction: a)
        try world.createCard(in: set, CardDraft(name: "Aryla, One", characterID: mascot, rarity: 3))
        self.world = world
        self.set = set
        self.mascot = mascot
        self.a = a
        self.b = b
    }
}

@Suite("Lore: stories and the timeline")
struct StoryTests {
    @Test("Each beat needs its number of groups, with no repeats (L3, L6)")
    func beatCounts() throws {
        var s = try Stage()
        let (set, a, b) = (s.set, s.a, s.b)
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .war, factions: [a])) }))
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .war, factions: [a, a])) }))
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .rise, factions: [a, b])) }))
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .rise, factions: [])) }))
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .alliance, factions: [a, 99])) }))
        #expect(lore { try s.world.setStory(set, SetStory(beat: .discovery, factions: [])) } == nil)
        #expect(lore { try s.world.setStory(set, SetStory(beat: .betrayal, factions: [a, b])) } == nil)
        #expect(s.world.catalog.set(set)?.story?.beat == .betrayal)
        try s.world.setStory(set, nil)
        #expect(s.world.catalog.set(set)?.story == nil)
    }

    @Test("Only a betrayal or a fall names a character, and the character must exist (L5, L7)")
    func namedCharacter() throws {
        var s = try Stage()
        let (set, a, b, mascot) = (s.set, s.a, s.b, s.mascot)
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .war, factions: [a, b], character: mascot)) }))
        #expect(isBadLore(lore { try s.world.setStory(set, SetStory(beat: .fall, factions: [a], character: 99)) }))
        #expect(lore { try s.world.setStory(set, SetStory(beat: .fall, factions: [a], character: mascot)) } == nil)
    }

    @Test("A story is a draft choice: a scheduled set or an unknown set refuses it (B2)")
    func draftOnly() throws {
        var (world, set, _) = try Fixture.scheduled()
        let story = SetStory(beat: .discovery, factions: [])
        #expect(lore { try world.setStory(set, story) } == .setLocked)
        #expect(lore { try world.setStory(99, story) } == .unknownSet(99))
    }

    @Test("A war lowers the relation by 30, an alliance raises it by 40, a betrayal lowers it by 50 (L3)")
    func relationBeats() throws {
        var s = try Stage()
        let (set, a, b) = (s.set, s.a, s.b)
        try s.world.setStory(set, SetStory(beat: .war, factions: [a, b]))
        s.world.applyStory(set)
        #expect(s.world.lore.relation(a, b) == -30)
        try s.world.setStory(set, SetStory(beat: .alliance, factions: [a, b]))
        s.world.applyStory(set)
        #expect(s.world.lore.relation(a, b) == 10)
        try s.world.setStory(set, SetStory(beat: .betrayal, factions: [a, b]))
        s.world.applyStory(set)
        s.world.applyStory(set)
        #expect(s.world.lore.relation(a, b) == -90)
        s.world.applyStory(set)
        #expect(s.world.lore.relation(a, b) == -100)
    }

    @Test("A beat changes fame by its bonus, and fame stays in 0...1 (L3)")
    func fameBeats() throws {
        var s = try Stage()
        let (set, a, b) = (s.set, s.a, s.b)
        try s.world.setStory(set, SetStory(beat: .rise, factions: [a]))
        s.world.applyStory(set)
        #expect(abs((s.world.lore.faction(a)?.fame[.kids] ?? 0) - 0.03) < 1e-9)
        #expect(s.world.lore.faction(b)?.fame[.kids] == 0)
        try s.world.setStory(set, SetStory(beat: .fall, factions: [b]))
        s.world.applyStory(set)
        #expect(s.world.lore.faction(b)?.fame[.kids] == 0)
        try s.world.setStory(set, SetStory(beat: .war, factions: [a, b]))
        s.world.applyStory(set)
        #expect(abs((s.world.lore.faction(a)?.fame[.kids] ?? 0) - 0.04) < 1e-9)
    }

    @Test("Release adds one chapter with the week and the story, even with no beat (L3)")
    func chapters() throws {
        var s = try Stage()
        s.world.week = 4
        s.world.applyStory(s.set)
        let chapter = try #require(s.world.lore.timeline.first)
        #expect(chapter.setID == s.set)
        #expect(chapter.week == 4)
        #expect(chapter.story == nil)
        #expect(chapter.changes.isEmpty)
        #expect(s.world.lore.timeline.count == 1)
    }

    @Test("A chapter records each group's share of the designed cards, and a parent counts half (L3, L9)")
    func presence() throws {
        var s = try Stage()
        #expect(s.world.presence(s.set) == [s.a: 1.0])
        let parent = try s.world.createFaction(name: "Realm", kind: .kingdom, tone: .noble, emblem: .bolt, color: .gold)
        try s.world.setParent(s.a, to: parent)
        let nested = s.world.presence(s.set)
        #expect(nested[s.a] == 1.0)
        #expect(nested[parent] == 0.5)

        let hero = try s.world.createCharacter(CharacterDraft(name: "Free"))
        try s.world.createCard(in: s.set, CardDraft(name: "Free, One", characterID: hero, rarity: 3))
        let shared = s.world.presence(s.set)
        #expect(shared[s.a] == 0.5)
        #expect(shared[parent] == 0.25)
        #expect(s.world.presence(99).isEmpty)
    }

    @Test("A betrayal moves the named character to the traitor's group and sets a defection (L5, L7)")
    func betrayal() throws {
        var s = try Stage()
        try s.world.setStory(s.set, SetStory(beat: .betrayal, factions: [s.b, s.a], character: s.mascot))
        s.world.applyStory(s.set)
        #expect(s.world.character(s.mascot)?.factionID == s.b)
        #expect(s.world.character(s.mascot)?.buzz == 40)
        let change = try #require(s.world.lore.timeline.first?.changes.first)
        #expect(change.kind == .defected)
        #expect(change.characterID == s.mascot)
    }

    @Test("A fall retires the named character and adds change hype (L7, R10)")
    func fall() throws {
        var s = try Stage()
        s.world.characters[0].buzz = 80
        try s.world.setStory(s.set, SetStory(beat: .fall, factions: [s.a], character: s.mascot))
        s.world.applyStory(s.set)
        #expect(s.world.character(s.mascot)?.status == .retired)
        #expect(s.world.character(s.mascot)?.buzz == 100)
        #expect(s.world.lore.timeline.first?.changes.first?.kind == .fell)
    }

    @Test("A change marks the character's last cards from the last earlier set (L7)")
    func lastCards() throws {
        var s = try Stage()
        let firstCard = try #require(s.world.catalog.cards(in: s.set).first?.id)
        s.world.applyStory(s.set)
        let second = try s.world.createSet(.main, SetDetails(name: "Dark", code: "DRK", size: 10,
                                                             headliner: Headliner(characterID: s.mascot)),
                                           presetID: Catalog.defaultLadderID)
        try s.world.setStory(second, SetStory(beat: .fall, factions: [s.a], character: s.mascot))
        s.world.applyStory(second)
        let change = try #require(s.world.lore.timeline.last?.changes.first)
        #expect(change.lastCards == [firstCard])
        #expect(s.world.lore.timeline.count == 2)
    }

    @Test("A form on another side turns the character once, with change hype (L5, L7)")
    func turned() throws {
        var s = try Stage()
        let formID = try s.world.createForm(of: s.mascot, CharacterDraft(name: "Aryla Dark"))
        try s.world.setFormFaction(s.mascot, form: formID, faction: s.b)
        try s.world.createCard(in: s.set, CardDraft(name: "Aryla, Dark", characterID: s.mascot, formID: formID, rarity: 3))
        s.world.applyStory(s.set)
        let change = try #require(s.world.lore.timeline.first?.changes.first)
        #expect(change.kind == .turned)
        #expect(s.world.character(s.mascot)?.buzz == 30)
        s.world.applyStory(s.set)
        #expect(s.world.lore.timeline.last?.changes.isEmpty == true)
    }

    @Test("A card counts for its form's group, or its character's group (L5)")
    func cardFaction() throws {
        var s = try Stage()
        let formID = try s.world.createForm(of: s.mascot, CharacterDraft(name: "Aryla Dark"))
        let plain = try #require(s.world.catalog.cards(in: s.set).first)
        #expect(s.world.faction(of: plain) == s.a)
        try s.world.setFormFaction(s.mascot, form: formID, faction: s.b)
        let id = try s.world.createCard(in: s.set, CardDraft(name: "Aryla, Dark", characterID: s.mascot, formID: formID, rarity: 3))
        let dark = try #require(s.world.catalog.card(id))
        #expect(s.world.faction(of: dark) == s.b)
        try s.world.setFormFaction(s.mascot, form: formID, faction: nil)
        #expect(s.world.faction(of: dark) == s.a)
        #expect(isBadLore(lore { try s.world.setFormFaction(s.mascot, form: 99, faction: nil) }))
        #expect(isBadLore(lore { try s.world.setFormFaction(s.mascot, form: formID, faction: 99) }))
    }

    @Test("Buyers teach a group through the set's cards, up to full fame (L4)")
    func learning() throws {
        var s = try Stage()
        var sold = Array(repeating: 0.0, count: Audience.allCases.count)
        sold[Audience.kids.rawValue] = 300
        sold[Audience.resellers.rawValue] = 300
        s.world.learnFactions(set: s.set, sold: sold)
        let group = try #require(s.world.lore.faction(s.a))
        #expect(group.fame[.kids] > 0)
        #expect(group.fame[.teens] == 0)
        #expect(group.fame[.resellers] == 0)
        #expect(s.world.lore.faction(s.b)?.fame[.kids] == 0)

        sold[Audience.kids.rawValue] = 1e12
        s.world.learnFactions(set: s.set, sold: sold)
        #expect(s.world.lore.faction(s.a)?.fame[.kids] == 1)
    }
}
