// Names for generated characters. The game names each generated character
// (decision R13). The creator also uses this for its "Suggest" button.

public enum NameGenerator {
    static let prefixes: [ElementType: [String]] = [
        .fire: ["Emb", "Cind", "Pyr", "Blaz", "Sear", "Char", "Flar"],
        .water: ["Aqu", "Rip", "Tid", "Mar", "Brin", "Spla", "Cor"],
        .nature: ["Moss", "Fern", "Bud", "Thorn", "Sprig", "Bram", "Clov"],
        .storm: ["Volt", "Zap", "Thund", "Stat", "Bolt", "Crak", "Fizz"],
        .ice: ["Fros", "Glac", "Riml", "Sleet", "Brr", "Crys", "Flur"],
        .stone: ["Peb", "Bould", "Grav", "Crag", "Slat", "Rubb", "Flin"],
        .sky: ["Gust", "Zeph", "Cirr", "Plum", "Aer", "Soar", "Wisp"],
        .shadow: ["Umb", "Nox", "Gloam", "Murk", "Shad", "Dusk", "Grim"],
        .light: ["Lum", "Glim", "Sol", "Halo", "Bri", "Dawn", "Shin"],
        .mystic: ["Myst", "Rune", "Arc", "Eni", "Hex", "Astr", "Ora"],
        .metal: ["Ferr", "Cog", "Riv", "Chrom", "Bolt", "Alloy", "Tin"],
        .dragon: ["Drak", "Wyr", "Scal", "Fang", "Rex", "Tal", "Ignar"],
    ]

    static let suffixes = [
        "bun", "lix", "ra", "on", "kit", "pup", "wing", "let", "ling", "ox",
        "ette", "isk", "ara", "ion", "y", "o", "ble", "mew", "ith", "or",
    ]

    /// First names for a person (R14). The creator's "Suggest a name" uses them.
    static let personNames = [
        "Ash", "Mara", "Theo", "June", "Kai", "Rosa", "Felix", "Iris", "Milo", "Nadia",
        "Rex", "Lena", "Otto", "Suki", "Dev", "Wren", "Hugo", "Pia", "Cass", "Remy",
        "Tova", "Jin", "Ada", "Leo", "Noor", "Ezra", "Mina", "Silas", "Yara", "Bram",
    ]

    public static func name<R: RandomNumberGenerator>(for kind: CharacterKind, type: ElementType, using rng: inout R) -> String {
        kind == .person ? rng.pick(personNames) : name(for: type, using: &rng)
    }

    public static func name<R: RandomNumberGenerator>(for type: ElementType, using rng: inout R) -> String {
        let prefix = rng.pick(prefixes[type] ?? ["Nov"])
        let suffix = rng.pick(suffixes)
        return prefix + suffix
    }

    /// A name that is not in `taken`. Adds a numeral if the pool runs out.
    public static func uniqueName<R: RandomNumberGenerator>(
        for type: ElementType,
        kind: CharacterKind = .creature,
        taken: Set<String>,
        using rng: inout R
    ) -> String {
        for _ in 0..<20 {
            let candidate = name(for: kind, type: type, using: &rng)
            if !taken.contains(candidate.lowercased()) { return candidate }
        }
        let base = name(for: kind, type: type, using: &rng)
        var index = 2
        while taken.contains("\(base) \(index)".lowercased()) { index += 1 }
        return "\(base) \(index)"
    }
}
