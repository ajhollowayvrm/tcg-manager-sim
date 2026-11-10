// The whole game state for one save.
//
// Rules (from the old build, still correct):
// 1. The world is a pure value. The same seed and the same decisions give
//    the same world.
// 2. Each subsystem has its own random stream, so a change in one subsystem
//    does not move the numbers in another.
// 3. A read never draws a random number. Only a decision or a week tick does.

public struct World: Codable, Sendable, Equatable {
    /// Version 2: forms live inside their character (R23).
    /// Version 3: the catalog of cards and sets.
    /// Version 4: the theme library (C13).
    /// Version 5: tier frame styles (C14).
    /// Version 6: each tier sets the card look and cost. No treatment list (C15).
    /// Version 7: printed versions on tiers and cards (C16). See World+Migration.swift.
    public static let currentVersion = 7

    /// Affection lost per audience for a full redesign (change = 1).
    public static let redesignCost = 20.0
    /// The share of the fit difference between a form's feel and its
    /// character's feel that moves the form's appeal (roster.md, section 3.5).
    public static let formFitWeight = 0.5
    /// The spread of a form's own random appeal shift.
    public static let formShiftSpread = 6.0
    /// A form redesign costs this share of a character redesign.
    public static let formRedesignShare = 0.5
    /// Each week, a character's buzz rises to at least this share of its
    /// forms' highest buzz. A form's hype helps its character.
    public static let formBuzzLift = 0.5
    /// Maximum stages in an evolution line.
    public static let maxStages = 3

    public let version: Int
    public let seed: UInt64
    public internal(set) var studioName: String
    public internal(set) var week: Int
    public let fits: FitTables
    public internal(set) var characters: [Character]
    /// Cards, sets, and ladder presets (cards.md).
    public internal(set) var catalog: Catalog

    var nextID: CharacterID
    /// Stream: the random part of each new character's appeal.
    var appealRng: Xoshiro256
    /// Stream: the feel and the name of each generated character.
    var generatorRng: Xoshiro256

    public init(seed: UInt64, studioName: String) {
        version = Self.currentVersion
        self.seed = seed
        self.studioName = studioName
        week = 0
        fits = FitTables(seed: Self.streamSeed(seed, stream: 1))
        appealRng = Xoshiro256(seed: Self.streamSeed(seed, stream: 2))
        generatorRng = Xoshiro256(seed: Self.streamSeed(seed, stream: 3))
        characters = []
        catalog = Catalog(seed: Self.streamSeed(seed, stream: 4), themeSeed: Self.streamSeed(seed, stream: 5))
        nextID = 1
    }

    static func streamSeed(_ seed: UInt64, stream: UInt64) -> UInt64 {
        var mixer = SplitMix64(seed: seed ^ (stream &* 0xD1B5_4A32_D192_ED03))
        return mixer.next()
    }

    // MARK: - Reads

    public func character(_ id: CharacterID) -> Character? {
        characters.first { $0.id == id }
    }

    func index(of id: CharacterID) -> Int? {
        characters.firstIndex { $0.id == id }
    }

    /// The stage of a character in its evolution line: 1, 2 or 3.
    public func stage(of id: CharacterID) -> Int {
        var stage = 1
        var current = character(id)?.evolvesFrom
        var seen: Set<CharacterID> = [id]
        while let parent = current, !seen.contains(parent) {
            seen.insert(parent)
            stage += 1
            current = character(parent)?.evolvesFrom
        }
        return stage
    }

    /// The characters that evolve from this character.
    public func nextStages(of id: CharacterID) -> [Character] {
        characters.filter { $0.evolvesFrom == id }
    }

    /// The forms of a character.
    public func forms(of id: CharacterID) -> [CharacterForm] {
        character(id)?.forms ?? []
    }

    /// The number of stages below a character (0 if nothing evolves from it).
    func descendantDepth(of id: CharacterID, seen: Set<CharacterID> = []) -> Int {
        let children = nextStages(of: id).filter { !seen.contains($0.id) }
        guard !children.isEmpty else { return 0 }
        return 1 + children.map { descendantDepth(of: $0.id, seen: seen.union([id])) }.max()!
    }

    // MARK: - Decisions

    /// The player creates a character (R2). It costs nothing in the game (R11).
    @discardableResult
    public mutating func createCharacter(_ draft: CharacterDraft) throws(RosterError) -> CharacterID {
        try add(draft, origin: .created)
    }

    /// The player creates a form of a character (R7, R23). The form shares the
    /// character's popularity. It costs nothing in the game (R11).
    @discardableResult
    public mutating func createForm(of characterID: CharacterID, _ draft: CharacterDraft) throws(RosterError) -> FormID {
        guard let i = index(of: characterID) else { throw .unknownCharacter(characterID) }
        var d = draft
        d.name = d.trimmedName
        try validateFeel(d, editingCharacter: nil, editingForm: nil)

        var shift = AudienceValues()
        for audience in Audience.allCases where !audience.isDerived {
            shift[audience] = appealRng.gauss() * Self.formShiftSpread
        }
        let id = nextID
        nextID += 1
        characters[i].forms.append(CharacterForm(
            id: id,
            name: d.name,
            role: d.role,
            primaryType: d.primaryType,
            secondaryType: d.secondaryType,
            archetype: d.archetype,
            palette: d.palette,
            body: d.body,
            person: characters[i].kind == .person ? d.person : nil,
            appealShift: shift,
            buzz: 0,
            createdWeek: week
        ))
        return id
    }

    /// The player changes a form (R9). It costs part of the character's affection.
    public mutating func redesignForm(_ formID: FormID, of characterID: CharacterID, _ draft: CharacterDraft) throws(RosterError) {
        guard let i = index(of: characterID) else { throw .unknownCharacter(characterID) }
        guard let f = characters[i].forms.firstIndex(where: { $0.id == formID }) else { throw .unknownForm(formID) }
        var d = draft
        d.name = d.trimmedName
        try validateFeel(d, editingCharacter: nil, editingForm: formID)

        let form = characters[i].forms[f]
        let old = CharacterDraft(from: form)
        var change = Self.feelChange(from: old, to: d)
        if characters[i].kind == .person ? form.person != d.person : form.body != d.body {
            change = min(1, change + 0.1)
        }
        let cost = Self.redesignCost * Self.formRedesignShare * change
        for audience in Audience.allCases where !audience.isDerived {
            characters[i].truth.affection[audience] -= cost
        }

        characters[i].forms[f].name = d.name
        characters[i].forms[f].role = d.role
        characters[i].forms[f].primaryType = d.primaryType
        characters[i].forms[f].secondaryType = d.secondaryType
        characters[i].forms[f].archetype = d.archetype
        characters[i].forms[f].palette = d.palette
        characters[i].forms[f].body = d.body
        if characters[i].kind == .person { characters[i].forms[f].person = d.person }
    }

    /// The player changes a character after its debut (R9). It costs affection.
    public mutating func redesign(_ id: CharacterID, _ draft: CharacterDraft) throws(RosterError) {
        guard let i = index(of: id) else { throw .unknownCharacter(id) }
        var d = draft
        d.name = d.trimmedName
        try validate(d, editing: id)

        let old = CharacterDraft(from: characters[i])
        var change = Self.feelChange(from: old, to: d)
        if d.looksDifferent(from: old) { change = min(1, change + 0.1) }
        let cost = Self.redesignCost * change
        for audience in Audience.allCases where !audience.isDerived {
            characters[i].truth.affection[audience] -= cost
        }

        characters[i].name = d.name
        characters[i].role = d.role
        characters[i].primaryType = d.primaryType
        characters[i].secondaryType = d.secondaryType
        characters[i].archetype = d.archetype
        characters[i].palette = d.palette
        characters[i].body = d.body
        characters[i].person = d.storedPerson
        // The forms follow the character's kind.
        for f in characters[i].forms.indices {
            characters[i].forms[f].person = d.kind == .person ? (characters[i].forms[f].person ?? d.person) : nil
        }
        characters[i].evolvesFrom = d.evolvesFrom
        applyLinks(id, counterpart: d.counterpart, rivals: d.rivals, companions: d.companions)
    }

    /// The player stops a character from appearing on new cards (R10).
    public mutating func retire(_ id: CharacterID) throws(RosterError) {
        guard let i = index(of: id) else { throw .unknownCharacter(id) }
        characters[i].status = .retired
    }

    /// The player brings a retired character back.
    public mutating func restore(_ id: CharacterID) throws(RosterError) {
        guard let i = index(of: id) else { throw .unknownCharacter(id) }
        characters[i].status = .active
    }

    /// Generated characters for a set's filler cards (R6, R13).
    /// The set system will call this when the player commits a set.
    @discardableResult
    public mutating func generateCharacters(count: Int) throws(RosterError) -> [CharacterID] {
        var ids: [CharacterID] = []
        for _ in 0..<count {
            let primary = generatorRng.pick(ElementType.allCases)
            var secondary: ElementType?
            if generatorRng.chance(0.25) {
                secondary = generatorRng.pick(ElementType.allCases.filter { $0 != primary })
            }
            let role = Self.weightedPick(Self.generatedRoleWeights, using: &generatorRng)
            let archetype = generatorRng.pick(Archetype.allCases)
            var palette: [PaletteColor] = []
            let colorCount = generatorRng.int(2, 3)
            while palette.count < colorCount {
                let color = generatorRng.pick(PaletteColor.allCases)
                if !palette.contains(color) { palette.append(color) }
            }
            let body = BodyParts.random(using: &generatorRng)
            let taken = Set(characters.map { $0.name.lowercased() })
            let name = NameGenerator.uniqueName(for: primary, taken: taken, using: &generatorRng)
            let draft = CharacterDraft(
                name: name, role: role, primaryType: primary, secondaryType: secondary,
                archetype: archetype, palette: palette, body: body
            )
            ids.append(try add(draft, origin: .generated))
        }
        return ids
    }

    /// One week passes (D9). Buzz, fatigue and awareness fade.
    /// Later systems (sets, the market, the hub) add their weekly work here.
    public mutating func advanceWeek() {
        week += 1
        for i in characters.indices {
            let formBuzz = characters[i].forms.map(\.buzz).max() ?? 0
            characters[i].buzz = max(characters[i].buzz, Self.formBuzzLift * formBuzz)
            for f in characters[i].forms.indices { characters[i].forms[f].buzz *= 0.85 }
            characters[i].buzz *= 0.85
            characters[i].fatigue *= 0.93
            characters[i].awareness = characters[i].awareness.map { $0 * 0.998 }
        }
    }

    // MARK: - Internals

    static let generatedRoleWeights: [(Role, Double)] = [
        (.companion, 0.65), (.trainer, 0.12), (.rival, 0.10),
        (.villain, 0.08), (.mythical, 0.03), (.legendary, 0.02),
    ]

    static func weightedPick<T, R: RandomNumberGenerator>(_ items: [(T, Double)], using rng: inout R) -> T {
        let total = items.reduce(0) { $0 + $1.1 }
        var roll = rng.unit() * total
        for (item, weight) in items {
            if roll < weight { return item }
            roll -= weight
        }
        return items[items.count - 1].0
    }

    /// How much the feel changed, 0...1. Body parts are flavor and are not counted here.
    static func feelChange(from old: CharacterDraft, to new: CharacterDraft) -> Double {
        var change = 0.0
        if old.primaryType != new.primaryType { change += 0.3 }
        if old.secondaryType != new.secondaryType { change += 0.1 }
        if old.archetype != new.archetype { change += 0.3 }
        if old.role != new.role { change += 0.15 }
        let oldColors = Set(old.palette)
        let newColors = Set(new.palette)
        let union = oldColors.union(newColors)
        if !union.isEmpty {
            let differing = Double(oldColors.symmetricDifference(newColors).count)
            change += 0.15 * differing / Double(union.count)
        }
        return min(1, change)
    }

    private mutating func add(_ draft: CharacterDraft, origin: Character.Origin) throws(RosterError) -> CharacterID {
        var d = draft
        d.name = d.trimmedName
        try validate(d, editing: nil)

        let spark = appealRng.gauss() * 12
        var random = AudienceValues()
        for audience in Audience.allCases where !audience.isDerived {
            random[audience] = spark + appealRng.gauss() * 8
        }
        let longevity = appealRng.unit()
        let readingSeed = appealRng.next()

        let awareness = AudienceValues()
        let affection = AudienceValues()
        let knowledge = AudienceValues()

        let id = nextID
        nextID += 1
        characters.append(Character(
            id: id,
            name: d.name,
            origin: origin,
            role: d.role,
            primaryType: d.primaryType,
            secondaryType: d.secondaryType,
            archetype: d.archetype,
            palette: d.palette,
            body: d.body,
            person: d.storedPerson,
            evolvesFrom: d.evolvesFrom,
            counterpart: nil,
            rivals: [],
            companions: [],
            forms: [],
            status: .active,
            createdWeek: week,
            truth: Character.Truth(randomPart: random, affection: affection, longevity: longevity),
            awareness: awareness,
            buzz: 0,
            fatigue: 0,
            knowledge: knowledge,
            readingSeed: readingSeed
        ))
        applyLinks(id, counterpart: d.counterpart, rivals: d.rivals, companions: d.companions)
        return id
    }

    /// Sets the symmetric links for one character and repairs the other side.
    private mutating func applyLinks(_ id: CharacterID, counterpart: CharacterID?, rivals: [CharacterID], companions: [CharacterID]) {
        guard let i = index(of: id) else { return }

        // Counterpart: one partner, on both sides.
        let oldPartner = characters[i].counterpart
        if let oldPartner, oldPartner != counterpart, let j = index(of: oldPartner) {
            characters[j].counterpart = nil
        }
        if let newPartner = counterpart, let j = index(of: newPartner) {
            if let partnersOld = characters[j].counterpart, partnersOld != id, let k = index(of: partnersOld) {
                characters[k].counterpart = nil
            }
            characters[j].counterpart = id
        }
        characters[i].counterpart = counterpart

        let newRivals = relink(id, old: characters[i].rivals, new: rivals, keyPath: \.rivals)
        characters[i].rivals = newRivals
        let newCompanions = relink(id, old: characters[i].companions, new: companions, keyPath: \.companions)
        characters[i].companions = newCompanions
    }

    private mutating func relink(
        _ id: CharacterID,
        old: [CharacterID],
        new: [CharacterID],
        keyPath: WritableKeyPath<Character, [CharacterID]>
    ) -> [CharacterID] {
        var cleaned: [CharacterID] = []
        for other in new where other != id && !cleaned.contains(other) && character(other) != nil {
            cleaned.append(other)
        }
        for removed in old where !cleaned.contains(removed) {
            if let j = index(of: removed) {
                characters[j][keyPath: keyPath].removeAll { $0 == id }
            }
        }
        for added in cleaned where !old.contains(added) {
            if let j = index(of: added), !characters[j][keyPath: keyPath].contains(id) {
                characters[j][keyPath: keyPath].append(id)
            }
        }
        return cleaned
    }

    /// The name and feel checks for a character or a form. A name must be
    /// unique across all characters and all forms.
    func validateFeel(_ d: CharacterDraft, editingCharacter: CharacterID?, editingForm: FormID?) throws(RosterError) {
        let name = d.trimmedName
        if name.isEmpty { throw .emptyName }
        if name.count > CharacterDraft.nameLimit { throw .nameTooLong }
        let key = name.lowercased()
        for c in characters {
            if c.id != editingCharacter, c.name.lowercased() == key { throw .duplicateName(name) }
            for f in c.forms where f.id != editingForm && f.name.lowercased() == key {
                throw .duplicateName(name)
            }
        }
        if !CharacterDraft.paletteRange.contains(d.palette.count) { throw .paletteSize }
        if Set(d.palette).count != d.palette.count { throw .duplicateColor }
        if let secondary = d.secondaryType, secondary == d.primaryType { throw .sameTypeTwice }
    }

    func validate(_ d: CharacterDraft, editing: CharacterID?) throws(RosterError) {
        try validateFeel(d, editingCharacter: editing, editingForm: nil)

        let links = [d.evolvesFrom, d.counterpart].compactMap { $0 } + d.rivals + d.companions
        for link in links {
            if link == editing { throw .linkToSelf }
            if character(link) == nil { throw .unknownCharacter(link) }
        }

        if let parent = d.evolvesFrom {
            if let editing {
                var current: CharacterID? = parent
                var seen: Set<CharacterID> = []
                while let step = current, !seen.contains(step) {
                    if step == editing { throw .lineLoop }
                    seen.insert(step)
                    current = character(step)?.evolvesFrom
                }
            }
            let below = editing.map { descendantDepth(of: $0) } ?? 0
            if stage(of: parent) + 1 + below > Self.maxStages { throw .lineTooLong }
        }
    }
}
