// Lore: races, factions, relations, story beats, and the timeline
// (docs/design/lore.md; decisions L1 to L7).

import Foundation

public typealias RaceID = Int
public typealias FactionID = Int

/// A race, for example Orcs or Humans (L1). FLAVOR, except that it groups factions.
public struct Race: Codable, Sendable, Equatable, Identifiable {
    public let id: RaceID
    public internal(set) var name: String
    public internal(set) var emblem: SetSymbolShape
    public internal(set) var color: PaletteColor
}

/// The tone of a faction. It sets the faction's hidden fans (lore.md, section 2).
public enum FactionTone: String, CaseIterable, Codable, Sendable, Identifiable {
    case heroic, dark, wild, noble, rebel, ancient

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }

    /// The base appeal for each audience, in `Audience` order.
    var baseFans: [Double] {
        switch self {
        case .heroic: [40, 40, 20, 25, 10, 25, 20, 20, 15, 10, 0]
        case .dark: [5, 0, 45, 25, 25, 20, 25, 40, 35, 20, 0]
        case .wild: [35, 15, 30, 30, 20, 15, 20, 25, 25, 10, 0]
        case .noble: [20, 30, 15, 20, 15, 30, 30, 30, 35, 25, 0]
        case .rebel: [15, 5, 45, 30, 25, 20, 20, 30, 25, 15, 0]
        case .ancient: [10, 15, 25, 20, 25, 35, 35, 45, 40, 35, 0]
        }
    }
}

/// The kind of a group (L8).
public enum GroupKind: String, CaseIterable, Codable, Sendable, Identifiable {
    case kingdom, clan, order, guild, tribe, cult

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }
}

/// A group that characters serve, for example a kingdom or an order (L8). Members
/// can be of any race. The code calls it a faction, as in L2 to L7.
public struct Faction: Codable, Sendable, Equatable, Identifiable {
    public let id: FactionID
    public internal(set) var name: String
    /// Kept from L1 for old saves. Groups do not belong to a race now (L8).
    public internal(set) var raceID: RaceID?
    /// The kind, for example a kingdom (L8). Nil in an old save: a group.
    public internal(set) var kind: GroupKind?
    /// The larger group that this group is part of, one level only (L9).
    public internal(set) var parentID: FactionID?
    public internal(set) var tone: FactionTone
    public internal(set) var emblem: SetSymbolShape
    public internal(set) var color: PaletteColor
    /// Hidden. The random part of each audience's appeal, set at creation.
    public internal(set) var fansShift: AudienceValues
    /// The share of each audience that knows the faction, 0 to 1. Starts at 0.
    public internal(set) var fame: AudienceValues

    /// The faction's appeal for an audience, -50 to 100 (L4).
    public func fans(_ audience: Audience) -> Double {
        min(100, max(-50, tone.baseFans[audience.rawValue] + fansShift[audience]))
    }
}

/// A story beat (L3, L6).
public enum Beat: String, CaseIterable, Codable, Sendable, Identifiable {
    case war, alliance, betrayal, rise, fall, discovery

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }

    /// How many factions the beat involves.
    public var factionCount: ClosedRange<Int> {
        switch self {
        case .war, .alliance, .betrayal: 2...2
        case .rise, .fall: 1...1
        case .discovery: 0...1
        }
    }

    /// The change to the relation between the two factions.
    var relationChange: Double {
        switch self {
        case .war: -30
        case .alliance: 40
        case .betrayal: -50
        default: 0
        }
    }
}

/// A set's chapter of the story (L3). The set picks it while it is a draft.
public struct SetStory: Codable, Sendable, Equatable {
    public var beat: Beat
    /// The factions, in order. For a betrayal: the traitor first, then the betrayed.
    public var factions: [FactionID]
    /// A named character: the defector of a betrayal (L5), or the fallen of a fall (L7).
    public var character: CharacterID?

    public init(beat: Beat, factions: [FactionID], character: CharacterID? = nil) {
        self.beat = beat
        self.factions = factions
        self.character = character
    }
}

/// A change of a character's state (L7). The secondary market will read the last
/// cards of the old state (not built yet).
public struct StateChange: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case defected, fell, turned }
    public let characterID: CharacterID
    public let kind: Kind
    /// The character's cards from the last released set before the change.
    public let lastCards: [CardID]
}

/// One chapter of the timeline: a released set's beat and its factions (L3).
public struct Chapter: Codable, Sendable, Equatable {
    public let setID: SetID
    public let week: Int
    public let story: SetStory?
    /// The share of the set's designed cards for each faction.
    public let presence: [FactionID: Double]
    public let changes: [StateChange]
}

/// The world's lore (L1 to L3).
public struct Lore: Codable, Sendable, Equatable {
    public internal(set) var races: [Race] = []
    public internal(set) var factions: [Faction] = []
    /// The relation of each pair, -100 to 100. The key is "smaller-larger".
    public internal(set) var relations: [String: Double] = [:]
    public internal(set) var timeline: [Chapter] = []
    var nextID = 1
    var rng: Xoshiro256

    init(seed: UInt64) { rng = Xoshiro256(seed: seed) }

    public func race(_ id: RaceID?) -> Race? { id.flatMap { id in races.first { $0.id == id } } }
    public func faction(_ id: FactionID?) -> Faction? { id.flatMap { id in factions.first { $0.id == id } } }

    static func key(_ a: FactionID, _ b: FactionID) -> String { "\(min(a, b))-\(max(a, b))" }

    /// The relation of two factions. 0 when the player set none.
    public func relation(_ a: FactionID, _ b: FactionID) -> Double { relations[Self.key(a, b)] ?? 0 }

    public static func relationPhrase(_ value: Double) -> String {
        switch value {
        case ..<(-60): "Sworn enemies"
        case ..<(-20): "Rivals"
        case ..<20: "Uneasy"
        case ..<60: "Friendly"
        default: "Allies"
        }
    }
}

extension World {
    /// The lore. A save from before the lore starts empty.
    public var lore: Lore { loreState ?? Lore(seed: Self.streamSeed(seed, stream: 11)) }

    private mutating func changeLore(_ change: (inout Lore) -> Void) {
        var l = lore
        change(&l)
        loreState = l
    }

    // MARK: - Races, factions, and relations (L1, L2)

    @discardableResult
    public mutating func createRace(name: String, emblem: SetSymbolShape, color: PaletteColor) throws(CardError) -> RaceID {
        let trimmed = try validName(name, limit: 30)
        if lore.races.contains(where: { $0.name.lowercased() == trimmed.lowercased() }) { throw .badLore("Another race has that name.") }
        var id = 0
        changeLore { l in
            id = l.nextID
            l.nextID += 1
            l.races.append(Race(id: id, name: trimmed, emblem: emblem, color: color))
        }
        return id
    }

    /// Adds a group of a kind, for example a kingdom, and optionally puts it inside a larger group (L8, L9).
    @discardableResult
    public mutating func createFaction(name: String, kind: GroupKind, parent: FactionID? = nil, tone: FactionTone,
                                       emblem: SetSymbolShape, color: PaletteColor) throws(CardError) -> FactionID {
        let trimmed = try validName(name, limit: 30)
        if lore.factions.contains(where: { $0.name.lowercased() == trimmed.lowercased() }) { throw .badLore("Another group has that name.") }
        try validParent(parent, for: nil)
        var id = 0
        changeLore { l in
            id = l.nextID
            l.nextID += 1
            var shift = AudienceValues()
            for a in Audience.allCases where !a.isDerived { shift[a] = l.rng.gauss() * 10 }
            l.factions.append(Faction(id: id, name: trimmed, raceID: nil, kind: kind, parentID: parent, tone: tone,
                                      emblem: emblem, color: color, fansShift: shift, fame: AudienceValues()))
        }
        return id
    }

    /// One level only: the larger group must not be inside another group (L9).
    private func validParent(_ parent: FactionID?, for group: FactionID?) throws(CardError) {
        guard let parent else { return }
        guard let p = lore.faction(parent) else { throw .badLore("That group does not exist.") }
        if p.parentID != nil { throw .badLore("\(p.name) is inside another group. A group can sit only one level deep.") }
        if let group {
            if group == parent { throw .badLore("A group cannot sit inside itself.") }
            if lore.factions.contains(where: { $0.parentID == group }) {
                throw .badLore("This group holds other groups, so it cannot sit inside one.")
            }
        }
    }

    /// Moves a group inside a larger group, or out of it (L9).
    public mutating func setParent(_ group: FactionID, to parent: FactionID?) throws(CardError) {
        guard lore.faction(group) != nil else { throw .badLore("That group does not exist.") }
        try validParent(parent, for: group)
        changeLore { l in
            if let i = l.factions.firstIndex(where: { $0.id == group }) { l.factions[i].parentID = parent }
        }
    }

    /// Deletes a race. Its characters lose the race (L10).
    public mutating func deleteRace(_ id: RaceID) throws(CardError) {
        guard lore.race(id) != nil else { throw .badLore("That race does not exist.") }
        changeLore { $0.races.removeAll { $0.id == id } }
        for i in characters.indices where characters[i].raceID == id { characters[i].raceID = nil }
    }

    /// Deletes a group. Characters, forms, relations, and draft stories lose it. Its
    /// inner groups stand alone. The timeline keeps its history (L10).
    public mutating func deleteFaction(_ id: FactionID) throws(CardError) {
        guard lore.faction(id) != nil else { throw .badLore("That group does not exist.") }
        changeLore { l in
            l.factions.removeAll { $0.id == id }
            for i in l.factions.indices where l.factions[i].parentID == id { l.factions[i].parentID = nil }
            l.relations = l.relations.filter { key, _ in !key.split(separator: "-").contains(Substring(String(id))) }
        }
        for i in characters.indices {
            if characters[i].factionID == id { characters[i].factionID = nil }
            for f in characters[i].forms.indices where characters[i].forms[f].factionID == id { characters[i].forms[f].factionID = nil }
        }
        for i in catalog.sets.indices where catalog.sets[i].status == .draft {
            guard var story = catalog.sets[i].story, story.factions.contains(id) else { continue }
            story.factions.removeAll { $0 == id }
            catalog.sets[i].story = story.beat.factionCount.contains(story.factions.count) ? story : nil
        }
    }

    /// Sets the start relation of two factions (L2).
    public mutating func setRelation(_ a: FactionID, _ b: FactionID, to value: Double) throws(CardError) {
        guard a != b, lore.faction(a) != nil, lore.faction(b) != nil else { throw .badLore("Pick two different groups.") }
        changeLore { $0.relations[Lore.key(a, b)] = min(100, max(-100, value)) }
    }

    /// Sets a character's race and group. They are separate: any race can serve any group (L8).
    public mutating func setLore(_ characterID: CharacterID, race: RaceID?, faction: FactionID?) throws(CardError) {
        guard let i = characters.firstIndex(where: { $0.id == characterID }) else { throw .badLore("That character does not exist.") }
        if let race, lore.race(race) == nil { throw .badLore("That race does not exist.") }
        if let faction, lore.faction(faction) == nil { throw .badLore("That group does not exist.") }
        characters[i].raceID = race
        characters[i].factionID = faction
    }

    /// Puts one form of a character in another faction (L5), for example a dark form
    /// that joins the enemy. Nil means the form follows its character.
    public mutating func setFormFaction(_ characterID: CharacterID, form: FormID, faction: FactionID?) throws(CardError) {
        guard let i = characters.firstIndex(where: { $0.id == characterID }),
              let f = characters[i].forms.firstIndex(where: { $0.id == form }) else { throw .badLore("That form does not exist.") }
        if let faction, lore.faction(faction) == nil { throw .badLore("That group does not exist.") }
        characters[i].forms[f].factionID = faction
    }

    /// The faction that a card counts for: its form's faction, or its character's (L5).
    public func faction(of card: Card) -> FactionID? {
        guard let c = character(card.characterID) else { return nil }
        if let formID = card.formID, let form = c.form(formID), let f = form.factionID { return f }
        return c.factionID
    }

    /// The share of a set's designed cards for each group (L3). A card also counts
    /// at half weight for the larger group that its group is part of (L9).
    public func presence(_ setID: SetID) -> [FactionID: Double] {
        let designed = catalog.cards(in: setID)
        guard !designed.isEmpty else { return [:] }
        var counts: [FactionID: Double] = [:]
        for card in designed {
            guard let f = faction(of: card) else { continue }
            counts[f, default: 0] += 1
            if let parent = lore.faction(f)?.parentID { counts[parent, default: 0] += 0.5 }
        }
        return counts.mapValues { $0 / Double(designed.count) }
    }

    // MARK: - Story (L3, L5, L7)

    /// Picks a set's story beat while the set is a draft.
    public mutating func setStory(_ setID: SetID, _ story: SetStory?) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        try requireDraft(setID)
        if let story {
            guard story.beat.factionCount.contains(story.factions.count), Set(story.factions).count == story.factions.count else {
                throw .badLore("\(story.beat.name) needs \(story.beat.factionCount.lowerBound == story.beat.factionCount.upperBound ? "\(story.beat.factionCount.lowerBound)" : "up to \(story.beat.factionCount.upperBound)") \(story.beat.factionCount.upperBound == 1 ? "group" : "groups").")
            }
            guard story.factions.allSatisfy({ lore.faction($0) != nil }) else { throw .badLore("Pick groups from the lore.") }
            if let c = story.character {
                guard story.beat == .betrayal || story.beat == .fall else { throw .badLore("Only a betrayal or a fall names a character.") }
                guard character(c) != nil else { throw .badLore("That character does not exist.") }
            }
        }
        catalog.sets[i].story = story
    }

    /// Release day: the beat changes the world, and the timeline gets a chapter (L3, L7).
    mutating func applyStory(_ setID: SetID) {
        guard let set = catalog.set(setID) else { return }
        let story = set.story
        var changes: [StateChange] = []
        if let story {
            if story.factions.count == 2, story.beat.relationChange != 0 {
                let (a, b) = (story.factions[0], story.factions[1])
                let value = lore.relation(a, b) + story.beat.relationChange * storyStrength
                changeLore { $0.relations[Lore.key(a, b)] = min(100, max(-100, value)) }
            }
            let fameBonus: Double = switch story.beat {
            case .rise: 0.03
            case .fall: -0.02
            case .discovery: 0.02
            default: 0.01
            }
            let fameChange = fameBonus * storyStrength
            changeLore { l in
                for f in story.factions {
                    guard let i = l.factions.firstIndex(where: { $0.id == f }) else { continue }
                    l.factions[i].fame = l.factions[i].fame.map { min(1, max(0, $0 + fameChange)) }
                }
            }
            if let c = story.character, let index = characters.firstIndex(where: { $0.id == c }) {
                let last = lastCards(of: c, before: setID)
                if story.beat == .betrayal, story.factions.count == 2 {
                    // The defector joins the traitor's side (L5).
                    characters[index].factionID = story.factions[0]
                    changes.append(StateChange(characterID: c, kind: .defected, lastCards: last))
                } else if story.beat == .fall {
                    characters[index].status = .retired
                    changes.append(StateChange(characterID: c, kind: .fell, lastCards: last))
                }
                characters[index].buzz = min(100, characters[index].buzz + 40)
            }
        }
        // A form on another side debuts: the character turned (L7).
        for card in catalog.cards(in: setID) {
            guard let c = character(card.characterID), let formID = card.formID, let form = c.form(formID),
                  let f = form.factionID, f != c.factionID,
                  !lore.timeline.contains(where: { $0.changes.contains { $0.characterID == c.id && $0.kind == .turned } }),
                  !changes.contains(where: { $0.characterID == c.id }),
                  let index = characters.firstIndex(where: { $0.id == c.id }) else { continue }
            changes.append(StateChange(characterID: c.id, kind: .turned, lastCards: lastCards(of: c.id, before: setID)))
            characters[index].buzz = min(100, characters[index].buzz + 30)
        }
        let chapter = Chapter(setID: setID, week: week, story: story, presence: presence(setID), changes: changes)
        changeLore { $0.timeline.append(chapter) }
        if let story {
            let names = story.factions.compactMap { lore.faction($0)?.name }
            var b = business
            b.report(week, "\(set.name): \(story.beat.name)" + (names.isEmpty ? "." : " — \(names.joined(separator: " and ")).")
                + changes.map { change in
                    let name = character(change.characterID)?.name ?? "A character"
                    return switch change.kind {
                    case .defected: " \(name) changed sides."
                    case .fell: " \(name) fell."
                    case .turned: " \(name) turned."
                    }
                }.joined())
            businessState = b
        }
    }

    /// The character's cards in the last released set before this one (L7).
    private func lastCards(of characterID: CharacterID, before setID: SetID) -> [CardID] {
        let released = lore.timeline.map(\.setID).filter { $0 != setID }
        for id in released.reversed() {
            let cards = catalog.cards(in: id).filter { $0.characterID == characterID }
            if !cards.isEmpty { return cards.map(\.id) }
        }
        return []
    }

    /// The buyers of each audience learn the set's factions (L4).
    mutating func learnFactions(set setID: SetID, sold: [Double]) {
        let presence = presence(setID)
        guard !presence.isEmpty else { return }
        let people = Audience.allCases.map { market.state($0).people }
        changeLore { l in
            for (f, share) in presence {
                guard let i = l.factions.firstIndex(where: { $0.id == f }) else { continue }
                for a in Audience.allCases where !a.isDerived {
                    let buyers = sold[a.rawValue] / Self.packsPerBuyer
                    l.factions[i].fame[a] = min(1, l.factions[i].fame[a] + buyers / people[a.rawValue] * share)
                }
            }
        }
    }
}
