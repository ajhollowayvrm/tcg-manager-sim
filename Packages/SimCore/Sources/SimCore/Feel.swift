// The four parts of a character's feel (decision R1), and the eleven
// audiences (decisions R8 and R12). See docs/design/roster.md, section 3.

public enum Audience: Int, CaseIterable, Codable, Sendable, Identifiable {
    case kids
    case parents
    case teens
    case casualPlayers
    case competitivePlayers
    case nostalgiaAdults
    case completionists
    case chaseCollectors
    case artCollectors
    case investors
    case resellers

    public var id: Int { rawValue }

    public var name: String {
        switch self {
        case .kids: "Kids"
        case .parents: "Parents and gift buyers"
        case .teens: "Teens"
        case .casualPlayers: "Casual players"
        case .competitivePlayers: "Competitive players"
        case .nostalgiaAdults: "Nostalgia adults"
        case .completionists: "Set completionists"
        case .chaseCollectors: "Chase collectors"
        case .artCollectors: "Art collectors"
        case .investors: "Graders and investors"
        case .resellers: "Resellers and scalpers"
        }
    }

    /// Resellers do not respond to a character's feel. Their appeal comes from
    /// what the other audiences want (roster.md, section 3.4).
    public var isDerived: Bool { self == .resellers }
}

public enum ElementType: String, CaseIterable, Codable, Sendable, Identifiable {
    case fire, water, nature, storm, ice, stone, sky, shadow, light, mystic, metal, dragon

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }
}

public enum Archetype: String, CaseIterable, Codable, Sendable, Identifiable {
    case cute, cool, fierce, mysterious, goofy, majestic, elegant, creepy

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }
}

public enum Role: String, CaseIterable, Codable, Sendable, Identifiable {
    case starter, companion, mascot, legendary, mythical, villain, rival, trainer

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .trainer: "Human trainer"
        default: rawValue.capitalized
        }
    }
}

/// The fixed list of palette colors. The app maps each one to a display color.
public enum PaletteColor: String, CaseIterable, Codable, Sendable, Identifiable {
    case crimson, ember, gold, sunflower, lime, forest, teal, sky
    case ocean, indigo, violet, rose, cream, slate, charcoal, snow

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }
}

/// Body parts are FLAVOR: they control the drawing only, and no system reads them.
public struct BodyParts: Codable, Sendable, Equatable, Hashable {
    public enum Shape: String, CaseIterable, Codable, Sendable { case round, egg, wide, tall, bird, serpent }
    public enum Head: String, CaseIterable, Codable, Sendable { case none, catEars, longEars, horns, antennae, crest, sprout }
    public enum Eyes: String, CaseIterable, Codable, Sendable { case round, sparkle, sleepy, sharp, big, single }
    public enum Tail: String, CaseIterable, Codable, Sendable { case none, stub, long, flame, leaf, fin }
    public enum Pattern: String, CaseIterable, Codable, Sendable { case none, spots, stripes, belly, mask }

    public var shape: Shape
    public var head: Head
    public var eyes: Eyes
    public var tail: Tail
    public var pattern: Pattern

    public init(shape: Shape = .round, head: Head = .catEars, eyes: Eyes = .sparkle, tail: Tail = .stub, pattern: Pattern = .belly) {
        self.shape = shape
        self.head = head
        self.eyes = eyes
        self.tail = tail
        self.pattern = pattern
    }

    public static func random<R: RandomNumberGenerator>(using rng: inout R) -> BodyParts {
        BodyParts(
            shape: rng.pick(Shape.allCases),
            head: rng.pick(Head.allCases),
            eyes: rng.pick(Eyes.allCases),
            tail: rng.pick(Tail.allCases),
            pattern: rng.pick(Pattern.allCases)
        )
    }
}

/// A creature or a person (decision R14). FLAVOR: it selects the drawing and
/// the look parts. No system reads it yet. A mascot can be either kind.
public enum CharacterKind: String, CaseIterable, Codable, Sendable, Identifiable {
    case creature, person

    public var id: String { rawValue }
    public var name: String { rawValue.capitalized }
}

/// The look of a person. FLAVOR: it controls the drawing only, and no system reads it.
/// The palette colors the person: the first color is the outfit, the second is
/// the hair, and the third is the detail.
public struct PersonParts: Codable, Sendable, Equatable, Hashable {
    public enum Skin: String, CaseIterable, Codable, Sendable { case porcelain, light, tan, olive, brown, deep }
    public enum Hair: String, CaseIterable, Codable, Sendable { case short, long, ponytail, spiky, bun, none }
    public enum Eyes: String, CaseIterable, Codable, Sendable { case round, sparkle, sleepy, sharp, big }
    public enum Outfit: String, CaseIterable, Codable, Sendable { case tee, jacket, hoodie, dress, coat, uniform }
    public enum Accessory: String, CaseIterable, Codable, Sendable { case none, glasses, headband, scarf, cap, cape }

    public var skin: Skin
    public var hair: Hair
    public var eyes: Eyes
    public var outfit: Outfit
    public var accessory: Accessory

    public init(skin: Skin = .tan, hair: Hair = .short, eyes: Eyes = .round, outfit: Outfit = .jacket, accessory: Accessory = .none) {
        self.skin = skin
        self.hair = hair
        self.eyes = eyes
        self.outfit = outfit
        self.accessory = accessory
    }

    public static func random<R: RandomNumberGenerator>(using rng: inout R) -> PersonParts {
        PersonParts(
            skin: rng.pick(Skin.allCases),
            hair: rng.pick(Hair.allCases),
            eyes: rng.pick(Eyes.allCases),
            outfit: rng.pick(Outfit.allCases),
            accessory: rng.pick(Accessory.allCases)
        )
    }
}

/// One Double for each audience.
public struct AudienceValues: Codable, Sendable, Equatable {
    public var values: [Double]

    public init(repeating value: Double = 0) {
        values = Array(repeating: value, count: Audience.allCases.count)
    }

    public subscript(audience: Audience) -> Double {
        get { values[audience.rawValue] }
        set { values[audience.rawValue] = newValue }
    }

    public func map(_ transform: (Double) -> Double) -> AudienceValues {
        var copy = self
        copy.values = values.map(transform)
        return copy
    }
}
