import SwiftUI
import SimCore

enum Theme {
    static let accent = Color(red: 0.93, green: 0.42, blue: 0.16)

    /// The color for an appeal value from -50 to 100.
    static func appealColor(_ value: Double) -> Color {
        switch value {
        case ..<0: Color(red: 0.85, green: 0.25, blue: 0.25)
        case ..<35: Color(red: 0.95, green: 0.60, blue: 0.20)
        case ..<65: Color(red: 0.75, green: 0.75, blue: 0.20)
        default: Color(red: 0.25, green: 0.70, blue: 0.35)
        }
    }
}

extension PaletteColor {
    var color: Color {
        switch self {
        case .crimson: Color(red: 0.78, green: 0.13, blue: 0.20)
        case .ember: Color(red: 0.95, green: 0.45, blue: 0.13)
        case .gold: Color(red: 0.85, green: 0.65, blue: 0.13)
        case .sunflower: Color(red: 1.00, green: 0.84, blue: 0.20)
        case .lime: Color(red: 0.55, green: 0.80, blue: 0.25)
        case .forest: Color(red: 0.13, green: 0.48, blue: 0.27)
        case .teal: Color(red: 0.10, green: 0.60, blue: 0.60)
        case .sky: Color(red: 0.45, green: 0.75, blue: 0.95)
        case .ocean: Color(red: 0.15, green: 0.40, blue: 0.80)
        case .indigo: Color(red: 0.27, green: 0.25, blue: 0.62)
        case .violet: Color(red: 0.58, green: 0.33, blue: 0.78)
        case .rose: Color(red: 0.95, green: 0.55, blue: 0.68)
        case .cream: Color(red: 0.98, green: 0.93, blue: 0.80)
        case .slate: Color(red: 0.50, green: 0.55, blue: 0.60)
        case .charcoal: Color(red: 0.20, green: 0.20, blue: 0.24)
        case .snow: Color(red: 0.97, green: 0.97, blue: 0.99)
        }
    }
}

extension ElementType {
    var symbol: String {
        switch self {
        case .fire: "flame.fill"
        case .water: "drop.fill"
        case .nature: "leaf.fill"
        case .storm: "bolt.fill"
        case .ice: "snowflake"
        case .stone: "mountain.2.fill"
        case .sky: "wind"
        case .shadow: "moon.fill"
        case .light: "sun.max.fill"
        case .mystic: "sparkles"
        case .metal: "gearshape.fill"
        case .dragon: "lizard.fill"
        }
    }

    var tint: Color {
        switch self {
        case .fire: PaletteColor.ember.color
        case .water: PaletteColor.ocean.color
        case .nature: PaletteColor.forest.color
        case .storm: Color(red: 0.90, green: 0.70, blue: 0.05)
        case .ice: Color(red: 0.35, green: 0.70, blue: 0.90)
        case .stone: Color(red: 0.55, green: 0.45, blue: 0.35)
        case .sky: PaletteColor.teal.color
        case .shadow: PaletteColor.indigo.color
        case .light: PaletteColor.gold.color
        case .mystic: PaletteColor.violet.color
        case .metal: PaletteColor.slate.color
        case .dragon: PaletteColor.crimson.color
        }
    }

    /// A sensible default palette for a new character of this type.
    var defaultPalette: [PaletteColor] {
        switch self {
        case .fire: [.ember, .sunflower]
        case .water: [.ocean, .snow]
        case .nature: [.lime, .forest]
        case .storm: [.sunflower, .charcoal]
        case .ice: [.sky, .snow]
        case .stone: [.slate, .cream]
        case .sky: [.teal, .snow]
        case .shadow: [.charcoal, .violet]
        case .light: [.snow, .gold]
        case .mystic: [.violet, .rose]
        case .metal: [.slate, .ocean]
        case .dragon: [.crimson, .gold]
        }
    }
}

extension Role {
    var hint: String {
        switch self {
        case .starter: "A first partner for new fans"
        case .companion: "A common character"
        case .mascot: "The face of your brand"
        case .legendary: "Rare and powerful"
        case .mythical: "A secret or event character"
        case .villain: "The threat in your world"
        case .rival: "Competes with the heroes"
        case .trainer: "A human character"
        }
    }
}
