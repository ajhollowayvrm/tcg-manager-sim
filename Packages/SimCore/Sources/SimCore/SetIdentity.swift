// The type, code, symbol, size, and headliner of a set (docs/design/sets.md, section 3).

/// The type of a set (sets.md, section 3.2). Every type allows any size (S8).
public enum SetType: String, CaseIterable, Codable, Sendable, Identifiable {
    /// The raw value "mini" stays for the save. The player sees "Special set" (E9).
    case main, mini, parallel
    /// A small set outside the series numbers, like a McDonald's Collection (E9).
    /// It takes the look of the era that runs when the player creates it.
    case promo

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .main: "Main set"
        case .mini: "Special set"
        case .parallel: "Parallel set"
        case .promo: "Promo set"
        }
    }

    /// The count of new generated characters for the set's filler cards (R13).
    /// Reader: the filler generator (sets.md, section 4.3, not built yet).
    public var generatedRange: ClosedRange<Int> {
        switch self {
        case .main: 10...20
        case .mini: 3...8
        case .parallel: 5...10
        // A promo set reprints characters from the roster.
        case .promo: 0...0
        }
    }

    /// The size that the new set sheet suggests.
    public var suggestedSize: Int {
        switch self {
        case .main: 150
        case .mini: 60
        case .parallel: 100
        case .promo: 15
        }
    }
}

/// The shape of a set symbol. FLAVOR.
public enum SetSymbolShape: String, CaseIterable, Codable, Sendable, Identifiable {
    case star, bolt, flame, leaf, drop, moon, sun, crown, shield, gem, wave, mountain, key, swords, sparkle, eye

    public var id: String { rawValue }
}

/// The symbol of a set: one shape and one palette color. FLAVOR.
public struct SetSymbol: Codable, Sendable, Equatable, Hashable {
    public var shape: SetSymbolShape
    public var color: PaletteColor

    public init(shape: SetSymbolShape, color: PaletteColor) {
        self.shape = shape
        self.color = color
    }

    public static let standard = SetSymbol(shape: .star, color: .gold)
}

/// The IP item on the pack art and the box art (R7, R18). A character, or one
/// of its forms. Places and events come later.
/// Reader: set demand (market, not built yet).
public struct Headliner: Codable, Sendable, Equatable, Hashable {
    public var characterID: CharacterID
    /// Nil means the base form.
    public var formID: FormID?

    public init(characterID: CharacterID, formID: FormID? = nil) {
        self.characterID = characterID
        self.formID = formID
    }
}

/// The fields that the player edits in the new set sheet and the set details sheet.
public struct SetDetails: Sendable, Equatable {
    public var name: String
    public var code: String
    public var symbol: SetSymbol
    public var theme: ThemeID?
    public var size: Int
    public var headliner: Headliner?

    public init(
        name: String,
        code: String,
        symbol: SetSymbol = .standard,
        theme: ThemeID? = nil,
        size: Int = SetType.main.suggestedSize,
        headliner: Headliner? = nil
    ) {
        self.name = name
        self.code = code
        self.symbol = symbol
        self.theme = theme
        self.size = size
        self.headliner = headliner
    }

    public init(from set: CardSet) {
        self.init(name: set.name, code: set.code, symbol: set.symbol, theme: set.theme, size: set.size, headliner: set.headliner)
    }
}

extension CardSet {
    /// A set code has 2 to 4 capital letters (sets.md, section 3.1).
    public static let codeRange = 2...4
    /// The size of a set, from the count of its designed cards up to this limit (S8).
    public static let sizeRange = 10...400

    /// A code made from a name, for example "Storm Rising" gives "SRI". The code
    /// is not in `taken`. The function never draws a random number.
    public static func suggestCode(for name: String, taken: Set<String>) -> String {
        let words = name.uppercased()
            .split(whereSeparator: { !$0.isLetter })
            .map { String($0.filter { $0.isASCII && $0.isLetter }) }
            .filter { !$0.isEmpty }
        let letters = words.joined()
        var candidates: [String] = []
        if words.count >= 2 {
            // The first letter of the first word, then two letters of the second word.
            candidates.append(String(words[0].prefix(1)) + String(words[1].prefix(2)))
            candidates.append(String(words.prefix(3).compactMap(\.first)))
        }
        candidates.append(String(letters.prefix(3)))
        if let first = letters.first {
            for second in letters.dropFirst() {
                for third in letters.dropFirst() where third != second {
                    candidates.append(String([first, second, third]))
                }
            }
        }
        for candidate in candidates where codeRange.contains(candidate.count) && !taken.contains(candidate) {
            return candidate
        }
        let base = String((letters + "SET").prefix(3))
        for extra in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" where !taken.contains(base + String(extra)) {
            return base + String(extra)
        }
        for a in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
            for b in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" where !taken.contains("S" + String(a) + String(b)) {
                return "S" + String(a) + String(b)
            }
        }
        return "SET"
    }
}

extension Catalog {
    /// The codes of all sets, except one set that the player edits.
    func takenCodes(except id: SetID? = nil) -> Set<String> {
        Set(sets.filter { $0.id != id }.map(\.code))
    }

    /// A free code for a new set with this name.
    public func suggestedCode(for name: String) -> String {
        CardSet.suggestCode(for: name, taken: takenCodes())
    }

    /// True when the headliner has a designed card in the set. The set screen
    /// warns when it has none (sets.md, section 3.4).
    public func headlinerHasCard(_ id: SetID) -> Bool {
        guard let headliner = set(id)?.headliner else { return true }
        return cards(in: id).contains { $0.characterID == headliner.characterID }
    }

    /// The other set of a parallel pair.
    public func pair(of id: SetID) -> CardSet? {
        set(id)?.pairID.flatMap { self.set($0) }
    }
}
