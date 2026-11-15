// The rarity feel of a tier: how rare its cards look (decision C23).
//
// Each part of a tier's look gives feel points: the symbol, the layout, the
// foils, the texture, the stamps, the frame, and the secret number. A tier must
// feel rarer than every more common tier. The ladder editor shows the feel and
// the upgrade over the tier below. Chase collectors buy less of a set whose
// rarer tiers feel less rare than its more common tiers (Demand.swift).

/// One part of a tier's feel, for example the layout for 4 points.
public struct FeelPart: Sendable, Equatable {
    public enum Kind: Int, CaseIterable, Sendable {
        case symbol, layout, foil, texture, stamp, frame, secret
    }

    public let kind: Kind
    public let points: Int
}

/// A rarer tier that feels less rare than a more common tier of the same ladder.
public struct FeelInversion: Sendable, Equatable {
    /// The rarer tier.
    public let tier: RarityTier
    /// The more common tier that feels rarer.
    public let below: RarityTier
}

public enum RarityFeel {
    public static func symbol(_ symbol: RaritySymbol) -> Int {
        switch symbol {
        case .circle, .square, .triangle: 0
        case .diamond, .pentagon, .hexagon, .octagon, .heart, .club, .spade, .leaf, .drop: 1
        case .star, .moon, .sun, .bolt, .snowflake, .flame, .shield, .eye: 2
        case .sparkle, .infinity, .trophy: 3
        case .crown: 4
        }
    }

    public static func layout(_ layout: CardLayout) -> Int {
        switch layout {
        case .standard: 0
        case .extendedArt: 2
        case .showcase, .frameBreak: 3
        case .fullArt: 4
        case .borderless: 5
        }
    }

    public static func foil(_ foil: FoilPattern) -> Int {
        switch foil {
        case .none: 0
        case .reverseHolo: 1
        case .holo, .patternReverse: 2
        case .cosmos, .crackedIce, .galaxy, .etched: 3
        case .rainbow: 4
        case .gold: 5
        }
    }

    public static func stamp(_ stamp: CardStamp) -> Int {
        switch stamp {
        case .none: 0
        case .eventStamp: 1
        case .signature: 3
        case .serialized: 4
        }
    }

    public static func frame(_ frame: FrameStyle) -> Int {
        switch frame {
        case .solid: 0
        case .black: 1
        case .silver: 2
        case .gold, .rainbow: 3
        }
    }

    public static let textured = 2
    public static let secret = 4

    /// The parts of a tier's feel, one for each kind that gives points.
    /// Each extra symbol adds 1 point. The best foil gives its full points, and
    /// each extra stacked foil adds 1 point. Each stamp gives its full points.
    public static func parts(_ tier: RarityTier) -> [FeelPart] {
        let look = tier.look
        let foils = look.foils.map(foil)
        return [
            FeelPart(kind: .symbol, points: symbol(tier.symbol) + tier.symbolCount - 1),
            FeelPart(kind: .layout, points: layout(look.layout)),
            FeelPart(kind: .foil, points: (foils.max() ?? 0) + max(0, foils.count - 1)),
            FeelPart(kind: .texture, points: look.textured ? textured : 0),
            FeelPart(kind: .stamp, points: look.stamps.reduce(0) { $0 + stamp($1) }),
            FeelPart(kind: .frame, points: frame(tier.frameStyle)),
            FeelPart(kind: .secret, points: tier.secret ? secret : 0),
        ]
    }

    /// The tier's feel: the sum of its parts. A plain common tier is 0.
    public static func score(_ tier: RarityTier) -> Int {
        parts(tier).reduce(0) { $0 + $1.points }
    }

    /// The parts of `tier` that give more points than in `lower` (the upgrades),
    /// and the parts that give fewer (the downgrades).
    public static func change(from lower: RarityTier, to tier: RarityTier) -> (up: [FeelPart], down: [FeelPart]) {
        let old = parts(lower)
        var up: [FeelPart] = []
        var down: [FeelPart] = []
        for part in parts(tier) {
            guard let before = old.first(where: { $0.kind == part.kind }) else { continue }
            if part.points > before.points { up.append(part) }
            if part.points < before.points { down.append(before) }
        }
        return (up, down)
    }

    /// Each tier that feels less rare than a more common tier. The more common
    /// tier is the one with the highest feel. `only` limits the check to some tiers,
    /// for example the tiers that have cards in a set.
    public static func inversions(_ ladder: RarityLadder, only: Set<TierID>? = nil) -> [FeelInversion] {
        let tiers = ladder.tiers.filter { only?.contains($0.id) ?? true }
        var result: [FeelInversion] = []
        for (i, tier) in tiers.enumerated() where i > 0 {
            let score = score(tier)
            guard let below = tiers[..<i].max(by: { self.score($0) < self.score($1) }),
                  self.score(below) > score else { continue }
            result.append(FeelInversion(tier: tier, below: below))
        }
        return result
    }

    /// The chase collectors' demand factor for a set: 1 when every tier feels
    /// rarer than the tiers below it, and 8% less for each inversion, down to 0.7.
    public static func demandFactor(inversions: Int) -> Double {
        max(0.7, 1 - 0.08 * Double(inversions))
    }
}
