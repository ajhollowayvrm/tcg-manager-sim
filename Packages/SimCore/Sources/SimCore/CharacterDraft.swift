import Foundation

// The fields that the player edits in the character creator.

public struct CharacterDraft: Sendable, Equatable {
    public var name: String
    public var role: Role
    public var primaryType: ElementType
    public var secondaryType: ElementType?
    public var archetype: Archetype
    public var palette: [PaletteColor]
    /// FLAVOR. Creature or person (R14). It selects which look is used.
    public var kind: CharacterKind
    /// The creature look. Kept when the player switches to a person, so a switch back restores it.
    public var body: BodyParts
    /// The person look. Kept when the player switches to a creature.
    public var person: PersonParts
    public var evolvesFrom: CharacterID?
    public var counterpart: CharacterID?
    public var rivals: [CharacterID]
    public var companions: [CharacterID]

    public static let nameLimit = 24
    public static let paletteRange = 2...3

    public init(
        name: String = "",
        role: Role = .companion,
        primaryType: ElementType = .fire,
        secondaryType: ElementType? = nil,
        archetype: Archetype = .cute,
        palette: [PaletteColor] = [.ember, .sunflower],
        kind: CharacterKind = .creature,
        body: BodyParts = BodyParts(),
        person: PersonParts = PersonParts(),
        evolvesFrom: CharacterID? = nil,
        counterpart: CharacterID? = nil,
        rivals: [CharacterID] = [],
        companions: [CharacterID] = []
    ) {
        self.name = name
        self.role = role
        self.primaryType = primaryType
        self.secondaryType = secondaryType
        self.archetype = archetype
        self.palette = palette
        self.kind = kind
        self.body = body
        self.person = person
        self.evolvesFrom = evolvesFrom
        self.counterpart = counterpart
        self.rivals = rivals
        self.companions = companions
    }

    /// A draft that starts from an existing character (for a redesign or a form).
    public init(from character: Character) {
        self.init(
            name: character.name,
            role: character.role,
            primaryType: character.primaryType,
            secondaryType: character.secondaryType,
            archetype: character.archetype,
            palette: character.palette,
            kind: character.kind,
            body: character.body,
            person: character.person ?? PersonParts(),
            evolvesFrom: character.evolvesFrom,
            counterpart: character.counterpart,
            rivals: character.rivals,
            companions: character.companions
        )
    }

    /// A draft that starts from a form, to edit it. Relations belong to the character.
    public init(from form: CharacterForm) {
        self.init(
            name: form.name,
            role: form.role,
            primaryType: form.primaryType,
            secondaryType: form.secondaryType,
            archetype: form.archetype,
            palette: form.palette,
            kind: form.kind,
            body: form.body,
            person: form.person ?? PersonParts()
        )
    }

    /// The person look to store on a character: nil for a creature.
    var storedPerson: PersonParts? { kind == .person ? person : nil }

    /// True when the visible look differs: the kind, or the parts of the current kind.
    func looksDifferent(from other: CharacterDraft) -> Bool {
        if kind != other.kind { return true }
        return kind == .person ? person != other.person : body != other.body
    }

    public var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public enum RosterError: Error, Equatable, Sendable {
    case emptyName
    case nameTooLong
    case duplicateName(String)
    case paletteSize
    case duplicateColor
    case sameTypeTwice
    case unknownCharacter(CharacterID)
    case linkToSelf
    case lineTooLong
    case lineLoop
    case unknownForm(FormID)

    public var message: String {
        switch self {
        case .emptyName: "Give the character a name."
        case .nameTooLong: "Use \(CharacterDraft.nameLimit) characters or fewer for the name."
        case .duplicateName(let name): "The roster already has a character named \(name)."
        case .paletteSize: "Pick two or three colors."
        case .duplicateColor: "Pick different colors."
        case .sameTypeTwice: "The second type must be different from the first type."
        case .unknownCharacter: "A linked character does not exist."
        case .linkToSelf: "A character cannot link to itself."
        case .lineTooLong: "An evolution line has a maximum of three stages."
        case .lineLoop: "This link makes an evolution loop."
        case .unknownForm: "That form does not exist."
        }
    }
}
