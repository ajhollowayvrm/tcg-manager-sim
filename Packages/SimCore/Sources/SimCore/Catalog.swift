// Cards, sets, and rarity ladders (docs/design/cards.md).
//
// The catalog has its own ID counter and its own random stream. Character IDs
// and form IDs come from the world. Card, set, and ladder IDs come
// from the catalog.

import Foundation

public typealias SetID = Int
public typealias CardID = Int
public typealias LadderID = Int
public typealias TierID = Int
public typealias VersionID = Int

// MARK: - Rarity

/// The shape in a card's rarity corner. FLAVOR. A tier shows it one to three
/// times (`RarityTier.symbolCount`). Reader: the rarity feel (RarityFeel.swift).
public enum RaritySymbol: String, CaseIterable, Codable, Sendable, Identifiable {
    case circle, square, triangle, diamond, pentagon, hexagon, octagon, heart
    case club, spade, leaf, drop, star, moon, sun, bolt
    case snowflake, flame, shield, eye, sparkle, infinity, trophy, crown

    public var id: String { rawValue }
}

/// The style of a card frame. FLAVOR. A tier sets it, so every card at that
/// tier gets the same frame, for example a rainbow frame for every SIR (C14).
public enum FrameStyle: String, CaseIterable, Codable, Sendable, Identifiable {
    /// One palette color: the tier's color.
    case solid
    case rainbow, gold, silver, black

    public var id: String { rawValue }
}

/// One tier of a rarity ladder (C4). The tier's place in the ladder is its rank:
/// the first tier is the most common.
public struct RarityTier: Codable, Sendable, Equatable, Hashable, Identifiable {
    /// Unique in its ladder. A set's copy of a ladder keeps the same tier IDs.
    public let id: TierID
    /// FLAVOR.
    public var name: String
    /// FLAVOR. 1 to 4 characters, for example "SIR".
    public var code: String
    /// FLAVOR.
    public var symbol: RaritySymbol
    /// How many times the corner shows the symbol, 1 to 3. For example, two stars.
    public var symbolCount: Int
    /// FLAVOR. The tier's color: the frame color of a solid frame, and the color of the tier's chip.
    public var color: PaletteColor
    /// FLAVOR. The frame of every card at this tier (C14).
    public var frameStyle: FrameStyle
    /// FLAVOR. The layout, foil, texture, and stamp of every card at this tier (C15).
    public var look: CardLook

    /// Extra printed versions of every card at this tier, for example a reverse holo (C16).
    /// A card can turn one off. The tier's own look is the base version.
    public var versions: [CardVersion]
    /// The share of a set's filler cards at this tier, 0 to 100 (S4). The shares
    /// of a ladder add up to 100. Reader: the filler (sets.md, section 4.2).
    public var fillerShare: Int
    /// A secret tier's cards number above the printed set total, for example "205/191" (S11).
    /// Reader: card numbers. Set completion appeal (market, not built yet).
    public var secret: Bool

    public init(
        id: TierID,
        name: String,
        code: String,
        symbol: RaritySymbol,
        symbolCount: Int = 1,
        color: PaletteColor,
        frameStyle: FrameStyle = .solid,
        look: CardLook = .plain,
        versions: [CardVersion] = [],
        fillerShare: Int = 0,
        secret: Bool = false
    ) {
        self.id = id
        self.name = name
        self.code = code
        self.symbol = symbol
        self.symbolCount = min(Self.symbolCountRange.upperBound, max(Self.symbolCountRange.lowerBound, symbolCount))
        self.color = color
        self.frameStyle = frameStyle
        self.look = look
        self.versions = versions
        self.fillerShare = fillerShare
        self.secret = secret
    }

    public static let symbolCountRange = 1...3

    private enum CodingKeys: String, CodingKey {
        case id, name, code, symbol, symbolCount, color, frameStyle, look, versions, fillerShare, secret
    }

    /// Reads a save from before the symbol count. The old symbols "doubleStar"
    /// and "tripleStar" become a star shown two or three times.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(TierID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        code = try c.decode(String.self, forKey: .code)
        let raw = try c.decode(String.self, forKey: .symbol)
        let legacyCount: Int
        switch raw {
        case "doubleStar": symbol = .star; legacyCount = 2
        case "tripleStar": symbol = .star; legacyCount = 3
        default: symbol = RaritySymbol(rawValue: raw) ?? .circle; legacyCount = 1
        }
        symbolCount = try c.decodeIfPresent(Int.self, forKey: .symbolCount) ?? legacyCount
        color = try c.decode(PaletteColor.self, forKey: .color)
        frameStyle = try c.decode(FrameStyle.self, forKey: .frameStyle)
        look = try c.decode(CardLook.self, forKey: .look)
        versions = try c.decode([CardVersion].self, forKey: .versions)
        fillerShare = try c.decode(Int.self, forKey: .fillerShare)
        secret = try c.decode(Bool.self, forKey: .secret)
    }

    /// One tap on the symbol in the tier editor: the same symbol shows one more
    /// time, up to three, then goes back to one. A new symbol starts at one.
    public mutating func tapSymbol(_ tapped: RaritySymbol) {
        if tapped == symbol {
            symbolCount = symbolCount >= Self.symbolCountRange.upperBound ? 1 : symbolCount + 1
        } else {
            symbol = tapped
            symbolCount = 1
        }
    }

    /// The tier's own look as a version. Every card at the tier has it.
    public var baseVersion: CardVersion {
        CardVersion(id: CardVersion.baseID, name: "Base", frameStyle: frameStyle, look: look)
    }

    /// Extra dollars for each printed copy of a card at this tier, in its base
    /// version. The game sets it from the look (C17). Reader: the print system (not built yet).
    public var costPerCopy: Double { baseVersion.costPerCopy }

    /// An ID for a new extra version of this tier.
    public var nextVersionID: VersionID {
        (versions.map(\.id).max() ?? CardVersion.baseID) + 1
    }
}

/// An ordered list of tiers, from the most common to the rarest (C4).
/// Reader of the order: the print system (not built yet). Pull rates (C9)
/// arrive with the pack design.
public struct RarityLadder: Codable, Sendable, Equatable, Identifiable {
    public let id: LadderID
    public var name: String
    public var tiers: [RarityTier]

    public static let tierRange = 2...12
    public static let codeLimit = 4
    public static let nameLimit = 30

    public init(id: LadderID, name: String, tiers: [RarityTier]) {
        self.id = id
        self.name = name
        self.tiers = tiers
    }

    public func tier(_ id: TierID) -> RarityTier? {
        tiers.first { $0.id == id }
    }

    /// 1 is the most common tier.
    public func rank(of id: TierID) -> Int? {
        tiers.firstIndex { $0.id == id }.map { $0 + 1 }
    }

    /// An ID for a new tier in this ladder.
    public var nextTierID: TierID {
        (tiers.map(\.id).max() ?? 0) + 1
    }

    /// The default preset: a modern ladder with nine tiers (cards.md, section 4.2).
    public static func defaultLadder(id: LadderID) -> RarityLadder {
        RarityLadder(id: id, name: "Modern (default)", tiers: [
            RarityTier(id: 1, name: "Common", code: "C", symbol: .circle, color: .slate, versions: [.reverseHolo], fillerShare: 50),
            RarityTier(id: 2, name: "Uncommon", code: "U", symbol: .diamond, color: .forest, versions: [.reverseHolo], fillerShare: 33),
            RarityTier(id: 3, name: "Rare", code: "R", symbol: .star, color: .ocean, versions: [.reverseHolo], fillerShare: 17),
            RarityTier(id: 4, name: "Holo Rare", code: "HR", symbol: .star, color: .indigo,
                       look: CardLook(foil: .holo), versions: [.reverseHolo]),
            RarityTier(id: 5, name: "Double Rare", code: "RR", symbol: .star, symbolCount: 2, color: .crimson,
                       look: CardLook(foil: .cosmos)),
            RarityTier(id: 6, name: "Ultra Rare", code: "UR", symbol: .star, symbolCount: 2, color: .violet, frameStyle: .silver,
                       look: CardLook(layout: .fullArt, foil: .holo, textured: true)),
            RarityTier(id: 7, name: "Illustration Rare", code: "IR", symbol: .sparkle, color: .teal,
                       look: CardLook(layout: .borderless, foil: .holo), secret: true),
            RarityTier(id: 8, name: "Special Illustration Rare", code: "SIR", symbol: .crown, color: .rose, frameStyle: .rainbow,
                       look: CardLook(layout: .frameBreak, foil: .holo, textured: true), secret: true),
            RarityTier(id: 9, name: "Gold", code: "G", symbol: .crown, color: .gold, frameStyle: .gold,
                       look: CardLook(layout: .fullArt, foil: .gold, textured: true), secret: true),
        ])
    }
}

// MARK: - Card looks

/// Where the art sits on the card (C14). FLAVOR: the look only.
public enum CardLayout: String, CaseIterable, Codable, Sendable, Identifiable {
    /// The art is in a box inside the frame.
    case standard
    /// The art box reaches the left and right edges. The name and the rarity stay in the frame.
    case extendedArt
    /// The art fills the card inside a thin frame. The name sits on the art.
    case fullArt
    /// No frame. The art reaches every edge of the card.
    case borderless
    /// The character comes out of the art box and over the frame.
    case frameBreak
    /// A decorated frame with ornaments in the corners.
    case showcase

    public var id: String { rawValue }
}

/// The foil pattern (C14). FLAVOR: the look only.
public enum FoilPattern: String, CaseIterable, Codable, Sendable, Identifiable {
    case none
    /// A smooth shine on the art.
    case holo
    /// A shine on the frame. The art stays plain.
    case reverseHolo
    /// A shine on the frame with a repeating symbol, like a Poké Ball pattern.
    case patternReverse
    /// Dots and circles on the art.
    case cosmos
    /// Sharp shards, like broken ice.
    case crackedIce
    /// Small stars over the whole card.
    case galaxy
    /// A matte card with metallic lines on the frame.
    case etched
    /// A rainbow over the whole card.
    case rainbow
    /// Gold glitter over the whole card.
    case gold

    public var id: String { rawValue }
}

/// A mark printed on the card (C14). FLAVOR: the look only.
public enum CardStamp: String, CaseIterable, Codable, Sendable, Identifiable {
    case none
    /// A serial number, for example 001/250.
    case serialized
    /// A signature.
    case signature
    /// A round stamp, for example for an event or a launch.
    case eventStamp

    public var id: String { rawValue }
}

/// How a card looks: four parts that combine (C14). A rarity tier sets it (C15).
/// A look can stack foils and stamps, for example Cracked ice and Etched, or a
/// signature and a serial number.
public struct CardLook: Codable, Sendable, Equatable, Hashable {
    public var layout: CardLayout
    /// The foils, in the order of `FoilPattern.allCases`. Never `.none`. Empty for no foil.
    public private(set) var foils: [FoilPattern]
    /// A raised surface that you can feel.
    public var textured: Bool
    /// The stamps, in the order of `CardStamp.allCases`. Never `.none`. Empty for no stamp.
    public private(set) var stamps: [CardStamp]

    public init(layout: CardLayout = .standard, foil: FoilPattern = .none, textured: Bool = false, stamp: CardStamp = .none) {
        self.init(layout: layout, foils: [foil], textured: textured, stamps: [stamp])
    }

    public init(layout: CardLayout = .standard, foils: [FoilPattern], textured: Bool = false, stamps: [CardStamp] = []) {
        self.layout = layout
        self.foils = Self.normal(foils, none: .none)
        self.textured = textured
        self.stamps = Self.normal(stamps, none: .none)
    }

    /// A plain card.
    public static let plain = CardLook()

    public func has(_ foil: FoilPattern) -> Bool { foils.contains(foil) }
    public func has(_ stamp: CardStamp) -> Bool { stamps.contains(stamp) }

    /// Adds the foil, or removes it when the look has it. `.none` removes every foil.
    public mutating func toggle(_ foil: FoilPattern) {
        if foil == .none { foils = []; return }
        foils = Self.normal(has(foil) ? foils.filter { $0 != foil } : foils + [foil], none: .none)
    }

    /// Adds the stamp, or removes it when the look has it. `.none` removes every stamp.
    public mutating func toggle(_ stamp: CardStamp) {
        if stamp == .none { stamps = []; return }
        stamps = Self.normal(has(stamp) ? stamps.filter { $0 != stamp } : stamps + [stamp], none: .none)
    }

    /// No duplicates, no `.none`, and the order of `allCases`.
    private static func normal<T: CaseIterable & Equatable>(_ list: [T], none: T) -> [T] {
        T.allCases.filter { $0 != none && list.contains($0) }
    }

    private enum CodingKeys: String, CodingKey {
        case layout, foils, textured, stamps
        /// Saves from before stacked foils and stamps.
        case foil, stamp
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let foils = try c.decodeIfPresent([FoilPattern].self, forKey: .foils)
            ?? [try c.decodeIfPresent(FoilPattern.self, forKey: .foil) ?? .none]
        let stamps = try c.decodeIfPresent([CardStamp].self, forKey: .stamps)
            ?? [try c.decodeIfPresent(CardStamp.self, forKey: .stamp) ?? .none]
        self.init(
            layout: try c.decode(CardLayout.self, forKey: .layout),
            foils: foils,
            textured: try c.decode(Bool.self, forKey: .textured),
            stamps: stamps
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(layout, forKey: .layout)
        try c.encode(foils, forKey: .foils)
        try c.encode(textured, forKey: .textured)
        try c.encode(stamps, forKey: .stamps)
    }
}

// MARK: - Print cost

/// The extra print cost of each part of a look, in dollars for each copy (C17).
/// The game sets these prices. The player cannot change them. A plain card costs
/// about $0.02 to $0.03 to print (research.md, section 5). The extra prices are
/// [inferred]: the research found no measured price for foil or texture.
public enum PrintCost {
    public static func layout(_ layout: CardLayout) -> Double {
        switch layout {
        case .standard: 0
        case .extendedArt, .showcase: 0.005
        case .fullArt, .borderless: 0.01
        case .frameBreak: 0.015
        }
    }

    public static func foil(_ foil: FoilPattern) -> Double {
        switch foil {
        case .none: 0
        case .reverseHolo: 0.015
        case .holo: 0.02
        case .patternReverse, .cosmos: 0.025
        case .crackedIce: 0.03
        case .galaxy, .etched: 0.035
        case .rainbow: 0.04
        case .gold: 0.05
        }
    }

    public static let textured = 0.03

    public static func stamp(_ stamp: CardStamp) -> Double {
        switch stamp {
        case .none: 0
        case .eventStamp: 0.005
        case .signature: 0.03
        /// Each copy gets its own number.
        case .serialized: 0.2
        }
    }

    public static func frame(_ frame: FrameStyle) -> Double {
        switch frame {
        case .solid, .black: 0
        case .silver: 0.01
        case .gold, .rainbow: 0.015
        }
    }

    /// The sum of the parts. Each stacked foil and each stamp adds its own price.
    public static func extra(for look: CardLook, frame: FrameStyle) -> Double {
        layout(look.layout) + look.foils.reduce(0) { $0 + foil($1) } + (look.textured ? textured : 0)
            + look.stamps.reduce(0) { $0 + stamp($1) } + self.frame(frame)
    }
}

// MARK: - Versions

/// One printed version of a card (C16): for example the base print, a reverse
/// holo, or an alt art. A tier gives versions to all of its cards, and a card can
/// add its own. Each version is a separate collectible. Readers: pull rates (C9)
/// and the market (not built yet).
public struct CardVersion: Codable, Sendable, Equatable, Hashable, Identifiable {
    /// Unique in its tier, or in its card. 0 is the base version.
    public let id: VersionID
    /// FLAVOR.
    public var name: String
    /// FLAVOR.
    public var frameStyle: FrameStyle
    /// FLAVOR.
    public var look: CardLook
    public init(id: VersionID, name: String, frameStyle: FrameStyle = .solid, look: CardLook) {
        self.id = id
        self.name = name
        self.frameStyle = frameStyle
        self.look = look
    }

    /// Extra dollars for each printed copy of this version. The game sets it
    /// from the look and the frame (C17). Reader: the print system (not built yet).
    public var costPerCopy: Double {
        PrintCost.extra(for: look, frame: frameStyle)
    }

    public static let baseID: VersionID = 0
    public static let nameLimit = 30
    /// The most versions that one card can add for itself.
    public static let ownLimit = 6

    /// A reverse holo: the shine on the frame, not on the art.
    public static let reverseHolo = CardVersion(id: 1, name: "Reverse holo", look: CardLook(foil: .reverseHolo))
    /// A starting point for a card's own alt art: no frame, a holo shine.
    public static func altArt(id: VersionID) -> CardVersion {
        CardVersion(id: id, name: "Alt art", look: CardLook(layout: .borderless, foil: .holo, textured: true))
    }
}

/// Where a card's version comes from.
public enum VersionKey: Hashable, Sendable {
    case base
    /// An extra version of the card's tier.
    case tier(VersionID)
    /// A version that only this card has.
    case own(VersionID)
}

/// One version of one card, with the place it comes from.
public struct VersionEntry: Hashable, Sendable, Identifiable {
    public let key: VersionKey
    public let version: CardVersion
    public var id: VersionKey { key }
}

extension RarityTier {
    /// The versions of a card at this tier: the base version, the tier's extra
    /// versions that the card did not turn off, and the card's own versions.
    public func versions(excluding excluded: [VersionID], own: [CardVersion]) -> [VersionEntry] {
        [VersionEntry(key: .base, version: baseVersion)]
            + versions.filter { !excluded.contains($0.id) }.map { VersionEntry(key: .tier($0.id), version: $0) }
            + own.map { VersionEntry(key: .own($0.id), version: $0) }
    }
}

// MARK: - Sets and cards

/// A named group of cards that release together (C6).
public struct CardSet: Codable, Sendable, Equatable, Identifiable {
    /// Draft, then scheduled when the release is planned and paid, then released (B2).
    public enum Status: String, Codable, Sendable { case draft, scheduled, released }

    public let id: SetID
    /// FLAVOR.
    public internal(set) var name: String
    /// Main, mini, or parallel (sets.md, section 3.2). Reader: the generator count
    /// (not built yet), the products (print system, not built yet).
    public internal(set) var type: SetType
    /// FLAVOR. 2 to 4 capital letters, unique in the world.
    public internal(set) var code: String
    /// FLAVOR.
    public internal(set) var symbol: SetSymbol
    /// The shape of the set (C13). Reader: set theme fit (market, not built yet).
    public internal(set) var theme: ThemeID?
    /// The total card count: designed cards plus filler cards (S3, S8).
    /// Reader: the filler count (not built yet), set acceptance (market, not built yet).
    public internal(set) var size: Int
    /// The other set of a parallel pair (D2, S9). Reader: the release (not built yet).
    public internal(set) var pairID: SetID?
    /// Optional while the set is a draft (R7, R18). Reader: set demand (market, not built yet).
    public internal(set) var headliner: Headliner?
    /// The set's own copy of a ladder preset (C10).
    public internal(set) var ladder: RarityLadder
    /// The set's own copy of a pack preset (S6, C10). Reader: the pull rates (sets.md, section 5).
    public internal(set) var pack: PackLayout
    /// The era that ran when the player created the set (S7, S13). The set uses its gimmick.
    public internal(set) var eraID: EraID
    /// Sub-collections with their own numbers, 0 to 3 (S11, S14).
    public internal(set) var subsets: [Subset]
    /// Groups of designed cards whose art connects (D3, S10).
    public internal(set) var artSets: [ArtSet]
    /// The new generated characters on this set's filler cards (R6, R13). They
    /// join the roster when the set is printed (print system, not built yet).
    public internal(set) var generated: [Character]
    /// Only a draft set can change. The print system adds more states.
    public internal(set) var status: Status
    public let createdWeek: Int
    /// The release plan and its stock (sales.md, section 2). Nil while the set is a draft.
    public internal(set) var release: SetRelease? = nil
    /// The set's chapter of the story (L3). Nil for no beat.
    public internal(set) var story: SetStory? = nil
    /// The lead artist (K7). The set cannot print without one. Nil in a save from before lead artists.
    public internal(set) var leadArt: LeadArt? = nil

    /// The count of filler cards that the game will make (sets.md, section 4).
    public func fillerCount(designed: Int) -> Int { max(0, size - designed) }

    public static let nameLimit = 40
    /// D1: each set has 10 to 20 featured cards. The set screen shows the count against it.
    public static let featuredRange = 10...20
}

/// One card design in a set (cards.md, section 3).
public struct Card: Codable, Sendable, Equatable, Identifiable {
    public let id: CardID
    /// Optional, so that a standalone card is possible later (C6).
    public let setID: SetID?
    /// True for a filler card that the game made (sets.md, section 4). The player
    /// does not design or edit a filler card.
    public let filler: Bool
    /// FLAVOR. "Character, Title" (R25).
    public internal(set) var name: String
    /// Reader: card appeal. The character's popularity is the base (R24).
    public internal(set) var characterID: CharacterID
    /// Nil means the base form. Reader: card appeal (R23).
    public internal(set) var formID: FormID?
    /// A tier of the set's ladder. Reader: natural value (market, not built yet).
    public internal(set) var rarity: TierID
    /// Other characters in the art, up to 2 (R22). Reader: card appeal.
    public internal(set) var featured: [CharacterID]
    /// The tier's extra versions that this card does not have (C16).
    public internal(set) var excludedVersions: [VersionID]
    /// Versions that only this card has, for example an alt art (C16).
    public internal(set) var ownVersions: [CardVersion]
    /// Hidden. The card's own appeal shift for each audience (R24).
    public internal(set) var cardShift: AudienceValues
    public let createdWeek: Int
    /// The card carries its era's gimmick, for example "Aryla ex" (S7). FLAVOR until the
    /// market reads the gimmick's trend (M1).
    public internal(set) var gimmick: Bool = false
    /// The subset that the card belongs to, if any (S11). A designed card only.
    /// Reader: card numbers, the subset's pack outcome (S14).
    public internal(set) var subsetID: SubsetID? = nil
    /// The card's own artist (K1). Nil means the set's lead artist draws the card (K7).
    public internal(set) var artistID: ArtistID? = nil
    /// The week when the card's own art is done (K2). Nil when the lead draws the card.
    public internal(set) var artReadyWeek: Int? = nil
    /// The own artist's heat while the art was made (K12). Reader: the "Hot artist" factor.
    public internal(set) var heatAtCommission: Double? = nil

    public static let nameLimit = 40
    public static let featuredLimit = 2
}

/// The fields that the player edits in the card designer.
public struct CardDraft: Sendable, Equatable {
    public var name: String
    public var characterID: CharacterID?
    public var formID: FormID?
    public var rarity: TierID?
    public var featured: [CharacterID]
    public var excludedVersions: [VersionID]
    public var ownVersions: [CardVersion]
    public var gimmick: Bool
    /// Nil means founder art (K1).
    public var artistID: ArtistID?

    public init(
        name: String = "",
        characterID: CharacterID? = nil,
        formID: FormID? = nil,
        rarity: TierID? = nil,
        featured: [CharacterID] = [],
        excludedVersions: [VersionID] = [],
        ownVersions: [CardVersion] = [],
        gimmick: Bool = false,
        artistID: ArtistID? = nil
    ) {
        self.gimmick = gimmick
        self.artistID = artistID
        self.name = name
        self.characterID = characterID
        self.formID = formID
        self.rarity = rarity
        self.featured = featured
        self.excludedVersions = excludedVersions
        self.ownVersions = ownVersions
    }

    public init(from card: Card) {
        self.init(
            name: card.name, characterID: card.characterID, formID: card.formID,
            rarity: card.rarity, featured: card.featured,
            excludedVersions: card.excludedVersions, ownVersions: card.ownVersions,
            gimmick: card.gimmick, artistID: card.artistID
        )
    }

    /// An ID for a new version that only this card has.
    public var nextOwnVersionID: VersionID {
        (ownVersions.map(\.id).max() ?? CardVersion.baseID) + 1
    }

    public var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - The catalog

/// All cards, sets, and ladder presets in one save.
public struct Catalog: Codable, Sendable, Equatable {
    public internal(set) var sets: [CardSet]
    public internal(set) var cards: [Card]
    public internal(set) var ladderPresets: [RarityLadder]
    /// The pack presets (S6).
    public internal(set) var packPresets: [PackLayout]
    /// Every era, oldest first. The last era with no end is the current era (S7).
    public internal(set) var eras: [Era]
    /// The theme library (C13).
    public internal(set) var themes: [SetTheme]
    var nextID: Int
    /// Stream: the hidden shift of each new card.
    var rng: Xoshiro256

    /// The ID of the default ladder preset. The player cannot change or delete it.
    public static let defaultLadderID: LadderID = 1
    /// The ID of the default pack preset. The player cannot change or delete it.
    /// It shares the number 1 with the default ladder, because IDs are unique only in their own list.
    public static let defaultPackID: PackID = 1

    /// - Parameters:
    ///   - seed: the card stream.
    ///   - themeSeed: the hidden fits of the theme library.
    public init(seed: UInt64, themeSeed: UInt64) {
        themes = SetTheme.library(seed: themeSeed)
        sets = []
        cards = []
        ladderPresets = [RarityLadder.defaultLadder(id: Self.defaultLadderID)]
        packPresets = [PackLayout.defaultPack(id: Self.defaultPackID)]
        eras = [Era.first]
        nextID = Self.defaultLadderID + 1
        rng = Xoshiro256(seed: seed)
    }

    public func set(_ id: SetID) -> CardSet? { sets.first { $0.id == id } }
    public func card(_ id: CardID) -> Card? { cards.first { $0.id == id } }
    public func preset(_ id: LadderID) -> RarityLadder? { ladderPresets.first { $0.id == id } }
    public func theme(_ id: ThemeID) -> SetTheme? { themes.first { $0.id == id } }
    public func packPreset(_ id: PackID) -> PackLayout? { packPresets.first { $0.id == id } }

    /// All cards of a set: designed and filler.
    public func allCards(in setID: SetID) -> [Card] { cards.filter { $0.setID == setID } }

    /// The designed cards of a set, in the order the player made them.
    public func cards(in setID: SetID) -> [Card] { cards.filter { $0.setID == setID && !$0.filler } }

    /// The filler cards of a set (sets.md, section 4).
    public func fillerCards(in setID: SetID) -> [Card] { cards.filter { $0.setID == setID && $0.filler } }

    mutating func takeID() -> Int {
        defer { nextID += 1 }
        return nextID
    }
}

public enum CardError: Error, Equatable, Sendable {
    case emptyName
    case nameTooLong(Int)
    case duplicateSetName(String)
    case duplicatePresetName(String)
    case unknownSet(SetID)
    case unknownCard(CardID)
    case unknownPreset(LadderID)
    case unknownTheme(ThemeID)
    case noSubject
    case unknownCharacter(CharacterID)
    case unknownForm(FormID)
    case noRarity
    case unknownTier(TierID)
    case tooManyFeatured
    case featuredSubject
    case duplicateFeatured
    case ladderSize
    case emptyTierName
    case duplicateTierName(String)
    case badTierCode(String)
    case duplicateTierID
    case tierInUse(String)
    case defaultPresetLocked
    case emptyVersionName
    case duplicateVersionName(String)
    case tooManyVersions
    case badSetCode
    case duplicateSetCode(String)
    case badSetSize
    case sizeBelowCards(Int)
    case setFull(Int)
    case parallelNeedsPair
    case parallelTypeFixed
    case fillerShares(Int)
    case fillerLocked
    case emptyEraName
    case badGimmickName
    case unknownEra(EraID)
    case badEraCode
    case duplicateEraCode(String)
    case badHomeTier
    case setLocked
    case unknownArtist
    case badLore(String)
    case badRelease(String)
    case unknownSubset(SubsetID)
    case badSubsetPrefix
    case duplicateSubset(String)
    case tooManySubsets
    case subsetCard
    case artSetSize
    case artSetCard
    case cardInTwoArtSets(String)
    case unknownPack(PackID)
    case duplicatePackName(String)
    case defaultPackLocked
    case packCardCount
    case badBoxSize
    case emptySlot(Int)
    case badOdds(Int)
    case slotOddsSum(slot: Int, sum: Double)
    case duplicateOutcome(Int)
    case badFillerShare(String)

    public var message: String {
        switch self {
        case .emptyName: "Give it a name."
        case .nameTooLong(let limit): "Use \(limit) characters or fewer for the name."
        case .duplicateSetName(let name): "A set named \(name) already exists."
        case .duplicatePresetName(let name): "A ladder named \(name) already exists."
        case .unknownSet: "That set does not exist."
        case .unknownCard: "That card does not exist."
        case .unknownPreset: "That ladder does not exist."
        case .unknownTheme: "That theme does not exist."
        case .noSubject: "Pick a character for the card."
        case .unknownCharacter: "That character does not exist."
        case .unknownForm: "That form does not belong to the character."
        case .noRarity: "Pick a rarity for the card."
        case .unknownTier: "That rarity is not in the set's ladder."
        case .tooManyFeatured: "The art can show \(Card.featuredLimit) other characters at most."
        case .featuredSubject: "The card's own character cannot also be featured IP."
        case .duplicateFeatured: "Each featured character can appear once."
        case .ladderSize: "A ladder needs \(RarityLadder.tierRange.lowerBound) to \(RarityLadder.tierRange.upperBound) tiers."
        case .emptyTierName: "Give every tier a name."
        case .duplicateTierName(let name): "Two tiers are named \(name). Use different names."
        case .badTierCode(let name): "Give \(name) a code of 1 to \(RarityLadder.codeLimit) characters."
        case .duplicateTierID: "Two tiers have the same ID."
        case .tierInUse(let name): "A card in this set uses \(name). Change that card first."
        case .defaultPresetLocked: "The default ladder cannot change. Make a copy, then change the copy."
        case .emptyVersionName: "Give every version a name."
        case .duplicateVersionName(let name): "Two versions are named \(name). Use different names."
        case .tooManyVersions: "A card can add \(CardVersion.ownLimit) versions of its own at most."
        case .badSetCode: "Use \(CardSet.codeRange.lowerBound) to \(CardSet.codeRange.upperBound) letters for the set code."
        case .duplicateSetCode(let code): "A set with the code \(code) already exists."
        case .badSetSize: "A set has \(CardSet.sizeRange.lowerBound) to \(CardSet.sizeRange.upperBound) cards."
        case .sizeBelowCards(let count): "The set already has \(count) designed cards. Make the size \(count) or more."
        case .setFull(let size): "The set is full at \(size) cards. Make the set larger first."
        case .parallelNeedsPair: "A parallel set is created as a pair."
        case .parallelTypeFixed: "A parallel set stays parallel, and a set cannot become parallel later."
        case .fillerShares(let sum): "The filler shares add up to \(sum)%. Make them add up to 100%."
        case .unknownPack: "That pack does not exist."
        case .duplicatePackName(let name): "A pack named \(name) already exists."
        case .defaultPackLocked: "The default pack cannot change. Make a copy, then change the copy."
        case .packCardCount: "A pack has \(PackLayout.cardRange.lowerBound) to \(PackLayout.cardRange.upperBound) cards."
        case .badBoxSize: "A box has \(PackLayout.boxRange.lowerBound) to \(PackLayout.boxRange.upperBound) packs."
        case .emptySlot(let slot): "Slot \(slot) has no outcome. Add one."
        case .badOdds(let slot): "Slot \(slot) has odds below 0% or above 100%."
        case .slotOddsSum(let slot, let sum): "The odds in slot \(slot) add up to \(sum.formatted(.number.precision(.fractionLength(0...2))))%. Make them add up to 100%."
        case .duplicateOutcome(let slot): "Slot \(slot) has the same outcome twice. Merge them."
        case .emptyEraName: "Give the era a name."
        case .badGimmickName: "Use 1 to \(Gimmick.nameLimit) characters for the gimmick."
        case .unknownEra: "That era does not exist."
        case .badEraCode: "Use 2 or 3 letters for the era code."
        case .duplicateEraCode(let code): "Another era already uses the code \(code)."
        case .badHomeTier: "The home tier must be a tier of the era's ladder. Pick the home tier again."
        case .setLocked: "This set is scheduled or released. It cannot change."
        case .unknownArtist: "That artist is not on the talent board or in your alumni."
        case .badLore(let reason): reason
        case .badRelease(let reason): reason
        case .unknownSubset: "That subset does not exist."
        case .badSubsetPrefix: "Use 1 to \(Subset.prefixLimit) letters for the subset prefix."
        case .duplicateSubset(let name): "A subset named or prefixed \(name) already exists in this set."
        case .tooManySubsets: "A set can have \(Subset.limit) subsets at most."
        case .subsetCard: "Only a designed card of this set can go into a subset."
        case .artSetSize: "An art set has \(ArtSet.cardRange.lowerBound) to \(ArtSet.cardRange.upperBound) cards."
        case .artSetCard: "Only designed cards of this set can form an art set."
        case .cardInTwoArtSets(let name): "\(name) is already in another art set."
        case .fillerLocked: "The game makes the filler cards. Reroll them on the set screen."
        case .badFillerShare(let name): "Give \(name) a filler share from 0% to 100%."
        }
    }
}
