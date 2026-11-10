// Set themes (decision C13). A theme is the shape of a set, for example
// Feudalism or Castles. The element types are one group of themes.

/// A stable, readable ID, for example "feudalism" or "fire".
public typealias ThemeID = String

public struct SetTheme: Codable, Sendable, Equatable, Identifiable {
    public enum Group: String, CaseIterable, Codable, Sendable, Identifiable {
        case elements, history, places, stories, things

        public var id: String { rawValue }

        public var name: String {
            switch self {
            case .elements: "Elements"
            case .history: "History and cultures"
            case .places: "Places"
            case .stories: "Stories and moods"
            case .things: "Things and hobbies"
            }
        }
    }

    public let id: ThemeID
    /// FLAVOR.
    public let name: String
    /// FLAVOR. An SF Symbol name.
    public let symbol: String
    public let group: Group
    /// The element type, for a theme in the elements group.
    /// Reader: type fit between the set and its characters (market, not built yet).
    public let element: ElementType?
    /// Hidden. How much each audience likes the theme.
    /// Reader: set theme fit (market, not built yet).
    public internal(set) var fit: AudienceValues

    /// The spread of a theme's hidden fit.
    public static let fitSpread = 15.0

    /// The default library. Each world rolls its own hidden fits from its seed.
    public static func library(seed: UInt64) -> [SetTheme] {
        var rng = Xoshiro256(seed: seed)
        let elementSymbols: [ElementType: String] = [
            .fire: "flame.fill", .water: "drop.fill", .nature: "leaf.fill", .storm: "bolt.fill",
            .ice: "snowflake", .stone: "mountain.2.fill", .sky: "wind", .shadow: "moon.fill",
            .light: "sun.max.fill", .mystic: "sparkles", .metal: "gearshape.fill", .dragon: "lizard.fill",
        ]
        var entries: [(ThemeID, String, String, Group, ElementType?)] = ElementType.allCases.map {
            ($0.rawValue, $0.name, elementSymbols[$0] ?? "circle.fill", .elements, $0)
        }
        entries += [
            ("feudalism", "Feudalism", "shield.fill", .history, nil),
            ("castles", "Castles", "building.columns.fill", .history, nil),
            ("royalCourt", "Royal court", "crown.fill", .history, nil),
            ("samurai", "Samurai", "figure.fencing", .history, nil),
            ("pirates", "Pirates", "sailboat.fill", .history, nil),
            ("ancientEmpires", "Ancient empires", "scroll.fill", .history, nil),
            ("frontier", "Frontier", "flag.fill", .history, nil),
            ("deepSea", "Deep sea", "water.waves", .places, nil),
            ("skyIslands", "Sky islands", "cloud.fill", .places, nil),
            ("jungle", "Jungle", "tree.fill", .places, nil),
            ("desert", "Desert", "sun.dust.fill", .places, nil),
            ("frozenNorth", "Frozen north", "snowflake.circle.fill", .places, nil),
            ("volcano", "Volcano", "mountain.2.fill", .places, nil),
            ("bigCity", "Big city", "building.2.fill", .places, nil),
            ("outerSpace", "Outer space", "moon.stars.fill", .places, nil),
            ("underworld", "Underworld", "moon.haze.fill", .places, nil),
            ("festival", "Festival", "party.popper.fill", .stories, nil),
            ("haunted", "Haunted", "theatermasks.fill", .stories, nil),
            ("tournament", "Tournament", "trophy.fill", .stories, nil),
            ("heist", "Heist", "key.fill", .stories, nil),
            ("fairyTale", "Fairy tale", "book.fill", .stories, nil),
            ("dreams", "Dreams", "cloud.moon.fill", .stories, nil),
            ("endOfTheWorld", "End of the world", "exclamationmark.triangle.fill", .stories, nil),
            ("rebirth", "Rebirth", "leaf.arrow.triangle.circlepath", .stories, nil),
            ("mythsAndGods", "Myths and gods", "sun.max.circle.fill", .stories, nil),
            ("robots", "Robots", "gearshape.2.fill", .things, nil),
            ("toys", "Toys", "teddybear.fill", .things, nil),
            ("food", "Food", "fork.knife", .things, nil),
            ("music", "Music", "music.note", .things, nil),
            ("sports", "Sports", "sportscourt.fill", .things, nil),
        ]
        return entries.map { id, name, symbol, group, element in
            var fit = AudienceValues()
            for audience in Audience.allCases where !audience.isDerived {
                fit[audience] = rng.gauss() * fitSpread
            }
            return SetTheme(id: id, name: name, symbol: symbol, group: group, element: element, fit: fit)
        }
    }
}
