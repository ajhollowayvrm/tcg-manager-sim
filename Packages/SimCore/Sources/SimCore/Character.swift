// A roster character (docs/design/roster.md, section 3).
//
// Field audit rule: every field has a reader, a screen, and a report line,
// or it is labeled FLAVOR. Some readers belong to systems that are not built
// yet (set design, artists, the market). Those fields say so.

public typealias CharacterID = Int

public struct Character: Codable, Sendable, Equatable, Identifiable {
    public enum Origin: String, Codable, Sendable { case created, generated }
    public enum Status: String, Codable, Sendable { case active, retired }

    public let id: CharacterID

    // MARK: Identity (the player or the generator sets these)

    /// FLAVOR.
    public internal(set) var name: String
    /// Display and filters only. The simulation treats both origins the same.
    public let origin: Origin
    /// Reader: appeal (role × audience fit).
    public internal(set) var role: Role
    /// Reader: appeal (type × audience fit).
    public internal(set) var primaryType: ElementType
    /// Reader: appeal, at half weight.
    public internal(set) var secondaryType: ElementType?
    /// Reader: appeal (archetype × audience fit).
    public internal(set) var archetype: Archetype
    /// Two or three colors. Reader: special-rarity match (set design, not built yet).
    public internal(set) var palette: [PaletteColor]
    /// FLAVOR. The creature drawing only.
    public internal(set) var body: BodyParts
    /// FLAVOR. The person drawing only (R14). Nil means the character is a creature.
    /// It is optional so that a save from before R14 loads, with every character a creature.
    public internal(set) var person: PersonParts?

    /// FLAVOR. Creature or person (R14).
    public var kind: CharacterKind { person == nil ? .creature : .person }

    // MARK: Relations

    /// The previous stage in an evolution line. Reader: art-set bonus (set design, not built yet).
    public internal(set) var evolvesFrom: CharacterID?
    /// Reader: parallel-set bonus (set design, not built yet). Always symmetric.
    public internal(set) var counterpart: CharacterID?
    /// Reader: cameo demand (set design, not built yet). Always symmetric.
    public internal(set) var rivals: [CharacterID]
    /// Reader: cameo demand (set design, not built yet). Always symmetric.
    public internal(set) var companions: [CharacterID]

    /// The forms of this character (R23). Each form shares this character's
    /// popularity and adds its own appeal shift and buzz.
    public internal(set) var forms: [CharacterForm]

    /// Reader: the set designer and the generator (not built yet).
    public internal(set) var status: Status
    /// The week the character joined the roster.
    public let createdWeek: Int

    // MARK: Hidden truth (the player never sees these directly)

    public internal(set) var truth: Truth

    // MARK: Visible state

    /// The share of each audience that knows the character, 0...1. Starts at 0 (R5).
    public internal(set) var awareness: AudienceValues
    /// Short-term attention, 0...100.
    public internal(set) var buzz: Double
    /// Overuse, 0...100.
    public internal(set) var fatigue: Double
    /// How well the studio knows each audience's true appeal, 0...1.
    /// It sets the width of a reading.
    public internal(set) var knowledge: AudienceValues
    /// A fixed seed for readings. A reading never draws from a world stream.
    public let readingSeed: UInt64

    public struct Truth: Codable, Sendable, Equatable {
        /// The random part of base appeal, for each audience.
        public internal(set) var randomPart: AudienceValues
        /// Appeal earned or lost over time, for each audience.
        public internal(set) var affection: AudienceValues
        /// 0...1. Does affection fade (low) or grow (high) with age?
        /// Reader: the yearly affection update (market system, not built yet).
        public internal(set) var longevity: Double
    }
}

// MARK: - Appeal, popularity, and readings

public struct Reading: Sendable, Equatable {
    public let low: Double
    public let high: Double
    public var mid: Double { (low + high) / 2 }
}

extension Character {
    public static let appealRange: ClosedRange<Double> = -50...100

    /// The fit part of base appeal for one audience. Derived from the feel.
    public func fitPart(_ audience: Audience, fits: FitTables) -> Double {
        Self.fitPart(role: role, primaryType: primaryType, secondaryType: secondaryType,
                     archetype: archetype, audience: audience, fits: fits)
    }

    /// The fit part of base appeal for any feel. A form uses it too.
    static func fitPart(
        role: Role,
        primaryType: ElementType,
        secondaryType: ElementType?,
        archetype: Archetype,
        audience: Audience,
        fits: FitTables
    ) -> Double {
        guard !audience.isDerived else { return 0 }
        var typeFit = fits.typeFit(primaryType, audience)
        if let secondaryType {
            typeFit = (typeFit + 0.5 * fits.typeFit(secondaryType, audience)) / 1.5
        }
        return 20
            + 30 * fits.archetypeFit(archetype, audience)
            + 18 * typeFit
            + 18 * fits.roleFit(role, audience)
    }

    /// True appeal for one audience: base appeal (fit + random) plus affection.
    /// Resellers are derived from the other audiences (roster.md, section 3.4).
    public func trueAppeal(_ audience: Audience, fits: FitTables) -> Double {
        if audience.isDerived {
            return resellerAppeal(fits: fits)
        }
        let raw = fitPart(audience, fits: fits) + truth.randomPart[audience] + truth.affection[audience]
        return Self.clampAppeal(raw)
    }

    /// Popularity = awareness × true appeal.
    public func popularity(_ audience: Audience, fits: FitTables) -> Double {
        awareness[audience] * trueAppeal(audience, fits: fits)
    }

    /// Resellers follow what the other audiences want, scaled by buzz.
    /// The market system will replace this with the real resale gap.
    func resellerAppeal(fits: FitTables) -> Double {
        let others = Audience.allCases.filter { !$0.isDerived }
        let top = others
            .map { awareness[$0] * Self.clampAppeal(fitPart($0, fits: fits) + truth.randomPart[$0] + truth.affection[$0]) }
            .sorted(by: >)
            .prefix(3)
        let mean = top.reduce(0, +) / Double(max(top.count, 1))
        return Self.clampAppeal(mean * (0.5 + buzz / 100))
    }

    /// The range that the player sees. Pure: it never draws from a world stream,
    /// so a repaint cannot change the world.
    public func reading(_ audience: Audience, fits: FitTables) -> Reading {
        let truthValue = trueAppeal(audience, fits: fits)
        let half = 4 + 36 * (1 - min(1, max(0, knowledge[audience])))
        var rng = SplitMix64(seed: readingSeed &+ UInt64(audience.rawValue + 1) &* 0x9E37_79B9_7F4A_7C15)
        let bias = rng.unit() * 2 - 1
        let center = truthValue + bias * half * 0.6
        return Reading(
            low: max(Self.appealRange.lowerBound, center - half),
            high: min(Self.appealRange.upperBound, center + half)
        )
    }

    static func clampAppeal(_ value: Double) -> Double {
        min(appealRange.upperBound, max(appealRange.lowerBound, value))
    }
}
