// The hidden fit tables (roster.md, section 5).
//
// Each table gives a value from -1 to 1 for one part of the feel and one
// audience. The player never sees these numbers. Release reports reveal them
// over time.
//
// Each new world perturbs the base tables, so the rules are similar in every
// save but the player must discover them again. Nothing carries between
// saves (decision D8).

public struct FitTables: Codable, Sendable, Equatable {
    /// [archetype][audience]
    public private(set) var archetype: [[Double]]
    /// [type][audience]
    public private(set) var type: [[Double]]
    /// [role][audience]
    public private(set) var role: [[Double]]

    /// The standard deviation of the per-world perturbation.
    public static let perturbation = 0.2

    public init(seed: UInt64) {
        var rng = Xoshiro256(seed: seed)
        archetype = Self.perturb(Self.baseArchetype, using: &rng)
        type = Self.perturb(Self.baseType, using: &rng)
        role = Self.perturb(Self.baseRole, using: &rng)
    }

    public func archetypeFit(_ value: Archetype, _ audience: Audience) -> Double {
        archetype[Archetype.allCases.firstIndex(of: value)!][audience.rawValue]
    }

    public func typeFit(_ value: ElementType, _ audience: Audience) -> Double {
        type[ElementType.allCases.firstIndex(of: value)!][audience.rawValue]
    }

    public func roleFit(_ value: Role, _ audience: Audience) -> Double {
        role[Role.allCases.firstIndex(of: value)!][audience.rawValue]
    }

    private static func perturb<R: RandomNumberGenerator>(_ table: [[Double]], using rng: inout R) -> [[Double]] {
        table.map { row in
            row.enumerated().map { index, value in
                // The derived audience (resellers) stays at 0 and draws nothing,
                // so its column never moves the stream.
                if Audience(rawValue: index)?.isDerived == true { return 0 }
                return min(1, max(-1, value + rng.gauss() * perturbation))
            }
        }
    }

    // Columns: kids, parents, teens, casual, competitive, nostalgia,
    // completionists, chase, art, investors, resellers.

    static let baseArchetype: [[Double]] = [
        /* cute */       [0.9, 0.8, -0.2, 0.3, 0.0, 0.5, 0.2, 0.3, 0.2, 0.1, 0],
        /* cool */       [0.3, 0.1, 0.8, 0.4, 0.1, 0.3, 0.1, 0.5, 0.3, 0.2, 0],
        /* fierce */     [0.4, -0.3, 0.7, 0.4, 0.2, 0.3, 0.1, 0.5, 0.2, 0.2, 0],
        /* mysterious */ [-0.1, -0.1, 0.5, 0.1, 0.1, 0.2, 0.2, 0.6, 0.6, 0.2, 0],
        /* goofy */      [0.8, 0.5, 0.2, 0.3, -0.1, 0.4, 0.2, -0.2, 0.1, -0.1, 0],
        /* majestic */   [0.2, 0.2, 0.4, 0.2, 0.1, 0.4, 0.2, 0.9, 0.6, 0.4, 0],
        /* elegant */    [0.1, 0.4, 0.2, 0.1, 0.0, 0.3, 0.3, 0.6, 0.8, 0.2, 0],
        /* creepy */     [-0.5, -0.8, 0.5, 0.0, 0.1, 0.1, 0.1, 0.2, 0.4, 0.0, 0],
    ]

    static let baseType: [[Double]] = [
        /* fire */   [0.5, 0.2, 0.5, 0.4, 0.1, 0.5, 0.1, 0.5, 0.2, 0.2, 0],
        /* water */  [0.4, 0.3, 0.2, 0.3, 0.1, 0.4, 0.1, 0.2, 0.3, 0.1, 0],
        /* nature */ [0.4, 0.5, 0.0, 0.2, 0.0, 0.3, 0.2, 0.0, 0.4, 0.0, 0],
        /* storm */  [0.5, 0.2, 0.4, 0.3, 0.1, 0.4, 0.1, 0.3, 0.2, 0.1, 0],
        /* ice */    [0.2, 0.3, 0.3, 0.1, 0.0, 0.2, 0.1, 0.4, 0.5, 0.1, 0],
        /* stone */  [0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.1, -0.1, 0.0, 0.0, 0],
        /* sky */    [0.3, 0.3, 0.2, 0.2, 0.0, 0.2, 0.1, 0.3, 0.4, 0.1, 0],
        /* shadow */ [-0.1, -0.4, 0.6, 0.2, 0.1, 0.2, 0.1, 0.5, 0.4, 0.2, 0],
        /* light */  [0.3, 0.5, 0.1, 0.1, 0.0, 0.3, 0.1, 0.5, 0.5, 0.2, 0],
        /* mystic */ [0.2, 0.1, 0.4, 0.2, 0.1, 0.3, 0.2, 0.5, 0.6, 0.2, 0],
        /* metal */  [0.1, 0.0, 0.4, 0.2, 0.2, 0.1, 0.1, 0.3, 0.2, 0.1, 0],
        /* dragon */ [0.4, 0.1, 0.7, 0.4, 0.2, 0.5, 0.2, 0.9, 0.4, 0.5, 0],
    ]

    static let baseRole: [[Double]] = [
        /* starter */   [0.8, 0.6, 0.3, 0.6, 0.1, 0.8, 0.4, 0.4, 0.2, 0.3, 0],
        /* companion */ [0.3, 0.3, 0.1, 0.2, 0.0, 0.2, 0.3, -0.1, 0.1, -0.1, 0],
        /* mascot */    [0.9, 0.8, 0.0, 0.3, 0.0, 0.7, 0.3, 0.4, 0.2, 0.4, 0],
        /* legendary */ [0.4, 0.2, 0.6, 0.3, 0.2, 0.6, 0.3, 0.9, 0.5, 0.7, 0],
        /* mythical */  [0.3, 0.1, 0.5, 0.2, 0.1, 0.4, 0.4, 0.8, 0.6, 0.6, 0],
        /* villain */   [-0.2, -0.5, 0.6, 0.2, 0.1, 0.3, 0.1, 0.4, 0.4, 0.2, 0],
        /* rival */     [0.2, 0.0, 0.6, 0.3, 0.1, 0.3, 0.1, 0.3, 0.2, 0.1, 0],
        /* trainer */   [0.1, 0.1, 0.3, 0.4, 0.3, 0.4, 0.2, 0.4, 0.5, 0.2, 0],
    ]
}
