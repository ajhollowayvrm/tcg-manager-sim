// Cards, sets, and rarity ladders (docs/design/cards.md).
//
// The catalog has its own ID counter and its own random stream. Character IDs
// and form IDs come from the world. Card, set, and ladder IDs come
// from the catalog.

public typealias SetID = Int
public typealias CardID = Int
public typealias LadderID = Int
public typealias TierID = Int
public typealias VersionID = Int

// MARK: - Rarity

/// The shape in a card's rarity corner. FLAVOR.
public enum RaritySymbol: String, CaseIterable, Codable, Sendable, Identifiable {
    case circle, diamond, star, doubleStar, tripleStar, sparkle, crown, heart, hexagon, flame

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
    /// FLAVOR. The tier's color: the frame color of a solid frame, and the color of the tier's chip.
    public var color: PaletteColor
    /// FLAVOR. The frame of every card at this tier (C14).
    public var frameStyle: FrameStyle
    /// FLAVOR. The layout, foil, texture, and stamp of every card at this tier (C15).
    public var look: CardLook

    /// Extra printed versions of every card at this tier, for example a reverse holo (C16).
    /// A card can turn one off. The tier's own look is the base version.
    public var versions: [CardVersion]

    public init(
        id: TierID,
        name: String,
        code: String,
        symbol: RaritySymbol,
        color: PaletteColor,
        frameStyle: FrameStyle = .solid,
        look: CardLook = .plain,
        versions: [CardVersion] = []
    ) {
        self.id = id
        self.name = name
        self.code = code
        self.symbol = symbol
        self.color = color
        self.frameStyle = frameStyle
        self.look = look
        self.versions = versions
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
            RarityTier(id: 1, name: "Common", code: "C", symbol: .circle, color: .slate, versions: [.reverseHolo]),
            RarityTier(id: 2, name: "Uncommon", code: "U", symbol: .diamond, color: .forest, versions: [.reverseHolo]),
            RarityTier(id: 3, name: "Rare", code: "R", symbol: .star, color: .ocean, versions: [.reverseHolo]),
            RarityTier(id: 4, name: "Holo Rare", code: "HR", symbol: .star, color: .indigo,
                       look: CardLook(foil: .holo), versions: [.reverseHolo]),
            RarityTier(id: 5, name: "Double Rare", code: "RR", symbol: .doubleStar, color: .crimson,
                       look: CardLook(foil: .cosmos)),
            RarityTier(id: 6, name: "Ultra Rare", code: "UR", symbol: .doubleStar, color: .violet, frameStyle: .silver,
                       look: CardLook(layout: .fullArt, foil: .holo, textured: true)),
            RarityTier(id: 7, name: "Illustration Rare", code: "IR", symbol: .sparkle, color: .teal,
                       look: CardLook(layout: .borderless, foil: .holo)),
            RarityTier(id: 8, name: "Special Illustration Rare", code: "SIR", symbol: .crown, color: .rose, frameStyle: .rainbow,
                       look: CardLook(layout: .frameBreak, foil: .holo, textured: true)),
            RarityTier(id: 9, name: "Gold", code: "G", symbol: .crown, color: .gold, frameStyle: .gold,
                       look: CardLook(layout: .fullArt, foil: .gold, textured: true)),
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
public struct CardLook: Codable, Sendable, Equatable, Hashable {
    public var layout: CardLayout
    public var foil: FoilPattern
    /// A raised surface that you can feel.
    public var textured: Bool
    public var stamp: CardStamp

    public init(layout: CardLayout = .standard, foil: FoilPattern = .none, textured: Bool = false, stamp: CardStamp = .none) {
        self.layout = layout
        self.foil = foil
        self.textured = textured
        self.stamp = stamp
    }

    /// A plain card.
    public static let plain = CardLook()
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

    /// The sum of the parts.
    public static func extra(for look: CardLook, frame: FrameStyle) -> Double {
        layout(look.layout) + foil(look.foil) + (look.textured ? textured : 0) + stamp(look.stamp) + self.frame(frame)
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
    public enum Status: String, Codable, Sendable { case draft }

    public let id: SetID
    /// FLAVOR.
    public internal(set) var name: String
    /// The shape of the set (C13). Reader: set theme fit (market, not built yet).
    public internal(set) var theme: ThemeID?
    /// The set's own copy of a ladder preset (C10).
    public internal(set) var ladder: RarityLadder
    /// Only a draft set can change. The print system adds more states.
    public internal(set) var status: Status
    public let createdWeek: Int

    public static let nameLimit = 40
    /// D1: each set has 10 to 20 featured cards. The set screen shows the count against it.
    public static let featuredRange = 10...20
}

/// One card design in a set (cards.md, section 3).
public struct Card: Codable, Sendable, Equatable, Identifiable {
    public let id: CardID
    /// Optional, so that a standalone card is possible later (C6).
    public let setID: SetID?
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

    public init(
        name: String = "",
        characterID: CharacterID? = nil,
        formID: FormID? = nil,
        rarity: TierID? = nil,
        featured: [CharacterID] = [],
        excludedVersions: [VersionID] = [],
        ownVersions: [CardVersion] = []
    ) {
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
            excludedVersions: card.excludedVersions, ownVersions: card.ownVersions
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
    /// The theme library (C13).
    public internal(set) var themes: [SetTheme]
    var nextID: Int
    /// Stream: the hidden shift of each new card.
    var rng: Xoshiro256

    /// The ID of the default ladder preset. The player cannot change or delete it.
    public static let defaultLadderID: LadderID = 1

    /// - Parameters:
    ///   - seed: the card stream.
    ///   - themeSeed: the hidden fits of the theme library.
    public init(seed: UInt64, themeSeed: UInt64) {
        themes = SetTheme.library(seed: themeSeed)
        sets = []
        cards = []
        ladderPresets = [RarityLadder.defaultLadder(id: Self.defaultLadderID)]
        nextID = Self.defaultLadderID + 1
        rng = Xoshiro256(seed: seed)
    }

    public func set(_ id: SetID) -> CardSet? { sets.first { $0.id == id } }
    public func card(_ id: CardID) -> Card? { cards.first { $0.id == id } }
    public func preset(_ id: LadderID) -> RarityLadder? { ladderPresets.first { $0.id == id } }
    public func theme(_ id: ThemeID) -> SetTheme? { themes.first { $0.id == id } }

    /// The cards of a set, in the order the player made them.
    public func cards(in setID: SetID) -> [Card] { cards.filter { $0.setID == setID } }

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
        }
    }
}
